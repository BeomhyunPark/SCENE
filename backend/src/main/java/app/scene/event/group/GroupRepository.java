package app.scene.event.group;

import app.scene.event.group.mapper.GroupMapper;
import app.scene.event.group.param.GroupParam;
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
 * {@code groups}, {@code group_assignments}, {@code group_boards}, {@code group_assignment_logs},
 * and {@code group_publications}, scoped by space and event. Writers hold the event row lock.
 */
@Component
public class GroupRepository {

  static final String MOVE = "MOVE";
  static final String LEADER = "LEADER";
  static final String GROUP_DELETED = "GROUP_DELETED";
  static final String WITHDRAWN = "WITHDRAWN";

  private final GroupMapper groups;
  private final JsonMapper json;

  public GroupRepository(GroupMapper groups, JsonMapper json) {
    this.groups = groups;
    this.json = json;
  }

  /** 0 before the first change. */
  public long boardVersion(UUID spaceId, UUID eventId) {
    Long version = groups.findBoardVersion(GroupParam.of(spaceId, eventId));
    return version == null ? 0 : version;
  }

  /** Adds 1 to the board version and returns the new value. */
  public long bumpBoardVersion(UUID spaceId, UUID eventId, Instant at) {
    return groups.bumpBoardVersion(GroupParam.of(spaceId, eventId).at(at));
  }

  /** Every group of the event in board order. */
  public List<Group> groups(UUID spaceId, UUID eventId) {
    return groups.findGroups(GroupParam.of(spaceId, eventId));
  }

  public Optional<Group> find(UUID spaceId, UUID eventId, UUID groupId) {
    return groups.findGroups(GroupParam.of(spaceId, eventId).group(groupId)).stream().findFirst();
  }

  /** Whether a group other than {@code exceptGroupId} has {@code name}. */
  public boolean nameTaken(UUID spaceId, UUID eventId, String name, UUID exceptGroupId) {
    return groups.existsName(GroupParam.of(spaceId, eventId).name(name).group(exceptGroupId));
  }

  /** Adds a group at the end with version 0. */
  public void insert(
      UUID spaceId, UUID eventId, UUID groupId, String name, UUID actorId, Instant at) {
    groups.insertGroup(
        GroupParam.of(spaceId, eventId).group(groupId).name(name).actor(actorId, at));
  }

  public void rename(UUID spaceId, UUID eventId, UUID groupId, String name, Instant at) {
    requireOne(
        groups.updateGroupName(GroupParam.of(spaceId, eventId).group(groupId).name(name).at(at)));
  }

  public void bumpGroupVersion(UUID spaceId, UUID eventId, UUID groupId, Instant at) {
    requireOne(groups.bumpGroupVersion(GroupParam.of(spaceId, eventId).group(groupId).at(at)));
  }

  public void sortOrder(UUID spaceId, UUID eventId, UUID groupId, int sortOrder, Instant at) {
    requireOne(
        groups.updateSortOrder(
            GroupParam.of(spaceId, eventId).group(groupId).sortOrder(sortOrder).at(at)));
  }

  /** Removes the group's assignment rows, then the group. */
  public void delete(UUID spaceId, UUID eventId, UUID groupId) {
    GroupParam param = GroupParam.of(spaceId, eventId).group(groupId);
    groups.deleteGroupAssignments(param);
    requireOne(groups.deleteGroup(param));
  }

  public List<BoardRow> boardParticipants(UUID spaceId, UUID eventId) {
    return groups.findBoardParticipants(GroupParam.of(spaceId, eventId));
  }

  public List<WithdrawnParticipant> withdrawn(UUID spaceId, UUID eventId) {
    return groups.findWithdrawn(GroupParam.of(spaceId, eventId));
  }

  /** From group of the participant's latest withdraw history row (DEC-084), or null. */
  public UUID withdrawnFromGroup(UUID spaceId, UUID eventId, UUID participantId) {
    return groups.findWithdrawnFromGroup(
        GroupParam.of(spaceId, eventId).participant(participantId));
  }

  /** Participants of the event among {@code participantIds}. Unknown ids have no item. */
  public List<Assignment> assignments(UUID spaceId, UUID eventId, List<UUID> participantIds) {
    return groups.findAssignments(GroupParam.of(spaceId, eventId).participants(participantIds));
  }

  /** Every assignment row of the group, withdrawn participants included. */
  public List<Assignment> members(UUID spaceId, UUID eventId, UUID groupId) {
    return groups.findMembers(GroupParam.of(spaceId, eventId).group(groupId));
  }

  /**
   * Puts the participant in {@code groupId} at {@code position}, or unassigns when {@code groupId}
   * is null. The leader mark clears.
   */
  public void assign(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID groupId,
      int position,
      UUID actorId,
      Instant at) {
    GroupParam param =
        GroupParam.of(spaceId, eventId)
            .participant(participantId)
            .group(groupId)
            .sortOrder(position)
            .actor(actorId, at);
    if (groupId == null) {
      groups.deleteAssignment(param);
    } else {
      groups.upsertAssignment(param);
    }
  }

  /** Sets the order of a member of {@code groupId} within the group. */
  public void position(UUID spaceId, UUID eventId, UUID groupId, UUID participantId, int position) {
    requireOne(
        groups.updatePosition(
            GroupParam.of(spaceId, eventId)
                .group(groupId)
                .participant(participantId)
                .sortOrder(position)));
  }

  public void leader(
      UUID spaceId,
      UUID eventId,
      UUID groupId,
      UUID participantId,
      boolean leader,
      UUID actorId,
      Instant at) {
    requireOne(
        groups.updateLeader(
            GroupParam.of(spaceId, eventId)
                .group(groupId)
                .participant(participantId)
                .leader(leader)
                .actor(actorId, at)));
  }

  public void log(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID fromGroupId,
      UUID toGroupId,
      boolean leaderBefore,
      boolean leaderAfter,
      String cause,
      UUID actorId,
      Instant at) {
    groups.insertLog(
        GroupParam.of(spaceId, eventId)
            .participant(participantId)
            .log(UUID.randomUUID(), fromGroupId, toGroupId, leaderBefore, leaderAfter, cause)
            .actor(actorId, at));
  }

  /** Every active participant of the event by name, then id. */
  public List<ActiveParticipant> active(UUID spaceId, UUID eventId) {
    return groups.findActive(GroupParam.of(spaceId, eventId));
  }

  /** Active participants among {@code participantIds} by name, then id. */
  public List<ActiveParticipant> active(UUID spaceId, UUID eventId, List<UUID> participantIds) {
    if (participantIds.isEmpty()) {
      return List.of();
    }
    return groups.findActive(GroupParam.of(spaceId, eventId).participants(participantIds));
  }

  /**
   * The latest publication by insertion order, or empty before the first one. Members whose
   * assignment a withdraw removed after that publication are left out of the snapshot read back
   * (DEC-084 §3, DEC-044): a restored person must not get the old group or leader mark back from
   * the old publication. The stored row is unchanged.
   */
  public Optional<Publication> latestPublication(UUID spaceId, UUID eventId) {
    PublicationRow row = groups.findLatestPublication(GroupParam.of(spaceId, eventId));
    if (row == null) {
      return Optional.empty();
    }
    Snapshot snapshot = json.readValue(row.snapshot(), Snapshot.class);
    Set<UUID> removed =
        new HashSet<>(
            groups.findWithdrawnSince(GroupParam.of(spaceId, eventId).at(row.publishedAt())));
    if (!removed.isEmpty()) {
      List<Snapshot.SnapshotGroup> kept = new ArrayList<>();
      for (Snapshot.SnapshotGroup group : snapshot.groups()) {
        List<Snapshot.SnapshotMember> members = new ArrayList<>();
        for (Snapshot.SnapshotMember member : group.members()) {
          if (!removed.contains(member.participantId())) {
            members.add(member);
          }
        }
        kept.add(
            new Snapshot.SnapshotGroup(group.groupId(), group.name(), group.sortOrder(), members));
      }
      snapshot = new Snapshot(kept);
    }
    return Optional.of(
        new Publication(
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
      Snapshot snapshot,
      UUID actorId,
      Instant at) {
    groups.insertPublication(
        GroupParam.of(spaceId, eventId)
            .publication(publicationId, boardVersion, json.writeValueAsString(snapshot))
            .actor(actorId, at));
  }

  private static void requireOne(int rows) {
    if (rows != 1) {
      throw new IllegalStateException("locked group row changed");
    }
  }
}
