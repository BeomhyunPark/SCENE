package app.scene.event.room;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The one read of "which room is this participant in" by the latest room publication (DEC-085 §10).
 * The group leader view uses it now; the application table, CSV and check-in roster (G5, #460) use
 * it next. The working copy is never read here. Callers drop participants who are not active;
 * people a withdraw removed after the publication are already left out.
 */
@Component
public class PublishedRooms {

  private final RoomRepository rooms;

  public PublishedRooms(RoomRepository rooms) {
    this.rooms = rooms;
  }

  /** A room as other screens show it. {@code roomId} is for screens that link to the room. */
  public record PublishedRoom(UUID roomId, String name, String locationNote) {}

  /** Rooms of the latest publication by participant id; empty before the first publication. */
  public record Placements(Instant publishedAt, Map<UUID, PublishedRoom> byParticipant) {

    static final Placements NONE = new Placements(null, Map.of());

    /** The participant's published room, or null. */
    public PublishedRoom of(UUID participantId) {
      return byParticipant.get(participantId);
    }
  }

  /** Whether the event has a room publication ({@code features.rooms}, DEC-080 §2). */
  public boolean exists(UUID spaceId, UUID eventId) {
    return rooms.published(spaceId, eventId);
  }

  /** Participant → room of the latest publication. One publication read. */
  public Placements placements(UUID spaceId, UUID eventId) {
    Optional<RoomPublication> latest = rooms.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return Placements.NONE;
    }
    Map<UUID, PublishedRoom> out = new HashMap<>();
    for (RoomSnapshot.SnapshotRoom room : latest.get().snapshot().rooms()) {
      PublishedRoom published = new PublishedRoom(room.roomId(), room.name(), room.locationNote());
      for (UUID id : room.memberIds()) {
        out.put(id, published);
      }
    }
    return new Placements(latest.get().publishedAt(), Collections.unmodifiableMap(out));
  }
}
