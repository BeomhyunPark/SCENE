package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferCompleteUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String completedStatus;
  private final String handoverStatus;

  private TransferCompleteUpdate(
      UUID spaceId, UUID eventId, UUID userId, String completedStatus, String handoverStatus) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.completedStatus = completedStatus;
    this.handoverStatus = handoverStatus;
  }

  public static TransferCompleteUpdate of(
      UUID spaceId, UUID eventId, UUID userId, String completedStatus, String handoverStatus) {
    return new TransferCompleteUpdate(spaceId, eventId, userId, completedStatus, handoverStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getCompletedStatus() {
    return completedStatus;
  }

  public String getHandoverStatus() {
    return handoverStatus;
  }
}
