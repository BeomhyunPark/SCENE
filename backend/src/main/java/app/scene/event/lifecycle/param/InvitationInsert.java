package app.scene.event.lifecycle.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final String emailNormalized;
  private final String role;
  private final String tokenHash;
  private final String status;
  private final Instant expiresAt;
  private final UUID invitedBy;
  private final Instant now;

  private InvitationInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String emailNormalized,
      String role,
      String tokenHash,
      String status,
      Instant expiresAt,
      UUID invitedBy,
      Instant now) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.emailNormalized = emailNormalized;
    this.role = role;
    this.tokenHash = tokenHash;
    this.status = status;
    this.expiresAt = expiresAt;
    this.invitedBy = invitedBy;
    this.now = now;
  }

  public static InvitationInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String emailNormalized,
      String role,
      String tokenHash,
      String status,
      Instant expiresAt,
      UUID invitedBy,
      Instant now) {
    return new InvitationInsert(
        id, spaceId, eventId, emailNormalized, role, tokenHash, status, expiresAt, invitedBy, now);
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

  public String getEmailNormalized() {
    return emailNormalized;
  }

  public String getRole() {
    return role;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public String getStatus() {
    return status;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public UUID getInvitedBy() {
    return invitedBy;
  }

  public Instant getNow() {
    return now;
  }
}
