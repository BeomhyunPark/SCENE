package app.scene.space;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * P0-10 access order on the operator reads. Codes come from the body. The leave row is #30 comment
 * 5945116073: a kept event resolves, a revoked event is NOT_A_MEMBER, and the space call after
 * leave is NOT_A_MEMBER.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorTenantIsolationIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired MembershipLeaveService leave;

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
  void unauthenticatedReadsAreAuthenticationRequired() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID eventId = UUID.randomUUID();
    problem(
        mvc.perform(get(eventPath(spaceId, eventId)).header("X-Request-Id", "req-event-anon")),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-event-anon");
    problem(
        mvc.perform(get(spacePath(spaceId)).header("X-Request-Id", "req-space-anon")),
        401,
        "AUTHENTICATION_REQUIRED",
        "req-space-anon");
  }

  @Test
  void otherSpaceAndMissingHistoryAreNotFound() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID otherSpaceId = UUID.randomUUID();
    UUID userId = user("Member");
    UUID outsiderId = user("Outsider");
    space(spaceId, "home");
    space(otherSpaceId, "other-space-secret");
    member(spaceId, userId, "MEMBER");
    member(otherSpaceId, outsiderId, "OWNER");
    UUID ownEventId = event(spaceId, "fixture-call-allowed");
    UUID hiddenEventId = event(spaceId, "same-space-hidden");
    UUID otherEventId = event(otherSpaceId, "other-space-event-secret");
    operator(spaceId, ownEventId, userId);
    operator(otherSpaceId, otherEventId, outsiderId);
    Cookie session = login(userId);

    problem(
        mvc.perform(
            get(eventPath(spaceId, otherEventId))
                .cookie(session)
                .header("X-Request-Id", "req-other-event")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-event");
    problem(
        mvc.perform(
            get(eventPath(otherSpaceId, otherEventId))
                .cookie(session)
                .header("X-Request-Id", "req-other-space")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-space");
    assertThat(body(session, eventPath(otherSpaceId, otherEventId), "req-other-space-body"))
        .doesNotContain("other-space-event-secret");
    problem(
        mvc.perform(
            get(eventPath(spaceId, hiddenEventId))
                .cookie(session)
                .header("X-Request-Id", "req-no-history")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-no-history");
    problem(
        mvc.perform(
            get(eventPath(spaceId, UUID.randomUUID()))
                .cookie(session)
                .header("X-Request-Id", "req-missing")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing");
    problem(
        mvc.perform(
            get(spacePath(otherSpaceId))
                .cookie(session)
                .header("X-Request-Id", "req-other-space-get")),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-space-get");
    assertThat(body(session, spacePath(otherSpaceId), "req-other-space-body"))
        .doesNotContain("other-space-secret");
  }

  @Test
  void revokedOperatorWhoIsStillAMemberIsNotAMember() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID userId = user("Still a member");
    space(spaceId, "home");
    member(spaceId, userId, "MEMBER");
    UUID eventId = event(spaceId, "revoked-event");
    operator(spaceId, eventId, userId);
    Cookie session = login(userId);

    leave.revokeEventAccess(spaceId, eventId, userId, "운영자 제거");

    problem(
        mvc.perform(
            get(eventPath(spaceId, eventId)).cookie(session).header("X-Request-Id", "req-revoked")),
        403,
        "NOT_A_MEMBER",
        "req-revoked");
    mvc.perform(get(spacePath(spaceId)).cookie(session).header("X-Request-Id", "req-still-member"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "req-still-member"))
        .andExpect(jsonPath("$.spaceId").value(spaceId.toString()))
        .andExpect(jsonPath("$.name").value("home"));
  }

  @Test
  void memberWithoutEventReadIsForbiddenAndAnOperatorWithItIsOk() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID userId = user("Operator");
    space(spaceId, "home");
    member(spaceId, userId, "MEMBER");
    UUID deniedId = event(spaceId, "event-read-revoked");
    UUID allowedId = event(spaceId, "fixture-call-allowed");
    operator(spaceId, deniedId, userId);
    operator(spaceId, allowedId, userId);
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'EVENT_READ', 'REVOKE', ?, now())
        """,
        spaceId,
        deniedId,
        userId,
        userId);
    Cookie session = login(userId);

    problem(
        mvc.perform(
            get(eventPath(spaceId, deniedId)).cookie(session).header("X-Request-Id", "req-denied")),
        403,
        "FORBIDDEN",
        "req-denied");
    mvc.perform(
            get(eventPath(spaceId, allowedId))
                .cookie(session)
                .header("X-Request-Id", "req-allowed"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "req-allowed"))
        .andExpect(jsonPath("$.eventId").value(allowedId.toString()))
        .andExpect(jsonPath("$.spaceId").value(spaceId.toString()))
        .andExpect(jsonPath("$.name").value("fixture-call-allowed"));
  }

  @Test
  void leaveKeepsOneEventAndClosesTheRevokedEventAndTheSpace() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID ownerId = user("Owner");
    UUID userId = user("Leaving");
    space(spaceId, "home-secret");
    member(spaceId, ownerId, "OWNER");
    member(spaceId, userId, "MEMBER");
    UUID keptId = event(spaceId, "kept-event");
    UUID revokedId = event(spaceId, "revoked-event");
    operator(spaceId, keptId, userId);
    operator(spaceId, revokedId, userId);
    Cookie session = login(userId);

    leave.leave(spaceId, userId, List.of(keptId));

    mvc.perform(get(eventPath(spaceId, keptId)).cookie(session).header("X-Request-Id", "req-kept"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", "req-kept"))
        .andExpect(jsonPath("$.eventId").value(keptId.toString()))
        .andExpect(jsonPath("$.spaceId").value(spaceId.toString()))
        .andExpect(jsonPath("$.name").value("kept-event"));
    problem(
        mvc.perform(
            get(eventPath(spaceId, revokedId))
                .cookie(session)
                .header("X-Request-Id", "req-left-event")),
        403,
        "NOT_A_MEMBER",
        "req-left-event");
    problem(
        mvc.perform(
            get(spacePath(spaceId)).cookie(session).header("X-Request-Id", "req-left-space")),
        403,
        "NOT_A_MEMBER",
        "req-left-space");
    assertThat(body(session, spacePath(spaceId), "req-left-space-body"))
        .doesNotContain("home-secret");
  }

  private ResultActions problem(
      ResultActions actions, int httpStatus, String code, String requestId) throws Exception {
    return actions
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId));
  }

  private String body(Cookie session, String path, String requestId) throws Exception {
    return mvc.perform(get(path).cookie(session).header("X-Request-Id", requestId))
        .andReturn()
        .getResponse()
        .getContentAsString();
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

  private UUID user(String displayName) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, displayName);
    return id;
  }

  private void space(UUID spaceId, String name) {
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, name);
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private UUID event(UUID spaceId, String name) {
    UUID eventId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, 'ACTIVE', 0)
        """,
        eventId,
        spaceId,
        name);
    return eventId;
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        spaceId,
        eventId,
        userId);
  }

  private static String eventPath(UUID spaceId, UUID eventId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events/" + eventId;
  }

  private static String spacePath(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId;
  }
}
