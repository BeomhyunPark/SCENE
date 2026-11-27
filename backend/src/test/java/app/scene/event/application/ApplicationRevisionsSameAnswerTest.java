package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/** #520: an edit that changes nothing is recognised for every answer shape. */
class ApplicationRevisionsSameAnswerTest {

  private static final JsonMapper JSON = JsonMapper.builder().build();
  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  private static JsonNode stored(String value) {
    return JSON.readTree(value);
  }

  @Test
  void aStoredNumberEqualsTheSameEvaluatedNumber() {
    ObjectNode evaluated = NODES.objectNode();
    evaluated.put("number", 3L);
    assertThat(ApplicationRevisions.sameAnswer(stored("{\"number\":3}"), evaluated)).isTrue();
    ObjectNode other = NODES.objectNode();
    other.put("number", 4L);
    assertThat(ApplicationRevisions.sameAnswer(stored("{\"number\":3}"), other)).isFalse();
  }

  @Test
  void everyOtherAnswerShapeComparesByValue() {
    String[] shapes = {
      "{\"text\":\"수지\"}",
      "{\"value\":true}",
      "{\"optionId\":\"opt_car\"}",
      "{\"optionId\":\"opt_other\",\"other\":\"기타\"}",
      "{\"optionIds\":[\"a\",\"b\"]}",
      "{\"date\":\"2027-01-22\"}",
      "{\"start\":\"2027-01-22\",\"end\":\"2027-01-24\"}"
    };
    for (String shape : shapes) {
      assertThat(ApplicationRevisions.sameAnswer(stored(shape), stored(shape))).isTrue();
    }
    assertThat(
            ApplicationRevisions.sameAnswer(
                stored("{\"end\":\"2027-01-24\",\"start\":\"2027-01-22\"}"),
                stored("{\"start\":\"2027-01-22\",\"end\":\"2027-01-24\"}")))
        .isTrue();
    assertThat(
            ApplicationRevisions.sameAnswer(
                stored("{\"value\":true}"), stored("{\"value\":false}")))
        .isFalse();
    assertThat(
            ApplicationRevisions.sameAnswer(stored("{\"text\":\"3\"}"), stored("{\"number\":3}")))
        .isFalse();
    assertThat(
            ApplicationRevisions.sameAnswer(
                stored("{\"optionIds\":[\"a\",\"b\"]}"), stored("{\"optionIds\":[\"a\"]}")))
        .isFalse();
  }

  @Test
  void aMultipleChoicePickedInAnotherOrderIsTheSameAnswer() {
    assertThat(
            ApplicationRevisions.sameAnswer(
                stored("{\"optionIds\":[\"a\",\"b\"],\"other\":\"x\"}"),
                stored("{\"optionIds\":[\"b\",\"a\"],\"other\":\"x\"}")))
        .isTrue();
  }

  @Test
  void aMissingAnswerOnlyEqualsAMissingAnswer() {
    assertThat(ApplicationRevisions.sameAnswer(null, null)).isTrue();
    assertThat(ApplicationRevisions.sameAnswer(stored("{\"number\":3}"), null)).isFalse();
    assertThat(ApplicationRevisions.sameAnswer(null, stored("{\"number\":3}"))).isFalse();
  }
}
