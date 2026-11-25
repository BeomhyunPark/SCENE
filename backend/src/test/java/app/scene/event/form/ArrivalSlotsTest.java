package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ArrivalSlotsTest {

  /** Day 1 dinner and worship, day 2 three meals and worship, day 3 breakfast. */
  static final List<MealSlots.Day> DAYS =
      List.of(
          new MealSlots.Day(
              1,
              LocalDate.of(2027, 1, 22),
              "1월 22일 (금)",
              List.of(
                  new MealSlots.Slot("opt_d1_dinner", "DINNER", "저녁"),
                  new MealSlots.Slot("opt_d1_worship", "WORSHIP", "집회"))),
          new MealSlots.Day(
              2,
              LocalDate.of(2027, 1, 23),
              "1월 23일 (토)",
              List.of(
                  new MealSlots.Slot("opt_d2_breakfast", "BREAKFAST", "아침"),
                  new MealSlots.Slot("opt_d2_lunch", "LUNCH", "점심"),
                  new MealSlots.Slot("opt_d2_dinner", "DINNER", "저녁"),
                  new MealSlots.Slot("opt_d2_worship", "WORSHIP", "집회"))),
          new MealSlots.Day(
              3,
              LocalDate.of(2027, 1, 24),
              "1월 24일 (일)",
              List.of(new MealSlots.Slot("opt_d3_breakfast", "BREAKFAST", "아침"))));

  @Test
  void arrivalIsTheFirstAttendedSlot() {
    assertThat(ArrivalSlots.arrival(List.of("opt_d2_lunch", "opt_d2_dinner")))
        .isEqualTo("opt_d2_lunch");
    assertThat(ArrivalSlots.arrival(List.of())).isNull();
    assertThat(ArrivalSlots.arrival(null)).isNull();
  }

  @Test
  void aContinuousRangeIsDueAtItsFirstSlot() {
    List<String> range =
        List.of("opt_d2_lunch", "opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast");
    assertThat(ArrivalSlots.dueSlot(DAYS, range, "opt_d3_breakfast")).isEqualTo("opt_d2_lunch");
    assertThat(ArrivalSlots.dueSlot(DAYS, range, "opt_d2_lunch")).isEqualTo("opt_d2_lunch");
  }

  @Test
  void aSkippedWorshipDoesNotBreakTheRunButASkippedMealDoes() {
    List<String> overnight = List.of("opt_d1_dinner", "opt_d2_breakfast");
    assertThat(ArrivalSlots.dueSlot(DAYS, overnight, "opt_d2_breakfast"))
        .isEqualTo("opt_d1_dinner");

    List<String> twoDays = List.of("opt_d1_dinner", "opt_d2_dinner");
    assertThat(ArrivalSlots.dueSlot(DAYS, twoDays, "opt_d2_dinner")).isEqualTo("opt_d2_dinner");
  }

  @Test
  void aSlotNotAttendedHasNoDueSlot() {
    assertThat(ArrivalSlots.dueSlot(DAYS, List.of("opt_d1_dinner"), "opt_d2_lunch")).isNull();
    assertThat(ArrivalSlots.dueSlot(DAYS, null, "opt_d2_lunch")).isNull();
  }
}
