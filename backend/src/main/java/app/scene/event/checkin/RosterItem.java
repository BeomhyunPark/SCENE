package app.scene.event.checkin;

import java.time.Instant;
import java.util.UUID;

/**
 * Roster item. {@code phoneLast4} is null without {@code CHECKIN_WRITE}; reading it writes no
 * {@code CONTACT_VIEW}. The full phone is never here.
 */
public record RosterItem(
    UUID participantId, String name, String cohort, String phoneLast4, Brief checkIn) {

  public record Brief(
      UUID checkInId,
      String status,
      String method,
      Instant checkedInAt,
      String checkedInByDisplayName) {}
}
