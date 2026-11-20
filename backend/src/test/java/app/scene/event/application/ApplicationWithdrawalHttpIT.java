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
 * Operator withdraw and restore (DEC-084, #338, api.md "신청 취소와 되돌리기"). The form comes from the
 * setup API and people apply through the public submit, so every reader sees real answers. The
 * first test ties the readers together: a withdrawn person leaves the summary (meals, lodging,
 * transport), the group board (working copy, publication, leaders), check-in (counts, roster, QR,
 * manual), the CSV, the applicant table and participant sign-in, and a restore brings them back
 * without the group. New readers that keep to {@code SUBMITTED} add a line here.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ApplicationWithdrawalHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String PIN = "730914";

  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  private static final String SETUP =
      "{\"gender\":true,\"middleGroup\":false,\"cell\":false,"
          + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\"SLOTS\"},\"schedule\":"
          + SCHEDULE
          + ",\"transport\":{\"groupBus\":true,\"worshipShuttle\":false,\"car\":true,"
          + "\"publicTransit\":true,\"support\":false}}";

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
  void withdrawnPersonLeavesEveryReaderAndRestoreBringsThemBackWithoutTheGroup() throws Exception {
    Form form = openForm("일치 owner");
    Person garam = form.submit("가람", 1, full("opt_group"));
    Person narae = form.submit("나래", 2, partial());
    Person dasom = form.submit("다솜", 3, full("opt_public"));

    String g1 = createGroup(form, "1조");
    assign(form, change(garam, g1), change(narae, g1), change(dasom, g1));
    ok(form.owner(put(groupPath(form, g1) + "/leaders"), leadersBody(0, narae)));
    publish(form);
    checkIn(form, "{\"mode\":\"MANUAL\",\"participantId\":\"" + narae.participantId + "\"}");
    String naraeQr =
        json.readTree(ok(get("/api/v1/participant/check-in").cookie(narae.session)))
            .get("code")
            .asString();
    signIn(form, "나래", 2, PIN, 204);

    JsonNode before = summary(form);
    assertThat(before.get("total").asLong()).isEqualTo(3);
    assertThat(before.get("attendance").get("partial").asLong()).isEqualTo(1);
    long nights = night(before, "opt_n2");
    long lunches = slot(before, "opt_d2_lunch");
    assertThat(nights).isEqualTo(3);
    assertThat(lunches).isEqualTo(3);
    assertThat(transportIn(before, "opt_car")).isEqualTo(1);
    assertThat(checkInSummary(form).get("checkedIn").asLong()).isEqualTo(1);
    long boardVersion = board(form).get("boardVersion").asLong();
    int groupVersion = groupVersion(form, g1);
    int audits = auditCount(form.eventId);
    long groupFeed = updates(garam).get("group").asLong();

    // Withdraw the leader who already arrived.
    JsonNode withdrawn =
        json.readTree(
            ok(form.owner(post(withdrawPath(form, narae)), "{\"reason\":\"  가족 사정으로 못 와요 \"}")));
    assertThat(withdrawn.propertyNames())
        .containsExactly(
            "result",
            "applicationId",
            "participantId",
            "withdrawal",
            "removedGroup",
            "checkedInAt");
    assertThat(withdrawn.get("result").asString()).isEqualTo("WITHDRAWN");
    assertThat(withdrawn.get("withdrawal").get("reason").asString()).isEqualTo("가족 사정으로 못 와요");
    assertThat(withdrawn.get("withdrawal").get("withdrawnByDisplayName").asString())
        .isEqualTo("일치 owner");
    assertThat(withdrawn.get("withdrawal").get("reapplyBlocked").asBoolean()).isFalse();
    assertThat(withdrawn.get("removedGroup").get("groupId").asString()).isEqualTo(g1);
    assertThat(withdrawn.get("removedGroup").get("name").asString()).isEqualTo("1조");
    assertThat(withdrawn.get("removedGroup").get("leader").asBoolean()).isTrue();
    assertThat(withdrawn.get("checkedInAt").isNull()).isFalse();
    assertThat(statusOf(narae)).isEqualTo("WITHDRAWN");

    // Summary: meals, lodging and transport.
    JsonNode after = summary(form);
    assertThat(after.get("total").asLong()).isEqualTo(2);
    assertThat(after.get("attendance").get("partial").asLong()).isZero();
    assertThat(night(after, "opt_n2")).isEqualTo(nights - 1);
    assertThat(slot(after, "opt_d2_lunch")).isEqualTo(lunches - 1);
    assertThat(transportIn(after, "opt_car")).isZero();

    // Group board: out of the working copy, logged, leaderless group, versions moved.
    JsonNode board = board(form);
    assertThat(ids(board.get("participants"))).containsExactlyInAnyOrder(garam.id(), dasom.id());
    assertThat(board.get("withdrawn").size()).isEqualTo(1);
    assertThat(board.get("withdrawn").get(0).get("participantId").asString()).isEqualTo(narae.id());
    assertThat(board.get("withdrawn").get(0).get("groupId").asString()).isEqualTo(g1);
    assertThat(board.get("boardVersion").asLong()).isEqualTo(boardVersion + 1);
    assertThat(groupVersion(form, g1)).isEqualTo(groupVersion + 1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM group_assignments WHERE participant_id = ?",
                Integer.class,
                narae.participantId))
        .isZero();
    Map<String, Object> log =
        jdbc.queryForMap(
            "SELECT from_group_id::text AS from_group, to_group_id, leader_before, leader_after"
                + " FROM group_assignment_logs WHERE participant_id = ? AND cause = 'WITHDRAWN'",
            narae.participantId);
    assertThat(log.get("from_group")).isEqualTo(g1);
    assertThat(log.get("to_group_id")).isNull();
    assertThat(log.get("leader_before")).isEqualTo(true);
    assertThat(log.get("leader_after")).isEqualTo(false);

    // Publication stays as stored, and reads leave the withdrawn leader out at once.
    JsonNode published = json.readTree(ok(get(groupsPath(form) + "/published").cookie(form.owner)));
    JsonNode group = published.get("groups").get(0);
    assertThat(ids(group.get("members"))).containsExactlyInAnyOrder(garam.id(), dasom.id());
    assertThat(group.get("leaders").size()).isZero();
    assertThat(published.toString()).doesNotContain("나래");
    JsonNode mine = json.readTree(ok(get("/api/v1/participant/group").cookie(garam.session)));
    assertThat(mine.get("group").get("leaders").size()).isZero();

    // Check-in: counts, roster, QR and manual.
    JsonNode counts = checkInSummary(form);
    assertThat(counts.get("total").asLong()).isEqualTo(2);
    assertThat(counts.get("checkedIn").asLong()).isZero();
    JsonNode roster =
        json.readTree(ok(get(eventPath(form) + "/check-in-roster").cookie(form.owner)));
    assertThat(roster.get("page").get("totalItems").asLong()).isEqualTo(2);
    assertThat(roster.toString()).doesNotContain("나래");
    checkInRejected(form, "{\"mode\":\"QR\",\"code\":\"" + naraeQr + "\"}");
    checkInRejected(
        form, "{\"mode\":\"MANUAL\",\"participantId\":\"" + narae.participantId + "\"}");
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM checkins WHERE participant_id = ?",
                String.class,
                narae.participantId))
        .isEqualTo("CHECKED_IN");

    // CSV and the applicant table.
    MockHttpServletResponse csv = export(form);
    assertThat(csv.getHeader("X-Export-Count")).isEqualTo("2");
    assertThat(csvText(csv)).doesNotContain("나래").doesNotContain("가족 사정");
    JsonNode table = table(form);
    assertThat(table.get("rows").size()).isEqualTo(2);
    assertThat(table.get("withdrawn").size()).isEqualTo(1);
    JsonNode item = table.get("withdrawn").get(0);
    assertThat(item.propertyNames())
        .containsExactly(
            "applicationId",
            "participantId",
            "name",
            "submittedAt",
            "withdrawal",
            "previousGroup",
            "checkedInAt");
    assertThat(item.get("name").asString()).isEqualTo("나래");
    assertThat(item.get("withdrawal").get("reason").asString()).isEqualTo("가족 사정으로 못 와요");
    assertThat(item.get("previousGroup").get("name").asString()).isEqualTo("1조");
    JsonNode detail = json.readTree(ok(get(applicationPath(form, narae)).cookie(form.owner)));
    assertThat(detail.get("status").asString()).isEqualTo("WITHDRAWN");
    assertThat(detail.get("withdrawal").get("reason").asString()).isEqualTo("가족 사정으로 못 와요");
    assertThat(
            json.readTree(ok(get(applicationPath(form, garam)).cookie(form.owner)))
                .get("withdrawal")
                .isNull())
        .isTrue();

    // Participant: the old cookie and a new sign-in are both refused.
    mvc.perform(get("/api/v1/participant/me").cookie(narae.session))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    // Every participant path, the home and notification paths (DEC-080) included.
    for (String path :
        List.of(
            "/api/v1/participant/home",
            "/api/v1/participant/updates",
            "/api/v1/participant/notifications",
            "/api/v1/participant/group",
            "/api/v1/participant/check-in",
            "/api/v1/participant/application")) {
      mvc.perform(get(path).cookie(narae.session))
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
    assertThat(sessionCount(narae)).isZero();
    signIn(form, "나래", 2, PIN, 401);
    // The others read their group again: the withdrawn leader left the publication.
    assertThat(updates(garam).get("group").asLong()).isEqualTo(groupFeed + 1);

    // History and audit: the reason stays out of audit.
    Map<String, Object> history =
        jdbc.queryForMap(
            "SELECT action, reason, actor_kind, block_reapply FROM application_status_logs"
                + " WHERE participant_id = ?",
            narae.participantId);
    assertThat(history.get("action")).isEqualTo("WITHDRAWN");
    assertThat(history.get("reason")).isEqualTo("가족 사정으로 못 와요");
    assertThat(history.get("actor_kind")).isEqualTo("OPERATOR");
    assertThat(auditCount(form.eventId)).isGreaterThan(audits);
    JsonNode audit =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail FROM audit_logs WHERE event_id = ? AND action ="
                    + " 'APPLICATION_WITHDRAWN'",
                String.class,
                form.eventId));
    assertThat(audit.propertyNames())
        .containsExactlyInAnyOrder(
            "applicationId", "participantId", "groupRemoved", "reasonGiven", "blockReapply");
    assertThat(audit.get("groupRemoved").asBoolean()).isTrue();
    assertThat(audit.get("reasonGiven").asBoolean()).isTrue();
    assertThat(audit.toString()).doesNotContain("가족");

    // The same request again changes nothing.
    int auditsAfter = auditCount(form.eventId);
    JsonNode again = json.readTree(ok(form.owner(post(withdrawPath(form, narae)), "{}")));
    assertThat(again.get("result").asString()).isEqualTo("ALREADY_WITHDRAWN");
    assertThat(again.get("removedGroup").isNull()).isTrue();
    assertThat(auditCount(form.eventId)).isEqualTo(auditsAfter);
    assertThat(historyCount(narae)).isEqualTo(1);

    // Restore: back everywhere, unassigned, with the previous group as a reference.
    JsonNode restored = json.readTree(ok(form.owner(post(restorePath(form, narae)), null)));
    assertThat(restored.get("result").asString()).isEqualTo("RESTORED");
    assertThat(restored.get("previousGroup").get("groupId").asString()).isEqualTo(g1);
    assertThat(restored.get("reapplyBlocked").asBoolean()).isFalse();
    assertThat(statusOf(narae)).isEqualTo("SUBMITTED");
    JsonNode back = summary(form);
    assertThat(back.get("total").asLong()).isEqualTo(3);
    assertThat(night(back, "opt_n2")).isEqualTo(nights);
    assertThat(slot(back, "opt_d2_lunch")).isEqualTo(lunches);
    assertThat(transportIn(back, "opt_car")).isEqualTo(1);
    JsonNode boardBack = board(form);
    assertThat(ids(boardBack.get("participants")))
        .containsExactlyInAnyOrder(garam.id(), narae.id(), dasom.id());
    for (JsonNode participant : boardBack.get("participants")) {
      if (participant.get("participantId").asString().equals(narae.id())) {
        assertThat(participant.get("groupId").isNull()).isTrue();
      }
    }
    assertThat(boardBack.get("withdrawn").size()).isZero();
    // The old publication does not give the restored person the group or the leader mark back.
    JsonNode publishedBack =
        json.readTree(ok(get(groupsPath(form) + "/published").cookie(form.owner)));
    assertThat(ids(publishedBack.get("groups").get(0).get("members")))
        .containsExactlyInAnyOrder(garam.id(), dasom.id());
    assertThat(publishedBack.get("groups").get(0).get("leaders").size()).isZero();
    assertThat(ids(publishedBack.get("unassigned"))).containsExactly(narae.id());
    JsonNode mineBack = json.readTree(ok(get("/api/v1/participant/group").cookie(garam.session)));
    assertThat(mineBack.get("group").get("leaders").size()).isZero();
    assertThat(checkInSummary(form).get("checkedIn").asLong()).isEqualTo(1);
    assertThat(export(form).getHeader("X-Export-Count")).isEqualTo("3");
    JsonNode tableBack = table(form);
    assertThat(tableBack.get("rows").size()).isEqualTo(3);
    assertThat(tableBack.get("withdrawn").size()).isZero();
    signIn(form, "나래", 2, PIN, 204);
    assertThat(
            json.readTree(ok(form.owner(post(restorePath(form, narae)), null)))
                .get("result")
                .asString())
        .isEqualTo("ALREADY_SUBMITTED");
    assertThat(historyCount(narae)).isEqualTo(2);
  }

  @Test
  void permissionEventStateBodyAndStaleRevisionAreChecked() throws Exception {
    Form form = openForm("검사 owner");
    Person garam = form.submit("가람", 1, full("opt_group"));
    String path = withdrawPath(form, garam);

    problem(
        form.owner(
            post(eventPath(form) + "/applications/" + UUID.randomUUID() + "/withdraw"), "{}"),
        404,
        "RESOURCE_NOT_FOUND");
    UUID staffId = user("현장 스태프");
    member(form.spaceId, staffId, "MEMBER");
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        form.spaceId,
        form.eventId,
        staffId);
    Cookie staff = login(staffId);
    problem(write(post(path), staff, "{}"), 403, "FORBIDDEN");
    problem(write(post(restorePath(form, garam)), staff, null), 403, "FORBIDDEN");
    problem(
        form.owner(post(path), "{\"reason\":\"" + "가".repeat(201) + "\"}"),
        400,
        "VALIDATION_FAILED");
    problem(form.owner(post(path), "{\"reason\":3}"), 400, "VALIDATION_FAILED");
    problem(form.owner(post(path), "{\"blockReapply\":\"yes\"}"), 400, "VALIDATION_FAILED");

    lifecycle(form, "ENDED");
    problem(form.owner(post(path), "{}"), 409, "EVENT_ENDED");
    lifecycle(form, "ARCHIVED");
    problem(form.owner(post(path), "{}"), 409, "EVENT_ARCHIVED");
    lifecycle(form, "ACTIVE");
    assertThat(statusOf(garam)).isEqualTo("SUBMITTED");

    // The participant edits through the same phone; the old id is stale.
    Person edited = form.submitAgain("가람", 1, full("opt_public"), PIN, 200);
    assertThat(edited.applicationId).isNotEqualTo(garam.applicationId);
    JsonNode stale = problem(form.owner(post(path), "{}"), 409, "CONCURRENT_MODIFICATION");
    assertThat(stale.get("applicationId").asString()).isEqualTo(edited.applicationId);
    assertThat(stale.get("status").asString()).isEqualTo("SUBMITTED");
    assertThat(stale.get("revision").asInt()).isEqualTo(2);
    problem(form.owner(post(restorePath(form, garam)), null), 409, "CONCURRENT_MODIFICATION");
    // A body-less withdraw of the current revision is fine.
    assertThat(
            json.readTree(ok(form.owner(post(withdrawPath(form, edited)), null)))
                .get("withdrawal")
                .get("reason")
                .isNull())
        .isTrue();
    assertThat(table(form).get("withdrawn").get(0).get("previousGroup").isNull()).isTrue();
  }

  @Test
  void withdrawnPersonComesBackByApplyingAgainUnlessReapplyIsBlocked() throws Exception {
    Form form = openForm("재신청 owner");
    Person garam = form.submit("가람", 1, full("opt_group"));
    Person narae = form.submit("나래", 2, full("opt_group"));
    ok(form.owner(post(withdrawPath(form, garam)), "{}"));

    // A wrong number reads like any other phone that applied.
    form.submitAgain("가람", 1, full("opt_group"), "481207", 409);
    // The right number and the same answers bring the same row back.
    Person same = form.submitAgain("가람", 1, full("opt_group"), PIN, 200);
    assertThat(same.restored).isTrue();
    assertThat(same.applicationId).isEqualTo(garam.applicationId);
    assertThat(statusOf(garam)).isEqualTo("SUBMITTED");
    ok(get("/api/v1/participant/me").cookie(same.session));
    assertThat(
            jdbc.queryForObject(
                "SELECT actor_kind FROM application_status_logs WHERE participant_id = ?"
                    + " AND action = 'RESTORED'",
                String.class,
                garam.participantId))
        .isEqualTo("PARTICIPANT");

    // Changed answers make a new revision and the withdrawn row becomes SUPERSEDED.
    ok(form.owner(post(withdrawPath(form, same)), "{}"));
    Person changed = form.submitAgain("가람", 1, full("opt_public"), PIN, 200);
    assertThat(changed.restored).isTrue();
    assertThat(changed.applicationId).isNotEqualTo(garam.applicationId);
    assertThat(statusOf(garam)).isEqualTo("SUPERSEDED");
    assertThat(table(form).get("rows").size()).isEqualTo(2);

    // Blocking reapply makes the number unusable until an operator resets it.
    ok(form.owner(post(withdrawPath(form, narae)), "{\"blockReapply\":true}"));
    form.submitAgain("나래", 2, full("opt_group"), PIN, 409);
    String temporary =
        json.readTree(
                ok(
                    form.owner(
                        post(
                            eventPath(form)
                                + "/participants/"
                                + narae.participantId
                                + "/pin-reset"),
                        null)))
            .get("temporaryPin")
            .asString();
    Person owner = form.submitAgain("나래", 2, full("opt_public"), temporary, 200);
    assertThat(owner.restored).isTrue();
    assertThat(table(form).get("rows").size()).isEqualTo(2);
    assertThat(table(form).get("withdrawn").size()).isZero();
  }

  // ---- form, people and requests ----

  private final class Form {
    final UUID spaceId;
    final UUID eventId;
    final String formId;
    final Cookie owner;
    final Map<String, String> fieldIds = new LinkedHashMap<>();

    Form(UUID spaceId, UUID eventId, String formId, Cookie owner, JsonNode detail) {
      this.spaceId = spaceId;
      this.eventId = eventId;
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

    Person submit(String name, int number, Map<String, String> values) throws Exception {
      return submitAgain(name, number, values, PIN, 201);
    }

    /** Submits through the public form and expects {@code httpStatus}; a person on 200 and 201. */
    Person submitAgain(
        String name, int number, Map<String, String> values, String pin, int httpStatus)
        throws Exception {
      List<String> answers = new ArrayList<>();
      answers.add(text("NAME", name));
      answers.add(text("PHONE", phone(number)));
      answers.add(text("COHORT", "9" + number));
      values.forEach(
          (key, value) ->
              answers.add("{\"fieldId\":\"" + fieldIds.get(key) + "\",\"value\":" + value + "}"));
      if (fieldIds.containsKey("CONSENT")) {
        answers.add("{\"fieldId\":\"" + fieldIds.get("CONSENT") + "\",\"value\":{\"value\":true}}");
      }
      MockHttpServletResponse response =
          mvc.perform(
                  post("/api/v1/public/events/" + eventId + "/forms/" + formId + "/applications")
                      .cookie(csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(
                          "{\"pin\":\""
                              + pin
                              + "\",\"answers\":["
                              + String.join(",", answers)
                              + "]}"))
              .andExpect(status().is(httpStatus))
              .andReturn()
              .getResponse();
      if (httpStatus >= 300) {
        return null;
      }
      JsonNode body = json.readTree(response.getContentAsString());
      Cookie session = response.getCookie(PARTICIPANT_COOKIE);
      assertThat(session).isNotNull();
      return new Person(
          UUID.fromString(body.get("participantId").asString()),
          body.get("applicationId").asString(),
          body.get("restored").asBoolean(),
          session);
    }

    private String text(String key, String value) {
      return "{\"fieldId\":\"" + fieldIds.get(key) + "\",\"text\":\"" + value + "\"}";
    }
  }

  private record Person(
      UUID participantId, String applicationId, boolean restored, Cookie session) {
    String id() {
      return participantId.toString();
    }
  }

  private static String phone(int number) {
    return "010-8484-000" + number;
  }

  private static Map<String, String> full(String transport) {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("GENDER", opt("opt_female"));
    values.put("ATTENDANCE", opt("opt_full"));
    values.put("TRANSPORT_IN", opt(transport));
    values.put("TRANSPORT_OUT", opt("opt_group"));
    return values;
  }

  private static Map<String, String> partial() {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("GENDER", opt("opt_male"));
    values.put("ATTENDANCE", opt("opt_partial"));
    values.put("ARRIVAL_AT", "{\"dateTime\":\"2027-01-23T11:00\"}");
    values.put("DEPARTURE_AT", "{\"dateTime\":\"2027-01-24T09:00\"}");
    values.put("LODGING", "{\"optionIds\":[\"opt_n2\"]}");
    values.put("MEALS", "{\"optionIds\":[\"opt_d2_lunch\",\"opt_d2_dinner\",\"opt_d2_worship\"]}");
    values.put("TRANSPORT_IN", opt("opt_car"));
    values.put("CARPOOL_OFFER", "{\"value\":false}");
    return values;
  }

  private static String opt(String id) {
    return "{\"optionId\":\"" + id + "\"}";
  }

  private Form openForm(String ownerName) throws Exception {
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
    ok(write(put(forms + "/" + formId + "/setup"), owner, SETUP));
    ok(
        write(
            post("/api/v1/operator/events/" + eventId + "/activate"),
            owner,
            "{\"expectedLifecycleVersion\":0}"));
    ok(write(patch(forms + "/" + formId), owner, "{\"acceptingApplications\":true}"));
    JsonNode detail = json.readTree(ok(get(forms + "/" + formId).cookie(owner)));
    return new Form(spaceId, eventId, formId, owner, detail);
  }

  private String createGroup(Form form, String name) throws Exception {
    return json.readTree(created(form.owner(post(groupsPath(form)), "{\"name\":\"" + name + "\"}")))
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

  private static String change(Person person, String to) {
    return "{\"participantId\":\""
        + person.participantId
        + "\",\"fromGroupId\":null,\"toGroupId\":\""
        + to
        + "\"}";
  }

  private static String leadersBody(int version, Person person) {
    return "{\"expectedVersion\":"
        + version
        + ",\"participantIds\":[\""
        + person.participantId
        + "\"]}";
  }

  private void publish(Form form) throws Exception {
    long version = board(form).get("boardVersion").asLong();
    ok(
        form.owner(
            post(groupsPath(form) + "/publish"),
            "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}"));
  }

  private JsonNode board(Form form) throws Exception {
    return json.readTree(ok(get(eventPath(form) + "/group-board").cookie(form.owner)));
  }

  private int groupVersion(Form form, String groupId) throws Exception {
    for (JsonNode group : board(form).get("groups")) {
      if (group.get("groupId").asString().equals(groupId)) {
        return group.get("version").asInt();
      }
    }
    throw new AssertionError("group is missing");
  }

  private void checkIn(Form form, String body) throws Exception {
    ok(checkInRequest(form, body));
  }

  private void checkInRejected(Form form, String body) throws Exception {
    JsonNode problem = problem(checkInRequest(form, body), 409, "INVALID_STATE_TRANSITION");
    assertThat(problem.get("reason").asString()).isEqualTo("APPLICATION_NOT_SUBMITTED");
  }

  private MockHttpServletRequestBuilder checkInRequest(Form form, String body) {
    return form.owner(post(eventPath(form) + "/check-ins"), body)
        .header("Idempotency-Key", "k-" + UUID.randomUUID());
  }

  private JsonNode checkInSummary(Form form) throws Exception {
    return json.readTree(ok(get(eventPath(form) + "/check-ins/summary").cookie(form.owner)));
  }

  private JsonNode summary(Form form) throws Exception {
    return json.readTree(ok(get(eventPath(form) + "/applications/summary").cookie(form.owner)));
  }

  private JsonNode table(Form form) throws Exception {
    return json.readTree(ok(get(eventPath(form) + "/applications/table").cookie(form.owner)));
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

  private void signIn(Form form, String name, int number, String pin, int httpStatus)
      throws Exception {
    mvc.perform(
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
        .andExpect(status().is(httpStatus));
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

  private static long transportIn(JsonNode summary, String optionId) {
    for (JsonNode option : summary.get("transport").get("in").get("options")) {
      if (option.get("optionId").asString().equals(optionId)) {
        return option.get("count").asLong();
      }
    }
    throw new AssertionError("transport option is missing");
  }

  private static List<String> ids(JsonNode list) {
    List<String> ids = new ArrayList<>();
    for (JsonNode item : list) {
      ids.add(item.get("participantId").asString());
    }
    return ids;
  }

  private static String eventPath(Form form) {
    return "/api/v1/operator/events/" + form.eventId;
  }

  private static String groupsPath(Form form) {
    return eventPath(form) + "/groups";
  }

  private static String groupPath(Form form, String groupId) {
    return groupsPath(form) + "/" + groupId;
  }

  private static String applicationPath(Form form, Person person) {
    return eventPath(form) + "/applications/" + person.applicationId;
  }

  private static String withdrawPath(Form form, Person person) {
    return applicationPath(form, person) + "/withdraw";
  }

  private static String restorePath(Form form, Person person) {
    return applicationPath(form, person) + "/restore";
  }

  private String statusOf(Person person) {
    return jdbc.queryForObject(
        "SELECT status FROM applications WHERE id = ?::uuid", String.class, person.applicationId);
  }

  private JsonNode updates(Person person) throws Exception {
    return json.readTree(ok(get("/api/v1/participant/updates").cookie(person.session)));
  }

  private int sessionCount(Person person) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participant_sessions WHERE participant_id = ?",
        Integer.class,
        person.participantId);
  }

  private int historyCount(Person person) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM application_status_logs WHERE participant_id = ?",
        Integer.class,
        person.participantId);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
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
