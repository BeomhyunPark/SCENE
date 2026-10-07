package app.scene.event.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.ratelimit.InMemoryRateLimiter;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.lifecycle.EventLifecycleService;
import app.scene.event.lifecycle.LifecycleRequest;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * INV-04 preview, accept, and the provisional rate limit. The raw token is read from the fake
 * mailer and is not stored or echoed.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class EventInvitationAcceptIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";
  private static final String PREVIEW = "/api/v1/operator/invitations/preview";
  private static final String ACCEPT = "/api/v1/operator/invitations/accept";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CapturingInvitationMailer mailer;
  @Autowired InMemoryRateLimiter attempts;
  @Autowired EventLifecycleService lifecycle;

  MockMvc mvc;
  ListAppender<ILoggingEvent> logs;

  @BeforeEach
  void mockMvc() {
    mailer.clear();
    attempts.clear();
    logs = new ListAppender<>();
    logs.start();
    rootLogger().addAppender(logs);
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @AfterEach
  void detachLogs() {
    if (logs != null) {
      rootLogger().detachAppender(logs);
    }
  }

  /** DEC-060 row 4. */
  @Test
  void previewTwiceDoesNotChangeTheInvitation() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued invite = invite(owner, fx.eventId, "Ada@Example.COM", "STAFF");
    UUID reader = invitee("Invitee");
    Cookie invitee = login(reader, " Ada@Example.COM ");
    String me =
        mvc.perform(get("/api/v1/operator/me").cookie(invitee))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(json.readTree(me).propertyNames())
        .containsExactlyInAnyOrder("userId", "displayName");
    assertThat(me).doesNotContain("ada@example.com").doesNotContain(invite.token());

    Instant updated = updatedAt(invite.id());
    String first = ok(preview(invitee, invite.token(), "10.5.5.5"));
    String second = ok(preview(invitee, invite.token(), "10.5.5.5"));
    assertThat(second).isEqualTo(first);
    JsonNode tree = json.readTree(first);
    assertThat(tree.propertyNames())
        .containsExactlyInAnyOrder("eventName", "role", "inviterName", "expiresAt", "outcome");
    assertThat(tree.get("eventName").asString()).isEqualTo("event");
    assertThat(tree.get("role").asString()).isEqualTo("STAFF");
    assertThat(tree.get("inviterName").asString()).isEqualTo("Owner Kim");
    assertThat(tree.get("outcome").asString()).isEqualTo("PENDING");
    assertThat(first).doesNotContain(invite.token()).doesNotContain("ada@example.com");
    assertThat(invitationState(invite.id())).isEqualTo("PENDING");
    assertThat(updatedAt(invite.id())).isEqualTo(updated);
    assertThat(eventRole(fx.eventId, reader)).isNull();
    assertThat(audits(fx.eventId)).isZero();
    assertLogsOmit(invite.token(), "ada@example.com");
  }

  /** DEC-060 rows 1 and 8. The account switch and the 30-minute hold are client behavior. */
  @Test
  void acceptThenAcceptReturnsAlreadyAccepted() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued staffInvite = invite(owner, fx.eventId, "staffer@example.com", "STAFF");
    Issued managerInvite = invite(owner, fx.eventId, "manager@example.com", "MANAGER");
    UUID staffer = invitee("Invitee");
    UUID manager = invitee("Manager Invitee");
    Cookie staffSession = login(staffer, "staffer@example.com");
    Cookie managerSession = login(manager, "manager@example.com");
    int membersBefore = memberships();

    assertThat(
            json.readTree(ok(preview(staffSession, staffInvite.token(), "10.4.1.1")))
                .get("outcome")
                .asString())
        .isEqualTo("PENDING");
    String accepted = ok(accept(staffSession, staffInvite.token(), "10.4.1.1"));
    assertThat(json.readTree(accepted).propertyNames()).containsExactly("outcome");
    assertThat(json.readTree(accepted).get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(accepted).doesNotContain(staffInvite.token()).doesNotContain("staffer@example.com");
    assertThat(invitationState(staffInvite.id())).isEqualTo("ACCEPTED");
    assertThat(acceptedUser(staffInvite.id())).isEqualTo(staffer);
    assertThat(eventRole(fx.eventId, staffer)).isEqualTo("STAFF");
    assertThat(memberships()).isEqualTo(membersBefore);
    assertThat(membershipsOf(staffer)).isZero();
    Instant updated = updatedAt(staffInvite.id());
    int operators = operatorCount(fx.eventId);

    String again = ok(accept(staffSession, staffInvite.token(), "10.4.1.1"));
    assertThat(json.readTree(again).get("outcome").asString()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(again).doesNotContain(staffInvite.token()).doesNotContain("staffer@example.com");
    assertThat(invitationState(staffInvite.id())).isEqualTo("ACCEPTED");
    assertThat(updatedAt(staffInvite.id())).isEqualTo(updated);
    assertThat(eventRole(fx.eventId, staffer)).isEqualTo("STAFF");
    assertThat(operatorCount(fx.eventId)).isEqualTo(operators);

    String previewAgain = ok(preview(staffSession, staffInvite.token(), "10.4.1.1"));
    assertThat(json.readTree(previewAgain).get("outcome").asString()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(updatedAt(staffInvite.id())).isEqualTo(updated);

    String managed = ok(accept(managerSession, managerInvite.token(), "10.4.1.2"));
    assertThat(json.readTree(managed).get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(eventRole(fx.eventId, manager)).isEqualTo("MANAGER");
    assertThat(membershipsOf(manager)).isZero();
    assertThat(memberships()).isEqualTo(membersBefore);

    Issued existing = invite(owner, fx.eventId, "staff@example.com", "MANAGER");
    String kept = ok(accept(login(fx.staffId, "staff@example.com"), existing.token(), "10.4.1.3"));
    assertThat(json.readTree(kept).get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(eventRole(fx.eventId, fx.staffId)).isEqualTo("STAFF");
    assertThat(invitationState(existing.id())).isEqualTo("ACCEPTED");

    String listed =
        mvc.perform(get(operators(fx.eventId)).cookie(owner))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(listed)
        .contains("Invitee")
        .doesNotContain("staffer@example.com")
        .doesNotContain("manager@example.com")
        .doesNotContain(staffInvite.token())
        .doesNotContain(managerInvite.token());
    assertThat(audits(fx.eventId)).isZero();
    assertLogsOmit(staffInvite.token(), managerInvite.token(), "staffer@example.com");
  }

  /** DEC-060 row 6. A real token with the wrong account is 403 and does not reveal state. */
  @Test
  void mismatchedEmailDoesNotRevealState() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued pending = invite(owner, fx.eventId, "pending@example.com", "STAFF");
    Issued expired = invite(owner, fx.eventId, "expired@example.com", "STAFF");
    Issued revoked = invite(owner, fx.eventId, "revoked@example.com", "MANAGER");
    jdbc.update(
        "UPDATE event_invitations SET expires_at = now() - interval '1 day' WHERE id = ?",
        expired.id());
    mvc.perform(
            delete(one(fx.eventId, revoked.id())).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());

    UUID named = user("pending@example.com");
    String namedBody =
        problemBody(
            preview(login(named, null), pending.token(), "10.6.1.1", "req-name"),
            403,
            "INVITATION_EMAIL_MISMATCH",
            "req-name");
    assertThat(namedBody).doesNotContain("pending@example.com").doesNotContain(pending.token());

    UUID wrongPending = invitee("Wrong Pending");
    UUID wrongExpired = invitee("Wrong Expired");
    UUID wrongRevoked = invitee("Wrong Revoked");
    assertHidden(
        fx, pending, wrongPending, login(wrongPending, "other-pending@example.com"), "10.6.1.2");
    assertHidden(
        fx, expired, wrongExpired, login(wrongExpired, "other-expired@example.com"), "10.6.1.3");
    assertHidden(
        fx, revoked, wrongRevoked, login(wrongRevoked, "other-revoked@example.com"), "10.6.1.4");
    assertThat(eventRole(fx.eventId, named)).isNull();
    assertThat(invitationState(pending.id())).isEqualTo("PENDING");
    assertThat(invitationState(expired.id())).isEqualTo("PENDING");
    assertThat(invitationState(revoked.id())).isEqualTo("REVOKED");
    assertThat(audits(fx.eventId)).isZero();
  }

  /** DEC-060 rows 5, 10, 11, and 12. */
  @Test
  void expiredRevokedAndSupersededTokens() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);

    Issued expired = invite(owner, fx.eventId, "old@example.com", "STAFF");
    jdbc.update(
        "UPDATE event_invitations SET expires_at = now() - interval '1 second' WHERE id = ?",
        expired.id());
    Cookie old = login(invitee("Old"), "old@example.com");
    problem(
        preview(old, expired.token(), "10.6.2.1", "req-expired-preview"),
        410,
        "INVITATION_EXPIRED",
        "req-expired-preview");
    problem(
        accept(old, expired.token(), "10.6.2.1", "req-expired-accept"),
        410,
        "INVITATION_EXPIRED",
        "req-expired-accept");
    assertThat(invitationState(expired.id())).isEqualTo("PENDING");
    assertThat(acceptedUser(expired.id())).isNull();

    Issued revoked = invite(owner, fx.eventId, "gone@example.com", "STAFF");
    UUID goneId = invitee("Gone");
    Cookie gone = login(goneId, "gone@example.com");
    ok(preview(gone, revoked.token(), "10.6.2.2"));
    mvc.perform(
            delete(one(fx.eventId, revoked.id())).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    problem(
        accept(gone, revoked.token(), "10.6.2.2", "req-revoked-accept"),
        410,
        "INVITATION_REVOKED",
        "req-revoked-accept");
    Issued replacement = invite(owner, fx.eventId, "gone@example.com", "STAFF");
    problem(
        preview(gone, revoked.token(), "10.6.2.2", "req-old-after-new"),
        410,
        "INVITATION_REVOKED",
        "req-old-after-new");
    assertThat(ok(preview(gone, replacement.token(), "10.6.2.2")))
        .contains("PENDING")
        .doesNotContain(replacement.token());
    assertThat(eventRole(fx.eventId, goneId)).isNull();

    Issued superseded = invite(owner, fx.eventId, "next@example.com", "MANAGER");
    String oldToken = superseded.token();
    mvc.perform(
            post(one(fx.eventId, superseded.id()) + "/resend")
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    String resent = tokenOf(mailer.sent().get(mailer.sent().size() - 1));
    UUID nextId = invitee("Next");
    Cookie next = login(nextId, "next@example.com");
    problem(
        preview(next, oldToken, "10.6.2.3", "req-superseded-preview"),
        410,
        "INVITATION_SUPERSEDED",
        "req-superseded-preview");
    problem(
        accept(next, oldToken, "10.6.2.3", "req-superseded-accept"),
        410,
        "INVITATION_SUPERSEDED",
        "req-superseded-accept");
    assertThat(ok(preview(next, resent, "10.6.2.3"))).contains("PENDING").doesNotContain(resent);
    assertThat(eventRole(fx.eventId, nextId)).isNull();
    assertLogsOmit(expired.token(), revoked.token(), oldToken, resent, "old@example.com");
  }

  /** DEC-060 row 15. */
  @Test
  void anotherUserAlreadyAccepted() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued invite = invite(owner, fx.eventId, "shared@example.com", "STAFF");
    UUID first = invitee("First");
    UUID second = invitee("Second");
    ok(accept(login(first, "shared@example.com"), invite.token(), "10.6.3.1"));
    String body =
        problemBody(
            accept(login(second, "shared@example.com"), invite.token(), "10.6.3.2", "req-other"),
            409,
            "INVITATION_ALREADY_ACCEPTED",
            "req-other");
    assertThat(body)
        .doesNotContain(first.toString())
        .doesNotContain(second.toString())
        .doesNotContain("First")
        .doesNotContain("Second")
        .doesNotContain(invite.token())
        .doesNotContain("shared@example.com");
    assertThat(acceptedUser(invite.id())).isEqualTo(first);
    assertThat(eventRole(fx.eventId, second)).isNull();
    assertThat(eventRole(fx.eventId, first)).isEqualTo("STAFF");
  }

  @Test
  void unknownTokenIsNotFound() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie session = login(invitee("Invitee"), "ada@example.com");
    problem(
        preview(session, "forged-token-value", "10.6.4.1", "req-forged"),
        404,
        "INVITATION_NOT_FOUND",
        "req-forged");
    problem(accept(session, "", "10.6.4.1", "req-blank"), 404, "INVITATION_NOT_FOUND", "req-blank");
    problem(
        postJson(ACCEPT, session, "{\"token\":\"   \"}", "10.6.4.1", "req-space"),
        404,
        "INVITATION_NOT_FOUND",
        "req-space");
    problem(
        postJson(PREVIEW, session, "{\"token\":1}", "10.6.4.1", "req-number"),
        404,
        "INVITATION_NOT_FOUND",
        "req-number");
    problem(
        postJson(ACCEPT, session, "{}", "10.6.4.1", "req-missing"),
        404,
        "INVITATION_NOT_FOUND",
        "req-missing");
    assertThat(operatorCount(fx.eventId)).isEqualTo(3);
    assertLogsOmit("forged-token-value", "ada@example.com");
  }

  /** DEC-060 row 9. The document leaves the number undecided; the provisional limit is 5. */
  @Test
  void overLimitIsRateLimited() throws Exception {
    assertThat(EventInvitationService.INVITATION_ATTEMPT_LIMIT).isEqualTo(5);
    assertThat(EventInvitationService.INVITATION_ATTEMPT_WINDOW).isEqualTo(Duration.ofHours(1));
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued previewOnly = invite(owner, fx.eventId, "limit-preview@example.com", "STAFF");
    Issued thenAccept = invite(owner, fx.eventId, "limit-accept@example.com", "STAFF");
    Cookie previewSession = login(invitee("Limit Preview"), "limit-preview@example.com");
    UUID acceptUser = invitee("Limit Accept");
    Cookie acceptSession = login(acceptUser, "limit-accept@example.com");

    for (int attempt = 0; attempt < 5; attempt++) {
      ok(preview(previewSession, previewOnly.token(), "10.8.8.1"));
    }
    Instant updated = updatedAt(previewOnly.id());
    problem(
        preview(previewSession, previewOnly.token(), "10.8.8.1", "req-preview-limit"),
        429,
        "RATE_LIMITED",
        "req-preview-limit");
    assertThat(invitationState(previewOnly.id())).isEqualTo("PENDING");
    assertThat(updatedAt(previewOnly.id())).isEqualTo(updated);

    for (int attempt = 0; attempt < 5; attempt++) {
      ok(preview(acceptSession, thenAccept.token(), "10.8.8.2"));
    }
    problem(
        accept(acceptSession, thenAccept.token(), "10.8.8.2", "req-accept-limit"),
        429,
        "RATE_LIMITED",
        "req-accept-limit");
    assertThat(invitationState(thenAccept.id())).isEqualTo("PENDING");
    assertThat(acceptedUser(thenAccept.id())).isNull();
    assertThat(eventRole(fx.eventId, acceptUser)).isNull();
    assertLogsOmit(previewOnly.token(), thenAccept.token(), "limit-preview@example.com");
  }

  /** DEC-060 row 7. Logged-out calls are 401 and do not fill the rate-limit bucket. */
  @Test
  void loggedOutStaysUnauthorized() throws Exception {
    Fixture fx = seed("ACTIVE");
    Issued invite = invite(login(fx.ownerId, null), fx.eventId, "ada@example.com", "STAFF");
    for (int attempt = 0; attempt < 6; attempt++) {
      problem(
          preview(null, invite.token(), "10.7.7.7", "req-anon-" + attempt),
          401,
          "AUTHENTICATION_REQUIRED",
          "req-anon-" + attempt);
    }
    String body =
        ok(preview(login(invitee("Invitee"), "ada@example.com"), invite.token(), "10.7.7.7"));
    assertThat(json.readTree(body).get("outcome").asString()).isEqualTo("PENDING");
    assertThat(invitationState(invite.id())).isEqualTo("PENDING");
  }

  /** DEC-060 row 9, split by account and by direct address. */
  @Test
  void accountAndAddressAreLimitedSeparately() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId, null);
    Issued first = invite(owner, fx.eventId, "a@example.com", "STAFF");
    Issued second = invite(owner, fx.eventId, "b@example.com", "STAFF");
    Cookie accountA = login(invitee("A"), "a@example.com");
    Cookie accountB = login(invitee("B"), "b@example.com");
    for (int attempt = 0; attempt < 5; attempt++) {
      ok(preview(accountA, first.token(), "10.1.1.1"));
    }
    problem(
        preview(accountB, second.token(), "10.1.1.1", "req-shared-ip"),
        429,
        "RATE_LIMITED",
        "req-shared-ip");
    problem(
        preview(accountA, first.token(), "10.9.9.9", "req-shared-account"),
        429,
        "RATE_LIMITED",
        "req-shared-account");
    assertThat(ok(preview(accountB, second.token(), "10.9.9.9"))).contains("PENDING");
    assertThat(invitationState(first.id())).isEqualTo("PENDING");
    assertThat(invitationState(second.id())).isEqualTo("PENDING");
  }

  /** DEC-063 L5. A revoked archived invitation stays 410. A still-pending one is 409. */
  @Test
  void archivedPendingIsConflictAndRevokedStaysGone() throws Exception {
    Fixture pendingEvent = seed("ACTIVE");
    Cookie owner = login(pendingEvent.ownerId, null);
    Issued pending = invite(owner, pendingEvent.eventId, "archived@example.com", "STAFF");
    UUID archivedUser = invitee("Archived");
    Cookie invitee = login(archivedUser, "archived@example.com");
    jdbc.update(
        "UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", pendingEvent.eventId);
    Instant updated = updatedAt(pending.id());
    problem(
        preview(invitee, pending.token(), "10.6.5.1", "req-archived-preview"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-preview");
    problem(
        accept(invitee, pending.token(), "10.6.5.1", "req-archived-accept"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-accept");
    assertThat(invitationState(pending.id())).isEqualTo("PENDING");
    assertThat(updatedAt(pending.id())).isEqualTo(updated);
    assertThat(eventRole(pendingEvent.eventId, archivedUser)).isNull();
    assertThat(audits(pendingEvent.eventId)).isZero();

    jdbc.update(
        "UPDATE event_invitations SET expires_at = now() - interval '1 day' WHERE id = ?",
        pending.id());
    problem(
        preview(invitee, pending.token(), "10.6.5.1", "req-archived-expired"),
        410,
        "INVITATION_EXPIRED",
        "req-archived-expired");

    Fixture archived = seed("ACTIVE");
    Cookie archivedOwner = login(archived.ownerId, null);
    Issued revoked =
        invite(archivedOwner, archived.eventId, "revoked-archive@example.com", "STAFF");
    jdbc.update("UPDATE events SET lifecycle_status = 'ENDED' WHERE id = ?", archived.eventId);
    lifecycle.archive(
        archived.spaceId,
        archived.eventId,
        new LifecycleRequest(0, true, null, null),
        new OperatorActor(archived.ownerId, "OWNER", "OWNER"));
    assertThat(invitationState(revoked.id())).isEqualTo("REVOKED");
    UUID readerId = invitee("Revoked Archive");
    Cookie reader = login(readerId, "revoked-archive@example.com");
    problem(
        preview(reader, revoked.token(), "10.6.5.2", "req-archive-preview"),
        410,
        "INVITATION_REVOKED",
        "req-archive-preview");
    problem(
        accept(reader, revoked.token(), "10.6.5.2", "req-archive-accept"),
        410,
        "INVITATION_REVOKED",
        "req-archive-accept");
    assertThat(eventRole(archived.eventId, readerId)).isNull();
    assertThat(auditText(archived.eventId))
        .doesNotContain(revoked.token())
        .doesNotContain("revoked-archive@example.com");
    assertLogsOmit(pending.token(), revoked.token(), "archived@example.com");
  }

  private void assertHidden(Fixture fx, Issued invite, UUID userId, Cookie session, String address)
      throws Exception {
    for (String path : List.of("preview", "accept")) {
      ResultActions actions =
          "preview".equals(path)
              ? preview(session, invite.token(), address, "req-hide-" + path + "-" + address)
              : accept(session, invite.token(), address, "req-hide-" + path + "-" + address);
      String body =
          problemBody(
              actions, 403, "INVITATION_EMAIL_MISMATCH", "req-hide-" + path + "-" + address);
      assertThat(body)
          .doesNotContain(invite.token())
          .doesNotContain(invite.email())
          .doesNotContain("INVITATION_EXPIRED")
          .doesNotContain("INVITATION_REVOKED")
          .doesNotContain("INVITATION_SUPERSEDED")
          .doesNotContain("만료")
          .doesNotContain("취소")
          .doesNotContain("다시 보낸");
    }
    assertThat(eventRole(fx.eventId, userId)).isNull();
  }

  private Cookie login(UUID userId, String email) throws Exception {
    String content =
        email == null
            ? "{\"userId\":\"" + userId + "\"}"
            : "{\"userId\":\"" + userId + "\",\"email\":\"" + email + "\"}";
    MvcResult result =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(content))
            .andExpect(status().isOk())
            .andReturn();
    String body = result.getResponse().getContentAsString();
    assertThat(json.readTree(body).propertyNames())
        .containsExactlyInAnyOrder("userId", "displayName");
    if (email != null) {
      assertThat(body).doesNotContain(email.trim().toLowerCase());
    }
    Cookie cookie = result.getResponse().getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private Issued invite(Cookie owner, UUID eventId, String email, String role) throws Exception {
    String body =
        mvc.perform(
                post(collection(eventId))
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    InvitationMail mail = mailer.sent().get(mailer.sent().size() - 1);
    String token = tokenOf(mail);
    assertThat(body).doesNotContain(token);
    UUID id = UUID.fromString(json.readTree(body).get("id").asString());
    assertThat(tokenHash(id)).isEqualTo(sha256(token)).isNotEqualTo(token);
    return new Issued(id, token, mail.recipient());
  }

  private ResultActions preview(Cookie session, String token, String address) throws Exception {
    return preview(session, token, address, null);
  }

  private ResultActions preview(Cookie session, String token, String address, String requestId)
      throws Exception {
    return postJson(PREVIEW, session, tokenBody(token), address, requestId);
  }

  private ResultActions accept(Cookie session, String token, String address) throws Exception {
    return accept(session, token, address, null);
  }

  private ResultActions accept(Cookie session, String token, String address, String requestId)
      throws Exception {
    return postJson(ACCEPT, session, tokenBody(token), address, requestId);
  }

  private ResultActions postJson(
      String path, Cookie session, String jsonBody, String address, String requestId)
      throws Exception {
    MockHttpServletRequestBuilder request =
        post(path)
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonBody)
            .header(CSRF_HEADER, CSRF);
    if (session == null) {
      request.cookie(csrf());
    } else {
      request.cookie(session, csrf());
    }
    if (address != null) {
      request.with(
          servletRequest -> {
            servletRequest.setRemoteAddr(address);
            return servletRequest;
          });
    }
    if (requestId != null) {
      request.header("X-Request-Id", requestId);
    }
    return mvc.perform(request);
  }

  private static String tokenBody(String token) {
    return "{\"token\":\"" + token + "\"}";
  }

  private String ok(ResultActions actions) throws Exception {
    return actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  }

  private void problem(ResultActions actions, int httpStatus, String code, String requestId)
      throws Exception {
    problemBody(actions, httpStatus, code, requestId);
  }

  private String problemBody(ResultActions actions, int httpStatus, String code, String requestId)
      throws Exception {
    return actions
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private void assertLogsOmit(String... secrets) {
    for (ILoggingEvent event : logs.list) {
      String message = event.getFormattedMessage();
      for (String secret : secrets) {
        assertThat(message).doesNotContain(secret);
        if (event.getThrowableProxy() != null && event.getThrowableProxy().getMessage() != null) {
          assertThat(event.getThrowableProxy().getMessage()).doesNotContain(secret);
        }
      }
    }
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

  private static String operators(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private static String tokenOf(InvitationMail mail) {
    String link = mail.fragmentLink();
    assertThat(link).startsWith(LINK_PREFIX);
    assertThat(link).doesNotContain("?");
    String token = link.substring(LINK_PREFIX.length());
    assertThat(token).isNotBlank();
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

  private Fixture seed(String lifecycleStatus) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "Owner Kim");
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
        lifecycleStatus);
    operator(fx, fx.ownerId, "OWNER");
    operator(fx, fx.managerId, "MANAGER");
    operator(fx, fx.staffId, "STAFF");
    return fx;
  }

  private UUID invitee(String name) {
    return user(name);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    user(id, name);
    return id;
  }

  private void user(UUID id, String name) {
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
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

  private static Logger rootLogger() {
    return (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
  }

  private String tokenHash(UUID id) {
    return jdbc.queryForObject(
        "SELECT token_hash FROM event_invitations WHERE id = ?", String.class, id);
  }

  private String invitationState(UUID id) {
    return jdbc.queryForObject(
        "SELECT status FROM event_invitations WHERE id = ?", String.class, id);
  }

  private UUID acceptedUser(UUID id) {
    return jdbc.queryForObject(
        "SELECT accepted_user_id FROM event_invitations WHERE id = ?", UUID.class, id);
  }

  private Instant updatedAt(UUID id) {
    Timestamp timestamp =
        jdbc.queryForObject(
            "SELECT updated_at FROM event_invitations WHERE id = ?", Timestamp.class, id);
    assertThat(timestamp).isNotNull();
    return timestamp.toInstant();
  }

  private String eventRole(UUID eventId, UUID userId) {
    List<String> roles =
        jdbc.query(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            (rs, row) -> rs.getString(1),
            eventId,
            userId);
    assertThat(roles).hasSizeLessThanOrEqualTo(1);
    return roles.isEmpty() ? null : roles.get(0);
  }

  private int operatorCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_users WHERE event_id = ?", Integer.class, eventId);
  }

  private int memberships() {
    return jdbc.queryForObject("SELECT count(*) FROM members", Integer.class);
  }

  private int membershipsOf(UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM members WHERE user_id = ?", Integer.class, userId);
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

  private record Issued(UUID id, String token, String email) {}
}
