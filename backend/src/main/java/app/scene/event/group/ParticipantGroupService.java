package app.scene.event.group;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.MemberApplicationReader;
import app.scene.event.application.MemberApplicationReader.MemberApplication;
import app.scene.event.form.FormSetup;
import app.scene.event.form.MealSlots;
import app.scene.event.group.ParticipantGroup.Attendance;
import app.scene.event.group.ParticipantGroup.CheckInState;
import app.scene.event.group.ParticipantGroup.LeaderMember;
import app.scene.event.group.ParticipantGroup.LeaderName;
import app.scene.event.group.ParticipantGroup.LeaderView;
import app.scene.event.group.ParticipantGroup.Mate;
import app.scene.event.group.ParticipantGroup.MyGroup;
import app.scene.event.group.Snapshot.Placement;
import app.scene.event.group.Snapshot.SnapshotMember;
import app.scene.event.participant.ParticipantSelf;
import app.scene.event.participantsettings.ParticipantSettingsRepository;
import app.scene.event.privacy.PrivacyLogs;
import app.scene.event.room.PublishedRooms;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The signed-in participant's group in the latest publication (#300, DEC-072, DEC-083, #452). Reads
 * only the session's event and participant and only the latest publication; the event state does
 * not matter. A participant without a SUBMITTED application is {@code NOT_ELIGIBLE} before anything
 * else. Members who are not active any more drop out of every read.
 *
 * <ul>
 *   <li>Everyone in a group sees the group name, the leaders' names, and the publication time.
 *   <li>Members see the roster (name, 또래, gender, leader and "me" marks) while the event switch
 *       {@code groupRosterVisibleToMembers} is on; a leader always does.
 *   <li>A leader also gets {@code leaderView} (check-in, attendance, lodging nights, revision time)
 *       and may open one member's detail, the only place that carries a phone. A detail with a
 *       phone writes one {@code privacy_logs} row in the same transaction.
 * </ul>
 *
 * Reads write no audit row.
 */
@Service
public class ParticipantGroupService {

  private static final String PHONE_FIELD = "phone";

  private final GroupRepository groups;
  private final GroupService board;
  private final ParticipantSettingsRepository settings;
  private final MemberApplicationReader applications;
  private final PrivacyLogs privacyLogs;
  private final PublishedRooms rooms;
  private final JsonMapper json;

  public ParticipantGroupService(
      GroupRepository groups,
      GroupService board,
      ParticipantSettingsRepository settings,
      MemberApplicationReader applications,
      PrivacyLogs privacyLogs,
      PublishedRooms rooms,
      JsonMapper json) {
    this.groups = groups;
    this.board = board;
    this.settings = settings;
    this.applications = applications;
    this.privacyLogs = privacyLogs;
    this.rooms = rooms;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public ParticipantGroup current(ParticipantSelf self) {
    UUID spaceId = self.spaceId();
    UUID eventId = self.eventId();
    UUID selfId = self.participantId();
    if (groups.active(spaceId, eventId, List.of(selfId)).isEmpty()) {
      return ParticipantGroup.empty(ParticipantGroup.NOT_ELIGIBLE, null);
    }
    Optional<Publication> latest = groups.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return ParticipantGroup.empty(ParticipantGroup.NOT_PUBLISHED, null);
    }
    Publication publication = latest.get();
    Placement mine = publication.snapshot().placements().get(selfId);
    if (mine == null) {
      return ParticipantGroup.empty(ParticipantGroup.UNASSIGNED, publication.publishedAt());
    }

    List<Member> members = activeMembers(spaceId, eventId, mine);
    List<LeaderName> leaders = new ArrayList<>();
    for (Member member : members) {
      if (member.leader()) {
        leaders.add(new LeaderName(member.row().name()));
      }
    }
    boolean rosterVisible = mine.leader() || settings.groupRosterVisibleToMembers(spaceId, eventId);
    List<Mate> mates = null;
    if (rosterVisible) {
      mates = new ArrayList<>();
      for (Member member : members) {
        mates.add(
            new Mate(
                member.row().name(),
                member.row().cohort(),
                member.row().genderLabel(),
                member.leader(),
                member.row().participantId().equals(selfId)));
      }
    }
    LeaderView leaderView = mine.leader() ? leaderView(spaceId, eventId, members) : null;
    return new ParticipantGroup(
        ParticipantGroup.ASSIGNED,
        publication.publishedAt(),
        new MyGroup(mine.group().name(), leaders),
        mine.leader(),
        rosterVisible,
        mates,
        leaderView);
  }

  /**
   * One member's detail for the leader of their group in the latest publication. Every other case
   * (not a leader, another group, unknown or malformed id, a member who withdrew, no publication)
   * is the same 404.
   */
  @Transactional
  public ParticipantGroupMember member(ParticipantSelf self, String rawParticipantId) {
    UUID spaceId = self.spaceId();
    UUID eventId = self.eventId();
    UUID targetId = uuid(rawParticipantId);
    if (targetId == null
        || groups.active(spaceId, eventId, List.of(self.participantId())).isEmpty()) {
      throw notFound();
    }
    Publication publication =
        groups.latestPublication(spaceId, eventId).orElseThrow(this::notFound);
    Map<UUID, Placement> placements = publication.snapshot().placements();
    Placement mine = placements.get(self.participantId());
    Placement theirs = placements.get(targetId);
    if (mine == null
        || !mine.leader()
        || theirs == null
        || !theirs.group().groupId().equals(mine.group().groupId())) {
      throw notFound();
    }
    List<MemberRow> rows = groups.memberRows(spaceId, eventId, List.of(targetId));
    if (rows.isEmpty()) {
      throw notFound();
    }
    MemberRow row = rows.get(0);
    MemberApplication application =
        applications.read(spaceId, eventId, targetId).orElseThrow(this::notFound);

    List<String> phoneFields = new ArrayList<>();
    boolean phone = row.phone() != null && !row.phone().isBlank();
    if (phone) {
      phoneFields.add(PHONE_FIELD);
    }
    for (UUID fieldId : application.phoneFieldIds()) {
      phoneFields.add(fieldId.toString());
    }
    if (!phoneFields.isEmpty()) {
      ObjectNode detail = json.createObjectNode();
      detail.put("groupPublicationId", publication.publicationId().toString());
      var fields = detail.putArray("fields");
      phoneFields.forEach(fields::add);
      privacyLogs.participantContactView(
          spaceId,
          eventId,
          self.participantId(),
          targetId,
          PrivacyLogs.PARTICIPANT_GROUP_MEMBER,
          detail);
    }

    JsonNode setup = board.setup(spaceId, eventId);
    List<MealSlots.Day> days = board.slotDays(spaceId, eventId, setup);
    List<ParticipantGroupMember.Answer> answers = new ArrayList<>();
    for (MemberApplicationReader.Answer answer : application.answers()) {
      answers.add(
          new ParticipantGroupMember.Answer(
              answer.fieldId(),
              answer.presetKey(),
              answer.label(),
              answer.type(),
              answer.display(),
              answer.value(),
              answer.operatorEdited()));
    }
    return new ParticipantGroupMember(
        targetId,
        row.name(),
        row.cohort(),
        row.genderLabel(),
        theirs.leader(),
        phone ? row.phone() : null,
        checkIn(row),
        attendance(row, setup, days),
        room(rooms.placements(spaceId, eventId).of(targetId)),
        new ParticipantGroupMember.Application(
            application.submittedAt(),
            application.revisedAt(),
            application.revisedByOperator(),
            answers));
  }

  private record Member(MemberRow row, boolean leader) {}

  /** Active members of the placement's group in the publication's (operator's) order. */
  private List<Member> activeMembers(UUID spaceId, UUID eventId, Placement placement) {
    List<UUID> ids = new ArrayList<>();
    for (SnapshotMember member : placement.group().members()) {
      ids.add(member.participantId());
    }
    Map<UUID, MemberRow> current = new HashMap<>();
    for (MemberRow row : groups.memberRows(spaceId, eventId, ids)) {
      current.put(row.participantId(), row);
    }
    List<Member> members = new ArrayList<>();
    for (SnapshotMember member : placement.group().members()) {
      MemberRow row = current.get(member.participantId());
      if (row != null) {
        members.add(new Member(row, member.leader()));
      }
    }
    return members;
  }

  private LeaderView leaderView(UUID spaceId, UUID eventId, List<Member> members) {
    JsonNode setup = board.setup(spaceId, eventId);
    List<MealSlots.Day> days = board.slotDays(spaceId, eventId, setup);
    List<LeaderMember> out = new ArrayList<>();
    PublishedRooms.Placements placements = rooms.placements(spaceId, eventId);
    long checkedIn = 0;
    for (Member member : members) {
      MemberRow row = member.row();
      if (row.checkedIn()) {
        checkedIn++;
      }
      out.add(
          new LeaderMember(
              row.participantId(),
              row.name(),
              row.cohort(),
              row.genderLabel(),
              member.leader(),
              checkIn(row),
              attendance(row, setup, days),
              room(placements.of(row.participantId())),
              revisedAt(row)));
    }
    return new LeaderView(members.size(), checkedIn, GroupService.slots(days), out);
  }

  /**
   * The member's room in the latest room publication, whatever {@code roomRosterScope} says
   * (DEC-085 §10): name and location note only, null before publication or without a room.
   */
  private static ParticipantGroup.Room room(PublishedRooms.PublishedRoom room) {
    return room == null ? null : new ParticipantGroup.Room(room.name(), room.locationNote());
  }

  private static CheckInState checkIn(MemberRow row) {
    return new CheckInState(row.checkedIn(), row.checkedIn() ? row.checkedInAt() : null);
  }

  /** When the current revision was stored, or null while it is the first submit. */
  private static java.time.Instant revisedAt(MemberRow row) {
    return row.revision() > 1 ? row.revisionAt() : null;
  }

  private Attendance attendance(MemberRow row, JsonNode setup, List<MealSlots.Day> days) {
    String type = GroupService.attendance(row.attendanceAsked(), row.attendanceOptionId());
    JsonNode arrival = tree(row.arrivalAnswer());
    JsonNode departure = tree(row.departureAnswer());
    MealSlots.Answers slotAnswers =
        new MealSlots.Answers(tree(row.mealsAnswer()), arrival, departure);
    boolean range = MealSlots.mode(setup) == FormSetup.Mode.RANGE && MealSlots.PARTIAL.equals(type);
    return new Attendance(
        type,
        range ? optionId(arrival) : null,
        range ? optionId(departure) : null,
        days.isEmpty() ? null : MealSlots.attended(setup, days, type, slotAnswers),
        MealSlots.lodgingNights(
            setup,
            type,
            slotAnswers,
            new MealSlots.LodgingAnswers(
                row.lodgingAsked(), tree(row.lodgingAnswer()), tree(row.noLodgingAnswer()))));
  }

  private static String optionId(JsonNode answer) {
    return answer != null && answer.path("optionId").isString()
        ? answer.get("optionId").asString()
        : null;
  }

  private JsonNode tree(String text) {
    return text == null ? null : json.readTree(text);
  }

  private static UUID uuid(String raw) {
    if (raw == null || raw.length() != 36) {
      return null;
    }
    try {
      return UUID.fromString(raw);
    } catch (IllegalArgumentException exception) {
      return null;
    }
  }

  private SceneException notFound() {
    return new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
  }
}
