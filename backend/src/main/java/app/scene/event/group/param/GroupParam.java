package app.scene.event.group.param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Mapper parameter for group reads and writes. Unused fields stay null. */
public final class GroupParam {

  private final UUID spaceId;
  private final UUID eventId;
  private UUID groupId;
  private String name;
  private int sortOrder;
  private UUID participantId;
  private List<UUID> participantIds;
  private boolean leader;
  private UUID logId;
  private UUID fromGroupId;
  private UUID toGroupId;
  private boolean leaderBefore;
  private boolean leaderAfter;
  private String cause;
  private UUID actorUserId;
  private Instant at;

  private GroupParam(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static GroupParam of(UUID spaceId, UUID eventId) {
    return new GroupParam(spaceId, eventId);
  }

  public GroupParam group(UUID value) {
    this.groupId = value;
    return this;
  }

  public GroupParam name(String value) {
    this.name = value;
    return this;
  }

  public GroupParam sortOrder(int value) {
    this.sortOrder = value;
    return this;
  }

  public GroupParam participant(UUID value) {
    this.participantId = value;
    return this;
  }

  public GroupParam participants(List<UUID> value) {
    this.participantIds = value;
    return this;
  }

  public GroupParam leader(boolean value) {
    this.leader = value;
    return this;
  }

  public GroupParam log(
      UUID id, UUID from, UUID to, boolean before, boolean after, String causeValue) {
    this.logId = id;
    this.fromGroupId = from;
    this.toGroupId = to;
    this.leaderBefore = before;
    this.leaderAfter = after;
    this.cause = causeValue;
    return this;
  }

  public GroupParam actor(UUID userId, Instant when) {
    this.actorUserId = userId;
    this.at = when;
    return this;
  }

  public GroupParam at(Instant when) {
    this.at = when;
    return this;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getGroupId() {
    return groupId;
  }

  public String getName() {
    return name;
  }

  public int getSortOrder() {
    return sortOrder;
  }

  public UUID getParticipantId() {
    return participantId;
  }

  public List<UUID> getParticipantIds() {
    return participantIds;
  }

  public boolean isLeader() {
    return leader;
  }

  public UUID getLogId() {
    return logId;
  }

  public UUID getFromGroupId() {
    return fromGroupId;
  }

  public UUID getToGroupId() {
    return toGroupId;
  }

  public boolean isLeaderBefore() {
    return leaderBefore;
  }

  public boolean isLeaderAfter() {
    return leaderAfter;
  }

  public String getCause() {
    return cause;
  }

  public UUID getActorUserId() {
    return actorUserId;
  }

  public Instant getAt() {
    return at;
  }
}
