package app.scene.event.retrospective;

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
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.util.Map;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Event retrospective read and write (#237). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class RetrospectiveHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String SECRET = "회고-본문-비밀-문장";
  private static final String CONFLICT = "CONCURRENT_MODIFICATION";
  private static final String NOT_ENDED = "INVALID_STATE_TRANSITION";
  private static final String MISSING = "RESOURCE_NOT_FOUND";
  private static final String BAD = "VALIDATION_FAILED";

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
  void ownerWritesAnEndedEventAndOthersReadTheSameText() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      Held e = openEvent("Owner");
      Cookie o = e.owner;
      UUID id = e.eventId;
      lifecycle(id, "ENDED");
      UUID staffId = user("Staff");
      member(e.spaceId, staffId, "MEMBER");
      operator(e.spaceId, id, staffId, "STAFF");
      UUID adminId = user("Admin");
      member(e.spaceId, adminId, "ADMIN");

      JsonNode empty = json.readTree(ok(get(path(id)).cookie(o)));
      assertThat(empty.propertyNames())
          .containsExactly("text", "version", "updatedAt", "updatedByDisplayName");
      assertThat(empty.get("text").asString()).isEmpty();
      assertThat(empty.get("version").asInt()).isZero();
      assertThat(empty.get("updatedAt").isNull()).isTrue();
      assertThat(empty.get("updatedByDisplayName").isNull()).isTrue();
      int audits = auditCount(id);

      JsonNode saved = json.readTree(ok(write(o, id, "첫 회고 " + SECRET, 0, "r-first")));
      assertThat(saved.get("text").asString()).isEqualTo("첫 회고 " + SECRET);
      assertThat(saved.get("version").asInt()).isEqualTo(1);
      assertThat(saved.get("updatedByDisplayName").asString()).isEqualTo("Owner");
      assertThat(saved.get("updatedAt").isNull()).isFalse();

      JsonNode second = json.readTree(ok(write(o, id, "고친 회고", 1, "r-second")));
      assertThat(second.get("version").asInt()).isEqualTo(2);

      JsonNode asStaff = json.readTree(ok(get(path(id)).cookie(login(staffId))));
      assertThat(asStaff.get("text").asString()).isEqualTo("고친 회고");
      assertThat(asStaff.get("version").asInt()).isEqualTo(2);
      JsonNode asAdmin = json.readTree(ok(get(path(id)).cookie(login(adminId))));
      assertThat(asAdmin.get("text").asString()).isEqualTo("고친 회고");

      assertThat(auditCount(id)).isEqualTo(audits + 2);
      assertThat(lastAuditAction(id)).isEqualTo(AuditActions.EVENT_RETROSPECTIVE_UPDATED);
      assertThat(json.readTree(lastAuditDetail(id)).propertyNames()).containsExactly("version");
      assertThat(auditText(id)).doesNotContain(SECRET).doesNotContain("고친 회고");
      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage()).doesNotContain(SECRET);
      }
    } finally {
      app.detachAppender(logs);
    }
  }

  @Test
  void staleVersionIsAConflictAndKeepsTheStoredText() throws Exception {
    Held e = openEvent("Owner");
    Cookie o = e.owner;
    UUID id = e.eventId;
    lifecycle(id, "ENDED");
    ok(write(o, id, "먼저 저장", 0, "r-a"));

    ResultActions stale = problem(write(o, id, "늦은", 0, "r-stale"), 409, CONFLICT, "r-stale");
    stale.andExpect(jsonPath("$.version").value(1));
    problem(write(o, id, "앞선", 5, "r-ahead"), 409, CONFLICT, "r-ahead");
    JsonNode stored = json.readTree(ok(get(path(id)).cookie(o)));
    assertThat(stored.get("text").asString()).isEqualTo("먼저 저장");
    assertThat(stored.get("version").asInt()).isEqualTo(1);
  }

  @Test
  void onlyAnEndedEventIsWritable() throws Exception {
    Held e = openEvent("Owner");
    Cookie o = e.owner;
    UUID id = e.eventId;
    problem(write(o, id, "초안", 0, "r-draft"), 409, NOT_ENDED, "r-draft");
    lifecycle(id, "ACTIVE");
    problem(write(o, id, "진행 중", 0, "r-active"), 409, NOT_ENDED, "r-active");
    lifecycle(id, "ENDED");
    ok(write(o, id, "종료 뒤", 0, "r-ended"));
    lifecycle(id, "ARCHIVED");
    problem(write(o, id, "보관 뒤", 1, "r-archived"), 409, "EVENT_ARCHIVED", "r-archived");
    JsonNode archived = json.readTree(ok(get(path(id)).cookie(o)));
    assertThat(archived.get("text").asString()).isEqualTo("종료 뒤");
    assertThat(storedCount(id)).isEqualTo(1);
  }

  @Test
  void permissionsAndBodyAreCheckedInOrder() throws Exception {
    Held e = openEvent("Owner");
    Cookie o = e.owner;
    UUID id = e.eventId;
    lifecycle(id, "ENDED");
    UUID managerId = user("Manager");
    member(e.spaceId, managerId, "MEMBER");
    operator(e.spaceId, id, managerId, "MANAGER");
    Cookie manager = login(managerId);

    problem(write(manager, id, "매니저", 0, "r-manager"), 403, "FORBIDDEN", "r-manager");
    grant(e.spaceId, id, managerId, "EVENT_UPDATE", e.ownerId);
    JsonNode granted = json.readTree(ok(write(manager, id, "부여 뒤", 0, "r-grant")));
    assertThat(granted.get("updatedByDisplayName").asString()).isEqualTo("Manager");

    UUID memberId = user("Member");
    member(e.spaceId, memberId, "MEMBER");
    problem(read(login(memberId), id, "r-member"), 403, "FORBIDDEN", "r-member");
    problem(read(login(user("Stranger")), id, "r-out"), 404, MISSING, "r-out");
    problem(read(o, UUID.randomUUID(), "r-none"), 404, MISSING, "r-none");

    ResultActions noText = problem(raw(o, id, "{\"expectedVersion\":1}", "r-t"), 400, BAD, "r-t");
    noText.andExpect(jsonPath("$.errors[0].field").value("text"));
    ResultActions noVersion = problem(raw(o, id, "{\"text\":\"x\"}", "r-v"), 400, BAD, "r-v");
    noVersion.andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    String tooLong = "가".repeat(RetrospectiveService.TEXT_MAX + 1);
    ResultActions longText = problem(write(o, id, tooLong, 1, "r-long"), 400, BAD, "r-long");
    longText.andExpect(jsonPath("$.errors[0].field").value("text"));
    ok(write(o, id, "가".repeat(RetrospectiveService.TEXT_MAX), 1, "r-max"));
  }

  private MockHttpServletRequestBuilder write(
      Cookie session, UUID eventId, String text, int expectedVersion, String requestId) {
    String body = json.writeValueAsString(Map.of("text", text, "expectedVersion", expectedVersion));
    return raw(session, eventId, body, requestId);
  }

  private MockHttpServletRequestBuilder raw(
      Cookie session, UUID eventId, String body, String requestId) {
    return put(path(eventId))
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private MockHttpServletRequestBuilder read(Cookie session, UUID eventId, String requestId) {
    return get(path(eventId)).cookie(session).header("X-Request-Id", requestId);
  }

  private void grant(UUID spaceId, UUID eventId, UUID userId, String permission, UUID by) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'GRANT', ?, now())
        """,
        spaceId,
        eventId,
        userId,
        permission,
        by);
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private ResultActions problem(
      MockHttpServletRequestBuilder request, int httpStatus, String code, String requestId)
      throws Exception {
    return mvc.perform(request)
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

  private Held openEvent(String memberName) throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID memberId = user(memberName);
    member(spaceId, memberId, "OWNER");
    Cookie owner = login(memberId);
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"행사\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    return new Held(spaceId, eventId, owner, memberId);
  }

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private static String path(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/retrospective";
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private int storedCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_retrospectives WHERE event_id = ?", Integer.class, eventId);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private String lastAuditAction(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT action FROM audit_logs WHERE event_id = ? ORDER BY occurred_at DESC LIMIT 1",
        String.class,
        eventId);
  }

  private String lastAuditDetail(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? ORDER BY occurred_at DESC LIMIT 1",
        String.class,
        eventId);
  }

  private String auditText(UUID eventId) {
    return String.join(
        "\n",
        jdbc.queryForList(
            "SELECT detail::text FROM audit_logs WHERE event_id = ?", String.class, eventId));
  }

  private record Held(UUID spaceId, UUID eventId, Cookie owner, UUID ownerId) {}
}
