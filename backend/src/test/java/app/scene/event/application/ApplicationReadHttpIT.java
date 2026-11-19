package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.form.AnswerType;
import app.scene.event.form.FieldRules;
import app.scene.event.form.FormRepository;
import app.scene.event.form.param.FieldValues;
import app.scene.support.ParticipantSessions;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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
 * Operator reads of one seeded application. The form, then the application and its answers, are
 * inserted through the repositories. There is no HTTP create. Public submit stays closed. The
 * space-path event probe order is unchanged.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ApplicationReadHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final Instant SUBMITTED = Instant.parse("2026-10-08T03:00:00Z");

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired FormRepository forms;
  @Autowired ApplicationRepository applications;

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
  void ownerListsOneSubmittedApplicationWithoutAnswerText() throws Exception {
    Held event = openEvent("Owner");
    Seeded seeded = seed(event);
    UUID adminId = user("Space Admin");
    member(event.spaceId, adminId, "ADMIN");
    Cookie admin = login(adminId);
    int audits = auditCount(event.eventId);

    String listed =
        ok(
            read(event.owner, applications(event.eventId), "req-list")
                .header("Idempotency-Key", "ignored"));
    JsonNode list = json.readTree(listed);
    assertThat(list.propertyNames()).containsExactly("items", "page");
    assertThat(list.get("items")).hasSize(1);
    JsonNode item = list.get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactly("applicationId", "formId", "status", "submittedAt", "name");
    assertThat(item.get("name").asString()).isEqualTo("이름답");
    assertThat(item.get("applicationId").asString()).isEqualTo(seeded.applicationId.toString());
    assertThat(item.get("formId").asString()).isEqualTo(seeded.formId.toString());
    assertThat(item.get("status").asString()).isEqualTo("SUBMITTED");
    assertThat(item.get("submittedAt").asString()).isEqualTo("2026-10-08T03:00:00Z");
    assertThat(list.get("page").get("number").asInt()).isZero();
    assertThat(list.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(listed).doesNotContain("전화답", "커스텀답", "숨긴답", "answers", "phone", "PHONE");
    assertThat(auditCount(event.eventId)).isEqualTo(audits);

    String asAdmin = ok(read(admin, applications(event.eventId), "req-admin"));
    assertThat(json.readTree(asAdmin).get("items")).hasSize(1);
    assertThat(eventRole(event.eventId, adminId)).isNull();

    String repeated =
        ok(
            read(
                event.owner,
                applications(event.eventId) + "?status=SUBMITTED&status=WITHDRAWN",
                "req-status"));
    assertThat(json.readTree(repeated).get("items")).hasSize(1);
    assertThat(json.readTree(repeated).get("items").get(0).get("status").asString())
        .isEqualTo("SUBMITTED");

    String detail =
        ok(read(event.owner, applicationPath(event.eventId, seeded.applicationId), "req-detail"));
    JsonNode body = json.readTree(detail);
    assertThat(body.propertyNames())
        .containsExactly(
            "applicationId",
            "formId",
            "status",
            "submittedAt",
            "contactVisible",
            "answers",
            "operation",
            "participantId",
            "revision");
    assertThat(body.get("contactVisible").asBoolean()).isTrue();
    assertThat(body.get("answers")).hasSize(5);
    assertAnswer(body.get("answers").get(0), "SYSTEM", "NAME", "이름", 0, "이름답");
    assertAnswer(body.get("answers").get(1), "SYSTEM", "PHONE", "전화", 1, "전화답");
    assertAnswer(body.get("answers").get(2), "CUSTOM", null, "식사", 2, "커스텀답");
    JsonNode meals = body.get("answers").get(3);
    assertThat(meals.propertyNames()).containsExactly(ANSWER_KEYS);
    assertThat(meals.get("answerType").asString()).isEqualTo("MULTI_CHOICE");
    assertThat(meals.get("hidden").asBoolean()).isFalse();
    JsonNode options = meals.get("config").get("options");
    assertThat(options).hasSize(2);
    assertThat(options.get(1).get("optionId").asString()).isEqualTo("opt_dinner");
    assertThat(options.get(1).get("label").asString()).isEqualTo("저녁");
    assertThat(options.get(1).get("hidden").asBoolean()).isTrue();
    assertThat(meals.get("value").get("optionIds").get(1).asString()).isEqualTo("opt_dinner");
    JsonNode retired = body.get("answers").get(4);
    assertThat(retired.get("label").asString()).isEqualTo("옛 질문");
    assertThat(retired.get("hidden").asBoolean()).isTrue();
    assertThat(retired.get("value").get("text").asString()).isEqualTo("숨긴답");
    assertThat(body.get("answers").get(1).get("contact").asBoolean()).isTrue();
    assertThat(body.get("answers").get(0).get("contact").asBoolean()).isFalse();
    assertThat(auditCount(event.eventId)).isEqualTo(audits + 1);
    String audit = contactAudit(event.eventId);
    assertThat(json.readTree(audit).propertyNames()).containsExactly("count", "applicationId");
    assertThat(json.readTree(audit).get("count").asInt()).isEqualTo(1);
    assertThat(json.readTree(audit).get("applicationId").asString())
        .isEqualTo(seeded.applicationId.toString());
    assertThat(audit).doesNotContain("전화답", "이름답");

    problem(
        read(event.owner, applications(event.eventId) + "?size=101", "req-size"),
        400,
        "PAGE_SIZE_EXCEEDED",
        "req-size");
    problem(
        read(event.owner, applications(event.eventId) + "?sort=submittedAt,asc", "req-sort"),
        400,
        "VALIDATION_FAILED",
        "req-sort");
    problem(
        read(event.owner, applications(event.eventId) + "?status=OPEN", "req-unknown"),
        400,
        "VALIDATION_FAILED",
        "req-unknown");
    problem(
        read(event.owner, applicationPath(event.eventId, UUID.randomUUID()), "req-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing");

    assertThat(applicationCount(event.eventId)).isEqualTo(1);
    assertThat(applicationPatterns())
        .containsExactlyInAnyOrder(
            "GET /api/v1/operator/events/{eventId}/applications",
            "GET /api/v1/operator/events/{eventId}/applications/{applicationId}",
            "POST /api/v1/operator/events/{eventId}/applications/export",
            "GET /api/v1/operator/events/{eventId}/applications/summary",
            "GET /api/v1/operator/events/{eventId}/applications/table",
            "PUT /api/v1/operator/events/{eventId}/applications/{applicationId}/operation",
            "GET /api/v1/operator/events/{eventId}/applications/{applicationId}/revisions",
            "POST /api/v1/public/events/{eventId}/forms/{formId}/applications");

    String publicBody =
        mvc.perform(
                get(
                    "/api/v1/public/events/"
                        + event.eventId
                        + "/forms/"
                        + seeded.formId
                        + "/applications"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(publicBody).doesNotContain(seeded.applicationId.toString(), "이름답");
    String missingList =
        mvc.perform(get("/api/v1/public/events/" + event.eventId + "/applications"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(missingList).doesNotContain(seeded.applicationId.toString(), "이름답");
  }

  @Test
  void detailSendsPhoneAnswersOnlyWithContactReadAndRecordsTheView() throws Exception {
    Held event = openEvent("Contact owner");
    Seeded seeded = seed(event);
    UUID staffId = user("Plain staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    UUID adminId = user("Contact admin");
    member(event.spaceId, adminId, "ADMIN");
    UUID contactId = user("Contact staff");
    member(event.spaceId, contactId, "MEMBER");
    operator(event.spaceId, event.eventId, contactId, "STAFF");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'PARTICIPANT_CONTACT_READ', 'GRANT', ?, now())
        """,
        event.spaceId,
        event.eventId,
        contactId,
        contactId);
    String path = applicationPath(event.eventId, seeded.applicationId);
    int audits = auditCount(event.eventId);

    for (Cookie reader : List.of(login(staffId), login(adminId))) {
      String body = ok(read(reader, path, "req-no-contact"));
      assertThat(body).doesNotContain("전화답");
      JsonNode detail = json.readTree(body);
      assertThat(detail.get("contactVisible").asBoolean()).isFalse();
      JsonNode phone = detail.get("answers").get(1);
      assertThat(phone.propertyNames()).containsExactly(ANSWER_KEYS);
      assertThat(phone.get("systemKey").asString()).isEqualTo("PHONE");
      assertThat(phone.get("contact").asBoolean()).isTrue();
      assertThat(phone.get("value").isNull()).isTrue();
      assertThat(detail.get("answers").get(0).get("value").get("text").asString()).isEqualTo("이름답");
      assertThat(detail.get("answers").get(2).get("value").get("text").asString())
          .isEqualTo("커스텀답");
    }
    assertThat(auditCount(event.eventId)).isEqualTo(audits);

    JsonNode granted = json.readTree(ok(read(login(contactId), path, "req-contact")));
    assertThat(granted.get("contactVisible").asBoolean()).isTrue();
    assertThat(granted.get("answers").get(1).get("value").get("text").asString()).isEqualTo("전화답");
    assertThat(auditCount(event.eventId)).isEqualTo(audits + 1);
    assertThat(contactAudit(event.eventId)).contains(seeded.applicationId.toString());
  }

  @Test
  void ownerSavesTheOperatorMemoWithAVersionAndTheAnswersStay() throws Exception {
    Held event = openEvent("Memo owner");
    Seeded seeded = seed(event);
    String path = applicationPath(event.eventId, seeded.applicationId);
    String answersBefore = storedAnswers(seeded.applicationId);
    int audits = auditCount(event.eventId);

    JsonNode empty = json.readTree(ok(read(event.owner, path, "req-memo-empty")));
    assertThat(empty.get("operation").get("memo").asString()).isEmpty();
    assertThat(empty.get("operation").get("version").asInt()).isZero();
    assertThat(empty.get("operation").get("updatedAt").isNull()).isTrue();

    JsonNode saved =
        json.readTree(ok(writeMemo(event.owner, path, "토요일 저녁 잠시 외출 후 복귀", 0, "req-m1")));
    assertThat(saved.propertyNames())
        .containsExactly("memo", "version", "updatedAt", "updatedByDisplayName");
    assertThat(saved.get("memo").asString()).isEqualTo("토요일 저녁 잠시 외출 후 복귀");
    assertThat(saved.get("version").asInt()).isEqualTo(1);
    assertThat(saved.get("updatedByDisplayName").asString()).isEqualTo("Memo owner");

    JsonNode again = json.readTree(ok(writeMemo(event.owner, path, "통근", 1, "req-m2")));
    assertThat(again.get("version").asInt()).isEqualTo(2);
    problem(
        writeMemo(event.owner, path, "늦은 쓰기", 1, "req-stale"),
        409,
        "CONCURRENT_MODIFICATION",
        "req-stale");
    JsonNode conflict =
        json.readTree(
            mvc.perform(writeMemo(event.owner, path, "늦은 쓰기", 1, "req-stale-2"))
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(conflict.get("version").asInt()).isEqualTo(2);
    assertThat(conflict.toString()).doesNotContain("늦은 쓰기", "통근");

    problem(
        writeMemo(event.owner, path, "가".repeat(2001), 2, "req-long"),
        400,
        "VALIDATION_FAILED",
        "req-long");
    problem(
        put(path + "/operation")
            .cookie(event.owner, csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", "req-no-version")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"memo\":\"x\"}"),
        400,
        "VALIDATION_FAILED",
        "req-no-version");
    problem(
        writeMemo(
            event.owner, applicationPath(event.eventId, UUID.randomUUID()), "x", 0, "req-404"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-404");

    JsonNode detail = json.readTree(ok(read(event.owner, path, "req-memo-read")));
    assertThat(detail.get("operation").get("memo").asString()).isEqualTo("통근");
    assertThat(detail.get("operation").get("version").asInt()).isEqualTo(2);
    JsonNode table =
        json.readTree(ok(read(event.owner, applications(event.eventId) + "/table", "req-t")));
    JsonNode row = table.get("rows").get(0);
    assertThat(row.get("operation").get("memo").asString()).isEqualTo("통근");
    assertThat(row.get("participantId").asString())
        .isEqualTo(participantOf(seeded.applicationId).toString());

    assertThat(storedAnswers(seeded.applicationId)).isEqualTo(answersBefore);
    List<String> details = auditDetails(event.eventId, "APPLICATION_OPERATION_UPDATED");
    assertThat(details).hasSize(2);
    JsonNode last = json.readTree(details.get(details.size() - 1));
    assertThat(last.propertyNames())
        .containsExactlyInAnyOrder("applicationId", "version", "fields");
    assertThat(last.get("version").asInt()).isEqualTo(2);
    assertThat(last.get("applicationId").asString()).isEqualTo(seeded.applicationId.toString());
    assertThat(String.join(" ", details)).doesNotContain("통근", "외출");
    assertThat(auditCount(event.eventId)).isGreaterThanOrEqualTo(audits + 2);
  }

  @Test
  void memoWriteNeedsParticipantWriteAndAnOpenEvent() throws Exception {
    Held event = openEvent("Memo perms");
    Seeded seeded = seed(event);
    String path = applicationPath(event.eventId, seeded.applicationId);
    UUID staffId = user("Memo staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "MANAGER");
    UUID adminId = user("Memo admin");
    member(event.spaceId, adminId, "ADMIN");
    Cookie staff = login(staffId);

    problem(writeMemo(staff, path, "x", 0, "req-staff"), 403, "FORBIDDEN", "req-staff");
    problem(writeMemo(login(adminId), path, "x", 0, "req-admin"), 403, "FORBIDDEN", "req-admin");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'PARTICIPANT_WRITE', 'GRANT', ?, now())
        """,
        event.spaceId,
        event.eventId,
        staffId,
        staffId);
    assertThat(
            json.readTree(ok(writeMemo(staff, path, "매니저 메모", 0, "req-grant")))
                .get("version")
                .asInt())
        .isEqualTo(1);

    UUID readerId = user("Memo reader");
    member(event.spaceId, readerId, "MEMBER");
    operator(event.spaceId, event.eventId, readerId, "STAFF");
    JsonNode read = json.readTree(ok(read(login(readerId), path, "req-reader")));
    assertThat(read.get("operation").get("memo").asString()).isEqualTo("매니저 메모");

    lifecycle(event.eventId, "ENDED");
    assertThat(
            json.readTree(ok(writeMemo(event.owner, path, "행사 후 정정", 1, "req-ended")))
                .get("version")
                .asInt())
        .isEqualTo(2);
    lifecycle(event.eventId, "ARCHIVED");
    problem(
        writeMemo(event.owner, path, "x", 2, "req-archived"),
        409,
        "EVENT_ARCHIVED",
        "req-archived");
    lifecycle(event.eventId, "ACTIVE");
    jdbc.update("UPDATE applications SET status = 'WITHDRAWN' WHERE id = ?", seeded.applicationId);
    problem(
        writeMemo(event.owner, path, "x", 2, "req-withdrawn"),
        409,
        "INVALID_STATE_TRANSITION",
        "req-withdrawn");
    assertThat(
            json.readTree(ok(read(event.owner, path, "req-after")))
                .get("operation")
                .get("memo")
                .asString())
        .isEqualTo("행사 후 정정");
  }

  @Test
  void participantRoutesNeverCarryTheOperatorMemo() throws Exception {
    Held event = openEvent("Memo privacy");
    Seeded seeded = seed(event);
    String path = applicationPath(event.eventId, seeded.applicationId);
    ok(writeMemo(event.owner, path, "운영자만 보는 메모", 0, "req-private"));
    Cookie session =
        ParticipantSessions.open(
            jdbc, event.spaceId, event.eventId, participantOf(seeded.applicationId));
    for (String route :
        List.of(
            "/api/v1/participant/me",
            "/api/v1/participant/events",
            "/api/v1/participant/group",
            "/api/v1/participant/check-in")) {
      String body =
          mvc.perform(get(route).cookie(session)).andReturn().getResponse().getContentAsString();
      assertThat(body).doesNotContain("운영자만 보는 메모", "operation");
    }
  }

  @Test
  void listNameIsNullWhenTheNameAnswerIsMissing() throws Exception {
    Held event = openEvent("Owner");
    Seeded seeded = seed(event);
    UUID participantId = participant(event, "1".repeat(64));
    UUID withoutName = UUID.randomUUID();
    applications.save(
        ApplicationInsert.of(
            withoutName,
            event.spaceId,
            event.eventId,
            seeded.formId,
            participantId,
            "SUBMITTED",
            SUBMITTED.plusSeconds(60)),
        List.of());

    String listed = ok(read(event.owner, applications(event.eventId), "req-list-null"));
    JsonNode items = json.readTree(listed).get("items");
    assertThat(items).hasSize(2);
    assertThat(items.get(0).get("applicationId").asString())
        .isEqualTo(seeded.applicationId.toString());
    assertThat(items.get(0).get("name").asString()).isEqualTo("이름답");
    assertThat(items.get(1).get("applicationId").asString()).isEqualTo(withoutName.toString());
    assertThat(items.get(1).has("name")).isTrue();
    assertThat(items.get(1).get("name").isNull()).isTrue();
    assertThat(listed).doesNotContain("전화답", "커스텀답");
  }

  @Test
  void staffWithoutEventReadIsForbiddenAndTheProbeOrderStays() throws Exception {
    Held event = openEvent("Probe owner");
    seed(event);
    UUID staffId = user("Staff");
    member(event.spaceId, staffId, "MEMBER");
    operator(event.spaceId, event.eventId, staffId, "STAFF");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'EVENT_READ', 'REVOKE', ?, now())
        """,
        event.spaceId,
        event.eventId,
        staffId,
        staffId);
    Cookie staff = login(staffId);
    problem(
        read(staff, applications(event.eventId) + "?size=101", "req-staff-list"),
        403,
        "FORBIDDEN",
        "req-staff-list");
    problem(
        read(staff, applicationPath(event.eventId, storedApplication(event.eventId)), "req-staff"),
        403,
        "FORBIDDEN",
        "req-staff");

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
  }

  private Seeded seed(Held event) {
    UUID formId = UUID.randomUUID();
    forms.save(formId, event.spaceId, event.eventId);
    UUID nameId = UUID.randomUUID();
    UUID phoneId = UUID.randomUUID();
    UUID customId = UUID.randomUUID();
    forms.saveField(
        nameId, event.spaceId, event.eventId, formId, "SYSTEM", "NAME", "이름", 0, system("NAME"));
    forms.saveField(
        phoneId, event.spaceId, event.eventId, formId, "SYSTEM", "PHONE", "전화", 1, system("PHONE"));
    forms.saveField(
        customId,
        event.spaceId,
        event.eventId,
        formId,
        "CUSTOM",
        null,
        "식사",
        2,
        new FieldValues(
            "SHORT_TEXT",
            false,
            null,
            FieldRules.config(AnswerType.SHORT_TEXT, null, null).toString(),
            null,
            false));
    UUID mealsId = UUID.randomUUID();
    forms.saveField(
        mealsId,
        event.spaceId,
        event.eventId,
        formId,
        "CUSTOM",
        null,
        "식사 선택",
        3,
        new FieldValues("MULTI_CHOICE", false, null, MEALS_CONFIG, null, false));
    UUID retiredId = UUID.randomUUID();
    forms.saveField(
        retiredId,
        event.spaceId,
        event.eventId,
        formId,
        "CUSTOM",
        null,
        "옛 질문",
        4,
        new FieldValues(
            "SHORT_TEXT",
            false,
            null,
            FieldRules.config(AnswerType.SHORT_TEXT, null, null).toString(),
            null,
            true));
    UUID participantId = participant(event, "0".repeat(64));
    UUID applicationId = UUID.randomUUID();
    applications.save(
        ApplicationInsert.of(
            applicationId,
            event.spaceId,
            event.eventId,
            formId,
            participantId,
            "SUBMITTED",
            SUBMITTED),
        List.of(
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                nameId,
                "{\"text\":\"이름답\"}"),
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                phoneId,
                "{\"text\":\"전화답\"}"),
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                customId,
                "{\"text\":\"커스텀답\"}"),
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                mealsId,
                "{\"optionIds\":[\"opt_lunch\",\"opt_dinner\"]}"),
            AnswerInsert.of(
                UUID.randomUUID(),
                event.spaceId,
                event.eventId,
                applicationId,
                retiredId,
                "{\"text\":\"숨긴답\"}")));
    return new Seeded(formId, applicationId);
  }

  private UUID participant(Held event, String phoneHash) {
    UUID participantId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO participants (
          id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
        VALUES (?, ?, ?, '김', '01012345678', ?, '5678', ?, ?)
        """,
        participantId,
        event.spaceId,
        event.eventId,
        phoneHash,
        Timestamp.from(SUBMITTED),
        Timestamp.from(SUBMITTED));
    return participantId;
  }

  private void assertAnswer(
      JsonNode answer, String kind, String systemKey, String label, int position, String text) {
    assertThat(answer.propertyNames()).containsExactly(ANSWER_KEYS);
    assertThat(answer.get("answerType").asString()).isEqualTo("SHORT_TEXT");
    assertThat(answer.get("hidden").asBoolean()).isFalse();
    assertThat(answer.get("config").get("maxLength").isInt()).isTrue();
    assertThat(answer.get("kind").asString()).isEqualTo(kind);
    if (systemKey == null) {
      assertThat(answer.get("systemKey").isNull()).isTrue();
    } else {
      assertThat(answer.get("systemKey").asString()).isEqualTo(systemKey);
    }
    assertThat(answer.get("label").asString()).isEqualTo(label);
    assertThat(answer.get("position").asInt()).isEqualTo(position);
    assertThat(answer.get("value").propertyNames()).containsExactly("text");
    assertThat(answer.get("value").get("text").asString()).isEqualTo(text);
  }

  private List<String> applicationPatterns() {
    List<String> patterns = new java.util.ArrayList<>();
    for (RequestMappingInfo info : handlers.getHandlerMethods().keySet()) {
      for (String pattern : info.getPatternValues()) {
        if (!pattern.contains("applications")) {
          continue;
        }
        assertThat(pattern).doesNotContain("/api/v1/participant/");
        if (pattern.startsWith("/api/v1/public/")) {
          assertThat(pattern)
              .isEqualTo("/api/v1/public/events/{eventId}/forms/{formId}/applications");
        } else {
          assertThat(pattern).startsWith("/api/v1/operator/events/");
        }
        for (RequestMethod method : info.getMethodsCondition().getMethods()) {
          patterns.add(method.name() + " " + pattern);
        }
      }
    }
    return patterns;
  }

  private MockHttpServletRequestBuilder read(Cookie session, String path, String requestId) {
    return get(path).cookie(session).header("X-Request-Id", requestId);
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
    member(spaceId, memberId, "OWNER");
    Cookie owner = login(memberId);
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .header("X-Request-Id", "req-" + memberName)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"행사\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    return new Held(spaceId, eventId, owner);
  }

  private static String applications(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/applications";
  }

  private static String applicationPath(UUID eventId, UUID applicationId) {
    return applications(eventId) + "/" + applicationId;
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

  private int applicationCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM applications WHERE event_id = ?", Integer.class, eventId);
  }

  private UUID storedApplication(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT id FROM applications WHERE event_id = ?", UUID.class, eventId);
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

  private MockHttpServletRequestBuilder writeMemo(
      Cookie session, String path, String memo, int expectedVersion, String requestId) {
    return put(path + "/operation")
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            json.writeValueAsString(
                java.util.Map.of("memo", memo, "expectedVersion", expectedVersion)));
  }

  private String storedAnswers(UUID applicationId) {
    return String.join(
        "|",
        jdbc.queryForList(
            "SELECT field_id::text || '=' || value::text FROM answers"
                + " WHERE application_id = ? ORDER BY field_id",
            String.class,
            applicationId));
  }

  private UUID participantOf(UUID applicationId) {
    return jdbc.queryForObject(
        "SELECT participant_id FROM applications WHERE id = ?", UUID.class, applicationId);
  }

  private List<String> auditDetails(UUID eventId, String action) {
    return jdbc.queryForList(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?"
            + " ORDER BY (detail->>'version')::int",
        String.class,
        eventId,
        action);
  }

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private String contactAudit(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ?"
            + " AND action = 'APPLICANT_CONTACTS_VIEWED' ORDER BY occurred_at DESC, id DESC LIMIT 1",
        String.class,
        eventId);
  }

  private static final String[] ANSWER_KEYS = {
    "fieldId",
    "kind",
    "systemKey",
    "label",
    "position",
    "answerType",
    "hidden",
    "config",
    "value",
    "contact"
  };

  private static final String MEALS_CONFIG =
      """
      {"options": [
        {"optionId": "opt_lunch", "label": "점심", "group": null, "hidden": false, "showWhen": null},
        {"optionId": "opt_dinner", "label": "저녁", "group": null, "hidden": true, "showWhen": null}
      ], "allowOther": false, "minSelect": 0, "maxSelect": null}
      """;

  private record Held(UUID spaceId, UUID eventId, Cookie owner) {}

  private record Seeded(UUID formId, UUID applicationId) {}

  private static FieldValues system(String systemKey) {
    return new FieldValues(
        "SHORT_TEXT", true, null, FieldRules.systemConfig(systemKey).toString(), null, false);
  }
}
