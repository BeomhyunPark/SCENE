package app.scene.event.group;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
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
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * What group members and leaders see of each other (#452, DEC-083, participant-group contract §6).
 * Each test names the contract's numbered condition it covers. The form is stored by SQL so each
 * case controls exactly which questions exist and which are turned off.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantGroupRosterHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String MISSING = "RESOURCE_NOT_FOUND";
  private static final String MY_GROUP = "/api/v1/participant/group";

  private static final String GENDER_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_male\",\"label\":\"남\",\"group\":null,\"hidden\":false,"
          + "\"showWhen\":null},{\"optionId\":\"opt_female\",\"label\":\"여\",\"group\":null,"
          + "\"hidden\":false,\"showWhen\":null},{\"optionId\":\"opt_gone\",\"label\":\"꺼진 보기\","
          + "\"group\":null,\"hidden\":true,\"showWhen\":null}]}";

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

  /** §6.1, §6.4: members and leaders of group A get nothing of group B. */
  @Test
  void membersSeeTheirOwnGroupOnlyWithFiveKeysAndNoLeaderView() throws Exception {
    World w = world();
    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    Person lead = w.participant("가조장", "010-7000-0001", "90");
    Person mate = w.participant("나조원", "010-7000-0002", "91");
    Person otherLead = w.participant("바남조장", "010-7000-0003", "97");
    Person otherMate = w.participant("사남조원", "010-7000-0004", "98");
    w.answer(lead.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(mate.id, gender, "{\"optionId\":\"opt_female\"}");
    w.answer(otherLead.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(otherMate.id, gender, "{\"optionId\":\"opt_female\"}");
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    assign(
        w,
        change(lead.id, null, g1),
        change(mate.id, null, g1),
        change(otherLead.id, null, g2),
        change(otherMate.id, null, g2));
    ok(leaders(w, g1, 0, lead.id));
    ok(leaders(w, g2, 0, otherLead.id));
    publish(w);

    String plainBody = myGroupBody(mate);
    JsonNode plain = json.readTree(plainBody);
    assertThat(plain.propertyNames())
        .containsExactly(
            "status", "publishedAt", "group", "leader", "rosterVisible", "members", "leaderView");
    assertThat(plain.get("status").asString()).isEqualTo("ASSIGNED");
    assertThat(plain.get("leader").asBoolean()).isFalse();
    assertThat(plain.get("rosterVisible").asBoolean()).isTrue();
    assertThat(plain.get("leaderView").isNull()).isTrue();
    JsonNode members = plain.get("members");
    assertThat(names(members)).containsExactly("가조장", "나조원");
    for (JsonNode member : members) {
      assertThat(member.propertyNames())
          .containsExactly("name", "cohort", "gender", "leader", "me");
    }
    assertThat(members.get(0).get("leader").asBoolean()).isTrue();
    assertThat(members.get(0).get("me").asBoolean()).isFalse();
    assertThat(members.get(0).get("gender").asString()).isEqualTo("남");
    assertThat(members.get(1).get("me").asBoolean()).isTrue();
    assertThat(members.get(1).get("cohort").asString()).isEqualTo("91");
    assertThat(members.get(1).get("gender").asString()).isEqualTo("여");
    assertNothingOf(plainBody, otherLead, otherMate);
    assertThat(plainBody)
        .doesNotContain("010-7000-0001")
        .doesNotContain("010-7000-0002")
        .doesNotContain(lead.id.toString())
        .doesNotContain(mate.id.toString())
        .doesNotContain("participantId");

    String leadBody = myGroupBody(lead);
    JsonNode leader = json.readTree(leadBody);
    assertThat(leader.get("leader").asBoolean()).isTrue();
    assertThat(leader.get("rosterVisible").asBoolean()).isTrue();
    assertThat(names(leader.get("members"))).containsExactly("가조장", "나조원");
    assertThat(leader.get("members").get(0).get("me").asBoolean()).isTrue();
    JsonNode view = leader.get("leaderView");
    assertThat(view.propertyNames())
        .containsExactly("activeCount", "checkedInCount", "slots", "members");
    assertThat(view.get("activeCount").asLong()).isEqualTo(2);
    assertThat(view.get("checkedInCount").asLong()).isZero();
    assertThat(view.get("slots").isNull()).isTrue();
    assertThat(names(view.get("members"))).containsExactly("가조장", "나조원");
    JsonNode item = view.get("members").get(1);
    assertThat(item.propertyNames())
        .containsExactly(
            "participantId",
            "name",
            "cohort",
            "gender",
            "leader",
            "checkIn",
            "attendance",
            "room",
            "applicationRevisedAt");
    assertThat(item.get("participantId").asString()).isEqualTo(mate.id.toString());
    assertThat(item.get("room").isNull()).isTrue();
    assertThat(item.get("applicationRevisedAt").isNull()).isTrue();
    assertThat(item.get("checkIn").get("checkedIn").asBoolean()).isFalse();
    assertThat(item.get("checkIn").get("checkedInAt").isNull()).isTrue();
    JsonNode attendance = item.get("attendance");
    assertThat(attendance.get("type").asString()).isEqualTo("FULL");
    assertThat(attendance.get("arrivalSlotId").isNull()).isTrue();
    assertThat(attendance.get("slotIds").isNull()).isTrue();
    assertThat(attendance.get("lodgingNights").isNull()).isTrue();
    assertNothingOf(leadBody, otherLead, otherMate);
    // The leader response carries no phone, so it writes no privacy log.
    assertThat(leadBody).doesNotContain("010-7000-0001").doesNotContain("010-7000-0002");
    assertThat(privacyLogCount(w)).isZero();

    String otherBody = myGroupBody(otherMate);
    assertThat(names(json.readTree(otherBody).get("members"))).containsExactly("바남조장", "사남조원");
    assertThat(otherBody)
        .doesNotContain("가조장")
        .doesNotContain("나조원")
        .doesNotContain(lead.id.toString())
        .doesNotContain(mate.id.toString());
  }

  /** §6.2, §6.3, §6.9, §6.12, §5: who opens a member detail, and the phone view record. */
  @Test
  void onlyTheLeaderOpensMembersOfTheirOwnGroupAndEachPhoneViewIsRecorded() throws Exception {
    World w = world();
    UUID guardian = w.custom("보호자 연락처", "SHORT_TEXT", "{\"format\":\"PHONE\"}", false);
    Person lead = w.participant("가조장", "010-7100-0001", "90");
    Person mate = w.participant("나조원", "010-7100-0002", "91");
    Person third = w.participant("다조원", "010-7100-0003", "92");
    Person otherLead = w.participant("바남조장", "010-7100-0004", "97");
    Person otherMate = w.participant("사남조원", "010-7100-0005", "98");
    w.answer(mate.id, guardian, "{\"text\":\"010-9876-5432\"}");
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    assign(
        w,
        change(lead.id, null, g1),
        change(mate.id, null, g1),
        change(third.id, null, g1),
        change(otherLead.id, null, g2),
        change(otherMate.id, null, g2));
    ok(leaders(w, g1, 0, lead.id));
    ok(leaders(w, g2, 0, otherLead.id));
    UUID publicationId = UUID.fromString(publish(w).get("publicationId").asString());

    // §6.2: another group's member is 404 and leaves no record.
    problem(detail(lead, otherMate.id), 404, MISSING);
    problem(detail(lead, otherLead.id), 404, MISSING);
    // Unknown and malformed ids are the same 404.
    problem(detail(lead, UUID.randomUUID()), 404, MISSING);
    problem(get(MY_GROUP + "/members/not-a-uuid").cookie(lead.session), 404, MISSING);
    // §6.3: an ordinary member cannot open anyone, not even the leader or themselves.
    problem(detail(mate, third.id), 404, MISSING);
    problem(detail(mate, lead.id), 404, MISSING);
    problem(detail(mate, mate.id), 404, MISSING);
    assertThat(privacyLogCount(w)).isZero();

    // §6.12 and §5: no participant session is 401, and an operator session is no participant.
    problem(get(MY_GROUP + "/members/" + mate.id), 401, "AUTHENTICATION_REQUIRED");
    problem(get(MY_GROUP + "/members/" + mate.id).cookie(w.owner), 401, "AUTHENTICATION_REQUIRED");
    assertThat(privacyLogCount(w)).isZero();

    // §6.9: application phone and a phone-format answer → exactly one row naming both fields.
    String body =
        mvc.perform(detail(lead, mate.id))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode member = json.readTree(body);
    assertThat(member.propertyNames())
        .containsExactly(
            "participantId",
            "name",
            "cohort",
            "gender",
            "leader",
            "phone",
            "checkIn",
            "attendance",
            "room",
            "application");
    assertThat(member.get("phone").asString()).isEqualTo("010-7100-0002");
    assertThat(member.get("name").asString()).isEqualTo("나조원");
    assertThat(member.get("leader").asBoolean()).isFalse();
    assertThat(member.get("room").isNull()).isTrue();
    JsonNode answer = answer(member, guardian);
    assertThat(answer.get("display").asString()).isEqualTo("010-9876-5432");
    assertThat(answer.get("type").asString()).isEqualTo("SHORT_TEXT");
    assertThat(answer.get("operatorEdited").asBoolean()).isFalse();
    assertThat(privacyLogCount(w)).isEqualTo(1);
    Map<String, Object> log =
        jdbc.queryForMap(
            """
            SELECT action, actor_kind, actor_participant_id, actor_user_id,
                   subject_participant_id, channel, detail::text AS detail
            FROM privacy_logs WHERE event_id = ?
            """,
            w.eventId);
    assertThat(log.get("action")).isEqualTo("CONTACT_VIEW");
    assertThat(log.get("actor_kind")).isEqualTo("PARTICIPANT");
    assertThat(log.get("actor_participant_id")).isEqualTo(lead.id);
    assertThat(log.get("actor_user_id")).isNull();
    assertThat(log.get("subject_participant_id")).isEqualTo(mate.id);
    assertThat(log.get("channel")).isEqualTo("PARTICIPANT_GROUP_MEMBER");
    String detail = (String) log.get("detail");
    JsonNode detailNode = json.readTree(detail);
    assertThat(detailNode.propertyNames())
        .containsExactlyInAnyOrder("groupPublicationId", "fields");
    assertThat(detailNode.get("groupPublicationId").asString()).isEqualTo(publicationId.toString());
    assertThat(strings(detailNode.get("fields"))).containsExactly("phone", guardian.toString());
    // Whole numbers only: the ids in detail are random hex and may hold any short digit run.
    assertThat(detail)
        .doesNotContain("010-7100-0002")
        .doesNotContain("01071000002")
        .doesNotContain("010-9876-5432")
        .doesNotContain("01098765432")
        .doesNotContain("나조원")
        .doesNotContain("가조장");

    // Opening again writes again (no merging). The leader opens themselves too.
    ok(detail(lead, mate.id));
    assertThat(privacyLogCount(w)).isEqualTo(2);
    ok(detail(lead, lead.id));
    assertThat(privacyLogCount(w)).isEqualTo(3);

    // No phone value at all → no record.
    jdbc.update("UPDATE participants SET phone = '' WHERE id = ?", third.id);
    JsonNode quiet = json.readTree(ok(detail(lead, third.id)));
    assertThat(quiet.get("phone").isNull()).isTrue();
    assertThat(privacyLogCount(w)).isEqualTo(3);

    // A failed read writes nothing either.
    problem(detail(lead, otherMate.id), 404, MISSING);
    assertThat(privacyLogCount(w)).isEqualTo(3);
  }

  /** §6.8: what a member detail leaves out; §6.10 hidden options and questions; §5 newcomer. */
  @Test
  void memberDetailLeavesOutMemoHiddenAndConsentAnswers() throws Exception {
    World w = world();
    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    UUID middle =
        w.preset(
            "MIDDLE_GROUP",
            "DROPDOWN",
            "{\"options\":[{\"optionId\":\"opt_mg_a\",\"label\":\"청년1부\",\"group\":null,"
                + "\"hidden\":false,\"showWhen\":null},{\"optionId\":\"opt_newcomer\","
                + "\"label\":\"새가족 (등반X)\",\"group\":null,\"hidden\":false,\"showWhen\":null}]}");
    UUID secret = w.custom("숨긴 질문", "SHORT_TEXT", "{}", true);
    UUID consent = w.custom("개인정보 동의", "YES_NO", "{\"style\":\"CONSENT\"}", false);
    UUID allergy = w.custom("알레르기", "LONG_TEXT", "{}", false);
    UUID pick =
        w.custom(
            "티셔츠",
            "SINGLE_CHOICE",
            "{\"options\":[{\"optionId\":\"opt_s\",\"label\":\"S\",\"group\":null,"
                + "\"hidden\":true,\"showWhen\":null}]}",
            false);
    Person lead = w.participant("가조장", "010-7200-0001", "90");
    Person mate = w.participant("나조원", "010-7200-0002", "91");
    w.answer(mate.id, gender, "{\"optionId\":\"opt_gone\"}");
    w.answer(mate.id, middle, "{\"optionId\":\"opt_newcomer\"}");
    w.answer(mate.id, secret, "{\"text\":\"비밀답변\"}");
    w.answer(mate.id, consent, "{\"value\":true}");
    w.answer(mate.id, allergy, "{\"text\":\"땅콩\"}");
    w.answer(mate.id, pick, "{\"optionId\":\"opt_s\"}");
    jdbc.update(
        """
        INSERT INTO application_operations (
          application_id, space_id, event_id, memo, version, updated_by, updated_at)
        VALUES (?, ?, ?, '운영메모내용', 1, ?, now())
        """,
        w.applications.get(mate.id),
        w.spaceId,
        w.eventId,
        w.ownerId);
    jdbc.update(
        "UPDATE participants SET pin_hash = 'pinhash-secret', phone_key = 'phonekey-secret'"
            + " WHERE id = ?",
        mate.id);
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);

    String body = ok(detail(lead, mate.id));
    JsonNode member = json.readTree(body);
    // A hidden option reads as no gender (DEC-073 §6), also in the roster.
    assertThat(member.get("gender").isNull()).isTrue();
    assertThat(json.readTree(myGroupBody(lead)).get("members").get(1).get("gender").isNull())
        .isTrue();
    List<String> fieldIds = new ArrayList<>();
    for (JsonNode answer : member.get("application").get("answers")) {
      fieldIds.add(answer.get("fieldId").asString());
      assertThat(answer.propertyNames())
          .containsExactly(
              "fieldId", "presetKey", "label", "type", "display", "value", "operatorEdited");
    }
    assertThat(fieldIds)
        .contains(middle.toString(), allergy.toString(), pick.toString(), w.cohortField.toString())
        .doesNotContain(secret.toString(), consent.toString());
    assertThat(answer(member, middle).get("display").asString()).isEqualTo("새가족 (등반X)");
    assertThat(answer(member, middle).get("presetKey").asString()).isEqualTo("MIDDLE_GROUP");
    assertThat(answer(member, allergy).get("display").asString()).isEqualTo("땅콩");
    assertThat(answer(member, allergy).get("presetKey").isNull()).isTrue();
    // A hidden option keeps its text with the mark the operator table uses.
    assertThat(answer(member, pick).get("display").asString()).isEqualTo("S (숨김)");
    assertThat(answer(member, pick).get("value").get("optionId").asString()).isEqualTo("opt_s");
    JsonNode application = member.get("application");
    assertThat(application.propertyNames())
        .containsExactly("submittedAt", "revisedAt", "revisedByOperator", "answers");
    assertThat(application.get("revisedAt").isNull()).isTrue();
    assertThat(application.get("revisedByOperator").asBoolean()).isFalse();
    assertThat(body)
        .doesNotContain("운영메모내용")
        .doesNotContain("memo")
        .doesNotContain("비밀답변")
        .doesNotContain("개인정보 동의")
        .doesNotContain("pinhash-secret")
        .doesNotContain("phonekey-secret")
        .doesNotContain("hhhhhhhh")
        .doesNotContain("pin")
        .doesNotContain("accessKey")
        .doesNotContain("token");
    // The ordinary roster still has no newcomer answer (DEC-083 §5).
    assertThat(myGroupBody(mate)).doesNotContain("새가족 (등반X)").doesNotContain("newcomer");
  }

  /** §6.10: an event without a gender question, or with it turned off, has no gender. */
  @Test
  void genderIsNullWhenTheQuestionIsMissingOrOff() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-7300-0001", "90");
    Person mate = w.participant("나조원", "010-7300-0002", "91");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);
    assertGendersNull(lead, mate);

    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    w.answer(lead.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(mate.id, gender, "{\"optionId\":\"opt_female\"}");
    assertThat(json.readTree(myGroupBody(mate)).get("members").get(1).get("gender").asString())
        .isEqualTo("여");
    jdbc.update("UPDATE fields SET hidden = true WHERE id = ?", gender);
    assertGendersNull(lead, mate);
  }

  /** §6.5: the roster switch, its operator path, and the group refresh value. */
  @Test
  void rosterSwitchHidesTheRosterFromMembersOnlyAndRaisesTheGroupValue() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-7400-0001", "90");
    Person mate = w.participant("나조원", "010-7400-0002", "91");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);

    JsonNode defaults = json.readTree(ok(get(settingsPath(w)).cookie(w.owner)));
    assertThat(defaults.propertyNames())
        .containsExactly(
            "groupRosterVisibleToMembers",
            "roomRosterScope",
            "version",
            "updatedAt",
            "updatedByDisplayName");
    assertThat(defaults.get("roomRosterScope").asString()).isEqualTo("ALL");
    assertThat(defaults.get("groupRosterVisibleToMembers").asBoolean()).isTrue();
    assertThat(defaults.get("version").asInt()).isZero();
    assertThat(defaults.get("updatedAt").isNull()).isTrue();

    long before = groupsValue(w);
    long beforeUpdates = updatesGroup(mate);
    int audits = auditCount(w, "EVENT_PARTICIPANT_SETTINGS_UPDATED");
    JsonNode off = json.readTree(ok(putSettings(w.owner, w, false, 0)));
    assertThat(off.get("groupRosterVisibleToMembers").asBoolean()).isFalse();
    assertThat(off.get("version").asInt()).isEqualTo(1);
    assertThat(off.get("updatedByDisplayName").asString()).isEqualTo("Owner");
    assertThat(groupsValue(w)).isEqualTo(before + 1);
    assertThat(updatesGroup(mate)).isEqualTo(beforeUpdates + 1);
    assertThat(auditCount(w, "EVENT_PARTICIPANT_SETTINGS_UPDATED")).isEqualTo(audits + 1);
    JsonNode detail =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail::text FROM audit_logs WHERE event_id = ?"
                    + " AND action = 'EVENT_PARTICIPANT_SETTINGS_UPDATED'",
                String.class,
                w.eventId));
    assertThat(strings(detail.get("fields"))).containsExactly("groupRosterVisibleToMembers");
    assertThat(detail.get("version").asInt()).isEqualTo(1);

    JsonNode plain = myGroup(mate);
    assertThat(plain.get("rosterVisible").asBoolean()).isFalse();
    assertThat(plain.get("members").isNull()).isTrue();
    assertThat(plain.get("leaderView").isNull()).isTrue();
    assertThat(names(plain.get("group").get("leaders"))).containsExactly("가조장");
    JsonNode leader = myGroup(lead);
    assertThat(leader.get("rosterVisible").asBoolean()).isTrue();
    assertThat(names(leader.get("members"))).containsExactly("가조장", "나조원");
    assertThat(leader.get("leaderView").get("activeCount").asLong()).isEqualTo(2);

    // The same value again stores nothing and raises nothing.
    JsonNode same = json.readTree(ok(putSettings(w.owner, w, false, 1)));
    assertThat(same.get("version").asInt()).isEqualTo(1);
    assertThat(groupsValue(w)).isEqualTo(before + 1);
    assertThat(auditCount(w, "EVENT_PARTICIPANT_SETTINGS_UPDATED")).isEqualTo(audits + 1);

    // A stale version is 409 with the current one; nothing changes.
    problem(putSettings(w.owner, w, true, 0), 409, "CONCURRENT_MODIFICATION")
        .andExpect(jsonPath("$.version").value(1));
    assertThat(myGroup(mate).get("members").isNull()).isTrue();

    // Body checks.
    problem(
            write(put(settingsPath(w)), w.owner, "{\"expectedVersion\":1}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("groupRosterVisibleToMembers"));
    problem(
            write(put(settingsPath(w)), w.owner, "{\"groupRosterVisibleToMembers\":true}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    problem(
        write(
            put(settingsPath(w)),
            w.owner,
            "{\"groupRosterVisibleToMembers\":\"yes\",\"expectedVersion\":1}"),
        400,
        "VALIDATION_FAILED");

    // Permissions: STAFF reads with EVENT_READ but does not write; a stranger gets 404.
    UUID staff = w.operator("Staff", "STAFF");
    Cookie staffCookie = login(staff);
    assertThat(json.readTree(ok(get(settingsPath(w)).cookie(staffCookie))).get("version").asInt())
        .isEqualTo(1);
    problem(putSettings(staffCookie, w, true, 1), 403, "FORBIDDEN");
    UUID stranger = user("Stranger");
    Cookie strangerCookie = login(stranger);
    problem(get(settingsPath(w)).cookie(strangerCookie), 404, MISSING);

    JsonNode on = json.readTree(ok(putSettings(w.owner, w, true, 1)));
    assertThat(on.get("version").asInt()).isEqualTo(2);
    assertThat(groupsValue(w)).isEqualTo(before + 2);
    assertThat(names(myGroup(mate).get("members"))).containsExactly("가조장", "나조원");

    // ENDED still writes; ARCHIVED does not.
    lifecycle(w.eventId, "ENDED");
    ok(putSettings(w.owner, w, false, 2));
    lifecycle(w.eventId, "ARCHIVED");
    problem(putSettings(w.owner, w, true, 3), 409, "EVENT_ARCHIVED");
    assertThat(json.readTree(ok(get(settingsPath(w)).cookie(w.owner))).get("version").asInt())
        .isEqualTo(3);
  }

  /** §6.6: working-copy edits change nothing until the next publication. */
  @Test
  void workingCopyEditsChangeNothingUntilPublished() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-7500-0001", "90");
    Person mate = w.participant("나조원", "010-7500-0002", "91");
    Person third = w.participant("다조원", "010-7500-0003", "92");
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1), change(third.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);
    ok(detail(lead, third.id));

    // Move a member away and make another one leader, in the working copy only.
    assign(w, change(third.id, g1, g2));
    ok(leaders(w, g1, 1, mate.id));
    assertThat(names(myGroup(lead).get("members"))).containsExactly("가조장", "나조원", "다조원");
    assertThat(myGroup(lead).get("leader").asBoolean()).isTrue();
    assertThat(myGroup(mate).get("leaderView").isNull()).isTrue();
    ok(detail(lead, third.id));
    problem(detail(mate, lead.id), 404, MISSING);

    publish(w);
    JsonNode former = myGroup(lead);
    assertThat(former.get("leader").asBoolean()).isFalse();
    assertThat(former.get("leaderView").isNull()).isTrue();
    assertThat(names(former.get("members"))).containsExactly("가조장", "나조원");
    problem(detail(lead, mate.id), 404, MISSING);
    problem(detail(mate, third.id), 404, MISSING);
    ok(detail(mate, lead.id));
    assertThat(names(myGroup(mate).get("leaderView").get("members"))).containsExactly("가조장", "나조원");
    JsonNode moved = myGroup(third);
    assertThat(moved.get("group").get("name").asString()).isEqualTo("2조");
    assertNothingOf(myGroupBody(third), lead, mate);
  }

  /**
   * §6.7: a withdrawn member drops out of the roster, the leader view, and the detail. A withdrawn
   * leader has no session any more (DEC-084 §4), so the group read is 401 before {@code
   * NOT_ELIGIBLE} could apply.
   */
  @Test
  void withdrawnPeopleDropOutOfEveryRead() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-7600-0001", "90");
    Person mate = w.participant("나조원", "010-7600-0002", "91");
    Person quit = w.participant("라철회", "010-7600-0003", "92");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1), change(quit.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);
    ok(detail(lead, quit.id));
    assertThat(myGroup(lead).get("leaderView").get("activeCount").asLong()).isEqualTo(3);
    int logs = privacyLogCount(w);

    w.withdraw(quit.id);
    JsonNode leader = myGroup(lead);
    assertThat(names(leader.get("members"))).containsExactly("가조장", "나조원");
    assertThat(names(leader.get("leaderView").get("members"))).containsExactly("가조장", "나조원");
    assertThat(leader.get("leaderView").get("activeCount").asLong()).isEqualTo(2);
    assertThat(myGroupBody(mate)).doesNotContain("라철회");
    problem(detail(lead, quit.id), 404, MISSING);
    assertThat(privacyLogCount(w)).isEqualTo(logs);

    w.withdraw(lead.id);
    problem(get(MY_GROUP).cookie(lead.session), 401, "AUTHENTICATION_REQUIRED");
    problem(detail(lead, mate.id), 401, "AUTHENTICATION_REQUIRED");
    JsonNode plain = myGroup(mate);
    assertThat(plain.get("group").get("leaders").size()).isZero();
    assertThat(names(plain.get("members"))).containsExactly("나조원");
  }

  /** The leader view's check-in counts and the member revision time. */
  @Test
  void leaderViewCountsCheckInsAndShowsTheRevisionTime() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-7700-0001", "90");
    Person mate = w.participant("나조원", "010-7700-0002", "91");
    Person third = w.participant("다조원", "010-7700-0003", "92");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1), change(third.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);
    w.checkIn(mate.id, "CHECKED_IN");
    w.checkIn(third.id, "CANCELLED");
    UUID revised = w.revise(mate.id, "OPERATOR");

    JsonNode view = myGroup(lead).get("leaderView");
    assertThat(view.get("activeCount").asLong()).isEqualTo(3);
    assertThat(view.get("checkedInCount").asLong()).isEqualTo(1);
    JsonNode mateItem = view.get("members").get(1);
    assertThat(mateItem.get("checkIn").get("checkedIn").asBoolean()).isTrue();
    assertThat(mateItem.get("checkIn").get("checkedInAt").isString()).isTrue();
    assertThat(mateItem.get("applicationRevisedAt").isString()).isTrue();
    JsonNode thirdItem = view.get("members").get(2);
    assertThat(thirdItem.get("checkIn").get("checkedIn").asBoolean()).isFalse();
    assertThat(thirdItem.get("checkIn").get("checkedInAt").isNull()).isTrue();

    JsonNode member = json.readTree(ok(detail(lead, mate.id)));
    assertThat(member.get("checkIn").get("checkedIn").asBoolean()).isTrue();
    JsonNode application = member.get("application");
    assertThat(application.get("revisedAt").asString())
        .isEqualTo(mateItem.get("applicationRevisedAt").asString());
    assertThat(application.get("revisedByOperator").asBoolean()).isTrue();
    assertThat(application.get("submittedAt").asString())
        .isNotEqualTo(application.get("revisedAt").asString());
    // The operator revision changed 또래, so that answer reads as operator-edited.
    assertThat(answer(member, w.cohortField).get("operatorEdited").asBoolean()).isTrue();
    assertThat(answer(member, w.cohortField).get("display").asString()).isEqualTo("99");
    assertThat(revised).isNotNull();
  }

  /** §6.11: no other participant's phone or answer in the other participant reads. */
  @Test
  void otherParticipantReadsCarryNoOtherPhoneOrAnswer() throws Exception {
    World w = world();
    UUID allergy = w.custom("알레르기", "LONG_TEXT", "{}", false);
    Person lead = w.participant("가조장", "010-7800-0001", "90");
    Person mate = w.participant("나조원", "010-7800-0002", "91");
    w.answer(mate.id, allergy, "{\"text\":\"조원알레르기답\"}");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w);
    ok(detail(lead, mate.id));

    for (String path :
        List.of(
            "/api/v1/participant/home",
            "/api/v1/participant/updates",
            "/api/v1/participant/notifications",
            "/api/v1/participant/schedule",
            "/api/v1/participant/notices",
            "/api/v1/participant/application",
            "/api/v1/participant/me",
            MY_GROUP)) {
      String body =
          mvc.perform(get(path).cookie(lead.session))
              .andReturn()
              .getResponse()
              .getContentAsString();
      assertThat(body)
          .as(path)
          .doesNotContain("010-7800-0002")
          .doesNotContain("01078000002")
          .doesNotContain("조원알레르기답");
    }
  }

  private void assertGendersNull(Person lead, Person mate) throws Exception {
    JsonNode leader = myGroup(lead);
    for (JsonNode member : leader.get("members")) {
      assertThat(member.get("gender").isNull()).isTrue();
    }
    for (JsonNode member : leader.get("leaderView").get("members")) {
      assertThat(member.get("gender").isNull()).isTrue();
    }
    for (JsonNode member : myGroup(mate).get("members")) {
      assertThat(member.get("gender").isNull()).isTrue();
    }
    assertThat(json.readTree(ok(detail(lead, mate.id))).get("gender").isNull()).isTrue();
  }

  private static void assertNothingOf(String body, Person... others) {
    for (Person other : others) {
      assertThat(body).doesNotContain(other.id.toString());
    }
    assertThat(body)
        .doesNotContain("바남조장")
        .doesNotContain("사남조원")
        .doesNotContain("\"97\"")
        .doesNotContain("\"98\"");
  }

  // ---- requests ----

  private MockHttpServletRequestBuilder detail(Person reader, UUID participantId) {
    return get(MY_GROUP + "/members/" + participantId).cookie(reader.session);
  }

  private static String settingsPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/participant-settings";
  }

  private MockHttpServletRequestBuilder putSettings(
      Cookie session, World w, boolean visible, int expectedVersion) {
    return write(
        put(settingsPath(w)),
        session,
        "{\"groupRosterVisibleToMembers\":"
            + visible
            + ",\"expectedVersion\":"
            + expectedVersion
            + "}");
  }

  private JsonNode myGroup(Person p) throws Exception {
    return json.readTree(myGroupBody(p));
  }

  private String myGroupBody(Person p) throws Exception {
    return mvc.perform(get(MY_GROUP).cookie(p.session))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private long updatesGroup(Person p) throws Exception {
    return json.readTree(ok(get("/api/v1/participant/updates").cookie(p.session)))
        .get("group")
        .asLong();
  }

  private JsonNode publish(World w) throws Exception {
    long version =
        json.readTree(ok(get(boardPath(w)).cookie(w.owner))).get("boardVersion").asLong();
    return json.readTree(
        ok(
            write(
                post(groupsPath(w) + "/publish"),
                w.owner,
                "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}")));
  }

  private String createGroup(World w, String name) throws Exception {
    String body = json.writeValueAsString(Map.of("name", name));
    return json.readTree(created(write(post(groupsPath(w)), w.owner, body)))
        .get("group")
        .get("groupId")
        .asString();
  }

  private MockHttpServletRequestBuilder leaders(World w, String groupId, int version, UUID... ids) {
    List<String> list = new ArrayList<>();
    for (UUID id : ids) {
      list.add(id.toString());
    }
    String body =
        json.writeValueAsString(Map.of("participantIds", list, "expectedVersion", version));
    return write(put(groupsPath(w) + "/" + groupId + "/leaders"), w.owner, body);
  }

  private void assign(World w, String... changes) throws Exception {
    ok(
        write(
            post("/api/v1/operator/events/" + w.eventId + "/group-assignments"),
            w.owner,
            "{\"changes\":[" + String.join(",", changes) + "]}"));
  }

  private static String change(UUID participantId, String from, String to) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromGroupId\":"
        + (from == null ? "null" : "\"" + from + "\"")
        + ",\"toGroupId\":"
        + (to == null ? "null" : "\"" + to + "\"")
        + "}";
  }

  private static JsonNode answer(JsonNode member, UUID fieldId) {
    for (JsonNode answer : member.get("application").get("answers")) {
      if (answer.get("fieldId").asString().equals(fieldId.toString())) {
        return answer;
      }
    }
    throw new AssertionError("no answer for " + fieldId);
  }

  private static List<String> names(JsonNode list) {
    List<String> names = new ArrayList<>();
    for (JsonNode item : list) {
      names.add(item.get("name").asString());
    }
    return names;
  }

  private static List<String> strings(JsonNode list) {
    List<String> out = new ArrayList<>();
    list.forEach(item -> out.add(item.asString()));
    return out;
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

  private ResultActions problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    return mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code));
  }

  // ---- fixtures ----

  private int privacyLogCount(World w) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM privacy_logs WHERE event_id = ?", Integer.class, w.eventId);
  }

  private long groupsValue(World w) {
    Long value =
        jdbc
            .queryForList(
                "SELECT groups FROM participant_feed_versions WHERE event_id = ?",
                Long.class,
                w.eventId)
            .stream()
            .findFirst()
            .orElse(0L);
    return value;
  }

  private int auditCount(World w, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        w.eventId,
        action);
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

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
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

  private static String boardPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/group-board";
  }

  private static String groupsPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/groups";
  }

  private record Person(UUID id, Cookie session) {}

  /** A space with an ACTIVE event created by its owner, plus a form with the 또래 question. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = user("Owner");
    member(spaceId, ownerId, "OWNER");
    Cookie owner = login(ownerId);
    String created =
        created(
            write(
                post("/api/v1/operator/spaces/" + spaceId + "/events"),
                owner,
                "{\"name\":\"수련회\"}"));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    lifecycle(eventId, "ACTIVE");
    UUID formId =
        jdbc.queryForList("SELECT id FROM forms WHERE event_id = ?", UUID.class, eventId).stream()
            .findFirst()
            .orElse(null);
    if (formId == null) {
      formId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO forms (id, space_id, event_id) VALUES (?, ?, ?)", formId, spaceId, eventId);
    }
    UUID cohortField =
        jdbc
            .queryForList(
                "SELECT id FROM fields WHERE form_id = ? AND system_key = 'COHORT'",
                UUID.class,
                formId)
            .stream()
            .findFirst()
            .orElse(null);
    if (cohortField == null) {
      cohortField = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, system_key, label, position, required)
          VALUES (?, ?, ?, ?, 'SYSTEM', 'COHORT', '또래',
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?), true)
          """,
          cohortField,
          spaceId,
          eventId,
          formId,
          formId);
    }
    return new World(spaceId, eventId, formId, cohortField, owner, ownerId);
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID cohortField;
    final Cookie owner;
    final UUID ownerId;
    final Map<UUID, UUID> applications = new LinkedHashMap<>();

    World(UUID spaceId, UUID eventId, UUID formId, UUID cohortField, Cookie owner, UUID ownerId) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.cohortField = cohortField;
      this.owner = owner;
      this.ownerId = ownerId;
    }

    UUID operator(String name, String role) {
      UUID id = user(name);
      member(spaceId, id, "MEMBER");
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return id;
    }

    /** A generated question of the form with {@code key}. */
    UUID preset(String key, String type, String config) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, label, position, answer_type, required,
            config, preset_key, preset_state)
          VALUES (?, ?, ?, ?, 'CUSTOM', ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?),
            ?, false, ?::jsonb, ?, '{"active": true}'::jsonb)
          """,
          id,
          spaceId,
          eventId,
          formId,
          key,
          formId,
          type,
          config,
          key);
      return id;
    }

    /** A question the operator made by hand. */
    UUID custom(String label, String type, String config, boolean hidden) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, label, position, answer_type, required,
            config, hidden)
          VALUES (?, ?, ?, ?, 'CUSTOM', ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?),
            ?, false, ?::jsonb, ?)
          """,
          id,
          spaceId,
          eventId,
          formId,
          label,
          formId,
          type,
          config,
          hidden);
      return id;
    }

    void answer(UUID participantId, UUID fieldId, String value) {
      jdbc.update(
          """
          INSERT INTO answers (id, space_id, event_id, application_id, field_id, value)
          VALUES (?, ?, ?, ?, ?, ?::jsonb)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          applications.get(participantId),
          fieldId,
          value);
    }

    void withdraw(UUID participantId) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", participantId);
    }

    void checkIn(UUID participantId, String status) {
      boolean cancelled = "CANCELLED".equals(status);
      jdbc.update(
          """
          INSERT INTO checkins (
            id, space_id, event_id, participant_id, status, method, checked_in_at, checked_in_by,
            cancelled_at, cancelled_by)
          VALUES (?, ?, ?, ?, ?, 'MANUAL', now() - interval '1 hour', ?, ?, ?)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          participantId,
          status,
          ownerId,
          cancelled ? java.sql.Timestamp.from(java.time.Instant.now()) : null,
          cancelled ? ownerId : null);
    }

    /**
     * Stores revision 2 of the participant's application as {@code by} would, with the 또래 answer
     * changed to 99, and returns its id.
     */
    UUID revise(UUID participantId, String by) {
      UUID previous = applications.get(participantId);
      UUID next = UUID.randomUUID();
      jdbc.update("UPDATE applications SET status = 'SUPERSEDED' WHERE id = ?", previous);
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id, revision,
            previous_application_id, revised_by, revised_by_user_id, changes)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now() + interval '1 minute', ?, 2, ?, ?, ?, ?::jsonb)
          """,
          next,
          spaceId,
          eventId,
          formId,
          participantId,
          previous,
          by,
          "OPERATOR".equals(by) ? ownerId : null,
          "[{\"key\":\"FIELD\",\"fieldId\":\"" + cohortField + "\",\"label\":\"또래\"}]");
      applications.put(participantId, next);
      answer(participantId, cohortField, "{\"text\":\"99\"}");
      return next;
    }

    /**
     * A participant with one SUBMITTED application and a signed-in participant session. A null
     * cohort stores no 또래 answer.
     */
    Person participant(String name, String phone, String cohort) {
      UUID id = UUID.randomUUID();
      String digits = phone.replaceAll("[^0-9]", "");
      jdbc.update(
          """
          INSERT INTO participants (
            id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
          """,
          id,
          spaceId,
          eventId,
          name,
          phone,
          "h".repeat(64),
          digits.substring(digits.length() - 4));
      UUID applicationId = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now(), ?)
          """,
          applicationId,
          spaceId,
          eventId,
          formId,
          id);
      applications.put(id, applicationId);
      if (cohort != null) {
        answer(id, cohortField, "{\"text\":\"" + cohort + "\"}");
      }
      return new Person(id, ParticipantSessions.open(jdbc, spaceId, eventId, id));
    }
  }
}
