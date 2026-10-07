package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationAccept {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID acceptedUserId;
  private final Instant now;
  private final String acceptedStatus;
  private final String pendingStatus;

  private InvitationAccept(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID acceptedUserId,
      Instant now,
      String acceptedStatus,
      String pendingStatus) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.acceptedUserId = acceptedUserId;
    this.now = now;
    this.acceptedStatus = acceptedStatus;
    this.pendingStatus = pendingStatus;
  }

  public static InvitationAccept of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID acceptedUserId,
      Instant now,
      String acceptedStatus,
      String pendingStatus) {
    return new InvitationAccept(
        id, spaceId, eventId, acceptedUserId, now, acceptedStatus, pendingStatus);
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

  public UUID getAcceptedUserId() {
    return acceptedUserId;
  }

  public Instant getNow() {
    return now;
  }

  public String getAcceptedStatus() {
    return acceptedStatus;
  }

  public String getPendingStatus() {
    return pendingStatus;
  }
}
