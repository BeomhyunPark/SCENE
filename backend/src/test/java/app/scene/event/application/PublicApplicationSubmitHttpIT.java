package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.participant.Digests;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Public first submit. The form is opened with the existing activate command. A repeated phone
 * creates another participant. A missing event on the session route follows the public
 * event-missing code.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class PublicApplicationSubmitHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  RequestMappingHandlerMapping handlers;

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
  void closedAndMissingFormsWriteNothing() throws Exception {
    Held event = openEvent("Closed owner");
    Opened form = createForm(event);
    String body = answers(form.nameId, "김", form.phoneId, "010-1234-5678");

    problem(publicSubmit(form.eventId, form.formId, body, "req-closed"), 409, "FORM_CLOSED");
    problem(
        publicSubmit(form.eventId, UUID.randomUUID(), body, "req-missing-form"),
        404,
        "FORM_NOT_FOUND");
    problem(
        publicSubmit(UUID.randomUUID(), form.formId, body, "req-missing-event"),
        404,
        "RESOURCE_NOT_FOUND");
    assertThat(applicationCount(form.eventId)).isZero();
    assertThat(participantCount(form.eventId)).isZero();
    assertThat(accessCount(form.eventId)).isZero();
  }

  @Test
  void openSubmitStoresSourceAndASecondPhoneCreatesAnotherParticipant() throws Exception {
    Held event = openEvent("Open owner");
    Opened form = createForm(event);
    ok(
        write(
            post("/api/v1/operator/events/" + form.eventId + "/activate"),
            event.owner,
            "{\"expectedLifecycleVersion\":0}",
            "req-activate"));
    ok(
        write(
            patch("/api/v1/operator/events/" + form.eventId + "/forms/" + form.formId),
            event.owner,
            "{\"acceptingApplications\":true}",
            "req-open"));
    int audits = auditCount(form.eventId);
    String body = answers(form.nameId, "  김  ", form.phoneId, "010-1234-5678");

    String created = created(publicSubmit(form.eventId, form.formId, body, "req-submit"));
    JsonNode response = json.readTree(created);
    assertThat(response.propertyNames())
        .containsExactly("applicationId", "participantId", "accessKey");
    UUID applicationId = UUID.fromString(response.get("applicationId").asString());
    UUID participantId = UUID.fromString(response.get("participantId").asString());
    String accessKey = response.get("accessKey").asString();
    assertThat(accessKey).hasSize(64).matches("[0-9a-f]+");
    assertThat(created).doesNotContain("key_hash", "phone_hash");

    assertThat(statusOf(applicationId)).isEqualTo("SUBMITTED");
    assertThat(participantOf(applicationId)).isEqualTo(participantId);
    assertThat(answerCount(applicationId)).isEqualTo(2);
    assertThat(storedName(participantId)).isEqualTo("김");
    assertThat(storedPhone(participantId)).isEqualTo("010-1234-5678");
    assertThat(storedLast4(participantId)).isEqualTo("5678");
    assertThat(storedPhoneHash(participantId)).isEqualTo(Digests.sha256Hex("010-1234-5678"));
    assertThat(storedKeyHash(participantId)).isEqualTo(Digests.sha256Hex(accessKey));
    assertThat(countKey(accessKey)).isZero();
    assertThat(answerText(applicationId)).doesNotContain(accessKey);
    assertThat(auditCount(form.eventId)).isEqualTo(audits);

    String detail =
        ok(
            get("/api/v1/operator/events/" + form.eventId + "/applications/" + applicationId)
                .cookie(event.owner)
                .header("X-Request-Id", "req-detail"));
    JsonNode answers = json.readTree(detail).get("answers");
    assertThat(answers).hasSize(2);
    assertThat(answers.get(0).get("systemKey").asString()).isEqualTo("NAME");
    assertThat(answers.get(0).get("value").get("text").asString()).isEqualTo("김");
    assertThat(answers.get(1).get("systemKey").asString()).isEqualTo("PHONE");
    assertThat(answers.get(1).get("value").get("text").asString()).isEqualTo("010-1234-5678");
    assertThat(detail).doesNotContain(accessKey);

    String again = created(publicSubmit(form.eventId, form.formId, body, "req-again"));
    assertThat(again).doesNotContain("DUPLICATE_APPLICATION");
    assertThat(participantCount(form.eventId)).isEqualTo(2);
    assertThat(applicationCount(form.eventId)).isEqualTo(2);
    assertThat(json.readTree(again).get("participantId").asString())
        .isNotEqualTo(participantId.toString());
    assertThat(json.readTree(again).get("accessKey").asString()).isNotEqualTo(accessKey);

    problem(
        publicSubmit(form.eventId, form.formId, answers(form.phoneId, "01099998888"), "req-name"),
        400,
        "APPLICATION_VALIDATION_FAILED");
    problem(
        publicSubmit(
            form.eventId, form.formId, answers(form.nameId, "김", form.phoneId, "123"), "req-short"),
        400,
        "APPLICATION_VALIDATION_FAILED");
    assertThat(applicationCount(form.eventId)).isEqualTo(2);
    assertThat(participantCount(form.eventId)).isEqualTo(2);
  }

  @Test
  void missingEventSessionIsNotFound() throws Exception {
    for (RequestMappingInfo info : handlers.getHandlerMethods().keySet()) {
      for (String pattern : info.getPatternValues()) {
        if (pattern.contains("/applications")) {
          for (RequestMethod method : info.getMethodsCondition().getMethods()) {
            if (pattern.startsWith("/api/v1/public/")) {
              assertThat(method).isEqualTo(RequestMethod.POST);
            }
          }
        }
      }
    }
    mvc.perform(
            post("/api/v1/public/events/" + UUID.randomUUID() + "/participant-sessions")
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"accessKey\":\"not-a-stored-key\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"))
        .andExpect(jsonPath("$.type").value("urn:scene:problem:resource-not-found"));
  }

  private String answers(UUID nameId, String name, UUID phoneId, String phone) {
    return "{\"answers\":["
        + "{\"fieldId\":\""
        + nameId
        + "\",\"text\":\""
        + name
        + "\"},"
        + "{\"fieldId\":\""
        + phoneId
        + "\",\"text\":\""
        + phone
        + "\"}]}";
  }

  private String answers(UUID phoneId, String phone) {
    return "{\"answers\":[{\"fieldId\":\"" + phoneId + "\",\"text\":\"" + phone + "\"}]}";
  }

  private MockHttpServletRequestBuilder publicSubmit(
      UUID eventId, UUID formId, String body, String requestId) {
    return post("/api/v1/public/events/" + eventId + "/forms/" + formId + "/applications")
        .cookie(csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .header("Idempotency-Key", "same-key")
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

  private void problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code));
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
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

  private Opened createForm(Held event) throws Exception {
    String created =
        mvc.perform(
                write(
                    post("/api/v1/operator/events/" + event.eventId + "/forms"),
                    event.owner,
                    "{\"customLabel\":\"식사\"}",
                    "req-form"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode body = json.readTree(created);
    return new Opened(
        event.eventId,
        UUID.fromString(body.get("formId").asString()),
        UUID.fromString(body.get("fields").get(0).get("fieldId").asString()),
        UUID.fromString(body.get("fields").get(1).get("fieldId").asString()));
  }

  private Held openEvent(String memberName) throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home");
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, memberName);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, memberId);
    Cookie owner =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + memberId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(owner).isNotNull();
    String created =
        mvc.perform(
                write(
                    post("/api/v1/operator/spaces/" + spaceId + "/events"),
                    owner,
                    "{\"name\":\"행사\"}",
                    "req-" + memberName))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    return new Held(eventId, owner);
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private int applicationCount(UUID eventId) {
    return count("applications", eventId);
  }

  private int participantCount(UUID eventId) {
    return count("participants", eventId);
  }

  private int accessCount(UUID eventId) {
    return count("participant_access", eventId);
  }

  private int count(String table, UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE event_id = ?", Integer.class, eventId);
  }

  private int answerCount(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM answers WHERE application_id = ?", Integer.class, applicationId);
  }

  private String statusOf(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT status FROM applications WHERE id = ?", String.class, applicationId);
  }

  private UUID participantOf(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT participant_id FROM applications WHERE id = ?", UUID.class, applicationId);
  }

  private String storedName(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT name FROM participants WHERE id = ?", String.class, participantId);
  }

  private String storedPhone(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT phone FROM participants WHERE id = ?", String.class, participantId);
  }

  private String storedLast4(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT phone_last4 FROM participants WHERE id = ?", String.class, participantId);
  }

  private String storedPhoneHash(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT phone_hash FROM participants WHERE id = ?", String.class, participantId);
  }

  private String storedKeyHash(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT key_hash FROM participant_access WHERE participant_id = ?",
        String.class,
        participantId);
  }

  private int countKey(String rawKey) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM participant_access WHERE key_hash = ?", Integer.class, rawKey);
    return count == null ? 0 : count;
  }

  private String answerText(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT string_agg(value::text, ',') FROM answers WHERE application_id = ?",
        String.class,
        applicationId);
  }

  private int auditCount(UUID eventId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
    return count == null ? 0 : count;
  }

  private record Held(UUID eventId, Cookie owner) {}

  private record Opened(UUID eventId, UUID formId, UUID nameId, UUID phoneId) {}
}
