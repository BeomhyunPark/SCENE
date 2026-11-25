package app.scene.event.room;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Stored content of one room publication (DEC-085, api.md "숙소"): rooms in board order with the ids
 * of their active members at publication time, by name then id. Room names and location notes are
 * kept as published; people are ids only (names are read at read time, DEC-072 §1).
 */
public record RoomSnapshot(List<SnapshotRoom> rooms) {

  public static final RoomSnapshot EMPTY = new RoomSnapshot(List.of());

  /** The room of each participant in the snapshot. */
  public Map<UUID, SnapshotRoom> placements() {
    Map<UUID, SnapshotRoom> out = new HashMap<>();
    for (SnapshotRoom room : rooms) {
      for (UUID id : room.memberIds()) {
        out.put(id, room);
      }
    }
    return out;
  }

  public record SnapshotRoom(
      UUID roomId,
      String name,
      String locationNote,
      Integer capacity,
      String genderOptionId,
      int sortOrder,
      List<UUID> memberIds) {}
}
