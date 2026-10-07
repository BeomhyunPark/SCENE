package app.scene.event.transfer.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferAcceptUpdate {

  private final UUID spaceId;
  private final UUID id;
  private final String priorRole;
  private final Instant acceptedAt;
  private final Instant endsAt;
  private final String snapshot;
  private final String handoverStatus;
  private final String pendingStatus;

  private TransferAcceptUpdate(
      UUID spaceId,
      UUID id,
      String priorRole,
      Instant acceptedAt,
      Instant endsAt,
      String snapshot,
      String handoverStatus,
      String pendingStatus) {
    this.spaceId = spaceId;
    this.id = id;
    this.priorRole = priorRole;
    this.acceptedAt = acceptedAt;
    this.endsAt = endsAt;
    this.snapshot = snapshot;
    this.handoverStatus = handoverStatus;
    this.pendingStatus = pendingStatus;
  }

  public static TransferAcceptUpdate of(
      UUID spaceId,
      UUID id,
      String priorRole,
      Instant acceptedAt,
      Instant endsAt,
      String snapshot,
      String handoverStatus,
      String pendingStatus) {
    return new TransferAcceptUpdate(
        spaceId, id, priorRole, acceptedAt, endsAt, snapshot, handoverStatus, pendingStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getId() {
    return id;
  }

  public String getPriorRole() {
    return priorRole;
  }

  public Instant getAcceptedAt() {
    return acceptedAt;
  }

  public Instant getEndsAt() {
    return endsAt;
  }

  public String getSnapshot() {
    return snapshot;
  }

  public String getHandoverStatus() {
    return handoverStatus;
  }

  public String getPendingStatus() {
    return pendingStatus;
  }
}
