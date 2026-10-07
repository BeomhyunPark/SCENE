package app.scene.event.operator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.audit.AuditActions;
import app.scene.common.web.RequestIdFilter;
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

/** INV-02 permission override HTTP API. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorPermissionHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

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
  void ownerPutReplacesOnceAndTheSameBodyWritesNothing() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId);
    String body = "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}";

    String first = putOk(fx, owner, fx.staffId, body);
    JsonNode saved = json.readTree(first);
    assertThat(saved.get("role").asString()).isEqualTo("STAFF");
    assertThat(saved.get("overrides").get("grants").get(0).asString()).isEqualTo("DATA_EXPORT");
    assertThat(saved.get("effective").toString()).contains("DATA_EXPORT", "EVENT_READ");
    assertThat(saved.propertyNames())
        .containsExactlyInAnyOrder("userId", "role", "roleDefaults", "overrides", "effective");
    assertThat(first).doesNotContain("email", "token", "session");
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_PERMISSIONS_REPLACED)).isEqualTo(1);

    jdbc.update(
        """
        UPDATE event_user_permissions
        SET granted_at = timestamptz '2020-01-01T00:00:00Z'
        WHERE event_id = ? AND user_id = ?
        """,
        fx.eventId,
        fx.staffId);
    String second = putOk(fx, owner, fx.staffId, body);
    assertThat(second).isEqualTo(first);
    assertThat(grantedAt(fx.eventId, fx.staffId)).startsWith("2020-01-01");
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_PERMISSIONS_REPLACED)).isEqualTo(1);
  }

  @Test
  void staffMayReadSelfAndNotAnotherOperator() throws Exception {
    Fixture fx = seed();
    Cookie staff = login(fx.staffId);
    mvc.perform(get(permissions(fx.eventId, fx.staffId)).cookie(staff))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(fx.staffId.toString()))
        .andExpect(jsonPath("$.role").value("STAFF"));
    problem(
        mvc.perform(
            get(permissions(fx.eventId, fx.managerId))
                .cookie(staff)
                .header("X-Request-Id", "req-other")),
        403,
        "FORBIDDEN",
        "req-other");
    problem(
        mvc.perform(
            get(collection(fx.eventId) + "?include=permissions")
                .cookie(login(fx.managerId))
                .header("X-Request-Id", "req-include")),
        403,
        "FORBIDDEN",
        "req-include");
  }

  @Test
  void rejectionCodesFollowOwnerThenOwnerOnlyThenNotOverridable() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId);
    problem(
        putPermissions(
            fx,
            owner,
            fx.ownerId,
            "{\"grants\":[\"EVENT_LIFECYCLE\"],\"revokes\":[\"EVENT_READ\"]}"),
        422,
        "PERMISSION_OWNER_NOT_OVERRIDABLE",
        "req-owner-target");
    problem(
        putPermissions(
            fx,
            owner,
            fx.staffId,
            "{\"grants\":[\"EVENT_USER_MANAGE\"],\"revokes\":[\"EVENT_READ\"]}"),
        422,
        "PERMISSION_OWNER_ONLY",
        "req-owner-only");
    problem(
        putPermissions(fx, owner, fx.staffId, "{\"grants\":[],\"revokes\":[\"EVENT_READ\"]}"),
        422,
        "PERMISSION_NOT_OVERRIDABLE",
        "req-not-overridable");
    problem(
        putPermissions(
            fx, owner, fx.staffId, "{\"grants\":[\"DATA_RETENTION_MANAGE\"],\"revokes\":[]}"),
        400,
        "VALIDATION_FAILED",
        "req-unknown");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertThat(overrideCount(fx.eventId, fx.ownerId)).isZero();
  }

  @Test
  void archivedGrantWritesNothingAndAReducingRevokeIsStored() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId);
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);
    int audits = auditRows(fx.eventId);

    problem(
        putPermissions(fx, owner, fx.staffId, "{\"grants\":[\"DATA_EXPORT\"],\"revokes\":[]}"),
        409,
        "EVENT_ARCHIVED",
        "req-archived-grant");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertThat(auditRows(fx.eventId)).isEqualTo(audits);

    String narrowed =
        putOk(fx, owner, fx.managerId, "{\"grants\":[],\"revokes\":[\"TASK_WRITE\"]}");
    JsonNode body = json.readTree(narrowed);
    assertThat(body.get("overrides").get("revokes").get(0).asString()).isEqualTo("TASK_WRITE");
    assertThat(body.get("effective").toString()).doesNotContain("TASK_WRITE");
    assertThat(overrideCount(fx.eventId, fx.managerId)).isEqualTo(1);
    assertThat(auditCount(fx.eventId, AuditActions.EVENT_USER_PERMISSIONS_REPLACED)).isEqualTo(1);
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

  private ResultActions putPermissions(Fixture fx, Cookie owner, UUID userId, String body)
      throws Exception {
    String requestId =
        switch (body) {
          case String s when s.contains("EVENT_LIFECYCLE") -> "req-owner-target";
          case String s when s.contains("EVENT_USER_MANAGE") -> "req-owner-only";
          case String s when s.contains("DATA_RETENTION_MANAGE") -> "req-unknown";
          case String s when s.contains("DATA_EXPORT") -> "req-archived-grant";
          default -> "req-not-overridable";
        };
    return write(
        put(permissions(fx.eventId, userId))
            .cookie(owner, csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(body),
        requestId);
  }

  private ResultActions write(MockHttpServletRequestBuilder request, String requestId)
      throws Exception {
    return mvc.perform(request.header(CSRF_HEADER, CSRF).header("X-Request-Id", requestId));
  }

  private ResultActions problem(
      ResultActions actions, int httpStatus, String code, String requestId) throws Exception {
    actions
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId));
    if (httpStatus == 400) {
      actions.andExpect(jsonPath("$.errors[0].code").value("UNKNOWN_PERMISSION"));
    }
    return actions;
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

  private static String permissions(UUID eventId, UUID userId) {
    return collection(eventId) + "/" + userId + "/permissions";
  }

  private Fixture seed() {
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
        VALUES (?, ?, 'event', 'ACTIVE', 0)
        """,
        fx.eventId,
        fx.spaceId);
    operator(fx, fx.ownerId, "OWNER");
    operator(fx, fx.managerId, "MANAGER");
    operator(fx, fx.staffId, "STAFF");
    return fx;
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

  private int overrideCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private int auditCount(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private int auditRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private String grantedAt(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT granted_at::text FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
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
