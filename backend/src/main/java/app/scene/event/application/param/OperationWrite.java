package app.scene.event.application.param;

import java.time.Instant;
import java.util.UUID;

/** Insert of version 1, or update from {@code expectedVersion} to {@code expectedVersion + 1}. */
public final class OperationWrite {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID applicationId;
  private final String memo;
  private final int expectedVersion;
  private final UUID updatedBy;
  private final Instant updatedAt;

  private OperationWrite(
      UUID spaceId,
      UUID eventId,
      UUID applicationId,
      String memo,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.applicationId = applicationId;
    this.memo = memo;
    this.expectedVersion = expectedVersion;
    this.updatedBy = updatedBy;
    this.updatedAt = updatedAt;
  }

  public static OperationWrite of(
      UUID spaceId,
      UUID eventId,
      UUID applicationId,
      String memo,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    return new OperationWrite(
        spaceId, eventId, applicationId, memo, expectedVersion, updatedBy, updatedAt);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getApplicationId() {
    return applicationId;
  }

  public String getMemo() {
    return memo;
  }

  public int getExpectedVersion() {
    return expectedVersion;
  }

  public UUID getUpdatedBy() {
    return updatedBy;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
