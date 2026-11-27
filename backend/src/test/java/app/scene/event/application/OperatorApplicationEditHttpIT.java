package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * An operator edits for a participant and adds a participant (DEC-088, A12 #462, #339; api.md "운영자의
 * 신청 고치기·직접 추가"). The form comes from the setup API with the 도착~출발 range and 숙박 안 함, people apply
 * through the public submit, and every reader is read through its own route: the summary, the group
 * board, the applicant table, the CSV, the meal counts, the room board's 다시 볼 것 (A11), the leader's
 * member detail (F2) and the participant's own application.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorApplicationEditHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String PIN = "730914";

  /** Friday to Sunday: dinner and worship, three meals and worship, breakfast. */
  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  private static final String SETUP =
      "{\"gender\":true,\"middleGroup\":false,\"cell\":false,"
          + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\"RANGE\","
          + "\"noLodging\":true},\"schedule\":"
          + SCHEDULE
          + ",\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,\"car\":false,"
          + "\"publicTransit\":false,\"support\":false}}";

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

  /**
   * #339 through A12: after applications and edits are closed, the owner changes a full attendee to
   * 부분 참석 (1일차 집회 → 2일차 점심) with 숙박 안 함. Every reader follows the new revision; the revision keeps
   * the operator; the participant and the other operator are told, the owner is not.
   */
  @Test
  void operatorEditAfterCloseFlowsToEveryReaderAndKeepsTheOperator() throws Exception {
    Form form = openForm("수정 owner");
    Cookie manager = form.operator("수정 manager", "MANAGER");
    Person garam = form.submit("가람", 1, full());
    Person narae = form.submit("나래", 2, full());

    String g1 = createGroup(form, "1조");
    assign(form, groupChange(garam, g1), groupChange(narae, g1));
    ok(form.owner(put(eventPath(form) + "/groups/" + g1 + "/leaders"), leadersBody(narae)));
    publishGroups(form);
    String room = createRoom(form, "301호");
    ok(
        form.owner(
            post(eventPath(form) + "/room-assignments"),
            "{\"changes\":[" + roomChange(garam, room) + "," + roomChange(narae, room) + "]}"));

    JsonNode detailBefore = memberDetail(narae, garam);
    assertThat(detailBefore.get("application").get("revisedByOperator").asBoolean()).isFalse();
    assertThat(operatorEdited(detailBefore, "ATTENDANCE")).isFalse();
    JsonNode before = summary(form);
    long dinner2 = slot(before, "opt_d2_dinner");
    long night1 = night(before, "opt_n1");
    assertThat(before.get("attendance").get("partial").asLong()).isZero();
    long mealsDinner2 = mealPlanned(form, "opt_d2_dinner");

    // Close applications and edits: the participant's own edit is refused.
    ok(
        form.owner(
            patch(formPath(form)), "{\"acceptingApplications\":false,\"acceptingEdits\":false}"));
    problem(
        write(
            put("/api/v1/participant/application"),
            garam.session,
            "{\"expectedRevision\":1,\"answers\":[]}"),
        409,
        "EDITS_CLOSED");

    int audits = auditCount(form);
    JsonNode revised =
        json.readTree(
            ok(
                form.owner(
                    put(answersPath(form, garam.applicationId)),
                    form.body(
                        1,
                        "가람",
                        1,
                        values(
                            "ATTENDANCE", opt("opt_partial"),
                            "ARRIVAL_SLOT", opt("opt_d1_worship"),
                            "DEPARTURE_SLOT", opt("opt_d2_lunch"),
                            "NO_LODGING", "{\"optionIds\":[\"opt_no_lodging\"]}",
                            "GENDER", opt("opt_female"))))));
    assertThat(revised.propertyNames())
        .containsExactly("applicationId", "participantId", "revision", "revised");
    assertThat(revised.get("revision").asInt()).isEqualTo(2);
    assertThat(revised.get("revised").asBoolean()).isTrue();
    assertThat(revised.get("participantId").asString()).isEqualTo(garam.id());
    String current = revised.get("applicationId").asString();
    assertThat(current).isNotEqualTo(garam.applicationId);
    assertThat(statusOf(garam.applicationId)).isEqualTo("SUPERSEDED");
    Map<String, Object> stored =
        jdbc.queryForMap(
            "SELECT revised_by, revised_by_user_id FROM applications WHERE id = ?::uuid", current);
    assertThat(stored.get("revised_by")).isEqualTo("OPERATOR");
    assertThat(stored.get("revised_by_user_id")).isEqualTo(form.ownerId);

    // Summary (DEC-073): one partial attendee, one fewer night, no 2일차 dinner for 가람.
    JsonNode after = summary(form);
    assertThat(after.get("attendance").get("partial").asLong()).isEqualTo(1);
    assertThat(slot(after, "opt_d2_dinner")).isEqualTo(dinner2 - 1);
    assertThat(night(after, "opt_n1")).isEqualTo(night1 - 1);
    // Meal counts (DEC-089) read the same slots.
    assertThat(mealPlanned(form, "opt_d2_dinner")).isEqualTo(mealsDinner2 - 1);
    // Group board (DEC-072): the attended slots end at 2일차 lunch.
    JsonNode boardPerson = boardPerson(form, garam);
    assertThat(boardPerson.get("attendance").asString()).isEqualTo("PARTIAL");
    assertThat(strings(boardPerson.get("slotIds")))
        .containsExactly("opt_d1_worship", "opt_d2_breakfast", "opt_d2_lunch");
    // Applicant table (A6): the new revision, saved by an operator.
    JsonNode row = tableRow(form, current);
    assertThat(row.get("revision").asInt()).isEqualTo(2);
    assertThat(row.get("revisedBy").asString()).isEqualTo("OPERATOR");
    assertThat(row.get("group").get("groupId").asString()).isEqualTo(g1);
    // CSV: 가람's line says 부분 참석.
    String csv = csvText(export(form));
    String line = csv.lines().filter(text -> text.contains("가람")).findFirst().orElseThrow();
    assertThat(line).contains("부분 참석").doesNotContain("전체 참석");
    // Room board (A11): the stored basis differs, so 다시 볼 것 shows NOT_LODGING and the slots.
    JsonNode review = roomBoardPerson(form, garam).get("review");
    assertThat(strings(review.get("reasons")))
        .containsExactly("NOT_LODGING", "ATTENDANCE_CHANGED", "GENDER_CHANGED");
    assertThat(roomBoardPerson(form, narae).get("review").isNull()).isTrue();
    // Leader's member detail (F2, DEC-083): the operator's values are marked.
    JsonNode detail = memberDetail(narae, garam);
    assertThat(detail.get("application").get("revisedByOperator").asBoolean()).isTrue();
    assertThat(detail.get("application").get("revisedAt").isNull()).isFalse();
    assertThat(operatorEdited(detail, "ATTENDANCE")).isTrue();
    assertThat(operatorEdited(detail, "ARRIVAL_SLOT")).isTrue();
    assertThat(detail.get("attendance").get("type").asString()).isEqualTo("PARTIAL");
    assertThat(detail.get("attendance").get("lodgingNights").size()).isZero();
    // The participant's own application shows the new answers.
    JsonNode own = json.readTree(ok(get("/api/v1/participant/application").cookie(garam.session)));
    assertThat(own.get("revision").asInt()).isEqualTo(2);
    assertThat(own.get("acceptingEdits").asBoolean()).isFalse();
    assertThat(own.toString()).contains("opt_partial", "opt_no_lodging");

    // Revisions keep the operator with a display name.
    JsonNode revisions =
        json.readTree(ok(get(applicationPath(form, current) + "/revisions").cookie(form.owner)));
    JsonNode latest = revisions.get("items").get(0);
    assertThat(latest.get("revisedBy").asString()).isEqualTo("OPERATOR");
    assertThat(latest.get("revisedByUserId").asString()).isEqualTo(form.ownerId.toString());
    assertThat(latest.get("revisedByDisplayName").asString()).isEqualTo("수정 owner");
    assertThat(labels(latest.get("changes")))
        .containsExactly("성별", "참석 방식", "수련회장에 언제 도착하나요?", "수련회장에서 언제 출발하나요?", "숙박");
    JsonNode first = revisions.get("items").get(1);
    assertThat(first.get("revisedBy").isNull()).isTrue();
    assertThat(first.get("revisedByDisplayName").isNull()).isTrue();

    // Audit: one row with ids and field ids, no names or answers.
    assertThat(auditCount(form)).isEqualTo(audits + 1);
    String auditDetail =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action ="
                + " 'APPLICATION_REVISED_BY_OPERATOR'",
            String.class,
            form.eventId);
    JsonNode auditJson = json.readTree(auditDetail);
    assertThat(auditJson.propertyNames())
        .containsExactlyInAnyOrder(
            "applicationId", "previousApplicationId", "participantId", "revision", "fieldIds");
    assertThat(auditJson.get("fieldIds").size()).isEqualTo(5);
    assertThat(auditDetail).doesNotContain("가람", "opt_partial", "010");

    // Notifications: the participant and the manager, not the owner who edited.
    JsonNode mine = notifications(get("/api/v1/participant/notifications").cookie(garam.session));
    JsonNode told = mine.get("items").get(0);
    assertThat(told.get("kind").asString()).isEqualTo("APPLICATION_UPDATED_BY_OPERATOR");
    assertThat(told.get("target").get("type").asString()).isEqualTo("APPLICATION");
    assertThat(told.get("target").get("id").asString()).isEqualTo(current);
    assertThat(told.get("title").asString()).isEqualTo("운영자가 신청 내역을 수정했어요");
    assertThat(told.get("body").asString())
        .isEqualTo("성별, 참석 방식, 수련회장에 언제 도착하나요?, 수련회장에서 언제 출발하나요?, 숙박");
    assertThat(kinds(notifications(get("/api/v1/participant/notifications").cookie(narae.session))))
        .doesNotContain("APPLICATION_UPDATED_BY_OPERATOR");
    JsonNode managerItems = notifications(get(eventPath(form) + "/notifications").cookie(manager));
    assertThat(managerItems.get("items").get(0).get("kind").asString())
        .isEqualTo("APPLICATION_REVISED");
    String editor =
        jdbc.queryForObject(
            "SELECT display_name FROM users WHERE id = ?", String.class, form.ownerId);
    assertThat(managerItems.get("items").get(0).get("title").asString())
        .isEqualTo(editor + "님이 가람님의 신청 내역을 수정했어요");
    assertThat(managerItems.get("items").get(0).get("target").get("id").asString())
        .isEqualTo(current);
    assertThat(kinds(notifications(get(eventPath(form) + "/notifications").cookie(form.owner))))
        .doesNotContain("APPLICATION_REVISED");

    // The participant edits again later: the last revision wins and is the participant's.
    ok(form.owner(patch(formPath(form)), "{\"acceptingEdits\":true}"));
    ok(write(put("/api/v1/participant/application"), garam.session, form.body(2, "가람", 1, full())));
    assertThat(summary(form).get("attendance").get("partial").asLong()).isZero();
    JsonNode again = memberDetail(narae, garam);
    assertThat(again.get("application").get("revisedByOperator").asBoolean()).isFalse();
    assertThat(operatorEdited(again, "ATTENDANCE")).isFalse();
  }

  /**
   * Direct add (현장 등록): only the name and phone are required, consent stays empty, the first
   * revision keeps the operator, the temporary number is shown once and must be changed, and the
   * phone stays one participant (an existing or withdrawn one is pointed at, never duplicated).
   */
  @Test
  void directAddGivesATemporaryNumberAndKeepsOnePhoneOneParticipant() throws Exception {
    Form form = openForm("추가 owner");
    Cookie manager = form.operator("추가 manager", "MANAGER");
    ok(form.owner(patch(formPath(form)), "{\"acceptingApplications\":false}"));
    int audits = auditCount(form);

    MockHttpServletResponse response =
        mvc.perform(
                form.owner(
                    post(eventPath(form) + "/applications"),
                    form.addBody("현장", 7, Map.of("ATTENDANCE", opt("opt_worship")))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse();
    assertThat(response.getHeader("Cache-Control")).contains("no-store");
    JsonNode added = json.readTree(response.getContentAsString());
    assertThat(added.propertyNames())
        .containsExactly("applicationId", "participantId", "revision", "temporaryPin");
    String temporary = added.get("temporaryPin").asString();
    assertThat(temporary).matches("\\d{6}");
    String applicationId = added.get("applicationId").asString();
    Map<String, Object> stored =
        jdbc.queryForMap(
            "SELECT revision, revised_by, revised_by_user_id, changes::text AS changes"
                + " FROM applications WHERE id = ?::uuid",
            applicationId);
    assertThat(stored.get("revision")).isEqualTo(1);
    assertThat(stored.get("revised_by")).isEqualTo("OPERATOR");
    assertThat(stored.get("revised_by_user_id")).isEqualTo(form.ownerId);
    assertThat(stored.get("changes")).isEqualTo("[]");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM answers WHERE application_id = ?::uuid"
                    + " AND field_id = ?::uuid",
                Integer.class,
                applicationId,
                form.fieldIds.get("CONSENT")))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT pin_temporary FROM participants WHERE id = ?::uuid",
                Boolean.class,
                added.get("participantId").asString()))
        .isTrue();

    // The table shows a direct add; the summary counts the person.
    JsonNode row = tableRow(form, applicationId);
    assertThat(row.get("revision").asInt()).isEqualTo(1);
    assertThat(row.get("revisedBy").asString()).isEqualTo("OPERATOR");
    assertThat(summary(form).get("attendance").get("worshipOnly").asLong()).isEqualTo(1);
    JsonNode revisions =
        json.readTree(
            ok(get(applicationPath(form, applicationId) + "/revisions").cookie(form.owner)));
    assertThat(revisions.get("items").get(0).get("revisedByDisplayName").asString())
        .isEqualTo("추가 owner");

    // Audit without the number; the manager is told, the owner is not.
    assertThat(auditCount(form)).isEqualTo(audits + 1);
    String auditDetail =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action ="
                + " 'PARTICIPANT_ADDED'",
            String.class,
            form.eventId);
    assertThat(json.readTree(auditDetail).propertyNames())
        .containsExactlyInAnyOrder("participantId", "applicationId");
    assertThat(auditDetail).doesNotContain(temporary, "현장");
    JsonNode told = notifications(get(eventPath(form) + "/notifications").cookie(manager));
    assertThat(told.get("items").get(0).get("kind").asString()).isEqualTo("APPLICATION_ADDED");
    assertThat(told.get("items").get(0).get("title").asString()).isEqualTo("현장님을 운영자가 직접 추가했어요");
    assertThat(kinds(notifications(get(eventPath(form) + "/notifications").cookie(form.owner))))
        .doesNotContain("APPLICATION_ADDED");

    // The participant signs in with the temporary number and must choose a new one.
    Cookie temp = signIn(form, "현장", 7, temporary, 204).getCookie(PARTICIPANT_COOKIE);
    mvc.perform(get("/api/v1/participant/me").cookie(temp))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pinChangeRequired").value(true));

    // The same phone again: pointed at the existing application, nothing new.
    long participants = participantCount(form);
    JsonNode duplicate =
        problem(
            form.owner(post(eventPath(form) + "/applications"), form.addBody("다른 이름", 7, Map.of())),
            409,
            "APPLICATION_ALREADY_EXISTS");
    assertThat(duplicate.get("applicationId").asString()).isEqualTo(applicationId);
    assertThat(duplicate.get("status").asString()).isEqualTo("SUBMITTED");
    // A withdrawn person is pointed at too (DEC-084): restore, then edit.
    Person narae = submitOpen(form, "나래", 2);
    ok(form.owner(post(applicationPath(form, narae.applicationId) + "/withdraw"), "{}"));
    JsonNode withdrawn =
        problem(
            form.owner(post(eventPath(form) + "/applications"), form.addBody("나래", 2, Map.of())),
            409,
            "APPLICATION_ALREADY_EXISTS");
    assertThat(withdrawn.get("applicationId").asString()).isEqualTo(narae.applicationId);
    assertThat(withdrawn.get("status").asString()).isEqualTo("WITHDRAWN");
    assertThat(participantCount(form)).isEqualTo(participants + 1);

    // Body and state checks.
    problem(
        form.owner(post(eventPath(form) + "/applications"), "{\"answers\":[]}"),
        400,
        "VALIDATION_FAILED");
    problem(
        form.owner(
            post(eventPath(form) + "/applications"),
            "{\"formId\":\"" + UUID.randomUUID() + "\",\"answers\":[]}"),
        404,
        "FORM_NOT_FOUND");
    problem(
        form.owner(
            post(eventPath(form) + "/applications"),
            form.addBody("", 8, Map.of()).replace("\"text\":\"\"", "\"text\":\" \"")),
        400,
        "APPLICATION_VALIDATION_FAILED");
    lifecycle(form, "ENDED");
    problem(
        form.owner(post(eventPath(form) + "/applications"), form.addBody("늦음", 9, Map.of())),
        409,
        "EVENT_ENDED");
    lifecycle(form, "ARCHIVED");
    problem(
        form.owner(post(eventPath(form) + "/applications"), form.addBody("늦음", 9, Map.of())),
        409,
        "EVENT_ARCHIVED");
  }

  /**
   * #520: saving an edit that changes nothing must not make a revision or tell anyone, also when
   * the application has a number answer (the stored {@code 3} and the evaluated {@code 3} are
   * different JSON number kinds) and a yes/no and a short text answer.
   */
  @Test
  void unchangedEditWithANumberAnswerMakesNoRevisionAndNoNotice() throws Exception {
    Form form = openForm("숫자 owner", SETUP.replace("\"car\":false", "\"car\":true"));
    Map<String, String> carpool = full();
    carpool.put("TRANSPORT_IN", opt("opt_car"));
    carpool.put("CARPOOL_OFFER", "{\"value\":true}");
    carpool.put("CARPOOL_SEATS", "{\"number\":3}");
    carpool.put("CARPOOL_AREA", "{\"text\":\"수지\"}");
    Person garam = form.submit("가람", 1, carpool);
    String path = answersPath(form, garam.applicationId);
    int audits = auditCount(form);

    JsonNode same = json.readTree(ok(form.owner(put(path), form.body(1, "가람", 1, carpool))));
    assertThat(same.get("revised").asBoolean()).isFalse();
    assertThat(same.get("revision").asInt()).isEqualTo(1);
    assertThat(same.get("applicationId").asString()).isEqualTo(garam.applicationId);
    assertThat(auditCount(form)).isEqualTo(audits);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM applications WHERE event_id = ?", Long.class, form.eventId))
        .isEqualTo(1);
    assertThat(kinds(notifications(get("/api/v1/participant/notifications").cookie(garam.session))))
        .doesNotContain("APPLICATION_UPDATED_BY_OPERATOR");

    // A real change to the number is still a change, and only that question is named.
    carpool.put("CARPOOL_SEATS", "{\"number\":4}");
    JsonNode revised = json.readTree(ok(form.owner(put(path), form.body(1, "가람", 1, carpool))));
    assertThat(revised.get("revised").asBoolean()).isTrue();
    assertThat(revised.get("revision").asInt()).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT changes::text FROM applications WHERE id = ?::uuid",
                String.class,
                revised.get("applicationId").asString()))
        .contains("몇 명까지 태울 수 있어요?")
        .doesNotContain("동승자를 태울 수 있어요?", "어느 동네에서");
  }

  /**
   * The edit's rules: permission, body, stale and withdrawn rows, archived events, a phone that
   * belongs to someone else, a changed phone signing in, consent carried over, an empty required
   * answer, and an edit that changes nothing.
   */
  @Test
  void editChecksPermissionStateRevisionPhoneAndCarriesConsent() throws Exception {
    Form form = openForm("검사 owner");
    Cookie staff = form.operator("검사 staff", "STAFF");
    Person garam = form.submit("가람", 1, full());
    Person narae = form.submit("나래", 2, full());
    String path = answersPath(form, garam.applicationId);

    problem(write(put(path), staff, form.body(1, "가람", 1, full())), 403, "FORBIDDEN");
    problem(
        form.owner(
            put(answersPath(form, UUID.randomUUID().toString())), form.body(1, "가람", 1, full())),
        404,
        "RESOURCE_NOT_FOUND");
    problem(form.owner(put(path), "{\"answers\":[]}"), 400, "VALIDATION_FAILED");

    // Nothing changed: no revision, no audit.
    int audits = auditCount(form);
    JsonNode same = json.readTree(ok(form.owner(put(path), form.body(1, "가람", 1, full()))));
    assertThat(same.get("revised").asBoolean()).isFalse();
    assertThat(same.get("revision").asInt()).isEqualTo(1);
    assertThat(auditCount(form)).isEqualTo(audits);

    // An empty required question (gender) is fine for an operator; consent sent false is ignored.
    Map<String, String> noGender = new LinkedHashMap<>();
    noGender.put("ATTENDANCE", opt("opt_full"));
    String body =
        form.body(1, "가람", 1, noGender)
            .replace("\"value\":{\"value\":true}", "\"value\":{\"value\":false}");
    JsonNode revised = json.readTree(ok(form.owner(put(path), body)));
    assertThat(revised.get("revision").asInt()).isEqualTo(2);
    String current = revised.get("applicationId").asString();
    assertThat(
            jdbc.queryForObject(
                "SELECT value::text FROM answers WHERE application_id = ?::uuid"
                    + " AND field_id = ?::uuid",
                String.class,
                current,
                form.fieldIds.get("CONSENT")))
        .contains("true");

    // The old id and an old revision are stale; the latest row comes back.
    JsonNode stale =
        problem(
            form.owner(put(path), form.body(1, "가람", 1, full())), 409, "CONCURRENT_MODIFICATION");
    assertThat(stale.get("applicationId").asString()).isEqualTo(current);
    assertThat(stale.get("revision").asInt()).isEqualTo(2);
    problem(
        form.owner(put(answersPath(form, current)), form.body(1, "가람", 1, full())),
        409,
        "CONCURRENT_MODIFICATION");

    // Another participant's phone is refused; a free phone is taken and signs in.
    problem(
        form.owner(put(answersPath(form, current)), form.body(2, "가람", 2, full())),
        409,
        "APPLICATION_ALREADY_EXISTS");
    JsonNode moved =
        json.readTree(
            ok(form.owner(put(answersPath(form, current)), form.body(2, "가람", 5, full()))));
    current = moved.get("applicationId").asString();
    signIn(form, "가람", 5, PIN, 204);
    signIn(form, "가람", 1, PIN, 401);
    assertThat(
            jdbc.queryForObject(
                "SELECT phone_last4 FROM participants WHERE id = ?",
                String.class,
                garam.participantId))
        .isEqualTo("0005");

    // A withdrawn application is restored first; an archived event is closed.
    ok(form.owner(post(applicationPath(form, narae.applicationId) + "/withdraw"), "{}"));
    JsonNode withdrawn =
        problem(
            form.owner(put(answersPath(form, narae.applicationId)), form.body(1, "나래", 2, full())),
            409,
            "INVALID_STATE_TRANSITION");
    assertThat(withdrawn.get("applicationStatus").asString()).isEqualTo("WITHDRAWN");
    lifecycle(form, "ENDED");
    JsonNode ended =
        json.readTree(
            ok(form.owner(put(answersPath(form, current)), form.body(3, "가람", 5, partialRange()))));
    assertThat(ended.get("revision").asInt()).isEqualTo(4);
    lifecycle(form, "ARCHIVED");
    problem(
        form.owner(
            put(answersPath(form, ended.get("applicationId").asString())),
            form.body(4, "가람", 5, full())),
        409,
        "EVENT_ARCHIVED");
  }

  // --- helpers ---

  /**
   * DEC-091 Follow-up 1: the 참가 현황 table and the CSV keep each person where they first applied. A
   * participant's own edit (A4), an operator edit (A12), a cancel and restore, and a re-application
   * with changed answers all make or reuse a later row, but the person keeps their place. A direct
   * add sits at the time it was added.
   */
  @Test
  void tableAndCsvKeepEachPersonWhereTheyFirstApplied() throws Exception {
    Form form = openForm("순서 owner");
    Person garam = form.submit("가람", 1, full());
    Person narae = form.submit("나래", 2, full());
    Person dasom = form.submit("다솜", 3, full());
    Person hana = form.submit("하나", 4, full());
    String added =
        json.readTree(
                created(
                    form.owner(
                        post(eventPath(form) + "/applications"),
                        form.addBody("현장", 5, Map.of("ATTENDANCE", opt("opt_worship"))))))
            .get("participantId")
            .asString();

    // A4: 가람 changes their own answers.
    ok(
        write(
            put("/api/v1/participant/application"),
            garam.session,
            form.body(
                1, "가람", 1, values("GENDER", opt("opt_female"), "ATTENDANCE", opt("opt_full")))));
    // A12: the owner changes 나래.
    ok(
        form.owner(
            put(answersPath(form, narae.applicationId)),
            form.body(
                1, "나래", 2, values("GENDER", opt("opt_female"), "ATTENDANCE", opt("opt_full")))));
    // DEC-084: 다솜 is cancelled and restored.
    ok(form.owner(post(applicationPath(form, dasom.applicationId) + "/withdraw"), "{}"));
    ok(form.owner(post(applicationPath(form, dasom.applicationId) + "/restore"), null));
    // 하나 is cancelled and applies again with other answers: a new revision.
    ok(form.owner(post(applicationPath(form, hana.applicationId) + "/withdraw"), "{}"));
    mvc.perform(
            post("/api/v1/public/events/"
                    + form.eventId
                    + "/forms/"
                    + form.formId
                    + "/applications")
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"pin\":\""
                        + PIN
                        + "\",\"answers\":["
                        + String.join(
                            ",",
                            form.answers(
                                "하나",
                                4,
                                values("GENDER", opt("opt_female"), "ATTENDANCE", opt("opt_full")),
                                true))
                        + "]}"))
        .andExpect(status().isOk());

    List<String> order = new ArrayList<>();
    for (JsonNode row :
        json.readTree(ok(get(eventPath(form) + "/applications/table").cookie(form.owner)))
            .get("rows")) {
      order.add(row.get("participantId").asString());
    }
    assertThat(order).containsExactly(garam.id(), narae.id(), dasom.id(), hana.id(), added);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM applications WHERE event_id = ? AND revision > 1",
                Long.class,
                form.eventId))
        .isEqualTo(3);

    List<String> lines = csvText(export(form)).lines().skip(1).toList();
    List<Integer> at = new ArrayList<>();
    for (String name : List.of("가람", "나래", "다솜", "하나", "현장")) {
      int index = -1;
      for (int i = 0; i < lines.size() && index < 0; i++) {
        if (lines.get(i).contains(name)) {
          index = i;
        }
      }
      at.add(index);
    }
    assertThat(at).containsExactly(0, 1, 2, 3, 4);
  }

  private final class Form {
    final UUID spaceId;
    final UUID eventId;
    final UUID ownerId;
    final String formId;
    final Cookie owner;
    final Map<String, String> fieldIds = new LinkedHashMap<>();

    Form(UUID spaceId, UUID eventId, UUID ownerId, String formId, Cookie owner, JsonNode detail) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.ownerId = ownerId;
      this.formId = formId;
      this.owner = owner;
      for (JsonNode field : detail.get("fields")) {
        JsonNode key =
            field.get("presetKey").isNull() ? field.get("systemKey") : field.get("presetKey");
        if (!key.isNull()) {
          fieldIds.put(key.asString(), field.get("fieldId").asString());
        }
      }
    }

    MockHttpServletRequestBuilder owner(MockHttpServletRequestBuilder request, String body) {
      return write(request, owner, body);
    }

    /** An active operator of the event with the role's default permissions. */
    Cookie operator(String name, String role) throws Exception {
      UUID id = user(name);
      member(spaceId, id, "MEMBER");
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return login(id);
    }

    Person submit(String name, int number, Map<String, String> values) throws Exception {
      MockHttpServletResponse response =
          mvc.perform(
                  post("/api/v1/public/events/" + eventId + "/forms/" + formId + "/applications")
                      .cookie(csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(
                          "{\"pin\":\""
                              + PIN
                              + "\",\"answers\":["
                              + String.join(",", answers(name, number, values, true))
                              + "]}"))
              .andExpect(status().isCreated())
              .andReturn()
              .getResponse();
      JsonNode body = json.readTree(response.getContentAsString());
      Cookie session = response.getCookie(PARTICIPANT_COOKIE);
      assertThat(session).isNotNull();
      return new Person(
          UUID.fromString(body.get("participantId").asString()),
          body.get("applicationId").asString(),
          session);
    }

    /** An edit body: every answer, consent included as the participant gave it. */
    String body(int expectedRevision, String name, int number, Map<String, String> values) {
      return "{\"expectedRevision\":"
          + expectedRevision
          + ",\"answers\":["
          + String.join(",", answers(name, number, values, true))
          + "]}";
    }

    /** A direct-add body: no consent. */
    String addBody(String name, int number, Map<String, String> values) {
      return "{\"formId\":\""
          + formId
          + "\",\"answers\":["
          + String.join(",", answers(name, number, values, false))
          + "]}";
    }

    List<String> answers(String name, int number, Map<String, String> values, boolean consent) {
      List<String> answers = new ArrayList<>();
      answers.add(text("NAME", name));
      answers.add(text("PHONE", phone(number)));
      answers.add(text("COHORT", "9" + number));
      values.forEach(
          (key, value) ->
              answers.add("{\"fieldId\":\"" + fieldIds.get(key) + "\",\"value\":" + value + "}"));
      if (consent && fieldIds.containsKey("CONSENT")) {
        answers.add("{\"fieldId\":\"" + fieldIds.get("CONSENT") + "\",\"value\":{\"value\":true}}");
      }
      return answers;
    }

    private String text(String key, String value) {
      return "{\"fieldId\":\"" + fieldIds.get(key) + "\",\"text\":\"" + value + "\"}";
    }
  }

  private record Person(UUID participantId, String applicationId, Cookie session) {
    String id() {
      return participantId.toString();
    }
  }

  /** Submits while applications are closed by opening them for one submit. */
  private Person submitOpen(Form form, String name, int number) throws Exception {
    ok(form.owner(patch(formPath(form)), "{\"acceptingApplications\":true}"));
    Person person = form.submit(name, number, full());
    ok(form.owner(patch(formPath(form)), "{\"acceptingApplications\":false}"));
    return person;
  }

  private static String phone(int number) {
    return "010-8585-000" + number;
  }

  private static Map<String, String> full() {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("GENDER", opt("opt_male"));
    values.put("ATTENDANCE", opt("opt_full"));
    return values;
  }

  private static Map<String, String> partialRange() {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("GENDER", opt("opt_male"));
    values.put("ATTENDANCE", opt("opt_partial"));
    values.put("ARRIVAL_SLOT", opt("opt_d1_dinner"));
    values.put("DEPARTURE_SLOT", opt("opt_d2_dinner"));
    return values;
  }

  private static Map<String, String> values(String... pairs) {
    Map<String, String> out = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      out.put(pairs[i], pairs[i + 1]);
    }
    return out;
  }

  private static String opt(String id) {
    return "{\"optionId\":\"" + id + "\"}";
  }

  private Form openForm(String ownerName) throws Exception {
    return openForm(ownerName, SETUP);
  }

  private Form openForm(String ownerName, String setup) throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home " + ownerName);
    UUID ownerId = user(ownerName);
    member(spaceId, ownerId, "OWNER");
    Cookie owner = login(ownerId);
    UUID eventId =
        UUID.fromString(
            json.readTree(
                    created(
                        write(
                            post("/api/v1/operator/spaces/" + spaceId + "/events"),
                            owner,
                            "{\"name\":\"겨울 수련회\"}")))
                .get("eventId")
                .asString());
    jdbc.update(
        "UPDATE events SET start_date = ?, end_date = ? WHERE id = ?",
        LocalDate.of(2027, 1, 22),
        LocalDate.of(2027, 1, 24),
        eventId);
    String forms = "/api/v1/operator/events/" + eventId + "/forms";
    String formId =
        json.readTree(created(write(post(forms), owner, "{}"))).get("formId").asString();
    ok(write(put(forms + "/" + formId + "/setup"), owner, setup));
    ok(
        write(
            post("/api/v1/operator/events/" + eventId + "/activate"),
            owner,
            "{\"expectedLifecycleVersion\":0}"));
    ok(write(patch(forms + "/" + formId), owner, "{\"acceptingApplications\":true}"));
    JsonNode detail = json.readTree(ok(get(forms + "/" + formId).cookie(owner)));
    return new Form(spaceId, eventId, ownerId, formId, owner, detail);
  }

  private String createGroup(Form form, String name) throws Exception {
    return json.readTree(
            created(form.owner(post(eventPath(form) + "/groups"), "{\"name\":\"" + name + "\"}")))
        .get("group")
        .get("groupId")
        .asString();
  }

  private void assign(Form form, String... changes) throws Exception {
    ok(
        form.owner(
            post(eventPath(form) + "/group-assignments"),
            "{\"changes\":[" + String.join(",", changes) + "]}"));
  }

  private static String groupChange(Person person, String to) {
    return "{\"participantId\":\""
        + person.participantId
        + "\",\"fromGroupId\":null,\"toGroupId\":\""
        + to
        + "\"}";
  }

  private static String leadersBody(Person person) {
    return "{\"expectedVersion\":0,\"participantIds\":[\"" + person.participantId + "\"]}";
  }

  private void publishGroups(Form form) throws Exception {
    long version =
        json.readTree(ok(get(eventPath(form) + "/group-board").cookie(form.owner)))
            .get("boardVersion")
            .asLong();
    ok(
        form.owner(
            post(eventPath(form) + "/groups/publish"),
            "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}"));
  }

  private String createRoom(Form form, String name) throws Exception {
    return json.readTree(
            created(form.owner(post(eventPath(form) + "/rooms"), "{\"name\":\"" + name + "\"}")))
        .get("room")
        .get("roomId")
        .asString();
  }

  private static String roomChange(Person person, String room) {
    return "{\"participantId\":\""
        + person.participantId
        + "\",\"fromRoomId\":null,\"toRoomId\":\""
        + room
        + "\"}";
  }

  private JsonNode boardPerson(Form form, Person person) throws Exception {
    JsonNode board = json.readTree(ok(get(eventPath(form) + "/group-board").cookie(form.owner)));
    return find(board.get("participants"), "participantId", person.id());
  }

  private JsonNode roomBoardPerson(Form form, Person person) throws Exception {
    JsonNode board = json.readTree(ok(get(eventPath(form) + "/room-board").cookie(form.owner)));
    return find(board.get("participants"), "participantId", person.id());
  }

  private JsonNode tableRow(Form form, String applicationId) throws Exception {
    JsonNode table =
        json.readTree(ok(get(eventPath(form) + "/applications/table").cookie(form.owner)));
    return find(table.get("rows"), "applicationId", applicationId);
  }

  private JsonNode memberDetail(Person leader, Person member) throws Exception {
    return json.readTree(
        ok(get("/api/v1/participant/group/members/" + member.id()).cookie(leader.session)));
  }

  private static boolean operatorEdited(JsonNode detail, String presetKey) {
    return find(detail.get("application").get("answers"), "presetKey", presetKey)
        .get("operatorEdited")
        .asBoolean();
  }

  private long mealPlanned(Form form, String slotId) throws Exception {
    JsonNode counts = json.readTree(ok(get(eventPath(form) + "/meal-counts").cookie(form.owner)));
    for (JsonNode day : counts.get("days")) {
      for (JsonNode slot : day.get("slots")) {
        if (slot.get("slotId").asString().equals(slotId)) {
          return slot.get("planned").asLong();
        }
      }
    }
    throw new AssertionError("meal slot is missing: " + slotId);
  }

  private JsonNode notifications(MockHttpServletRequestBuilder request) throws Exception {
    return json.readTree(ok(request));
  }

  private static List<String> kinds(JsonNode page) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : page.get("items")) {
      out.add(item.get("kind").asString());
    }
    return out;
  }

  private static List<String> labels(JsonNode changes) {
    List<String> out = new ArrayList<>();
    for (JsonNode change : changes) {
      out.add(change.get("label").asString());
    }
    return out;
  }

  private static JsonNode find(JsonNode list, String key, String value) {
    for (JsonNode item : list) {
      if (item.path(key).isString() && item.get(key).asString().equals(value)) {
        return item;
      }
    }
    throw new AssertionError(key + " " + value + " is missing");
  }

  private static List<String> strings(JsonNode list) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : list) {
      out.add(item.asString());
    }
    return out;
  }

  private JsonNode summary(Form form) throws Exception {
    return json.readTree(ok(get(eventPath(form) + "/applications/summary").cookie(form.owner)));
  }

  private MockHttpServletResponse export(Form form) throws Exception {
    MockHttpServletResponse response =
        mvc.perform(form.owner(post(eventPath(form) + "/applications/export"), null))
            .andReturn()
            .getResponse();
    assertThat(response.getStatus()).isEqualTo(200);
    return response;
  }

  private static String csvText(MockHttpServletResponse response) {
    byte[] bytes = response.getContentAsByteArray();
    return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
  }

  private MockHttpServletResponse signIn(
      Form form, String name, int number, String pin, int httpStatus) throws Exception {
    return mvc.perform(
            post("/api/v1/public/events/" + form.eventId + "/participant-sessions")
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\""
                        + name
                        + "\",\"phone\":\""
                        + phone(number)
                        + "\",\"pin\":\""
                        + pin
                        + "\"}"))
        .andExpect(status().is(httpStatus))
        .andReturn()
        .getResponse();
  }

  private static long night(JsonNode summary, String optionId) {
    for (JsonNode night : summary.get("lodging").get("nights")) {
      if (night.get("optionId").asString().equals(optionId)) {
        return night.get("count").asLong();
      }
    }
    throw new AssertionError("night is missing");
  }

  private static long slot(JsonNode summary, String optionId) {
    for (JsonNode day : summary.get("meals").get("days")) {
      for (JsonNode slot : day.get("slots")) {
        if (slot.get("optionId").asString().equals(optionId)) {
          return slot.get("count").asLong();
        }
      }
    }
    throw new AssertionError("slot is missing");
  }

  private static String eventPath(Form form) {
    return "/api/v1/operator/events/" + form.eventId;
  }

  private static String formPath(Form form) {
    return eventPath(form) + "/forms/" + form.formId;
  }

  private static String applicationPath(Form form, String applicationId) {
    return eventPath(form) + "/applications/" + applicationId;
  }

  private static String answersPath(Form form, String applicationId) {
    return applicationPath(form, applicationId) + "/answers";
  }

  private String statusOf(String applicationId) {
    return jdbc.queryForObject(
        "SELECT status FROM applications WHERE id = ?::uuid", String.class, applicationId);
  }

  /** Audit rows of the edit paths (table reads add contact-view rows of their own). */
  private int auditCount(Form form) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action IN"
            + " ('APPLICATION_REVISED_BY_OPERATOR', 'PARTICIPANT_ADDED')",
        Integer.class,
        form.eventId);
  }

  private long participantCount(Form form) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participants WHERE event_id = ?", Long.class, form.eventId);
  }

  private void lifecycle(Form form, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, form.eventId);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    request.cookie(session, csrf()).header(CSRF_HEADER, CSRF);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(body);
    }
    return request;
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private JsonNode problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    String body =
        mvc.perform(request)
            .andExpect(status().is(httpStatus))
            .andExpect(jsonPath("$.code").value(code))
            .andReturn()
            .getResponse()
            .getContentAsString();
    return json.readTree(body);
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

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }
}
