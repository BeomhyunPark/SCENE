package app.scene.event.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.schedule.ScheduleFixture.Person;
import app.scene.event.schedule.ScheduleFixture.World;
import app.scene.support.PostgresTestcontainer;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
 * {@code GET /participant/schedule} reads a few statements whatever the number of items or
 * participants: the session check, the viewer (active and leader), and the event period with the
 * latest snapshot. It never reads the working copy. 200 participants then read it at once right
 * after a publication. Statements are counted at the JDBC connection.
 */
@SpringBootTest
@Import({PostgresTestcontainer.class, ParticipantScheduleCostIT.Counting.class})
class ParticipantScheduleCostIT {

  static final List<String> STATEMENTS = new CopyOnWriteArrayList<>();
  static volatile boolean recording;

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Test
  void scheduleReadIsAFewStatementsForTwoHundredParticipants() throws Exception {
    ScheduleFixture f = new ScheduleFixture(context, jdbc, json);
    World w = f.world();
    List<Person> people = new ArrayList<>();
    for (int i = 0; i < 200; i++) {
      people.add(w.participant("참가자" + i));
    }
    for (int i = 0; i < 60; i++) {
      w.create(1 + i % 3, String.format("%02d:%02d", 6 + i / 4, (i % 4) * 15), "항목" + i, "ALL");
    }
    long publishStart = System.nanoTime();
    w.publish();
    long publishMillis = (System.nanoTime() - publishStart) / 1_000_000;

    Person a = people.get(0);
    List<String> seen =
        record(
            () ->
                f.mvc
                    .perform(get("/api/v1/participant/schedule").cookie(a.session()))
                    .andExpect(status().isOk()));
    System.out.println("participant schedule statements: " + seen.size());
    seen.forEach(sql -> System.out.println("  " + sql.replaceAll("\\s+", " ")));
    assertThat(seen).anyMatch(sql -> sql.contains("participant_sessions"));
    assertThat(seen).anyMatch(sql -> sql.contains("schedule_publications"));
    assertThat(seen).hasSizeBetween(3, 5);
    for (String sql : seen) {
      assertThat(sql.toLowerCase(Locale.ROOT)).as(sql).doesNotContain("schedule_items");
    }

    ExecutorService pool = Executors.newFixedThreadPool(20);
    List<Callable<Integer>> reads = new ArrayList<>();
    for (Person person : people) {
      reads.add(
          () ->
              f.mvc
                  .perform(get("/api/v1/participant/schedule").cookie(person.session()))
                  .andReturn()
                  .getResponse()
                  .getStatus());
    }
    long start = System.nanoTime();
    List<Future<Integer>> results = pool.invokeAll(reads);
    long millis = (System.nanoTime() - start) / 1_000_000;
    pool.shutdown();
    for (Future<Integer> result : results) {
      assertThat(result.get()).isEqualTo(200);
    }
    System.out.println(
        "publish to 200 participants with 60 items: "
            + publishMillis
            + " ms; 200 schedule reads (20 threads): "
            + millis
            + " ms");
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
