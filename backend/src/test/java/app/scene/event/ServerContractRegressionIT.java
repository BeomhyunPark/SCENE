package app.scene.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.audit.AuditActions;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.invitation.CapturingInvitationMailer;
import app.scene.event.invitation.InvitationMail;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.event.task.TaskProgressService;
import app.scene.event.transfer.OwnerTransferService;
import app.scene.space.MembershipLeaveService;
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
 * INV-05 server rows. DEC-060 rows 1, 4–12, and 15 are named on {@code EventInvitationAcceptIT}.
 * This class covers the #39 HTTP rows those tests did not call, plus the service rows that have no
 * separate screen.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ServerContractRegressionIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CapturingInvitationMailer mailer;
  @Autowired TaskProgressService tasks;
  @Autowired MembershipLeaveService leave;
  @Autowired OwnerTransferService transfers;

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

  /** #39 rows 2, 8, 11, 12, and 13. */
  @Test
  void managerCannotPutAndRoleChangeClearsOverrides() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie manager = login(fx.managerId);
    putOk(fx, owner, fx.managerId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}");
    int audits = auditRows(fx.eventId);

    problem(
        putCall(
            fx, manager, fx.staffId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}", "req-mgr"),
        403,
        "FORBIDDEN",
        "req-mgr");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertThat(auditRows(fx.eventId)).isEqualTo(audits);

    problem(
        putCall(
            fx,
            owner,
            fx.staffId,
            "{\"grants\":[\"MEMBER_MANAGE\"],\"revokes\":[]}",
            "req-space-key"),
        400,
        "VALIDATION_FAILED",
        "req-space-key");
    problem(
        putCall(
            fx,
            owner,
            fx.staffId,
            "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[\"DATA_EXPORT\"]}",
            "req-duplicate"),
        400,
        "VALIDATION_FAILED",
        "req-duplicate");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();

    String before = readOk(fx, owner, fx.staffId);
    String normalized =
        putOk(fx, owner, fx.staffId, "{\"grants\":[\"EVENT_READ\"],\"revokes\":[]}");
    assertThat(json.readTree(normalized).get("overrides").get("grants")).isEmpty();
    assertThat(readOk(fx, owner, fx.staffId)).isEqualTo(before);
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();

    mvc.perform(
            patch(operator(fx.eventId, fx.managerId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"STAFF\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("STAFF"));
    JsonNode changed = json.readTree(readOk(fx, owner, fx.managerId));
    assertThat(changed.get("role").asString()).isEqualTo("STAFF");
    assertThat(changed.get("overrides").get("grants")).isEmpty();
    assertThat(changed.get("effective").toString()).doesNotContain("DATA_EXPORT");
    JsonNode roleAudit =
        json.readTree(auditDetail(fx.eventId, AuditActions.EVENT_USER_ROLE_CHANGED));
    assertThat(roleAudit.get("roleBefore").asString()).isEqualTo("MANAGER");
    assertThat(roleAudit.get("roleAfter").asString()).isEqualTo("STAFF");
    assertOverrideShape(roleAudit.get("deletedOverrides"));
    assertThat(roleAudit.get("deletedOverrides").toString()).contains("DATA_EXPORT");
  }

  /** #39 rows 15, 22, 23, 24, 25, 31, 32, and 33. */
  @Test
  void permissionReadsFollowTheCallerAndHideContact() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID spaceOwnerId = user("Space owner");
    UUID spaceAdminId = user("Space admin");
    member(fx.spaceId, spaceOwnerId, "OWNER");
    member(fx.spaceId, spaceAdminId, "ADMIN");
    UUID stranger = user("Stranger");
    putOk(
        fx,
        owner,
        fx.staffId,
        "{\"grants\":[\"EVENT_USER_READ\",\"PARTICIPANT_CONTACT_READ\"],\"revokes\":[]}");
    String hidden = "hidden.contact@example.com";
    jdbc.update(
        """
        INSERT INTO event_invitations (
          id, space_id, event_id, email_normalized, role, token_hash, status,
          expires_at, invited_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'STAFF', 'not-a-raw-token', 'PENDING', now() + interval '1 day', ?, now(), now())
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        hidden,
        fx.ownerId);

    problem(
        write(
            put(permissions(fx.eventId, fx.staffId))
                .cookie(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"grants\":[],\"revokes\":[]}"),
            "req-anon-put"),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-anon-put");
    problem(
        putCall(
            fx,
            login(fx.managerId),
            fx.staffId,
            "{\"grants\":\"DATA_EXPORT\",\"revokes\":[]}",
            "req-bad-body"),
        403,
        "FORBIDDEN",
        "req-bad-body");
    assertThat(
            problemBody(
                mvc.perform(
                    get(permissions(fx.eventId, stranger))
                        .cookie(login(fx.staffId))
                        .header("X-Request-Id", "req-staff-stranger")),
                403,
                "FORBIDDEN",
                "req-staff-stranger"))
        .doesNotContain("RESOURCE_NOT_FOUND");
    problem(
        putCall(
            fx,
            owner,
            stranger,
            "{\"grants\":[\"NOT_A_KEY\"],\"revokes\":[]}",
            "req-missing-target"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing-target");
    problem(
        write(get(permissions(fx.eventId, stranger)).cookie(owner), "req-owner-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-owner-missing");

    readOk(fx, login(spaceOwnerId), fx.staffId);
    problem(
        putCall(
            fx,
            login(spaceOwnerId),
            fx.staffId,
            "{\"grants\":[],\"revokes\":[]}",
            "req-space-owner"),
        403,
        "FORBIDDEN",
        "req-space-owner");
    problem(
        write(get(permissions(fx.eventId, fx.staffId)).cookie(login(spaceAdminId)), "req-admin"),
        403,
        "FORBIDDEN",
        "req-admin");

    String listed =
        mvc.perform(get(operators(fx.eventId)).cookie(login(fx.staffId)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode items = json.readTree(listed).get("items");
    assertThat(items).isNotEmpty();
    for (JsonNode item : items) {
      assertThat(item.propertyNames()).containsExactlyInAnyOrder("userId", "displayName", "role");
    }
    assertThat(listed).doesNotContain(hidden).doesNotContain("PARTICIPANT_CONTACT_READ");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isEqualTo(2);
  }

  /** #39 rows 26, 27, 37, and 38. */
  @Test
  void archivedAndEndedPermissionChanges() throws Exception {
    Fixture ended = seed("ENDED");
    Cookie endedOwner = login(ended.ownerId);
    String granted =
        putOk(ended, endedOwner, ended.staffId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}");
    assertThat(json.readTree(granted).get("effective").toString()).contains("DATA_EXPORT");

    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    putOk(fx, owner, fx.staffId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}");
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);
    problem(
        putCall(
            fx,
            owner,
            fx.staffId,
            "{\"grants\":[\"NOT_A_KEY\"],\"revokes\":[]}",
            "req-unknown-first"),
        400,
        "VALIDATION_FAILED",
        "req-unknown-first");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isEqualTo(1);
    problem(
        putCall(
            fx,
            owner,
            fx.ownerId,
            "{\"grants\":[\"FINANCE_READ\"],\"revokes\":[]}",
            "req-archived-owner"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-owner");
    String cleared = putOk(fx, owner, fx.staffId, "{\"grants\":[],\"revokes\":[]}");
    assertThat(json.readTree(cleared).get("overrides").get("grants")).isEmpty();
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_PERMISSIONS_REPLACED)).isEqualTo(2);
  }

  /** #39 row 14. There is no task HTTP route, so the existing service checks the revoked key. */
  @Test
  void revokedTaskWriteIsForbiddenOnTheNextCall() {
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'TASK_WRITE', 'REVOKE', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', 'TODO', ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        fx.staffId);
    assertThatThrownBy(
            () ->
                tasks.complete(
                    fx.spaceId,
                    fx.eventId,
                    taskId,
                    0,
                    new OperatorActor(fx.managerId, "MEMBER", "MANAGER")))
        .isInstanceOf(SceneException.class)
        .extracting(ex -> ((SceneException) ex).code())
        .isEqualTo(ErrorCode.FORBIDDEN);
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    assertThat(
            tasks
                .complete(
                    fx.spaceId,
                    fx.eventId,
                    taskId,
                    0,
                    new OperatorActor(fx.managerId, "MEMBER", "MANAGER"))
                .outcome())
        .isEqualTo("COMPLETED");
  }

  /** #39 row 18. */
  @Test
  void leaveKeepsTheChosenEventAndItsOverrides() {
    Fixture fx = seed("ACTIVE");
    UUID kept = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'kept', 'ACTIVE', 0)
        """,
        kept,
        fx.spaceId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        fx.spaceId,
        kept,
        fx.managerId);
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'DATA_EXPORT', 'GRANT', ?, now())
        """,
        fx.spaceId,
        kept,
        fx.managerId,
        fx.ownerId);

    leave.leave(fx.spaceId, fx.managerId, List.of(kept));

    assertThat(role(kept, fx.managerId)).isEqualTo("STAFF");
    assertThat(overrideCount(kept, fx.managerId)).isEqualTo(1);
    assertThat(operatorCount(fx.eventId, fx.managerId)).isZero();
    assertThat(memberStatus(fx.spaceId, fx.managerId)).isEqualTo("LEFT");
  }

  /**
   * #39 row 34. Row 35 has no cancel command. Row 36's role rewrite is held by the later decision
   * that an ended handover leaves {@code event_users} unchanged.
   */
  @Test
  void ownerTransferDropsOverridesAndAnEndedHandoverKeepsTheSenderRow() throws Exception {
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'DATA_EXPORT', 'GRANT', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        transferId,
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);

    assertThat(transfers.accept(fx.spaceId, transferId, fx.managerId).outcome())
        .isEqualTo("ACCEPTED");
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(role(fx.eventId, fx.managerId)).isEqualTo("OWNER");
    JsonNode body = json.readTree(readOk(fx, login(fx.managerId), fx.managerId));
    assertThat(body.get("overrides").get("grants")).isEmpty();
    assertThat(body.get("effective").toString()).contains("DATA_EXPORT", "EVENT_USER_MANAGE");
    JsonNode audit = json.readTree(auditDetail(fx.eventId, "OWNER_TRANSFER_ACCEPTED"));
    assertOverrideShape(audit.get("deletedOverrides"));
    assertThat(audit.get("deletedOverrides").toString()).contains("DATA_EXPORT");

    assertThat(role(fx.eventId, fx.ownerId)).isEqualTo("OWNER");
    jdbc.update(
        "UPDATE owner_transfers SET handover_ends_at = now() - interval '1 second' WHERE id = ?",
        transferId);
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status)
        VALUES (?, ?, ?, 'task', 'TODO')
        """,
        taskId,
        fx.spaceId,
        fx.eventId);
    assertThatThrownBy(
            () ->
                tasks.complete(
                    fx.spaceId,
                    fx.eventId,
                    taskId,
                    0,
                    new OperatorActor(fx.ownerId, "OWNER", "OWNER")))
        .isInstanceOf(SceneException.class)
        .extracting(ex -> ((SceneException) ex).code())
        .isEqualTo(ErrorCode.FORBIDDEN);
    assertThat(role(fx.eventId, fx.ownerId)).isEqualTo("OWNER");
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
  }

  /** Responses, audit detail, and application logs omit the raw invitation token and contact. */
  @Test
  void responsesAuditsAndLogsOmitSecrets() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      Fixture fx = seed("ACTIVE");
      Cookie owner = login(fx.ownerId);
      String email = "secret.person@example.com";
      String created =
          mvc.perform(
                  post("/api/v1/operator/events/" + fx.eventId + "/invitations")
                      .cookie(owner, csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"email\":\"" + email + "\",\"role\":\"STAFF\"}"))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString();
      InvitationMail mail = mailer.sent().get(0);
      String token = mail.fragmentLink().substring(LINK_PREFIX.length());
      UUID invitee = user("Secret Person");
      Cookie session = login(invitee, email);
      List<String> bodies = new ArrayList<>();
      bodies.add(created);
      bodies.add(
          mvc.perform(
                  post("/api/v1/operator/invitations/preview")
                      .cookie(session, csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"token\":\"" + token + "\"}")
                      .with(
                          request -> {
                            request.setRemoteAddr("10.50.0.1");
                            return request;
                          }))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString());
      bodies.add(
          mvc.perform(
                  post("/api/v1/operator/invitations/accept")
                      .cookie(session, csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"token\":\"" + token + "\"}")
                      .with(
                          request -> {
                            request.setRemoteAddr("10.50.0.1");
                            return request;
                          }))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString());
      putOk(fx, owner, fx.managerId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[\"TASK_WRITE\"]}");
      bodies.add(
          mvc.perform(get(operators(fx.eventId)).cookie(owner))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString());
      mvc.perform(
              delete(operator(fx.eventId, fx.managerId))
                  .cookie(owner, csrf())
                  .header(CSRF_HEADER, CSRF))
          .andExpect(status().isOk());
      JsonNode removed = json.readTree(auditDetail(fx.eventId, AuditActions.EVENT_ACCESS_REVOKED));
      assertThat(removed.get("userId").asString()).isEqualTo(fx.managerId.toString());
      assertOverrideShape(removed.get("deletedOverrides"));
      String audit = auditText(fx.eventId);
      for (String body : bodies) {
        assertThat(body)
            .doesNotContain(token)
            .doesNotContain(email)
            .doesNotContain(session.getValue());
        assertThat(body.toLowerCase()).doesNotContain("password");
      }
      assertThat(audit)
          .doesNotContain(token)
          .doesNotContain(email)
          .doesNotContain(session.getValue());
      assertThat(audit.toLowerCase()).doesNotContain("password");
      for (ILoggingEvent event : logs.list) {
        String message = event.getFormattedMessage();
        assertThat(message)
            .doesNotContain(token)
            .doesNotContain(email)
            .doesNotContain(session.getValue());
        assertThat(message.toLowerCase()).doesNotContain("password");
      }
    } finally {
      app.detachAppender(logs);
    }
  }

  private String putOk(Fixture fx, Cookie owner, UUID userId, String body) throws Exception {
    return mvc.perform(
            put(permissions(fx.eventId, userId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String readOk(Fixture fx, Cookie actor, UUID userId) throws Exception {
    return mvc.perform(get(permissions(fx.eventId, userId)).cookie(actor))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private ResultActions putCall(
      Fixture fx, Cookie actor, UUID userId, String body, String requestId) throws Exception {
    return write(
        put(permissions(fx.eventId, userId))
            .cookie(actor, csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(body),
        requestId);
  }

  private ResultActions write(MockHttpServletRequestBuilder request, String requestId)
      throws Exception {
    return mvc.perform(request.header(CSRF_HEADER, CSRF).header("X-Request-Id", requestId));
  }

  private void problem(ResultActions actions, int httpStatus, String code, String requestId)
      throws Exception {
    problemBody(actions, httpStatus, code, requestId);
  }

  private String problemBody(ResultActions actions, int httpStatus, String code, String requestId)
      throws Exception {
    MvcResult result =
        actions
            .andExpect(status().is(httpStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andExpect(jsonPath("$.traceId").value(requestId))
            .andExpect(header().string("X-Request-Id", requestId))
            .andReturn();
    String body = result.getResponse().getContentAsString();
    if ("req-space-key".equals(requestId)) {
      assertThat(body).contains("UNKNOWN_PERMISSION");
    }
    if ("req-duplicate".equals(requestId)) {
      assertThat(body).contains("DUPLICATE_PERMISSION");
    }
    if ("req-unknown-first".equals(requestId)) {
      assertThat(body).contains("UNKNOWN_PERMISSION").doesNotContain("EVENT_ARCHIVED");
    }
    return body;
  }

  private static void assertOverrideShape(JsonNode overrides) {
    assertThat(overrides.isArray()).isTrue();
    assertThat(overrides).isNotEmpty();
    for (JsonNode item : overrides) {
      assertThat(item.propertyNames())
          .containsExactlyInAnyOrder("permission", "effect", "grantedBy", "grantedAt");
    }
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

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private static String operators(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private static String operator(UUID eventId, UUID userId) {
    return operators(eventId) + "/" + userId;
  }

  private static String permissions(UUID eventId, UUID userId) {
    return operator(eventId, userId) + "/permissions";
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
    operatorRow(fx, fx.ownerId, "OWNER");
    operatorRow(fx, fx.managerId, "MANAGER");
    operatorRow(fx, fx.staffId, "STAFF");
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

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private void operatorRow(Fixture fx, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        fx.spaceId,
        fx.eventId,
        userId,
        role);
  }

  private int overrideCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private int operatorCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_users WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private String role(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
  }

  private String memberStatus(UUID spaceId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT status FROM members WHERE space_id = ? AND user_id = ?",
        String.class,
        spaceId,
        userId);
  }

  private int auditRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private int auditCount(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private String auditDetail(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        String.class,
        eventId,
        action);
  }

  private String auditText(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT coalesce(string_agg(detail::text || action, ''), '') FROM audit_logs WHERE event_id = ?",
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
