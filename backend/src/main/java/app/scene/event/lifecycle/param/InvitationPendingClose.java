package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationPendingClose {

  private final UUID spaceId;
  private final UUID eventId;
  private final String emailNormalized;
  private final Instant now;
  private final String supersededStatus;
  private final String pendingStatus;

  private InvitationPendingClose(
      UUID spaceId,
      UUID eventId,
      String emailNormalized,
      Instant now,
      String supersededStatus,
      String pendingStatus) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.emailNormalized = emailNormalized;
    this.now = now;
    this.supersededStatus = supersededStatus;
    this.pendingStatus = pendingStatus;
  }

  public static InvitationPendingClose of(
      UUID spaceId,
      UUID eventId,
      String emailNormalized,
      Instant now,
      String supersededStatus,
      String pendingStatus) {
    return new InvitationPendingClose(
        spaceId, eventId, emailNormalized, now, supersededStatus, pendingStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getEmailNormalized() {
    return emailNormalized;
  }

  public Instant getNow() {
    return now;
  }

  public String getSupersededStatus() {
    return supersededStatus;
  }

  public String getPendingStatus() {
    return pendingStatus;
  }
}
