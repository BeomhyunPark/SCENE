package app.scene.event.home;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.home.ParticipantFeedFixture.Person;
import app.scene.event.home.ParticipantFeedFixture.World;
import app.scene.support.PostgresTestcontainer;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
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
 * {@code GET /participant/updates} reads at most six SQL statements with the session check and
 * never touches publications, notices or schedule tables (participant-home-contract §4 "읽기 비용",
 * §10). Statements are counted at the JDBC connection, so every MyBatis call is seen.
 */
@SpringBootTest
@Import({PostgresTestcontainer.class, ParticipantUpdatesCostIT.Counting.class})
class ParticipantUpdatesCostIT {

  static final List<String> STATEMENTS = new CopyOnWriteArrayList<>();
  static volatile boolean recording;

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Test
  void updatesReadsAFewIndexedRows() throws Exception {
    ParticipantFeedFixture f = new ParticipantFeedFixture(context, jdbc, json);
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-4000-0001");
    w.assign(a.id(), null, w.createGroup("1조"));
    w.publish();

    List<String> seen =
        record(
            () ->
                f.mvc
                    .perform(get("/api/v1/participant/updates").cookie(a.session()))
                    .andExpect(status().isOk()));
    // Session check, feed versions, notification summary, own check-in and revision.
    assertThat(seen).anyMatch(sql -> sql.contains("participant_sessions"));
    assertThat(seen).anyMatch(sql -> sql.contains("participant_feed_versions"));
    assertThat(seen).hasSizeBetween(2, 6);
    System.out.println("updates statements: " + seen.size());
    for (String sql : seen) {
      String lower = sql.toLowerCase(Locale.ROOT);
      assertThat(lower)
          .as(sql)
          .doesNotContain("group_publications")
          .doesNotContain("notices ")
          .doesNotContain("schedule_")
          .doesNotContain("group_assignments");
    }
    // The home adds one statement for the event header.
    List<String> home =
        record(
            () ->
                f.mvc
                    .perform(get("/api/v1/participant/home").cookie(a.session()))
                    .andExpect(status().isOk()));
    assertThat(home).hasSizeLessThanOrEqualTo(seen.size() + 1);
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
