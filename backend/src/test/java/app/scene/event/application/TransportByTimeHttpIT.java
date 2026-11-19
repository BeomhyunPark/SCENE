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
 * Vehicle options by attendance and arrival time (#324, DEC-070 Follow-up 2026-11-17). With {@code
 * transport.partialByTime} a partial attendee sees the church bus only when arriving at the first
 * slot (leaving at the last), and the worship shuttle only at a worship slot. Car riders are not
 * asked the way back. Applications go through the public submit, so hidden options are refused and
 * hidden answers are dropped as in production.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class TransportByTimeHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  /**
   * Friday to Sunday. Slots in order: d1 dinner (first), d1 worship, d2 breakfast, lunch, dinner,
   * worship, d3 breakfast (last).
   */
  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

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
  void rangeOffersVehiclesByArrivalAndDepartureAndCountsThem() throws Exception {
    Held event = openEvent("Range owner");
    Form form = setupForm(event, setup("RANGE", "true", true));

    // Full: bus both ways. The arrival answer is hidden for a full attendee and dropped.
    form.submit(
        201,
        "가람",
        1,
        values(
            "ATTENDANCE", opt("opt_full"),
            "ARRIVAL_SLOT", opt("opt_d2_lunch"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group")));
    // Partial from the first slot rides the bus there, but leaves early so not the bus back.
    Map<String, String> early =
        values(
            "ATTENDANCE", opt("opt_partial"),
            "ARRIVAL_SLOT", opt("opt_d1_dinner"),
            "DEPARTURE_SLOT", opt("opt_d2_lunch"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group"));
    form.submit(400, "나래", 2, early);
    early.put("TRANSPORT_OUT", opt("opt_public"));
    form.submit(201, "나래", 2, early);
    // Partial from the middle: neither church vehicle there, the bus back from the last slot.
    Map<String, String> middle =
        values(
            "ATTENDANCE", opt("opt_partial"),
            "ARRIVAL_SLOT", opt("opt_d2_lunch"),
            "DEPARTURE_SLOT", opt("opt_d3_breakfast"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group"));
    form.submit(400, "다솜", 3, middle);
    middle.put("TRANSPORT_IN", opt("opt_shuttle"));
    form.submit(400, "다솜", 3, middle);
    middle.put("TRANSPORT_IN", opt("opt_public"));
    form.submit(201, "다솜", 3, middle);
    // Partial for one worship service: the worship shuttle both ways, not the bus.
    Map<String, String> worship =
        values(
            "ATTENDANCE", opt("opt_partial"),
            "ARRIVAL_SLOT", opt("opt_d2_worship"),
            "DEPARTURE_SLOT", opt("opt_d2_worship"),
            "TRANSPORT_IN", opt("opt_group"));
    form.submit(400, "라온", 4, worship);
    worship.put("TRANSPORT_IN", opt("opt_shuttle"));
    worship.put("SHUTTLE_IN", opts("opt_d2"));
    worship.put("TRANSPORT_OUT", opt("opt_shuttle"));
    worship.put("SHUTTLE_OUT", opts("opt_d2"));
    form.submit(201, "라온", 4, worship);
    // Full, rides someone's car: no seat question, and the way back answer is dropped.
    form.submit(
        201,
        "마루",
        5,
        values(
            "ATTENDANCE", opt("opt_full"),
            "TRANSPORT_IN", opt("opt_ride"),
            "TRANSPORT_OUT", opt("opt_group")));
    // Worship only still sees the shuttle and never the bus.
    Map<String, String> worshipOnly =
        values(
            "ATTENDANCE", opt("opt_worship"),
            "MEALS", opts("opt_d1_worship"),
            "TRANSPORT_IN", opt("opt_group"));
    form.submit(400, "바다", 6, worshipOnly);
    worshipOnly.put("TRANSPORT_IN", opt("opt_shuttle"));
    worshipOnly.put("SHUTTLE_IN", opts("opt_d1"));
    worshipOnly.put("TRANSPORT_OUT", opt("opt_shuttle"));
    worshipOnly.put("SHUTTLE_OUT", opts("opt_d1"));
    form.submit(201, "바다", 6, worshipOnly);

    JsonNode summary = summary(event);
    JsonNode transport = summary.get("transport");
    assertThat(counts(transport.get("in")))
        .containsExactly(
            entry("opt_group", 2),
            entry("opt_shuttle", 2),
            entry("opt_car", 0),
            entry("opt_ride", 1),
            entry("opt_public", 1),
            entry("opt_support", 0));
    assertThat(counts(transport.get("out")))
        .containsExactly(
            entry("opt_group", 2),
            entry("opt_shuttle", 2),
            entry("opt_car", 0),
            entry("opt_ride", 1),
            entry("opt_public", 1),
            entry("opt_support", 0));
    assertThat(transport.get("in").get("noAnswer").asLong()).isZero();
    assertThat(transport.get("out").get("noAnswer").asLong()).isZero();
    JsonNode shuttle = summary.get("shuttle");
    assertThat(counts(shuttle.get("in"))).containsExactly(entry("opt_d1", 1), entry("opt_d2", 1));
    assertThat(counts(shuttle.get("out"))).containsExactly(entry("opt_d1", 1), entry("opt_d2", 1));
    // The arrival answer of the full attendee was not stored.
    Integer arrivals =
        jdbc.queryForObject(
            "SELECT count(*) FROM answers WHERE field_id = ?",
            Integer.class,
            UUID.fromString(form.fieldIds.get("ARRIVAL_SLOT")));
    assertThat(arrivals).isEqualTo(3);
  }

  @Test
  void slotsOffersTheBusWhenTheChosenSlotsHoldTheFirstOrLast() throws Exception {
    Held event = openEvent("Slots owner");
    Form form = setupForm(event, setup("SLOTS", "true", true));

    Map<String, String> middle =
        values(
            "ATTENDANCE", opt("opt_partial"),
            "ARRIVAL_AT", "{\"dateTime\":\"2027-01-23T11:00\"}",
            "DEPARTURE_AT", "{\"dateTime\":\"2027-01-24T09:00\"}",
            "MEALS", opts("opt_d2_lunch", "opt_d3_breakfast"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group"));
    form.submit(400, "가람", 1, middle);
    middle.put("TRANSPORT_IN", opt("opt_car"));
    middle.put("CARPOOL_OFFER", "{\"value\":false}");
    middle.remove("TRANSPORT_OUT");
    form.submit(201, "가람", 1, middle);

    Map<String, String> first =
        values(
            "ATTENDANCE", opt("opt_partial"),
            "ARRIVAL_AT", "{\"dateTime\":\"2027-01-22T18:00\"}",
            "DEPARTURE_AT", "{\"dateTime\":\"2027-01-23T12:00\"}",
            "MEALS", opts("opt_d1_dinner", "opt_d2_lunch"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group"));
    form.submit(400, "나래", 2, first);
    first.put("TRANSPORT_OUT", opt("opt_public"));
    form.submit(201, "나래", 2, first);

    assertThat(counts(summary(event).get("transport").get("in")))
        .contains(entry("opt_group", 1), entry("opt_car", 1));
  }

  @Test
  void theSwitchIsOffForOldSetupsAndLocksOnceApplicationsArrive() throws Exception {
    Held event = openEvent("Switch owner");
    period(event);
    String formId =
        json.readTree(created(write(post(forms(event)), event.owner, "{}")))
            .get("formId")
            .asString();
    String setupPath = forms(event) + "/" + formId + "/setup";

    // Without the key the vehicles keep the conditions they had before the switch existed.
    JsonNode off =
        json.readTree(ok(write(put(setupPath), event.owner, setup("RANGE", null, true))));
    assertThat(off.get("setup").get("transport").get("partialByTime").booleanValue()).isFalse();
    assertThat(option(off, "TRANSPORT_IN", "opt_group").get("showWhen").get("optionIds"))
        .hasToString("[\"opt_full\",\"opt_partial\"]");

    JsonNode on =
        json.readTree(ok(write(put(setupPath), event.owner, setup("RANGE", "true", true))));
    assertThat(option(on, "TRANSPORT_IN", "opt_group").get("showWhen").has("anyOf")).isTrue();
    // A later save without the key keeps the stored value.
    JsonNode kept =
        json.readTree(ok(write(put(setupPath), event.owner, setup("RANGE", null, true))));
    assertThat(kept.get("setup").get("transport").get("partialByTime").booleanValue()).isTrue();

    // A setup stored before the key existed reads as off.
    jdbc.update(
        "UPDATE forms SET setup = setup #- '{transport,partialByTime}' WHERE id = ?",
        UUID.fromString(formId));
    JsonNode legacy =
        json.readTree(ok(write(put(setupPath), event.owner, setup("RANGE", null, true))));
    assertThat(legacy.get("setup").get("transport").get("partialByTime").booleanValue()).isFalse();
    ok(write(put(setupPath), event.owner, setup("RANGE", "true", true)));

    Form form = open(event, formId);
    form.submit(
        201,
        "가람",
        1,
        values(
            "ATTENDANCE", opt("opt_full"),
            "TRANSPORT_IN", opt("opt_group"),
            "TRANSPORT_OUT", opt("opt_group")));

    // Turning the switch off would change the vehicle conditions: locked, nothing saved.
    String locked =
        mvc.perform(write(put(setupPath), event.owner, setup("RANGE", "false", true)))
            .andExpect(status().isConflict())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(locked).contains("\"FIELD_LOCKED\"");
    // Turning public transit off only hides its option, so it still works.
    JsonNode noPublic =
        json.readTree(ok(write(put(setupPath), event.owner, setup("RANGE", null, false))));
    assertThat(noPublic.get("setup").get("transport").get("partialByTime").booleanValue()).isTrue();
    assertThat(option(noPublic, "TRANSPORT_IN", "opt_public").get("hidden").booleanValue())
        .isTrue();
    assertThat(option(noPublic, "TRANSPORT_IN", "opt_group").get("showWhen").has("anyOf")).isTrue();
  }

  // ---- form and submit ----

  private final class Form {
    final Held event;
    final String formId;
    final Map<String, String> fieldIds = new LinkedHashMap<>();

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

    /** {@code values} maps a preset key to its value JSON. Consent is always given. */
    void submit(int httpStatus, String name, int number, Map<String, String> values)
        throws Exception {
      List<String> answers = new ArrayList<>();
      answers.add(text("NAME", name));
      answers.add(text("PHONE", "010-6666-000" + number));
      answers.add(text("COHORT", "94"));
      values.forEach(
          (key, value) ->
              answers.add("{\"fieldId\":\"" + fieldIds.get(key) + "\",\"value\":" + value + "}"));
      answers.add("{\"fieldId\":\"" + fieldIds.get("CONSENT") + "\",\"value\":{\"value\":true}}");
      String body =
          mvc.perform(
                  post("/api/v1/public/events/"
                          + event.eventId
                          + "/forms/"
                          + formId
                          + "/applications")
                      .cookie(csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"answers\":[" + String.join(",", answers) + "]}"))
              .andExpect(status().is(httpStatus))
              .andReturn()
              .getResponse()
              .getContentAsString();
      if (httpStatus == 400) {
        assertThat(body).contains("\"APPLICATION_VALIDATION_FAILED\"");
      }
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
    return new Form(
        event,
        formId,
        json.readTree(
            mvc.perform(get(path).cookie(event.owner))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString()));
  }

  /** {@code partialByTime} is the JSON value, or null to leave the key out. */
  private static String setup(String mode, String partialByTime, boolean publicTransit) {
    return "{\"gender\":false,\"middleGroup\":false,\"cell\":false,"
        + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\""
        + mode
        + "\"},\"schedule\":"
        + SCHEDULE
        + ",\"transport\":{\"groupBus\":true,\"worshipShuttle\":true,\"car\":true,"
        + "\"publicTransit\":"
        + publicTransit
        + ",\"support\":false"
        + (partialByTime == null ? "" : ",\"partialByTime\":" + partialByTime)
        + "}}";
  }

  private static JsonNode option(JsonNode detail, String presetKey, String optionId) {
    for (JsonNode field : detail.get("fields")) {
      if (!field.get("presetKey").isNull() && presetKey.equals(field.get("presetKey").asString())) {
        for (JsonNode option : field.get("config").get("options")) {
          if (optionId.equals(option.get("optionId").asString())) {
            return option;
          }
        }
      }
    }
    throw new AssertionError(presetKey + " " + optionId);
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

  private JsonNode summary(Held event) throws Exception {
    return json.readTree(
        mvc.perform(
                get("/api/v1/operator/events/" + event.eventId + "/applications/summary")
                    .cookie(event.owner))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  private static List<Map.Entry<String, Long>> counts(JsonNode choice) {
    List<Map.Entry<String, Long>> out = new ArrayList<>();
    for (JsonNode option : choice.get("options")) {
      out.add(entry(option.get("optionId").asString(), option.get("count").asLong()));
    }
    return out;
  }

  private static Map.Entry<String, Long> entry(String key, long value) {
    return Map.entry(key, value);
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
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)",
        spaceId,
        memberId,
        "OWNER");
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
