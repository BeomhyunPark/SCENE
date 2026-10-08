package app.scene.event.lifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.audit.AuditActions;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.invitation.CapturingInvitationMailer;
import app.scene.event.invitation.InvitationMail;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
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

/**
 * DEC-063 lifecycle HTTP. Rows 10 and 12–16 stay out: application submit, owner transfer, and
 * leave. Name patch is covered by {@code EventCommandHttpIT}, not this class.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class EventLifecycleHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CapturingInvitationMailer mailer;

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

  /** Rows 1 and the read shape. A draft with no history omits lastTransition. */
  @Test
  void ownerActivatesDraftAndReadsLifecycle() throws Exception {
    Fixture fx = seed("DRAFT");
    Cookie owner = login(fx.ownerId);
    String before = ok(get(lifecycle(fx.eventId)).cookie(owner));
    JsonNode draft = json.readTree(before);
    assertThat(draft.propertyNames()).containsExactly("lifecycleStatus", "lifecycleVersion");
    assertThat(draft.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
    assertThat(draft.get("lifecycleVersion").asInt()).isZero();
    assertThat(before).doesNotContain("email", "token", "session");

    String activated = ok(command(owner, fx.eventId, "activate", version(0), "req-activate"));
    JsonNode body = json.readTree(activated);
    assertThat(body.propertyNames())
        .containsExactly("outcome", "lifecycleStatus", "lifecycleVersion", "actedAs");
    assertThat(body.get("outcome").asString()).isEqualTo("TRANSITIONED");
    assertThat(body.get("lifecycleStatus").asString()).isEqualTo("ACTIVE");
    assertThat(body.get("lifecycleVersion").asInt()).isEqualTo(1);
    assertThat(body.get("actedAs").asString()).isEqualTo("EVENT_OWNER");
    assertThat(activated).doesNotContain("email", "token", "session");
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(versionOf(fx)).isEqualTo(1);
    assertThat(transitionCount(fx)).isEqualTo(1);
    assertThat(auditCount(fx, AuditActions.EVENT_ACTIVATE)).isEqualTo(1);

    String after = ok(get(lifecycle(fx.eventId)).cookie(owner));
    JsonNode current = json.readTree(after);
    assertThat(current.get("lifecycleStatus").asString()).isEqualTo("ACTIVE");
    assertThat(current.get("lifecycleVersion").asInt()).isEqualTo(1);
    assertThat(current.get("lastTransition").propertyNames())
        .containsExactly("command", "fromStatus", "toStatus", "actedAs", "occurredAt");
    assertThat(current.get("lastTransition").get("command").asString()).isEqualTo("ACTIVATE");
    assertThat(current.get("lastTransition").has("reason")).isFalse();
    assertThat(after).doesNotContain("email", "token", "session");

    String listed =
        ok(
            get(transitions(fx.eventId))
                .cookie(login(fx.staffId))
                .header("X-Request-Id", "req-list"));
    JsonNode page = json.readTree(listed);
    assertThat(page.propertyNames()).containsExactly("items", "page");
    assertThat(page.get("page").get("number").asInt()).isZero();
    assertThat(page.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(page.get("page").get("totalItems").asInt()).isEqualTo(1);
    assertThat(page.get("items").get(0).get("command").asString()).isEqualTo("ACTIVATE");
    assertThat(page.get("items").get(0).get("warnings").get("openTasks").asInt()).isZero();
    assertThat(listed).doesNotContain("email", "token", "session");

    problem(
        get(transitions(fx.eventId) + "?size=101").cookie(owner).header("X-Request-Id", "req-page"),
        400,
        "PAGE_SIZE_EXCEEDED",
        "req-page");
  }

  /** Rows 2. A missing body is still 403 for a manager, and a stranger is 404. */
  @Test
  void managerEndIsForbiddenAndAccessStopsEarly() throws Exception {
    Fixture fx = seed("ACTIVE");
    problem(
        command(login(fx.managerId), fx.eventId, "end", version(0), "req-manager"),
        403,
        "FORBIDDEN",
        "req-manager");
    problem(
        command(login(fx.managerId), fx.eventId, "end", "{}", "req-manager-empty"),
        403,
        "FORBIDDEN",
        "req-manager-empty");
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(transitionCount(fx)).isZero();
    assertThat(auditCount(fx, AuditActions.EVENT_END)).isZero();

    UUID adminId = user("Space Admin");
    member(fx.spaceId, adminId, "ADMIN");
    problem(
        command(login(adminId), fx.eventId, "end", version(0), "req-admin"),
        403,
        "FORBIDDEN",
        "req-admin");

    UUID strangerId = user("Stranger");
    problem(
        command(login(strangerId), fx.eventId, "end", version(0), "req-stranger"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-stranger");
    problem(
        post(commandPath(fx.eventId, "end"))
            .cookie(csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", "req-anon")
            .contentType(MediaType.APPLICATION_JSON)
            .content(version(0)),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-anon");

    problem(
        command(login(fx.ownerId), fx.eventId, "end", "{}", "req-missing-version"),
        400,
        "VALIDATION_FAILED",
        "req-missing-version");
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(transitionCount(fx)).isZero();

    mvc.perform(
            delete(operators(fx.eventId) + "/" + fx.staffId)
                .cookie(login(fx.ownerId), csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    problem(
        get(lifecycle(fx.eventId)).cookie(login(fx.staffId)).header("X-Request-Id", "req-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-revoked");
  }

  /** Rows 3, 4, and 18. Notices go to each event owner. Mail is not sent. */
  @Test
  void spaceOwnerEndRequiresAReasonThenNotifiesOwners() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID secondOwner = user("Second Owner");
    member(fx.spaceId, secondOwner, "MEMBER");
    operator(fx, secondOwner, "OWNER");
    Cookie spaceOwner = login(fx.spaceOwnerId);
    int mailBefore = mailer.sent().size();

    problem(
        command(spaceOwner, fx.eventId, "end", version(0), "req-override"),
        403,
        "OVERRIDE_REQUIRED",
        "req-override");
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(noticeCount(fx)).isZero();

    String ended =
        ok(
            command(
                spaceOwner,
                fx.eventId,
                "end",
                "{\"expectedLifecycleVersion\":0,\"override\":{\"reason\":\"연락 두절\"}}",
                "req-end"));
    JsonNode body = json.readTree(ended);
    assertThat(body.get("outcome").asString()).isEqualTo("TRANSITIONED");
    assertThat(body.get("lifecycleStatus").asString()).isEqualTo("ENDED");
    assertThat(body.get("actedAs").asString()).isEqualTo("SPACE_OWNER_OVERRIDE");
    assertThat(noticeCount(fx)).isEqualTo(2);
    assertThat(noticeRecipients(fx)).containsExactlyInAnyOrder(fx.ownerId, secondOwner);
    assertThat(auditDetail(fx, AuditActions.EVENT_END))
        .contains("SPACE_OWNER_OVERRIDE")
        .contains("연락 두절");
    assertThat(auditActor(fx, AuditActions.EVENT_END)).isEqualTo(fx.spaceOwnerId);
    assertThat(mailer.sent()).hasSize(mailBefore);
    assertThat(ended).doesNotContain("email", "token", "session");

    Fixture draft = seed("DRAFT");
    String activated =
        ok(
            command(
                login(draft.spaceOwnerId),
                draft.eventId,
                "activate",
                "{\"expectedLifecycleVersion\":0,\"override\":{\"reason\":\"준비를 마쳤다\"}}",
                "req-activate-override"));
    assertThat(json.readTree(activated).get("actedAs").asString())
        .isEqualTo("SPACE_OWNER_OVERRIDE");
    assertThat(auditDetail(draft, AuditActions.EVENT_ACTIVATE))
        .contains("SPACE_OWNER_OVERRIDE")
        .contains("준비를 마쳤다");
  }

  /** Row 5. Archive is not an override, and unarchive returns to ENDED. */
  @Test
  void spaceOwnerArchivesAndUnarchivesWithoutAReason() throws Exception {
    Fixture fx = seed("ENDED");
    Cookie spaceOwner = login(fx.spaceOwnerId);
    String archived = ok(command(spaceOwner, fx.eventId, "archive", version(0), "req-archive"));
    JsonNode body = json.readTree(archived);
    assertThat(body.get("outcome").asString()).isEqualTo("TRANSITIONED");
    assertThat(body.get("lifecycleStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(body.get("actedAs").asString()).isEqualTo("SPACE_OWNER");
    assertThat(noticeCount(fx)).isZero();
    assertThat(auditDetail(fx, AuditActions.EVENT_ARCHIVE)).contains("SPACE_OWNER");
    assertThat(auditDetail(fx, AuditActions.EVENT_ARCHIVE)).doesNotContain("overrideReason");

    String restored = ok(command(spaceOwner, fx.eventId, "unarchive", version(1), "req-unarchive"));
    assertThat(json.readTree(restored).get("lifecycleStatus").asString()).isEqualTo("ENDED");
    assertThat(json.readTree(restored).get("actedAs").asString()).isEqualTo("SPACE_OWNER");
    assertThat(statusOf(fx)).isEqualTo("ENDED");
  }

  /** Rows 6 and 7. End does not complete the task, and the snapshot keeps the count. */
  @Test
  void openTasksNeedAcknowledgementAndStayOpen() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "TODO");
    Cookie owner = login(fx.ownerId);

    String problemBody =
        problemBody(
            command(owner, fx.eventId, "end", version(0), "req-confirm"),
            409,
            "CONFIRMATION_REQUIRED",
            "req-confirm");
    assertThat(json.readTree(problemBody).get("warnings").get("openTasks").asInt()).isEqualTo(1);
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(transitionCount(fx)).isZero();
    assertThat(auditCount(fx, AuditActions.EVENT_END)).isZero();

    String ended =
        ok(
            command(
                owner,
                fx.eventId,
                "end",
                "{\"expectedLifecycleVersion\":0,\"acknowledgeWarnings\":true}",
                "req-acked"));
    assertThat(json.readTree(ended).get("lifecycleStatus").asString()).isEqualTo("ENDED");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(snapshot(fx)).contains("\"openTasks\": 1");
    assertThat(versionOf(fx)).isEqualTo(1);
  }

  /** Row 8. The later owner is already in the target state, so the version is not a conflict. */
  @Test
  void secondOwnerEndIsAlreadyInState() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID secondOwner = user("Second Owner");
    member(fx.spaceId, secondOwner, "MEMBER");
    operator(fx, secondOwner, "OWNER");

    String first = ok(command(login(fx.ownerId), fx.eventId, "end", version(0), "req-first"));
    assertThat(json.readTree(first).get("outcome").asString()).isEqualTo("TRANSITIONED");
    String second = ok(command(login(secondOwner), fx.eventId, "end", version(0), "req-second"));
    JsonNode again = json.readTree(second);
    assertThat(again.get("outcome").asString()).isEqualTo("ALREADY_IN_STATE");
    assertThat(again.get("lifecycleStatus").asString()).isEqualTo("ENDED");
    assertThat(again.get("lifecycleVersion").asInt()).isEqualTo(1);
    assertThat(transitionCount(fx)).isEqualTo(1);
    assertThat(auditCount(fx, AuditActions.EVENT_END)).isEqualTo(1);
  }

  /** Row 9. */
  @Test
  void activeArchiveAndArchivedReopenAreRejected() throws Exception {
    Fixture active = seed("ACTIVE");
    problem(
        command(login(active.ownerId), active.eventId, "archive", version(0), "req-archive"),
        409,
        "INVALID_STATE_TRANSITION",
        "req-archive");
    assertThat(statusOf(active)).isEqualTo("ACTIVE");
    assertThat(transitionCount(active)).isZero();
    assertThat(auditRows(active)).isZero();

    Fixture archived = seed("ARCHIVED");
    problem(
        command(
            login(archived.ownerId),
            archived.eventId,
            "reopen",
            "{\"expectedLifecycleVersion\":0,\"reason\":\"잘못\"}",
            "req-reopen"),
        409,
        "INVALID_STATE_TRANSITION",
        "req-reopen");
    assertThat(statusOf(archived)).isEqualTo("ARCHIVED");
    assertThat(transitionCount(archived)).isZero();
    assertThat(auditRows(archived)).isZero();
  }

  /** Row 11. The old link is revoked inside the archive command. */
  @Test
  void archiveRevokesPendingInvitations() throws Exception {
    Fixture fx = seed("ENDED");
    Cookie owner = login(fx.ownerId);
    Issued invite = invite(owner, fx.eventId, "ada@example.com");
    UUID invitee = user("Ada");
    Cookie inviteeSession = login(invitee, "ada@example.com");

    ok(command(owner, fx.eventId, "archive", version(0), "req-archive"));
    assertThat(invitationStatus(invite.id())).isEqualTo("REVOKED");
    String body =
        problemBody(
            mvc.perform(
                post("/api/v1/operator/invitations/accept")
                    .cookie(inviteeSession, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .header("X-Request-Id", "req-accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"token\":\"" + invite.token() + "\"}")
                    .with(
                        request -> {
                          request.setRemoteAddr("10.9.1.1");
                          return request;
                        })),
            410,
            "INVITATION_REVOKED",
            "req-accept");
    assertThat(body).doesNotContain(invite.token()).doesNotContain("ada@example.com");
    assertThat(eventRole(fx.eventId, invitee)).isNull();
  }

  /** A stale version that is not already in the target state returns the current transition. */
  @Test
  void staleVersionReturnsTheCurrentLifecycle() throws Exception {
    Fixture fx = seed("DRAFT");
    Cookie owner = login(fx.ownerId);
    ok(command(owner, fx.eventId, "activate", version(0), "req-activate"));
    String body =
        problemBody(
            command(owner, fx.eventId, "end", version(0), "req-stale"),
            409,
            "CONCURRENT_MODIFICATION",
            "req-stale");
    JsonNode problem = json.readTree(body);
    assertThat(problem.get("lifecycleVersion").asInt()).isEqualTo(1);
    assertThat(problem.get("lastTransition").propertyNames())
        .containsExactlyInAnyOrder("command", "fromStatus", "toStatus", "actedAs", "occurredAt");
    assertThat(problem.get("lastTransition").get("command").asString()).isEqualTo("ACTIVATE");
    assertThat(problem.get("lastTransition").has("reason")).isFalse();
    assertThat(problem.get("lastTransition").has("overrideReason")).isFalse();
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(transitionCount(fx)).isEqualTo(1);
  }

  /** Row 17. The reopen reason and the override reason stay on different rows. */
  @Test
  void spaceOwnerReopenKeepsBothReasons() throws Exception {
    Fixture fx = seed("ENDED");
    String reopened =
        ok(
            command(
                login(fx.spaceOwnerId),
                fx.eventId,
                "reopen",
                """
                {"expectedLifecycleVersion":0,"reason":"일정을 다시 연다","override":{"reason":"소유자가 연락되지 않음"}}
                """,
                "req-reopen"));
    JsonNode body = json.readTree(reopened);
    assertThat(body.get("outcome").asString()).isEqualTo("TRANSITIONED");
    assertThat(body.get("actedAs").asString()).isEqualTo("SPACE_OWNER_OVERRIDE");
    assertThat(body.get("lifecycleStatus").asString()).isEqualTo("ACTIVE");
    assertThat(transitionReason(fx, "REOPEN")).isEqualTo("일정을 다시 연다");
    assertThat(auditDetail(fx, AuditActions.EVENT_REOPEN))
        .contains("SPACE_OWNER_OVERRIDE")
        .contains("소유자가 연락되지 않음");
    assertThat(noticeCount(fx)).isEqualTo(1);
  }

  /** Row 19. Length is judged on every command, before any status write. */
  @Test
  void oversizedOverrideReasonWritesNothing() throws Exception {
    Fixture fx = seed("ACTIVE");
    String tooLong = "x".repeat(501);
    String body =
        "{\"expectedLifecycleVersion\":0,\"acknowledgeWarnings\":true,\"reason\":\"재개 사유\",\"override\":{\"reason\":\""
            + tooLong
            + "\"}}";
    Cookie owner = login(fx.ownerId);
    Cookie spaceOwner = login(fx.spaceOwnerId);
    for (String action : new String[] {"activate", "end", "reopen", "archive", "unarchive"}) {
      problem(
          command(owner, fx.eventId, action, body, "req-owner-" + action),
          400,
          "VALIDATION_FAILED",
          "req-owner-" + action);
      problem(
          command(spaceOwner, fx.eventId, action, body, "req-space-" + action),
          400,
          "VALIDATION_FAILED",
          "req-space-" + action);
    }
    assertThat(statusOf(fx)).isEqualTo("ACTIVE");
    assertThat(versionOf(fx)).isZero();
    assertThat(transitionCount(fx)).isZero();
    assertThat(auditRows(fx)).isZero();
    assertThat(noticeCount(fx)).isZero();
  }

  private ResultActions command(
      Cookie session, UUID eventId, String action, String body, String requestId) throws Exception {
    return mvc.perform(
        post(commandPath(eventId, action))
            .cookie(session, csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", requestId)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
  }

  private void problem(
      MockHttpServletRequestBuilder request, int httpStatus, String code, String requestId)
      throws Exception {
    problemBody(mvc.perform(request), httpStatus, code, requestId);
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

  private String ok(ResultActions actions) throws Exception {
    return actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return ok(mvc.perform(request));
  }

  private Cookie login(UUID userId) throws Exception {
    return login(userId, null);
  }

  private Cookie login(UUID userId, String email) throws Exception {
    String content =
        email == null
            ? "{\"userId\":\"" + userId + "\"}"
            : "{\"userId\":\"" + userId + "\",\"email\":\"" + email + "\"}";
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(content))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private Issued invite(Cookie owner, UUID eventId, String email) throws Exception {
    String body =
        mvc.perform(
                post("/api/v1/operator/events/" + eventId + "/invitations")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"" + email + "\",\"role\":\"STAFF\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    InvitationMail mail = mailer.sent().get(mailer.sent().size() - 1);
    String link = mail.fragmentLink();
    assertThat(link).startsWith(LINK_PREFIX);
    String token = link.substring(LINK_PREFIX.length());
    return new Issued(UUID.fromString(json.readTree(body).get("id").asString()), token);
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private static String version(int version) {
    return "{\"expectedLifecycleVersion\":" + version + "}";
  }

  private static String lifecycle(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/lifecycle";
  }

  private static String transitions(UUID eventId) {
    return lifecycle(eventId) + "/transitions";
  }

  private static String commandPath(UUID eventId, String action) {
    return "/api/v1/operator/events/" + eventId + "/" + action;
  }

  private static String operators(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "Owner");
    user(fx.managerId, "Manager");
    user(fx.staffId, "Staff");
    user(fx.spaceOwnerId, "Space Owner");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "OWNER");
    member(fx.spaceId, fx.spaceOwnerId, "OWNER");
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

  private UUID task(Fixture fx, String status) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', ?, ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        status,
        fx.staffId);
    return taskId;
  }

  private String statusOf(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?", String.class, fx.eventId);
  }

  private int versionOf(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT lifecycle_version FROM events WHERE id = ?", Integer.class, fx.eventId);
  }

  private int transitionCount(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_lifecycle_transitions WHERE event_id = ?",
        Integer.class,
        fx.eventId);
  }

  private int auditRows(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, fx.eventId);
  }

  private int auditCount(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        fx.eventId,
        action);
  }

  private String auditDetail(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        String.class,
        fx.eventId,
        action);
  }

  private UUID auditActor(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT actor_user_id FROM audit_logs WHERE event_id = ? AND action = ?",
        UUID.class,
        fx.eventId,
        action);
  }

  private int noticeCount(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM operator_notices WHERE event_id = ?", Integer.class, fx.eventId);
  }

  private java.util.List<UUID> noticeRecipients(Fixture fx) {
    return jdbc.query(
        "SELECT recipient_user_id FROM operator_notices WHERE event_id = ?",
        (rs, row) -> rs.getObject(1, UUID.class),
        fx.eventId);
  }

  private String snapshot(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT warnings_snapshot::text FROM event_lifecycle_transitions WHERE event_id = ?",
        String.class,
        fx.eventId);
  }

  private String transitionReason(Fixture fx, String command) {
    return jdbc.queryForObject(
        """
        SELECT reason FROM event_lifecycle_transitions
        WHERE event_id = ? AND command = ?
        """,
        String.class,
        fx.eventId,
        command);
  }

  private String taskStatus(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private String invitationStatus(UUID invitationId) {
    return jdbc.queryForObject(
        "SELECT status FROM event_invitations WHERE id = ?", String.class, invitationId);
  }

  private String eventRole(UUID eventId, UUID userId) {
    return jdbc
        .query(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            (rs, row) -> rs.getString(1),
            eventId,
            userId)
        .stream()
        .findFirst()
        .orElse(null);
  }

  private record Fixture(
      UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId, UUID spaceOwnerId) {
    static Fixture create() {
      return new Fixture(
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID());
    }
  }

  private record Issued(UUID id, String token) {}
}
