package app.scene.event.group;

import app.scene.event.group.mapper.GroupMapper;
import app.scene.event.group.param.GroupParam;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * {@code groups}, {@code group_assignments}, {@code group_boards}, and {@code
 * group_assignment_logs}, scoped by space and event. Writers hold the event row lock.
 */
@Component
public class GroupRepository {

  static final String MOVE = "MOVE";
  static final String LEADER = "LEADER";
  static final String GROUP_DELETED = "GROUP_DELETED";

  private final GroupMapper groups;

  public GroupRepository(GroupMapper groups) {
    this.groups = groups;
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

  /** Participants of the event among {@code participantIds}. Unknown ids have no item. */
  public List<Assignment> assignments(UUID spaceId, UUID eventId, List<UUID> participantIds) {
    return groups.findAssignments(GroupParam.of(spaceId, eventId).participants(participantIds));
  }

  /** Every assignment row of the group, withdrawn participants included. */
  public List<Assignment> members(UUID spaceId, UUID eventId, UUID groupId) {
    return groups.findMembers(GroupParam.of(spaceId, eventId).group(groupId));
  }

  /** Puts the participant in {@code groupId}, or unassigns when null. The leader mark clears. */
  public void assign(
      UUID spaceId, UUID eventId, UUID participantId, UUID groupId, UUID actorId, Instant at) {
    GroupParam param =
        GroupParam.of(spaceId, eventId)
            .participant(participantId)
            .group(groupId)
            .actor(actorId, at);
    if (groupId == null) {
      groups.deleteAssignment(param);
    } else {
      groups.upsertAssignment(param);
    }
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

  private static void requireOne(int rows) {
    if (rows != 1) {
      throw new IllegalStateException("locked group row changed");
    }
  }
}
