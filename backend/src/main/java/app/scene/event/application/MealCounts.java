package app.scene.event.application;

import java.time.Instant;
import java.util.List;

/**
 * Meal counts for the operator 식수 현황 screen (#454, DEC-087). Numbers only: no name, phone or id.
 * {@code days} is empty when there is no setup or no meal slot. {@code nextSlotId} is the next meal
 * by the schedule times, or null when every slot has passed.
 */
public record MealCounts(
    String eventStatus,
    Instant asOf,
    String nextSlotId,
    long submitted,
    long checkedIn,
    Unknown unknown,
    List<Day> days) {

  /** Applicants whose attended slots are unknown; counted in no slot. */
  public record Unknown(long count, long arrived) {}

  public record Day(int day, String date, String label, List<Slot> slots) {}

  /**
   * One meal slot. {@code planned} = {@code arrived} + {@code coming} + {@code missing}; {@code
   * reflected} = {@code arrived} + {@code coming}. {@code startTime} is {@code HH:mm} in the event
   * zone, from the schedule item with this slot id when {@code timeFromSchedule}, otherwise the
   * default time of the meal.
   */
  public record Slot(
      String slotId,
      String meal,
      String label,
      String startTime,
      boolean timeFromSchedule,
      boolean passed,
      long planned,
      long arrived,
      long coming,
      long missing,
      long reflected) {}
}
