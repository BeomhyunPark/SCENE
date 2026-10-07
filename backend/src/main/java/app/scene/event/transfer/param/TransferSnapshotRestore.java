package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferSnapshotRestore {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String snapshot;

  private TransferSnapshotRestore(UUID spaceId, UUID eventId, UUID userId, String snapshot) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.snapshot = snapshot;
  }

  public static TransferSnapshotRestore of(
      UUID spaceId, UUID eventId, UUID userId, String snapshot) {
    return new TransferSnapshotRestore(spaceId, eventId, userId, snapshot);
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

  public String getSnapshot() {
    return snapshot;
  }
}
