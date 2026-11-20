package app.scene.event.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.notice.NoticeFixture.Person;
import app.scene.event.notice.NoticeFixture.World;
import app.scene.support.PostgresTestcontainer;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code GET /participant/notices} cost (#434): 200 participants read the list right after a
 * publish. Each request is a fixed handful of SQL statements whatever the number of notices or
 * participants: session, viewer, notices (body head only), unread targets. Statements are counted
 * at the JDBC connection the same way as {@code ParticipantUpdatesCostIT}.
 */
@SpringBootTest
@Import({PostgresTestcontainer.class, NoticeCostIT.Counting.class})
class NoticeCostIT {

  static final List<String> STATEMENTS = new CopyOnWriteArrayList<>();
  static volatile boolean recording;

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Test
  void twoHundredParticipantsReadTheListAfterAPublish() throws Exception {
    NoticeFixture f = new NoticeFixture(context, jdbc, json);
    World w = f.world();
    List<Person> people = new ArrayList<>();
    for (int i = 0; i < 200; i++) {
      people.add(w.participant("참가자" + i, String.format("010-7%03d-%04d", i / 100, i)));
    }
    for (int i = 0; i < 20; i++) {
      w.create(w.owner, "공지 " + i, i % 3 == 0 ? "LEADERS" : "ALL", true, null);
    }
    var written = w.create(w.owner, "방금 발행", "ALL", true, "\"important\":true");
    assertThat(written.get("notifiedCount").asInt()).isEqualTo(200);

    int most = 0;
    int total = 0;
    long started = System.nanoTime();
    for (Person person : people) {
      List<String> seen =
          record(
              () ->
                  f.mvc
                      .perform(get(NoticeFixture.PARTICIPANT_NOTICES).cookie(person.session()))
                      .andExpect(status().isOk()));
      most = Math.max(most, seen.size());
      total += seen.size();
      for (String sql : seen) {
        String lower = sql.toLowerCase(Locale.ROOT);
        assertThat(lower).as(sql).doesNotContain("group_assignments");
      }
    }
    long millis = (System.nanoTime() - started) / 1_000_000;
    System.out.println(
        "participant notices statements: max "
            + most
            + ", total "
            + total
            + " for 200 requests, "
            + millis
            + " ms");
    assertThat(most).isLessThanOrEqualTo(5);

    List<String> detail =
        record(
            () ->
                f.mvc
                    .perform(
                        get(NoticeFixture.PARTICIPANT_NOTICES
                                + "/"
                                + written.get("notice").get("noticeId").asString())
                            .cookie(people.get(0).session()))
                    .andExpect(status().isOk()));
    System.out.println("participant notice detail statements: " + detail.size());
    assertThat(detail).hasSizeLessThanOrEqualTo(5);
  }

  interface Call {
    void run() throws Exception;
  }

  private static List<String> record(Call call) throws Exception {
    STATEMENTS.clear();
    recording = true;
    try {
      call.run();
    } finally {
      recording = false;
    }
    return List.copyOf(STATEMENTS);
  }

  /** Wraps the data source so each prepared or plain statement made while recording is listed. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Counting {

    @Bean
    static BeanPostProcessor countingDataSource() {
      return new BeanPostProcessor() {
        @Override
        public Object postProcessAfterInitialization(Object bean, String beanName) {
          if (bean instanceof DataSource source && !(Proxy.isProxyClass(bean.getClass()))) {
            return Proxy.newProxyInstance(
                DataSource.class.getClassLoader(),
                new Class<?>[] {DataSource.class},
                forward(
                    source,
                    (method, result, args) ->
                        "getConnection".equals(method.getName())
                            ? connection((Connection) result)
                            : result));
          }
          return bean;
        }
      };
    }

    private static Connection connection(Connection target) {
      return (Connection)
          Proxy.newProxyInstance(
              Connection.class.getClassLoader(),
              new Class<?>[] {Connection.class},
              forward(
                  target,
                  (method, result, args) -> {
                    String name = method.getName();
                    if (recording
                        && (name.equals("prepareStatement")
                            || name.equals("prepareCall")
                            || name.equals("createStatement"))) {
                      STATEMENTS.add(
                          args != null && args.length > 0 ? String.valueOf(args[0]) : name);
                    }
                    return result;
                  }));
    }

    interface After {
      Object apply(java.lang.reflect.Method method, Object result, Object[] args);
    }

    private static InvocationHandler forward(Object target, After after) {
      return (proxy, method, args) -> {
        if (method.getName().equals("unwrap")
            && args != null
            && args[0] instanceof Class<?> type
            && type.isInstance(target)) {
          return target;
        }
        if (method.getName().equals("isWrapperFor")
            && args != null
            && args[0] instanceof Class<?> type
            && type.isInstance(target)) {
          return true;
        }
        try {
          return after.apply(method, method.invoke(target, args), args);
        } catch (InvocationTargetException e) {
          throw e.getCause();
        }
      };
    }
  }
}
