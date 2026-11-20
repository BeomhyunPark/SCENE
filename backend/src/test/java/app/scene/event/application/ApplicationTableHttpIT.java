package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applicant table (#308). Forms, applications and answers are seeded through the repositories, as
 * in the CSV test, then the table is read over HTTP.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ApplicationTableHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";

  /**
   * A full phone value, not a bare "010": problem bodies carry random UUIDs (traceId, instance),
   * and a UUID can contain "010" by chance, which made the leak check fail at random.
   */
  private static final String LEAKED_PHONE = "010-4321-8765";

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
  void ownerReadsEveryAnswerTypeWithContactsGroupAndCheckIn() throws Exception {
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
                "{\"text\":\"메모\"}",
                "{\"text\":\"010-9876-5432\"}",
                "{\"text\":\"숨긴답\"}"));
    UUID second =
        application(
            event,
            form,
            "SUBMITTED",
            FIRST.plusSeconds(60),
            form.answers("{\"text\":\"박둘\"}", "{\"text\":\"010-3333-4444\"}"));
    application(
        event,
        form,
        "WITHDRAWN",
        FIRST.plusSeconds(120),
        form.answers("{\"text\":\"철회자\"}", "{\"text\":\"010-9999-9999\"}"));
    UUID groupId = group(event, "2조");
    assign(event, first, groupId, true);
    checkIn(event, first, "CHECKED_IN");
    checkIn(event, second, "CANCELLED");
    int audits = auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED");

    MockHttpServletResponse response = read(event.owner, event.eventId);

    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getHeader("Cache-Control")).contains("no-store");
    String body = response.getContentAsString();
    assertThat(body).doesNotContain("철회자", "010-9999-9999");
    JsonNode table = json.readTree(body);
    assertThat(table.get("formId").asString()).isEqualTo(form.formId().toString());
    assertThat(table.get("contactVisible").asBoolean()).isTrue();
    assertThat(table.get("groupVisible").asBoolean()).isTrue();

    JsonNode columns = table.get("columns");
    assertThat(labels(columns))
        .containsExactly(
            "이름", "전화", "참석 방식", "식사", "이동", "도착", "기간", "인원", "동의", "메모", "보호자 연락처", "옛 질문");
    assertThat(columns.get(0).get("systemKey").asString()).isEqualTo("NAME");
    assertThat(columns.get(0).get("presetKey").isNull()).isTrue();
    assertThat(columns.get(0).get("contact").asBoolean()).isFalse();
    assertThat(columns.get(1).get("contact").asBoolean()).isTrue();
    assertThat(columns.get(10).get("contact").asBoolean()).isTrue();
    assertThat(columns.get(3).get("answerType").asString()).isEqualTo("MULTI_CHOICE");
    assertThat(columns.get(3).get("config").get("options").get(1).get("hidden").asBoolean())
        .isTrue();
    assertThat(columns.get(11).get("hidden").asBoolean()).isTrue();

    JsonNode rows = table.get("rows");
    assertThat(rows).hasSize(2);
    assertThat(rows.get(0).get("applicationId").asString()).isEqualTo(first.toString());
    assertThat(rows.get(1).get("applicationId").asString()).isEqualTo(second.toString());
    assertThat(rows.get(0).get("submittedAt").asString()).isEqualTo("2026-12-15T03:00:00Z");
    assertThat(rows.get(0).get("group").get("name").asString()).isEqualTo("2조");
    assertThat(rows.get(0).get("group").get("groupId").asString()).isEqualTo(groupId.toString());
    assertThat(rows.get(0).get("group").get("leader").asBoolean()).isTrue();
    assertThat(rows.get(0).get("checkedInAt").asString()).isEqualTo("2026-12-15T03:00:00Z");
    assertThat(rows.get(1).get("group").isNull()).isTrue();
    assertThat(rows.get(1).get("checkedInAt").isNull()).isTrue();

    JsonNode a = rows.get(0).get("answers");
    assertThat(a.get(id(form, 0)).get("text").asString()).isEqualTo("김하나");
    assertThat(a.get(id(form, 1)).get("text").asString()).isEqualTo("010-1111-2222");
    assertThat(a.get(id(form, 2)).get("optionId").asString()).isEqualTo("opt_partial");
    assertThat(a.get(id(form, 3)).get("optionIds")).hasSize(2);
    assertThat(a.get(id(form, 3)).get("other").asString()).isEqualTo("간식");
    assertThat(a.get(id(form, 4)).get("other").asString()).isEqualTo("직접 운전");
    assertThat(a.get(id(form, 5)).get("dateTime").asString()).isEqualTo("2027-01-22T14:30");
    assertThat(a.get(id(form, 6)).get("end").asString()).isEqualTo("2027-01-24");
    assertThat(a.get(id(form, 7)).get("number").asInt()).isEqualTo(3);
    assertThat(a.get(id(form, 8)).get("value").asBoolean()).isTrue();
    assertThat(a.get(id(form, 10)).get("text").asString()).isEqualTo("010-9876-5432");
    assertThat(a.get(id(form, 11)).get("text").asString()).isEqualTo("숨긴답");
    JsonNode b = rows.get(1).get("answers");
    assertThat(b.propertyNames()).containsExactlyInAnyOrder(id(form, 0), id(form, 1));

    assertThat(auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED")).isEqualTo(audits + 1);
    String detail = auditDetail(event.eventId, "APPLICANT_CONTACTS_VIEWED");
    assertThat(json.readTree(detail).propertyNames()).containsExactly("count");
    assertThat(json.readTree(detail).get("count").asInt()).isEqualTo(2);
    assertThat(detail).doesNotContain("010-1111-2222", "010-9876-5432", "김하나");
  }

  @Test
  void readAccessOpensTheTableAndContactAndGroupFollowTheirOwnKeys() throws Exception {
    Held event = openEvent("Reader owner");
    Form form = seedForm(event);
    UUID applicationId =
        application(
            event,
            form,
            "SUBMITTED",
            FIRST,
            form.answers(
                "{\"text\":\"김\"}", "{\"text\":\"010-1234-5678\"}", "{\"optionId\":\"opt_full\"}"));
    assign(event, applicationId, group(event, "1조"), false);
    checkIn(event, applicationId, "CHECKED_IN");
    UUID staffId = user("Staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    UUID adminId = user("Space admin");
    member(event.spaceId, adminId, "ADMIN");
    UUID contactId = user("Contact staff");
    member(event.spaceId, contactId, "MEMBER");
    operator(event.spaceId, event.eventId, contactId, "STAFF");
    effect(event, contactId, "PARTICIPANT_CONTACT_READ", "GRANT");
    UUID grouperId = user("Group staff");
    member(event.spaceId, grouperId, "MEMBER");
    operator(event.spaceId, event.eventId, grouperId, "STAFF");
    effect(event, grouperId, "GROUP_WRITE", "GRANT");
    int audits = auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED");

    JsonNode staff = table(login(staffId), event.eventId);
    assertThat(staff.toString()).doesNotContain("010-1234-5678", "1조");
    assertThat(staff.get("contactVisible").asBoolean()).isFalse();
    assertThat(staff.get("groupVisible").asBoolean()).isFalse();
    assertThat(labels(staff.get("columns"))).doesNotContain("전화", "보호자 연락처").contains("이름");
    assertThat(staff.get("rows").get(0).get("answers").has(id(form, 1))).isFalse();
    assertThat(staff.get("rows").get(0).get("answers").get(id(form, 2)).get("optionId").asString())
        .isEqualTo("opt_full");
    assertThat(staff.get("rows").get(0).get("group").isNull()).isTrue();
    assertThat(staff.get("rows").get(0).get("checkedInAt").isNull()).isFalse();
    assertThat(auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED")).isEqualTo(audits);

    JsonNode admin = table(login(adminId), event.eventId);
    assertThat(admin.get("contactVisible").asBoolean()).isFalse();
    assertThat(admin.get("groupVisible").asBoolean()).isTrue();
    assertThat(admin.get("rows").get(0).get("group").get("name").asString()).isEqualTo("1조");
    assertThat(admin.toString()).doesNotContain("010-1234-5678");

    JsonNode contact = table(login(contactId), event.eventId);
    assertThat(contact.get("contactVisible").asBoolean()).isTrue();
    assertThat(contact.get("groupVisible").asBoolean()).isFalse();
    assertThat(contact.get("rows").get(0).get("answers").get(id(form, 1)).get("text").asString())
        .isEqualTo("010-1234-5678");
    assertThat(auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED")).isEqualTo(audits + 1);

    JsonNode grouper = table(login(grouperId), event.eventId);
    assertThat(grouper.get("groupVisible").asBoolean()).isTrue();
    assertThat(grouper.get("contactVisible").asBoolean()).isFalse();

    // DEC-079 Follow-up 2026-11-20: MANAGER sees contact and group columns by default.
    UUID managerId = user("Manager");
    member(event.spaceId, managerId, "MEMBER");
    operator(event.spaceId, event.eventId, managerId, "MANAGER");
    JsonNode manager = table(login(managerId), event.eventId);
    assertThat(manager.get("contactVisible").asBoolean()).isTrue();
    assertThat(manager.get("groupVisible").asBoolean()).isTrue();
    assertThat(manager.get("rows").get(0).get("answers").get(id(form, 1)).get("text").asString())
        .isEqualTo("010-1234-5678");
    assertThat(manager.get("rows").get(0).get("group").get("name").asString()).isEqualTo("1조");
    assertThat(auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED")).isEqualTo(audits + 2);
  }

  @Test
  void withoutReadAccessIsForbidden() throws Exception {
    Held event = openEvent("Forbidden owner");
    Form form = seedForm(event);
    application(
        event,
        form,
        "SUBMITTED",
        FIRST,
        form.answers("{\"text\":\"김하나\"}", "{\"text\":\"" + LEAKED_PHONE + "\"}"));
    UUID staffId = user("Revoked staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    effect(event, staffId, "EVENT_READ", "REVOKE");
    UUID memberId = user("Plain member");
    member(event.spaceId, memberId, "MEMBER");

    problem(read(login(staffId), event.eventId), 403, "FORBIDDEN");
    problem(read(login(memberId), event.eventId), 403, "FORBIDDEN");
  }

  @Test
  void anotherSpaceAndAMissingEventAreNotFound() throws Exception {
    Held event = openEvent("Home owner");
    Form form = seedForm(event);
    application(
        event,
        form,
        "SUBMITTED",
        FIRST,
        form.answers("{\"text\":\"김하나\"}", "{\"text\":\"" + LEAKED_PHONE + "\"}"));
    Held other = openEvent("Other owner");

    problem(read(other.owner, event.eventId), 404, "RESOURCE_NOT_FOUND");
    problem(read(event.owner, UUID.randomUUID()), 404, "RESOURCE_NOT_FOUND");
  }

  @Test
  void noApplicationsGivesColumnsWithoutRowsAndNoAudit() throws Exception {
    Held event = openEvent("Empty owner");
    seedForm(event);

    JsonNode table = table(event.owner, event.eventId);
    assertThat(table.get("columns")).hasSize(12);
    assertThat(table.get("rows")).isEmpty();
    assertThat(auditCount(event.eventId, "APPLICANT_CONTACTS_VIEWED")).isZero();

    Held formless = openEvent("Formless owner");
    JsonNode none = table(formless.owner, formless.eventId);
    assertThat(none.get("formId").isNull()).isTrue();
    assertThat(none.get("contactVisible").asBoolean()).isFalse();
    assertThat(none.get("columns")).isEmpty();
    assertThat(none.get("rows")).isEmpty();
  }

  private JsonNode table(Cookie session, UUID eventId) throws Exception {
    MockHttpServletResponse response = read(session, eventId);
    assertThat(response.getStatus()).isEqualTo(200);
    return json.readTree(response.getContentAsString());
  }

  private static List<String> labels(JsonNode columns) {
    List<String> labels = new ArrayList<>();
    columns.forEach(column -> labels.add(column.get("label").asString()));
    return labels;
  }

  private UUID participantOf(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT participant_id FROM applications WHERE id = ?", UUID.class, applicationId);
  }

  private UUID group(Held event, String name) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO groups (
          id, space_id, event_id, name, sort_order, version, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, now(), now())
        """,
        id,
        event.spaceId,
        event.eventId,
        name,
        event.ownerId);
    return id;
  }

  private void assign(Held event, UUID applicationId, UUID groupId, boolean leader) {
    jdbc.update(
        """
        INSERT INTO group_assignments (
          space_id, event_id, participant_id, group_id, leader, position, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, now())
        """,
        event.spaceId,
        event.eventId,
        participantOf(applicationId),
        groupId,
        leader,
        event.ownerId);
  }

  private void checkIn(Held event, UUID applicationId, String status) {
    boolean cancelled = "CANCELLED".equals(status);
    jdbc.update(
        """
        INSERT INTO checkins (
          id, space_id, event_id, participant_id, status, method, checked_in_at, checked_in_by,
          cancelled_at, cancelled_by)
        VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        event.spaceId,
        event.eventId,
        participantOf(applicationId),
        status,
        Timestamp.from(FIRST),
        event.ownerId,
        cancelled ? Timestamp.from(FIRST) : null,
        cancelled ? event.ownerId : null);
  }

  private int auditCount(UUID eventId, String action) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
            Integer.class,
            eventId,
            action);
    return count == null ? 0 : count;
  }

  private String auditDetail(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?"
            + " ORDER BY occurred_at DESC, id DESC LIMIT 1",
        String.class,
        eventId,
        action);
  }

  private MockHttpServletResponse read(Cookie session, UUID eventId) throws Exception {
    return mvc.perform(
            get("/api/v1/operator/events/" + eventId + "/applications/table")
                .cookie(session)
                .header("X-Request-Id", "req-table"))
        .andReturn()
        .getResponse();
  }

  private static String id(Form form, int index) {
    return form.fieldIds().get(index).toString();
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
    ids.add(
        custom(
            event,
            formId,
            "보호자 연락처",
            10,
            "SHORT_TEXT",
            "{\"maxLength\":50,\"format\":\"PHONE\"}",
            false));
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

  private void problem(MockHttpServletResponse response, int httpStatus, String code)
      throws Exception {
    assertThat(response.getStatus()).isEqualTo(httpStatus);
    assertThat(MediaType.parseMediaType(response.getContentType()))
        .isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
    assertThat(json.readTree(response.getContentAsString()).get("code").asString()).isEqualTo(code);
    assertThat(response.getContentAsString()).doesNotContain(LEAKED_PHONE, "김하나");
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
    member(spaceId, memberId, "OWNER");
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
