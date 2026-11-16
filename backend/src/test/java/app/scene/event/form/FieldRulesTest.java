package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Operator question settings (DEC-068 §1, §3). */
class FieldRulesTest {

  private final JsonMapper json = JsonMapper.builder().build();

  @Test
  void defaultsAreFilledForEveryType() {
    assertThat(config(AnswerType.SHORT_TEXT, "{}").toString())
        .isEqualTo("{\"maxLength\":200,\"format\":\"NONE\",\"placeholder\":null}");
    assertThat(config(AnswerType.LONG_TEXT, "{}").get("maxLength").intValue()).isEqualTo(1000);
    assertThat(config(AnswerType.DATE, "{}").toString())
        .isEqualTo("{\"includeTime\":false,\"min\":null,\"max\":null}");
    assertThat(config(AnswerType.NUMBER, "{}").toString())
        .isEqualTo("{\"min\":null,\"max\":null,\"unit\":null}");
    assertThat(config(AnswerType.YES_NO, "{}").get("style").asString()).isEqualTo("YES_NO");
  }

  @Test
  void choiceTypesNeedOptionsAndGetStableIds() {
    invalid(() -> config(AnswerType.SINGLE_CHOICE, "{}"));
    invalid(() -> config(AnswerType.DROPDOWN, "{\"options\":[]}"));

    ObjectNode first =
        config(AnswerType.SINGLE_CHOICE, "{\"options\":[{\"label\":\" S \"},{\"label\":\"M\"}]}");
    JsonNode options = first.get("options");
    assertThat(options).hasSize(2);
    assertThat(options.get(0).get("label").asString()).isEqualTo("S");
    String id = options.get(0).get("optionId").asString();
    assertThat(id).startsWith("opt_");
    assertThat(first.get("display").asString()).isEqualTo("LIST");

    FieldDefinition before = field(AnswerType.SINGLE_CHOICE, first, 0, null);
    ObjectNode renamed =
        FieldRules.config(
            AnswerType.SINGLE_CHOICE,
            json.readTree("{\"options\":[{\"optionId\":\"" + id + "\",\"label\":\"S (90)\"}]}"),
            before);
    assertThat(renamed.get("options").get(0).get("optionId").asString()).isEqualTo(id);
    assertThat(FieldRules.removesOption(before, renamed)).isTrue();

    invalid(
        () ->
            FieldRules.config(
                AnswerType.SINGLE_CHOICE,
                json.readTree("{\"options\":[{\"optionId\":\"opt_made_up\",\"label\":\"X\"}]}"),
                before));
  }

  @Test
  void multiChoiceBoundsFitTheOptions() {
    String two = "{\"label\":\"A\"},{\"label\":\"B\"}";
    assertThat(
            config(AnswerType.MULTI_CHOICE, "{\"options\":[" + two + "]}")
                .get("maxSelect")
                .isNull())
        .isTrue();
    invalid(() -> config(AnswerType.MULTI_CHOICE, "{\"options\":[" + two + "],\"maxSelect\":3}"));
    invalid(
        () ->
            config(
                AnswerType.MULTI_CHOICE,
                "{\"options\":[" + two + "],\"minSelect\":2,\"maxSelect\":1}"));
    assertThat(
            config(
                    AnswerType.MULTI_CHOICE,
                    "{\"options\":[" + two + "],\"allowOther\":true,\"maxSelect\":3}")
                .get("maxSelect")
                .intValue())
        .isEqualTo(3);
  }

  @Test
  void unknownKeysAndBadValuesAreRejected() {
    invalid(() -> config(AnswerType.SHORT_TEXT, "{\"options\":[]}"));
    invalid(() -> config(AnswerType.SHORT_TEXT, "{\"maxLength\":201}"));
    invalid(() -> config(AnswerType.SHORT_TEXT, "{\"format\":\"EMAIL\"}"));
    invalid(() -> config(AnswerType.DATE, "{\"min\":\"2027-01-22T10:00\"}"));
    invalid(() -> config(AnswerType.DATE, "{\"min\":\"2027-01-23\",\"max\":\"2027-01-22\"}"));
    invalid(() -> config(AnswerType.NUMBER, "{\"min\":1.5}"));
    invalid(() -> config(AnswerType.YES_NO, "{\"style\":\"CHECK\"}"));
  }

  @Test
  void conditionShapeIsOptionIdsOrEquals() {
    String target = UUID.randomUUID().toString();
    invalid(
        () -> FieldRules.showWhen(json.readTree("{\"fieldId\":\"" + target + "\"}"), "showWhen"));
    invalid(
        () ->
            FieldRules.showWhen(
                json.readTree(
                    "{\"fieldId\":\"" + target + "\",\"optionIds\":[\"a\"],\"equals\":true}"),
                "showWhen"));
    invalid(
        () ->
            FieldRules.showWhen(
                json.readTree("{\"fieldId\":\"" + target + "\",\"optionIds\":[]}"), "showWhen"));
    assertThat(FieldRules.showWhen(json.readTree("null"), "showWhen")).isNull();
  }

  @Test
  void conditionMustPointAtAnEarlierChoiceOrYesNo() {
    ObjectNode choice = config(AnswerType.SINGLE_CHOICE, "{\"options\":[{\"label\":\"A\"}]}");
    FieldDefinition target = field(AnswerType.SINGLE_CHOICE, choice, 2, null);
    String optionId = target.options().get(0).optionId();
    JsonNode onA = condition(target, "\"optionIds\":[\"" + optionId + "\"]");

    FieldRules.checkConditions(List.of(target, field(AnswerType.SHORT_TEXT, text(), 3, onA)));
    invalid(
        () ->
            FieldRules.checkConditions(
                List.of(target, field(AnswerType.SHORT_TEXT, text(), 1, onA))));

    JsonNode missingOption = condition(target, "\"optionIds\":[\"opt_gone\"]");
    invalid(
        () ->
            FieldRules.checkConditions(
                List.of(target, field(AnswerType.SHORT_TEXT, text(), 3, missingOption))));

    JsonNode equals = condition(target, "\"equals\":true");
    invalid(
        () ->
            FieldRules.checkConditions(
                List.of(target, field(AnswerType.SHORT_TEXT, text(), 3, equals))));

    FieldDefinition note = field(AnswerType.SHORT_TEXT, text(), 2, null);
    JsonNode onText = condition(note, "\"equals\":true");
    invalid(
        () ->
            FieldRules.checkConditions(
                List.of(note, field(AnswerType.SHORT_TEXT, text(), 3, onText))));
  }

  @Test
  void optionConditionsCountAsTargetsAndChanges() {
    ObjectNode choice = config(AnswerType.SINGLE_CHOICE, "{\"options\":[{\"label\":\"A\"}]}");
    FieldDefinition target = field(AnswerType.SINGLE_CHOICE, choice, 2, null);
    String optionId = target.options().get(0).optionId();
    ObjectNode dependent =
        config(
            AnswerType.DROPDOWN,
            "{\"options\":[{\"label\":\"X\",\"showWhen\":{\"fieldId\":\""
                + target.fieldId()
                + "\",\"optionIds\":[\""
                + optionId
                + "\"]}}]}");
    FieldDefinition holder = field(AnswerType.DROPDOWN, dependent, 3, null);

    FieldRules.checkConditions(List.of(target, holder));
    assertThat(FieldRules.isConditionTarget(List.of(target, holder), target.fieldId())).isTrue();
    assertThat(FieldRules.isConditionTarget(List.of(target, holder), holder.fieldId())).isFalse();

    String keptId = holder.options().get(0).optionId();
    ObjectNode cleared =
        FieldRules.config(
            AnswerType.DROPDOWN,
            json.readTree("{\"options\":[{\"optionId\":\"" + keptId + "\",\"label\":\"X\"}]}"),
            holder);
    assertThat(FieldRules.changesOptionCondition(holder, cleared)).isTrue();
    assertThat(FieldRules.changesOptionCondition(holder, holder.config())).isFalse();
  }

  // ---- helpers ----

  private ObjectNode config(AnswerType type, String raw) {
    return FieldRules.config(type, json.readTree(raw), null);
  }

  private ObjectNode text() {
    return config(AnswerType.SHORT_TEXT, "{}");
  }

  private JsonNode condition(FieldDefinition target, String rest) {
    return FieldRules.showWhen(
        json.readTree("{\"fieldId\":\"" + target.fieldId() + "\"," + rest + "}"), "showWhen");
  }

  private static FieldDefinition field(
      AnswerType type, ObjectNode config, int position, JsonNode showWhen) {
    return new FieldDefinition(
        UUID.randomUUID(),
        FieldDefinition.CUSTOM,
        null,
        type.name(),
        position,
        type,
        false,
        null,
        config,
        showWhen,
        false);
  }

  private static void invalid(Executable call) {
    assertThatThrownBy(call::execute)
        .isInstanceOf(SceneException.class)
        .extracting(error -> ((SceneException) error).code())
        .isEqualTo(ErrorCode.VALIDATION_FAILED);
  }
}
