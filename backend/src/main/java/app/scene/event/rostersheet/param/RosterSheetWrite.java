package app.scene.event.rostersheet.param;

import java.time.Instant;
import java.util.UUID;

/** Insert of version 1, or update from {@code expectedVersion} to {@code expectedVersion + 1}. */
public final class RosterSheetWrite {

  private final UUID spaceId;
  private final UUID eventId;
  private final String doc;
  private final int expectedVersion;
  private final UUID updatedBy;
  private final Instant updatedAt;

  private RosterSheetWrite(
      UUID spaceId,
      UUID eventId,
      String doc,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.doc = doc;
    this.expectedVersion = expectedVersion;
    this.updatedBy = updatedBy;
    this.updatedAt = updatedAt;
  }

  public static RosterSheetWrite of(
      UUID spaceId,
      UUID eventId,
      String doc,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    return new RosterSheetWrite(spaceId, eventId, doc, expectedVersion, updatedBy, updatedAt);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getDoc() {
    return doc;
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
