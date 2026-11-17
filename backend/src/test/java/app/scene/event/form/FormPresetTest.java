package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Generated questions for a form setup (DEC-070). */
class FormPresetTest {

  private static final LocalDate FRIDAY = LocalDate.of(2027, 1, 22);

  private final Map<String, UUID> ids = new HashMap<>();

  @Test
  void withoutAnAttendanceQuestionEveryoneAttendsInFull() {
    FormSetup setup =
        new FormSetup(
            false,
            true,
            true,
            List.of(),
            List.of(),
            false,
            false,
            FormSetup.Mode.SLOTS,
            days(2, true),
            true,
            true,
            true,
            false,
            false,
            false,
            false);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY.plusDays(1));

    assertThat(keys(questions))
        .containsExactly(
            "MIDDLE_GROUP",
            "CELL",
            "TRANSPORT_IN",
            "CARPOOL_OFFER",
            "CARPOOL_SEATS",
            "CARPOOL_AREA",
            "CARPOOL_NOTE",
            "TRANSPORT_OUT",
            "CONSENT");
    JsonNode in = find(questions, "TRANSPORT_IN").config().get("options");
    // 단체 차량 has no condition, and 집회 차량 stays hidden without partial or worship-only.
    assertThat(in.get(0).get("showWhen").isNull()).isTrue();
    assertThat(in.get(0).get("hidden").booleanValue()).isFalse();
    assertThat(in.get(1).get("optionId").asString()).isEqualTo("opt_shuttle");
    assertThat(in.get(1).get("hidden").booleanValue()).isTrue();
    assertThat(in.get(3).get("optionId").asString()).isEqualTo("opt_ride");
    assertThat(in.get(3).get("hidden").booleanValue()).isFalse();
    assertThat(in.get(4).get("hidden").booleanValue()).isTrue();
  }

  @Test
  void aOneDayEventHasNoLodgingAndOnlyDrivingAsksNoWayBack() {
    FormSetup setup =
        new FormSetup(
            true,
            false,
            false,
            List.of(),
            List.of(),
            true,
            false,
            FormSetup.Mode.SLOTS,
            days(1, false),
            false,
            false,
            true,
            false,
            false,
            false,
            false);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY);

    assertThat(keys(questions))
        .contains("ATTENDANCE", "ARRIVAL_AT", "PARTIAL_NOTE", "TRANSPORT_IN")
        .doesNotContain("LODGING", "MEALS", "TRANSPORT_OUT", "SHUTTLE_IN");
    FormPreset.Question arrival = find(questions, "ARRIVAL_AT");
    assertThat(arrival.config().get("min").asString()).isEqualTo("2027-01-22T00:00");
    assertThat(arrival.showWhen().get("fieldId").asString())
        .isEqualTo(ids.get("ATTENDANCE").toString());
  }

  @Test
  void everyGeneratedQuestionIsAKnownKeyInOrderAndPassesTheConditionRules() {
    FormSetup setup =
        new FormSetup(
            true,
            true,
            true,
            List.of("1중그룹", "2중그룹"),
            List.of("믿음셀", "소망셀"),
            true,
            true,
            FormSetup.Mode.SLOTS,
            days(10, true),
            true,
            true,
            true,
            true,
            true,
            false,
            false);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY.plusDays(9));

    assertThat(keys(questions))
        .isEqualTo(
            FormPreset.ORDER.stream()
                .filter(
                    key ->
                        !key.equals("ARRIVAL_SLOT")
                            && !key.equals("DEPARTURE_SLOT")
                            && !key.equals("NEWCOMER")
                            // SLOTS partial attendees choose nights in LODGING instead.
                            && !key.equals("NO_LODGING"))
                .toList());
    assertThat(find(questions, "LODGING").config().get("options")).hasSize(9);
    assertThat(find(questions, "MEALS").config().get("options")).hasSize(40);
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormPreset.Question question : questions) {
      fields.add(
          FieldDefinition.custom(
              ids.get(question.key()),
              question.label(),
              fields.size(),
              question.type(),
              question.required(),
              question.description(),
              question.config(),
              question.showWhen(),
              false));
      // The generated settings are already in the normalized shape FieldRules writes.
      assertThat(FieldRules.config(question.type(), question.config(), fields.getLast()))
          .isEqualTo(question.config());
    }
    FieldRules.checkConditions(fields);
  }

  @Test
  void listedMiddleGroupsBecomeADropdownWithTheNewcomerOptionAndHideTheCellForNewcomers() {
    List<FormPreset.Question> questions =
        generate(affiliation(true, List.of("1중그룹", "2중그룹"), true, List.of("믿음셀")), FRIDAY, FRIDAY);

    assertThat(keys(questions)).containsExactly("MIDDLE_GROUP", "CELL", "CONSENT");
    FormPreset.Question middle = find(questions, "MIDDLE_GROUP");
    assertThat(middle.type()).isEqualTo(AnswerType.DROPDOWN);
    assertThat(middle.required()).isTrue();
    JsonNode options = middle.config().get("options");
    assertThat(options).hasSize(3);
    assertThat(options.get(0).get("label").asString()).isEqualTo("1중그룹");
    assertThat(options.get(0).get("optionId").asString())
        .isEqualTo(FormPreset.listOptionId("mg", "1중그룹"))
        .startsWith("opt_mg_");
    assertThat(options.get(2).get("optionId").asString()).isEqualTo("opt_newcomer");
    assertThat(options.get(2).get("label").asString()).isEqualTo("새가족 (등반X)");

    FormPreset.Question cell = find(questions, "CELL");
    assertThat(cell.type()).isEqualTo(AnswerType.DROPDOWN);
    assertThat(cell.config().get("options")).hasSize(1);
    // A newcomer has no cell: the cell is asked only after a listed middle group.
    assertThat(cell.showWhen().get("fieldId").asString())
        .isEqualTo(ids.get("MIDDLE_GROUP").toString());
    assertThat(cell.showWhen().get("optionIds").toString())
        .isEqualTo(
            "[\""
                + options.get(0).get("optionId").asString()
                + "\",\""
                + options.get(1).get("optionId").asString()
                + "\"]");
  }

  @Test
  void withoutAMiddleGroupListTheCellListCarriesTheNewcomerOption() {
    List<FormPreset.Question> questions =
        generate(affiliation(true, List.of(), true, List.of("믿음셀")), FRIDAY, FRIDAY);

    FormPreset.Question middle = find(questions, "MIDDLE_GROUP");
    assertThat(middle.type()).isEqualTo(AnswerType.SHORT_TEXT);
    assertThat(middle.required()).isFalse();
    FormPreset.Question cell = find(questions, "CELL");
    assertThat(cell.showWhen()).isNull();
    assertThat(cell.config().get("options").get(1).get("optionId").asString())
        .isEqualTo("opt_newcomer");

    // Without any list both stay free answers and nothing marks a newcomer.
    List<FormPreset.Question> free =
        generate(affiliation(true, List.of(), true, List.of()), FRIDAY, FRIDAY);
    assertThat(find(free, "MIDDLE_GROUP").type()).isEqualTo(AnswerType.SHORT_TEXT);
    assertThat(find(free, "CELL").type()).isEqualTo(AnswerType.SHORT_TEXT);
    assertThat(find(free, "CELL").showWhen()).isNull();
  }

  @Test
  void newcomerIsReadFromTheOptionIdWhateverItsLabel() {
    JsonMapper mapper = JsonMapper.builder().build();
    JsonNode middle =
        mapper.readTree(
            "{\"options\":[{\"optionId\":\"opt_mg_1\",\"label\":\"1중그룹\"},"
                + "{\"optionId\":\"opt_newcomer\",\"label\":\"처음 왔어요\"}]}");
    JsonNode cell = mapper.readTree("{\"options\":[{\"optionId\":\"opt_c\",\"label\":\"셀\"}]}");
    JsonNode chose = mapper.readTree("{\"optionId\":\"opt_newcomer\"}");
    JsonNode other = mapper.readTree("{\"optionId\":\"opt_mg_1\"}");

    assertThat(FormPreset.newcomer(middle, chose, null, null)).isTrue();
    assertThat(FormPreset.newcomer(middle, other, cell, null)).isFalse();
    assertThat(FormPreset.newcomer(middle, null, null, null)).isNull();
    // A free-text middle group cannot tell; the cell decides when it offers the option.
    JsonNode text = mapper.readTree("{\"maxLength\":50}");
    assertThat(FormPreset.newcomer(text, mapper.readTree("{\"text\":\"1\"}"), middle, chose))
        .isTrue();
    assertThat(FormPreset.newcomer(text, null, cell, other)).isNull();
    assertThat(FormPreset.newcomer(null, null, null, null)).isNull();
  }

  @Test
  void aStoredNewcomerSwitchIsReadAndDroppedOnTheNextSave() {
    FormSetup setup =
        FormSetup.parse(
            JsonMapper.builder()
                .build()
                .readTree(
                    "{\"gender\":false,\"middleGroup\":false,\"cell\":false,\"newcomer\":true,"
                        + "\"attendance\":{\"partial\":false,\"worshipOnly\":false},"
                        + "\"schedule\":[{\"breakfast\":false,\"lunch\":false,"
                        + "\"dinner\":false,\"worship\":false}],"
                        + "\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,"
                        + "\"car\":false,\"publicTransit\":false,\"support\":false}}"),
            1,
            FormSetup.Mode.SLOTS,
            false,
            false);

    assertThat(setup.middleGroups()).isEmpty();
    assertThat(keys(generate(setup, FRIDAY, FRIDAY))).containsExactly("CONSENT");
    JsonNode stored = setup.toJson(FRIDAY, FRIDAY);
    assertThat(stored.has("newcomer")).isFalse();
    assertThat(stored.get("middleGroups").isArray()).isTrue();
  }

  @Test
  void listsDropBlanksAndRepeats() {
    FormSetup setup =
        FormSetup.parse(
            JsonMapper.builder()
                .build()
                .readTree(
                    "{\"gender\":false,\"middleGroup\":true,\"cell\":false,"
                        + "\"middleGroups\":[\" 1중그룹 \",\"\",\"1중그룹\",\"2중그룹\"],"
                        + "\"attendance\":{\"partial\":false,\"worshipOnly\":false},"
                        + "\"schedule\":[{\"breakfast\":false,\"lunch\":false,"
                        + "\"dinner\":false,\"worship\":false}],"
                        + "\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,"
                        + "\"car\":false,\"publicTransit\":false,\"support\":false}}"),
            1,
            FormSetup.Mode.SLOTS,
            false,
            false);

    assertThat(setup.middleGroups()).containsExactly("1중그룹", "2중그룹");
    assertThat(setup.cells()).isEmpty();
  }

  @Test
  void noLodgingIsOneOptionalCheckboxForFullAndPartialAttendeesInRangeMode() {
    List<FormPreset.Question> range =
        generate(stay(true, true, FormSetup.Mode.RANGE), FRIDAY, FRIDAY.plusDays(2));
    FormPreset.Question stay = find(range, "NO_LODGING");
    assertThat(stay.type()).isEqualTo(AnswerType.MULTI_CHOICE);
    assertThat(stay.required()).isFalse();
    assertThat(stay.config().get("options")).hasSize(1);
    assertThat(stay.config().get("options").get(0).get("optionId").asString())
        .isEqualTo("opt_no_lodging");
    assertThat(stay.showWhen().get("optionIds").toString())
        .isEqualTo("[\"opt_full\",\"opt_partial\"]");
    assertThat(keys(range).indexOf("NO_LODGING"))
        .isGreaterThan(keys(range).indexOf("DEPARTURE_SLOT"));

    // Everyone attends in full without an attendance question: no condition.
    assertThat(
            find(
                    generate(stay(false, true, FormSetup.Mode.SLOTS), FRIDAY, FRIDAY.plusDays(1)),
                    "NO_LODGING")
                .showWhen())
        .isNull();
    // SLOTS partial attendees choose nights in LODGING, so SLOTS with attendance stays as it was.
    assertThat(keys(generate(stay(true, true, FormSetup.Mode.SLOTS), FRIDAY, FRIDAY.plusDays(2))))
        .doesNotContain("NO_LODGING");
    // Off, or a one-day event without a night: no question.
    assertThat(keys(generate(stay(true, false, FormSetup.Mode.RANGE), FRIDAY, FRIDAY.plusDays(2))))
        .doesNotContain("NO_LODGING");
    assertThat(keys(generate(stay(true, true, FormSetup.Mode.RANGE), FRIDAY, FRIDAY)))
        .doesNotContain("NO_LODGING");
  }

  @Test
  void rangeAsksArrivalAndDepartureSlotsAndOnlyServicesForWorshipOnly() {
    FormSetup setup =
        new FormSetup(
            false,
            false,
            false,
            List.of(),
            List.of(),
            true,
            true,
            FormSetup.Mode.RANGE,
            days(2, true),
            false,
            false,
            false,
            false,
            false,
            false,
            false);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY.plusDays(1));

    assertThat(keys(questions))
        .containsExactly(
            "ATTENDANCE", "ARRIVAL_SLOT", "DEPARTURE_SLOT", "MEALS", "PARTIAL_NOTE", "CONSENT");
    JsonNode from = find(questions, "ARRIVAL_SLOT").config().get("options");
    assertThat(from).hasSize(8);
    assertThat(from.get(0).get("optionId").asString()).isEqualTo("opt_d1_breakfast");
    assertThat(from.get(3).get("label").asString()).isEqualTo("1월 22일 (금) 집회부터");
    JsonNode to = find(questions, "DEPARTURE_SLOT").config().get("options");
    assertThat(to.get(7).get("label").asString()).isEqualTo("1월 23일 (토) 집회까지");
    assertThat(find(questions, "ARRIVAL_SLOT").showWhen().get("optionIds"))
        .hasToString("[\"opt_partial\"]");
    JsonNode meals = find(questions, "MEALS").config().get("options");
    assertThat(meals).hasSize(8);
    for (JsonNode option : meals) {
      assertThat(option.get("hidden").booleanValue())
          .isEqualTo(!option.get("optionId").asString().endsWith("_worship"));
    }
    assertThat(find(questions, "MEALS").showWhen().get("optionIds"))
        .hasToString("[\"opt_worship\"]");
  }

  @Test
  void partialByTimeLetsPartialAttendeesRideOnlyAtTheFirstLastAndWorshipSlots() {
    List<FormPreset.Question> questions =
        generate(transportSetup(FormSetup.Mode.RANGE, true), FRIDAY, FRIDAY.plusDays(2));
    String attendance = ids.get("ATTENDANCE").toString();
    String arrival = ids.get("ARRIVAL_SLOT").toString();
    String departure = ids.get("DEPARTURE_SLOT").toString();

    JsonNode in = find(questions, "TRANSPORT_IN").config().get("options");
    assertThat(in.get(0).get("showWhen"))
        .hasToString(anyOf(attendance, "\"opt_full\"", arrival, "\"opt_d1_breakfast\""));
    assertThat(in.get(1).get("showWhen"))
        .hasToString(
            anyOf(
                attendance,
                "\"opt_worship\"",
                arrival,
                "\"opt_d1_worship\",\"opt_d2_worship\",\"opt_d3_worship\""));
    // Car, ride, public transit and support stay open to everyone.
    for (int index = 2; index < in.size(); index++) {
      assertThat(in.get(index).get("showWhen").isNull()).isTrue();
    }
    JsonNode out = find(questions, "TRANSPORT_OUT").config().get("options");
    assertThat(out.get(0).get("showWhen"))
        .hasToString(anyOf(attendance, "\"opt_full\"", departure, "\"opt_d3_worship\""));
    assertThat(out.get(1).get("showWhen").toString()).contains(departure);
    passesTheRules(questions);

    // SLOTS: the first chosen slot is the event's first slot when MEALS holds it.
    ids.clear();
    questions = generate(transportSetup(FormSetup.Mode.SLOTS, true), FRIDAY, FRIDAY.plusDays(2));
    String meals = ids.get("MEALS").toString();
    in = find(questions, "TRANSPORT_IN").config().get("options");
    assertThat(in.get(0).get("showWhen"))
        .hasToString(
            anyOf(ids.get("ATTENDANCE").toString(), "\"opt_full\"", meals, "\"opt_d1_breakfast\""));
    assertThat(in.get(1).get("showWhen").get("optionIds"))
        .hasToString("[\"opt_partial\",\"opt_worship\"]");
    out = find(questions, "TRANSPORT_OUT").config().get("options");
    assertThat(out.get(0).get("showWhen").toString()).contains("opt_d3_worship");
    passesTheRules(questions);

    // Off: the conditions made before the switch existed.
    ids.clear();
    questions = generate(transportSetup(FormSetup.Mode.RANGE, false), FRIDAY, FRIDAY.plusDays(2));
    in = find(questions, "TRANSPORT_IN").config().get("options");
    assertThat(in.get(0).get("showWhen").get("optionIds"))
        .hasToString("[\"opt_full\",\"opt_partial\"]");
    assertThat(in.get(1).get("showWhen").get("optionIds"))
        .hasToString("[\"opt_partial\",\"opt_worship\"]");
  }

  @Test
  void carRidersAreNotAskedTheWayBackOrToOfferSeats() {
    List<FormPreset.Question> questions =
        generate(transportSetup(FormSetup.Mode.RANGE, true), FRIDAY, FRIDAY.plusDays(2));
    JsonNode in = find(questions, "TRANSPORT_IN").config().get("options");
    assertThat(in.get(2).get("label").asString()).isEqualTo("자차 (직접 운전)");
    assertThat(in.get(3).get("optionId").asString()).isEqualTo("opt_ride");
    assertThat(find(questions, "CARPOOL_OFFER").showWhen().get("optionIds"))
        .hasToString("[\"opt_car\"]");
    assertThat(find(questions, "TRANSPORT_OUT").showWhen().get("optionIds").toString())
        .doesNotContain("opt_car", "opt_ride");
  }

  private static String anyOf(String first, String firstIds, String second, String secondIds) {
    return "{\"anyOf\":[{\"fieldId\":\""
        + first
        + "\",\"optionIds\":["
        + firstIds
        + "]},{\"fieldId\":\""
        + second
        + "\",\"optionIds\":["
        + secondIds
        + "]}]}";
  }

  private static FormSetup transportSetup(FormSetup.Mode mode, boolean partialByTime) {
    return new FormSetup(
        false,
        false,
        false,
        List.of(),
        List.of(),
        true,
        true,
        mode,
        days(3, true),
        true,
        true,
        true,
        true,
        true,
        partialByTime,
        false);
  }

  /** The generated settings are in FieldRules' normalized shape and pass the condition rules. */
  private void passesTheRules(List<FormPreset.Question> questions) {
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormPreset.Question question : questions) {
      fields.add(
          FieldDefinition.custom(
              ids.get(question.key()),
              question.label(),
              fields.size(),
              question.type(),
              question.required(),
              question.description(),
              question.config(),
              question.showWhen(),
              false));
      assertThat(FieldRules.config(question.type(), question.config(), fields.getLast()))
          .isEqualTo(question.config());
    }
    FieldRules.checkConditions(fields);
  }

  @Test
  void slotOrderAndRangeNights() {
    assertThat(MealSlots.order("opt_d1_worship")).isLessThan(MealSlots.order("opt_d2_breakfast"));
    assertThat(MealSlots.order("opt_d2_lunch")).isLessThan(MealSlots.order("opt_d2_dinner"));
    assertThat(MealSlots.order("opt_full")).isEqualTo(-1);
    assertThat(MealSlots.order("opt_dx_lunch")).isEqualTo(-1);
    JsonMapper mapper = JsonMapper.builder().build();
    assertThat(
            MealSlots.nights(
                new MealSlots.Answers(
                    null,
                    mapper.readTree("{\"optionId\":\"opt_d1_worship\"}"),
                    mapper.readTree("{\"optionId\":\"opt_d3_breakfast\"}"))))
        .containsExactly(1, 2);
    assertThat(
            MealSlots.nights(
                new MealSlots.Answers(
                    null,
                    mapper.readTree("{\"optionId\":\"opt_d2_lunch\"}"),
                    mapper.readTree("{\"optionId\":\"opt_d2_dinner\"}"))))
        .isEmpty();
    assertThat(
            MealSlots.nights(
                new MealSlots.Answers(
                    null, mapper.readTree("{\"optionId\":\"opt_d2_lunch\"}"), null)))
        .isNull();
  }

  /** Partial attendance on or off, every slot of each day, and the no-lodging switch. */
  private static FormSetup stay(boolean partial, boolean noLodging, FormSetup.Mode mode) {
    return new FormSetup(
        false,
        false,
        false,
        List.of(),
        List.of(),
        partial,
        false,
        mode,
        days(3, true),
        false,
        false,
        false,
        false,
        false,
        false,
        noLodging);
  }

  /** Only the middle group and cell switches and lists, on a one-day event. */
  private static FormSetup affiliation(
      boolean middleGroup, List<String> middleGroups, boolean cell, List<String> cells) {
    return new FormSetup(
        false,
        middleGroup,
        cell,
        middleGroups,
        cells,
        false,
        false,
        FormSetup.Mode.RANGE,
        days(1, false),
        false,
        false,
        false,
        false,
        false,
        false,
        false);
  }

  private List<FormPreset.Question> generate(FormSetup setup, LocalDate start, LocalDate end) {
    return FormPreset.generate(
        setup, start, end, key -> ids.computeIfAbsent(key, missing -> UUID.randomUUID()));
  }

  private static List<FormSetup.Day> days(int count, boolean worship) {
    List<FormSetup.Day> days = new ArrayList<>();
    for (int day = 0; day < count; day++) {
      days.add(new FormSetup.Day(worship, worship, worship, worship));
    }
    return days;
  }

  private static List<String> keys(List<FormPreset.Question> questions) {
    return questions.stream().map(FormPreset.Question::key).toList();
  }

  private static FormPreset.Question find(List<FormPreset.Question> questions, String key) {
    return questions.stream().filter(q -> q.key().equals(key)).findFirst().orElseThrow();
  }
}
