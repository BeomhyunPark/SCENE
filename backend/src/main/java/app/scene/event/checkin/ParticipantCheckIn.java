package app.scene.event.checkin;

import java.time.Instant;

/**
 * Participant's own check-in screen (api.md {@code GET /api/v1/participant/check-in}). {@code code}
 * is set only when {@code status} is {@code AVAILABLE}. No name, phone, or access key.
 */
public record ParticipantCheckIn(
    String status, String code, boolean checkedIn, Instant checkedInAt) {

  static final String AVAILABLE = "AVAILABLE";
  static final String NOT_STARTED = "NOT_STARTED";
  static final String ENDED = "ENDED";
  static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";
}
