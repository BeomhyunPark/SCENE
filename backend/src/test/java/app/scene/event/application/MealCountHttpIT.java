package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 식수 현황 (#454, DEC-089, api.md "식수 현황"). Planned counts match the summary; check-in, cancel, an
 * edit (A4) and a withdrawal (A7) move the numbers at once. The time rule itself is {@code
 * MealTallyTest}; here an event far in the future has every slot ahead, and one in the past has
 * every slot passed.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class MealCountHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  /** Friday to Sunday: dinner and worship, three meals and worship, breakfast. */
  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  private static final List<String> MEALS =
      List.of(
          "opt_d1_dinner", "opt_d2_breakfast", "opt_d2_lunch", "opt_d2_dinner", "opt_d3_breakfast");

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
  void aheadOfTheEventEveryoneIsComingAndArrivalsEditsAndWithdrawalsMoveTheNumbers()
      throws Exception {
    Held event = openEvent("Meal owner", 2030);
    Form form = setupForm(event);
    String garam = form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    form.submit(
        "나래",
        2,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d2_lunch"),
            "DEPARTURE_SLOT",
            opt("opt_d3_breakfast")));
    form.submit("다솜", 3, values("ATTENDANCE", opt("opt_worship"), "MEALS", opts("opt_d1_worship")));
    form.submit(
        "바다",
        4,
        values(
            "ATTENDANCE",
            opt("opt_partial"),
            "ARRIVAL_SLOT",
            opt("opt_d1_dinner"),
            "DEPARTURE_SLOT",
            opt("opt_d1_dinner")));
    form.dropAnswer("바다", "DEPARTURE_SLOT");

    JsonNode counts = counts(event);
    assertThat(counts.get("eventStatus").asString()).isEqualTo("ACTIVE");
    assertThat(counts.get("nextSlotId").asString()).isEqualTo("opt_d1_dinner");
    assertThat(counts.get("submitted").asLong()).isEqualTo(4);
    assertThat(counts.get("checkedIn").asLong()).isZero();
    assertThat(counts.get("unknown").get("count").asLong()).isEqualTo(1);
    assertThat(slotIds(counts)).isEqualTo(MEALS);
    // Planned is the summary's meal count, slot by slot.
    Map<String, Long> summary = summaryMeals(event);
    for (String id : MEALS) {
      assertThat(slot(counts, id).get("planned").asLong()).as(id).isEqualTo(summary.get(id));
    }
    assertThat(numbers(slot(counts, "opt_d1_dinner"))).containsExactly(1L, 0L, 1L, 0L, 1L);
    assertThat(numbers(slot(counts, "opt_d2_lunch"))).containsExactly(2L, 0L, 2L, 0L, 2L);
    JsonNode dinner = slot(counts, "opt_d1_dinner");
    assertThat(dinner.get("startTime").asString()).isEqualTo("18:00");
    assertThat(dinner.get("timeFromSchedule").asBoolean()).isFalse();
    assertThat(dinner.get("passed").asBoolean()).isFalse();
    // Numbers only: no names, phones or ids.
    assertThat(counts.toString()).doesNotContain("가람", "나래", "010-", garam);

    // Arrival: 가람 moves from coming to arrived everywhere.
    String checkInId =
        json.readTree(
                ok(
                    write(
                            post(base(event) + "/check-ins"),
                            event.owner,
                            "{\"mode\":\"MANUAL\",\"participantId\":\"" + garam + "\"}")
                        .header("Idempotency-Key", "meal-" + garam)))
            .get("checkIn")
            .get("checkInId")
            .asString();
    JsonNode arrived = counts(event);
    assertThat(arrived.get("checkedIn").asLong()).isEqualTo(1);
    assertThat(numbers(slot(arrived, "opt_d2_lunch"))).containsExactly(2L, 1L, 1L, 0L, 2L);

    // A cancelled check-in is not an arrival.
    ok(
        write(post(base(event) + "/check-ins/" + checkInId + "/cancel"), event.owner, "{}")
            .header("Idempotency-Key", "meal-cancel-" + garam));
    assertThat(numbers(slot(counts(event), "opt_d2_lunch"))).containsExactly(2L, 0L, 2L, 0L, 2L);

    // A4: 나래 edits to arrive on day 1 dinner; the count follows the current answer.
    String edited =
        form.resubmit(
            "나래",
            2,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d2_breakfast")));
    JsonNode afterEdit = counts(event);
    assertThat(afterEdit.get("submitted").asLong()).isEqualTo(4);
    assertThat(slot(afterEdit, "opt_d1_dinner").get("planned").asLong()).isEqualTo(2);
    assertThat(slot(afterEdit, "opt_d2_lunch").get("planned").asLong()).isEqualTo(1);

    // A7: withdrawing 나래 drops them from every slot.
    ok(write(post(base(event) + "/applications/" + edited + "/withdraw"), event.owner, "{}"));
    JsonNode afterWithdraw = counts(event);
    assertThat(afterWithdraw.get("submitted").asLong()).isEqualTo(3);
    assertThat(slot(afterWithdraw, "opt_d1_dinner").get("planned").asLong()).isEqualTo(1);
    assertThat(slot(afterWithdraw, "opt_d2_breakfast").get("planned").asLong()).isEqualTo(1);
  }

  @Test
  void aScheduleItemOnTheSlotGivesItsStartTime() throws Exception {
    Held event = openEvent("Meal time owner", 2030);
    Form form = setupForm(event);
    form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    created(
        write(
            post(base(event) + "/schedule/items"),
            event.owner,
            "{\"day\":2,\"startTime\":\"07:30\",\"title\":\"아침 식사\","
                + "\"category\":\"MEAL\",\"audience\":[{\"type\":\"ALL\"}],"
                + "\"slotId\":\"opt_d2_breakfast\"}"));

    JsonNode breakfast = slot(counts(event), "opt_d2_breakfast");
    assertThat(breakfast.get("startTime").asString()).isEqualTo("07:30");
    assertThat(breakfast.get("timeFromSchedule").asBoolean()).isTrue();
  }

  @Test
  void afterTheEventNobodyIsComingAndThoseWhoDidNotArriveAreMissing() throws Exception {
    Held event = openEvent("Past owner", 2020);
    Form form = setupForm(event);
    String garam = form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    form.submit("나래", 2, values("ATTENDANCE", opt("opt_full")));
    ok(
        write(
                post(base(event) + "/check-ins"),
                event.owner,
                "{\"mode\":\"MANUAL\",\"participantId\":\"" + garam + "\"}")
            .header("Idempotency-Key", "past-" + garam));

    JsonNode counts = counts(event);
    assertThat(counts.get("nextSlotId").isNull()).isTrue();
    for (String id : MEALS) {
      JsonNode slot = slot(counts, id);
      assertThat(slot.get("passed").asBoolean()).isTrue();
      assertThat(numbers(slot)).as(id).containsExactly(2L, 1L, 0L, 1L, 1L);
    }
  }

  @Test
  void withoutASetupThereAreNoDaysAndAnOutsiderCannotRead() throws Exception {
    Held event = openEvent("Empty owner", 2030);
    JsonNode counts = counts(event);
    assertThat(counts.get("days")).isEmpty();
    assertThat(counts.get("nextSlotId").isNull()).isTrue();
    assertThat(counts.get("submitted").asLong()).isZero();

    Held other = openEvent("Outsider", 2030);
    mvc.perform(get(base(event) + "/meal-counts").cookie(other.owner))
        .andExpect(status().isNotFound());
  }

  /**
   * E4 (#456): mid-event, the check-in summary and roster name the same late people as the meal
   * counts' "아직 안 옴" for the next meal. The event runs yesterday to tomorrow in Seoul; day 1 has
   * passed, and today's breakfast is held at 23:30 by a schedule item, so it is the next meal at
   * any hour the test runs.
   */
  @Test
  void midEventTheRosterAndTheMealCountsNameTheSameLatePeople() throws Exception {
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
    Held event = openEvent("Roster owner", today.minusDays(1));
    Form form = setupForm(event);
    String garam = form.submit("가람", 1, values("ATTENDANCE", opt("opt_full")));
    String narae =
        form.submit(
            "나래",
            2,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d2_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d3_breakfast")));
    String dasom =
        form.submit(
            "다솜",
            3,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d1_worship")));
    String bada = form.submit("바다", 4, values("ATTENDANCE", opt("opt_full")));
    String mir =
        form.submit(
            "미르",
            5,
            values(
                "ATTENDANCE",
                opt("opt_partial"),
                "ARRIVAL_SLOT",
                opt("opt_d1_dinner"),
                "DEPARTURE_SLOT",
                opt("opt_d1_dinner")));
    form.dropAnswer("미르", "DEPARTURE_SLOT");
    String nuri = form.submit("누리", 6, values("ATTENDANCE", opt("opt_full")));
    created(
        write(
            post(base(event) + "/schedule/items"),
            event.owner,
            "{\"day\":2,\"startTime\":\"23:30\",\"title\":\"늦은 아침\","
                + "\"category\":\"MEAL\",\"audience\":[{\"type\":\"ALL\"}],"
                + "\"slotId\":\"opt_d2_breakfast\"}"));
    checkIn(event, bada);

    JsonNode counts = counts(event);
    assertThat(counts.get("nextSlotId").asString()).isEqualTo("opt_d2_breakfast");
    JsonNode next = slot(counts, "opt_d2_breakfast");
    // planned 3 (가람, 바다, 누리), arrived 1 (바다), coming 0, missing 2 (가람, 누리).
    assertThat(numbers(next)).containsExactly(3L, 1L, 0L, 2L, 1L);

    JsonNode summary = checkInSummary(event);
    JsonNode arrival = summary.get("arrival");
    assertThat(arrival.get("nextMeal").get("slotId").asString()).isEqualTo("opt_d2_breakfast");
    assertThat(arrival.get("nextMeal").get("day").asInt()).isEqualTo(2);
    assertThat(arrival.get("nextMeal").get("label").asString()).isEqualTo("아침");
    assertThat(arrival.get("overdue").asLong()).isEqualTo(next.get("missing").asLong());
    assertThat(arrival.get("coming").asLong()).isEqualTo(1); // 나래
    assertThat(arrival.get("passed").asLong()).isEqualTo(1); // 다솜
    assertThat(arrival.get("unknown").asLong()).isEqualTo(1); // 미르
    assertThat(
            arrival.get("overdue").asLong()
                + arrival.get("coming").asLong()
                + arrival.get("passed").asLong()
                + arrival.get("unknown").asLong())
        .isEqualTo(summary.get("notCheckedIn").asLong());

    JsonNode overdue = roster(event, "?arrival=OVERDUE");
    assertThat(participants(overdue)).containsExactlyInAnyOrder(garam, nuri);
    assertThat(overdue.get("page").get("totalItems").asLong())
        .isEqualTo(next.get("missing").asLong());
    JsonNode late = item(overdue, garam).get("arrival");
    assertThat(late.get("status").asString()).isEqualTo("OVERDUE");
    assertThat(late.get("slot").get("slotId").asString()).isEqualTo("opt_d1_dinner");
    assertThat(late.get("slot").get("day").asInt()).isEqualTo(1);
    assertThat(late.get("slot").get("label").asString()).isEqualTo("저녁");

    JsonNode all = roster(event, "");
    assertThat(item(all, narae).get("arrival").get("status").asString()).isEqualTo("COMING");
    assertThat(item(all, narae).get("arrival").get("slot").get("slotId").asString())
        .isEqualTo("opt_d2_dinner");
    assertThat(item(all, dasom).get("arrival").get("status").asString()).isEqualTo("PASSED");
    assertThat(item(all, mir).get("arrival").get("status").asString()).isEqualTo("UNKNOWN");
    assertThat(item(all, mir).get("arrival").get("slot").isNull()).isTrue();
    assertThat(item(all, bada).get("arrival").get("status").asString()).isEqualTo("ARRIVED");
    assertThat(participants(roster(event, "?arrival=UNKNOWN"))).containsExactly(mir);
    assertThat(participants(roster(event, "?arrival=COMING&checkedIn=false")))
        .containsExactly(narae);
    // Paging applies after the arrival filter.
    JsonNode first = roster(event, "?arrival=OVERDUE&size=1");
    assertThat(first.get("items")).hasSize(1);
    assertThat(first.get("page").get("totalItems").asLong()).isEqualTo(2);
    assertThat(first.get("page").get("totalPages").asLong()).isEqualTo(2);

    // A late arrival leaves both lists at once.
    checkIn(event, garam);
    assertThat(numbers(slot(counts(event), "opt_d2_breakfast")))
        .containsExactly(3L, 2L, 0L, 1L, 2L);
    assertThat(checkInSummary(event).get("arrival").get("overdue").asLong()).isEqualTo(1);
    assertThat(participants(roster(event, "?arrival=OVERDUE"))).containsExactly(nuri);

    mvc.perform(get(base(event) + "/check-in-roster?arrival=overdue").cookie(event.owner))
        .andExpect(status().isBadRequest());
    mvc.perform(get(base(event) + "/check-in-roster?arrival=LATE").cookie(event.owner))
        .andExpect(status().isBadRequest());
  }

  @Test
  void withoutSlotsTheRosterAndTheSummaryCarryNoArrival() throws Exception {
    Held event = openEvent("No slot owner", 2030);
    JsonNode summary = checkInSummary(event);
    assertThat(summary.get("arrival").isNull()).isTrue();
    assertThat(roster(event, "?arrival=OVERDUE").get("items")).isEmpty();
  }

  private JsonNode counts(Held event) throws Exception {
    return json.readTree(ok(get(base(event) + "/meal-counts").cookie(event.owner)));
  }

  private JsonNode checkInSummary(Held event) throws Exception {
    return json.readTree(ok(get(base(event) + "/check-ins/summary").cookie(event.owner)));
  }

  private JsonNode roster(Held event, String query) throws Exception {
    return json.readTree(ok(get(base(event) + "/check-in-roster" + query).cookie(event.owner)));
  }

  private static List<String> participants(JsonNode page) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : page.get("items")) {
      out.add(item.get("participantId").asString());
    }
    return out;
  }

  private static JsonNode item(JsonNode page, String participantId) {
    for (JsonNode item : page.get("items")) {
      if (item.get("participantId").asString().equals(participantId)) {
        return item;
      }
    }
    throw new AssertionError("no roster item " + participantId);
  }

  private void checkIn(Held event, String participantId) throws Exception {
    ok(
        write(
                post(base(event) + "/check-ins"),
                event.owner,
                "{\"mode\":\"MANUAL\",\"participantId\":\"" + participantId + "\"}")
            .header("Idempotency-Key", "e4-" + participantId));
  }

  private Map<String, Long> summaryMeals(Held event) throws Exception {
    JsonNode meals =
        json.readTree(ok(get(base(event) + "/applications/summary").cookie(event.owner)))
            .get("meals");
    Map<String, Long> out = new LinkedHashMap<>();
    for (JsonNode day : meals.get("days")) {
      for (JsonNode slot : day.get("slots")) {
        out.put(slot.get("optionId").asString(), slot.get("count").asLong());
      }
    }
    return out;
  }

  private static List<String> slotIds(JsonNode counts) {
    List<String> out = new ArrayList<>();
    for (JsonNode day : counts.get("days")) {
      day.get("slots").forEach(slot -> out.add(slot.get("slotId").asString()));
    }
    return out;
  }

  private static JsonNode slot(JsonNode counts, String id) {
    for (JsonNode day : counts.get("days")) {
      for (JsonNode slot : day.get("slots")) {
        if (id.equals(slot.get("slotId").asString())) {
          return slot;
        }
      }
    }
    throw new AssertionError("no slot " + id);
  }

  /** planned, arrived, coming, missing, reflected */
  private static List<Long> numbers(JsonNode slot) {
    return List.of(
        slot.get("planned").asLong(),
        slot.get("arrived").asLong(),
        slot.get("coming").asLong(),
        slot.get("missing").asLong(),
        slot.get("reflected").asLong());
  }

  private static String base(Held event) {
    return "/api/v1/operator/events/" + event.eventId;
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

    /** The same phone and number again: an edit (A4). Returns the new application id. */
    String resubmit(String name, int number, Map<String, String> values) throws Exception {
      String body =
          ok(
              post("/api/v1/public/events/" + event.eventId + "/forms/" + formId + "/applications")
                  .cookie(csrf())
                  .header(CSRF_HEADER, CSRF)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body(name, number, values)));
      String id = json.readTree(body).get("applicationId").asString();
      applications.put(name, id);
      return id;
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

  private Form setupForm(Held event) throws Exception {
    String setup = setup("RANGE");
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

  private void period(Held event, int year) {
    period(event, LocalDate.of(year, 1, 22));
  }

  private void period(Held event, LocalDate start) {
    jdbc.update(
        "UPDATE events SET start_date = ?, end_date = ? WHERE id = ?",
        start,
        start.plusDays(2),
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

  private Held openEvent(String memberName, int year) throws Exception {
    return openEvent(memberName, LocalDate.of(year, 1, 22));
  }

  private Held openEvent(String memberName, LocalDate start) throws Exception {
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
    Held held =
        new Held(spaceId, UUID.fromString(json.readTree(created).get("eventId").asString()), owner);
    period(held, start);
    return held;
  }

  private record Held(UUID spaceId, UUID eventId, Cookie owner) {}
}
