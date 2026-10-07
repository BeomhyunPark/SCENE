package app.scene.space;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.transfer.OwnerTransferService;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEC-063 leave HTTP, rows 14–16. Rows 1–13 and 17–19 stay out. An accepted handover is opened
 * through {@link OwnerTransferService#accept}, not through owner-transfer HTTP.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorLeaveHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired OwnerTransferService transfers;

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
  void coOwnerWhoLeavesWithoutATransferKeepsTheRole() throws Exception {
    UUID spaceId = space();
    UUID ownerId = member(spaceId, "Event Owner", "OWNER");
    UUID coOwnerId = member(spaceId, "Co Owner", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    eventUser(spaceId, eventId, ownerId, "OWNER");
    eventUser(spaceId, eventId, coOwnerId, "OWNER");
    Cookie session = login(ownerId);

    JsonNode preview = preview(session, spaceId, "req-preview-14");
    assertThat(preview.propertyNames()).containsExactly("leaveBlocked", "blockReason", "events");
    assertThat(preview.get("leaveBlocked").asBoolean()).isTrue();
    assertThat(preview.get("blockReason").asString()).isEqualTo("OWNER_ROLE_HELD");
    assertThat(preview.get("events")).hasSize(1);
    JsonNode event = preview.get("events").get(0);
    assertThat(event.propertyNames())
        .containsExactly("eventId", "isOwner", "handoverAccepted", "openTasks");
    assertThat(event.get("eventId").asString()).isEqualTo(eventId.toString());
    assertThat(event.get("isOwner").asBoolean()).isTrue();
    assertThat(event.get("handoverAccepted").asBoolean()).isFalse();
    assertThat(event.get("openTasks").asInt()).isZero();
    assertThat(preview.toString())
        .doesNotContain("name")
        .doesNotContain("startsAt")
        .doesNotContain("endsAt")
        .doesNotContain("lifecycleStatus")
        .doesNotContain("displayGroup");
    assertThat(memberStatus(spaceId, ownerId)).isEqualTo("ACTIVE");

    problem(
        postLeave(session, spaceId, "{\"keepEventIds\":[\"not-a-uuid\"]}", "req-bad-14"),
        409,
        "OWNER_ROLE_HELD",
        "req-bad-14");
    problem(
        postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-leave-14"),
        409,
        "OWNER_ROLE_HELD",
        "req-leave-14");
    assertThat(memberStatus(spaceId, ownerId)).isEqualTo("ACTIVE");
    assertThat(eventRole(eventId, ownerId)).isEqualTo("OWNER");
    assertThat(auditCount(spaceId)).isZero();
  }

  @Test
  void pendingTransferOutranksLastOwnerAndAnOpenTask() throws Exception {
    UUID spaceId = space();
    UUID ownerId = member(spaceId, "Last Owner", "OWNER");
    UUID staffId = member(spaceId, "Staff", "MEMBER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    eventUser(spaceId, eventId, ownerId, "OWNER");
    UUID taskId = task(spaceId, eventId, ownerId, "TODO");
    UUID transferId = pending(spaceId, eventId, ownerId, staffId);
    Cookie session = login(ownerId);

    JsonNode preview = preview(session, spaceId, "req-preview-16");
    assertThat(preview.get("leaveBlocked").asBoolean()).isTrue();
    assertThat(preview.get("blockReason").asString()).isEqualTo("HANDOVER_NOT_ACCEPTED");
    assertThat(preview.get("events").get(0).get("openTasks").asInt()).isEqualTo(1);
    assertThat(preview.toString()).doesNotContain("LAST_OWNER").doesNotContain("RESPONSIBILITY");

    String body =
        problemBody(
            postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-leave-16"),
            409,
            "HANDOVER_NOT_ACCEPTED",
            "req-leave-16");
    assertThat(body).doesNotContain("LAST_OWNER").doesNotContain("RESPONSIBILITY");
    assertThat(memberStatus(spaceId, ownerId)).isEqualTo("ACTIVE");
    assertThat(eventRole(eventId, ownerId)).isEqualTo("OWNER");
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
    assertThat(assignee(taskId)).isEqualTo(ownerId);
    assertThat(auditCount(spaceId)).isZero();
  }

  @Test
  void acceptedHandoverCompletesWhenTheSenderDoesNotKeepTheEvent() throws Exception {
    UUID spaceId = space();
    UUID ownerId = member(spaceId, "Sender", "OWNER");
    UUID recipientId = member(spaceId, "Recipient", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    eventUser(spaceId, eventId, ownerId, "OWNER");
    eventUser(spaceId, eventId, recipientId, "MANAGER");
    UUID transferId = pending(spaceId, eventId, ownerId, recipientId);
    transfers.accept(spaceId, transferId, recipientId);
    Cookie session = login(ownerId);

    JsonNode preview = preview(session, spaceId, "req-preview-15");
    assertThat(preview.get("leaveBlocked").asBoolean()).isFalse();
    assertThat(preview.get("blockReason").isNull()).isTrue();
    assertThat(preview.get("events").get(0).get("handoverAccepted").asBoolean()).isTrue();
    assertThat(preview.get("events").get(0).get("isOwner").asBoolean()).isTrue();

    MvcResult result =
        postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-leave-15")
            .andExpect(status().isOk())
            .andExpect(header().string("X-Request-Id", "req-leave-15"))
            .andReturn();
    assertThat(result.getResponse().getContentAsString()).doesNotContain("EVENT_ARCHIVED");
    assertThat(transferStatus(transferId)).isEqualTo("COMPLETED");
    assertThat(operatorCount(eventId, ownerId)).isZero();
    assertThat(eventRole(eventId, recipientId)).isEqualTo("OWNER");
    assertThat(memberStatus(spaceId, ownerId)).isEqualTo("LEFT");
    problem(
        mvc.perform(get(spacePath(spaceId)).cookie(session).header("X-Request-Id", "req-space-15")),
        403,
        "NOT_A_MEMBER",
        "req-space-15");
  }

  @Test
  void acceptedHandoverCannotBeKept() throws Exception {
    UUID spaceId = space();
    UUID ownerId = member(spaceId, "Sender", "OWNER");
    UUID recipientId = member(spaceId, "Recipient", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    eventUser(spaceId, eventId, ownerId, "OWNER");
    eventUser(spaceId, eventId, recipientId, "MANAGER");
    UUID transferId = pending(spaceId, eventId, ownerId, recipientId);
    transfers.accept(spaceId, transferId, recipientId);
    Cookie session = login(ownerId);

    problem(
        postLeave(
            session, spaceId, "{\"keepEventIds\":[\"" + eventId + "\"]}", "req-keep-handover"),
        400,
        "VALIDATION_FAILED",
        "req-keep-handover");
    assertThat(transferStatus(transferId)).isEqualTo("HANDOVER");
    assertThat(memberStatus(spaceId, ownerId)).isEqualTo("ACTIVE");
    assertThat(eventRole(eventId, ownerId)).isEqualTo("OWNER");
    assertThat(auditCount(spaceId, "EVENT_ACCESS_REVOKED")).isZero();
    assertThat(auditCount(spaceId, "TASK_ASSIGNEE_CLEARED")).isZero();
  }

  @Test
  void keepOneEventAndRevokeTheOther() throws Exception {
    UUID spaceId = space();
    UUID staffId = member(spaceId, "Staff", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID keptId = event(spaceId, "Kept", "ACTIVE");
    UUID revokedId = event(spaceId, "Revoked", "ACTIVE");
    eventUser(spaceId, keptId, staffId, "STAFF");
    eventUser(spaceId, revokedId, staffId, "STAFF");
    grant(spaceId, keptId, staffId);
    grant(spaceId, revokedId, staffId);
    UUID doneId = task(spaceId, revokedId, staffId, "DONE");
    Cookie session = login(staffId);

    JsonNode preview = preview(session, spaceId, "req-preview-keep");
    assertThat(preview.get("leaveBlocked").asBoolean()).isFalse();
    assertThat(preview.get("blockReason").isNull()).isTrue();
    assertThat(preview.get("events")).hasSize(2);
    assertThat(memberStatus(spaceId, staffId)).isEqualTo("ACTIVE");
    assertThat(permissionCount(keptId, staffId)).isEqualTo(1);

    postLeave(session, spaceId, "{\"keepEventIds\":[\"" + keptId + "\"]}", "req-leave-keep")
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "req-leave-keep"));

    mvc.perform(get(eventPath(spaceId, keptId)).cookie(session).header("X-Request-Id", "req-kept"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "req-kept"))
        .andExpect(jsonPath("$.eventId").value(keptId.toString()))
        .andExpect(jsonPath("$.name").value("Kept"));
    problem(
        mvc.perform(
            get(eventPath(spaceId, revokedId))
                .cookie(session)
                .header("X-Request-Id", "req-revoked")),
        403,
        "NOT_A_MEMBER",
        "req-revoked");
    problem(
        mvc.perform(
            get(spacePath(spaceId)).cookie(session).header("X-Request-Id", "req-space-left")),
        403,
        "NOT_A_MEMBER",
        "req-space-left");
    assertThat(eventRole(keptId, staffId)).isEqualTo("STAFF");
    assertThat(permissionCount(keptId, staffId)).isEqualTo(1);
    assertThat(operatorCount(revokedId, staffId)).isZero();
    assertThat(permissionCount(revokedId, staffId)).isZero();
    assertThat(assignee(doneId)).isNull();
    assertThat(memberStatus(spaceId, staffId)).isEqualTo("LEFT");
    problem(
        mvc.perform(
            get(previewPath(spaceId)).cookie(session).header("X-Request-Id", "req-preview-after")),
        403,
        "NOT_A_MEMBER",
        "req-preview-after");
  }

  @Test
  void archivedNonOwnerCanLeave() throws Exception {
    UUID spaceId = space();
    UUID staffId = member(spaceId, "Staff", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID eventId = event(spaceId, "Archived gathering", "ARCHIVED");
    eventUser(spaceId, eventId, staffId, "STAFF");
    Cookie session = login(staffId);

    MvcResult result =
        postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-archived")
            .andExpect(status().isOk())
            .andExpect(header().string("X-Request-Id", "req-archived"))
            .andReturn();
    assertThat(result.getResponse().getContentAsString()).doesNotContain("EVENT_ARCHIVED");
    assertThat(memberStatus(spaceId, staffId)).isEqualTo("LEFT");
    assertThat(operatorCount(eventId, staffId)).isZero();
  }

  @Test
  void missingAndForeignKeepListsChangeNothing() throws Exception {
    UUID spaceId = space();
    UUID otherSpaceId = space();
    UUID staffId = member(spaceId, "Staff", "MEMBER");
    member(spaceId, "Space Owner", "OWNER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    UUID otherEventId = event(otherSpaceId, "Elsewhere", "ACTIVE");
    eventUser(spaceId, eventId, staffId, "STAFF");
    Cookie session = login(staffId);

    problem(
        postLeave(session, spaceId, "{}", "req-missing-keep"),
        400,
        "VALIDATION_FAILED",
        "req-missing-keep");
    problem(
        postLeave(
            session, spaceId, "{\"keepEventIds\":[\"" + otherEventId + "\"]}", "req-foreign-keep"),
        400,
        "VALIDATION_FAILED",
        "req-foreign-keep");
    assertThat(memberStatus(spaceId, staffId)).isEqualTo("ACTIVE");
    assertThat(eventRole(eventId, staffId)).isEqualTo("STAFF");
    assertThat(auditCount(spaceId)).isZero();
  }

  @Test
  void inactiveMemberIsNotAMemberOnBothRoutes() throws Exception {
    UUID spaceId = space();
    UUID staffId = member(spaceId, "Former", "MEMBER");
    UUID eventId = event(spaceId, "Gathering", "ACTIVE");
    eventUser(spaceId, eventId, staffId, "STAFF");
    jdbc.update(
        "UPDATE members SET status = 'LEFT' WHERE space_id = ? AND user_id = ?", spaceId, staffId);
    Cookie session = login(staffId);

    problem(
        mvc.perform(
            get(previewPath(spaceId)).cookie(session).header("X-Request-Id", "req-left-preview")),
        403,
        "NOT_A_MEMBER",
        "req-left-preview");
    problem(
        postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-left-leave"),
        403,
        "NOT_A_MEMBER",
        "req-left-leave");
    assertThat(memberStatus(spaceId, staffId)).isEqualTo("LEFT");
    assertThat(eventRole(eventId, staffId)).isEqualTo("STAFF");
  }

  @Test
  void aCallerWithNoMembershipRowIsNotFound() throws Exception {
    UUID spaceId = space();
    UUID outsiderId = member(space(), "Outsider", "MEMBER");
    Cookie session = login(outsiderId);

    problem(
        mvc.perform(
            get(previewPath(spaceId)).cookie(session).header("X-Request-Id", "req-absent-preview")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-absent-preview");
    problem(
        postLeave(session, spaceId, "{\"keepEventIds\":[]}", "req-absent-leave"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-absent-leave");
  }

  private JsonNode preview(Cookie session, UUID spaceId, String requestId) throws Exception {
    MvcResult result =
        mvc.perform(get(previewPath(spaceId)).cookie(session).header("X-Request-Id", requestId))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Request-Id", requestId))
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString());
  }

  private ResultActions postLeave(Cookie session, UUID spaceId, String body, String requestId) {
    MockHttpServletRequestBuilder request =
        post(leavePath(spaceId))
            .cookie(session, new Cookie(CSRF_COOKIE, CSRF))
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", requestId)
            .contentType(MediaType.APPLICATION_JSON);
    if (body != null) {
      request.content(body);
    }
    try {
      return mvc.perform(request);
    } catch (Exception exception) {
      throw new IllegalStateException(exception);
    }
  }

  private String problemBody(ResultActions actions, int httpStatus, String code, String requestId)
      throws Exception {
    MvcResult result =
        problem(actions, httpStatus, code, requestId)
            .andExpect(jsonPath("$.errors").doesNotExist())
            .andReturn();
    return result.getResponse().getContentAsString();
  }

  private ResultActions problem(
      ResultActions actions, int httpStatus, String code, String requestId) throws Exception {
    ResultActions result =
        actions
            .andExpect(status().is(httpStatus))
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andExpect(jsonPath("$.traceId").value(requestId))
            .andExpect(header().string("X-Request-Id", requestId));
    if (httpStatus == 400) {
      result.andExpect(jsonPath("$.errors[0].field").value("keepEventIds"));
    }
    return result;
  }

  private Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(new Cookie(CSRF_COOKIE, CSRF))
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

  private UUID member(UUID spaceId, String displayName, String role) {
    UUID userId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", userId, displayName);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
    return userId;
  }

  private UUID space() {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Green Grove");
    return spaceId;
  }

  private UUID event(UUID spaceId, String name, String lifecycle) {
    UUID eventId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, ?, 0)
        """,
        eventId,
        spaceId,
        name,
        lifecycle);
    return eventId;
  }

  private void eventUser(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private UUID task(UUID spaceId, UUID eventId, UUID assigneeId, String status) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'Open work', ?, ?)
        """,
        taskId,
        spaceId,
        eventId,
        status,
        assigneeId);
    return taskId;
  }

  private void grant(UUID spaceId, UUID eventId, UUID userId) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'TASK_WRITE', 'GRANT', ?, now())
        """,
        spaceId,
        eventId,
        userId,
        userId);
  }

  private UUID pending(UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId) {
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        transferId,
        spaceId,
        eventId,
        fromUserId,
        toUserId);
    return transferId;
  }

  private String memberStatus(UUID spaceId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT status FROM members WHERE space_id = ? AND user_id = ?",
        String.class,
        spaceId,
        userId);
  }

  private String eventRole(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
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

  private int permissionCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private String transferStatus(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT status FROM owner_transfers WHERE id = ?", String.class, transferId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.query(
            "SELECT assignee_user_id FROM tasks WHERE id = ?",
            (rs, row) -> rs.getObject(1, UUID.class),
            taskId)
        .getFirst();
  }

  private int auditCount(UUID spaceId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE space_id = ?", Integer.class, spaceId);
  }

  private int auditCount(UUID spaceId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE space_id = ? AND action = ?",
        Integer.class,
        spaceId,
        action);
  }

  private static String previewPath(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/me/leave-preview";
  }

  private static String leavePath(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/me/leave";
  }

  private static String spacePath(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId;
  }

  private static String eventPath(UUID spaceId, UUID eventId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events/" + eventId;
  }
}
