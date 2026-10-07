package app.scene.common.audit;

import java.time.Instant;
import java.util.UUID;

/** One row inserted into {@code audit_logs}. */
public final class AuditLog {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID actorUserId;
  private final String action;
  private final String detail;
  private final Instant occurredAt;

  private AuditLog(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      String detail,
      Instant occurredAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.actorUserId = actorUserId;
    this.action = action;
    this.detail = detail;
    this.occurredAt = occurredAt;
  }

  public static AuditLog of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      String detail,
      Instant occurredAt) {
    return new AuditLog(id, spaceId, eventId, actorUserId, action, detail, occurredAt);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getActorUserId() {
    return actorUserId;
  }

  public String getAction() {
    return action;
  }

  public String getDetail() {
    return detail;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }
}
