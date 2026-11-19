package app.scene.space.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.ratelimit.InMemoryRateLimiter;
import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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
 * #361, DEC-076: space invitations follow the event invitation contract (DEC-060). The raw token is
 * read from the create and resend body only.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class SpaceInvitationIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";
  private static final String SPACE_MARKER = "s.";
  private static final String PREVIEW = "/api/v1/operator/space-invitations/preview";
  private static final String ACCEPT = "/api/v1/operator/space-invitations/accept";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired InMemoryRateLimiter attempts;
  @Autowired Clock clock;

  MockMvc mvc;
  ListAppender<ILoggingEvent> logs;

  @BeforeEach
  void mockMvc() {
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

  @Test
  void unauthenticatedCallsAreAuthenticationRequired() throws Exception {
    Fixture fx = seed();
    problem(
        mvc.perform(
            post(invitations(fx.spaceId))
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@example.com\"}")),
        401,
        "AUTHENTICATION_REQUIRED");
    problem(mvc.perform(get(members(fx.spaceId))), 401, "AUTHENTICATION_REQUIRED");
    problem(postJson(ACCEPT, null, "{\"token\":\"s.x\"}", null), 401, "AUTHENTICATION_REQUIRED");
  }

  @Test
  void createListResendRevokeKeepOnePendingAndAuditWithoutContact() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);

    String body =
        ok(write(post(invitations(fx.spaceId)), owner, "{\"email\":\" New@Example.COM \"}"));
    JsonNode created = json.readTree(body);
    assertThat(created.propertyNames())
        .containsExactlyInAnyOrder("id", "role", "status", "expiresAt", "link");
    assertThat(created.get("role").asString()).isEqualTo("MEMBER");
    assertThat(created.get("status").asString()).isEqualTo("PENDING");
    assertThat(body).doesNotContain("new@example.com");
    Issued first = issued(created);
    assertThat(tokenHash(first.id)).isEqualTo(sha256(first.token)).isNotEqualTo(first.token);
    assertThat(email(first.id)).isEqualTo("new@example.com");
    assertThat(
            java.time.Instant.parse(created.get("expiresAt").asString())
                .isAfter(clock.instant().plus(Duration.ofDays(7)).minusSeconds(120)))
        .isTrue();

    String listed = ok(mvc.perform(get(invitations(fx.spaceId)).cookie(owner)));
    JsonNode items = json.readTree(listed).get("items");
    assertThat(items).hasSize(1);
    assertThat(items.get(0).propertyNames())
        .containsExactlyInAnyOrder("id", "email", "role", "status", "expiresAt");
    assertThat(items.get(0).get("email").asString()).isEqualTo("new@example.com");
    assertThat(listed).doesNotContain(first.token).doesNotContain(tokenHash(first.id));

    Issued second =
        issued(json.readTree(ok(write(post(one(fx.spaceId, first.id) + "/resend"), owner, null))));
    assertThat(second.id).isNotEqualTo(first.id);
    assertThat(second.token).isNotEqualTo(first.token);
    assertThat(state(first.id)).isEqualTo("SUPERSEDED");
    assertThat(state(second.id)).isEqualTo("PENDING");
    problem(
        write(post(one(fx.spaceId, first.id) + "/resend"), owner, null), 400, "VALIDATION_FAILED");

    // Creating again for the same address supersedes the pending one: one PENDING per space+email.
    Issued third =
        issued(
            json.readTree(
                ok(
                    write(
                        post(invitations(fx.spaceId)),
                        owner,
                        "{\"email\":\"new@example.com\",\"role\":\"MEMBER\"}"))));
    assertThat(state(second.id)).isEqualTo("SUPERSEDED");
    assertThat(pendingCount(fx.spaceId, "new@example.com")).isEqualTo(1);

    String revoked = ok(write(delete(one(fx.spaceId, third.id)), owner, null));
    assertThat(json.readTree(revoked).propertyNames())
        .containsExactlyInAnyOrder("id", "role", "status", "expiresAt");
    assertThat(json.readTree(revoked).get("status").asString()).isEqualTo("REVOKED");
    assertThat(state(third.id)).isEqualTo("REVOKED");
    assertThat(ok(write(delete(one(fx.spaceId, third.id)), owner, null))).isEqualTo(revoked);
    problem(write(delete(one(fx.spaceId, first.id)), owner, null), 400, "VALIDATION_FAILED");
    problem(
        write(delete(one(fx.spaceId, UUID.randomUUID())), owner, null), 404, "RESOURCE_NOT_FOUND");
    assertThat(
            json.readTree(ok(mvc.perform(get(invitations(fx.spaceId)).cookie(owner)))).get("items"))
        .isEmpty();

    UUID invitee = user("Invitee");
    Cookie session = login(invitee, "new@example.com");
    problem(accept(session, first.token, "10.61.0.1"), 410, "INVITATION_SUPERSEDED");
    problem(accept(session, third.token, "10.61.0.2"), 410, "INVITATION_REVOKED");
    assertThat(membership(fx.spaceId, invitee)).isNull();

    List<String> actions =
        jdbc.query(
            "SELECT action FROM audit_logs WHERE space_id = ? ORDER BY occurred_at, action",
            (rs, row) -> rs.getString(1),
            fx.spaceId);
    assertThat(actions)
        .containsExactlyInAnyOrder(
            "SPACE_INVITATION_CREATED",
            "SPACE_INVITATION_RESENT",
            "SPACE_INVITATION_CREATED",
            "SPACE_INVITATION_REVOKED");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE space_id = ? AND event_id IS NOT NULL",
                Integer.class,
                fx.spaceId))
        .isZero();
    String audit = auditText(fx.spaceId);
    assertThat(audit).contains(first.id.toString()).contains(second.id.toString());
    for (Issued issued : List.of(first, second, third)) {
      assertThat(audit).doesNotContain(issued.token).doesNotContain(tokenHash(issued.id));
      assertLogsOmit(issued.token);
    }
    assertThat(audit).doesNotContain("new@example.com");
  }

  @Test
  void onlyOwnerAndAdminInviteAndOnlyOwnerInvitesAdmin() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    Cookie admin = login(fx.adminId, null);
    Cookie member = login(fx.memberId, null);

    problem(
        write(post(invitations(fx.spaceId)), member, "{\"email\":\"a@example.com\"}"),
        403,
        "FORBIDDEN");
    problem(mvc.perform(get(invitations(fx.spaceId)).cookie(member)), 403, "FORBIDDEN");

    UUID stranger = user("Stranger");
    Cookie strangerSession = login(stranger, null);
    problem(
        write(post(invitations(fx.spaceId)), strangerSession, "{\"email\":\"a@example.com\"}"),
        404,
        "RESOURCE_NOT_FOUND");
    problem(
        mvc.perform(get(invitations(fx.spaceId)).cookie(strangerSession)),
        404,
        "RESOURCE_NOT_FOUND");

    UUID left = user("Left");
    member(fx.spaceId, left, "OWNER", "LEFT");
    problem(
        write(post(invitations(fx.spaceId)), login(left, null), "{\"email\":\"a@example.com\"}"),
        403,
        "NOT_A_MEMBER");

    Issued byAdmin =
        issued(
            json.readTree(
                ok(
                    write(
                        post(invitations(fx.spaceId)),
                        admin,
                        "{\"email\":\"a@example.com\",\"role\":\"MEMBER\"}"))));
    problem(
        write(
            post(invitations(fx.spaceId)),
            admin,
            "{\"email\":\"b@example.com\",\"role\":\"ADMIN\"}"),
        403,
        "FORBIDDEN");
    Issued adminInvite =
        issued(
            json.readTree(
                ok(
                    write(
                        post(invitations(fx.spaceId)),
                        owner,
                        "{\"email\":\"b@example.com\",\"role\":\"ADMIN\"}"))));
    problem(
        write(post(one(fx.spaceId, adminInvite.id) + "/resend"), admin, null), 403, "FORBIDDEN");
    problem(write(delete(one(fx.spaceId, adminInvite.id)), admin, null), 403, "FORBIDDEN");
    assertThat(state(adminInvite.id)).isEqualTo("PENDING");
    ok(write(delete(one(fx.spaceId, byAdmin.id)), admin, null));
    assertThat(state(byAdmin.id)).isEqualTo("REVOKED");

    for (String bad :
        List.of(
            "{\"email\":\"c@example.com\",\"role\":\"OWNER\"}",
            "{\"email\":\"c@example.com\",\"role\":\"member\"}",
            "{\"email\":\"c@example.com\",\"role\":1}")) {
      problem(write(post(invitations(fx.spaceId)), owner, bad), 400, "VALIDATION_FAILED")
          .andExpect(jsonPath("$.errors[0].field").value("role"));
    }
    for (String bad : List.of("{}", "{\"email\":\"no-at\"}", "{\"email\":\"a b@example.com\"}")) {
      problem(write(post(invitations(fx.spaceId)), owner, bad), 400, "VALIDATION_FAILED")
          .andExpect(jsonPath("$.errors[0].field").value("email"));
    }
    // Access is judged before fields: a member sending OWNER still gets FORBIDDEN.
    problem(
        write(
            post(invitations(fx.spaceId)),
            member,
            "{\"email\":\"c@example.com\",\"role\":\"OWNER\"}"),
        403,
        "FORBIDDEN");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM space_invitations WHERE space_id = ? AND role = 'OWNER'",
                Integer.class,
                fx.spaceId))
        .isZero();
  }

  @Test
  void acceptedMemberCreatesAnEventAndBecomesItsOwner() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    Issued invite = invite(owner, fx.spaceId, "Staff@Example.com", null);

    // An event-only collaborator (DEC-039) keeps their event row when they join the space.
    UUID invitee = user("Joiner");
    UUID otherEvent = UUID.randomUUID();
    event(fx.spaceId, otherEvent, "kept event");
    operator(fx.spaceId, otherEvent, fx.ownerId, "OWNER");
    operator(fx.spaceId, otherEvent, invitee, "STAFF");
    Cookie session = login(invitee, " STAFF@example.com ");

    String preview = ok(preview(session, invite.token, "10.62.0.1"));
    JsonNode tree = json.readTree(preview);
    assertThat(tree.propertyNames())
        .containsExactlyInAnyOrder("spaceName", "role", "inviterName", "expiresAt", "outcome");
    assertThat(tree.get("spaceName").asString()).isEqualTo("space");
    assertThat(tree.get("role").asString()).isEqualTo("MEMBER");
    assertThat(tree.get("inviterName").asString()).isEqualTo("Owner Kim");
    assertThat(tree.get("outcome").asString()).isEqualTo("PENDING");
    assertThat(preview).doesNotContain(invite.token).doesNotContain("staff@example.com");
    assertThat(state(invite.id)).isEqualTo("PENDING");
    assertThat(membership(fx.spaceId, invitee)).isNull();

    String accepted = ok(accept(session, invite.token, "10.62.0.1"));
    JsonNode acceptance = json.readTree(accepted);
    assertThat(acceptance.propertyNames()).containsExactlyInAnyOrder("outcome", "spaceId");
    assertThat(acceptance.get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(acceptance.get("spaceId").asString()).isEqualTo(fx.spaceId.toString());
    assertThat(membership(fx.spaceId, invitee)).isEqualTo("ACTIVE:MEMBER");
    assertThat(state(invite.id)).isEqualTo("ACCEPTED");
    assertThat(
            jdbc.queryForObject(
                "SELECT accepted_user_id FROM space_invitations WHERE id = ?",
                UUID.class,
                invite.id))
        .isEqualTo(invitee);
    assertThat(eventRole(otherEvent, invitee)).isEqualTo("STAFF");

    assertThat(
            json.readTree(ok(accept(session, invite.token, "10.62.0.1"))).get("outcome").asString())
        .isEqualTo("ALREADY_ACCEPTED");
    assertThat(
            json.readTree(ok(preview(session, invite.token, "10.62.0.1")))
                .get("outcome")
                .asString())
        .isEqualTo("ALREADY_ACCEPTED");
    UUID sameAddress = user("Same address");
    problem(
        accept(login(sameAddress, "staff@example.com"), invite.token, "10.62.0.2"),
        409,
        "INVITATION_ALREADY_ACCEPTED");

    String audit = auditText(fx.spaceId);
    assertThat(audit).contains("\"outcome\": \"ACCEPTED\"").contains("\"membership\": \"CREATED\"");
    assertThat(audit).doesNotContain(invite.token).doesNotContain("staff@example.com");

    MvcResult created =
        write(
                post("/api/v1/operator/spaces/" + fx.spaceId + "/events"),
                session,
                "{\"name\":\"January retreat\"}")
            .andExpect(status().isCreated())
            .andReturn();
    UUID eventId =
        UUID.fromString(
            json.readTree(created.getResponse().getContentAsString()).get("eventId").asString());
    assertThat(eventRole(eventId, invitee)).isEqualTo("OWNER");
    mvc.perform(get("/api/v1/operator/events/" + eventId).cookie(session))
        .andExpect(status().isOk());
    assertLogsOmit(invite.token, "staff@example.com");
  }

  @Test
  void acceptRefusalsFollowTheEventInvitationOrder() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    Issued invite = invite(owner, fx.spaceId, "target@example.com", null);
    UUID invitee = user("Target");

    problem(accept(login(invitee, null), invite.token, "10.63.0.1"), 403, "EMAIL_NOT_VERIFIED");
    problem(
        accept(login(invitee, "other@example.com"), invite.token, "10.63.0.2"),
        403,
        "INVITATION_EMAIL_MISMATCH");
    problem(
        preview(login(invitee, "other@example.com"), invite.token, "10.63.0.3"),
        403,
        "INVITATION_EMAIL_MISMATCH");
    Cookie session = login(invitee, "target@example.com");
    attempts.clear();
    problem(accept(session, "s.unknown", "10.63.0.4"), 404, "INVITATION_NOT_FOUND");
    problem(accept(session, "", "10.63.0.4"), 404, "INVITATION_NOT_FOUND");
    // A space token without its marker is not looked up as a space token.
    problem(
        accept(session, invite.token.substring(SPACE_MARKER.length()), "10.63.0.5"),
        404,
        "INVITATION_NOT_FOUND");
    // The event endpoints do not know space tokens; the screen routes by the marker.
    problem(
        postJson(
            "/api/v1/operator/invitations/accept", session, tokenBody(invite.token), "10.63.0.6"),
        404,
        "INVITATION_NOT_FOUND");

    attempts.clear();
    jdbc.update(
        "UPDATE space_invitations SET expires_at = now() - interval '1 second' WHERE id = ?",
        invite.id);
    problem(preview(session, invite.token, "10.63.0.7"), 410, "INVITATION_EXPIRED");
    problem(accept(session, invite.token, "10.63.0.7"), 410, "INVITATION_EXPIRED");
    // Mismatch hides the expiry, like event invitations.
    problem(
        accept(login(invitee, "other@example.com"), invite.token, "10.63.0.8"),
        403,
        "INVITATION_EMAIL_MISMATCH");
    assertThat(state(invite.id)).isEqualTo("PENDING");
    assertThat(membership(fx.spaceId, invitee)).isNull();
  }

  @Test
  void leftMemberIsReactivatedWithTheInvitedRole() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    UUID returning = user("Returning");
    member(fx.spaceId, returning, "MEMBER", "LEFT");
    Issued invite = invite(owner, fx.spaceId, "back@example.com", "ADMIN");
    Cookie session = login(returning, "back@example.com");

    assertThat(
            json.readTree(ok(preview(session, invite.token, "10.64.0.1")))
                .get("outcome")
                .asString())
        .isEqualTo("PENDING");
    assertThat(
            json.readTree(ok(accept(session, invite.token, "10.64.0.1"))).get("outcome").asString())
        .isEqualTo("ACCEPTED");
    assertThat(membership(fx.spaceId, returning)).isEqualTo("ACTIVE:ADMIN");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM members WHERE space_id = ? AND user_id = ?",
                Integer.class,
                fx.spaceId,
                returning))
        .isEqualTo(1);
    assertThat(auditText(fx.spaceId)).contains("\"membership\": \"REACTIVATED\"");
    mvc.perform(get("/api/v1/operator/spaces/" + fx.spaceId).cookie(session))
        .andExpect(status().isOk());
  }

  @Test
  void activeMemberGetsAlreadyMemberAndKeepsTheirRole() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    Issued invite = invite(owner, fx.spaceId, "member@example.com", "ADMIN");
    Cookie session = login(fx.memberId, "member@example.com");

    assertThat(
            json.readTree(ok(preview(session, invite.token, "10.65.0.1")))
                .get("outcome")
                .asString())
        .isEqualTo("ALREADY_MEMBER");
    assertThat(state(invite.id)).isEqualTo("PENDING");
    JsonNode accepted = json.readTree(ok(accept(session, invite.token, "10.65.0.1")));
    assertThat(accepted.get("outcome").asString()).isEqualTo("ALREADY_MEMBER");
    assertThat(membership(fx.spaceId, fx.memberId)).isEqualTo("ACTIVE:MEMBER");
    assertThat(state(invite.id)).isEqualTo("ACCEPTED");
    assertThat(auditText(fx.spaceId))
        .contains("\"outcome\": \"ALREADY_MEMBER\"")
        .contains("\"membership\": \"UNCHANGED\"");
    assertThat(
            json.readTree(ok(accept(session, invite.token, "10.65.0.1"))).get("outcome").asString())
        .isEqualTo("ALREADY_ACCEPTED");
  }

  @Test
  void memberListShowsEmailOnlyToOwnerAndAdmin() throws Exception {
    Fixture fx = seed();
    google(fx.ownerId, "owner@example.com");
    google(fx.memberId, "member@example.com");
    UUID left = user("Gone");
    member(fx.spaceId, left, "MEMBER", "LEFT");

    for (UUID viewer : List.of(fx.ownerId, fx.adminId)) {
      String body = ok(mvc.perform(get(members(fx.spaceId)).cookie(login(viewer, null))));
      JsonNode items = json.readTree(body).get("items");
      assertThat(items).hasSize(3);
      assertThat(items.get(0).get("role").asString()).isEqualTo("OWNER");
      assertThat(items.get(1).get("role").asString()).isEqualTo("ADMIN");
      assertThat(items.get(2).get("role").asString()).isEqualTo("MEMBER");
      assertThat(items.get(0).get("email").asString()).isEqualTo("owner@example.com");
      assertThat(items.get(2).get("email").asString()).isEqualTo("member@example.com");
      assertThat(items.get(1).has("email")).isFalse();
      assertThat(body).doesNotContain("Gone");
      assertThat(json.readTree(body).get("page").get("totalItems").asLong()).isEqualTo(3);
    }

    String asMember = ok(mvc.perform(get(members(fx.spaceId)).cookie(login(fx.memberId, null))));
    JsonNode items = json.readTree(asMember).get("items");
    assertThat(items).hasSize(3);
    for (JsonNode item : items) {
      assertThat(item.propertyNames()).containsExactlyInAnyOrder("userId", "displayName", "role");
    }
    assertThat(asMember).doesNotContain("@example.com");

    problem(
        mvc.perform(get(members(fx.spaceId)).cookie(login(user("Stranger"), null))),
        404,
        "RESOURCE_NOT_FOUND");
    problem(mvc.perform(get(members(fx.spaceId)).cookie(login(left, null))), 403, "NOT_A_MEMBER");
  }

  @Test
  void previewAndAcceptShareTheEventInvitationAttemptLimit() throws Exception {
    Fixture fx = seed();
    Issued invite = invite(login(fx.ownerId, null), fx.spaceId, "limit@example.com", null);
    Cookie session = login(user("Limited"), "limit@example.com");
    String address = "10.66.0.1";
    for (int i = 0; i < 3; i++) {
      ok(preview(session, invite.token, address));
    }
    problem(
        postJson("/api/v1/operator/invitations/preview", session, tokenBody("nope"), address),
        404,
        "INVITATION_NOT_FOUND");
    ok(preview(session, invite.token, address));
    problem(accept(session, invite.token, address), 429, "RATE_LIMITED");
    assertThat(state(invite.id)).isEqualTo("PENDING");
  }

  // --- helpers ---

  private Issued invite(Cookie owner, UUID spaceId, String email, String role) throws Exception {
    String content =
        role == null
            ? "{\"email\":\"" + email + "\"}"
            : "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}";
    return issued(json.readTree(ok(write(post(invitations(spaceId)), owner, content))));
  }

  private Issued issued(JsonNode body) {
    String link = body.get("link").asString();
    assertThat(link).startsWith(LINK_PREFIX + SPACE_MARKER).doesNotContain("?");
    String token = link.substring(LINK_PREFIX.length());
    assertThat(token.length()).isGreaterThan(SPACE_MARKER.length() + 40);
    return new Issued(UUID.fromString(body.get("id").asString()), token);
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
    Cookie cookie = result.getResponse().getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private ResultActions write(MockHttpServletRequestBuilder request, Cookie session, String body)
      throws Exception {
    request.cookie(session, csrf()).header(CSRF_HEADER, CSRF);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(body);
    }
    return mvc.perform(request);
  }

  private ResultActions preview(Cookie session, String token, String address) throws Exception {
    return postJson(PREVIEW, session, tokenBody(token), address);
  }

  private ResultActions accept(Cookie session, String token, String address) throws Exception {
    return postJson(ACCEPT, session, tokenBody(token), address);
  }

  private ResultActions postJson(String path, Cookie session, String body, String address)
      throws Exception {
    MockHttpServletRequestBuilder request =
        post(path).contentType(MediaType.APPLICATION_JSON).content(body).header(CSRF_HEADER, CSRF);
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
    return mvc.perform(request);
  }

  private static String tokenBody(String token) {
    return "{\"token\":\"" + token + "\"}";
  }

  private String ok(ResultActions actions) throws Exception {
    return actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  }

  private ResultActions problem(ResultActions actions, int httpStatus, String code)
      throws Exception {
    return actions
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code));
  }

  private void assertLogsOmit(String... secrets) {
    for (ILoggingEvent event : logs.list) {
      for (String secret : secrets) {
        assertThat(event.getFormattedMessage()).doesNotContain(secret);
      }
    }
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private static String invitations(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/invitations";
  }

  private static String one(UUID spaceId, UUID id) {
    return invitations(spaceId) + "/" + id;
  }

  private static String members(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/members";
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

  private Fixture seed() {
    Fixture fx =
        new Fixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    user(fx.ownerId, "Owner Kim");
    user(fx.adminId, "Admin Lee");
    user(fx.memberId, "Member Park");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "OWNER", "ACTIVE");
    member(fx.spaceId, fx.adminId, "ADMIN", "ACTIVE");
    member(fx.spaceId, fx.memberId, "MEMBER", "ACTIVE");
    return fx;
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    user(id, name);
    return id;
  }

  private void user(UUID id, String name) {
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
  }

  private void google(UUID userId, String email) {
    jdbc.update(
        """
        INSERT INTO user_google_identities (subject, user_id, email, created_at, last_signed_in_at)
        VALUES (?, ?, ?, now(), now())
        """,
        "sub-" + userId,
        userId,
        email);
  }

  private void member(UUID spaceId, UUID userId, String role, String status) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role, status) VALUES (?, ?, ?, ?)",
        spaceId,
        userId,
        role,
        status);
  }

  private void event(UUID spaceId, UUID eventId, String name) {
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, 'ACTIVE', 0)
        """,
        eventId,
        spaceId,
        name);
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private String state(UUID id) {
    return jdbc.queryForObject(
        "SELECT status FROM space_invitations WHERE id = ?", String.class, id);
  }

  private String email(UUID id) {
    return jdbc.queryForObject(
        "SELECT email_normalized FROM space_invitations WHERE id = ?", String.class, id);
  }

  private String tokenHash(UUID id) {
    return jdbc.queryForObject(
        "SELECT token_hash FROM space_invitations WHERE id = ?", String.class, id);
  }

  private int pendingCount(UUID spaceId, String email) {
    return jdbc.queryForObject(
        """
        SELECT count(*) FROM space_invitations
        WHERE space_id = ? AND email_normalized = ? AND status = 'PENDING'
        """,
        Integer.class,
        spaceId,
        email);
  }

  private String membership(UUID spaceId, UUID userId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT status, role FROM members WHERE space_id = ? AND user_id = ?", spaceId, userId);
    return rows.isEmpty() ? null : rows.get(0).get("status") + ":" + rows.get(0).get("role");
  }

  private String eventRole(UUID eventId, UUID userId) {
    List<String> roles =
        jdbc.query(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            (rs, row) -> rs.getString(1),
            eventId,
            userId);
    return roles.isEmpty() ? null : roles.get(0);
  }

  private String auditText(UUID spaceId) {
    return jdbc.queryForObject(
        "SELECT coalesce(string_agg(detail::text, ''), '') FROM audit_logs WHERE space_id = ?",
        String.class,
        spaceId);
  }

  private static Logger rootLogger() {
    return (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
  }

  private record Fixture(UUID spaceId, UUID ownerId, UUID adminId, UUID memberId) {}

  private record Issued(UUID id, String token) {}
}
