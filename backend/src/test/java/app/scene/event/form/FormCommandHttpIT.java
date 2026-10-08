package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator form fields. An event owner creates one form. Submissions, access keys, and the closed
 * application codes stay out. The space-path event probe order is unchanged.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class FormCommandHttpIT {

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
  void ownerCreatesOneFormWithSystemFieldsAndAnOptionalCustomField() throws Exception {
    Held event = openEvent("Member");
    UUID adminId = user("Space Admin");
    member(event.spaceId, adminId, "ADMIN");
    Cookie admin = login(adminId);
    assertThat(formCount(event.eventId)).isZero();

    String created =
        created(
            write(post(forms(event.eventId)), event.owner, "{}", "req-create")
                .header("Idempotency-Key", "same-key"));
    JsonNode body = json.readTree(created);
    assertThat(body.propertyNames()).containsExactly("formId", "acceptingApplications", "fields");
    UUID formId = UUID.fromString(body.get("formId").asString());
    assertThat(body.get("acceptingApplications").asBoolean()).isFalse();
    assertThat(body.get("fields")).hasSize(2);
    assertField(body.get("fields").get(0), "SYSTEM", "NAME", "이름", 0);
    assertField(body.get("fields").get(1), "SYSTEM", "PHONE", "전화", 1);
    assertThat(created).doesNotContain("answer", "phone", "accessKey");
    assertThat(accepting(formId)).isFalse();
    assertThat(auditCount(event.eventId)).isZero();

    problem(
        write(post(forms(event.eventId)), event.owner, "{}", "req-second")
            .header("Idempotency-Key", "same-key"),
        409,
        "CONFLICT",
        "req-second");
    assertThat(formCount(event.eventId)).isEqualTo(1);
    assertThat(fieldCount(formId)).isEqualTo(2);

    UUID otherEvent = openEvent("Other").eventId;
    String withCustom =
        created(
            write(
                post(forms(otherEvent)),
                login(ownerOf(otherEvent)),
                "{\"customLabel\":\"  식사 여부  \"}",
                "req-custom"));
    JsonNode customBody = json.readTree(withCustom);
    assertThat(customBody.get("fields")).hasSize(3);
    assertField(customBody.get("fields").get(2), "CUSTOM", null, "식사 여부", 2);
    UUID customForm = UUID.fromString(customBody.get("formId").asString());
    assertThat(
            jdbc.queryForObject(
                "SELECT system_key FROM fields WHERE form_id = ? AND kind = 'CUSTOM'",
                String.class,
                customForm))
        .isNull();

    String listed = ok(read(event.owner, forms(event.eventId), "req-list"));
    JsonNode list = json.readTree(listed);
    assertThat(list.propertyNames()).containsExactly("items", "page");
    assertThat(list.get("items")).hasSize(1);
    assertThat(list.get("items").get(0).propertyNames())
        .containsExactly("formId", "acceptingApplications");
    assertThat(list.get("items").get(0).get("formId").asString()).isEqualTo(formId.toString());
    assertThat(list.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(listed).doesNotContain("이름", "fields");

    String detail = ok(read(admin, formPath(event.eventId, formId), "req-admin-read"));
    assertThat(json.readTree(detail).get("fields")).hasSize(2);
    assertThat(eventRole(event.eventId, adminId)).isNull();
    problem(
        write(post(forms(event.eventId)), admin, "{}", "req-admin-create"),
        403,
        "FORBIDDEN",
        "req-admin-create");
    assertThat(eventRole(event.eventId, adminId)).isNull();
    assertThat(formCount(event.eventId)).isEqualTo(1);

    problem(
        read(event.owner, forms(event.eventId) + "?sort=name,asc", "req-sort"),
        400,
        "VALIDATION_FAILED",
        "req-sort");
    problem(
        write(
            post(forms(otherEvent)),
            login(ownerOf(otherEvent)),
            "{\"customLabel\":\"   \"}",
            "req-blank"),
        400,
        "VALIDATION_FAILED",
        "req-blank");
    assertThat(formCount(otherEvent)).isEqualTo(1);
  }

  @Test
  void acceptingApplicationsRequiresAnActiveEvent() throws Exception {
    Held draft = openEvent("Draft owner");
    String created = created(write(post(forms(draft.eventId)), draft.owner, "{}", "req-form"));
    UUID formId = UUID.fromString(json.readTree(created).get("formId").asString());

    problem(
        write(
            patch(formPath(draft.eventId, formId)),
            draft.owner,
            "{\"acceptingApplications\":true}",
            "req-draft"),
        409,
        "INVALID_STATE_TRANSITION",
        "req-draft");
    assertThat(accepting(formId)).isFalse();
    problem(
        write(
            patch(formPath(draft.eventId, formId)),
            draft.owner,
            "{\"acceptingApplications\":true,\"lifecycleStatus\":\"ACTIVE\"}",
            "req-status"),
        400,
        "VALIDATION_FAILED",
        "req-status");
    assertThat(accepting(formId)).isFalse();
    assertThat(lifecycle(draft.eventId)).isEqualTo("DRAFT");

    ok(
        write(
            post(eventPath(draft.eventId) + "/activate"),
            draft.owner,
            "{\"expectedLifecycleVersion\":0}",
            "req-activate"));
    String opened =
        ok(
            write(
                patch(formPath(draft.eventId, formId)),
                draft.owner,
                "{\"acceptingApplications\":true}",
                "req-open"));
    assertThat(json.readTree(opened).get("acceptingApplications").asBoolean()).isTrue();
    assertThat(accepting(formId)).isTrue();

    Held ended = openEvent("Ended owner");
    ok(
        write(
            post(eventPath(ended.eventId) + "/activate"),
            ended.owner,
            "{\"expectedLifecycleVersion\":0}",
            "req-activate-ended"));
    ok(
        write(
            post(eventPath(ended.eventId) + "/end"),
            ended.owner,
            "{\"expectedLifecycleVersion\":1}",
            "req-end"));
    String endedForm =
        created(write(post(forms(ended.eventId)), ended.owner, "{}", "req-ended-form"));
    UUID endedFormId = UUID.fromString(json.readTree(endedForm).get("formId").asString());
    problem(
        write(
            patch(formPath(ended.eventId, endedFormId)),
            ended.owner,
            "{\"acceptingApplications\":true}",
            "req-ended"),
        409,
        "INVALID_STATE_TRANSITION",
        "req-ended");
    assertThat(accepting(endedFormId)).isFalse();
    String closed =
        ok(
            write(
                patch(formPath(ended.eventId, endedFormId)),
                ended.owner,
                "{\"acceptingApplications\":false}",
                "req-close"));
    assertThat(json.readTree(closed).get("acceptingApplications").asBoolean()).isFalse();
    assertThat(accepting(endedFormId)).isFalse();
  }

  @Test
  void systemFieldStaysAndCustomFieldCanBeRemoved() throws Exception {
    Held event = openEvent("Field owner");
    String created =
        created(
            write(
                post(forms(event.eventId)), event.owner, "{\"customLabel\":\"팀\"}", "req-create"));
    JsonNode body = json.readTree(created);
    UUID formId = UUID.fromString(body.get("formId").asString());
    UUID nameId = UUID.fromString(body.get("fields").get(0).get("fieldId").asString());
    UUID customId = UUID.fromString(body.get("fields").get(2).get("fieldId").asString());

    problem(
        write(
            post(fields(event.eventId, formId)),
            event.owner,
            "{\"label\":\"둘째\"}",
            "req-second-custom"),
        400,
        "VALIDATION_FAILED",
        "req-second-custom");
    assertThat(fieldCount(formId)).isEqualTo(3);

    String renamed =
        ok(
            write(
                patch(fieldPath(event.eventId, formId, nameId)),
                event.owner,
                "{\"label\":\"  성함  \"}",
                "req-rename"));
    JsonNode name = fieldNode(json.readTree(renamed), nameId);
    assertThat(name.get("label").asString()).isEqualTo("성함");
    assertThat(name.get("kind").asString()).isEqualTo("SYSTEM");
    assertThat(name.get("systemKey").asString()).isEqualTo("NAME");
    assertThat(storedLabel(nameId)).isEqualTo("성함");
    assertThat(storedKind(nameId)).isEqualTo("SYSTEM");
    assertThat(storedSystemKey(nameId)).isEqualTo("NAME");

    problem(
        write(
            patch(fieldPath(event.eventId, formId, nameId)),
            event.owner,
            "{\"label\":\"바꾸면 안 됨\",\"kind\":\"CUSTOM\"}",
            "req-kind"),
        400,
        "VALIDATION_FAILED",
        "req-kind");
    assertThat(storedLabel(nameId)).isEqualTo("성함");
    assertThat(storedKind(nameId)).isEqualTo("SYSTEM");

    mvc.perform(
            delete(fieldPath(event.eventId, formId, nameId))
                .cookie(event.owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-delete-system"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));
    assertThat(storedKind(nameId)).isEqualTo("SYSTEM");

    mvc.perform(
            delete(fieldPath(event.eventId, formId, customId))
                .cookie(event.owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-delete-custom"))
        .andExpect(status().isNoContent())
        .andExpect(content().string(""));
    assertThat(fieldCount(formId)).isEqualTo(2);
    assertThat(customCount(formId)).isZero();
  }

  @Test
  void staffWithoutFormWriteCannotCreateAndTheProbeOrderStays() throws Exception {
    Held event = openEvent("Probe owner");
    UUID staffId = user("Staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    Cookie staff = login(staffId);
    problem(
        write(post(forms(event.eventId)), staff, "{}", "req-staff"), 403, "FORBIDDEN", "req-staff");
    assertThat(formCount(event.eventId)).isZero();

    UUID missingId = eventRow(event.spaceId, "hidden");
    UUID revokedId = eventRow(event.spaceId, "revoked");
    UUID deniedId = eventRow(event.spaceId, "denied");
    operator(event.spaceId, deniedId, staffId, "STAFF");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'EVENT_READ', 'REVOKE', ?, now())
        """,
        event.spaceId,
        deniedId,
        staffId,
        staffId);
    jdbc.update(
        """
        INSERT INTO audit_logs (id, space_id, event_id, actor_user_id, action, detail, occurred_at)
        VALUES (?, ?, ?, ?, 'EVENT_ACCESS_REVOKED', CAST(? AS jsonb), now())
        """,
        UUID.randomUUID(),
        event.spaceId,
        revokedId,
        staffId,
        "{\"userId\":\"" + staffId + "\"}");
    problem(
        read(staff, probe(event.spaceId, missingId), "req-probe-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-probe-missing");
    problem(
        read(staff, probe(event.spaceId, revokedId), "req-probe-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-probe-revoked");
    problem(
        read(staff, probe(event.spaceId, deniedId), "req-probe-denied"),
        403,
        "FORBIDDEN",
        "req-probe-denied");
    mvc.perform(get(forms(event.eventId)).header("X-Request-Id", "req-anon"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
  }

  private void assertField(
      JsonNode field, String kind, String systemKey, String label, int position) {
    assertThat(field.propertyNames())
        .containsExactly("fieldId", "kind", "systemKey", "label", "position");
    assertThat(field.get("kind").asString()).isEqualTo(kind);
    if (systemKey == null) {
      assertThat(field.get("systemKey").isNull()).isTrue();
    } else {
      assertThat(field.get("systemKey").asString()).isEqualTo(systemKey);
    }
    assertThat(field.get("label").asString()).isEqualTo(label);
    assertThat(field.get("position").asInt()).isEqualTo(position);
  }

  private static JsonNode fieldNode(JsonNode detail, UUID fieldId) {
    for (JsonNode field : detail.get("fields")) {
      if (fieldId.toString().equals(field.get("fieldId").asString())) {
        return field;
      }
    }
    throw new AssertionError("missing field " + fieldId);
  }

  private MockHttpServletRequestBuilder read(Cookie session, String path, String requestId) {
    return get(path).cookie(session).header("X-Request-Id", requestId);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body, String requestId) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andExpect(header().doesNotExist("Location"))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private void problem(
      MockHttpServletRequestBuilder request, int httpStatus, String code, String requestId)
      throws Exception {
    mvc.perform(request)
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
    UUID spaceId = space("Home");
    UUID memberId = user(memberName);
    member(spaceId, memberId, "MEMBER");
    Cookie owner = login(memberId);
    String created =
        created(write(post(events(spaceId)), owner, "{\"name\":\"행사\"}", "req-" + memberName));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    owners.put(eventId, memberId);
    return new Held(spaceId, eventId, owner);
  }

  private final java.util.Map<UUID, UUID> owners = new java.util.HashMap<>();

  private UUID ownerOf(UUID eventId) {
    return owners.get(eventId);
  }

  private static String events(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events";
  }

  private static String eventPath(UUID eventId) {
    return "/api/v1/operator/events/" + eventId;
  }

  private static String forms(UUID eventId) {
    return eventPath(eventId) + "/forms";
  }

  private static String formPath(UUID eventId, UUID formId) {
    return forms(eventId) + "/" + formId;
  }

  private static String fields(UUID eventId, UUID formId) {
    return formPath(eventId, formId) + "/fields";
  }

  private static String fieldPath(UUID eventId, UUID formId, UUID fieldId) {
    return fields(eventId, formId) + "/" + fieldId;
  }

  private static String probe(UUID spaceId, UUID eventId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events/" + eventId;
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

  private UUID eventRow(UUID spaceId, String name) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, 'DRAFT', 0)
        """,
        id,
        spaceId,
        name);
    return id;
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private int formCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM forms WHERE event_id = ?", Integer.class, eventId);
  }

  private int fieldCount(UUID formId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM fields WHERE form_id = ?", Integer.class, formId);
  }

  private int customCount(UUID formId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM fields WHERE form_id = ? AND kind = 'CUSTOM'", Integer.class, formId);
  }

  private boolean accepting(UUID formId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT accepting_applications FROM forms WHERE id = ?", Boolean.class, formId));
  }

  private String lifecycle(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?", String.class, eventId);
  }

  private String storedLabel(UUID fieldId) {
    return jdbc.queryForObject("SELECT label FROM fields WHERE id = ?", String.class, fieldId);
  }

  private String storedKind(UUID fieldId) {
    return jdbc.queryForObject("SELECT kind FROM fields WHERE id = ?", String.class, fieldId);
  }

  private String storedSystemKey(UUID fieldId) {
    return jdbc.queryForObject("SELECT system_key FROM fields WHERE id = ?", String.class, fieldId);
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

  private int auditCount(UUID eventId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
    return count == null ? 0 : count;
  }

  private record Held(UUID spaceId, UUID eventId, Cookie owner) {}
}
