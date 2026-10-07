package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferLockKey {

  private final UUID spaceId;
  private final UUID id;

  private TransferLockKey(UUID spaceId, UUID id) {
    this.spaceId = spaceId;
    this.id = id;
  }

  public static TransferLockKey of(UUID spaceId, UUID id) {
    return new TransferLockKey(spaceId, id);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getId() {
    return id;
  }
}
