package app.scene.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.web.servlet.MockMvc;
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

  @Autowired WebApplicationContext context;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(context.getBean(RequestIdFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @Autowired
  @Qualifier("operatorSessions")
  ChainSessionRegistry operatorSessions;

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
    Cookie operator =
        operatorSessions.establish(
            new ProbeAuthentication("operator"),
            new org.springframework.mock.web.MockHttpServletResponse());
    Cookie participant =
        participantSessions.establish(
            new ProbeAuthentication("participant"),
            new org.springframework.mock.web.MockHttpServletResponse());

    mvc.perform(get("/api/v1/operator/probe").cookie(operator))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("operator"));
    mvc.perform(get("/api/v1/participant/probe").cookie(participant))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.chain").value("participant"));

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
  void issuedSessionCookieCarriesThePlaceholderFlags() {
    org.springframework.mock.web.MockHttpServletResponse response =
        new org.springframework.mock.web.MockHttpServletResponse();
    operatorSessions.establish(new ProbeAuthentication("operator"), response);
    String header = response.getHeader(HttpHeaders.SET_COOKIE);
    assertThat(header).contains("placeholder-operator-session=");
    assertThat(header).contains("HttpOnly", "Secure", "SameSite=Lax");
    assertThat(header).doesNotContain("scene_operator_session", "scene_participant_session");
    assertThat(header).doesNotContain("JSESSIONID");
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
