package app.scene.event.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code GET /operator/events/{eventId}/updates} is called by every open operator screen about
 * every 15 seconds (DEC-080 §7.5). It reads a handful of indexed rows: the operator session, the
 * same access check as every operator path, one notification summary and one check-in value. No
 * list, publication or application table. Statements are counted at the JDBC connection.
 */
@SpringBootTest
@Import({PostgresTestcontainer.class, OperatorUpdatesCostIT.Counting.class})
class OperatorUpdatesCostIT {

  static final List<String> STATEMENTS = new CopyOnWriteArrayList<>();
  static volatile boolean recording;

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Test
  void updatesReadsAFewIndexedRows() throws Exception {
    MockMvc mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
    UUID spaceId = UUID.randomUUID();
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, ownerId);
    Cookie owner =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(new Cookie("XSRF-TOKEN", "t"))
                    .header("X-XSRF-TOKEN", "t")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + ownerId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie("SCENE_SESSION");
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, new Cookie("XSRF-TOKEN", "t"))
                    .header("X-XSRF-TOKEN", "t")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"수련회\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String eventId = json.readTree(created).get("eventId").asString();
    String path = "/api/v1/operator/events/" + eventId + "/updates";
    mvc.perform(get(path).cookie(owner)).andExpect(status().isOk());

    STATEMENTS.clear();
    recording = true;
    try {
      mvc.perform(get(path).cookie(owner)).andExpect(status().isOk());
    } finally {
      recording = false;
    }
    List<String> seen = List.copyOf(STATEMENTS);
    System.out.println("operator updates statements: " + seen.size());
    seen.forEach(sql -> System.out.println("  " + sql.replaceAll("\\s+", " ")));
    assertThat(seen).anyMatch(sql -> sql.contains("notifications"));
    assertThat(seen).anyMatch(sql -> sql.contains("checkin_logs"));
    // Measured on 2026-11-20: 12 statements. Spring Session's own load, touch and reload (3, the
    // same on every operator path), the access check of every operator path (5: event, event in
    // space, role, membership, ended handover) and three values (notification summary, notice
    // value,
    // check-in seq). Schedule (C2) adds one indexed statement, hence 9 below.
    List<String> product =
        seen.stream()
            .filter(sql -> !sql.toUpperCase(Locale.ROOT).contains("SPRING_SESSION"))
            .toList();
    assertThat(product).hasSizeLessThanOrEqualTo(9);
    assertThat(seen).hasSizeLessThanOrEqualTo(12);
    for (String sql : seen) {
      String lower = sql.toLowerCase(Locale.ROOT);
      assertThat(lower)
          .as(sql)
          .doesNotContain("applications")
          .doesNotContain("group_publications")
          .doesNotContain("participants ");
    }
  }

  /** Wraps the data source so each statement made while recording is listed. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Counting {

    @Bean
    static BeanPostProcessor countingOperatorDataSource() {
      return new BeanPostProcessor() {
        @Override
        public Object postProcessAfterInitialization(Object bean, String beanName) {
          if (bean instanceof DataSource source && !Proxy.isProxyClass(bean.getClass())) {
            return Proxy.newProxyInstance(
                DataSource.class.getClassLoader(),
                new Class<?>[] {DataSource.class},
                (proxy, method, args) -> {
                  Object result = invoke(method, source, args);
                  return "getConnection".equals(method.getName())
                      ? connection((Connection) result)
                      : result;
                });
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
              (proxy, method, args) -> {
                String name = method.getName();
                if (recording
                    && (name.equals("prepareStatement")
                        || name.equals("prepareCall")
                        || name.equals("createStatement"))) {
                  STATEMENTS.add(args != null && args.length > 0 ? String.valueOf(args[0]) : name);
                }
                return invoke(method, target, args);
              });
    }

    private static Object invoke(java.lang.reflect.Method method, Object target, Object[] args)
        throws Throwable {
      try {
        return method.invoke(target, args);
      } catch (InvocationTargetException exception) {
        throw exception.getCause();
      }
    }
  }
}
