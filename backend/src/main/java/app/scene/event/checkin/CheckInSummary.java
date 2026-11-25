package app.scene.event.checkin;

import app.scene.event.application.ArrivalRoster;
import java.time.Instant;

/**
 * {@code total} counts participants with a SUBMITTED application. A cancelled check-in is open.
 * {@code arrival} (E4 #456) is null when the form has no slot; otherwise the not-checked-in people
 * by standing at {@code asOf}. {@code overdue} equals the meal counts' {@code missing} for {@code
 * nextMeal}, and {@code overdue + coming + passed + unknown = notCheckedIn}.
 */
public record CheckInSummary(
    String eventStatus, long total, long checkedIn, long notCheckedIn, Arrival arrival) {

  public record Arrival(
      Instant asOf,
      ArrivalRoster.Slot nextMeal,
      long overdue,
      long coming,
      long passed,
      long unknown) {}
}
