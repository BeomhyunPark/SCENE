package app.scene.event.checkin;

import java.time.Instant;
import java.util.UUID;

/**
 * Roster item. {@code phoneLast4} is null without {@code CHECKIN_WRITE}; reading it writes no
 * {@code CONTACT_VIEW}. The full phone is never here. {@code applicationId} is the latest SUBMITTED
 * application, so the screen can open its detail.
 */
public record RosterItem(
    UUID participantId,
    UUID applicationId,
    String name,
    String cohort,
    String phoneLast4,
    Brief checkIn) {

  public record Brief(
      UUID checkInId,
      String status,
      String method,
      Instant checkedInAt,
      String checkedInByDisplayName) {}
}
