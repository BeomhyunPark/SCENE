package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferStatusQuery {

  private final UUID spaceId;
  private final UUID userId;
  private final String pendingStatus;

  private TransferStatusQuery(UUID spaceId, UUID userId, String pendingStatus) {
    this.spaceId = spaceId;
    this.userId = userId;
    this.pendingStatus = pendingStatus;
  }

  public static TransferStatusQuery of(UUID spaceId, UUID userId, String pendingStatus) {
    return new TransferStatusQuery(spaceId, userId, pendingStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getPendingStatus() {
    return pendingStatus;
  }
}
