package app.scene.event.room.param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Mapper parameter for room reads and writes. Unused fields stay null. */
public final class RoomParam {

  private final UUID spaceId;
  private final UUID eventId;
  private UUID roomId;
  private String name;
  private String locationNote;
  private Integer capacity;
  private String genderOptionId;
  private int sortOrder;
  private UUID participantId;
  private List<UUID> participantIds;
  private String basis;
  private UUID logId;
  private UUID fromRoomId;
  private UUID toRoomId;
  private String cause;
  private UUID actorUserId;
  private Instant at;
  private UUID publicationId;
  private long boardVersion;
  private String snapshot;

  private RoomParam(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static RoomParam of(UUID spaceId, UUID eventId) {
    return new RoomParam(spaceId, eventId);
  }

  public RoomParam room(UUID value) {
    this.roomId = value;
    return this;
  }

  /** Name, location note, capacity and gender option of a room. */
  public RoomParam values(String nameValue, String note, Integer capacityValue, String gender) {
    this.name = nameValue;
    this.locationNote = note;
    this.capacity = capacityValue;
    this.genderOptionId = gender;
    return this;
  }

  public RoomParam name(String value) {
    this.name = value;
    return this;
  }

  public RoomParam sortOrder(int value) {
    this.sortOrder = value;
    return this;
  }

  public RoomParam participant(UUID value) {
    this.participantId = value;
    return this;
  }

  public RoomParam participants(List<UUID> value) {
    this.participantIds = value;
    return this;
  }

  public RoomParam basis(String value) {
    this.basis = value;
    return this;
  }

  public RoomParam log(UUID id, UUID from, UUID to, String causeValue) {
    this.logId = id;
    this.fromRoomId = from;
    this.toRoomId = to;
    this.cause = causeValue;
    return this;
  }

  public RoomParam actor(UUID userId, Instant when) {
    this.actorUserId = userId;
    this.at = when;
    return this;
  }

  public RoomParam publication(UUID id, long version, String snapshotJson) {
    this.publicationId = id;
    this.boardVersion = version;
    this.snapshot = snapshotJson;
    return this;
  }

  public RoomParam at(Instant when) {
    this.at = when;
    return this;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getRoomId() {
    return roomId;
  }

  public String getName() {
    return name;
  }

  public String getLocationNote() {
    return locationNote;
  }

  public Integer getCapacity() {
    return capacity;
  }

  public String getGenderOptionId() {
    return genderOptionId;
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

  public String getBasis() {
    return basis;
  }

  public UUID getLogId() {
    return logId;
  }

  public UUID getFromRoomId() {
    return fromRoomId;
  }

  public UUID getToRoomId() {
    return toRoomId;
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

  public UUID getPublicationId() {
    return publicationId;
  }

  public long getBoardVersion() {
    return boardVersion;
  }

  public String getSnapshot() {
    return snapshot;
  }
}
