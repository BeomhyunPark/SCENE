package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID fromUserId;
  private final UUID toUserId;

  private TransferInsert(UUID id, UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.fromUserId = fromUserId;
    this.toUserId = toUserId;
  }

  public static TransferInsert of(
      UUID id, UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId) {
    return new TransferInsert(id, spaceId, eventId, fromUserId, toUserId);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getFromUserId() {
    return fromUserId;
  }

  public UUID getToUserId() {
    return toUserId;
  }
}
