package app.scene.event.participant.param;

import java.time.Instant;
import java.util.UUID;

/** One participant session. {@code tokenHash} is the SHA-256 hex of the raw cookie value. */
public final class ParticipantSessionInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID participantId;
  private final UUID participantAccessId;
  private final String tokenHash;
  private final Instant createdAt;

  private ParticipantSessionInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID participantAccessId,
      String tokenHash,
      Instant createdAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.participantId = participantId;
    this.participantAccessId = participantAccessId;
    this.tokenHash = tokenHash;
    this.createdAt = createdAt;
  }

  public static ParticipantSessionInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      UUID participantAccessId,
      String tokenHash,
      Instant createdAt) {
    return new ParticipantSessionInsert(
        id, spaceId, eventId, participantId, participantAccessId, tokenHash, createdAt);
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

  public UUID getParticipantId() {
    return participantId;
  }

  public UUID getParticipantAccessId() {
    return participantAccessId;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
