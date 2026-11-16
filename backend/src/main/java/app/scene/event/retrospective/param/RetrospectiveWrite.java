package app.scene.event.retrospective.param;

import java.time.Instant;
import java.util.UUID;

/** Insert of version 1, or update from {@code expectedVersion} to {@code expectedVersion + 1}. */
public final class RetrospectiveWrite {

  private final UUID spaceId;
  private final UUID eventId;
  private final String body;
  private final int expectedVersion;
  private final UUID updatedBy;
  private final Instant updatedAt;

  private RetrospectiveWrite(
      UUID spaceId,
      UUID eventId,
      String body,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.body = body;
    this.expectedVersion = expectedVersion;
    this.updatedBy = updatedBy;
    this.updatedAt = updatedAt;
  }

  public static RetrospectiveWrite of(
      UUID spaceId,
      UUID eventId,
      String body,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    return new RetrospectiveWrite(spaceId, eventId, body, expectedVersion, updatedBy, updatedAt);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getBody() {
    return body;
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
