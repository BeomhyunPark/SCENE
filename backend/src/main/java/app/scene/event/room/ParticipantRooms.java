package app.scene.event.room;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code GET /api/v1/participant/rooms} (api.md "숙소"). {@code myRoom} is set only for {@code
 * ASSIGNED}; its {@code members} only for scope {@code ALL} and {@code ROOMMATES}. {@code rooms} is
 * set for scope {@code ALL} once published. {@code notLodging} is whether the reader's own lodging
 * is {@code NOT_LODGING}. No participant id, phone, answer, night, slot or capacity anywhere.
 */
public record ParticipantRooms(
    String status,
    Instant publishedAt,
    String rosterScope,
    boolean notLodging,
    MyRoom myRoom,
    List<ListedRoom> rooms) {

  static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";
  static final String NOT_PUBLISHED = "NOT_PUBLISHED";
  static final String UNASSIGNED = "UNASSIGNED";
  static final String ASSIGNED = "ASSIGNED";

  public record MyRoom(
      UUID roomId, String name, String locationNote, String genderLabel, List<Mate> members) {}

  /** A roommate: these four keys only. */
  public record Mate(String name, String cohort, String gender, boolean me) {}

  public record ListedRoom(
      UUID roomId,
      String name,
      String locationNote,
      String genderLabel,
      List<ListedMember> members) {}

  /** A person in the room list: these two keys only. */
  public record ListedMember(String name, String cohort) {}
}
