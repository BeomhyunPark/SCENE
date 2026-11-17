package app.scene.event.checkin;

import java.time.Instant;
import java.util.UUID;

/**
 * Check-in object of api.md. Also the stored row joined with operator display names. Operator
 * references are {@code users.id} and the display name only (DEC-060).
 */
public record CheckIn(
    UUID checkInId,
    UUID participantId,
    String status,
    String method,
    Instant checkedInAt,
    UUID checkedInByUserId,
    String checkedInByDisplayName,
    Instant cancelledAt,
    UUID cancelledByUserId,
    String cancelledByDisplayName,
    String cancelReason) {

  static final String CHECKED_IN = "CHECKED_IN";
  static final String CANCELLED = "CANCELLED";

  boolean checkedIn() {
    return CHECKED_IN.equals(status);
  }
}
