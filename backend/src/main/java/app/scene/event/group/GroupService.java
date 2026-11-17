package app.scene.event.group;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.SpaceMembership;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Group assignment working copy (#299, DEC-072, api.md "조 편성"). The board read needs effective
 * {@code GROUP_WRITE} or an active space owner or admin; every write needs effective {@code
 * GROUP_WRITE}. Writes run 404 → 403 → 400 → 409 state → 404 target → 409 version or conflict → 409
 * rule → result, and lock the event row, so writes of one event commit one after another.
 *
 * <p>Edits go to {@code group_assignment_logs}, not to audit. Names, phones, and answers never go
 * to the history or to logs. Participants without a SUBMITTED application drop out of every read.
 */
@Service
public class GroupService {

  public static final int NAME_MAX = 50;
  public static final int GROUPS_MAX = 100;
  public static final int CHANGES_MAX = 200;
  public static final int LEADERS_MAX = 3;

  static final String FULL = "FULL";

  private static final Map<String, String> ATTENDANCE =
      Map.of("opt_full", FULL, "opt_partial", "PARTIAL", "opt_worship", "WORSHIP_ONLY");

  private final EventAccessGate gate;
  private final EventRepository events;
  private final GroupRepository groups;
  private final EventUserPermissionRepository permissions;
  private final Clock clock;

  public GroupService(
      EventAccessGate gate,
      EventRepository events,
      GroupRepository groups,
      EventUserPermissionRepository permissions,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.groups = groups;
    this.permissions = permissions;
    this.clock = clock;
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
    List<BoardParticipant> participants = new ArrayList<>();
    long assigned = 0;
    for (BoardRow row : groups.boardParticipants(spaceId, eventId)) {
      if (row.groupId() != null) {
        assigned++;
      }
      participants.add(participant(row));
    }
    long active = participants.size();
    // #300 compares with the latest publication. Until then nothing is published, so every
    // assigned person and every group is an unpublished change.
    long changedParticipants = assigned;
    long groupChanges = list.size();
    PublicationSummary publication =
        new PublicationSummary(
            null,
            null,
            null,
            active,
            assigned,
            active - assigned,
            changedParticipants,
            groupChanges,
            changedParticipants != 0 || groupChanges != 0);
    return new GroupBoard(
        event.lifecycleStatus(),
        groups.boardVersion(spaceId, eventId),
        list,
        participants,
        groups.withdrawn(spaceId, eventId),
        publication);
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
    for (Change change : moves) {
      Assignment before = current.get(change.participantId());
      groups.assign(spaceId, eventId, change.participantId(), change.toGroupId(), actorId, at);
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
    long boardVersion = groups.bumpBoardVersion(spaceId, eventId, at);
    return new Assigned(moves.size(), alreadyApplied, boardVersion);
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

  private static BoardParticipant participant(BoardRow row) {
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
        row.groupId(),
        row.leader(),
        null,
        false);
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
    SpaceMembership membership = opened.membership();
    return membership.kind() == SpaceMembership.Kind.ACTIVE
        && ("OWNER".equals(membership.role()) || "ADMIN".equals(membership.role()));
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
      out.add(
          new Change(
              participantId,
              nullableUuid(item.get("fromGroupId")),
              nullableUuid(item.get("toGroupId"))));
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

  private record Change(UUID participantId, UUID fromGroupId, UUID toGroupId) {}
}
