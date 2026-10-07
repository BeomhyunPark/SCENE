package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class LifecycleTransitionInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final String command;
  private final String fromStatus;
  private final String toStatus;
  private final UUID actorUserId;
  private final String actedAs;
  private final String reason;
  private final String warningsSnapshot;
  private final Instant occurredAt;

  private LifecycleTransitionInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String command,
      String fromStatus,
      String toStatus,
      UUID actorUserId,
      String actedAs,
      String reason,
      String warningsSnapshot,
      Instant occurredAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.command = command;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.actorUserId = actorUserId;
    this.actedAs = actedAs;
    this.reason = reason;
    this.warningsSnapshot = warningsSnapshot;
    this.occurredAt = occurredAt;
  }

  public static LifecycleTransitionInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String command,
      String fromStatus,
      String toStatus,
      UUID actorUserId,
      String actedAs,
      String reason,
      String warningsSnapshot,
      Instant occurredAt) {
    return new LifecycleTransitionInsert(
        id,
        spaceId,
        eventId,
        command,
        fromStatus,
        toStatus,
        actorUserId,
        actedAs,
        reason,
        warningsSnapshot,
        occurredAt);
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

  public String getCommand() {
    return command;
  }

  public String getFromStatus() {
    return fromStatus;
  }

  public String getToStatus() {
    return toStatus;
  }

  public UUID getActorUserId() {
    return actorUserId;
  }

  public String getActedAs() {
    return actedAs;
  }

  public String getReason() {
    return reason;
  }

  public String getWarningsSnapshot() {
    return warningsSnapshot;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }
}
