package app.scene.event.checkin;

import app.scene.event.application.ArrivalRoster;
import app.scene.event.room.Lodging;
import java.time.Instant;
import java.util.UUID;

/**
 * Roster item. {@code phoneLast4} is null without {@code CHECKIN_WRITE}; reading it writes no
 * {@code CONTACT_VIEW}. The full phone is never here. {@code room} and {@code lodging} (G5 #460)
 * are the room of the latest room publication (null before it or when unassigned) and the lodging
 * state now. {@code arrival} (E4 #456) is the arrival standing and its due slot, null when the form
 * has no slot. {@code applicationId} is the latest SUBMITTED application, so every screen opens the
 * same 신청 상세 (I6 #348).
 */
public record RosterItem(
    UUID participantId,
    UUID applicationId,
    String name,
    String cohort,
    String phoneLast4,
    Brief checkIn,
    CheckInRoom room,
    Lodging lodging,
    ArrivalRoster.Arrival arrival) {

  public record Brief(
      UUID checkInId,
      String status,
      String method,
      Instant checkedInAt,
      String checkedInByDisplayName) {}
}
