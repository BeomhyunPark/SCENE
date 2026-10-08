package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferStatusUpdate {

  private final UUID spaceId;
  private final UUID id;
  private final String status;
  private final String expectedStatus;

  private TransferStatusUpdate(UUID spaceId, UUID id, String status, String expectedStatus) {
    this.spaceId = spaceId;
    this.id = id;
    this.status = status;
    this.expectedStatus = expectedStatus;
  }

  public static TransferStatusUpdate of(
      UUID spaceId, UUID id, String status, String expectedStatus) {
    return new TransferStatusUpdate(spaceId, id, status, expectedStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getId() {
    return id;
  }

  public String getStatus() {
    return status;
  }

  public String getExpectedStatus() {
    return expectedStatus;
  }
}
