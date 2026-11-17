package app.scene.event.checkin;

/** {@code total} counts participants with a SUBMITTED application. A cancelled check-in is open. */
public record CheckInSummary(String eventStatus, long total, long checkedIn, long notCheckedIn) {}
