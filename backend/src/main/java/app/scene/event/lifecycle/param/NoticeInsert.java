package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class NoticeInsert {

  private final UUID spaceId;
  private final UUID eventId;
  private final String kind;
  private final Instant now;
  private final String ownerRole;
  private final List<String> authorityStatuses;

  private NoticeInsert(
      UUID spaceId,
      UUID eventId,
      String kind,
      Instant now,
      String ownerRole,
      List<String> authorityStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.kind = kind;
    this.now = now;
    this.ownerRole = ownerRole;
    this.authorityStatuses = authorityStatuses;
  }

  public static NoticeInsert of(
      UUID spaceId,
      UUID eventId,
      String kind,
      Instant now,
      String ownerRole,
      List<String> authorityStatuses) {
    return new NoticeInsert(spaceId, eventId, kind, now, ownerRole, authorityStatuses);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getKind() {
    return kind;
  }

  public Instant getNow() {
    return now;
  }

  public String getOwnerRole() {
    return ownerRole;
  }

  public List<String> getAuthorityStatuses() {
    return authorityStatuses;
  }
}
