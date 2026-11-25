package app.scene.event.room;

import app.scene.event.room.mapper.RoomMapper;
import app.scene.event.room.param.RoomParam;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code rooms}, {@code room_assignments}, {@code room_boards}, {@code room_assignment_logs} and
 * {@code room_publications}, scoped by space and event. Writers hold the event row lock. January
 * reads and writes night 0 (the whole event) only.
 */
@Component
public class RoomRepository {

  static final String MOVE = "MOVE";
  static final String ROOM_DELETED = "ROOM_DELETED";
  static final String WITHDRAWN = "WITHDRAWN";

  private final RoomMapper rooms;
  private final JsonMapper json;

  public RoomRepository(RoomMapper rooms, JsonMapper json) {
    this.rooms = rooms;
    this.json = json;
  }

  /** 0 before the first change. */
  public long boardVersion(UUID spaceId, UUID eventId) {
    Long version = rooms.findBoardVersion(RoomParam.of(spaceId, eventId));
    return version == null ? 0 : version;
  }

  /** Adds 1 to the board version and returns the new value. */
  public long bumpBoardVersion(UUID spaceId, UUID eventId, Instant at) {
    return rooms.bumpBoardVersion(RoomParam.of(spaceId, eventId).at(at));
  }

  /** Every room of the event in board order. */
  public List<RoomRow> rooms(UUID spaceId, UUID eventId) {
    return rooms.findRooms(RoomParam.of(spaceId, eventId));
  }

  public Optional<RoomRow> find(UUID spaceId, UUID eventId, UUID roomId) {
    return rooms.findRooms(RoomParam.of(spaceId, eventId).room(roomId)).stream().findFirst();
  }

  /** Whether a room other than {@code exceptRoomId} has {@code name}. */
  public boolean nameTaken(UUID spaceId, UUID eventId, String name, UUID exceptRoomId) {
    return rooms.existsName(RoomParam.of(spaceId, eventId).name(name).room(exceptRoomId));
  }

  /** Adds a room at the end with version 0. */
  public void insert(
      UUID spaceId,
      UUID eventId,
      UUID roomId,
      String name,
      String locationNote,
      Integer capacity,
      String genderOptionId,
      UUID actorId,
      Instant at) {
    rooms.insertRoom(
        RoomParam.of(spaceId, eventId)
            .room(roomId)
            .values(name, locationNote, capacity, genderOptionId)
            .actor(actorId, at));
  }

  /** Stores the room's values and adds 1 to its version. */
  public void update(
      UUID spaceId,
      UUID eventId,
      UUID roomId,
      String name,
      String locationNote,
      Integer capacity,
      String genderOptionId,
      Instant at) {
    requireOne(
        rooms.updateRoom(
            RoomParam.of(spaceId, eventId)
                .room(roomId)
                .values(name, locationNote, capacity, genderOptionId)
                .at(at)));
  }

  public void sortOrder(UUID spaceId, UUID eventId, UUID roomId, int sortOrder, Instant at) {
    requireOne(
        rooms.updateSortOrder(
            RoomParam.of(spaceId, eventId).room(roomId).sortOrder(sortOrder).at(at)));
  }

  /** Every participant with an assignment row in the room, withdrawn participants included. */
  public List<UUID> memberIds(UUID spaceId, UUID eventId, UUID roomId) {
    return rooms.findRoomMemberIds(RoomParam.of(spaceId, eventId).room(roomId));
  }

  /** Removes the room's assignment rows, then the room. */
  public void delete(UUID spaceId, UUID eventId, UUID roomId) {
    RoomParam param = RoomParam.of(spaceId, eventId).room(roomId);
    rooms.deleteRoomAssignments(param);
    requireOne(rooms.deleteRoom(param));
  }

  /** The current GENDER question's config as JSON text, or null without such a question. */
  public String genderConfig(UUID spaceId, UUID eventId) {
    return rooms.findGenderConfig(RoomParam.of(spaceId, eventId));
  }

  /** Every participant of the event by name, then id, active or not. */
  public List<PersonRow> people(UUID spaceId, UUID eventId) {
    return rooms.findPeople(RoomParam.of(spaceId, eventId));
  }

  /** Participants of the event among {@code participantIds}. Unknown ids have no row. */
  public List<PersonRow> people(UUID spaceId, UUID eventId, List<UUID> participantIds) {
    if (participantIds.isEmpty()) {
      return List.of();
    }
    return rooms.findPeople(RoomParam.of(spaceId, eventId).participants(participantIds));
  }

  /** Active participants among {@code participantIds} by name, then id. */
  public List<MateRow> mates(UUID spaceId, UUID eventId, List<UUID> participantIds) {
    if (participantIds.isEmpty()) {
      return List.of();
    }
    return rooms.findMates(RoomParam.of(spaceId, eventId).participants(participantIds));
  }

  /** Puts the participant in {@code roomId} with {@code basis}, or unassigns on a null room. */
  public void assign(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID roomId,
      String basis,
      UUID actorId,
      Instant at) {
    RoomParam param =
        RoomParam.of(spaceId, eventId)
            .participant(participantId)
            .room(roomId)
            .basis(basis)
            .actor(actorId, at);
    if (roomId == null) {
      rooms.deleteAssignment(param);
    } else {
      rooms.upsertAssignment(param);
    }
  }

  /** One history row. {@code actorId} is null only for a withdraw by the participant. */
  public void log(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID fromRoomId,
      UUID toRoomId,
      String cause,
      UUID actorId,
      Instant at) {
    rooms.insertLog(
        RoomParam.of(spaceId, eventId)
            .participant(participantId)
            .log(UUID.randomUUID(), fromRoomId, toRoomId, cause)
            .actor(actorId, at));
  }

  public boolean published(UUID spaceId, UUID eventId) {
    return rooms.existsPublication(RoomParam.of(spaceId, eventId));
  }

  /**
   * The latest publication by insertion order, or empty before the first one. Members whose
   * assignment a withdraw removed after that publication are left out of the snapshot read back
   * (DEC-084 §3), so a restored person does not get the old room back from the old publication. The
   * stored row is unchanged.
   */
  public Optional<RoomPublication> latestPublication(UUID spaceId, UUID eventId) {
    PublicationRow row = rooms.findLatestPublication(RoomParam.of(spaceId, eventId));
    if (row == null) {
      return Optional.empty();
    }
    RoomSnapshot snapshot = json.readValue(row.snapshot(), RoomSnapshot.class);
    Set<UUID> removed =
        new HashSet<>(
            rooms.findWithdrawnSince(RoomParam.of(spaceId, eventId).at(row.publishedAt())));
    if (!removed.isEmpty()) {
      List<RoomSnapshot.SnapshotRoom> kept = new ArrayList<>();
      for (RoomSnapshot.SnapshotRoom room : snapshot.rooms()) {
        List<UUID> members = new ArrayList<>(room.memberIds());
        members.removeIf(removed::contains);
        kept.add(
            new RoomSnapshot.SnapshotRoom(
                room.roomId(),
                room.name(),
                room.locationNote(),
                room.capacity(),
                room.genderOptionId(),
                room.sortOrder(),
                members));
      }
      snapshot = new RoomSnapshot(kept);
    }
    return Optional.of(
        new RoomPublication(
            row.publicationId(),
            row.boardVersion(),
            row.publishedAt(),
            row.publishedByDisplayName(),
            snapshot));
  }

  public void insertPublication(
      UUID spaceId,
      UUID eventId,
      UUID publicationId,
      long boardVersion,
      RoomSnapshot snapshot,
      UUID actorId,
      Instant at) {
    rooms.insertPublication(
        RoomParam.of(spaceId, eventId)
            .publication(publicationId, boardVersion, json.writeValueAsString(snapshot))
            .actor(actorId, at));
  }

  private static void requireOne(int rows) {
    if (rows != 1) {
      throw new IllegalStateException("locked room row changed");
    }
  }
}
