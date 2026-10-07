package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationRevoke {

  private final UUID spaceId;
  private final UUID eventId;
  private final Instant now;
  private final String revokedStatus;
  private final String pendingStatus;

  private InvitationRevoke(
      UUID spaceId, UUID eventId, Instant now, String revokedStatus, String pendingStatus) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.now = now;
    this.revokedStatus = revokedStatus;
    this.pendingStatus = pendingStatus;
  }

  public static InvitationRevoke of(
      UUID spaceId, UUID eventId, Instant now, String revokedStatus, String pendingStatus) {
    return new InvitationRevoke(spaceId, eventId, now, revokedStatus, pendingStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public Instant getNow() {
    return now;
  }

  public String getRevokedStatus() {
    return revokedStatus;
  }

  public String getPendingStatus() {
    return pendingStatus;
  }
}
