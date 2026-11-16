package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.form.AnswerType;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FieldRules;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Public answer rules (DEC-068 §3–4). */
class AnswerEvaluatorTest {

  private final JsonMapper json = JsonMapper.builder().build();
  private final List<FieldDefinition> fields = new ArrayList<>();

  @Test
  void textKeepsTheExistingShapeAndBlankOptionalIsNotStored() {
    FieldDefinition name = system("NAME");
    FieldDefinition note = custom(AnswerType.SHORT_TEXT, "{}", false, null);

    List<AnswerEvaluator.Answer> answers =
        evaluate(answer(name, "{\"text\":\"  김  \"}"), text(note, "   "));

    assertThat(answers).hasSize(1);
    assertThat(answers.get(0).value().toString()).isEqualTo("{\"text\":\"김\"}");
    assertThat(answers.get(0).systemKey()).isEqualTo("NAME");
  }

  @Test
  void textShortcutIsAccepted() {
    FieldDefinition name = system("NAME");
    assertThat(evaluate(text(name, "김")).get(0).text()).isEqualTo("김");
  }

  @Test
  void phoneAndDigitsFormatsAreChecked() {
    FieldDefinition phone = system("PHONE");
    rejected(text(phone, "12"));
    assertThat(evaluate(text(phone, "010-1234-5678")).get(0).text()).isEqualTo("010-1234-5678");

    fields.clear();
    FieldDefinition year =
        custom(AnswerType.SHORT_TEXT, "{\"format\":\"DIGITS\",\"maxLength\":2}", true, null);
    rejected(text(year, "9a"));
    rejected(text(year, "199"));
    assertThat(evaluate(text(year, "98")).get(0).text()).isEqualTo("98");
  }

  @Test
  void requiredQuestionMustBeAnswered() {
    custom(AnswerType.LONG_TEXT, "{}", true, null);
    rejected();
  }

  @Test
  void unknownFieldAndDuplicateAreRejected() {
    FieldDefinition note = custom(AnswerType.SHORT_TEXT, "{}", false, null);
    rejected("{\"fieldId\":\"" + UUID.randomUUID() + "\",\"text\":\"x\"}");
    rejected(text(note, "a"), text(note, "b"));
    rejected("{\"fieldId\":\"" + note.fieldId() + "\",\"text\":\"x\",\"value\":{\"text\":\"x\"}}");
  }

  @Test
  void singleChoiceStoresTheOptionIdAndOther() {
    FieldDefinition size =
        custom(
            AnswerType.SINGLE_CHOICE,
            "{\"options\":[{\"label\":\"S\"},{\"label\":\"M\"}],\"allowOther\":true}",
            true,
            null);
    String small = size.options().get(0).optionId();

    assertThat(evaluate(answer(size, "{\"optionId\":\"" + small + "\"}")).get(0).value().toString())
        .isEqualTo("{\"optionId\":\"" + small + "\"}");
    assertThat(evaluate(answer(size, "{\"other\":\" XL \"}")).get(0).value().toString())
        .isEqualTo("{\"other\":\"XL\"}");
    rejected(answer(size, "{\"optionId\":\"opt_nope\"}"));
    rejected(answer(size, "{\"optionId\":\"" + small + "\",\"other\":\"x\"}"));
  }

  @Test
  void otherIsRejectedWhenTheQuestionDoesNotAllowIt() {
    FieldDefinition menu =
        custom(AnswerType.DROPDOWN, "{\"options\":[{\"label\":\"A\"}]}", false, null);
    rejected(answer(menu, "{\"other\":\"B\"}"));
  }

  @Test
  void multiChoiceChecksTheSelectionCount() {
    FieldDefinition meals =
        custom(
            AnswerType.MULTI_CHOICE,
            "{\"options\":[{\"label\":\"점심\",\"group\":\"1/22\"},{\"label\":\"저녁\",\"group\":\"1/22\"},"
                + "{\"label\":\"아침\",\"group\":\"1/23\"}],\"minSelect\":1,\"maxSelect\":2}",
            false,
            null);
    String a = meals.options().get(0).optionId();
    String b = meals.options().get(1).optionId();
    String c = meals.options().get(2).optionId();

    assertThat(evaluate(answer(meals, ids(a, b))).get(0).value().get("optionIds")).hasSize(2);
    rejected(answer(meals, ids(a, b, c)));
    rejected(answer(meals, ids(a, a)));
    assertThat(evaluate(answer(meals, ids()))).isEmpty();
  }

  @Test
  void datesUseLocalTextAndStayInsideTheBounds() {
    FieldDefinition arrival =
        custom(
            AnswerType.DATE,
            "{\"includeTime\":true,\"min\":\"2027-01-22T00:00\",\"max\":\"2027-01-24T23:59\"}",
            true,
            null);
    assertThat(evaluate(answer(arrival, "{\"dateTime\":\"2027-01-22T19:30\"}"))).hasSize(1);
    rejected(answer(arrival, "{\"dateTime\":\"2027-01-25T09:00\"}"));
    rejected(answer(arrival, "{\"date\":\"2027-01-22\"}"));
    rejected(answer(arrival, "{\"dateTime\":\"2027-01-22T19:30:00+09:00\"}"));
  }

  @Test
  void rangeNeedsStartBeforeEnd() {
    FieldDefinition stay = custom(AnswerType.DATE_RANGE, "{}", true, null);
    assertThat(evaluate(answer(stay, "{\"start\":\"2027-01-22\",\"end\":\"2027-01-23\"}")))
        .hasSize(1);
    rejected(answer(stay, "{\"start\":\"2027-01-23\",\"end\":\"2027-01-22\"}"));
  }

  @Test
  void numberIsAnIntegerInRange() {
    FieldDefinition seats = custom(AnswerType.NUMBER, "{\"min\":1,\"max\":4}", true, null);
    assertThat(evaluate(answer(seats, "{\"number\":3}"))).hasSize(1);
    rejected(answer(seats, "{\"number\":5}"));
    rejected(answer(seats, "{\"number\":1.5}"));
    rejected(answer(seats, "{\"number\":\"2\"}"));
  }

  @Test
  void requiredConsentMustBeChecked() {
    FieldDefinition consent = custom(AnswerType.YES_NO, "{\"style\":\"CONSENT\"}", true, null);
    rejected(answer(consent, "{\"value\":false}"));
    assertThat(evaluate(answer(consent, "{\"value\":true}"))).hasSize(1);
  }

  @Test
  void hiddenQuestionIsDroppedAndSkipsRequired() {
    FieldDefinition car = custom(AnswerType.YES_NO, "{}", true, null);
    FieldDefinition seats =
        custom(
            AnswerType.NUMBER,
            "{}",
            true,
            "{\"fieldId\":\"" + car.fieldId() + "\",\"equals\":true}");

    List<AnswerEvaluator.Answer> stale =
        evaluate(answer(car, "{\"value\":false}"), answer(seats, "{\"number\":2}"));
    assertThat(stale).extracting(AnswerEvaluator.Answer::fieldId).containsExactly(car.fieldId());

    rejected(answer(car, "{\"value\":true}"));
    assertThat(evaluate(answer(car, "{\"value\":true}"), answer(seats, "{\"number\":2}")))
        .hasSize(2);
  }

  @Test
  void conditionsChainThroughHiddenTargets() {
    FieldDefinition attendance =
        custom(
            AnswerType.SINGLE_CHOICE,
            "{\"options\":[{\"label\":\"전체\"},{\"label\":\"부분\"}]}",
            true,
            null);
    String partial = attendance.options().get(1).optionId();
    FieldDefinition car =
        custom(
            AnswerType.YES_NO,
            "{}",
            true,
            "{\"fieldId\":\"" + attendance.fieldId() + "\",\"optionIds\":[\"" + partial + "\"]}");
    FieldDefinition seats =
        custom(
            AnswerType.NUMBER,
            "{}",
            true,
            "{\"fieldId\":\"" + car.fieldId() + "\",\"equals\":true}");
    String full = attendance.options().get(0).optionId();

    List<AnswerEvaluator.Answer> answers =
        evaluate(
            answer(attendance, "{\"optionId\":\"" + full + "\"}"),
            answer(car, "{\"value\":true}"),
            answer(seats, "{\"number\":2}"));
    assertThat(answers)
        .extracting(AnswerEvaluator.Answer::fieldId)
        .containsExactly(attendance.fieldId());
  }

  @Test
  void hiddenOrConditionalOptionIsDropped() {
    FieldDefinition attendance =
        custom(
            AnswerType.SINGLE_CHOICE,
            "{\"options\":[{\"label\":\"전체\"},{\"label\":\"집회만\"}]}",
            true,
            null);
    String full = attendance.options().get(0).optionId();
    String worship = attendance.options().get(1).optionId();
    FieldDefinition transport =
        custom(
            AnswerType.SINGLE_CHOICE,
            "{\"options\":[{\"label\":\"단체 차량\",\"showWhen\":{\"fieldId\":\""
                + attendance.fieldId()
                + "\",\"optionIds\":[\""
                + full
                + "\"]}},{\"label\":\"자차\"},{\"label\":\"폐지\",\"hidden\":true}]}",
            true,
            null);
    String bus = transport.options().get(0).optionId();
    String retired = transport.options().get(2).optionId();

    assertThat(
            evaluate(
                answer(attendance, "{\"optionId\":\"" + full + "\"}"),
                answer(transport, "{\"optionId\":\"" + bus + "\"}")))
        .hasSize(2);
    rejected(
        answer(attendance, "{\"optionId\":\"" + worship + "\"}"),
        answer(transport, "{\"optionId\":\"" + bus + "\"}"));
    rejected(
        answer(attendance, "{\"optionId\":\"" + full + "\"}"),
        answer(transport, "{\"optionId\":\"" + retired + "\"}"));
  }

  @Test
  void hiddenQuestionAnswerIsDroppedNotRejected() {
    FieldDefinition note = custom(AnswerType.SHORT_TEXT, "{}", true, null, true);
    assertThat(evaluate(text(note, "old"))).isEmpty();
  }

  // ---- helpers ----

  private FieldDefinition system(String key) {
    FieldDefinition field =
        new FieldDefinition(
            UUID.randomUUID(),
            FieldDefinition.SYSTEM,
            key,
            key,
            fields.size(),
            AnswerType.SHORT_TEXT,
            true,
            null,
            FieldRules.systemConfig(key),
            null,
            false);
    fields.add(field);
    return field;
  }

  private FieldDefinition custom(
      AnswerType type, String config, boolean required, String showWhen) {
    return custom(type, config, required, showWhen, false);
  }

  private FieldDefinition custom(
      AnswerType type, String config, boolean required, String showWhen, boolean hidden) {
    ObjectNode normalized = FieldRules.config(type, json.readTree(config), null);
    JsonNode condition =
        showWhen == null ? null : FieldRules.showWhen(json.readTree(showWhen), "showWhen");
    FieldDefinition field =
        new FieldDefinition(
            UUID.randomUUID(),
            FieldDefinition.CUSTOM,
            null,
            type.name(),
            fields.size(),
            type,
            required,
            null,
            normalized,
            condition,
            hidden);
    fields.add(field);
    FieldRules.checkConditions(fields);
    return field;
  }

  private static String text(FieldDefinition field, String text) {
    return "{\"fieldId\":\"" + field.fieldId() + "\",\"text\":\"" + text + "\"}";
  }

  private static String answer(FieldDefinition field, String value) {
    return "{\"fieldId\":\"" + field.fieldId() + "\",\"value\":" + value + "}";
  }

  private static String ids(String... ids) {
    StringBuilder out = new StringBuilder("{\"optionIds\":[");
    for (int i = 0; i < ids.length; i++) {
      out.append(i == 0 ? "" : ",").append('"').append(ids[i]).append('"');
    }
    return out.append("]}").toString();
  }

  private List<AnswerEvaluator.Answer> evaluate(String... answers) {
    return AnswerEvaluator.evaluate(
        json.readTree("{\"answers\":[" + String.join(",", answers) + "]}"), fields);
  }

  private void rejected(String... answers) {
    assertThatThrownBy(() -> evaluate(answers))
        .isInstanceOf(SceneException.class)
        .extracting(error -> ((SceneException) error).code())
        .isEqualTo(ErrorCode.APPLICATION_VALIDATION_FAILED);
  }
}
