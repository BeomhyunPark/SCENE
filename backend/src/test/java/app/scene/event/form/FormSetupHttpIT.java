package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
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
 * Base questions and the form setup (DEC-070): 이름·전화·또래 take wording and order changes, 또래 turns
 * off and checks two digits, and the setup generates questions, keeps operator wording when it
 * changes, and respects the DEC-068 lock.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class FormSetupHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  /** Three days, Friday to Sunday: dinner and worship, three meals and worship, breakfast. */
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
  void baseQuestionsTakeWordingAndOrderAndCohortTurnsOffAndChecksTwoDigits() throws Exception {
    Held event = openEvent();
    JsonNode form = json.readTree(created(write(post(forms(event)), event, "{}")));
    String formPath = forms(event) + "/" + form.get("formId").asString();
    String nameId = form.get("fields").get(0).get("fieldId").asString();
    String phoneId = form.get("fields").get(1).get("fieldId").asString();
    JsonNode cohort = form.get("fields").get(2);
    String cohortId = cohort.get("fieldId").asString();
    assertThat(cohort.get("systemKey").asString()).isEqualTo("COHORT");
    assertThat(cohort.get("required").booleanValue()).isTrue();
    assertThat(cohort.get("description").asString()).isEqualTo("출생연도 뒤 두 자리를 적어주세요.");

    JsonNode reworded =
        json.readTree(
            ok(
                write(
                    patch(formPath + "/fields/" + phoneId),
                    event,
                    "{\"label\":\"연락처\",\"description\":\"  수련회 안내 문자를 받을 번호  \","
                        + "\"config\":{\"placeholder\":\"010-0000-0000\"}}")));
    JsonNode phone = field(reworded, phoneId);
    assertThat(phone.get("label").asString()).isEqualTo("연락처");
    assertThat(phone.get("description").asString()).isEqualTo("수련회 안내 문자를 받을 번호");
    assertThat(phone.get("config").get("placeholder").asString()).isEqualTo("010-0000-0000");
    assertThat(phone.get("config").get("format").asString()).isEqualTo("PHONE");
    assertThat(phone.get("config").get("maxLength").asInt()).isEqualTo(50);
    JsonNode cleared =
        json.readTree(
            ok(
                write(
                    patch(formPath + "/fields/" + phoneId),
                    event,
                    "{\"description\":\"\",\"config\":{\"placeholder\":null}}")));
    assertThat(field(cleared, phoneId).get("description").isNull()).isTrue();
    assertThat(field(cleared, phoneId).get("config").get("placeholder").isNull()).isTrue();

    // Length, format, type, required, and conditions of a SYSTEM question stay fixed.
    problem(
        write(patch(formPath + "/fields/" + phoneId), event, "{\"config\":{\"format\":\"NONE\"}}"),
        400,
        "VALIDATION_FAILED");
    problem(
        write(patch(formPath + "/fields/" + nameId), event, "{\"required\":false}"),
        400,
        "VALIDATION_FAILED");
    problem(
        write(patch(formPath + "/fields/" + nameId), event, "{\"hidden\":true}"), 409, "CONFLICT");
    mvc.perform(
            delete(formPath + "/fields/" + cohortId)
                .cookie(event.owner, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    JsonNode moved =
        json.readTree(
            ok(
                write(
                    put(formPath + "/fields/order"),
                    event,
                    "{\"fieldIds\":[\""
                        + cohortId
                        + "\",\""
                        + nameId
                        + "\",\""
                        + phoneId
                        + "\"]}")));
    assertThat(moved.get("fields").get(0).get("systemKey").asString()).isEqualTo("COHORT");
    assertThat(moved.get("fields").get(2).get("systemKey").asString()).isEqualTo("PHONE");

    open(event, formPath);
    String submitPath =
        "/api/v1/public/events/"
            + event.eventId
            + "/forms/"
            + form.get("formId").asString()
            + "/applications";
    String nameAndPhone = answer(nameId, "김") + "," + answer(phoneId, "010-1234-5678");
    submit(submitPath, nameAndPhone, 400);
    submit(submitPath, nameAndPhone + "," + answer(cohortId, "9"), 400);
    submit(submitPath, nameAndPhone + "," + answer(cohortId, "9a"), 400);
    submit(submitPath, nameAndPhone + "," + answer(cohortId, "194"), 400);
    submit(submitPath, nameAndPhone + "," + answer(cohortId, " 00 "), 201);
    submit(submitPath, nameAndPhone + "," + answer(cohortId, "94"), 201);
    assertThat(
            jdbc.queryForList(
                "SELECT value ->> 'text' FROM answers WHERE field_id = ? ORDER BY 1",
                String.class,
                UUID.fromString(cohortId)))
        .containsExactly("00", "94");

    // Turned off, 또래 leaves the public form and is no longer required.
    JsonNode off =
        json.readTree(
            ok(write(patch(formPath + "/fields/" + cohortId), event, "{\"hidden\":true}")));
    assertThat(field(off, cohortId).get("hidden").booleanValue()).isTrue();
    assertThat(field(off, cohortId).get("required").booleanValue()).isTrue();
    JsonNode publicForm =
        json.readTree(
            ok(
                get(
                    "/api/v1/public/events/"
                        + event.eventId
                        + "/forms/"
                        + form.get("formId").asString())));
    assertThat(publicForm.get("fields")).hasSize(2);
    submit(submitPath, nameAndPhone, 201);
  }

  @Test
  void setupNeedsAnEventPeriodAndAMatchingSchedule() throws Exception {
    Held event = openEvent();
    JsonNode form = json.readTree(created(write(post(forms(event)), event, "{}")));
    String setupPath = forms(event) + "/" + form.get("formId").asString() + "/setup";

    problem(write(put(setupPath), event, setup(true, true, SCHEDULE, true)), 400, "eventPeriod");
    period(event, LocalDate.of(2027, 1, 22), LocalDate.of(2027, 2, 5));
    problem(write(put(setupPath), event, setup(true, true, SCHEDULE, true)), 400, "eventPeriod");
    period(event, LocalDate.of(2027, 1, 22), LocalDate.of(2027, 1, 23));
    problem(write(put(setupPath), event, setup(true, true, SCHEDULE, true)), 400, "schedule");
    period(event, LocalDate.of(2027, 1, 22), LocalDate.of(2027, 1, 24));
    problem(
        write(
            put(setupPath), event, setup(true, true, SCHEDULE, true).replace("\"cell\"", "\"x\"")),
        400,
        "setup");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM fields WHERE event_id = ?", Integer.class, event.eventId))
        .isEqualTo(3);
  }

  @Test
  void setupGeneratesQuestionsKeepsOperatorWordingAndRespectsTheLock() throws Exception {
    Held event = openEvent();
    period(event, LocalDate.of(2027, 1, 22), LocalDate.of(2027, 1, 24));
    JsonNode created = json.readTree(created(write(post(forms(event)), event, "{}")));
    String formId = created.get("formId").asString();
    String formPath = forms(event) + "/" + formId;
    String setupPath = formPath + "/setup";

    JsonNode form =
        json.readTree(ok(write(put(setupPath), event, setup(true, true, SCHEDULE, true))));
    assertThat(form.get("setup").get("attendance").get("partial").booleanValue()).isTrue();
    assertThat(form.get("setup").get("generatedFor").get("endDate").asString())
        .isEqualTo("2027-01-24");
    assertThat(keys(form))
        .containsExactly(
            "NAME",
            "PHONE",
            "COHORT",
            "GENDER",
            "ATTENDANCE",
            "ARRIVAL_AT",
            "DEPARTURE_AT",
            "LODGING",
            "MEALS",
            "PARTIAL_NOTE",
            "TRANSPORT_IN",
            "SHUTTLE_IN",
            "CARPOOL_OFFER",
            "CARPOOL_SEATS",
            "CARPOOL_AREA",
            "CARPOOL_NOTE",
            "MOBILITY_IN",
            "TRANSPORT_OUT",
            "SHUTTLE_OUT",
            "MOBILITY_OUT",
            "CONSENT");
    JsonNode attendance = preset(form, "ATTENDANCE");
    assertThat(attendance.get("kind").asString()).isEqualTo("CUSTOM");
    assertThat(attendance.get("presetActive").booleanValue()).isTrue();
    assertThat(optionIds(attendance)).containsExactly("opt_full", "opt_partial", "opt_worship");
    JsonNode lodging = preset(form, "LODGING");
    assertThat(optionIds(lodging)).containsExactly("opt_n1", "opt_n2");
    assertThat(lodging.get("config").get("options").get(1).get("label").asString())
        .isEqualTo("둘째 밤 (1월 23일 (토))");
    assertThat(lodging.get("showWhen").get("fieldId").asString())
        .isEqualTo(attendance.get("fieldId").asString());
    JsonNode meals = preset(form, "MEALS");
    assertThat(optionIds(meals))
        .containsExactly(
            "opt_d1_dinner",
            "opt_d1_worship",
            "opt_d2_breakfast",
            "opt_d2_lunch",
            "opt_d2_dinner",
            "opt_d2_worship",
            "opt_d3_breakfast");
    assertThat(meals.get("config").get("options").get(0).get("group").asString())
        .isEqualTo("1월 22일 (금)");
    assertThat(meals.get("showWhen").get("optionIds").toString())
        .isEqualTo("[\"opt_partial\",\"opt_worship\"]");
    JsonNode in = preset(form, "TRANSPORT_IN");
    assertThat(optionIds(in))
        .containsExactly("opt_group", "opt_shuttle", "opt_car", "opt_public", "opt_support");
    assertThat(in.get("config").get("options").get(0).get("showWhen").get("optionIds").toString())
        .isEqualTo("[\"opt_full\",\"opt_partial\"]");
    assertThat(optionIds(preset(form, "SHUTTLE_IN"))).containsExactly("opt_d1", "opt_d2");
    JsonNode out = preset(form, "TRANSPORT_OUT");
    assertThat(optionIds(out)).doesNotContain("opt_car");
    assertThat(out.get("showWhen").get("optionIds").toString()).doesNotContain("opt_car");
    assertThat(preset(form, "ARRIVAL_AT").get("config").get("max").asString())
        .isEqualTo("2027-01-24T23:59");

    // The operator may reword a generated question but not restructure or delete it.
    String attendancePath = formPath + "/fields/" + attendance.get("fieldId").asString();
    String notePath =
        formPath + "/fields/" + preset(form, "PARTIAL_NOTE").get("fieldId").asString();
    ok(write(patch(notePath), event, "{\"label\":\"부분 참석 사유를 알려주세요\"}"));
    JsonNode rewordedOptions =
        json.readTree(
            ok(
                write(
                    patch(attendancePath),
                    event,
                    "{\"description\":\"해당하는 것을 골라주세요\",\"config\":"
                        + config(attendance, "opt_full", "전체 참석 (2박 3일)")
                        + "}")));
    assertThat(
            preset(rewordedOptions, "ATTENDANCE")
                .get("config")
                .get("options")
                .get(0)
                .get("label")
                .asString())
        .isEqualTo("전체 참석 (2박 3일)");
    problem(write(patch(attendancePath), event, "{\"answerType\":\"DROPDOWN\"}"), 409, "CONFLICT");
    problem(
        write(
            patch(attendancePath),
            event,
            "{\"config\":{\"options\":[{\"optionId\":\"opt_full\",\"label\":\"전체\"}]}}"),
        409,
        "CONFLICT");
    problem(write(patch(notePath), event, "{\"showWhen\":null}"), 409, "CONFLICT");
    mvc.perform(delete(notePath).cookie(event.owner, csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    // Partial attendance off: untouched questions go, the reworded one is hidden and kept.
    JsonNode withoutPartial =
        json.readTree(ok(write(put(setupPath), event, setup(false, true, SCHEDULE, true))));
    assertThat(keys(withoutPartial))
        .doesNotContain("ARRIVAL_AT", "DEPARTURE_AT", "LODGING")
        .contains("PARTIAL_NOTE", "MEALS");
    JsonNode note = preset(withoutPartial, "PARTIAL_NOTE");
    assertThat(note.get("hidden").booleanValue()).isTrue();
    assertThat(note.get("presetActive").booleanValue()).isFalse();
    assertThat(note.get("label").asString()).isEqualTo("부분 참석 사유를 알려주세요");
    JsonNode partialOption =
        preset(withoutPartial, "ATTENDANCE").get("config").get("options").get(1);
    assertThat(partialOption.get("hidden").booleanValue()).isTrue();
    problem(write(patch(notePath), event, "{\"hidden\":false}"), 409, "CONFLICT");

    // Back on: the question returns at its place with the operator's wording.
    JsonNode restored =
        json.readTree(ok(write(put(setupPath), event, setup(true, true, SCHEDULE, true))));
    assertThat(keys(restored)).isEqualTo(keys(form));
    assertThat(preset(restored, "PARTIAL_NOTE").get("hidden").booleanValue()).isFalse();
    assertThat(preset(restored, "PARTIAL_NOTE").get("label").asString())
        .isEqualTo("부분 참석 사유를 알려주세요");
    JsonNode restoredAttendance = preset(restored, "ATTENDANCE");
    assertThat(restoredAttendance.get("description").asString()).isEqualTo("해당하는 것을 골라주세요");
    assertThat(restoredAttendance.get("config").get("options").get(0).get("label").asString())
        .isEqualTo("전체 참석 (2박 3일)");
    assertThat(restoredAttendance.get("fieldId").asString())
        .isEqualTo(attendance.get("fieldId").asString());

    // A partial participant who drives and offers seats. Hidden branches are skipped.
    open(event, formPath);
    String submitPath =
        "/api/v1/public/events/" + event.eventId + "/forms/" + formId + "/applications";
    String base =
        answer(id(restored, "NAME"), "김")
            + ","
            + answer(id(restored, "PHONE"), "010-1234-5678")
            + ","
            + answer(id(restored, "COHORT"), "94")
            + ","
            + value(id(restored, "GENDER"), "{\"optionId\":\"opt_female\"}")
            + ","
            + value(id(restored, "CONSENT"), "{\"value\":true}");
    String partial =
        base
            + ","
            + value(id(restored, "ATTENDANCE"), "{\"optionId\":\"opt_partial\"}")
            + ","
            + value(id(restored, "ARRIVAL_AT"), "{\"dateTime\":\"2027-01-22T19:00\"}")
            + ","
            + value(id(restored, "DEPARTURE_AT"), "{\"dateTime\":\"2027-01-23T21:30\"}")
            + ","
            + value(id(restored, "LODGING"), "{\"optionIds\":[\"opt_n1\"]}")
            + ","
            + value(id(restored, "MEALS"), "{\"optionIds\":[\"opt_d1_worship\",\"opt_d2_lunch\"]}")
            + ","
            + value(id(restored, "TRANSPORT_IN"), "{\"optionId\":\"opt_car\"}");
    // 동승 여부 is required once 자차 is chosen.
    submit(submitPath, partial, 400);
    String carpool =
        partial
            + ","
            + value(id(restored, "CARPOOL_OFFER"), "{\"value\":true}")
            + ","
            + value(id(restored, "CARPOOL_SEATS"), "{\"number\":3}")
            + ","
            + answer(id(restored, "CARPOOL_AREA"), "성수동");
    submit(submitPath, carpool, 201);
    assertThat(storedKeys(event))
        .contains("LODGING", "MEALS", "CARPOOL_SEATS", "CARPOOL_AREA")
        .doesNotContain("TRANSPORT_OUT", "SHUTTLE_IN", "MOBILITY_IN");
    // A full participant is not asked about meals; a stale answer is dropped, not rejected.
    submit(
        submitPath,
        base
            + ","
            + value(id(restored, "ATTENDANCE"), "{\"optionId\":\"opt_full\"}")
            + ","
            + value(id(restored, "MEALS"), "{\"optionIds\":[\"opt_d1_dinner\"]}")
            + ","
            + value(id(restored, "TRANSPORT_IN"), "{\"optionId\":\"opt_group\"}")
            + ","
            + value(id(restored, "TRANSPORT_OUT"), "{\"optionId\":\"opt_group\"}"),
        201);
    // 집회 차량 is not offered to a full participant, so the question counts as unanswered.
    submit(
        submitPath,
        base
            + ","
            + value(id(restored, "ATTENDANCE"), "{\"optionId\":\"opt_full\"}")
            + ","
            + value(id(restored, "TRANSPORT_IN"), "{\"optionId\":\"opt_shuttle\"}"),
        400);

    // Locked: new bundles and hidden options still work, wording stays.
    String lockedSchedule = SCHEDULE.replace("\"lunch\":true", "\"lunch\":false");
    JsonNode locked =
        json.readTree(
            ok(
                write(
                    put(setupPath),
                    event,
                    setup(true, false, lockedSchedule, true)
                        .replace("\"cell\":false", "\"cell\":true"))));
    assertThat(locked.get("locked").booleanValue()).isTrue();
    assertThat(keys(locked)).contains("CELL");
    JsonNode lockedMeals = preset(locked, "MEALS");
    assertThat(optionIds(lockedMeals)).contains("opt_d2_lunch");
    assertThat(option(lockedMeals, "opt_d2_lunch").get("hidden").booleanValue()).isTrue();
    assertThat(option(preset(locked, "ATTENDANCE"), "opt_worship").get("hidden").booleanValue())
        .isTrue();
    assertThat(preset(locked, "MEALS").get("showWhen").get("optionIds").toString())
        .isEqualTo("[\"opt_partial\",\"opt_worship\"]");
    // Turning a bundle off after applications hides it and keeps the answers.
    JsonNode noCar =
        json.readTree(ok(write(put(setupPath), event, setup(true, true, SCHEDULE, false))));
    assertThat(preset(noCar, "CARPOOL_SEATS").get("hidden").booleanValue()).isTrue();
    assertThat(preset(noCar, "CARPOOL_SEATS").get("presetActive").booleanValue()).isFalse();
    assertThat(option(preset(noCar, "TRANSPORT_IN"), "opt_car").get("hidden").booleanValue())
        .isTrue();
    // Dropping the attendance question would change the 단체 차량 condition: locked.
    problem(
        write(put(setupPath), event, setup(false, false, SCHEDULE, false)), 409, "FIELD_LOCKED");
    JsonNode after = json.readTree(ok(get(formPath).cookie(event.owner)));
    assertThat(after.get("setup").get("attendance").get("partial").booleanValue()).isTrue();
    assertThat(preset(after, "ATTENDANCE").get("hidden").booleanValue()).isFalse();
  }

  // ---- helpers ----

  private static String setup(boolean partial, boolean worshipOnly, String schedule, boolean car) {
    return "{\"gender\":true,\"middleGroup\":false,\"cell\":false,"
        + "\"attendance\":{\"partial\":"
        + partial
        + ",\"worshipOnly\":"
        + worshipOnly
        + "},\"schedule\":"
        + schedule
        + ",\"transport\":{\"groupBus\":true,\"worshipShuttle\":true,\"car\":"
        + car
        + ",\"publicTransit\":true,\"support\":true}}";
  }

  /** The question's config with one option label replaced. */
  private String config(JsonNode field, String optionId, String label) {
    JsonNode config = field.get("config").deepCopy();
    for (JsonNode option : config.get("options")) {
      if (optionId.equals(option.get("optionId").asString())) {
        ((tools.jackson.databind.node.ObjectNode) option).put("label", label);
      }
    }
    return json.writeValueAsString(config);
  }

  private static List<String> keys(JsonNode form) {
    List<String> keys = new ArrayList<>();
    for (JsonNode field : form.get("fields")) {
      JsonNode key =
          field.get("presetKey").isNull() ? field.get("systemKey") : field.get("presetKey");
      keys.add(key.isNull() ? "CUSTOM" : key.asString());
    }
    return keys;
  }

  private static JsonNode preset(JsonNode form, String key) {
    for (JsonNode field : form.get("fields")) {
      JsonNode found =
          field.get("presetKey").isNull() ? field.get("systemKey") : field.get("presetKey");
      if (!found.isNull() && key.equals(found.asString())) {
        return field;
      }
    }
    throw new AssertionError("missing " + key);
  }

  private static String id(JsonNode form, String key) {
    return preset(form, key).get("fieldId").asString();
  }

  private static JsonNode field(JsonNode form, String fieldId) {
    for (JsonNode field : form.get("fields")) {
      if (fieldId.equals(field.get("fieldId").asString())) {
        return field;
      }
    }
    throw new AssertionError("missing " + fieldId);
  }

  private static List<String> optionIds(JsonNode field) {
    List<String> ids = new ArrayList<>();
    for (JsonNode option : field.get("config").get("options")) {
      ids.add(option.get("optionId").asString());
    }
    return ids;
  }

  private static JsonNode option(JsonNode field, String optionId) {
    for (JsonNode option : field.get("config").get("options")) {
      if (optionId.equals(option.get("optionId").asString())) {
        return option;
      }
    }
    throw new AssertionError("missing " + optionId);
  }

  private List<String> storedKeys(Held event) {
    return jdbc.queryForList(
        """
        SELECT f.preset_key FROM answers a JOIN fields f ON f.id = a.field_id
        WHERE a.event_id = ? AND f.preset_key IS NOT NULL
        """,
        String.class,
        event.eventId);
  }

  private static String answer(String fieldId, String text) {
    return "{\"fieldId\":\"" + fieldId + "\",\"text\":\"" + text + "\"}";
  }

  private static String value(String fieldId, String value) {
    return "{\"fieldId\":\"" + fieldId + "\",\"value\":" + value + "}";
  }

  private void submit(String path, String answers, int expected) throws Exception {
    mvc.perform(
            post(path)
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answers\":[" + answers + "]}"))
        .andExpect(status().is(expected));
  }

  private void open(Held event, String formPath) throws Exception {
    ok(
        write(
            post("/api/v1/operator/events/" + event.eventId + "/activate"),
            event,
            "{\"expectedLifecycleVersion\":0}"));
    ok(write(patch(formPath), event, "{\"acceptingApplications\":true}"));
  }

  private void period(Held event, LocalDate start, LocalDate end) {
    jdbc.update(
        "UPDATE events SET start_date = ?, end_date = ? WHERE id = ?", start, end, event.eventId);
  }

  private static String forms(Held event) {
    return "/api/v1/operator/events/" + event.eventId + "/forms";
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Held event, String body) {
    return request
        .cookie(event.owner, csrf())
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

  /** {@code expected} is the error code, or the offending field of a 400. */
  private void problem(MockHttpServletRequestBuilder request, int httpStatus, String expected)
      throws Exception {
    String body =
        mvc.perform(request)
            .andExpect(status().is(httpStatus))
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(body).contains("\"" + expected + "\"");
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private Held openEvent() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home");
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, "Setup owner");
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
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"겨울 수련회\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return new Held(UUID.fromString(json.readTree(created).get("eventId").asString()), owner);
  }

  private record Held(UUID eventId, Cookie owner) {}
}
