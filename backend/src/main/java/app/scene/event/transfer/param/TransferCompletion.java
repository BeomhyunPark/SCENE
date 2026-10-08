package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferCompletion {

  private final UUID spaceId;
  private final UUID id;
  private final String completedStatus;
  private final String handoverStatus;

  private TransferCompletion(UUID spaceId, UUID id, String completedStatus, String handoverStatus) {
    this.spaceId = spaceId;
    this.id = id;
    this.completedStatus = completedStatus;
    this.handoverStatus = handoverStatus;
  }

  public static TransferCompletion of(
      UUID spaceId, UUID id, String completedStatus, String handoverStatus) {
    return new TransferCompletion(spaceId, id, completedStatus, handoverStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getId() {
    return id;
  }

  public String getCompletedStatus() {
    return completedStatus;
  }

  public String getHandoverStatus() {
    return handoverStatus;
  }
}
