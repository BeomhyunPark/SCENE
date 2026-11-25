package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.event.form.MealSlots;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The counting rule of DEC-087 §5–§7 at fixed times. */
class MealTallyTest {

  private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

  private static final List<MealSlots.Day> DAYS =
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

  private static final List<String> ALL =
      List.of(
          "opt_d1_dinner",
          "opt_d1_worship",
          "opt_d2_breakfast",
          "opt_d2_lunch",
          "opt_d2_dinner",
          "opt_d2_worship",
          "opt_d3_breakfast");

  /**
   * Full and arrived; full and not arrived; RANGE from day 2 lunch; SLOTS on two separate dinners;
   * two with unknown slots, one of them arrived.
   */
  private static final List<MealTally.Person> PEOPLE =
      List.of(
          new MealTally.Person(ALL, true),
          new MealTally.Person(ALL, false),
          new MealTally.Person(
              List.of("opt_d2_lunch", "opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast"),
              false),
          new MealTally.Person(List.of("opt_d1_dinner", "opt_d2_dinner"), false),
          new MealTally.Person(null, true),
          new MealTally.Person(null, false));

  @Test
  void beforeTheEventEveryoneWhoHasNotArrivedIsComing() {
    MealTally.Result result = count(Map.of(), "2027-01-21T12:00:00+09:00");

    assertThat(result.nextSlotId()).isEqualTo("opt_d1_dinner");
    assertThat(numbers(slot(result, "opt_d1_dinner"))).containsExactly(3L, 1L, 2L, 0L, 3L);
    assertThat(numbers(slot(result, "opt_d2_lunch"))).containsExactly(3L, 1L, 2L, 0L, 3L);
    assertThat(numbers(slot(result, "opt_d3_breakfast"))).containsExactly(3L, 1L, 2L, 0L, 3L);
    assertThat(result.unknown()).isEqualTo(new MealCounts.Unknown(2, 1));
  }

  @Test
  void worshipSlotsAreLeftOutOfTheCounts() {
    MealTally.Result result = count(Map.of(), "2027-01-21T12:00:00+09:00");

    assertThat(result.days().get(0).slots())
        .extracting(MealCounts.Slot::slotId)
        .containsExactly("opt_d1_dinner");
    assertThat(result.days().get(1).slots())
        .extracting(MealCounts.Slot::slotId)
        .containsExactly("opt_d2_breakfast", "opt_d2_lunch", "opt_d2_dinner");
  }

  @Test
  void anArrivalSlotThatHasPassedMakesTheAbsentMissing() {
    // 19:10 on day 1: dinner (18:00) passed at 19:00; worship (19:30) is current.
    MealTally.Result result = count(Map.of(), "2027-01-22T19:10:00+09:00");

    assertThat(result.nextSlotId()).isEqualTo("opt_d2_breakfast");
    MealCounts.Slot dinner = slot(result, "opt_d1_dinner");
    assertThat(dinner.passed()).isTrue();
    assertThat(numbers(dinner)).containsExactly(3L, 1L, 0L, 2L, 1L);
    // The full attendee who has not come is missing; the RANGE one is still coming at lunch.
    assertThat(numbers(slot(result, "opt_d2_breakfast"))).containsExactly(2L, 1L, 0L, 1L, 1L);
    assertThat(numbers(slot(result, "opt_d2_lunch"))).containsExactly(3L, 1L, 1L, 1L, 2L);
    // The two-dinner attendee is due again at day 2 dinner.
    assertThat(numbers(slot(result, "opt_d2_dinner"))).containsExactly(4L, 1L, 2L, 1L, 3L);
  }

  @Test
  void aScheduleTimeMovesTheSlotAndItStaysCurrentForAnHour() {
    Map<String, String> scheduled = Map.of("opt_d2_breakfast", "07:00");

    MealTally.Result during = count(scheduled, "2027-01-23T07:59:59+09:00");
    assertThat(during.nextSlotId()).isEqualTo("opt_d2_breakfast");
    MealCounts.Slot breakfast = slot(during, "opt_d2_breakfast");
    assertThat(breakfast.startTime()).isEqualTo("07:00");
    assertThat(breakfast.timeFromSchedule()).isTrue();
    assertThat(breakfast.passed()).isFalse();
    assertThat(slot(during, "opt_d2_lunch").startTime()).isEqualTo("12:00");
    assertThat(slot(during, "opt_d2_lunch").timeFromSchedule()).isFalse();

    MealTally.Result after = count(scheduled, "2027-01-23T08:00:00+09:00");
    assertThat(after.nextSlotId()).isEqualTo("opt_d2_lunch");
    assertThat(slot(after, "opt_d2_breakfast").passed()).isTrue();
  }

  @Test
  void afterTheLastSlotThereIsNoNextMealAndNobodyIsComing() {
    MealTally.Result result = count(Map.of(), "2027-01-24T09:00:00+09:00");

    assertThat(result.nextSlotId()).isNull();
    for (MealCounts.Day day : result.days()) {
      for (MealCounts.Slot slot : day.slots()) {
        assertThat(slot.passed()).isTrue();
        assertThat(slot.coming()).isZero();
        assertThat(slot.reflected()).isEqualTo(slot.arrived());
      }
    }
  }

  @Test
  void arrivingMovesAPersonFromMissingToArrived() {
    List<MealTally.Person> late =
        List.of(new MealTally.Person(ALL, false), new MealTally.Person(ALL, true));
    MealTally.Result result =
        MealTally.count(DAYS, Map.of(), late, Instant.parse("2027-01-23T03:00:00Z"), SEOUL);

    // 12:00 in Seoul: breakfast passed, lunch current.
    assertThat(result.nextSlotId()).isEqualTo("opt_d2_lunch");
    assertThat(numbers(slot(result, "opt_d2_lunch"))).containsExactly(2L, 1L, 0L, 1L, 1L);
  }

  private static MealTally.Result count(Map<String, String> scheduled, String at) {
    return MealTally.count(
        DAYS, scheduled, PEOPLE, Instant.from(java.time.OffsetDateTime.parse(at)), SEOUL);
  }

  private static MealCounts.Slot slot(MealTally.Result result, String slotId) {
    return result.days().stream()
        .flatMap(day -> day.slots().stream())
        .filter(slot -> slot.slotId().equals(slotId))
        .findFirst()
        .orElseThrow();
  }

  /** planned, arrived, coming, missing, reflected */
  private static List<Long> numbers(MealCounts.Slot slot) {
    return List.of(slot.planned(), slot.arrived(), slot.coming(), slot.missing(), slot.reflected());
  }
}
