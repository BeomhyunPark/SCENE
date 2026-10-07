package app.scene.event.operator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.audit.AuditActions;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.permission.OperatorPermissionService;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.List;
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

/** INV-01 operator collection. Access order is 404, then NOT_A_MEMBER, then FORBIDDEN. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class EventOperatorIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired OperatorPermissionService permissions;

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
  void unauthenticatedWriteIsAuthenticationRequired() throws Exception {
    problem(
        mvc.perform(
            post(collection(UUID.randomUUID()))
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .header("X-Request-Id", "req-anon")),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-anon");
  }

  @Test
  void ownerAddsAnActiveMemberAndANonMemberCreatesNoRow() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID memberId = user("Ada");
    UUID ownerTargetId = user("Owen");
    member(fx.spaceId, memberId, "MEMBER");
    member(fx.spaceId, ownerTargetId, "MEMBER");
    UUID outsiderId = user("Outsider");
    Cookie owner = login(fx.ownerId);

    mvc.perform(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "STAFF")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(memberId.toString()))
        .andExpect(jsonPath("$.displayName").value("Ada"))
        .andExpect(jsonPath("$.role").value("STAFF"))
        .andExpect(jsonPath("$.email").doesNotExist())
        .andExpect(jsonPath("$.permissions").doesNotExist());
    assertThat(role(fx.eventId, memberId)).isEqualTo("STAFF");

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(outsiderId, "MANAGER")),
            "req-non-member"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-non-member");
    assertThat(operatorCount(fx.eventId, outsiderId)).isZero();

    mvc.perform(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(ownerTargetId, "OWNER")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("OWNER"));
    assertThat(role(fx.eventId, ownerTargetId)).isEqualTo("OWNER");
  }

  /**
   * #39 row 21. MANAGER cannot add or change an operator. The pending default key K is not
   * asserted.
   */
  @Test
  void nonOwnerIsForbiddenAfterNotFoundAndNotAMember() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID memberId = user("Ada");
    member(fx.spaceId, memberId, "MEMBER");
    Cookie staff = login(fx.staffId);
    Cookie owner = login(fx.ownerId);

    problem(
        write(
            post(collection(UUID.randomUUID()))
                .cookie(staff, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "STAFF")),
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
                .content(addBody(memberId, "STAFF")),
            "req-outsider"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-outsider");

    mvc.perform(delete(one(fx.eventId, fx.staffId)).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(staff, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "STAFF")),
            "req-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-revoked");
    assertThat(operatorCount(fx.eventId, memberId)).isZero();

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(login(fx.managerId), csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "STAFF")),
            "req-manager"),
        403,
        "FORBIDDEN",
        "req-manager");
    problem(
        write(
            patch(one(fx.eventId, fx.managerId))
                .cookie(login(fx.managerId), csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"STAFF\"}"),
            "req-manager-patch"),
        403,
        "FORBIDDEN",
        "req-manager-patch");
    assertThat(operatorCount(fx.eventId, memberId)).isZero();
    assertThat(role(fx.eventId, fx.managerId)).isEqualTo("MANAGER");
  }

  /** #39 rows 41, 42, 43, and 44. Narrowing a role on ARCHIVED keeps the override. */
  @Test
  void archivedAddReAddAndRoleChangeWriteNothing() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID memberId = user("Ada");
    member(fx.spaceId, memberId, "MEMBER");
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.managerId, List.of("DATA_EXPORT"), List.of());
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);
    Cookie owner = login(fx.ownerId);
    int audits = auditRows(fx.eventId);

    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "STAFF")),
            "req-archived-add"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-add");
    assertThat(operatorCount(fx.eventId, memberId)).isZero();

    mvc.perform(delete(one(fx.eventId, fx.staffId)).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    assertThat(operatorCount(fx.eventId, fx.staffId)).isZero();
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(fx.staffId, "STAFF")),
            "req-archived-readd"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-readd");
    assertThat(operatorCount(fx.eventId, fx.staffId)).isZero();

    problem(
        write(
            patch(one(fx.eventId, fx.managerId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"STAFF\"}"),
            "req-archived-role"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-role");
    assertThat(role(fx.eventId, fx.managerId)).isEqualTo("MANAGER");
    assertThat(overrideCount(fx.eventId, fx.managerId)).isEqualTo(1);
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
    assertThat(auditRows(fx.eventId)).isEqualTo(audits + 1);
  }

  /** #39 rows 6 and 19. */
  @Test
  void deleteRemovesTheOperatorAndReAddDoesNotRestoreOverrides() throws Exception {
    Fixture fx = seed("ACTIVE");
    permissions.replace(
        fx.ownerId,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        List.of("DATA_EXPORT"),
        List.of("TASK_WRITE"));
    UUID taskId = task(fx, fx.managerId);
    String contact = "manager.contact@example.com";
    String token = "raw-invitation-token";
    jdbc.update(
        """
        INSERT INTO event_invitations (
          id, space_id, event_id, email_normalized, role, token_hash, status,
          expires_at, invited_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'STAFF', ?, 'PENDING', now() + interval '7 days', ?, now(), now())
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        contact,
        token,
        fx.ownerId);
    Cookie owner = login(fx.ownerId);

    String listed =
        mvc.perform(get(collection(fx.eventId)).cookie(owner))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page.totalItems").value(3))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(listed).doesNotContain(contact, token, "permissions", "session");
    JsonNode first = json.readTree(listed).get("items").get(0);
    assertThat(first.propertyNames()).containsExactlyInAnyOrder("userId", "displayName", "role");

    String oneBody =
        mvc.perform(get(one(fx.eventId, fx.managerId)).cookie(owner))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("MANAGER"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(oneBody).doesNotContain(contact, token);
    assertThat(json.readTree(oneBody).propertyNames())
        .containsExactlyInAnyOrder("userId", "displayName", "role");

    mvc.perform(
            delete(one(fx.eventId, fx.managerId)).cookie(owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    assertThat(operatorCount(fx.eventId, fx.managerId)).isZero();
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(assignee(taskId)).isNull();
    assertThat(auditActor(fx.eventId, AuditActions.EVENT_ACCESS_REVOKED)).isEqualTo(fx.ownerId);
    assertThat(auditActor(fx.eventId, AuditActions.TASK_ASSIGNEE_CLEARED)).isEqualTo(fx.ownerId);
    JsonNode detail = json.readTree(auditDetail(fx.eventId, AuditActions.EVENT_ACCESS_REVOKED));
    assertThat(detail.get("userId").asString()).isEqualTo(fx.managerId.toString());
    assertThat(detail.get("deletedOverrides").toString()).contains("DATA_EXPORT", "TASK_WRITE");
    assertThat(auditDetail(fx.eventId, AuditActions.TASK_ASSIGNEE_CLEARED)).contains("운영자 제거");
    assertThat(auditText(fx.eventId)).doesNotContain(contact, token);

    mvc.perform(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(fx.managerId, "MANAGER")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("MANAGER"));
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(role(fx.eventId, fx.managerId)).isEqualTo("MANAGER");
  }

  @Test
  void leaderIsRejectedAndListStaysNameAndRoleForStaff() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID memberId = user("Ada");
    member(fx.spaceId, memberId, "MEMBER");
    Cookie owner = login(fx.ownerId);
    problem(
        write(
            post(collection(fx.eventId))
                .cookie(owner, csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(addBody(memberId, "LEADER")),
            "req-leader"),
        400,
        "VALIDATION_FAILED",
        "req-leader");
    assertThat(operatorCount(fx.eventId, memberId)).isZero();

    mvc.perform(get(collection(fx.eventId)).cookie(login(fx.staffId)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].displayName").exists())
        .andExpect(jsonPath("$.items[0].email").doesNotExist())
        .andExpect(jsonPath("$.items[0].permissions").doesNotExist());
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
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private static String one(UUID eventId, UUID userId) {
    return collection(eventId) + "/" + userId;
  }

  private static String addBody(UUID userId, String role) {
    return "{\"userId\":\"" + userId + "\",\"role\":\"" + role + "\"}";
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

  private UUID task(Fixture fx, UUID assignee) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', 'TODO', ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        assignee);
    return taskId;
  }

  private String role(UUID eventId, UUID userId) {
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

  private int overrideCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
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

  private UUID auditActor(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT actor_user_id FROM audit_logs WHERE event_id = ? AND action = ?",
        UUID.class,
        eventId,
        action);
  }

  private String auditText(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT coalesce(string_agg(detail::text, ''), '') FROM audit_logs WHERE event_id = ?",
        String.class,
        eventId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT assignee_user_id FROM tasks WHERE id = ?", UUID.class, taskId);
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
