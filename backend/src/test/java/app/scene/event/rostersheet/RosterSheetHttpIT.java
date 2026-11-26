package app.scene.event.rostersheet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** 참가 현황 operator sheet read and change (#508). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class RosterSheetHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String SECRET = "입금-비밀-메모";
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
  void ownerAddsColumnsRowsAndCellsAndStaffReadsTheSameSheet() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      Held e = openEvent("Owner");
      Cookie o = e.owner;
      UUID id = e.eventId;
      UUID staffId = user("Staff");
      member(e.spaceId, staffId, "MEMBER");
      operator(e.spaceId, id, staffId, "STAFF");
      String person = UUID.randomUUID().toString();

      JsonNode empty = json.readTree(ok(get(path(id)).cookie(o)));
      assertThat(empty.propertyNames())
          .containsExactly("doc", "version", "updatedAt", "updatedByDisplayName");
      assertThat(empty.get("version").asInt()).isZero();
      assertThat(empty.get("doc").get("columns").isEmpty()).isTrue();
      int audits = auditCount(id);

      String first =
          """
          {"ops":[
            {"op":"addColumn","id":"pay","label":"입금","after":"status"},
            {"op":"addRow","id":"total"},
            {"op":"setCell","row":"p:%s","col":"c:pay","value":"%s","format":{"b":true,"fill":"#ffeeaa"}},
            {"op":"setCell","row":"r:total","col":"c:pay","value":"=COUNTA(B:B)"},
            {"op":"setCell","row":"r:total","col":"status","value":"합계"},
            {"op":"setCell","row":"p:%s","col":"status","format":{"color":"#cc0000"}},
            {"op":"setRules","rules":[{"id":"r1","col":"c:pay","op":"empty","fill":"#ffdddd"}]}
          ]}
          """
              .formatted(person, SECRET, person);
      JsonNode saved = json.readTree(ok(raw(o, id, first, "s-first")));
      assertThat(saved.get("version").asInt()).isEqualTo(1);
      JsonNode doc = saved.get("doc");
      assertThat(doc.get("columns").get(0).get("label").asString()).isEqualTo("입금");
      assertThat(doc.get("columns").get(0).get("after").asString()).isEqualTo("status");
      assertThat(doc.get("rows").get(0).get("id").asString()).isEqualTo("total");
      JsonNode cell = doc.get("cells").get("p:" + person + "|c:pay");
      assertThat(cell.get("v").asString()).isEqualTo(SECRET);
      assertThat(cell.get("f").get("fill").asString()).isEqualTo("#ffeeaa");
      assertThat(doc.get("cells").get("r:total|c:pay").get("v").asString())
          .isEqualTo("=COUNTA(B:B)");
      assertThat(doc.get("rules").get(0).get("op").asString()).isEqualTo("empty");

      // A second writer's cell merges with the first; an empty value clears it.
      String second =
          """
          {"ops":[
            {"op":"addRow","id":"note","index":0},
            {"op":"setCell","row":"r:note","col":"c:pay","value":"메모"},
            {"op":"setCell","row":"p:%s","col":"status","format":null}
          ]}
          """
              .formatted(person);
      grant(e.spaceId, id, staffId, "PARTICIPANT_WRITE", e.ownerId);
      JsonNode merged = json.readTree(ok(raw(login(staffId), id, second, "s-second")));
      assertThat(merged.get("version").asInt()).isEqualTo(2);
      assertThat(merged.get("updatedByDisplayName").asString()).isEqualTo("Staff");
      assertThat(merged.get("doc").get("rows").get(0).get("id").asString()).isEqualTo("note");
      assertThat(merged.get("doc").get("cells").has("p:" + person + "|status")).isFalse();
      assertThat(merged.get("doc").get("cells").get("r:total|c:pay").get("v").asString())
          .isEqualTo("=COUNTA(B:B)");

      String removal =
          "{\"ops\":[{\"op\":\"deleteRow\",\"id\":\"total\"},"
              + "{\"op\":\"deleteColumn\",\"id\":\"pay\"}]}";
      JsonNode removed = json.readTree(ok(raw(o, id, removal, "s-delete")));
      assertThat(removed.get("doc").get("columns").isEmpty()).isTrue();
      assertThat(removed.get("doc").get("cells").isEmpty()).isTrue();
      assertThat(removed.get("doc").get("rules").isEmpty()).isTrue();
      assertThat(removed.get("doc").get("rows").size()).isEqualTo(1);

      assertThat(auditCount(id)).isEqualTo(audits + 3);
      assertThat(lastAuditAction(id)).isEqualTo(AuditActions.ROSTER_SHEET_UPDATED);
      assertThat(json.readTree(lastAuditDetail(id)).propertyNames())
          .containsExactlyInAnyOrder("version", "ops");
      assertThat(auditText(id)).doesNotContain(SECRET).doesNotContain("입금");
      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage()).doesNotContain(SECRET);
      }
      assertThat(storedCount(id)).isEqualTo(1);
    } finally {
      app.detachAppender(logs);
    }
  }

  @Test
  void permissionsStateAndBodyAreChecked() throws Exception {
    Held e = openEvent("Owner");
    Cookie o = e.owner;
    UUID id = e.eventId;
    UUID staffId = user("Staff");
    member(e.spaceId, staffId, "MEMBER");
    operator(e.spaceId, id, staffId, "STAFF");
    Cookie staff = login(staffId);
    String add = "{\"ops\":[{\"op\":\"addColumn\",\"id\":\"a\",\"label\":\"열\"}]}";

    ok(get(path(id)).cookie(staff));
    problem(raw(staff, id, add, "s-staff"), 403, "FORBIDDEN", "s-staff");
    UUID memberId = user("Member");
    member(e.spaceId, memberId, "MEMBER");
    problem(read(login(memberId), id, "s-member"), 403, "FORBIDDEN", "s-member");
    problem(read(login(user("Stranger")), id, "s-out"), 404, MISSING, "s-out");

    problem(raw(o, id, "{\"ops\":[]}", "s-empty"), 400, BAD, "s-empty");
    problem(raw(o, id, "{\"ops\":[{\"op\":\"drop\"}]}", "s-op"), 400, BAD, "s-op");
    String valueOnQuestion =
        "{\"ops\":[{\"op\":\"setCell\",\"row\":\"r:x\",\"col\":\"status\",\"value\":\"1\"}]}";
    problem(raw(o, id, valueOnQuestion, "s-missing-row"), 404, MISSING, "s-missing-row");
    String badColor =
        "{\"ops\":[{\"op\":\"addRow\",\"id\":\"x\"},"
            + "{\"op\":\"setCell\",\"row\":\"r:x\",\"col\":\"status\",\"format\":{\"fill\":\"red\"}}]}";
    problem(raw(o, id, badColor, "s-color"), 400, BAD, "s-color")
        .andExpect(jsonPath("$.errors[0].field").value("format"));
    // A participant's own columns are answers; only an operator column takes a value there.
    String answerValue =
        "{\"ops\":[{\"op\":\"setCell\",\"row\":\"p:"
            + UUID.randomUUID()
            + "\",\"col\":\"status\",\"value\":\"1\"}]}";
    problem(raw(o, id, answerValue, "s-col"), 400, BAD, "s-col")
        .andExpect(jsonPath("$.errors[0].field").value("col"));
    // A refused request stores nothing.
    assertThat(storedCount(id)).isZero();

    ok(raw(o, id, add, "s-ok"));
    lifecycle(id, "ARCHIVED");
    String rename = "{\"ops\":[{\"op\":\"updateColumn\",\"id\":\"a\",\"label\":\"새 이름\"}]}";
    problem(raw(o, id, rename, "s-archived"), 409, "EVENT_ARCHIVED", "s-archived");
    JsonNode kept = json.readTree(ok(get(path(id)).cookie(o)));
    assertThat(kept.get("doc").get("columns").get(0).get("label").asString()).isEqualTo("열");
  }

  private MockHttpServletRequestBuilder raw(
      Cookie session, UUID eventId, String body, String requestId) {
    return post(path(eventId) + "/ops")
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
    return "/api/v1/operator/events/" + eventId + "/roster-sheet";
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
        "SELECT count(*) FROM event_roster_sheets WHERE event_id = ?", Integer.class, eventId);
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
