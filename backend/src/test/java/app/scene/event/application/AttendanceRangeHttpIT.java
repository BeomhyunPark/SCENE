package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Arrival-to-departure attendance (DEC-074, #322). Partial attendees pick an arrival slot and a
 * departure slot; the summary, the group board, the applicant table and the CSV all give the same
 * attended slots for them.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class AttendanceRangeHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  /** Friday to Sunday: dinner and worship, three meals and worship, breakfast. */
  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  private static final List<String> ALL =
      List.of(
          "opt_d1_dinner",
          "opt_d1_worship",
          "opt_d2_breakfast",
          "opt_d2_lunch",
          "opt_d2_dinner",
          "opt_d2_worship",
          "opt_d3_breakfast");

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
  void aNewSetupDefaultsToRangeAndAsksArrivalAndDepartureSlots() throws Exception {
    Held event = openEvent("Range owner");
    period(event);
    String formId = newForm(event);
    JsonNode form = putSetup(event, formId, setup(null));

    assertThat(form.get("setup").get("attendance").get("mode").asString()).isEqualTo("RANGE");
    JsonNode arrival = field(form, "ARRIVAL_SLOT");
    assertThat(arrival.get("hidden").booleanValue()).isFalse();
    assertThat(optionIds(arrival)).isEqualTo(ALL);
    assertThat(arrival.get("config").get("options").get(0).get("label").asString())
        .isEqualTo("1월 22일 (금) 저녁부터");
    assertThat(field(form, "DEPARTURE_SLOT").get("config").get("options").get(6).get("label"))
        .hasToString("\"1월 24일 (일) 아침까지\"");
    // No per-slot meals, no lodging question and no date questions for partial attendees.
    assertThat(keys(form)).doesNotContain("LODGING", "ARRIVAL_AT", "DEPARTURE_AT");
    // MEALS asks worship-only attendees which services they come to; meals are hidden.
    JsonNode meals = field(form, "MEALS");
    assertThat(meals.get("label").asString()).isEqualTo("참석할 집회를 선택해주세요");
    assertThat(visibleOptionIds(meals)).containsExactly("opt_d1_worship", "opt_d2_worship");
    assertThat(meals.get("showWhen").get("optionIds")).hasToString("[\"opt_worship\"]");

    // Before any application the mode switches freely, both ways.
    JsonNode slots = putSetup(event, formId, setup("SLOTS"));
    assertThat(slots.get("setup").get("attendance").get("mode").asString()).isEqualTo("SLOTS");
    // Untouched range questions with no answers are removed, as any generated question is.
    assertThat(keys(slots)).doesNotContain("ARRIVAL_SLOT", "DEPARTURE_SLOT");
    assertThat(field(slots, "LODGING").get("hidden").booleanValue()).isFalse();
    JsonNode perSlot = field(slots, "MEALS");
    assertThat(visibleOptionIds(perSlot)).isEqualTo(ALL);
    assertThat(perSlot.get("description").asString())
        .isEqualTo(
            "참석하는 일정에 포함되는 식사와 프로그램을 모두 선택해 주세요."
                + " ※ 식사는 실제 식사 여부와 관계없이 참석 일정에 포함된 경우 신청 인원에 반영됩니다.");
    JsonNode back = putSetup(event, formId, setup("RANGE"));
    assertThat(field(back, "ARRIVAL_SLOT").get("hidden").booleanValue()).isFalse();
  }

  @Test
  void aStoredSetupWithoutTheModeKeyStaysSlots() throws Exception {
    Held event = openEvent("Legacy owner");
    period(event);
    String formId = newForm(event);
    putSetup(event, formId, setup("SLOTS"));
    // A setup saved before DEC-074 has no mode key.
    jdbc.update(
        "UPDATE forms SET setup = setup #- '{attendance,mode}' WHERE id = ?",
        UUID.fromString(formId));

    JsonNode form = putSetup(event, formId, setup(null));

    assertThat(form.get("setup").get("attendance").get("mode").asString()).isEqualTo("SLOTS");
    assertThat(keys(form)).doesNotContain("ARRIVAL_SLOT", "DEPARTURE_SLOT");
    assertThat(visibleOptionIds(field(form, "MEALS"))).isEqualTo(ALL);
  }

  @Test
  void rangeAnswersGiveTheSameSlotsInTheSummaryBoardTableAndCsv() throws Exception {
    Held event = openEvent("Same owner");
    Form form = setupForm(event, setup("RANGE"));
    form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    form.submit(
        "나래",
        2,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_worship"),
            "DEPARTURE_SLOT",
            opt("opt_d2_lunch")));
    // Arrival and departure on the same slot is that one slot.
    form.submit(
        "마루",
        3,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d2_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d2_dinner")));
    form.submit(
        "다솜",
        4,
        values(
            "ATTENDANCE", opt("opt_worship"), "MEALS", opts("opt_d1_worship", "opt_d2_worship")));
    // From the first slot to the last: every slot, like a full attendee.
    form.submit(
        "보라",
        5,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d3_breakfast")));
    // Partial with the departure answer gone: unknown everywhere.
    form.submit(
        "바다",
        6,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d1_dinner")));
    form.dropAnswer("바다", "DEPARTURE_SLOT");

    Map<String, List<String>> expected = new LinkedHashMap<>();
    expected.put("가람", ALL);
    expected.put("나래", List.of("opt_d1_worship", "opt_d2_breakfast", "opt_d2_lunch"));
    expected.put("마루", List.of("opt_d2_dinner"));
    expected.put("다솜", List.of("opt_d1_worship", "opt_d2_worship"));
    expected.put("보라", ALL);
    expected.put("바다", null);

    JsonNode board = board(event);
    assertThat(slotIds(board.get("slots"))).isEqualTo(ALL);
    for (Map.Entry<String, List<String>> person : expected.entrySet()) {
      if (person.getValue() == null) {
        assertThat(person(board, person.getKey()).get("slotIds").isNull()).isTrue();
      } else {
        assertThat(attended(board, person.getKey())).isEqualTo(person.getValue());
      }
    }
    assertSameAsSummary(event, board, 1);

    // Nights follow the range: 나래 and 보라 sleep the first night, 보라 the second, 마루 none.
    JsonNode lodging = summary(event).get("lodging");
    assertThat(lodging.get("nights").get(0).get("count").asLong()).isEqualTo(3);
    assertThat(lodging.get("nights").get(1).get("count").asLong()).isEqualTo(2);
    assertThat(lodging.get("unanswered").asLong()).isEqualTo(1);

    JsonNode table =
        json.readTree(
            ok(
                get("/api/v1/operator/events/" + event.eventId + "/applications/table")
                    .cookie(event.owner)));
    assertThat(slotIds(table.get("slots"))).isEqualTo(ALL);
    for (JsonNode row : table.get("rows")) {
      String name = null;
      for (Map.Entry<String, String> application : form.applications.entrySet()) {
        if (application.getValue().equals(row.get("applicationId").asString())) {
          name = application.getKey();
        }
      }
      List<String> want = expected.get(name);
      JsonNode ids = row.get("slotIds");
      if (want == null) {
        assertThat(ids.isNull()).as(name).isTrue();
      } else {
        List<String> got = new ArrayList<>();
        ids.forEach(id -> got.add(id.asString()));
        assertThat(got).as(name).isEqualTo(want);
      }
    }

    String csv =
        mvc.perform(
                post("/api/v1/operator/events/" + event.eventId + "/applications/export")
                    .cookie(event.owner, csrf())
                    .header(CSRF_HEADER, CSRF))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    String[] lines = csv.split("\r?\n");
    assertThat(lines[0]).endsWith(",참석 일정");
    for (String line : lines) {
      if (line.contains("나래")) {
        assertThat(line).endsWith(",\"1월 22일 (금) 집회, 1월 23일 (토) 아침, 1월 23일 (토) 점심\"");
      }
      if (line.contains("마루")) {
        assertThat(line).endsWith(",1월 23일 (토) 저녁");
      }
      if (line.contains("바다")) {
        assertThat(line).endsWith(",");
      }
    }
  }

  @Test
  void aCommuterDropsOutOfEveryNightAndTheSwitchTurnsOffAfterApplications() throws Exception {
    Held event = openEvent("Commute owner");
    Form form = setupForm(event, setup("RANGE", true));
    form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    form.submit(
        "나래", 2, values("ATTENDANCE", opt("opt_full"), "NO_LODGING", opts("opt_no_lodging")));
    form.submit(
        "보라",
        3,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d3_breakfast")));
    form.submit(
        "마루",
        4,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d3_breakfast"),
            "NO_LODGING",
            opts("opt_no_lodging")));

    // 나래 (full) and 마루 (partial over both nights) sleep at home: no night counts them.
    JsonNode lodging = summary(event).get("lodging");
    assertThat(lodging.get("nights").get(0).get("count").asLong()).isEqualTo(2);
    assertThat(lodging.get("nights").get(1).get("count").asLong()).isEqualTo(2);
    assertThat(lodging.get("unanswered").asLong()).isZero();
    // Meals and services still follow the range: 마루 attends every slot.
    assertThat(attended(board(event), "마루")).isEqualTo(ALL);

    // Turned off after applications: the question hides, its answers stay, everyone counts again.
    JsonNode off = putSetup(event, form.formId, setup("RANGE", false));
    assertThat(field(off, "NO_LODGING").get("hidden").booleanValue()).isTrue();
    assertThat(off.get("setup").get("attendance").get("noLodging").booleanValue()).isFalse();
    JsonNode again = summary(event).get("lodging");
    assertThat(again.get("nights").get(0).get("count").asLong()).isEqualTo(4);
    assertThat(again.get("nights").get(1).get("count").asLong()).isEqualTo(4);
    // Leaving the key out keeps the stored value.
    JsonNode kept = putSetup(event, form.formId, setup("RANGE"));
    assertThat(kept.get("setup").get("attendance").get("noLodging").booleanValue()).isFalse();
  }

  @Test
  void aDepartureBeforeTheArrivalIsRejected() throws Exception {
    Held event = openEvent("Backwards owner");
    Form form = setupForm(event, setup(null));

    form.rejected(
        "나래",
        1,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d2_lunch"),
            "DEPARTURE_SLOT",
            opt("opt_d2_breakfast")));
    // A full attendee is not asked, so stray range answers are dropped, not checked.
    form.submit(
        "가람",
        2,
        values(
            "ATTENDANCE",
            opt("opt_full"),
            "ARRIVAL_SLOT",
            opt("opt_d2_lunch"),
            "DEPARTURE_SLOT",
            opt("opt_d1_dinner")));
    assertThat(attended(board(event), "가람")).isEqualTo(ALL);
  }

  @Test
  void theModeStaysOnceAnApplicationArrives() throws Exception {
    Held event = openEvent("Locked owner");
    Form form = setupForm(event, setup("RANGE"));
    form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    String path = forms(event) + "/" + form.formId + "/setup";

    MvcResult refused =
        mvc.perform(write(put(path), event.owner, setup("SLOTS")))
            .andExpect(status().isConflict())
            .andReturn();
    assertThat(json.readTree(refused.getResponse().getContentAsString()).get("code").asString())
        .isEqualTo("FIELD_LOCKED");
    // The same mode, or no mode key, still saves.
    ok(write(put(path), event.owner, setup(null)));
    JsonNode stored =
        json.readTree(
            jdbc.queryForObject(
                "SELECT setup::text FROM forms WHERE id = ?",
                String.class,
                UUID.fromString(form.formId)));
    assertThat(stored.get("attendance").get("mode").asString()).isEqualTo("RANGE");
  }

  /**
   * Counts slots from the board as a screen would: each participant in each of their slots, and
   * participants with unknown slots apart. Both must equal the summary's {@code meals}.
   */
  /**
   * DEC-078 §4 (#402): an edit is a new revision. Summary, board, table and CSV read the new
   * answers; the group, the check-in and the operator memo stay with the person.
   */
  @Test
  void anEditFeedsEveryCountAndKeepsTheGroupCheckInAndMemo() throws Exception {
    Held event = openEvent("Edit owner");
    Form form = setupForm(event, setup("RANGE"));
    form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    String participantId =
        form.submit(
            "나래",
            2,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_worship"),
                "DEPARTURE_SLOT",
                opt("opt_d2_lunch")));
    String first = form.applications.get("나래");
    String base = "/api/v1/operator/events/" + event.eventId;
    ok(
        write(
            put(base + "/applications/" + first + "/operation"),
            event.owner,
            "{\"memo\":\"늦게 옴\",\"expectedVersion\":0}"));
    String groupId =
        json.readTree(created(write(post(base + "/groups"), event.owner, "{\"name\":\"1조\"}")))
            .get("group")
            .get("groupId")
            .asString();
    ok(
        write(
            post(base + "/group-assignments"),
            event.owner,
            "{\"changes\":[{\"participantId\":\""
                + participantId
                + "\",\"fromGroupId\":null,\"toGroupId\":\""
                + groupId
                + "\"}]}"));
    ok(
        write(
                post(base + "/check-ins"),
                event.owner,
                "{\"mode\":\"MANUAL\",\"participantId\":\"" + participantId + "\"}")
            .header("Idempotency-Key", "edit-" + participantId));

    // The same phone with the same number edits: now a full attendee, under a new name.
    MvcResult edited =
        mvc.perform(
                post("/api/v1/public/events/"
                        + event.eventId
                        + "/forms/"
                        + form.formId
                        + "/applications")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(form.body("나래별", 2, values("ATTENDANCE", opt("opt_full")))))
            .andExpect(status().isOk())
            .andReturn();
    JsonNode editBody = json.readTree(edited.getResponse().getContentAsString());
    assertThat(editBody.get("revised").asBoolean()).isTrue();
    assertThat(editBody.get("revision").asInt()).isEqualTo(2);
    assertThat(editBody.get("participantId").asString()).isEqualTo(participantId);
    String second = editBody.get("applicationId").asString();
    assertThat(second).isNotEqualTo(first);
    Cookie session = participantCookie(edited);

    JsonNode board = board(event);
    assertThat(attended(board, "나래별")).isEqualTo(ALL);
    assertThat(board.get("participants")).hasSize(2);
    assertSameAsSummary(event, board, 0);
    assertThat(person(board, "나래별").get("groupId").asString()).isEqualTo(groupId);

    JsonNode table = json.readTree(ok(get(base + "/applications/table").cookie(event.owner)));
    assertThat(table.get("rows")).hasSize(2);
    JsonNode row = null;
    for (JsonNode candidate : table.get("rows")) {
      if (candidate.get("participantId").asString().equals(participantId)) {
        row = candidate;
      }
    }
    assertThat(row).isNotNull();
    assertThat(row.get("applicationId").asString()).isEqualTo(second);
    assertThat(row.get("revision").asInt()).isEqualTo(2);
    assertThat(row.get("checkedInAt").isNull()).isFalse();
    assertThat(row.get("group").get("groupId").asString()).isEqualTo(groupId);
    assertThat(row.get("operation").get("memo").asString()).isEqualTo("늦게 옴");
    List<String> slots = new ArrayList<>();
    row.get("slotIds").forEach(id -> slots.add(id.asString()));
    assertThat(slots).isEqualTo(ALL);

    String csv =
        mvc.perform(
                post(base + "/applications/export")
                    .cookie(event.owner, csrf())
                    .header(CSRF_HEADER, CSRF))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    assertThat(csv).contains("나래별").doesNotContain("나래,").doesNotContain("1월 23일 (토) 점심\"");
    assertThat(csv.split("\r?\n")).hasSize(3);

    JsonNode old = json.readTree(ok(get(base + "/applications/" + first).cookie(event.owner)));
    assertThat(old.get("status").asString()).isEqualTo("SUPERSEDED");
    assertThat(old.get("revision").asInt()).isEqualTo(1);
    JsonNode revisions =
        json.readTree(ok(get(base + "/applications/" + first + "/revisions").cookie(event.owner)));
    assertThat(revisions.get("items")).hasSize(2);
    JsonNode latest = revisions.get("items").get(0);
    assertThat(latest.get("revision").asInt()).isEqualTo(2);
    assertThat(latest.get("revisedBy").asString()).isEqualTo("PARTICIPANT");
    List<String> changed = new ArrayList<>();
    latest.get("changes").forEach(change -> changed.add(change.get("key").asString()));
    assertThat(changed).contains("NAME", "FIELD");
    assertThat(latest.get("changes").toString()).doesNotContain("opt_full", "나래별");
    assertThat(revisions.get("items").get(1).get("revisedBy").isNull()).isTrue();

    // The participant reads and edits through the session the submit opened.
    JsonNode mine =
        json.readTree(
            mvc.perform(get("/api/v1/participant/application").cookie(session))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(mine.get("revision").asInt()).isEqualTo(2);
    assertThat(mine.get("acceptingEdits").asBoolean()).isTrue();
    assertThat(mine.toString()).doesNotContain("늦게 옴", "730914");
    String partial =
        form.body(
            "나래별",
            2,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d2_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d2_dinner")));
    String editBodyJson = partial.replace("{\"pin\":\"730914\",", "{\"expectedRevision\":2,");
    JsonNode afterEdit =
        json.readTree(
            mvc.perform(participantEdit(session, editBodyJson))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(afterEdit.get("revision").asInt()).isEqualTo(3);
    assertThat(attended(board(event), "나래별")).containsExactly("opt_d2_dinner");
    mvc.perform(participantEdit(session, editBodyJson))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"))
        .andExpect(jsonPath("$.revision").value(3));
    // The phone is the identity and does not change through an edit.
    mvc.perform(
            participantEdit(
                session,
                editBodyJson
                    .replace("\"expectedRevision\":2", "\"expectedRevision\":3")
                    .replace("010-5555-0002", "010-5555-0009")))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("APPLICATION_VALIDATION_FAILED"));

    // Edits turned off: the participant only reads, and a resubmit is EDITS_CLOSED.
    ok(write(patch(forms(event) + "/" + form.formId), event.owner, "{\"acceptingEdits\":false}"));
    mvc.perform(get("/api/v1/participant/application").cookie(session))
        .andExpect(jsonPath("$.acceptingEdits").value(false));
    mvc.perform(
            participantEdit(
                session, editBodyJson.replace("\"expectedRevision\":2", "\"expectedRevision\":3")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EDITS_CLOSED"));
    mvc.perform(
            post("/api/v1/public/events/"
                    + event.eventId
                    + "/forms/"
                    + form.formId
                    + "/applications")
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content(form.body("나래별", 2, values("ATTENDANCE", opt("opt_full")))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EDITS_CLOSED"));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM applications WHERE participant_id = ?",
                Integer.class,
                UUID.fromString(participantId)))
        .isEqualTo(3);
  }

  /**
   * The group leader view (DEC-083, #452) reads slots and nights with the same rules as the board
   * and the summary: per-night counts of {@code lodgingNights} equal the summary's lodging rows.
   */
  @Test
  void leaderViewSlotsAndNightsMatchTheBoardAndTheSummary() throws Exception {
    Held event = openEvent("Leader owner");
    Form form = setupForm(event, setup("RANGE", true));
    Map<String, String> ids = new LinkedHashMap<>();
    ids.put("가람", form.submit("가람", 1, values("ATTENDANCE", opt("opt_full"))));
    ids.put(
        "나래",
        form.submit(
            "나래", 2, values("ATTENDANCE", opt("opt_full"), "NO_LODGING", opts("opt_no_lodging"))));
    ids.put(
        "보라",
        form.submit(
            "보라",
            3,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_worship"),
                "DEPARTURE_SLOT",
                opt("opt_d2_lunch"))));
    ids.put(
        "다솜",
        form.submit(
            "다솜", 4, values("ATTENDANCE", opt("opt_worship"), "MEALS", opts("opt_d1_worship"))));
    ids.put(
        "바다",
        form.submit(
            "바다",
            5,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d1_dinner"))));
    form.dropAnswer("바다", "DEPARTURE_SLOT");

    String groups = "/api/v1/operator/events/" + event.eventId + "/groups";
    String groupId =
        json.readTree(created(write(post(groups), event.owner, "{\"name\":\"1조\"}")))
            .get("group")
            .get("groupId")
            .asString();
    List<String> changes = new ArrayList<>();
    for (String id : ids.values()) {
      changes.add(
          "{\"participantId\":\""
              + id
              + "\",\"fromGroupId\":null,\"toGroupId\":\""
              + groupId
              + "\"}");
    }
    ok(
        write(
            post("/api/v1/operator/events/" + event.eventId + "/group-assignments"),
            event.owner,
            "{\"changes\":[" + String.join(",", changes) + "]}"));
    ok(
        write(
            put(groups + "/" + groupId + "/leaders"),
            event.owner,
            "{\"participantIds\":[\"" + ids.get("가람") + "\"],\"expectedVersion\":0}"));
    long version = board(event).get("boardVersion").asLong();
    ok(
        write(
            post(groups + "/publish"),
            event.owner,
            "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}"));

    Cookie leader =
        ParticipantSessions.open(
            jdbc, event.spaceId(), event.eventId(), UUID.fromString(ids.get("가람")));
    JsonNode view =
        json.readTree(ok(get("/api/v1/participant/group").cookie(leader))).get("leaderView");
    JsonNode board = board(event);
    assertThat(view.get("slots")).isEqualTo(board.get("slots"));
    Map<String, JsonNode> attendance = new LinkedHashMap<>();
    for (JsonNode member : view.get("members")) {
      attendance.put(member.get("name").asString(), member.get("attendance"));
      assertThat(member.get("attendance").get("slotIds"))
          .as(member.get("name").asString())
          .isEqualTo(person(board, member.get("name").asString()).get("slotIds"));
    }
    assertThat(attendance.keySet()).containsExactlyInAnyOrder("가람", "나래", "보라", "다솜", "바다");
    assertThat(attendance.get("가람").get("type").asString()).isEqualTo("FULL");
    assertThat(nights(attendance.get("가람"))).containsExactly(1, 2);
    assertThat(nights(attendance.get("나래"))).isEmpty();
    assertThat(attendance.get("보라").get("type").asString()).isEqualTo("PARTIAL");
    assertThat(attendance.get("보라").get("arrivalSlotId").asString()).isEqualTo("opt_d1_worship");
    assertThat(attendance.get("보라").get("departureSlotId").asString()).isEqualTo("opt_d2_lunch");
    assertThat(nights(attendance.get("보라"))).containsExactly(1);
    assertThat(attendance.get("다솜").get("type").asString()).isEqualTo("WORSHIP_ONLY");
    assertThat(attendance.get("다솜").get("arrivalSlotId").isNull()).isTrue();
    assertThat(nights(attendance.get("다솜"))).isEmpty();
    assertThat(attendance.get("바다").get("departureSlotId").isNull()).isTrue();
    assertThat(attendance.get("바다").get("slotIds").isNull()).isTrue();
    assertThat(attendance.get("바다").get("lodgingNights").isNull()).isTrue();

    // Summing the leader view per night gives the summary's lodging rows.
    Map<Integer, Long> perNight = new LinkedHashMap<>();
    long unknown = 0;
    for (JsonNode member : attendance.values()) {
      JsonNode list = member.get("lodgingNights");
      if (list.isNull()) {
        unknown++;
        continue;
      }
      list.forEach(night -> perNight.merge(night.asInt(), 1L, Long::sum));
    }
    JsonNode lodging = summary(event).get("lodging");
    for (JsonNode night : lodging.get("nights")) {
      assertThat(perNight.getOrDefault(night.get("night").asInt(), 0L))
          .isEqualTo(night.get("count").asLong());
    }
    assertThat(lodging.get("unanswered").asLong()).isEqualTo(unknown);
  }

  private static List<Integer> nights(JsonNode attendance) {
    List<Integer> out = new ArrayList<>();
    attendance.get("lodgingNights").forEach(night -> out.add(night.asInt()));
    return out;
  }

  private static MockHttpServletRequestBuilder participantEdit(Cookie session, String body) {
    return put("/api/v1/participant/application")
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private static Cookie participantCookie(MvcResult result) {
    String prefix = PARTICIPANT_COOKIE + "=";
    for (String header : result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)) {
      if (header.startsWith(prefix)) {
        return new Cookie(
            PARTICIPANT_COOKIE, header.substring(prefix.length(), header.indexOf(';')));
      }
    }
    throw new AssertionError("no participant cookie");
  }

  private void assertSameAsSummary(Held event, JsonNode board, long unknown) throws Exception {
    Map<String, Long> fromBoard = new LinkedHashMap<>();
    for (JsonNode slot : board.get("slots")) {
      fromBoard.put(slot.get("slotId").asString(), 0L);
    }
    long nulls = 0;
    for (JsonNode participant : board.get("participants")) {
      JsonNode ids = participant.get("slotIds");
      if (ids.isNull()) {
        nulls++;
        continue;
      }
      for (JsonNode id : ids) {
        fromBoard.merge(id.asString(), 1L, Long::sum);
      }
    }
    JsonNode meals = summary(event).get("meals");
    Map<String, Long> fromSummary = new LinkedHashMap<>();
    for (JsonNode day : meals.get("days")) {
      for (JsonNode slot : day.get("slots")) {
        fromSummary.put(slot.get("optionId").asString(), slot.get("count").asLong());
      }
    }
    assertThat(fromBoard).containsExactlyEntriesOf(fromSummary);
    assertThat(nulls).isEqualTo(unknown);
    assertThat(meals.get("unanswered").asLong()).isEqualTo(unknown);
  }

  private String newForm(Held event) throws Exception {
    return json.readTree(created(write(post(forms(event)), event.owner, "{}")))
        .get("formId")
        .asString();
  }

  private JsonNode putSetup(Held event, String formId, String setup) throws Exception {
    return json.readTree(
        ok(write(put(forms(event) + "/" + formId + "/setup"), event.owner, setup)));
  }

  private static JsonNode field(JsonNode form, String presetKey) {
    for (JsonNode field : form.get("fields")) {
      if (presetKey.equals(field.get("presetKey").asString(null))) {
        return field;
      }
    }
    throw new AssertionError("no field " + presetKey);
  }

  /** Preset keys of the visible questions. */
  private static List<String> keys(JsonNode form) {
    List<String> out = new ArrayList<>();
    for (JsonNode field : form.get("fields")) {
      if (!field.get("presetKey").isNull() && !field.get("hidden").booleanValue()) {
        out.add(field.get("presetKey").asString());
      }
    }
    return out;
  }

  private static List<String> optionIds(JsonNode field) {
    List<String> out = new ArrayList<>();
    field.get("config").get("options").forEach(o -> out.add(o.get("optionId").asString()));
    return out;
  }

  private static List<String> visibleOptionIds(JsonNode field) {
    List<String> out = new ArrayList<>();
    for (JsonNode option : field.get("config").get("options")) {
      if (!option.get("hidden").booleanValue()) {
        out.add(option.get("optionId").asString());
      }
    }
    return out;
  }

  private JsonNode board(Held event) throws Exception {
    return json.readTree(
        ok(get("/api/v1/operator/events/" + event.eventId + "/group-board").cookie(event.owner)));
  }

  private JsonNode summary(Held event) throws Exception {
    return json.readTree(
        ok(
            get("/api/v1/operator/events/" + event.eventId + "/applications/summary")
                .cookie(event.owner)));
  }

  private static JsonNode person(JsonNode board, String name) {
    for (JsonNode participant : board.get("participants")) {
      if (name.equals(participant.get("name").asString())) {
        return participant;
      }
    }
    throw new AssertionError("no participant " + name);
  }

  private static List<String> attended(JsonNode board, String name) {
    JsonNode ids = person(board, name).get("slotIds");
    assertThat(ids.isArray()).as(name).isTrue();
    List<String> out = new ArrayList<>();
    ids.forEach(id -> out.add(id.asString()));
    return out;
  }

  private static List<String> slotIds(JsonNode slots) {
    List<String> out = new ArrayList<>();
    slots.forEach(slot -> out.add(slot.get("slotId").asString()));
    return out;
  }

  // ---- form and submit ----

  private final class Form {
    final Held event;
    final String formId;
    final Map<String, String> fieldIds = new LinkedHashMap<>();
    final Map<String, String> applications = new LinkedHashMap<>();

    Form(Held event, String formId, JsonNode detail) {
      this.event = event;
      this.formId = formId;
      for (JsonNode field : detail.get("fields")) {
        JsonNode key =
            field.get("presetKey").isNull() ? field.get("systemKey") : field.get("presetKey");
        if (!key.isNull()) {
          fieldIds.put(key.asString(), field.get("fieldId").asString());
        }
      }
    }

    /**
     * Submits and returns the participant id. {@code values} maps a preset key to its value JSON.
     */
    String submit(String name, int number, Map<String, String> values) throws Exception {
      String body =
          created(
              post("/api/v1/public/events/" + event.eventId + "/forms/" + formId + "/applications")
                  .cookie(csrf())
                  .header(CSRF_HEADER, CSRF)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body(name, number, values)));
      JsonNode submitted = json.readTree(body);
      applications.put(name, submitted.get("applicationId").asString());
      return submitted.get("participantId").asString();
    }

    void rejected(String name, int number, Map<String, String> values) throws Exception {
      mvc.perform(
              post("/api/v1/public/events/" + event.eventId + "/forms/" + formId + "/applications")
                  .cookie(csrf())
                  .header(CSRF_HEADER, CSRF)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body(name, number, values)))
          .andExpect(status().isBadRequest());
    }

    String body(String name, int number, Map<String, String> values) {
      List<String> answers = new ArrayList<>();
      answers.add(text("NAME", name));
      answers.add(text("PHONE", "010-5555-000" + number));
      answers.add(text("COHORT", "94"));
      values.forEach(
          (key, value) ->
              answers.add("{\"fieldId\":\"" + fieldIds.get(key) + "\",\"value\":" + value + "}"));
      if (fieldIds.containsKey("GENDER")) {
        answers.add(
            "{\"fieldId\":\"" + fieldIds.get("GENDER") + "\",\"value\":" + opt("opt_female") + "}");
      }
      if (fieldIds.containsKey("CONSENT")) {
        answers.add("{\"fieldId\":\"" + fieldIds.get("CONSENT") + "\",\"value\":{\"value\":true}}");
      }
      return "{\"pin\":\"730914\",\"answers\":[" + String.join(",", answers) + "]}";
    }

    void hide(String key) {
      jdbc.update(
          "UPDATE fields SET hidden = true WHERE id = ?", UUID.fromString(fieldIds.get(key)));
    }

    void dropAnswer(String name, String key) {
      int deleted =
          jdbc.update(
              "DELETE FROM answers WHERE application_id = ? AND field_id = ?",
              UUID.fromString(applications.get(name)),
              UUID.fromString(fieldIds.get(key)));
      assertThat(deleted).isEqualTo(1);
    }

    private String text(String key, String value) {
      return "{\"fieldId\":\"" + fieldIds.get(key) + "\",\"text\":\"" + value + "\"}";
    }
  }

  private Form setupForm(Held event, String setup) throws Exception {
    period(event);
    String formId =
        json.readTree(created(write(post(forms(event)), event.owner, "{}")))
            .get("formId")
            .asString();
    ok(write(put(forms(event) + "/" + formId + "/setup"), event.owner, setup));
    return open(event, formId);
  }

  private Form open(Held event, String formId) throws Exception {
    ok(
        write(
            post("/api/v1/operator/events/" + event.eventId + "/activate"),
            event.owner,
            "{\"expectedLifecycleVersion\":0}"));
    String path = forms(event) + "/" + formId;
    ok(write(patch(path), event.owner, "{\"acceptingApplications\":true}"));
    return new Form(event, formId, json.readTree(ok(get(path).cookie(event.owner))));
  }

  /**
   * Gender on, no transport, partial and worship-only on. {@code mode} is RANGE, SLOTS, or null to
   * leave the key out.
   */
  private static String setup(String mode) {
    return setup(mode, null);
  }

  /** As {@link #setup(String)} with {@code attendance.noLodging}; null leaves the key out. */
  private static String setup(String mode, Boolean noLodging) {
    return "{\"gender\":true,\"middleGroup\":false,\"cell\":false,"
        + "\"attendance\":{\"partial\":true,\"worshipOnly\":true"
        + (mode == null ? "" : ",\"mode\":\"" + mode + "\"")
        + (noLodging == null ? "" : ",\"noLodging\":" + noLodging)
        + "},\"schedule\":"
        + SCHEDULE
        + ",\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,\"car\":false,"
        + "\"publicTransit\":false,\"support\":false}}";
  }

  /** Preset key and value JSON pairs, in order. */
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

  private static String opts(String... ids) {
    return "{\"optionIds\":[\"" + String.join("\",\"", ids) + "\"]}";
  }

  // ---- fixtures ----

  private void period(Held event) {
    jdbc.update(
        "UPDATE events SET start_date = ?, end_date = ? WHERE id = ?",
        LocalDate.of(2027, 1, 22),
        LocalDate.of(2027, 1, 24),
        event.eventId);
  }

  private static String forms(Held event) {
    return "/api/v1/operator/events/" + event.eventId + "/forms";
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
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
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home " + memberName);
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, memberName);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, memberId);
    Cookie owner = login(memberId);
    String created =
        created(
            write(
                post("/api/v1/operator/spaces/" + spaceId + "/events"),
                owner,
                "{\"name\":\"겨울 수련회\"}"));
    return new Held(
        spaceId, UUID.fromString(json.readTree(created).get("eventId").asString()), owner);
  }

  private record Held(UUID spaceId, UUID eventId, Cookie owner) {}
}
