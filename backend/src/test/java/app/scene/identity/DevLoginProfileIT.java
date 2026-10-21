package app.scene.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Development login is absent on deploy profiles.
 *
 * <p>{@code ApplicationContextIT.testsDoNotActivateDeployProfiles} still rejects {@code local},
 * {@code dev}, {@code stg}, and {@code prod} on the default test context. This class is the
 * exception: it starts {@code prod} and {@code stg} on purpose and does not relax that assertion.
 */
class DevLoginProfileIT {

  private static final PostgreSQLContainer POSTGRES =
      new PostgreSQLContainer(PostgresTestcontainer.POSTGRES_IMAGE);

  static {
    POSTGRES.start();
  }

  private static void database(DynamicPropertyRegistry registry) {
    registry.add("SCENE_DB_URL", POSTGRES::getJdbcUrl);
    registry.add("SCENE_DB_USER", POSTGRES::getUsername);
    registry.add("SCENE_DB_PASSWORD", POSTGRES::getPassword);
    registry.add("SCENE_CORS_ALLOWED_ORIGINS", () -> "");
  }

  @Nested
  @SpringBootTest(properties = "spring.profiles.active=prod")
  @ActiveProfiles("prod")
  class Prod {

    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final String CSRF = "csrf-token";
    private static final String LOGIN = "/api/v1/operator/auth/login";
    private static final String ACCEPT = "/api/v1/operator/invitations/accept";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
      database(registry);
    }

    @Autowired WebApplicationContext context;
    @Autowired Environment environment;
    @Autowired JdbcTemplate jdbc;

    MockMvc mvc;

    @BeforeEach
    void mockMvc() {
      mvc =
          MockMvcBuilders.webAppContextSetup(context)
              .addFilters(
                  context.getBean(RequestIdFilter.class),
                  context.getBean(SessionRepositoryFilter.class))
              .apply(SecurityMockMvcConfigurers.springSecurity())
              .build();
    }

    @Test
    void loginIsNotFound() throws Exception {
      assertThat(environment.getActiveProfiles()).contains("prod").doesNotContain("test", "local");
      assertThat(context.getBeanNamesForType(DevLoginController.class)).isEmpty();
      postLogin(UUID.randomUUID(), "spoof@example.com")
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.status").value(404))
          .andExpect(jsonPath("$.code").doesNotExist());
    }

    @Test
    void missingVerifiedEmailCannotBeInjectedAndDoesNotAccept() throws Exception {
      UUID ownerId = UUID.randomUUID();
      UUID readerId = UUID.randomUUID();
      UUID spaceId = UUID.randomUUID();
      UUID eventId = UUID.randomUUID();
      UUID invitationId = UUID.randomUUID();
      String token = "prod-profile-invitation-token";
      jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
      jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", spaceId);
      jdbc.update(
          """
          INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
          VALUES (?, ?, 'event', 'ACTIVE', 0)
          """,
          eventId,
          spaceId);
      jdbc.update(
          """
          INSERT INTO event_invitations (
            id, space_id, event_id, email_normalized, role, token_hash, status,
            expires_at, invited_by, created_at, updated_at)
          VALUES (?, ?, ?, 'invitee@example.com', 'STAFF', ?, 'PENDING',
            now() + interval '7 days', ?, now(), now())
          """,
          invitationId,
          spaceId,
          eventId,
          sha256(token),
          ownerId);

      OperatorPrincipal principal = new OperatorPrincipal(readerId, "Reader", null);
      mvc.perform(
              post(ACCEPT)
                  .with(
                      authentication(
                          UsernamePasswordAuthenticationToken.authenticated(
                              principal, null, principal.getAuthorities())))
                  .cookie(new Cookie(CSRF_COOKIE, CSRF))
                  .header(CSRF_HEADER, CSRF)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"token\":\"" + token + "\"}"))
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
      assertThat(invitationStatus(invitationId)).isEqualTo("PENDING");

      postLogin(readerId, "invitee@example.com").andExpect(status().isNotFound());
      assertThat(invitationStatus(invitationId)).isEqualTo("PENDING");
    }

    private org.springframework.test.web.servlet.ResultActions postLogin(UUID userId, String email)
        throws Exception {
      return mvc.perform(
          post(LOGIN)
              .cookie(new Cookie(CSRF_COOKIE, CSRF))
              .header(CSRF_HEADER, CSRF)
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"userId\":\"" + userId + "\",\"email\":\"" + email + "\"}"));
    }

    private String invitationStatus(UUID id) {
      return jdbc.queryForObject(
          "SELECT status FROM event_invitations WHERE id = ?", String.class, id);
    }
  }

  @Nested
  @SpringBootTest(properties = "spring.profiles.active=stg")
  @ActiveProfiles("stg")
  class Stg {

    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final String CSRF = "csrf-token";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
      database(registry);
    }

    @Autowired WebApplicationContext context;
    @Autowired Environment environment;

    MockMvc mvc;

    @BeforeEach
    void mockMvc() {
      mvc =
          MockMvcBuilders.webAppContextSetup(context)
              .addFilters(
                  context.getBean(RequestIdFilter.class),
                  context.getBean(SessionRepositoryFilter.class))
              .apply(SecurityMockMvcConfigurers.springSecurity())
              .build();
    }

    @Test
    void loginIsNotFound() throws Exception {
      assertThat(environment.getActiveProfiles()).contains("stg").doesNotContain("test", "local");
      assertThat(context.getBeanNamesForType(DevLoginController.class)).isEmpty();
      mvc.perform(
              post("/api/v1/operator/auth/login")
                  .cookie(new Cookie(CSRF_COOKIE, CSRF))
                  .header(CSRF_HEADER, CSRF)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"userId\":\"" + UUID.randomUUID() + "\",\"email\":\"spoof@example.com\"}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.status").value(404))
          .andExpect(jsonPath("$.code").doesNotExist());
    }
  }

  private static String sha256(String token) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable", ex);
    }
  }
}
