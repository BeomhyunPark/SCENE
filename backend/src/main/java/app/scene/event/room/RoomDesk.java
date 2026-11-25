package app.scene.event.room;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The room as the front desk and the 참가 현황 table show it (G5 #460, DEC-085 §10): the room of the
 * latest publication from {@link PublishedRooms#placements} and the participant's lodging state now
 * ({@link Lodging}, the board's rule), so a blank room can say "숙박 안 함". The working copy is never
 * read. One publication read and one people read per call.
 */
@Component
public class RoomDesk {

  private final PublishedRooms published;
  private final RoomRepository rooms;
  private final RoomService board;

  public RoomDesk(PublishedRooms published, RoomRepository rooms, RoomService board) {
    this.published = published;
    this.rooms = rooms;
    this.board = board;
  }

  /** One participant: the published room or null, and the lodging state now. */
  public record Stay(PublishedRooms.PublishedRoom room, Lodging lodging) {

    static final Stay NONE = new Stay(null, Lodging.UNKNOWN);

    /** The room name, or null. */
    public String roomName() {
      return room == null ? null : room.name();
    }
  }

  /**
   * Stays by participant id. {@code publishedAt} is the latest room publication's time, or null
   * before the first one; then every room is null.
   */
  public record Stays(Instant publishedAt, Map<UUID, Stay> byParticipant) {

    /** The participant's stay; an unknown id has no room and an unknown lodging state. */
    public Stay of(UUID participantId) {
      return participantId == null
          ? Stay.NONE
          : byParticipant.getOrDefault(participantId, Stay.NONE);
    }
  }

  /** Every participant of the event. */
  public Stays all(UUID spaceId, UUID eventId) {
    return stays(spaceId, eventId, rooms.people(spaceId, eventId));
  }

  /** Only {@code participantIds}, for a roster page or one check-in. */
  public Stays of(UUID spaceId, UUID eventId, Collection<UUID> participantIds) {
    return stays(spaceId, eventId, rooms.people(spaceId, eventId, List.copyOf(participantIds)));
  }

  private Stays stays(UUID spaceId, UUID eventId, List<PersonRow> people) {
    PublishedRooms.Placements placements = published.placements(spaceId, eventId);
    Map<UUID, Stay> out = new HashMap<>();
    if (!people.isEmpty()) {
      RoomService.Context context = board.context(spaceId, eventId);
      for (RoomService.Facts person : board.facts(people, context)) {
        UUID id = person.row().participantId();
        out.put(id, new Stay(placements.of(id), person.lodging()));
      }
    }
    return new Stays(placements.publishedAt(), out);
  }
}
