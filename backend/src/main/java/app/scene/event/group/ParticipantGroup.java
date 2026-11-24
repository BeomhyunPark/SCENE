package app.scene.event.group;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code GET /api/v1/participant/group} (DEC-072 §6, DEC-083). {@code group} is set only for {@code
 * ASSIGNED}. {@code rosterVisible} is whether this reader sees the roster: always for a leader of
 * the group in the latest publication, the event switch for other members, false unless {@code
 * ASSIGNED}. {@code members} is set only when {@code rosterVisible}. {@code leaderView} is set only
 * for a leader. No phone anywhere in this response.
 */
public record ParticipantGroup(
    String status,
    Instant publishedAt,
    MyGroup group,
    boolean leader,
    boolean rosterVisible,
    List<Mate> members,
    LeaderView leaderView) {

  static final String NOT_PUBLISHED = "NOT_PUBLISHED";
  static final String UNASSIGNED = "UNASSIGNED";
  static final String ASSIGNED = "ASSIGNED";
  static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";

  static ParticipantGroup empty(String status, Instant publishedAt) {
    return new ParticipantGroup(status, publishedAt, null, false, false, null, null);
  }

  public record MyGroup(String name, List<LeaderName> leaders) {}

  public record LeaderName(String name) {}

  /** A roster entry: these five keys only (DEC-083 §1). */
  public record Mate(String name, String cohort, String gender, boolean leader, boolean me) {}

  /**
   * What a leader sees of their group. {@code slots} is the group board's slot list, or null when
   * the form has no setup.
   */
  public record LeaderView(
      long activeCount, long checkedInCount, List<BoardSlot> slots, List<LeaderMember> members) {}

  /** One member in the leader view. {@code room} is null until rooms (G1). */
  public record LeaderMember(
      UUID participantId,
      String name,
      String cohort,
      String gender,
      boolean leader,
      CheckInState checkIn,
      Attendance attendance,
      Room room,
      Instant applicationRevisedAt) {}

  /** The same meaning as the participant check-in screen's {@code checkedIn} and time. */
  public record CheckInState(boolean checkedIn, Instant checkedInAt) {}

  /**
   * {@code type} is FULL, PARTIAL or WORSHIP_ONLY. {@code arrivalSlotId} and {@code
   * departureSlotId} are set only for a RANGE-mode partial attendee. {@code slotIds} follow the
   * group board (null is unknown or no slots). {@code lodgingNights} are night numbers from 1, an
   * empty list for no night, and null when unknown.
   */
  public record Attendance(
      String type,
      String arrivalSlotId,
      String departureSlotId,
      List<String> slotIds,
      List<Integer> lodgingNights) {}

  /** A room after G1. */
  public record Room(String name, String locationNote) {}
}
