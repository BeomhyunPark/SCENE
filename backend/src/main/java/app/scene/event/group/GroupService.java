package app.scene.event.group;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormPreset;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.MealSlots;
import app.scene.event.group.GroupResults.Assigned;
import app.scene.event.group.GroupResults.BoardVersion;
import app.scene.event.group.GroupResults.GroupDeleted;
import app.scene.event.group.GroupResults.GroupWritten;
import app.scene.event.group.GroupResults.LeadersWritten;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
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
 * Group assignment working copy and publication (#299, #300, DEC-072, api.md "조 편성"). The board
 * read needs effective {@code GROUP_WRITE} or an active space owner or admin; the published read
 * needs effective {@code EVENT_READ} or an active space owner or admin; every write and the
 * publication need effective {@code GROUP_WRITE}. Writes run 404 → 403 → 400 → 409 state → 404
 * target → 409 version or conflict → 409 rule → result, and lock the event row, so writes of one
 * event commit one after another.
 *
 * <p>Edits go to {@code group_assignment_logs}, not to audit; a publication writes audit {@code
 * GROUPS_PUBLISHED}. Names, phones, and answers never go to the history or to logs. Participants
 * without a SUBMITTED application drop out of every read.
 */
@Service
public class GroupService {

  public static final int NAME_MAX = 50;
  public static final int GROUPS_MAX = 100;
  public static final int CHANGES_MAX = 200;
  public static final int LEADERS_MAX = 1;

  static final String FULL = "FULL";

  private static final Map<String, String> ATTENDANCE =
      Map.of("opt_full", FULL, "opt_partial", "PARTIAL", "opt_worship", "WORSHIP_ONLY");

  private final EventAccessGate gate;
  private final EventRepository events;
  private final GroupRepository groups;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final FormRepository forms;
  private final JsonMapper json;
  private final Clock clock;
  private final ParticipantFeedVersions feedVersions;

  public GroupService(
      EventAccessGate gate,
      EventRepository events,
      GroupRepository groups,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      FormRepository forms,
      JsonMapper json,
      Clock clock,
      ParticipantFeedVersions feedVersions) {
    this.gate = gate;
    this.events = events;
    this.groups = groups;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.forms = forms;
    this.json = json;
    this.clock = clock;
    this.feedVersions = feedVersions;
  }

  @Transactional(readOnly = true)
  public GroupBoard board(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayReadBoard(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    EventRow event =
        events
            .find(spaceId, eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    List<Group> list = groups.groups(spaceId, eventId);
    Optional<Publication> latest = groups.latestPublication(spaceId, eventId);
    Snapshot snapshot = latest.map(Publication::snapshot).orElse(Snapshot.EMPTY);
    Map<UUID, Snapshot.Placement> placements = snapshot.placements();
    List<BoardParticipant> participants = new ArrayList<>();
    List<ActiveParticipant> active = new ArrayList<>();
    long assigned = 0;
    JsonNode setup = setup(spaceId, eventId);
    List<MealSlots.Day> days = slotDays(spaceId, eventId, setup);
    for (BoardRow row : groups.boardParticipants(spaceId, eventId)) {
      if (row.groupId() != null) {
        assigned++;
      }
      participants.add(participant(row, placements.get(row.participantId()), setup, days));
      active.add(
          new ActiveParticipant(
              row.participantId(), null, null, row.groupId(), row.leader(), row.position()));
    }
    long activeCount = participants.size();
    PublicationDiff diff = PublicationDiff.of(list, active, snapshot);
    PublicationSummary publication =
        new PublicationSummary(
            latest.map(Publication::publishedAt).orElse(null),
            latest.map(Publication::publishedByDisplayName).orElse(null),
            latest.map(Publication::boardVersion).orElse(null),
            activeCount,
            assigned,
            activeCount - assigned,
            diff.changedParticipants(),
            diff.groupChanges(),
            diff.any());
    return new GroupBoard(
        event.lifecycleStatus(),
        groups.boardVersion(spaceId, eventId),
        list,
        participants,
        groups.withdrawn(spaceId, eventId),
        publication,
        slots(days));
  }

  /**
   * Slot days of the event's form setup, labelled with the current MEALS option labels even when
   * the question is turned off (as in the summary). Empty when there is no form or no setup.
   */
  private JsonNode setup(UUID spaceId, UUID eventId) {
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    return form == null || form.setup() == null ? null : json.readTree(form.setup());
  }

  private List<MealSlots.Day> slotDays(UUID spaceId, UUID eventId, JsonNode setup) {
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    if (form == null || setup == null) {
      return List.of();
    }
    JsonNode meals = null;
    for (FormFieldRow field : forms.findFields(spaceId, eventId, form.id())) {
      if ("MEALS".equals(field.presetKey())) {
        meals = field.config() == null ? null : json.readTree(field.config());
      }
    }
    return MealSlots.days(setup, MealSlots.labels(meals));
  }

  private static List<BoardSlot> slots(List<MealSlots.Day> days) {
    if (days.isEmpty()) {
      return null;
    }
    List<BoardSlot> out = new ArrayList<>();
    for (MealSlots.Day day : days) {
      for (MealSlots.Slot slot : day.slots()) {
        out.add(
            new BoardSlot(
                slot.optionId(),
                day.day(),
                day.date().toString(),
                day.label(),
                slot.meal(),
                slot.label(),
                out.size()));
      }
    }
    return out;
  }

  /**
   * Publishes the working copy (api.md {@code POST …/groups/publish}). After the event state: a
   * different {@code boardVersion} is 409; a working copy equal to the latest publication is {@code
   * ALREADY_PUBLISHED} and writes nothing; unassigned active participants need {@code
   * confirmUnassigned}. The first publication is never {@code ALREADY_PUBLISHED}, even with no
   * group. The snapshot holds participant ids only; one {@code GROUPS_PUBLISHED} audit row goes in
   * the same transaction.
   */
  @Transactional
  public PublishResult publish(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    long expected = requiredBoardVersion(field(body, "expectedBoardVersion"));
    boolean confirmUnassigned = optionalFlag(field(body, "confirmUnassigned"));
    lockWritable(spaceId, eventId);

    long boardVersion = groups.boardVersion(spaceId, eventId);
    if (boardVersion != expected) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("boardVersion", boardVersion));
    }
    List<Group> list = groups.groups(spaceId, eventId);
    List<ActiveParticipant> active = groups.active(spaceId, eventId);
    Optional<Publication> latest = groups.latestPublication(spaceId, eventId);
    PublicationDiff diff =
        PublicationDiff.of(list, active, latest.map(Publication::snapshot).orElse(Snapshot.EMPTY));
    long assigned = active.stream().filter(p -> p.groupId() != null).count();
    long unassigned = active.size() - assigned;
    if (latest.isPresent() && !diff.any()) {
      Publication last = latest.get();
      return new PublishResult(
          PublishResult.ALREADY_PUBLISHED,
          last.publicationId(),
          last.publishedAt(),
          boardVersion,
          assigned,
          unassigned,
          0);
    }
    if (unassigned > 0 && !confirmUnassigned) {
      throw new SceneException(
          ErrorCode.CONFIRMATION_REQUIRED, Map.of("unassignedCount", unassigned));
    }

    Map<UUID, List<Snapshot.SnapshotMember>> members = new HashMap<>();
    List<ActiveParticipant> ordered = new ArrayList<>(active);
    ordered.sort(MEMBER_ORDER);
    for (ActiveParticipant participant : ordered) {
      if (participant.groupId() != null) {
        members
            .computeIfAbsent(participant.groupId(), id -> new ArrayList<>())
            .add(new Snapshot.SnapshotMember(participant.participantId(), participant.leader()));
      }
    }
    List<Snapshot.SnapshotGroup> snapshotGroups = new ArrayList<>();
    for (Group group : list) {
      snapshotGroups.add(
          new Snapshot.SnapshotGroup(
              group.groupId(),
              group.name(),
              group.sortOrder(),
              members.getOrDefault(group.groupId(), List.of())));
    }
    Instant now = now();
    UUID publicationId = UUID.randomUUID();
    groups.insertPublication(
        spaceId, eventId, publicationId, boardVersion, new Snapshot(snapshotGroups), actorId, now);
    // DEC-080 §4: participants reload the group card; same transaction as the publication.
    feedVersions.bump(spaceId, eventId, FeedArea.GROUPS);
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("publicationId", publicationId.toString());
    detail.put("boardVersion", boardVersion);
    detail.put("assignedCount", assigned);
    detail.put("unassignedCount", unassigned);
    detail.put("changedParticipantCount", diff.changedParticipants());
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.GROUPS_PUBLISHED,
        json.writeValueAsString(detail),
        now);
    return new PublishResult(
        PublishResult.PUBLISHED,
        publicationId,
        now,
        boardVersion,
        assigned,
        unassigned,
        diff.changedParticipants());
  }

  /**
   * The latest publication for operators (api.md {@code GET …/groups/published}). Needs effective
   * {@code EVENT_READ} or an active space owner or admin. Not blocked by the event state.
   */
  @Transactional(readOnly = true)
  public PublishedGroups published(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayReadPublished(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    Optional<Publication> latest = groups.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return new PublishedGroups(null, List.of(), List.of());
    }
    Publication publication = latest.get();
    List<ActiveParticipant> active = groups.active(spaceId, eventId);
    Map<UUID, ActiveParticipant> byId = new HashMap<>();
    for (ActiveParticipant participant : active) {
      byId.put(participant.participantId(), participant);
    }
    Set<UUID> placed = new HashSet<>();
    List<PublishedGroups.PublishedGroup> out = new ArrayList<>();
    for (Snapshot.SnapshotGroup group : publication.snapshot().groups()) {
      List<PublishedMember> members = new ArrayList<>();
      for (Snapshot.SnapshotMember member : group.members()) {
        ActiveParticipant current = byId.get(member.participantId());
        if (current != null) {
          placed.add(member.participantId());
          members.add(new PublishedMember(current, member.leader()));
        }
      }
      List<PublishedGroups.Leader> leaders = new ArrayList<>();
      List<PublishedGroups.Member> items = new ArrayList<>();
      for (PublishedMember member : members) {
        ActiveParticipant p = member.participant();
        if (member.leader()) {
          leaders.add(new PublishedGroups.Leader(p.participantId(), p.name()));
        }
        items.add(
            new PublishedGroups.Member(p.participantId(), p.name(), p.cohort(), member.leader()));
      }
      out.add(new PublishedGroups.PublishedGroup(group.groupId(), group.name(), leaders, items));
    }
    List<PublishedGroups.Unassigned> unassigned = new ArrayList<>();
    for (ActiveParticipant participant : active) {
      if (!placed.contains(participant.participantId())) {
        unassigned.add(
            new PublishedGroups.Unassigned(
                participant.participantId(), participant.name(), participant.cohort()));
      }
    }
    return new PublishedGroups(publication.publishedAt(), out, unassigned);
  }

  @Transactional
  public GroupWritten create(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    String name = requiredName(body);
    lockWritable(spaceId, eventId);

    List<Group> existing = groups.groups(spaceId, eventId);
    if (existing.size() >= GROUPS_MAX || groups.nameTaken(spaceId, eventId, name, null)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    Instant now = now();
    UUID groupId = UUID.randomUUID();
    groups.insert(spaceId, eventId, groupId, name, actorId, now);
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, now);
    return new GroupWritten(group(spaceId, eventId, groupId), boardVersion);
  }

  @Transactional
  public GroupWritten rename(UUID actorId, UUID eventId, UUID groupId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    String name = requiredName(body);
    int expectedVersion = requiredVersion(field(body, "expectedVersion"));
    lockWritable(spaceId, eventId);

    Group group = target(spaceId, eventId, groupId);
    requireVersion(group, expectedVersion);
    if (group.name().equals(name)) {
      return new GroupWritten(group, groups.boardVersion(spaceId, eventId));
    }
    if (groups.nameTaken(spaceId, eventId, name, groupId)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    Instant now = now();
    groups.rename(spaceId, eventId, groupId, name, now);
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, now);
    return new GroupWritten(group(spaceId, eventId, groupId), boardVersion);
  }

  @Transactional
  public GroupDeleted delete(UUID actorId, UUID eventId, UUID groupId, String expectedVersion) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = requiredVersion(expectedVersion);
    lockWritable(spaceId, eventId);

    Group group = target(spaceId, eventId, groupId);
    requireVersion(group, expected);
    Instant now = now();
    List<Assignment> members = groups.members(spaceId, eventId, groupId);
    for (Assignment member : members) {
      groups.log(
          spaceId,
          eventId,
          member.participantId(),
          groupId,
          null,
          member.leader(),
          false,
          GroupRepository.GROUP_DELETED,
          actorId,
          now);
    }
    groups.delete(spaceId, eventId, groupId);
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, now);
    return new GroupDeleted(members.size(), boardVersion);
  }

  @Transactional
  public BoardVersion reorder(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<UUID> order = uuidList(field(body, "groupIds"), "groupIds", Integer.MAX_VALUE);
    lockWritable(spaceId, eventId);

    List<Group> current = groups.groups(spaceId, eventId);
    Set<UUID> known = new HashSet<>();
    for (Group group : current) {
      known.add(group.groupId());
    }
    if (order.size() != current.size()
        || new HashSet<>(order).size() != order.size()
        || !known.containsAll(order)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    boolean same = true;
    for (int i = 0; i < order.size(); i++) {
      if (!order.get(i).equals(current.get(i).groupId())) {
        same = false;
        break;
      }
    }
    if (same) {
      return new BoardVersion(groups.boardVersion(spaceId, eventId));
    }
    Instant now = now();
    for (int i = 0; i < order.size(); i++) {
      groups.sortOrder(spaceId, eventId, order.get(i), i, now);
    }
    return new BoardVersion(groups.bumpBoardVersion(spaceId, eventId, now));
  }

  @Transactional
  public Assigned assign(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<Change> changes = changes(body);
    lockWritable(spaceId, eventId);

    List<UUID> ids = new ArrayList<>();
    for (Change change : changes) {
      ids.add(change.participantId());
    }
    Map<UUID, Assignment> current = new HashMap<>();
    for (Assignment assignment : groups.assignments(spaceId, eventId, ids)) {
      current.put(assignment.participantId(), assignment);
    }
    if (current.size() != ids.size()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    Set<UUID> known = new HashSet<>();
    for (Group group : groups.groups(spaceId, eventId)) {
      known.add(group.groupId());
    }
    for (Change change : changes) {
      if (change.toGroupId() != null && !known.contains(change.toGroupId())) {
        throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      }
    }

    List<Map<String, Object>> conflicts = new ArrayList<>();
    List<Change> moves = new ArrayList<>();
    int alreadyApplied = 0;
    for (Change change : changes) {
      UUID currentGroupId = current.get(change.participantId()).groupId();
      if (Objects.equals(currentGroupId, change.toGroupId())) {
        alreadyApplied++;
      } else if (Objects.equals(currentGroupId, change.fromGroupId())) {
        moves.add(change);
      } else {
        Map<String, Object> conflict = new LinkedHashMap<>();
        conflict.put("participantId", change.participantId().toString());
        conflict.put("currentGroupId", currentGroupId == null ? null : currentGroupId.toString());
        conflicts.add(conflict);
      }
    }
    if (!conflicts.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("conflicts", conflicts);
      details.put("boardVersion", groups.boardVersion(spaceId, eventId));
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
    }
    List<String> notActive = new ArrayList<>();
    for (Change change : moves) {
      if (change.toGroupId() != null && !current.get(change.participantId()).submitted()) {
        notActive.add(change.participantId().toString());
      }
    }
    if (!notActive.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("reason", "APPLICATION_NOT_SUBMITTED");
      details.put("participantIds", notActive);
      throw new SceneException(ErrorCode.INVALID_STATE_TRANSITION, details);
    }
    if (moves.isEmpty()) {
      return new Assigned(0, alreadyApplied, groups.boardVersion(spaceId, eventId));
    }
    Instant at = now();
    Map<UUID, List<Change>> arrivals = new LinkedHashMap<>();
    for (Change change : moves) {
      if (change.toGroupId() != null) {
        arrivals.computeIfAbsent(change.toGroupId(), id -> new ArrayList<>()).add(change);
      }
    }
    Map<UUID, Integer> positions = new HashMap<>();
    List<Runnable> shifts = new ArrayList<>();
    for (Map.Entry<UUID, List<Change>> entry : arrivals.entrySet()) {
      UUID groupId = entry.getKey();
      List<Assignment> stay = groups.members(spaceId, eventId, groupId);
      List<UUID> order = new ArrayList<>();
      for (Assignment member : stay) {
        order.add(member.participantId());
      }
      for (Change change : entry.getValue()) {
        int anchor =
            change.beforeParticipantId() == null ? -1 : order.indexOf(change.beforeParticipantId());
        if (anchor < 0) {
          order.add(change.participantId());
        } else {
          order.add(anchor, change.participantId());
        }
      }
      Map<UUID, Integer> was = new HashMap<>();
      for (Assignment member : stay) {
        was.put(member.participantId(), member.position());
      }
      for (int i = 0; i < order.size(); i++) {
        UUID id = order.get(i);
        int position = i;
        if (was.containsKey(id)) {
          if (!Objects.equals(was.get(id), position)) {
            shifts.add(() -> groups.position(spaceId, eventId, groupId, id, position));
          }
        } else {
          positions.put(id, position);
        }
      }
    }
    for (Change change : moves) {
      Assignment before = current.get(change.participantId());
      groups.assign(
          spaceId,
          eventId,
          change.participantId(),
          change.toGroupId(),
          positions.getOrDefault(change.participantId(), 0),
          actorId,
          at);
      groups.log(
          spaceId,
          eventId,
          change.participantId(),
          before.groupId(),
          change.toGroupId(),
          before.leader(),
          false,
          GroupRepository.MOVE,
          actorId,
          at);
    }
    shifts.forEach(Runnable::run);
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, at);
    return new Assigned(moves.size(), alreadyApplied, boardVersion);
  }

  /**
   * Member order within one group (api.md {@code PUT …/groups/{groupId}/members/order}). The list
   * must hold the group's active members exactly once each; otherwise someone moved meanwhile and
   * nothing is saved ({@code 409 CONCURRENT_MODIFICATION} with {@code conflicts}). Withdrawn rows
   * keep their relative order after the active ones. The group {@code version} does not change.
   */
  @Transactional
  public BoardVersion memberOrder(UUID actorId, UUID eventId, UUID groupId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<UUID> order = uuidList(field(body, "participantIds"), "participantIds", Integer.MAX_VALUE);
    if (new HashSet<>(order).size() != order.size()) {
      throw invalid("participantIds");
    }
    lockWritable(spaceId, eventId);

    target(spaceId, eventId, groupId);
    List<Assignment> members = groups.members(spaceId, eventId, groupId);
    List<UUID> active = new ArrayList<>();
    List<Assignment> withdrawn = new ArrayList<>();
    for (Assignment member : members) {
      if (member.submitted()) {
        active.add(member.participantId());
      } else {
        withdrawn.add(member);
      }
    }
    Set<UUID> wanted = new HashSet<>(order);
    List<Map<String, Object>> conflicts = new ArrayList<>();
    List<UUID> strangers = new ArrayList<>();
    for (UUID id : order) {
      if (!active.contains(id)) {
        strangers.add(id);
      }
    }
    Map<UUID, UUID> elsewhere = new HashMap<>();
    if (!strangers.isEmpty()) {
      for (Assignment found : groups.assignments(spaceId, eventId, strangers)) {
        elsewhere.put(found.participantId(), found.groupId());
      }
    }
    for (UUID id : strangers) {
      Map<String, Object> conflict = new LinkedHashMap<>();
      conflict.put("participantId", id.toString());
      UUID currentGroupId = elsewhere.get(id);
      conflict.put("currentGroupId", currentGroupId == null ? null : currentGroupId.toString());
      conflicts.add(conflict);
    }
    for (UUID id : active) {
      if (!wanted.contains(id)) {
        Map<String, Object> conflict = new LinkedHashMap<>();
        conflict.put("participantId", id.toString());
        conflict.put("currentGroupId", groupId.toString());
        conflicts.add(conflict);
      }
    }
    if (!conflicts.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("conflicts", conflicts);
      details.put("boardVersion", groups.boardVersion(spaceId, eventId));
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
    }
    List<UUID> next = new ArrayList<>(order);
    for (Assignment member : withdrawn) {
      next.add(member.participantId());
    }
    Map<UUID, Integer> was = new HashMap<>();
    List<UUID> before = new ArrayList<>();
    for (Assignment member : members) {
      was.put(member.participantId(), member.position());
      before.add(member.participantId());
    }
    if (before.equals(next)) {
      return new BoardVersion(groups.boardVersion(spaceId, eventId));
    }
    for (int i = 0; i < next.size(); i++) {
      if (!Objects.equals(was.get(next.get(i)), i)) {
        groups.position(spaceId, eventId, groupId, next.get(i), i);
      }
    }
    return new BoardVersion(groups.bumpBoardVersion(spaceId, eventId, now()));
  }

  @Transactional
  public LeadersWritten leaders(UUID actorId, UUID eventId, UUID groupId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    List<UUID> leaderIds = uuidList(field(body, "participantIds"), "participantIds", LEADERS_MAX);
    if (new HashSet<>(leaderIds).size() != leaderIds.size()) {
      throw invalid("participantIds");
    }
    int expectedVersion = requiredVersion(field(body, "expectedVersion"));
    lockWritable(spaceId, eventId);

    Group group = target(spaceId, eventId, groupId);
    requireVersion(group, expectedVersion);
    Map<UUID, Assignment> members = new LinkedHashMap<>();
    for (Assignment member : groups.members(spaceId, eventId, groupId)) {
      members.put(member.participantId(), member);
    }
    List<String> notMembers = new ArrayList<>();
    for (UUID id : leaderIds) {
      Assignment member = members.get(id);
      if (member == null || !member.submitted()) {
        notMembers.add(id.toString());
      }
    }
    if (!notMembers.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("reason", "LEADER_NOT_MEMBER");
      details.put("participantIds", notMembers);
      throw new SceneException(ErrorCode.CONFLICT, details);
    }
    Set<UUID> wanted = new LinkedHashSet<>(leaderIds);
    List<Assignment> flips = new ArrayList<>();
    for (Assignment member : members.values()) {
      if (member.leader() != wanted.contains(member.participantId())) {
        flips.add(member);
      }
    }
    if (flips.isEmpty()) {
      return new LeadersWritten(group, leaderIds, groups.boardVersion(spaceId, eventId));
    }
    // Clear the old leader before marking the new one: at most one leader row per group.
    flips.sort(Comparator.comparing(Assignment::leader).reversed());
    Instant now = now();
    for (Assignment member : flips) {
      boolean after = !member.leader();
      groups.leader(spaceId, eventId, groupId, member.participantId(), after, actorId, now);
      groups.log(
          spaceId,
          eventId,
          member.participantId(),
          groupId,
          groupId,
          member.leader(),
          after,
          GroupRepository.LEADER,
          actorId,
          now);
    }
    groups.bumpGroupVersion(spaceId, eventId, groupId, now);
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, now);
    return new LeadersWritten(group(spaceId, eventId, groupId), leaderIds, boardVersion);
  }

  private BoardParticipant participant(
      BoardRow row, Snapshot.Placement published, JsonNode setup, List<MealSlots.Day> days) {
    BoardParticipant.Gender gender =
        row.genderOptionId() == null
            ? null
            : new BoardParticipant.Gender(row.genderOptionId(), row.genderLabel());
    String attendance = FULL;
    if (row.attendanceAsked() && row.attendanceOptionId() != null) {
      attendance = ATTENDANCE.getOrDefault(row.attendanceOptionId(), FULL);
    }
    return new BoardParticipant(
        row.participantId(),
        row.name(),
        row.cohort(),
        gender,
        attendance,
        row.middleGroup(),
        row.cell(),
        FormPreset.newcomer(
            tree(row.middleGroupConfig()),
            tree(row.middleGroupAnswer()),
            tree(row.cellConfig()),
            tree(row.cellAnswer())),
        row.groupId(),
        row.leader(),
        row.position(),
        published == null ? null : published.group().groupId(),
        published != null && published.leader(),
        days.isEmpty()
            ? null
            : MealSlots.attended(
                setup,
                days,
                attendance,
                new MealSlots.Answers(
                    tree(row.mealsAnswer()),
                    tree(row.arrivalAnswer()),
                    tree(row.departureAnswer()))));
  }

  private JsonNode tree(String text) {
    return text == null ? null : json.readTree(text);
  }

  private UUID openForWrite(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.GROUP_WRITE)) {
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

  private Group target(UUID spaceId, UUID eventId, UUID groupId) {
    return groups
        .find(spaceId, eventId, groupId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private Group group(UUID spaceId, UUID eventId, UUID groupId) {
    return groups
        .find(spaceId, eventId, groupId)
        .orElseThrow(() -> new IllegalStateException("group row is missing"));
  }

  private static void requireVersion(Group group, int expectedVersion) {
    if (group.version() != expectedVersion) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", group.version()));
    }
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private boolean mayReadBoard(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.GROUP_WRITE)) {
      return true;
    }
    return opened.membership().seesEveryEvent();
  }

  private boolean mayReadPublished(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    return opened.membership().seesEveryEvent();
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

  private static String requiredName(JsonNode body) {
    JsonNode node = field(body, "name");
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

  private static int requiredVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 0) {
      throw invalid("expectedVersion");
    }
    return node.asInt();
  }

  private static long requiredBoardVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
      throw invalid("expectedBoardVersion");
    }
    return node.asLong();
  }

  private static boolean optionalFlag(JsonNode node) {
    if (node == null || node.isNull()) {
      return false;
    }
    if (!node.isBoolean()) {
      throw invalid("confirmUnassigned");
    }
    return node.asBoolean();
  }

  private static int requiredVersion(String value) {
    if (value == null || !value.matches("[0-9]{1,9}")) {
      throw invalid("expectedVersion");
    }
    return Integer.parseInt(value);
  }

  private static List<UUID> uuidList(JsonNode node, String fieldName, int max) {
    if (node == null || !node.isArray() || node.size() > max) {
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
    Set<UUID> seen = new HashSet<>();
    for (JsonNode item : node) {
      if (!item.isObject() || !item.has("fromGroupId") || !item.has("toGroupId")) {
        throw invalid("changes");
      }
      UUID participantId = uuid(item.get("participantId"));
      if (participantId == null || !seen.add(participantId)) {
        throw invalid("changes");
      }
      JsonNode before = item.get("beforeParticipantId");
      out.add(
          new Change(
              participantId,
              nullableUuid(item.get("fromGroupId")),
              nullableUuid(item.get("toGroupId")),
              before == null ? null : nullableUuid(before)));
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

  private record Change(
      UUID participantId, UUID fromGroupId, UUID toGroupId, UUID beforeParticipantId) {}

  /** Working-copy member order: group, then position, then participant id. */
  static final Comparator<ActiveParticipant> MEMBER_ORDER =
      Comparator.comparing(
              ActiveParticipant::groupId, Comparator.nullsLast(Comparator.naturalOrder()))
          .thenComparing(
              ActiveParticipant::position, Comparator.nullsLast(Comparator.naturalOrder()))
          .thenComparing(ActiveParticipant::participantId);

  /** A published member with the current values, in the publication's member order. */
  record PublishedMember(ActiveParticipant participant, boolean leader) {}
}
