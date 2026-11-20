package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
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
  void openSubmitStoresSourceAndTheSamePhoneIsTheSameParticipant() throws Exception {
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
        .containsExactly(
            "applicationId",
            "participantId",
            "revision",
            "revised",
            "completionNotice",
            "restored");
    assertThat(response.get("completionNotice").isNull()).isTrue();
    UUID applicationId = UUID.fromString(response.get("applicationId").asString());
    UUID participantId = UUID.fromString(response.get("participantId").asString());
    String accessKey = "730914";
    assertThat(created).doesNotContain("key_hash", "phone_hash", "pin_hash", accessKey);

    assertThat(statusOf(applicationId)).isEqualTo("SUBMITTED");
    assertThat(participantOf(applicationId)).isEqualTo(participantId);
    assertThat(answerCount(applicationId)).isEqualTo(2);
    assertThat(storedName(participantId)).isEqualTo("김");
    assertThat(storedPhone(participantId)).isEqualTo("010-1234-5678");
    assertThat(storedLast4(participantId)).isEqualTo("5678");
    assertThat(storedPhoneHash(participantId)).isEqualTo(Digests.sha256Hex("010-1234-5678"));
    assertThat(accessCount(form.eventId)).isZero();
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

    // DEC-078: the same phone is the same participant. Same answers and number change nothing.
    String again = ok(publicSubmit(form.eventId, form.formId, body, "req-again"));
    assertThat(participantCount(form.eventId)).isEqualTo(1);
    assertThat(applicationCount(form.eventId)).isEqualTo(1);
    assertThat(json.readTree(again).get("participantId").asString())
        .isEqualTo(participantId.toString());
    assertThat(json.readTree(again).get("revised").asBoolean()).isTrue();
    assertThat(json.readTree(again).get("revision").asInt()).isEqualTo(1);
    // Another number on the same digits is "already applied" with nothing from the first answers.
    String other =
        answers(form.nameId, "김", form.phoneId, "01012345678").replace("730914", "482915");
    JsonNode exists =
        problem(
            publicSubmit(form.eventId, form.formId, other, "req-exists"),
            409,
            "APPLICATION_ALREADY_EXISTS");
    assertThat(exists.toString()).doesNotContain("010-1234-5678", applicationId.toString());
    assertThat(participantCount(form.eventId)).isEqualTo(1);

    problem(
        publicSubmit(form.eventId, form.formId, answers(form.phoneId, "01099998888"), "req-name"),
        400,
        "APPLICATION_VALIDATION_FAILED");
    problem(
        publicSubmit(
            form.eventId, form.formId, answers(form.nameId, "김", form.phoneId, "123"), "req-short"),
        400,
        "APPLICATION_VALIDATION_FAILED");
    assertThat(applicationCount(form.eventId)).isEqualTo(1);
    assertThat(participantCount(form.eventId)).isEqualTo(1);
  }

  @Test
  void typedQuestionsFollowConditionsAndLockAfterTheFirstSubmit() throws Exception {
    Held event = openEvent("Typed owner");
    Opened form = createForm(event);
    String fieldsPath =
        "/api/v1/operator/events/" + form.eventId + "/forms/" + form.formId + "/fields";

    JsonNode withAttendance =
        json.readTree(
            created(
                write(
                    post(fieldsPath),
                    event.owner,
                    "{\"label\":\"참석 방식\",\"answerType\":\"SINGLE_CHOICE\",\"required\":true,"
                        + "\"config\":{\"options\":[{\"label\":\"전체\"},{\"label\":\"부분\"}],"
                        + "\"display\":\"BUTTONS\"}}",
                    "req-attendance")));
    JsonNode attendance = withAttendance.get("fields").get(4);
    assertThat(attendance.get("answerType").asString()).isEqualTo("SINGLE_CHOICE");
    UUID attendanceId = UUID.fromString(attendance.get("fieldId").asString());
    String full = attendance.get("config").get("options").get(0).get("optionId").asString();
    String partial = attendance.get("config").get("options").get(1).get("optionId").asString();

    JsonNode withCar =
        json.readTree(
            created(
                write(
                    post(fieldsPath),
                    event.owner,
                    "{\"label\":\"자차로 오나요?\",\"answerType\":\"YES_NO\",\"required\":true,"
                        + "\"showWhen\":{\"fieldId\":\""
                        + attendanceId
                        + "\",\"optionIds\":[\""
                        + partial
                        + "\"]}}",
                    "req-car")));
    UUID carId = UUID.fromString(withCar.get("fields").get(5).get("fieldId").asString());

    JsonNode withConsent =
        json.readTree(
            created(
                write(
                    post(fieldsPath),
                    event.owner,
                    "{\"label\":\"개인정보 수집에 동의합니다\",\"answerType\":\"YES_NO\","
                        + "\"required\":true,\"config\":{\"style\":\"CONSENT\"}}",
                    "req-consent")));
    UUID consentId = UUID.fromString(withConsent.get("fields").get(6).get("fieldId").asString());

    problem(
        write(
            post(fieldsPath),
            event.owner,
            "{\"label\":\"뒤를 가리킴\",\"answerType\":\"SHORT_TEXT\","
                + "\"showWhen\":{\"fieldId\":\""
                + form.nameId
                + "\",\"equals\":true}}",
            "req-bad-condition"),
        400,
        "VALIDATION_FAILED");

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

    JsonNode publicForm =
        json.readTree(
            ok(
                get("/api/v1/public/events/" + form.eventId + "/forms/" + form.formId)
                    .header("X-Request-Id", "req-public")));
    assertThat(publicForm.get("fields")).hasSize(6);
    assertThat(publicForm.get("fields").get(4).get("showWhen").get("fieldId").asString())
        .isEqualTo(attendanceId.toString());

    String nameAndPhone =
        "{\"fieldId\":\""
            + form.nameId
            + "\",\"text\":\"김\"},{\"fieldId\":\""
            + form.phoneId
            + "\",\"text\":\"010-1234-5678\"}";
    String fullAttendance =
        ",{\"fieldId\":\"" + attendanceId + "\",\"value\":{\"optionId\":\"" + full + "\"}}";
    String staleCar = ",{\"fieldId\":\"" + carId + "\",\"value\":{\"value\":true}}";
    String consent = ",{\"fieldId\":\"" + consentId + "\",\"value\":{\"value\":true}}";

    problem(
        publicSubmit(
            form.eventId,
            form.formId,
            "{\"pin\":\"730914\",\"answers\":[" + nameAndPhone + fullAttendance + "]}",
            "req-no-consent"),
        400,
        "APPLICATION_VALIDATION_FAILED");
    assertThat(applicationCount(form.eventId)).isZero();

    String submitted =
        created(
            publicSubmit(
                form.eventId,
                form.formId,
                "{\"pin\":\"730914\",\"answers\":["
                    + nameAndPhone
                    + fullAttendance
                    + staleCar
                    + consent
                    + "]}",
                "req-typed"));
    UUID applicationId = UUID.fromString(json.readTree(submitted).get("applicationId").asString());
    assertThat(answerCount(applicationId)).isEqualTo(4);
    assertThat(answerText(applicationId)).contains(full);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM answers WHERE application_id = ? AND field_id = ?",
                Integer.class,
                applicationId,
                carId))
        .isZero();

    String carPath = fieldsPath + "/" + carId;
    String attendancePath = fieldsPath + "/" + attendanceId;
    problem(
        write(patch(attendancePath), event.owner, "{\"answerType\":\"DROPDOWN\"}", "req-type"),
        409,
        "FIELD_LOCKED");
    problem(
        write(
            patch(attendancePath),
            event.owner,
            "{\"config\":{\"options\":[{\"optionId\":\"" + full + "\",\"label\":\"전체\"}]}}",
            "req-drop-option"),
        409,
        "FIELD_LOCKED");
    problem(
        write(patch(carPath), event.owner, "{\"showWhen\":null}", "req-condition"),
        409,
        "FIELD_LOCKED");
    mvc.perform(
            delete(carPath)
                .cookie(event.owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-delete-locked"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("FIELD_LOCKED"));

    JsonNode renamed =
        json.readTree(
            ok(
                write(
                    patch(attendancePath),
                    event.owner,
                    "{\"label\":\"참석 형태\",\"config\":{\"options\":["
                        + "{\"optionId\":\""
                        + full
                        + "\",\"label\":\"전체 참석\"},"
                        + "{\"optionId\":\""
                        + partial
                        + "\",\"label\":\"부분\",\"hidden\":true},"
                        + "{\"label\":\"집회만\"}],\"display\":\"BUTTONS\"}}",
                    "req-rename-options")));
    assertThat(renamed.get("locked").booleanValue()).isTrue();
    JsonNode options = renamed.get("fields").get(4).get("config").get("options");
    assertThat(options).hasSize(3);
    assertThat(options.get(0).get("optionId").asString()).isEqualTo(full);
    assertThat(options.get(0).get("label").asString()).isEqualTo("전체 참석");

    ok(write(patch(carPath), event.owner, "{\"hidden\":true}", "req-hide"));
    JsonNode afterHide =
        json.readTree(
            ok(
                get("/api/v1/public/events/" + form.eventId + "/forms/" + form.formId)
                    .header("X-Request-Id", "req-public-hidden")));
    assertThat(afterHide.get("fields")).hasSize(5);
    assertThat(afterHide.get("fields").get(3).get("config").get("options")).hasSize(2);

    problem(
        write(
            put(fieldsPath + "/order"),
            event.owner,
            "{\"fieldIds\":[\""
                + form.nameId
                + "\",\""
                + form.phoneId
                + "\",\""
                + form.cohortId
                + "\",\""
                + carId
                + "\",\""
                + attendanceId
                + "\",\""
                + withAttendance.get("fields").get(3).get("fieldId").asString()
                + "\",\""
                + consentId
                + "\"]}",
            "req-bad-order"),
        400,
        "VALIDATION_FAILED");
    JsonNode reordered =
        json.readTree(
            ok(
                write(
                    put(fieldsPath + "/order"),
                    event.owner,
                    "{\"fieldIds\":[\""
                        + form.nameId
                        + "\",\""
                        + form.phoneId
                        + "\",\""
                        + form.cohortId
                        + "\",\""
                        + consentId
                        + "\",\""
                        + withAttendance.get("fields").get(3).get("fieldId").asString()
                        + "\",\""
                        + attendanceId
                        + "\",\""
                        + carId
                        + "\"]}",
                    "req-order")));
    assertThat(reordered.get("fields").get(3).get("fieldId").asString())
        .isEqualTo(consentId.toString());
    assertThat(reordered.get("fields").get(6).get("position").asInt()).isEqualTo(6);
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

  @Test
  void completionNoticeIsPlainTextReturnedOnSubmitAndStaysEditableAfterSubmit() throws Exception {
    Held event = openEvent("Notice owner");
    Opened form = createForm(event);
    String formPath = "/api/v1/operator/events/" + form.eventId + "/forms/" + form.formId;
    String noticePath = formPath + "/completion-notice";
    ok(
        write(
            post("/api/v1/operator/events/" + form.eventId + "/activate"),
            event.owner,
            "{\"expectedLifecycleVersion\":0}",
            "req-notice-activate"));
    ok(write(patch(formPath), event.owner, "{\"acceptingApplications\":true}", "req-notice-open"));

    String saved =
        ok(
            write(
                put(noticePath),
                event.owner,
                "{\"completionNotice\":\"  참가비 3만원\\r\\n신한 110-000 <b>홍길동</b>\\r\\n"
                    + "https://example.com/a?b=1&c=2  \"}",
                "req-notice-put"));
    String expected = "참가비 3만원\n신한 110-000 <b>홍길동</b>\nhttps://example.com/a?b=1&c=2";
    assertThat(json.readTree(saved).get("completionNotice").asString()).isEqualTo(expected);
    assertThat(storedNotice(form.formId)).isEqualTo(expected);
    assertThat(
            json.readTree(ok(get(formPath).cookie(event.owner))).get("completionNotice").asString())
        .isEqualTo(expected);

    String publicForm = ok(get("/api/v1/public/events/" + form.eventId + "/forms/" + form.formId));
    assertThat(json.readTree(publicForm).propertyNames()).containsExactly("formId", "fields");

    String body = answers(form.nameId, "김", form.phoneId, "010-2222-3333");
    JsonNode submitted =
        json.readTree(created(publicSubmit(form.eventId, form.formId, body, "req-notice-submit")));
    assertThat(submitted.get("completionNotice").asString()).isEqualTo(expected);

    // Submitted applications lock questions, not the notice.
    String edited =
        ok(
            write(
                put(noticePath),
                event.owner,
                "{\"completionNotice\":\"문의 010-0000-0000\"}",
                "req-notice-edit"));
    assertThat(json.readTree(edited).get("locked").booleanValue()).isTrue();
    assertThat(json.readTree(edited).get("completionNotice").asString())
        .isEqualTo("문의 010-0000-0000");

    String tooLong = "가".repeat(1001);
    mvc.perform(
            write(
                put(noticePath),
                event.owner,
                "{\"completionNotice\":\"" + tooLong + "\"}",
                "req-notice-long"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.errors[0].field").value("completionNotice"));
    problem(
        write(put(noticePath), event.owner, "{\"notice\":\"x\"}", "req-notice-key"),
        400,
        "VALIDATION_FAILED");
    problem(
        write(put(noticePath), event.owner, "{}", "req-notice-empty-body"),
        400,
        "VALIDATION_FAILED");
    problem(
        write(put(noticePath), event.owner, "{\"completionNotice\":3}", "req-notice-type"),
        400,
        "VALIDATION_FAILED");
    assertThat(storedNotice(form.formId)).isEqualTo("문의 010-0000-0000");
    ok(
        write(
            put(noticePath),
            event.owner,
            "{\"completionNotice\":\"" + "가".repeat(1000) + "\"}",
            "req-notice-max"));

    String cleared =
        ok(write(put(noticePath), event.owner, "{\"completionNotice\":\"  \\n \"}", "req-clear"));
    assertThat(json.readTree(cleared).get("completionNotice").isNull()).isTrue();
    assertThat(storedNotice(form.formId)).isNull();
    ok(write(put(noticePath), event.owner, "{\"completionNotice\":null}", "req-null"));
    assertThat(storedNotice(form.formId)).isNull();
    problem(
        write(
            put(
                "/api/v1/operator/events/"
                    + form.eventId
                    + "/forms/"
                    + UUID.randomUUID()
                    + "/completion-notice"),
            event.owner,
            "{\"completionNotice\":null}",
            "req-notice-missing"),
        404,
        "RESOURCE_NOT_FOUND");
  }

  private String answers(UUID nameId, String name, UUID phoneId, String phone) {
    return "{\"pin\":\"730914\",\"answers\":["
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
    return "{\"pin\":\"730914\",\"answers\":[{\"fieldId\":\""
        + phoneId
        + "\",\"text\":\""
        + phone
        + "\"}]}";
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

  private JsonNode problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    return json.readTree(
        mvc.perform(request)
            .andExpect(status().is(httpStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andReturn()
            .getResponse()
            .getContentAsString());
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
    // 또래 is turned off here so these cases keep the two always-on SYSTEM questions (DEC-070).
    mvc.perform(
            write(
                patch(
                    "/api/v1/operator/events/"
                        + event.eventId
                        + "/forms/"
                        + body.get("formId").asString()
                        + "/fields/"
                        + body.get("fields").get(2).get("fieldId").asString()),
                event.owner,
                "{\"hidden\":true}",
                "req-cohort-off"))
        .andExpect(status().isOk());
    return new Opened(
        event.eventId,
        UUID.fromString(body.get("formId").asString()),
        UUID.fromString(body.get("fields").get(0).get("fieldId").asString()),
        UUID.fromString(body.get("fields").get(1).get("fieldId").asString()),
        UUID.fromString(body.get("fields").get(2).get("fieldId").asString()));
  }

  private Held openEvent(String memberName) throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home");
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, memberName);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, memberId);
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

  private String storedNotice(UUID formId) {
    return jdbc.queryForObject(
        "SELECT completion_notice FROM forms WHERE id = ?", String.class, formId);
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

  private record Opened(UUID eventId, UUID formId, UUID nameId, UUID phoneId, UUID cohortId) {}
}
