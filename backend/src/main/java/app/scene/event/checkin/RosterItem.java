package app.scene.event.checkin;

import app.scene.event.application.ArrivalRoster;
import java.time.Instant;
import java.util.UUID;

/**
 * Roster item. {@code phoneLast4} is null without {@code CHECKIN_WRITE}; reading it writes no
 * {@code CONTACT_VIEW}. The full phone is never here. {@code arrival} (E4 #456) is the arrival
 * standing and its due slot, null when the form has no slot.
 */
public record RosterItem(
    UUID participantId,
    String name,
    String cohort,
    String phoneLast4,
    Brief checkIn,
    ArrivalRoster.Arrival arrival) {

  public record Brief(
      UUID checkInId,
      String status,
      String method,
      Instant checkedInAt,
      String checkedInByDisplayName) {}
}
