package app.scene.event.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.lifecycle.EventLifecycleService;
import app.scene.event.lifecycle.LifecycleRequest;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** INV-03 invitation commands. The raw token is stored only as a hash. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class EventInvitationIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CapturingInvitationMailer mailer;
  @Autowired EventLifecycleService lifecycle;
  @Autowired Clock clock;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mailer.clear();
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @Test
  void unauthenticatedCreateIsAuthenticationRequired() throws Exception {
    problem(
        mvc.perform(
            post(collection(UUID.randomUUID()))
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("a@example.com", "STAFF"))
                .header("X-Request-Id", "req-anon")),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-anon");
    assertThat(mailer.sent()).isEmpty();
  }

  @Test
  void createStoresAHashAndTheMailerReceivesOneFragmentLink() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    int operators = operatorCount(fx.eventId);

    String body = created(owner, fx.eventId, "Ada@Example.COM", "STAFF");
    JsonNode tree = json.readTree(body);
    assertThat(tree.propertyNames()).containsExactlyInAnyOrder("id", "role", "status", "expiresAt");
    UUID id = UUID.fromString(tree.get("id").asString());
    assertThat(mailer.sent()).hasSize(1);
    InvitationMail mail = mailer.sent().get(0);
    assertThat(mail.recipient()).isEqualTo("ada@example.com");
    assertThat(mail.role()).isEqualTo("STAFF");
    assertThat(mail.eventName()).isEqualTo("event");
    String token = tokenOf(mail);
    assertThat(body).doesNotContain(token).doesNotContain("ada@example.com").doesNotContain("Ada@");
    String hash = tokenHash(id);
    assertThat(hash).isEqualTo(sha256(token)).hasSize(64).isNotEqualTo(token);
    assertThat(storedText(fx.eventId)).doesNotContain(token);
    assertThat(audits(fx.eventId)).isZero();
    assertThat(operatorCount(fx.eventId)).isEqualTo(operators);
    assertThat(expiresAt(id))
        .isAfter(clock.instant().plus(EventInvitationService.INVITATION_TTL).minusSeconds(120));
    assertThat(expiresAt(id))
        .isBefore(clock.instant().plus(EventInvitationService.INVITATION_TTL).plusSeconds(5));

    String again = created(owner, fx.eventId, "ada@example.com", "MANAGER");
    UUID second = UUID.fromString(json.readTree(again).get("id").asString());
    assertThat(invitationStatus(id)).isEqualTo("SUPERSEDED");
    assertThat(invitationStatus(second)).isEqualTo("PENDING");
    assertThat(tokenHash(id)).isEqualTo(hash);
    assertThat(mailer.sent()).hasSize(2);
    assertThat(tokenOf(mailer.sent().get(1))).isNotEqualTo(token);
    assertThat(count(fx.eventId, "PENDING")).isEqualTo(1);
    assertThat(count(fx.eventId, null)).isEqualTo(2);

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("ada@example.com", "LEADER")),
            "req-leader"),
        400,
        "VALIDATION_FAILED",
        "req-leader");
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("ada@example.com", "OWNER")),
            "req-owner-role"),
        400,
        "VALIDATION_FAILED",
        "req-owner-role");
    assertThat(count(fx.eventId, null)).isEqualTo(2);
    assertThat(mailer.sent()).hasSize(2);
    assertThat(audits(fx.eventId)).isZero();
  }

  @Test
  void resendSupersedesTheOldTokenAndSendsOneNewLink() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID id =
        UUID.fromString(
            json.readTree(created(owner, fx.eventId, "a@example.com", "STAFF"))
                .get("id")
                .asString());
    String oldToken = tokenOf(mailer.sent().get(0));
    String oldHash = tokenHash(id);
    jdbc.update(
        "UPDATE event_invitations SET expires_at = now() - interval '1 day' WHERE id = ?", id);
    mailer.clear();

    String body =
        mvc.perform(
                post(one(fx.eventId, id) + "/resend")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.role").value("STAFF"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID resent = UUID.fromString(json.readTree(body).get("id").asString());
    assertThat(mailer.sent()).hasSize(1);
    String token = tokenOf(mailer.sent().get(0));
    assertThat(token).isNotEqualTo(oldToken);
    assertThat(body).doesNotContain(token).doesNotContain(oldToken).doesNotContain("a@example.com");
    assertThat(invitationStatus(id)).isEqualTo("SUPERSEDED");
    assertThat(tokenHash(id)).isEqualTo(oldHash);
    assertThat(invitationStatus(resent)).isEqualTo("PENDING");
    assertThat(tokenHash(resent)).isEqualTo(sha256(token)).isNotEqualTo(oldHash);
    assertThat(storedText(fx.eventId)).doesNotContain(token).doesNotContain(oldToken);
    assertThat(audits(fx.eventId)).isZero();

    problem(
        write(
            post(one(fx.eventId, UUID.randomUUID()) + "/resend").cookie(owner, csrf()),
            "req-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing");
    assertThat(mailer.sent()).hasSize(1);
  }

  @Test
  void deleteMarksTheRowRevoked() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID id =
        UUID.fromString(
            json.readTree(created(owner, fx.eventId, "a@example.com", "MANAGER"))
                .get("id")
                .asString());
    mailer.clear();

    mvc.perform(delete(one(fx.eventId, id)).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.status").value("REVOKED"))
        .andExpect(jsonPath("$.email").doesNotExist());
    assertThat(invitationStatus(id)).isEqualTo("REVOKED");
    assertThat(count(fx.eventId, null)).isEqualTo(1);
    assertThat(mailer.sent()).isEmpty();
    assertThat(audits(fx.eventId)).isZero();

    mvc.perform(delete(one(fx.eventId, id)).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVOKED"));
    assertThat(count(fx.eventId, null)).isEqualTo(1);

    problem(
        write(post(one(fx.eventId, id) + "/resend").cookie(owner, csrf()), "req-revoked-resend"),
        400,
        "VALIDATION_FAILED",
        "req-revoked-resend");
    assertThat(mailer.sent()).isEmpty();
    assertThat(invitationStatus(id)).isEqualTo("REVOKED");
  }

  @Test
  void archivedCreateAndResendSendNoMail() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID id =
        UUID.fromString(
            json.readTree(created(owner, fx.eventId, "a@example.com", "STAFF"))
                .get("id")
                .asString());
    String hash = tokenHash(id);
    mailer.clear();
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("new@example.com", "STAFF")),
            "req-archived-create"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-create");
    problem(
        write(post(one(fx.eventId, id) + "/resend").cookie(owner, csrf()), "req-archived-resend"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-resend");
    problem(
        write(
            post(one(fx.eventId, UUID.randomUUID()) + "/resend").cookie(owner, csrf()),
            "req-archived-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-archived-missing");
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("new@example.com", "LEADER")),
            "req-archived-leader"),
        400,
        "VALIDATION_FAILED",
        "req-archived-leader");
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(login(fx.managerId), csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("new@example.com", "STAFF")),
            "req-archived-manager"),
        403,
        "FORBIDDEN",
        "req-archived-manager");
    assertThat(mailer.sent()).isEmpty();
    assertThat(count(fx.eventId, null)).isEqualTo(1);
    assertThat(invitationStatus(id)).isEqualTo("PENDING");
    assertThat(tokenHash(id)).isEqualTo(hash);
    assertThat(audits(fx.eventId)).isZero();
  }

  @Test
  void archiveRevokesPendingInvitationsInThatCommand() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID id =
        UUID.fromString(
            json.readTree(created(owner, fx.eventId, "a@example.com", "STAFF"))
                .get("id")
                .asString());
    String token = tokenOf(mailer.sent().get(0));
    OperatorActor actor = new OperatorActor(fx.ownerId, "OWNER", "OWNER");
    LifecycleRequest request = new LifecycleRequest(0, true, null, null);

    assertThatThrownBy(() -> lifecycle.archive(fx.spaceId, fx.eventId, request, actor))
        .isInstanceOf(SceneException.class)
        .extracting(ex -> ((SceneException) ex).code())
        .isEqualTo(ErrorCode.INVALID_STATE_TRANSITION);
    assertThat(invitationStatus(id)).isEqualTo("PENDING");

    jdbc.update("UPDATE events SET lifecycle_status = 'ENDED' WHERE id = ?", fx.eventId);
    lifecycle.archive(fx.spaceId, fx.eventId, request, actor);
    assertThat(invitationStatus(id)).isEqualTo("REVOKED");
    assertThat(count(fx.eventId, null)).isEqualTo(1);
    assertThat(mailer.sent()).hasSize(1);
    assertThat(auditText(fx.eventId)).doesNotContain(token).doesNotContain("a@example.com");
  }

  @Test
  void nonOwnerIsForbiddenAfterNotFoundAndNotAMember() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);

    problem(
        write(
            post(collection(UUID.randomUUID()))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("a@example.com", "STAFF")),
            "req-missing-event"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing-event");

    UUID strangerId = user("Stranger");
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(login(strangerId), csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("a@example.com", "LEADER")),
            "req-outsider"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-outsider");

    mvc.perform(
            delete(operators(fx.eventId, fx.staffId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(staff, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("a@example.com", "STAFF")),
            "req-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-revoked");

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(login(fx.managerId), csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite("a@example.com", "STAFF")),
            "req-manager"),
        403,
        "FORBIDDEN",
        "req-manager");
    assertThat(count(fx.eventId, null)).isZero();
    assertThat(mailer.sent()).isEmpty();
  }

  private String created(Cookie owner, UUID eventId, String email, String role) throws Exception {
    return mvc.perform(
            post(collection(eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(invite(email, role)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private ResultActions write(MockHttpServletRequestBuilder request, String requestId)
      throws Exception {
    return mvc.perform(request.header(CSRF_HEADER, CSRF).header("X-Request-Id", requestId));
  }

  private ResultActions problem(
      ResultActions actions, int httpStatus, String code, String requestId) throws Exception {
    return actions
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId));
  }

  private Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + userId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private static String collection(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/invitations";
  }

  private static String one(UUID eventId, UUID invitationId) {
    return collection(eventId) + "/" + invitationId;
  }

  private static String operators(UUID eventId, UUID userId) {
    return "/api/v1/operator/events/" + eventId + "/operators/" + userId;
  }

  private static String invite(String email, String role) {
    return "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}";
  }

  private static String tokenOf(InvitationMail mail) {
    String link = mail.fragmentLink();
    assertThat(link).startsWith(LINK_PREFIX);
    assertThat(link).doesNotContain("?");
    String token = link.substring(LINK_PREFIX.length());
    assertThat(token).isNotBlank();
    assertThat(link.substring(0, link.indexOf('#'))).doesNotContain(token);
    return token;
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

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "owner");
    user(fx.managerId, "manager");
    user(fx.staffId, "staff");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "OWNER");
    member(fx.spaceId, fx.managerId, "MEMBER");
    member(fx.spaceId, fx.staffId, "MEMBER");
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'event', ?, 0)
        """,
        fx.eventId,
        fx.spaceId,
        lifecycle);
    operator(fx, fx.ownerId, "OWNER");
    operator(fx, fx.managerId, "MANAGER");
    operator(fx, fx.staffId, "STAFF");
    return fx;
  }

  private void user(UUID id, String name) {
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    user(id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private void operator(Fixture fx, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        fx.spaceId,
        fx.eventId,
        userId,
        role);
  }

  private String tokenHash(UUID id) {
    return jdbc.queryForObject(
        "SELECT token_hash FROM event_invitations WHERE id = ?", String.class, id);
  }

  private String invitationStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT status FROM event_invitations WHERE id = ?", String.class, id);
  }

  private Instant expiresAt(UUID id) {
    Timestamp timestamp =
        jdbc.queryForObject(
            "SELECT expires_at FROM event_invitations WHERE id = ?", Timestamp.class, id);
    assertThat(timestamp).isNotNull();
    return timestamp.toInstant();
  }

  private int count(UUID eventId, String status) {
    if (status == null) {
      return jdbc.queryForObject(
          "SELECT count(*) FROM event_invitations WHERE event_id = ?", Integer.class, eventId);
    }
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_invitations WHERE event_id = ? AND status = ?",
        Integer.class,
        eventId,
        status);
  }

  private int operatorCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_users WHERE event_id = ?", Integer.class, eventId);
  }

  private String storedText(UUID eventId) {
    return jdbc.queryForObject(
        """
        SELECT coalesce(string_agg(
          email_normalized || token_hash || role || status, ''), '')
        FROM event_invitations WHERE event_id = ?
        """,
        String.class,
        eventId);
  }

  private int audits(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private String auditText(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT coalesce(string_agg(detail::text, ''), '') FROM audit_logs WHERE event_id = ?",
        String.class,
        eventId);
  }

  private record Fixture(UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId) {
    static Fixture create() {
      return new Fixture(
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID());
    }
  }
}
