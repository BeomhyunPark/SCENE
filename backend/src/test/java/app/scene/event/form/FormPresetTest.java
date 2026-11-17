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
            false, true, true, false, false, false, days(2, true), true, true, true, false, false);

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
    assertThat(in.get(3).get("hidden").booleanValue()).isTrue();
  }

  @Test
  void aOneDayEventHasNoLodgingAndOnlyDrivingAsksNoWayBack() {
    FormSetup setup =
        new FormSetup(
            true,
            false,
            false,
            false,
            true,
            false,
            days(1, false),
            false,
            false,
            true,
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
            true, true, true, true, true, true, days(10, true), true, true, true, true, true);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY.plusDays(9));

    assertThat(keys(questions)).isEqualTo(FormPreset.ORDER);
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
  void theNewcomerQuestionIsARequiredYesNoAfterTheCellAndBeforeAttendance() {
    FormSetup setup =
        new FormSetup(
            true, false, true, true, true, false, days(2, true), false, false, false, false, false);

    List<FormPreset.Question> questions = generate(setup, FRIDAY, FRIDAY.plusDays(1));

    assertThat(keys(questions)).startsWith("GENDER", "CELL", "NEWCOMER", "ATTENDANCE");
    FormPreset.Question newcomer = find(questions, "NEWCOMER");
    assertThat(newcomer.type()).isEqualTo(AnswerType.YES_NO);
    assertThat(newcomer.required()).isTrue();
    assertThat(newcomer.showWhen()).isNull();
    assertThat(newcomer.label()).isEqualTo("새가족이신가요?");
    assertThat(newcomer.config().get("style").asString()).isEqualTo("YES_NO");
  }

  @Test
  void aSetupWithoutTheNewcomerKeyLeavesTheQuestionOut() {
    FormSetup setup =
        FormSetup.parse(
            JsonMapper.builder()
                .build()
                .readTree(
                    "{\"gender\":false,\"middleGroup\":false,\"cell\":false,"
                        + "\"attendance\":{\"partial\":false,\"worshipOnly\":false},"
                        + "\"schedule\":[{\"breakfast\":false,\"lunch\":false,"
                        + "\"dinner\":false,\"worship\":false}],"
                        + "\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,"
                        + "\"car\":false,\"publicTransit\":false,\"support\":false}}"),
            1);

    assertThat(setup.newcomer()).isFalse();
    assertThat(keys(generate(setup, FRIDAY, FRIDAY))).containsExactly("CONSENT");
    assertThat(setup.toJson(FRIDAY, FRIDAY).get("newcomer").booleanValue()).isFalse();
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
