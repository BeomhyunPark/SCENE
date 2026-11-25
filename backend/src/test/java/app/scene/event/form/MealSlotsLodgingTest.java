package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** {@link MealSlots#lodgingNights}: the one per-person lodging rule (DEC-073, DEC-085 §6). */
class MealSlotsLodgingTest {

  private static final JsonMapper JSON = JsonMapper.builder().build();
  private static final String PERIOD =
      "\"generatedFor\":{\"startDate\":\"2027-01-22\",\"endDate\":\"2027-01-24\"}";

  private static final MealSlots.Answers NO_SLOTS = new MealSlots.Answers(null, null, null);

  @Test
  void fullSleepsEveryNightWorshipOnlyNoneAndNoLodgingNone() {
    JsonNode setup = tree("{" + PERIOD + "}");
    assertThat(MealSlots.lodgingNights(setup, "FULL", NO_SLOTS, asked(null, null)))
        .containsExactly(1, 2);
    assertThat(MealSlots.lodgingNights(setup, "WORSHIP_ONLY", NO_SLOTS, asked(null, null)))
        .isEmpty();
    JsonNode home = tree("{\"optionIds\":[\"opt_no_lodging\"]}");
    assertThat(MealSlots.lodgingNights(setup, "FULL", NO_SLOTS, asked(null, home))).isEmpty();
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", NO_SLOTS, notAsked(home))).isEmpty();
  }

  @Test
  void partialInSlotsModeSleepsTheChosenNightsAndIsUnknownWithoutTheQuestion() {
    JsonNode setup = tree("{" + PERIOD + "}");
    JsonNode chosen = tree("{\"optionIds\":[\"opt_n2\",\"opt_n9\",\"opt_no_lodging_x\"]}");
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", NO_SLOTS, asked(chosen, null)))
        .containsExactly(2);
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", NO_SLOTS, asked(null, null))).isEmpty();
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", NO_SLOTS, notAsked(null))).isNull();
  }

  @Test
  void partialInRangeModeFollowsTheArrivalAndDepartureSlots() {
    JsonNode setup = tree("{" + PERIOD + ",\"attendance\":{\"mode\":\"RANGE\"}}");
    MealSlots.Answers range =
        new MealSlots.Answers(
            null,
            tree("{\"optionId\":\"opt_d1_worship\"}"),
            tree("{\"optionId\":\"opt_d2_lunch\"}"));
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", range, notAsked(null))).containsExactly(1);
    MealSlots.Answers open =
        new MealSlots.Answers(null, tree("{\"optionId\":\"opt_d1_worship\"}"), null);
    assertThat(MealSlots.lodgingNights(setup, "PARTIAL", open, notAsked(null))).isNull();
  }

  @Test
  void noPeriodIsUnknown() {
    assertThat(MealSlots.lodgingNights(null, "FULL", NO_SLOTS, asked(null, null))).isNull();
    JsonNode oneDay =
        tree("{\"generatedFor\":{\"startDate\":\"2027-01-22\",\"endDate\":\"2027-01-22\"}}");
    assertThat(MealSlots.lodgingNights(oneDay, "FULL", NO_SLOTS, asked(null, null))).isNull();
    assertThat(MealSlots.nightCount(oneDay)).isZero();
  }

  private static MealSlots.LodgingAnswers asked(JsonNode lodging, JsonNode noLodging) {
    return new MealSlots.LodgingAnswers(true, lodging, noLodging);
  }

  private static MealSlots.LodgingAnswers notAsked(JsonNode noLodging) {
    return new MealSlots.LodgingAnswers(false, null, noLodging);
  }

  private static JsonNode tree(String text) {
    return JSON.readTree(text);
  }
}
