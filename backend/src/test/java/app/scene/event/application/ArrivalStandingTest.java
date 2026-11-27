package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.event.form.MealSlots;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The arrival roster rule (E4 #456, DEC-089 Follow-up) at fixed times, and that its {@code OVERDUE}
 * people are always the next meal's {@code missing} in the meal counts.
 */
class ArrivalStandingTest {

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

  private static final List<String> FROM_D2_DINNER =
      List.of("opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast");

  /** SLOTS on two separate dinners. */
  private static final List<String> TWO_DINNERS = List.of("opt_d1_dinner", "opt_d2_dinner");

  /** RANGE that leaves after day 1 worship. */
  private static final List<String> FIRST_NIGHT = List.of("opt_d1_dinner", "opt_d1_worship");

  @Test
  void aPartialAttendeeComingOnDayTwoIsNotOverdueOnDayOne() {
    // Day 1, 20:00: day 1 dinner has passed, worship is current.
    assertThat(standing(FROM_D2_DINNER, false, "2027-01-22T20:00:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.COMING, "opt_d2_dinner"));
    assertThat(standing(ALL, false, "2027-01-22T20:00:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.OVERDUE, "opt_d1_dinner"));
    // Day 2, 19:00: their dinner has passed and they have not come.
    assertThat(standing(FROM_D2_DINNER, false, "2027-01-23T19:00:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.OVERDUE, "opt_d2_dinner"));
  }

  /**
   * #522 (테스트나, 금 집회~토 저녁): 도착 예정 until their worship slot is over, then 미도착 for the next
   * meal, so the field's 도착 예정 chip hides at zero after midnight. Not a missed count.
   */
  @Test
  void aRangeFromDayOneWorshipIsComingUntilWorshipPassesThenOverdue() {
    List<String> fromWorship =
        List.of("opt_d1_worship", "opt_d2_breakfast", "opt_d2_lunch", "opt_d2_dinner");
    assertThat(standing(fromWorship, false, "2027-01-22T19:10:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.COMING, "opt_d1_worship"));
    assertThat(standing(fromWorship, false, "2027-01-23T00:18:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.OVERDUE, "opt_d1_worship"));
  }

  @Test
  void beforeTheEventNobodyIsOverdueAndArrivalShowsTheArrivalSlot() {
    String before = "2027-01-21T12:00:00+09:00";
    assertThat(standing(ALL, false, before))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.COMING, "opt_d1_dinner"));
    assertThat(standing(FROM_D2_DINNER, true, before))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.ARRIVED, "opt_d2_dinner"));
    assertThat(standing(null, false, before))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.UNKNOWN, null));
    assertThat(standing(null, true, before))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.ARRIVED, null));
  }

  @Test
  void separateDaysAreDueAgainAtEachRun() {
    // Day 2 breakfast is next: the day 1 run passed without them; the day 2 dinner run is ahead.
    assertThat(standing(TWO_DINNERS, false, "2027-01-23T08:30:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.COMING, "opt_d2_dinner"));
    assertThat(standing(TWO_DINNERS, false, "2027-01-23T19:30:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.PASSED, "opt_d2_dinner"));
  }

  @Test
  void someoneWhoLeftOrWhoseSlotsAllPassedIsPassedNotOverdue() {
    assertThat(standing(FIRST_NIGHT, false, "2027-01-23T08:30:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.PASSED, "opt_d1_dinner"));
    assertThat(standing(ALL, false, "2027-01-25T12:00:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.PASSED, "opt_d1_dinner"));
    assertThat(standing(List.of(), false, "2027-01-21T12:00:00+09:00"))
        .isEqualTo(new MealTally.Standing(ArrivalStatus.PASSED, null));
  }

  @Test
  void overdueIsTheNextMealsMissingAtEveryHour() {
    List<List<String>> plans =
        List.of(
            ALL,
            FROM_D2_DINNER,
            TWO_DINNERS,
            FIRST_NIGHT,
            List.of("opt_d1_worship"),
            List.of("opt_d2_lunch", "opt_d3_breakfast"),
            List.of("opt_d2_worship"));
    Instant from = Instant.parse("2027-01-22T06:00:00Z");
    for (int hour = 0; hour < 60; hour++) {
      Instant now = from.plusSeconds(hour * 1800L);
      List<MealTally.Person> people = new ArrayList<>();
      long overdue = 0;
      int cursor = MealTally.times(DAYS, Map.of(), now, SEOUL).cursor();
      for (List<String> plan : plans) {
        people.add(new MealTally.Person(plan, false));
        if (MealTally.standing(DAYS, plan, false, cursor).status() == ArrivalStatus.OVERDUE) {
          overdue++;
        }
      }
      MealTally.Result result = MealTally.count(DAYS, Map.of(), people, now, SEOUL);
      long missing = 0;
      for (MealCounts.Day day : result.days()) {
        for (MealCounts.Slot slot : day.slots()) {
          if (slot.slotId().equals(result.nextSlotId())) {
            missing = slot.missing();
          }
        }
      }
      assertThat(overdue).as(now.toString()).isEqualTo(missing);
      assertThat(MealTally.nextMeal(DAYS, cursor)).isEqualTo(result.nextSlotId());
    }
  }

  private static MealTally.Standing standing(List<String> attended, boolean arrived, String at) {
    int cursor =
        MealTally.times(DAYS, Map.of(), Instant.from(java.time.OffsetDateTime.parse(at)), SEOUL)
            .cursor();
    return MealTally.standing(DAYS, attended, arrived, cursor);
  }
}
