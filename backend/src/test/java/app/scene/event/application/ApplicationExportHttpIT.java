package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.form.FieldRules;
import app.scene.event.form.FormRepository;
import app.scene.event.form.param.FieldValues;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applicant CSV (#233). Forms, applications and answers are seeded through the repositories, then
 * the file is downloaded over HTTP and parsed back as RFC 4180.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ApplicationExportHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final Instant FIRST = Instant.parse("2026-12-15T03:00:00Z");

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired FormRepository forms;
  @Autowired ApplicationRepository applications;

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
  void ownerDownloadsOneColumnPerQuestionWithEveryAnswerType() throws Exception {
    Held event = openEvent("Owner");
    Form form = seedForm(event);
    UUID first =
        application(
            event,
            form,
            "SUBMITTED",
            FIRST,
            form.answers(
                "{\"text\":\"김하나\"}",
                "{\"text\":\"010-1111-2222\"}",
                "{\"optionId\":\"opt_partial\"}",
                "{\"optionIds\":[\"opt_d1_dinner\",\"opt_old\"],\"other\":\"간식\"}",
                "{\"other\":\"직접 운전\"}",
                "{\"dateTime\":\"2027-01-22T14:30\"}",
                "{\"start\":\"2027-01-22\",\"end\":\"2027-01-24\"}",
                "{\"number\":3}",
                "{\"value\":true}",
                "{\"text\":\"첫 줄, 쉼표\\n둘째 줄 \\\"따옴표\\\"\"}",
                "{\"text\":\"=HYPERLINK(\\\"http://x\\\",\\\"y\\\")\"}",
                "{\"text\":\"숨긴답\"}"));
    application(
        event,
        form,
        "SUBMITTED",
        FIRST.plusSeconds(60),
        form.answers(
            "{\"text\":\"박둘\"}",
            "{\"text\":\"010-3333-4444\"}",
            "{\"optionId\":\"opt_full\"}",
            null,
            "{\"optionId\":\"opt_bus\"}",
            "{\"date\":\"2027-01-22\"}",
            null,
            "{\"number\":-2}",
            "{\"value\":false}",
            null,
            "{\"text\":\"+82 @x\"}",
            null));
    application(
        event,
        form,
        "WITHDRAWN",
        FIRST.plusSeconds(120),
        form.answers("{\"text\":\"철회자\"}", "{\"text\":\"010-9999-9999\"}"));
    int audits = auditCount(event.eventId);

    MockHttpServletResponse response = download(event.owner, event.eventId, "req-export");

    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentType()).isEqualTo("text/csv;charset=UTF-8");
    assertThat(response.getHeader("Content-Disposition"))
        .startsWith("attachment;")
        .contains("filename*=UTF-8''")
        .contains(".csv");
    assertThat(response.getHeader("Cache-Control")).contains("no-store");
    assertThat(response.getHeader("X-Export-Count")).isEqualTo("2");
    byte[] bytes = response.getContentAsByteArray();
    assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
    String text = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
    assertThat(text).endsWith("\r\n").doesNotContain("철회자", "010-9999-9999");

    List<List<String>> rows = parse(text);
    assertThat(rows).hasSize(3);
    assertThat(rows.get(0))
        .containsExactly(
            "제출 시각",
            "이름",
            "전화",
            "참석 방식",
            "식사",
            "이동",
            "도착",
            "기간",
            "인원",
            "동의",
            "메모",
            "공식",
            "옛 질문 (숨김)");
    assertThat(rows.get(1))
        .containsExactly(
            "2026. 12. 15. 12:00",
            "김하나",
            "010-1111-2222",
            "부분 참석",
            "1일차 저녁, 옛 보기 (숨김), 기타: 간식",
            "기타: 직접 운전",
            "2027. 1. 22. 14:30",
            "2027. 1. 22. ~ 2027. 1. 24.",
            "3 명",
            "동의함",
            "첫 줄, 쉼표\n둘째 줄 \"따옴표\"",
            "'=HYPERLINK(\"http://x\",\"y\")",
            "숨긴답");
    assertThat(rows.get(2))
        .containsExactly(
            "2026. 12. 15. 12:01",
            "박둘",
            "010-3333-4444",
            "전체 참석",
            "",
            "단체 차량",
            "2027. 1. 22.",
            "",
            "'-2 명",
            "동의 안 함",
            "",
            "'+82 @x",
            "");
    assertThat(text).contains("\"첫 줄, 쉼표\n둘째 줄 \"\"따옴표\"\"\"");

    assertThat(auditCount(event.eventId)).isEqualTo(audits + 1);
    List<String> details = auditDetails(event.eventId, "APPLICATIONS_EXPORTED");
    assertThat(details).hasSize(1);
    assertThat(json.readTree(details.get(0)).propertyNames()).containsExactly("count");
    assertThat(json.readTree(details.get(0)).get("count").asInt()).isEqualTo(2);
    assertThat(details.get(0))
        .doesNotContain("김하나", "010", "숨긴답", "HYPERLINK", first.toString(), "phone");
    assertThat(auditActor(event.eventId)).isEqualTo(event.ownerId);
  }

  @Test
  void readAccessAloneIsForbiddenAndAGrantDownloads() throws Exception {
    Held event = openEvent("Grant owner");
    Form form = seedForm(event);
    application(
        event, form, "SUBMITTED", FIRST, form.answers("{\"text\":\"김\"}", "{\"text\":\"010\"}"));
    UUID managerId = user("Manager");
    member(event.spaceId, managerId, "MEMBER");
    operator(event.spaceId, event.eventId, managerId, "MANAGER");
    UUID adminId = user("Space admin");
    member(event.spaceId, adminId, "ADMIN");
    UUID spaceOwnerId = user("Space owner");
    member(event.spaceId, spaceOwnerId, "OWNER");
    int audits = auditCount(event.eventId);

    problem(download(login(managerId), event.eventId, "req-manager"), 403, "FORBIDDEN");
    problem(download(login(adminId), event.eventId, "req-admin"), 403, "FORBIDDEN");
    problem(download(login(spaceOwnerId), event.eventId, "req-space-owner"), 403, "FORBIDDEN");
    assertThat(auditCount(event.eventId)).isEqualTo(audits);

    UUID staffId = user("Staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    effect(event, staffId, "DATA_EXPORT", "GRANT");
    MockHttpServletResponse granted = download(login(staffId), event.eventId, "req-staff");
    assertThat(granted.getStatus()).isEqualTo(200);
    assertThat(parse(csv(granted))).hasSize(2);
    assertThat(auditActor(event.eventId)).isEqualTo(staffId);

    jdbc.update(
        "DELETE FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        event.eventId,
        staffId);
    problem(download(login(staffId), event.eventId, "req-staff-revoked"), 403, "FORBIDDEN");
    assertThat(auditCount(event.eventId)).isEqualTo(audits + 1);
  }

  @Test
  void anotherSpaceAndAMissingEventAreNotFound() throws Exception {
    Held event = openEvent("Home owner");
    Form form = seedForm(event);
    application(
        event, form, "SUBMITTED", FIRST, form.answers("{\"text\":\"김\"}", "{\"text\":\"010\"}"));
    Held other = openEvent("Other owner");
    int audits = auditCount(event.eventId);

    problem(download(other.owner, event.eventId, "req-other"), 404, "RESOURCE_NOT_FOUND");
    problem(download(event.owner, UUID.randomUUID(), "req-missing"), 404, "RESOURCE_NOT_FOUND");
    assertThat(auditCount(event.eventId)).isEqualTo(audits);
    assertThat(auditCount(other.eventId)).isZero();
  }

  @Test
  void noApplicationsGivesTheHeaderOnly() throws Exception {
    Held event = openEvent("Empty owner");
    seedForm(event);

    MockHttpServletResponse response = download(event.owner, event.eventId, "req-empty");

    assertThat(response.getStatus()).isEqualTo(200);
    List<List<String>> rows = parse(csv(response));
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).get(0)).isEqualTo("제출 시각");
    assertThat(response.getHeader("X-Export-Count")).isEqualTo("0");
    List<String> details = auditDetails(event.eventId, "APPLICATIONS_EXPORTED");
    assertThat(details).hasSize(1);
    assertThat(json.readTree(details.get(0)).get("count").asInt()).isZero();

    Held formless = openEvent("Formless owner");
    MockHttpServletResponse none = download(formless.owner, formless.eventId, "req-formless");
    assertThat(none.getStatus()).isEqualTo(200);
    assertThat(parse(csv(none))).containsExactly(List.of("제출 시각"));
  }

  @Test
  void csrfIsRequired() throws Exception {
    Held event = openEvent("Csrf owner");
    mvc.perform(
            post(exportPath(event.eventId)).cookie(event.owner).header("X-Request-Id", "req-csrf"))
        .andExpect(status().isForbidden());
    assertThat(auditDetails(event.eventId, "APPLICATIONS_EXPORTED")).isEmpty();
  }

  // --- fixture ---

  /** Field ids in column order. {@link #answers} lines up stored values with them. */
  private record Form(UUID formId, List<UUID> fieldIds) {
    List<String> answers(String... values) {
      List<String> out = new ArrayList<>(Arrays.asList(values));
      while (out.size() < fieldIds.size()) {
        out.add(null);
      }
      return out;
    }
  }

  private Form seedForm(Held event) {
    UUID formId = UUID.randomUUID();
    forms.save(formId, event.spaceId, event.eventId);
    List<UUID> ids = new ArrayList<>();
    ids.add(field(event, formId, "SYSTEM", "NAME", "이름", 0, system("NAME")));
    ids.add(field(event, formId, "SYSTEM", "PHONE", "전화", 1, system("PHONE")));
    ids.add(custom(event, formId, "참석 방식", 2, "SINGLE_CHOICE", ATTENDANCE, false));
    ids.add(custom(event, formId, "식사", 3, "MULTI_CHOICE", MEALS, false));
    ids.add(custom(event, formId, "이동", 4, "DROPDOWN", TRANSPORT, false));
    ids.add(custom(event, formId, "도착", 5, "DATE", "{\"includeTime\":true}", false));
    ids.add(custom(event, formId, "기간", 6, "DATE_RANGE", "{}", false));
    ids.add(custom(event, formId, "인원", 7, "NUMBER", "{\"unit\":\"명\"}", false));
    ids.add(custom(event, formId, "동의", 8, "YES_NO", "{\"style\":\"CONSENT\"}", false));
    ids.add(custom(event, formId, "메모", 9, "LONG_TEXT", "{\"maxLength\":2000}", false));
    ids.add(custom(event, formId, "공식", 10, "SHORT_TEXT", "{\"maxLength\":200}", false));
    ids.add(custom(event, formId, "옛 질문", 11, "SHORT_TEXT", "{\"maxLength\":200}", true));
    return new Form(formId, ids);
  }

  private UUID field(
      Held event,
      UUID formId,
      String kind,
      String systemKey,
      String label,
      int position,
      FieldValues values) {
    UUID id = UUID.randomUUID();
    forms.saveField(
        id, event.spaceId, event.eventId, formId, kind, systemKey, label, position, values);
    return id;
  }

  private UUID custom(
      Held event,
      UUID formId,
      String label,
      int position,
      String type,
      String config,
      boolean hidden) {
    return field(
        event,
        formId,
        "CUSTOM",
        null,
        label,
        position,
        new FieldValues(type, false, null, config, null, hidden));
  }

  private UUID application(
      Held event, Form form, String status, Instant submittedAt, List<String> values) {
    UUID participantId = participant(event);
    UUID applicationId = UUID.randomUUID();
    List<AnswerInsert> answers = new ArrayList<>();
    for (int i = 0; i < values.size(); i++) {
      if (values.get(i) != null) {
        answers.add(
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                form.fieldIds().get(i),
                values.get(i)));
      }
    }
    applications.save(
        ApplicationInsert.of(
            applicationId,
            event.spaceId,
            event.eventId,
            form.formId(),
            participantId,
            status,
            submittedAt),
        answers);
    return applicationId;
  }

  private UUID participant(Held event) {
    UUID participantId = UUID.randomUUID();
    String hash = UUID.randomUUID().toString().replace("-", "");
    jdbc.update(
        """
        INSERT INTO participants (
          id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
        VALUES (?, ?, ?, '김', '01012345678', ?, '5678', ?, ?)
        """,
        participantId,
        event.spaceId,
        event.eventId,
        hash + hash,
        Timestamp.from(FIRST),
        Timestamp.from(FIRST));
    return participantId;
  }

  private MockHttpServletResponse download(Cookie session, UUID eventId, String requestId)
      throws Exception {
    return mvc.perform(exportRequest(session, eventId, requestId)).andReturn().getResponse();
  }

  private MockHttpServletRequestBuilder exportRequest(
      Cookie session, UUID eventId, String requestId) {
    return post(exportPath(eventId))
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId);
  }

  private void problem(MockHttpServletResponse response, int httpStatus, String code)
      throws Exception {
    assertThat(response.getStatus()).isEqualTo(httpStatus);
    assertThat(MediaType.parseMediaType(response.getContentType()))
        .isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
    assertThat(json.readTree(response.getContentAsString()).get("code").asString()).isEqualTo(code);
    assertThat(response.getContentAsString()).doesNotContain("010", "김하나");
  }

  private static String csv(MockHttpServletResponse response) {
    byte[] bytes = response.getContentAsByteArray();
    assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
    return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
  }

  /** RFC 4180 reader: quoted cells may hold commas, doubled quotes and line breaks. */
  static List<List<String>> parse(String text) {
    List<List<String>> rows = new ArrayList<>();
    List<String> row = new ArrayList<>();
    StringBuilder cell = new StringBuilder();
    boolean quoted = false;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (quoted) {
        if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
          cell.append('"');
          i++;
        } else if (c == '"') {
          quoted = false;
        } else {
          cell.append(c);
        }
      } else if (c == '"') {
        quoted = true;
      } else if (c == ',') {
        row.add(cell.toString());
        cell.setLength(0);
      } else if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
        row.add(cell.toString());
        cell.setLength(0);
        rows.add(row);
        row = new ArrayList<>();
        i++;
      } else {
        cell.append(c);
      }
    }
    assertThat(quoted).isFalse();
    assertThat(cell).isEmpty();
    assertThat(row).isEmpty();
    return rows;
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
    UUID spaceId = space("Home " + memberName);
    UUID memberId = user(memberName);
    member(spaceId, memberId, "MEMBER");
    Cookie owner = login(memberId);
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .header("X-Request-Id", "req-" + memberName.replace(' ', '-'))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"2027 겨울 수련회\"}"))
            .andExpect(status().isCreated())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.eventId").exists())
            .andExpect(header().doesNotExist("Content-Disposition"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    return new Held(spaceId, eventId, memberId, owner);
  }

  private static String exportPath(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/applications/export";
  }

  private UUID space(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", id, name);
    return id;
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

  private void effect(Held event, UUID userId, String permission, String effect) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, ?, ?, now())
        """,
        event.spaceId,
        event.eventId,
        userId,
        permission,
        effect,
        event.ownerId);
  }

  private int auditCount(UUID eventId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
    return count == null ? 0 : count;
  }

  private List<String> auditDetails(UUID eventId, String action) {
    return jdbc.query(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?"
            + " ORDER BY occurred_at",
        (rs, row) -> rs.getString(1),
        eventId,
        action);
  }

  private UUID auditActor(UUID eventId) {
    return jdbc.queryForObject(
        """
        SELECT actor_user_id FROM audit_logs
        WHERE event_id = ? AND action = 'APPLICATIONS_EXPORTED'
        ORDER BY occurred_at DESC, id DESC LIMIT 1
        """,
        UUID.class,
        eventId);
  }

  private record Held(UUID spaceId, UUID eventId, UUID ownerId, Cookie owner) {}

  private static FieldValues system(String systemKey) {
    return new FieldValues(
        "SHORT_TEXT", true, null, FieldRules.systemConfig(systemKey).toString(), null, false);
  }

  private static final String ATTENDANCE =
      """
      {"options": [
        {"optionId": "opt_full", "label": "전체 참석", "group": null, "hidden": false},
        {"optionId": "opt_partial", "label": "부분 참석", "group": null, "hidden": false}
      ]}
      """;

  private static final String MEALS =
      """
      {"options": [
        {"optionId": "opt_d1_dinner", "label": "저녁", "group": "1일차", "hidden": false},
        {"optionId": "opt_old", "label": "옛 보기", "group": null, "hidden": true}
      ], "allowOther": true}
      """;

  private static final String TRANSPORT =
      """
      {"options": [
        {"optionId": "opt_bus", "label": "단체 차량", "group": null, "hidden": false}
      ], "allowOther": true}
      """;
}
