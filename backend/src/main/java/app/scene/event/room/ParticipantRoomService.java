package app.scene.event.room;

import app.scene.event.participant.ParticipantSelf;
import app.scene.event.participantsettings.ParticipantSettings;
import app.scene.event.participantsettings.ParticipantSettingsRepository;
import app.scene.event.room.ParticipantRooms.ListedMember;
import app.scene.event.room.ParticipantRooms.ListedRoom;
import app.scene.event.room.ParticipantRooms.Mate;
import app.scene.event.room.ParticipantRooms.MyRoom;
import app.scene.event.room.RoomSnapshot.SnapshotRoom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in participant's room in the latest room publication (api.md "숙소", DEC-085). Reads
 * only the session's event and participant and only the latest publication; the event state does
 * not matter. A participant without a SUBMITTED application is {@code NOT_ELIGIBLE} before anything
 * else. People who are not active any more drop out of every list. What is shown of roommates and
 * other rooms follows {@code roomRosterScope}. Reads write no audit row.
 */
@Service
public class ParticipantRoomService {

  private final RoomRepository rooms;
  private final RoomService board;
  private final ParticipantSettingsRepository settings;

  public ParticipantRoomService(
      RoomRepository rooms, RoomService board, ParticipantSettingsRepository settings) {
    this.rooms = rooms;
    this.board = board;
    this.settings = settings;
  }

  @Transactional(readOnly = true)
  public ParticipantRooms current(ParticipantSelf self) {
    UUID spaceId = self.spaceId();
    UUID eventId = self.eventId();
    UUID selfId = self.participantId();
    PersonRow me =
        rooms.people(spaceId, eventId, List.of(selfId)).stream().findFirst().orElse(null);
    String scope = settings.roomRosterScope(spaceId, eventId);
    if (me == null || !me.submitted()) {
      return new ParticipantRooms(ParticipantRooms.NOT_ELIGIBLE, null, scope, false, null, null);
    }
    RoomService.Context context = board.context(spaceId, eventId);
    boolean notLodging = board.facts(me, context).lodging() == Lodging.NOT_LODGING;
    Optional<RoomPublication> latest = rooms.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return new ParticipantRooms(
          ParticipantRooms.NOT_PUBLISHED, null, scope, notLodging, null, null);
    }
    RoomPublication publication = latest.get();
    SnapshotRoom mine = publication.snapshot().placements().get(selfId);
    boolean all = ParticipantSettings.ROOM_SCOPE_ALL.equals(scope);
    boolean roommates = all || ParticipantSettings.ROOM_SCOPE_ROOMMATES.equals(scope);

    Set<UUID> wanted = new LinkedHashSet<>();
    if (all) {
      publication.snapshot().rooms().forEach(room -> wanted.addAll(room.memberIds()));
    } else if (mine != null && roommates) {
      wanted.addAll(mine.memberIds());
    }
    Map<UUID, MateRow> current = new HashMap<>();
    for (MateRow row : rooms.mates(spaceId, eventId, new ArrayList<>(wanted))) {
      current.put(row.participantId(), row);
    }

    List<ListedRoom> listed = null;
    if (all) {
      listed = new ArrayList<>();
      for (SnapshotRoom room : publication.snapshot().rooms()) {
        List<ListedMember> members = new ArrayList<>();
        for (MateRow row : activeMembers(room, current)) {
          members.add(new ListedMember(row.name(), row.cohort()));
        }
        listed.add(
            new ListedRoom(
                room.roomId(),
                room.name(),
                room.locationNote(),
                context.genderLabel(room.genderOptionId()),
                members));
      }
    }
    if (mine == null) {
      return new ParticipantRooms(
          ParticipantRooms.UNASSIGNED, publication.publishedAt(), scope, notLodging, null, listed);
    }
    List<Mate> mates = null;
    if (roommates) {
      mates = new ArrayList<>();
      for (MateRow row : activeMembers(mine, current)) {
        mates.add(
            new Mate(
                row.name(), row.cohort(), row.genderLabel(), row.participantId().equals(selfId)));
      }
    }
    return new ParticipantRooms(
        ParticipantRooms.ASSIGNED,
        publication.publishedAt(),
        scope,
        notLodging,
        new MyRoom(
            mine.roomId(),
            mine.name(),
            mine.locationNote(),
            context.genderLabel(mine.genderOptionId()),
            mates),
        listed);
  }

  /** Active members of the room by name, then id (the snapshot keeps that order). */
  private static List<MateRow> activeMembers(SnapshotRoom room, Map<UUID, MateRow> current) {
    List<MateRow> out = new ArrayList<>();
    for (UUID id : room.memberIds()) {
      MateRow row = current.get(id);
      if (row != null) {
        out.add(row);
      }
    }
    out.sort(java.util.Comparator.comparing(MateRow::name).thenComparing(MateRow::participantId));
    return out;
  }
}
