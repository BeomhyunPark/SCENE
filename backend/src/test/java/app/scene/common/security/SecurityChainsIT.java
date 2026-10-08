package app.scene.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.SceneApplication;
import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
@Import({PostgresTestcontainer.class, SecurityChainsIT.Probe.class})
class SecurityChainsIT {

  private static final String PLACEHOLDER_ORIGIN = "http://scene-frontend.placeholder.invalid";
  private static final String CSRF = "csrf-token";

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc = mvc(context);
  }

  @Autowired
  @Qualifier("participantSessions")
  ChainSessionRegistry participantSessions;

  @Test
  void unauthenticatedOperatorAndParticipantAre401AndPublicIsOpen() throws Exception {
    mvc.perform(get("/api/v1/operator/probe").header("X-Request-Id", "req-operator"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.type").value("urn:scene:problem:authentication-required"))
        .andExpect(jsonPath("$.detail").value("로그인이 필요합니다."))
        .andExpect(jsonPath("$.traceId").value("req-operator"))
        .andExpect(header().string("X-Request-Id", "req-operator"))
        .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

    mvc.perform(get("/api/v1/participant/probe").header("X-Request-Id", "req-participant"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.traceId").value("req-participant"))
        .andExpect(header().string("X-Request-Id", "req-participant"));

    mvc.perform(get("/api/v1/public/probe"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("public"));
  }

  @Test
  void sessionsAreNotInterchangeable() throws Exception {
    Cookie operator = login(insertUser("Operator"));
    Cookie participant =
        participantSessions.establish(
            new ProbeAuthentication("participant"),
            new org.springframework.mock.web.MockHttpServletResponse());

    mvc.perform(get("/api/v1/operator/probe").cookie(operator))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("operator"));
    mvc.perform(get("/api/v1/participant/probe").cookie(participant))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    mvc.perform(get("/api/v1/participant/probe").cookie(operator))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get("/api/v1/operator/probe").cookie(participant))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    mvc.perform(
            get("/api/v1/operator/probe")
                .cookie(new Cookie(operator.getName(), participant.getValue())))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            get("/api/v1/participant/probe")
                .cookie(new Cookie(participant.getName(), operator.getValue())))
        .andExpect(status().isUnauthorized());

    mvc.perform(get("/api/v1/public/probe").cookie(operator))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("public"));
    mvc.perform(get("/api/v1/public/probe").cookie(participant))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("public"));
  }

  @Test
  void issuedSessionCookieCarriesThePlaceholderFlags() throws Exception {
    MvcResult result = loginResult(insertUser("Operator"));
    String header =
        result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
            .filter(value -> value.startsWith(OPERATOR_COOKIE + "="))
            .findFirst()
            .orElseThrow();
    assertThat(header).contains("HttpOnly", "Secure", "SameSite=Lax");
    assertThat(header).doesNotContain("Domain=");
    assertThat(header).doesNotContain("scene_operator_session", "scene_participant_session");
    assertThat(header).doesNotContain("JSESSIONID");
  }

  @Test
  void operatorLoginIsStoredInJdbcAndSurvivesAnotherApplicationInstance() throws Exception {
    UUID userId = insertUser("Stored operator");
    Cookie operator = login(userId);
    Integer rows =
        jdbc.queryForObject(
            "SELECT count(*) FROM spring_session WHERE session_id = ?",
            Integer.class,
            operator.getValue());
    assertThat(rows).isEqualTo(1);

    try (ConfigurableApplicationContext restarted = restart()) {
      mvc((WebApplicationContext) restarted)
          .perform(get("/api/v1/operator/me").cookie(operator))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.userId").value(userId.toString()))
          .andExpect(jsonPath("$.displayName").value("Stored operator"));
    }
  }

  @Test
  void expiredOperatorSessionIsAuthenticationRequired() throws Exception {
    Cookie operator = login(insertUser("Expiring operator"));
    expire(operator.getValue());

    mvc.perform(get("/api/v1/operator/me").cookie(operator).header("X-Request-Id", "req-expired"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.type").value("urn:scene:problem:authentication-required"))
        .andExpect(jsonPath("$.detail").value("로그인이 필요합니다."))
        .andExpect(jsonPath("$.traceId").value("req-expired"))
        .andExpect(header().string("X-Request-Id", "req-expired"));
  }

  @Test
  void unknownOperatorDoesNotCreateASession() throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(csrfHeader(), CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
            .andExpect(jsonPath("$.detail").value("로그인이 필요합니다."))
            .andReturn();
    assertThat(result.getResponse().getCookie(OPERATOR_COOKIE)).isNull();
  }

  @Test
  void logoutDropsTheJdbcSession() throws Exception {
    Cookie operator = login(insertUser("Leaving operator"));
    mvc.perform(
            post("/api/v1/operator/auth/logout")
                .cookie(operator, csrf())
                .header(csrfHeader(), CSRF))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/operator/me").cookie(operator))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    Integer rows =
        jdbc.queryForObject(
            "SELECT count(*) FROM spring_session WHERE session_id = ?",
            Integer.class,
            operator.getValue());
    assertThat(rows).isZero();
  }

  @Test
  void csrfRejectsAMismatchAndAcceptsAMatchingToken() throws Exception {
    mvc.perform(post("/api/v1/operator/probe"))
        .andExpect(status().isForbidden())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("FORBIDDEN"))
        .andExpect(header().exists("X-Request-Id"));

    mvc.perform(post("/api/v1/participant/probe").cookie(csrf()).header(csrfHeader(), "other"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));

    mvc.perform(post("/api/v1/operator/probe").cookie(csrf()).header(csrfHeader(), CSRF))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    mvc.perform(post("/api/v1/public/probe").cookie(csrf()).header(csrfHeader(), CSRF))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("public"));
  }

  @Test
  void corsAllowsOnlyTheConfiguredPlaceholder() throws Exception {
    mvc.perform(
            options("/api/v1/public/probe")
                .header(HttpHeaders.ORIGIN, PLACEHOLDER_ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "X-Request-Id,X-XSRF-TOKEN"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, PLACEHOLDER_ORIGIN))
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));

    mvc.perform(
            options("/api/v1/operator/probe")
                .header(HttpHeaders.ORIGIN, "https://not-scene.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));

    mvc.perform(get("/api/v1/participant/probe").header(HttpHeaders.ORIGIN, PLACEHOLDER_ORIGIN))
        .andExpect(status().isUnauthorized())
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, PLACEHOLDER_ORIGIN));
  }

  @Test
  void actuatorHealthAndRequestIdStayOutsideTheChains() throws Exception {
    mvc.perform(get("/actuator/health").header("X-Request-Id", "req-health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"))
        .andExpect(header().string("X-Request-Id", "req-health"));
    assertThat(context.getBeanNamesForType(UserDetailsService.class)).isEmpty();
  }

  private MockMvc mvc(WebApplicationContext web) {
    return MockMvcBuilders.webAppContextSetup(web)
        .addFilters(web.getBean(RequestIdFilter.class), web.getBean(SessionRepositoryFilter.class))
        .apply(SecurityMockMvcConfigurers.springSecurity())
        .build();
  }

  private UUID insertUser(String displayName) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, displayName);
    return id;
  }

  private Cookie login(UUID userId) throws Exception {
    MvcResult result = loginResult(userId);
    Cookie cookie = result.getResponse().getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    assertThat(cookie.isHttpOnly()).isTrue();
    return cookie;
  }

  private MvcResult loginResult(UUID userId) throws Exception {
    return mvc.perform(
            post("/api/v1/operator/auth/login")
                .cookie(csrf())
                .header(csrfHeader(), CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"" + userId + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(userId.toString()))
        .andReturn();
  }

  private ConfigurableApplicationContext restart() {
    DataSource dataSource = context.getBean(DataSource.class);
    if (!(dataSource instanceof HikariDataSource hikari)) {
      throw new IllegalStateException(dataSource.getClass().getName());
    }
    return new SpringApplicationBuilder(SceneApplication.class)
        .properties(
            "server.port=0",
            "spring.datasource.url=" + hikari.getJdbcUrl(),
            "spring.datasource.username=" + hikari.getUsername(),
            "spring.datasource.password=" + hikari.getPassword())
        .run();
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void expire(String sessionId) {
    SessionRepository repository = context.getBean(SessionRepository.class);
    Session session = repository.findById(sessionId);
    assertThat(session).isNotNull();
    session.setMaxInactiveInterval(Duration.ZERO);
    repository.save(session);
  }

  private static Cookie csrf() {
    return new Cookie(SecurityConfiguration.CSRF_COOKIE_NAME, CSRF);
  }

  private static String csrfHeader() {
    return SecurityConfiguration.CSRF_HEADER_NAME;
  }

  /** Test-only chain markers. Not a domain API. */
  @RestController
  static class Probe {

    @GetMapping("/api/v1/operator/probe")
    Map<String, String> operator() {
      return Map.of("chain", "operator");
    }

    @GetMapping("/api/v1/participant/probe")
    Map<String, String> participant() {
      return Map.of("chain", "participant");
    }

    @GetMapping("/api/v1/public/probe")
    Map<String, String> open() {
      return Map.of("chain", "public");
    }

    @PostMapping({"/api/v1/operator/probe", "/api/v1/participant/probe", "/api/v1/public/probe"})
    Map<String, String> post() {
      return Map.of("chain", "public");
    }
  }
}
