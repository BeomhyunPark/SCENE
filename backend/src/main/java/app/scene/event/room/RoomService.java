package app.scene.event.room;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.form.MealSlots;
import app.scene.event.group.ActiveParticipant;
import app.scene.event.group.GroupRepository;
import app.scene.event.group.GroupService;
import app.scene.event.group.Publication;
import app.scene.event.group.Snapshot;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
import app.scene.event.room.RoomSnapshot.SnapshotRoom;
import app.scene.event.room.RoomViews.Assigned;
import app.scene.event.room.RoomViews.Board;
import app.scene.event.room.RoomViews.BoardGroup;
import app.scene.event.room.RoomViews.BoardPerson;
import app.scene.event.room.RoomViews.BoardRoom;
import app.scene.event.room.RoomViews.BoardVersion;
import app.scene.event.room.RoomViews.Gender;
import app.scene.event.room.RoomViews.GroupRef;
import app.scene.event.room.RoomViews.PublicationSummary;
import app.scene.event.room.RoomViews.PublishResult;
import app.scene.event.room.RoomViews.Published;
import app.scene.event.room.RoomViews.RoomDeleted;
import app.scene.event.room.RoomViews.RoomState;
import app.scene.event.room.RoomViews.RoomWritten;
import app.scene.event.room.RoomViews.Warning;
import app.scene.event.room.RoomViews.Withdrawn;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Room working copy and publication (#457, DEC-085, api.md "숙소"). The board read needs effective
 * {@code ROOM_WRITE} or an active space owner or admin; the published read needs effective {@code
 * EVENT_READ} or an active space owner or admin; every write and the publication need effective
 * {@code ROOM_WRITE}. Writes run 404 → 403 → 400 → 409 state → 404 target → 409 version or conflict
 * → 409 rule → result, and lock the event row, so writes of one event commit one after another.
 *
 * <p>Capacity and gender are never blocked; they come back as warnings. A participant whose lodging
 * is {@code NOT_LODGING} cannot be put in a room (user decision 2026-11-20); taking them out is
 * allowed, and someone who dropped lodging after being assigned stays and is confirmed on publish.
 * Edits go to {@code room_assignment_logs}, not to audit; a publication writes audit {@code
 * ROOMS_PUBLISHED}, raises {@code participant_feed_versions.rooms} and makes {@code ROOM_PUBLISHED}
 * notifications in the same transaction. Names, phones and answers never go to history or logs.
 */
@Service
public class RoomService {

  public static final int NAME_MAX = 50;
  public static final int LOCATION_NOTE_MAX = 100;
  public static final int CAPACITY_MAX = 50;
  public static final int ROOMS_MAX = 200;
  public static final int CHANGES_MAX = 200;

  static final String ROOM_PUBLISHED = "ROOM_PUBLISHED";
  static final String TARGET_ROOM = "ROOM";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final RoomRepository rooms;
  private final GroupRepository groups;
  private final GroupService groupBoard;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final ParticipantFeedVersions feedVersions;
  private final Notifications notifications;
  private final JsonMapper json;
  private final Clock clock;

  public RoomService(
      EventAccessGate gate,
      EventRepository events,
      RoomRepository rooms,
      GroupRepository groups,
      GroupService groupBoard,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      ParticipantFeedVersions feedVersions,
      Notifications notifications,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.rooms = rooms;
    this.groups = groups;
    this.groupBoard = groupBoard;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.feedVersions = feedVersions;
    this.notifications = notifications;
    this.json = json;
    this.clock = clock;
  }

  // ---- reads ----

  @Transactional(readOnly = true)
  public Board board(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.ROOM_WRITE) && !opened.membership().seesEveryEvent()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    EventRow event =
        events
            .find(spaceId, eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    Context context = context(spaceId, eventId);
    List<RoomRow> list = rooms.rooms(spaceId, eventId);
    List<Facts> people = facts(rooms.people(spaceId, eventId), context);
    List<Facts> active = people.stream().filter(f -> f.row().submitted()).toList();
    Optional<RoomPublication> latest = rooms.latestPublication(spaceId, eventId);
    RoomSnapshot snapshot = latest.map(RoomPublication::snapshot).orElse(RoomSnapshot.EMPTY);
    Map<UUID, SnapshotRoom> placements = snapshot.placements();

    Optional<Publication> groupPublication = groups.latestPublication(spaceId, eventId);
    Map<UUID, Snapshot.Placement> groupPlacements =
        groupPublication.map(p -> p.snapshot().placements()).orElse(Map.of());
    Map<UUID, UUID> draftGroups = new HashMap<>();
    if (allows(opened, actorId, Permission.GROUP_WRITE)) {
      for (ActiveParticipant participant : groups.active(spaceId, eventId)) {
        if (participant.groupId() != null) {
          draftGroups.put(participant.participantId(), participant.groupId());
        }
      }
    }

    List<BoardPerson> participants = new ArrayList<>();
    for (Facts person : active) {
      PersonRow row = person.row();
      Snapshot.Placement group = groupPlacements.get(row.participantId());
      SnapshotRoom published = placements.get(row.participantId());
      participants.add(
          new BoardPerson(
              row.participantId(),
              row.name(),
              row.cohort(),
              row.genderOptionId() == null
                  ? null
                  : new Gender(row.genderOptionId(), row.genderLabel()),
              person.attendance(),
              person.slotIds(),
              person.lodging(),
              person.nights(),
              group == null ? null : new GroupRef(group.group().groupId(), group.group().name()),
              draftGroups.get(row.participantId()),
              row.roomId(),
              published == null ? null : published.roomId(),
              null));
    }
    List<Withdrawn> withdrawn = new ArrayList<>();
    for (Facts person : people) {
      if (!person.row().submitted() && person.row().roomId() != null) {
        withdrawn.add(
            new Withdrawn(
                person.row().participantId(), person.row().name(), person.row().roomId()));
      }
    }
    Counts counts = Counts.of(active);
    Diff diff = Diff.of(list, active, snapshot);
    PublicationSummary publication =
        new PublicationSummary(
            latest.map(RoomPublication::publishedAt).orElse(null),
            latest.map(RoomPublication::publishedByDisplayName).orElse(null),
            latest.map(RoomPublication::boardVersion).orElse(null),
            active.size(),
            counts.eligible(),
            counts.assigned(),
            counts.unassigned(),
            counts.notLodgingAssigned(),
            diff.changedParticipants(),
            diff.roomChanges(),
            diff.any());
    List<BoardGroup> boardGroups = new ArrayList<>();
    groupPublication.ifPresent(
        p ->
            p.snapshot()
                .groups()
                .forEach(
                    g -> boardGroups.add(new BoardGroup(g.groupId(), g.name(), g.sortOrder()))));
    return new Board(
        event.lifecycleStatus(),
        rooms.boardVersion(spaceId, eventId),
        boardRooms(list, active, context),
        participants,
        withdrawn,
        publication,
        boardGroups,
        GroupService.slots(context.days()));
  }

  /**
   * The latest publication for operators (front desk and print). Not blocked by the event state.
   * Withdrawn people drop out; active people not in the publication who sleep over or are unknown
   * are {@code unassigned}.
   */
  @Transactional(readOnly = true)
  public Published published(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_READ) && !opened.membership().seesEveryEvent()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    Optional<RoomPublication> latest = rooms.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return new Published(null, List.of(), List.of());
    }
    Context context = context(spaceId, eventId);
    Map<UUID, Facts> active = new LinkedHashMap<>();
    for (Facts person : facts(rooms.people(spaceId, eventId), context)) {
      if (person.row().submitted()) {
        active.put(person.row().participantId(), person);
      }
    }
    Set<UUID> placed = new HashSet<>();
    List<RoomViews.PublishedRoom> out = new ArrayList<>();
    for (SnapshotRoom room : latest.get().snapshot().rooms()) {
      List<RoomViews.PublishedMember> members = new ArrayList<>();
      for (UUID id : room.memberIds()) {
        Facts person = active.get(id);
        if (person != null) {
          placed.add(id);
          members.add(
              new RoomViews.PublishedMember(id, person.row().name(), person.row().cohort()));
        }
      }
      out.add(
          new RoomViews.PublishedRoom(
              room.roomId(),
              room.name(),
              room.locationNote(),
              room.capacity(),
              context.gender(room.genderOptionId()),
              members));
    }
    List<RoomViews.PublishedUnassigned> unassigned = new ArrayList<>();
    for (Facts person : active.values()) {
      if (!placed.contains(person.row().participantId())
          && person.lodging() != Lodging.NOT_LODGING) {
        unassigned.add(
            new RoomViews.PublishedUnassigned(
                person.row().participantId(),
                person.row().name(),
                person.row().cohort(),
                person.lodging()));
      }
    }
    return new Published(latest.get().publishedAt(), out, unassigned);
  }

  // ---- rooms ----

  @Transactional
  public RoomWritten create(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    if (body == null || !body.isObject()) {
      throw invalid("name");
    }
    String name = requiredName(body.get("name"));
    String note = body.has("locationNote") ? locationNote(body.get("locationNote")) : null;
    Integer capacity = body.has("capacity") ? capacity(body.get("capacity")) : null;
    String gender = body.has("genderOptionId") ? genderOptionId(spaceId, eventId, body) : null;
    lockWritable(spaceId, eventId);

    if (rooms.rooms(spaceId, eventId).size() >= ROOMS_MAX) {
      throw new SceneException(ErrorCode.CONFLICT, Map.of("reason", "ROOM_LIMIT"));
    }
    if (rooms.nameTaken(spaceId, eventId, name, null)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    Instant now = now();
    UUID roomId = UUID.randomUUID();
    rooms.insert(spaceId, eventId, roomId, name, note, capacity, gender, actorId, now);
    long boardVersion = rooms.bumpBoardVersion(spaceId, eventId, now);
    return new RoomWritten(boardRoom(spaceId, eventId, roomId), boardVersion);
  }

  /**
   * Changes the given fields; a key left out keeps its value and {@code null} clears it ({@code
   * name} cannot be cleared). The same values change nothing.
   */
  @Transactional
  public RoomWritten update(UUID actorId, UUID eventId, UUID roomId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    if (body == null || !body.isObject()) {
      throw invalid("expectedVersion");
    }
    String name = body.has("name") ? requiredName(body.get("name")) : null;
    boolean noteGiven = body.has("locationNote");
    String note = noteGiven ? locationNote(body.get("locationNote")) : null;
    boolean capacityGiven = body.has("capacity");
    Integer capacity = capacityGiven ? capacity(body.get("capacity")) : null;
    boolean genderGiven = body.has("genderOptionId");
    String gender = genderGiven ? genderOptionId(spaceId, eventId, body) : null;
    int expectedVersion = requiredVersion(body.get("expectedVersion"));
    lockWritable(spaceId, eventId);

    RoomRow room = target(spaceId, eventId, roomId);
    requireVersion(room, expectedVersion);
    String nextName = name == null ? room.name() : name;
    String nextNote = noteGiven ? note : room.locationNote();
    Integer nextCapacity = capacityGiven ? capacity : room.capacity();
    String nextGender = genderGiven ? gender : room.genderOptionId();
    if (nextName.equals(room.name())
        && Objects.equals(nextNote, room.locationNote())
        && Objects.equals(nextCapacity, room.capacity())
        && Objects.equals(nextGender, room.genderOptionId())) {
      return new RoomWritten(
          boardRoom(spaceId, eventId, roomId), rooms.boardVersion(spaceId, eventId));
    }
    if (!nextName.equals(room.name()) && rooms.nameTaken(spaceId, eventId, nextName, roomId)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    Instant now = now();
    rooms.update(spaceId, eventId, roomId, nextName, nextNote, nextCapacity, nextGender, now);
    long boardVersion = rooms.bumpBoardVersion(spaceId, eventId, now);
    return new RoomWritten(boardRoom(spaceId, eventId, roomId), boardVersion);
  }

  /**
   * Deletes the room. Everyone in it (withdrawn people included) becomes unassigned with a {@code
   * ROOM_DELETED} history row each. The latest publication is unchanged until the next one.
   */
  @Transactional
  public RoomDeleted delete(UUID actorId, UUID eventId, UUID roomId, String expectedVersion) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = requiredVersion(expectedVersion);
    lockWritable(spaceId, eventId);

    RoomRow room = target(spaceId, eventId, roomId);
    requireVersion(room, expected);
    Instant now = now();
    List<UUID> members = rooms.memberIds(spaceId, eventId, roomId);
    for (UUID participantId : members) {
      rooms.log(
          spaceId, eventId, participantId, roomId, null, RoomRepository.ROOM_DELETED, actorId, now);
    }
    rooms.delete(spaceId, eventId, roomId);
    long boardVersion = rooms.bumpBoardVersion(spaceId, eventId, now);
    return new RoomDeleted(members.size(), boardVersion);
  }

  @Transactional
  public BoardVersion reorder(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<UUID> order = uuidList(field(body, "roomIds"), "roomIds");
    lockWritable(spaceId, eventId);

    List<RoomRow> current = rooms.rooms(spaceId, eventId);
    Set<UUID> known = new HashSet<>();
    for (RoomRow room : current) {
      known.add(room.roomId());
    }
    if (order.size() != current.size()
        || new HashSet<>(order).size() != order.size()
        || !known.containsAll(order)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    boolean same = true;
    for (int i = 0; i < order.size(); i++) {
      if (!order.get(i).equals(current.get(i).roomId()) || current.get(i).sortOrder() != i) {
        same = false;
        break;
      }
    }
    if (same) {
      return new BoardVersion(rooms.boardVersion(spaceId, eventId));
    }
    Instant now = now();
    for (int i = 0; i < order.size(); i++) {
      rooms.sortOrder(spaceId, eventId, order.get(i), i, now);
    }
    return new BoardVersion(rooms.bumpBoardVersion(spaceId, eventId, now));
  }

  // ---- assignments ----

  /**
   * Puts in, moves and takes out several people in one transaction (api.md "숙소"). Either every
   * change of the request is stored or none. The order is form (400) → unknown room or participant
   * (404) → conflict (409 {@code CONCURRENT_MODIFICATION}) → not active → not lodging (409 {@code
   * INVALID_STATE_TRANSITION}).
   */
  @Transactional
  public Assigned assign(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<Change> changes = changes(body);
    lockWritable(spaceId, eventId);

    List<UUID> ids = new ArrayList<>();
    for (Change change : changes) {
      ids.add(change.participantId());
    }
    Context context = context(spaceId, eventId);
    Map<UUID, Facts> current = new HashMap<>();
    for (Facts person : facts(rooms.people(spaceId, eventId, ids), context)) {
      current.put(person.row().participantId(), person);
    }
    if (current.size() != ids.size()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    List<RoomRow> list = rooms.rooms(spaceId, eventId);
    Set<UUID> known = new HashSet<>();
    for (RoomRow room : list) {
      known.add(room.roomId());
    }
    for (Change change : changes) {
      if (change.toRoomId() != null && !known.contains(change.toRoomId())) {
        throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      }
    }

    List<Map<String, Object>> conflicts = new ArrayList<>();
    List<Change> moves = new ArrayList<>();
    int alreadyApplied = 0;
    for (Change change : changes) {
      UUID currentRoomId = current.get(change.participantId()).row().roomId();
      if (Objects.equals(currentRoomId, change.toRoomId())) {
        alreadyApplied++;
      } else if (Objects.equals(currentRoomId, change.fromRoomId())) {
        moves.add(change);
      } else {
        Map<String, Object> conflict = new LinkedHashMap<>();
        conflict.put("participantId", change.participantId().toString());
        conflict.put("currentRoomId", currentRoomId == null ? null : currentRoomId.toString());
        conflicts.add(conflict);
      }
    }
    if (!conflicts.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("conflicts", conflicts);
      details.put("boardVersion", rooms.boardVersion(spaceId, eventId));
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
    }
    List<String> notActive = new ArrayList<>();
    List<String> notLodging = new ArrayList<>();
    for (Change change : moves) {
      Facts person = current.get(change.participantId());
      if (change.toRoomId() == null) {
        continue;
      }
      if (!person.row().submitted()) {
        notActive.add(change.participantId().toString());
      } else if (person.lodging() == Lodging.NOT_LODGING) {
        notLodging.add(change.participantId().toString());
      }
    }
    if (!notActive.isEmpty()) {
      throw rule("APPLICATION_NOT_SUBMITTED", notActive);
    }
    if (!notLodging.isEmpty()) {
      throw rule(Lodging.NOT_LODGING.name(), notLodging);
    }
    if (moves.isEmpty()) {
      return new Assigned(0, alreadyApplied, rooms.boardVersion(spaceId, eventId), List.of());
    }
    Instant at = now();
    Set<UUID> touched = new HashSet<>();
    for (Change change : moves) {
      Facts person = current.get(change.participantId());
      UUID before = person.row().roomId();
      rooms.assign(
          spaceId,
          eventId,
          change.participantId(),
          change.toRoomId(),
          change.toRoomId() == null ? null : basis(person),
          actorId,
          at);
      rooms.log(
          spaceId,
          eventId,
          change.participantId(),
          before,
          change.toRoomId(),
          RoomRepository.MOVE,
          actorId,
          at);
      if (before != null) {
        touched.add(before);
      }
      if (change.toRoomId() != null) {
        touched.add(change.toRoomId());
      }
    }
    long boardVersion = rooms.bumpBoardVersion(spaceId, eventId, at);
    List<Facts> active =
        facts(rooms.people(spaceId, eventId), context).stream()
            .filter(f -> f.row().submitted())
            .toList();
    List<RoomState> states = new ArrayList<>();
    for (BoardRoom room : boardRooms(list, active, context)) {
      if (touched.contains(room.roomId())) {
        states.add(new RoomState(room.roomId(), room.memberCount(), room.warnings()));
      }
    }
    return new Assigned(moves.size(), alreadyApplied, boardVersion, states);
  }

  // ---- publication ----

  /**
   * Publishes the working copy (api.md "숙소"). After the event state: a different {@code
   * boardVersion} is 409; a working copy equal to the latest publication is {@code
   * ALREADY_PUBLISHED} and writes nothing; unassigned people who sleep over (or are unknown) need
   * {@code confirmUnassigned} and people left in a room who no longer sleep over need {@code
   * confirmNotLodging}. The first publication is never {@code ALREADY_PUBLISHED}.
   */
  @Transactional
  public PublishResult publish(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    long expected = requiredBoardVersion(field(body, "expectedBoardVersion"));
    boolean confirmUnassigned = optionalFlag(field(body, "confirmUnassigned"), "confirmUnassigned");
    boolean confirmNotLodging = optionalFlag(field(body, "confirmNotLodging"), "confirmNotLodging");
    JsonNode notifyNode = field(body, "notify");
    boolean notify =
        notifyNode == null || notifyNode.isNull() || optionalFlag(notifyNode, "notify");
    lockWritable(spaceId, eventId);

    long boardVersion = rooms.boardVersion(spaceId, eventId);
    if (boardVersion != expected) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("boardVersion", boardVersion));
    }
    Context context = context(spaceId, eventId);
    List<RoomRow> list = rooms.rooms(spaceId, eventId);
    List<Facts> active =
        facts(rooms.people(spaceId, eventId), context).stream()
            .filter(f -> f.row().submitted())
            .toList();
    Optional<RoomPublication> latest = rooms.latestPublication(spaceId, eventId);
    RoomSnapshot before = latest.map(RoomPublication::snapshot).orElse(RoomSnapshot.EMPTY);
    Diff diff = Diff.of(list, active, before);
    Counts counts = Counts.of(active);
    if (latest.isPresent() && !diff.any()) {
      RoomPublication last = latest.get();
      return new PublishResult(
          PublishResult.ALREADY_PUBLISHED,
          last.publicationId(),
          last.publishedAt(),
          boardVersion,
          counts.assigned(),
          counts.unassigned(),
          counts.notLodgingAssigned(),
          0,
          roomsWithWarnings(list, active, context),
          0);
    }
    if ((counts.unassigned() > 0 && !confirmUnassigned)
        || (counts.notLodgingAssigned() > 0 && !confirmNotLodging)) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("unassignedCount", counts.unassigned());
      details.put("notLodgingAssignedCount", counts.notLodgingAssigned());
      throw new SceneException(ErrorCode.CONFIRMATION_REQUIRED, details);
    }

    Map<UUID, List<UUID>> members = new HashMap<>();
    for (Facts person : active) {
      if (person.row().roomId() != null) {
        members
            .computeIfAbsent(person.row().roomId(), id -> new ArrayList<>())
            .add(person.row().participantId());
      }
    }
    List<SnapshotRoom> snapshotRooms = new ArrayList<>();
    for (RoomRow room : list) {
      snapshotRooms.add(
          new SnapshotRoom(
              room.roomId(),
              room.name(),
              room.locationNote(),
              room.capacity(),
              room.genderOptionId(),
              room.sortOrder(),
              members.getOrDefault(room.roomId(), List.of())));
    }
    RoomSnapshot next = new RoomSnapshot(snapshotRooms);
    Instant now = now();
    UUID publicationId = UUID.randomUUID();
    rooms.insertPublication(spaceId, eventId, publicationId, boardVersion, next, actorId, now);
    // DEC-080 §4: participants and leaders reload rooms; same transaction as the publication.
    feedVersions.bump(spaceId, eventId, FeedArea.ROOMS);
    long notified =
        notify ? notifyParticipants(spaceId, eventId, active, latest.isPresent(), before, next) : 0;
    long warned = roomsWithWarnings(list, active, context);
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("publicationId", publicationId.toString());
    detail.put("boardVersion", boardVersion);
    detail.put("assignedCount", counts.assigned());
    detail.put("unassignedCount", counts.unassigned());
    detail.put("changedParticipantCount", diff.changedParticipants());
    detail.put("roomsWithWarnings", warned);
    detail.put("notify", notify);
    detail.put("notifiedCount", notified);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.ROOMS_PUBLISHED,
        json.writeValueAsString(detail),
        now);
    return new PublishResult(
        PublishResult.PUBLISHED,
        publicationId,
        now,
        boardVersion,
        counts.assigned(),
        counts.unassigned(),
        counts.notLodgingAssigned(),
        diff.changedParticipants(),
        warned,
        notified);
  }

  /**
   * {@code ROOM_PUBLISHED} (api.md "숙소"). The first publication tells everyone with a room; later
   * ones tell people whose room changed (new, other, or taken out) and people whose room was
   * renamed or got another location note. Texts carry the reader's own room only, never another
   * participant's name.
   */
  private long notifyParticipants(
      UUID spaceId,
      UUID eventId,
      List<Facts> active,
      boolean republish,
      RoomSnapshot before,
      RoomSnapshot next) {
    Map<UUID, SnapshotRoom> was = before.placements();
    Map<UUID, SnapshotRoom> now = next.placements();
    Map<NotificationDraft, List<UUID>> drafts = new LinkedHashMap<>();
    for (Facts person : active) {
      UUID id = person.row().participantId();
      SnapshotRoom from = was.get(id);
      SnapshotRoom to = now.get(id);
      NotificationDraft draft = null;
      if (!republish) {
        if (to != null) {
          draft = draft(to, "숙소가 정해졌어요");
        }
      } else if (!Objects.equals(roomId(from), roomId(to))) {
        draft =
            to == null
                ? new NotificationDraft(
                    ROOM_PUBLISHED, TARGET_ROOM, null, "숙소 배정이 바뀌었어요", "숙소 화면에서 확인해 주세요", false)
                : draft(to, "숙소가 바뀌었어요");
      } else if (to != null
          && (!to.name().equals(from.name())
              || !Objects.equals(to.locationNote(), from.locationNote()))) {
        draft = draft(to, "숙소 정보가 바뀌었어요");
      }
      if (draft != null) {
        drafts.computeIfAbsent(draft, d -> new ArrayList<>()).add(id);
      }
    }
    long made = 0;
    for (Map.Entry<NotificationDraft, List<UUID>> entry : drafts.entrySet()) {
      made += notifications.toParticipants(spaceId, eventId, entry.getValue(), entry.getKey());
    }
    return made;
  }

  private static NotificationDraft draft(SnapshotRoom room, String title) {
    String body =
        room.locationNote() == null ? room.name() : room.name() + " · " + room.locationNote();
    return new NotificationDraft(ROOM_PUBLISHED, TARGET_ROOM, room.roomId(), title, body, false);
  }

  private static UUID roomId(SnapshotRoom room) {
    return room == null ? null : room.roomId();
  }

  // ---- withdraw (DEC-084) ----

  /** The room assignment a withdraw removed. */
  public record RemovedRoom(UUID roomId, String name) {}

  /**
   * Removes the working-copy room of a participant whose application is being withdrawn (api.md
   * "숙소", DEC-072 §5) with a {@code WITHDRAWN} history row, and moves the board version. When the
   * person is in the latest publication, the participants' {@code rooms} value moves too, as their
   * roommates' lists change. The caller holds the event row lock and checked the event state and
   * its own permission; {@code ROOM_WRITE} is not checked. {@code actorId} is null for a withdraw
   * by the participant. Empty when the participant had no room.
   */
  @Transactional
  public Optional<RemovedRoom> removeWithdrawn(
      UUID spaceId, UUID eventId, UUID participantId, UUID actorId, Instant at) {
    boolean published =
        rooms
            .latestPublication(spaceId, eventId)
            .map(p -> p.snapshot().placements().containsKey(participantId))
            .orElse(false);
    if (published) {
      feedVersions.bump(spaceId, eventId, FeedArea.ROOMS);
    }
    PersonRow row =
        rooms.people(spaceId, eventId, List.of(participantId)).stream().findFirst().orElse(null);
    if (row == null || row.roomId() == null) {
      return Optional.empty();
    }
    RoomRow room = rooms.find(spaceId, eventId, row.roomId()).orElseThrow();
    rooms.log(
        spaceId, eventId, participantId, row.roomId(), null, RoomRepository.WITHDRAWN, actorId, at);
    rooms.assign(spaceId, eventId, participantId, null, null, actorId, at);
    rooms.bumpBoardVersion(spaceId, eventId, at);
    return Optional.of(new RemovedRoom(room.roomId(), room.name()));
  }

  // ---- shared facts ----

  /** The event's setup, slot days and GENDER option labels, read once per request. */
  record Context(JsonNode setup, List<MealSlots.Day> days, Map<String, String> genderLabels) {

    Gender gender(String optionId) {
      return optionId == null ? null : new Gender(optionId, genderLabels.get(optionId));
    }

    String genderLabel(String optionId) {
      return optionId == null ? null : genderLabels.get(optionId);
    }
  }

  Context context(UUID spaceId, UUID eventId) {
    JsonNode setup = groupBoard.setup(spaceId, eventId);
    List<MealSlots.Day> days = groupBoard.slotDays(spaceId, eventId, setup);
    Map<String, String> labels = new HashMap<>();
    String config = rooms.genderConfig(spaceId, eventId);
    JsonNode options = config == null ? null : json.readTree(config).get("options");
    if (options != null && options.isArray()) {
      for (JsonNode option : options) {
        if (option.path("optionId").isString() && option.path("label").isString()) {
          labels.put(option.get("optionId").asString(), option.get("label").asString());
        }
      }
    }
    return new Context(setup, days, labels);
  }

  /**
   * What the room rules read of one participant. {@code genderId} is the chosen GENDER option only
   * while it is shown (null is "no gender"). {@code nights} and {@code lodging} come from {@link
   * MealSlots#lodgingNights}, the rule the summary and the group leader view use.
   */
  record Facts(
      PersonRow row,
      String attendance,
      List<String> slotIds,
      List<Integer> nights,
      Lodging lodging,
      String genderId) {}

  List<Facts> facts(List<PersonRow> rows, Context context) {
    List<Facts> out = new ArrayList<>();
    for (PersonRow row : rows) {
      out.add(facts(row, context));
    }
    return out;
  }

  Facts facts(PersonRow row, Context context) {
    String attendance = GroupService.attendance(row.attendanceAsked(), row.attendanceOptionId());
    MealSlots.Answers slots =
        new MealSlots.Answers(
            tree(row.mealsAnswer()), tree(row.arrivalAnswer()), tree(row.departureAnswer()));
    List<String> slotIds =
        context.days().isEmpty()
            ? null
            : MealSlots.attended(context.setup(), context.days(), attendance, slots);
    List<Integer> nights =
        row.submitted()
            ? MealSlots.lodgingNights(
                context.setup(),
                attendance,
                slots,
                new MealSlots.LodgingAnswers(
                    row.lodgingAsked(), tree(row.lodgingAnswer()), tree(row.noLodgingAnswer())))
            : null;
    return new Facts(
        row,
        attendance,
        slotIds,
        nights,
        Lodging.of(nights),
        row.genderShown() ? row.genderOptionId() : null);
  }

  /**
   * The basis stored with an assignment (api.md "숙소", DEC-085 Follow-up): the gender option,
   * lodging nights and attended slots at assignment time, for A11's "review again". No name or
   * answer text.
   */
  private String basis(Facts person) {
    Map<String, Object> basis = new LinkedHashMap<>();
    basis.put("genderOptionId", person.genderId());
    basis.put("lodgingNights", person.nights());
    basis.put("slotIds", person.slotIds());
    return json.writeValueAsString(basis);
  }

  /** Rooms in board order with active member counts and warnings. */
  List<BoardRoom> boardRooms(List<RoomRow> list, List<Facts> active, Context context) {
    Map<UUID, List<Facts>> byRoom = new HashMap<>();
    for (Facts person : active) {
      if (person.row().roomId() != null) {
        byRoom.computeIfAbsent(person.row().roomId(), id -> new ArrayList<>()).add(person);
      }
    }
    List<BoardRoom> out = new ArrayList<>();
    for (RoomRow room : list) {
      List<Facts> members = byRoom.getOrDefault(room.roomId(), List.of());
      out.add(
          new BoardRoom(
              room.roomId(),
              room.name(),
              room.locationNote(),
              room.capacity(),
              context.gender(room.genderOptionId()),
              room.sortOrder(),
              room.version(),
              members.size(),
              warnings(room, members)));
    }
    return out;
  }

  private long roomsWithWarnings(List<RoomRow> list, List<Facts> active, Context context) {
    return boardRooms(list, active, context).stream().filter(r -> !r.warnings().isEmpty()).count();
  }

  private BoardRoom boardRoom(UUID spaceId, UUID eventId, UUID roomId) {
    Context context = context(spaceId, eventId);
    RoomRow room = rooms.find(spaceId, eventId, roomId).orElseThrow();
    List<Facts> active =
        facts(rooms.people(spaceId, eventId), context).stream()
            .filter(f -> f.row().submitted() && roomId.equals(f.row().roomId()))
            .toList();
    return boardRooms(List.of(room), active, context).get(0);
  }

  /** Room-contract §4. Members are the room's active members by name, then id. */
  static List<Warning> warnings(RoomRow room, List<Facts> members) {
    List<Warning> out = new ArrayList<>();
    if (room.capacity() != null && members.size() > room.capacity()) {
      out.add(new Warning(Warning.OVER_CAPACITY, (long) members.size(), room.capacity(), null));
    }
    if (room.genderOptionId() != null) {
      List<UUID> mismatch = new ArrayList<>();
      List<UUID> unknown = new ArrayList<>();
      for (Facts person : members) {
        if (person.genderId() == null) {
          unknown.add(person.row().participantId());
        } else if (!person.genderId().equals(room.genderOptionId())) {
          mismatch.add(person.row().participantId());
        }
      }
      if (!mismatch.isEmpty()) {
        out.add(new Warning(Warning.GENDER_MISMATCH, null, null, mismatch));
      }
      if (!unknown.isEmpty()) {
        out.add(new Warning(Warning.GENDER_UNKNOWN, null, null, unknown));
      }
    }
    List<UUID> notLodging = new ArrayList<>();
    for (Facts person : members) {
      if (person.lodging() == Lodging.NOT_LODGING) {
        notLodging.add(person.row().participantId());
      }
    }
    if (!notLodging.isEmpty()) {
      out.add(new Warning(Warning.NOT_LODGING, null, null, notLodging));
    }
    return out;
  }

  /** Counts of the board's {@code publication} over active participants. */
  record Counts(long eligible, long assigned, long unassigned, long notLodgingAssigned) {

    static Counts of(List<Facts> active) {
      long eligible = 0;
      long assigned = 0;
      long unassigned = 0;
      long notLodgingAssigned = 0;
      for (Facts person : active) {
        boolean placed = person.row().roomId() != null;
        boolean lodges = person.lodging() != Lodging.NOT_LODGING;
        if (placed) {
          assigned++;
        }
        if (lodges) {
          eligible++;
          if (!placed) {
            unassigned++;
          }
        } else if (placed) {
          notLodgingAssigned++;
        }
      }
      return new Counts(eligible, assigned, unassigned, notLodgingAssigned);
    }
  }

  /**
   * Working copy against the latest publication by content. {@code changedParticipants} counts
   * active participants whose room differs; {@code roomChanges} counts rooms added, deleted, or
   * with another name, location note, capacity, gender split or order. With no publication every
   * assigned participant and every room is a change.
   */
  record Diff(long changedParticipants, long roomChanges) {

    boolean any() {
      return changedParticipants != 0 || roomChanges != 0;
    }

    static Diff of(List<RoomRow> list, List<Facts> active, RoomSnapshot snapshot) {
      Map<UUID, SnapshotRoom> placements = snapshot.placements();
      long changed = 0;
      for (Facts person : active) {
        SnapshotRoom published = placements.get(person.row().participantId());
        if (!Objects.equals(person.row().roomId(), roomId(published))) {
          changed++;
        }
      }
      Map<UUID, SnapshotRoom> published = new HashMap<>();
      for (SnapshotRoom room : snapshot.rooms()) {
        published.put(room.roomId(), room);
      }
      long roomChanges = 0;
      Set<UUID> seen = new HashSet<>();
      for (RoomRow room : list) {
        seen.add(room.roomId());
        SnapshotRoom before = published.get(room.roomId());
        if (before == null
            || !before.name().equals(room.name())
            || !Objects.equals(before.locationNote(), room.locationNote())
            || !Objects.equals(before.capacity(), room.capacity())
            || !Objects.equals(before.genderOptionId(), room.genderOptionId())
            || before.sortOrder() != room.sortOrder()) {
          roomChanges++;
        }
      }
      for (UUID id : published.keySet()) {
        if (!seen.contains(id)) {
          roomChanges++;
        }
      }
      return new Diff(changed, roomChanges);
    }
  }

  // ---- checks ----

  private UUID openForWrite(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.ROOM_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return opened.location().spaceId();
  }

  private void lockWritable(UUID spaceId, UUID eventId) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    switch (event.lifecycleStatus()) {
      case "DRAFT", "ACTIVE" -> {}
      case "ENDED" -> throw new SceneException(ErrorCode.EVENT_ENDED);
      case "ARCHIVED" -> throw new SceneException(ErrorCode.EVENT_ARCHIVED);
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId, Permission permission) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(location.spaceId(), location.id(), actorId, permission.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        permission, opened.eventRole(), opened.authorityEnded(), effect);
  }

  private RoomRow target(UUID spaceId, UUID eventId, UUID roomId) {
    return rooms
        .find(spaceId, eventId, roomId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private static void requireVersion(RoomRow room, int expectedVersion) {
    if (room.version() != expectedVersion) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", room.version()));
    }
  }

  private static SceneException rule(String reason, List<String> participantIds) {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("reason", reason);
    details.put("participantIds", participantIds);
    return new SceneException(ErrorCode.INVALID_STATE_TRANSITION, details);
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private JsonNode tree(String text) {
    return text == null ? null : json.readTree(text);
  }

  private static String requiredName(JsonNode node) {
    if (node == null || !node.isString()) {
      throw invalid("name");
    }
    String name = node.asString().strip();
    int length = name.codePointCount(0, name.length());
    if (length < 1 || length > NAME_MAX) {
      throw invalid("name");
    }
    return name;
  }

  /** Plain text of 0–100 characters; blank is stored as null. */
  private static String locationNote(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("locationNote");
    }
    String note = node.asString().strip();
    if (note.codePointCount(0, note.length()) > LOCATION_NOTE_MAX) {
      throw invalid("locationNote");
    }
    return note.isEmpty() ? null : note;
  }

  private static Integer capacity(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isIntegralNumber()
        || !node.canConvertToInt()
        || node.asInt() < 1
        || node.asInt() > CAPACITY_MAX) {
      throw invalid("capacity");
    }
    return node.asInt();
  }

  /** Null, or an option id of the form's GENDER question (turned off or not). */
  private String genderOptionId(UUID spaceId, UUID eventId, JsonNode body) {
    JsonNode node = body.get("genderOptionId");
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("genderOptionId");
    }
    String config = rooms.genderConfig(spaceId, eventId);
    JsonNode options = config == null ? null : json.readTree(config).get("options");
    if (options != null && options.isArray()) {
      for (JsonNode option : options) {
        if (option.path("optionId").isString()
            && node.asString().equals(option.get("optionId").asString())) {
          return node.asString();
        }
      }
    }
    throw invalid("genderOptionId");
  }

  private static int requiredVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 0) {
      throw invalid("expectedVersion");
    }
    return node.asInt();
  }

  private static int requiredVersion(String value) {
    if (value == null || !value.matches("[0-9]{1,9}")) {
      throw invalid("expectedVersion");
    }
    return Integer.parseInt(value);
  }

  private static long requiredBoardVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
      throw invalid("expectedBoardVersion");
    }
    return node.asLong();
  }

  private static boolean optionalFlag(JsonNode node, String fieldName) {
    if (node == null || node.isNull()) {
      return false;
    }
    if (!node.isBoolean()) {
      throw invalid(fieldName);
    }
    return node.asBoolean();
  }

  private static List<UUID> uuidList(JsonNode node, String fieldName) {
    if (node == null || !node.isArray()) {
      throw invalid(fieldName);
    }
    List<UUID> out = new ArrayList<>();
    for (JsonNode item : node) {
      UUID id = uuid(item);
      if (id == null) {
        throw invalid(fieldName);
      }
      out.add(id);
    }
    return out;
  }

  private static List<Change> changes(JsonNode body) {
    JsonNode node = field(body, "changes");
    if (node == null || !node.isArray() || node.isEmpty() || node.size() > CHANGES_MAX) {
      throw invalid("changes");
    }
    List<Change> out = new ArrayList<>();
    Set<UUID> seen = new LinkedHashSet<>();
    for (JsonNode item : node) {
      // January has one room for the whole event; per-night rows open with G6.
      if (!item.isObject()
          || !item.has("fromRoomId")
          || !item.has("toRoomId")
          || item.has("night")) {
        throw invalid("changes");
      }
      UUID participantId = uuid(item.get("participantId"));
      if (participantId == null || !seen.add(participantId)) {
        throw invalid("changes");
      }
      out.add(
          new Change(
              participantId,
              nullableUuid(item.get("fromRoomId")),
              nullableUuid(item.get("toRoomId"))));
    }
    return out;
  }

  private static UUID nullableUuid(JsonNode node) {
    if (node.isNull()) {
      return null;
    }
    UUID id = uuid(node);
    if (id == null) {
      throw invalid("changes");
    }
    return id;
  }

  private static UUID uuid(JsonNode node) {
    if (node == null || !node.isString()) {
      return null;
    }
    try {
      UUID id = UUID.fromString(node.asString());
      return id.toString().equalsIgnoreCase(node.asString()) ? id : null;
    } catch (IllegalArgumentException malformed) {
      return null;
    }
  }

  private static JsonNode field(JsonNode body, String name) {
    return body == null || !body.isObject() ? null : body.get(name);
  }

  private static SceneException invalid(String fieldName) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", fieldName));
  }

  private record Change(UUID participantId, UUID fromRoomId, UUID toRoomId) {}
}
