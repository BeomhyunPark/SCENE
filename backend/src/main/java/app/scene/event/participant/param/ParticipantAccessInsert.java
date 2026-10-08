package app.scene.event.participant.param;

import java.time.Instant;
import java.util.UUID;

/** One access-key hash. The raw key is not stored. */
public final class ParticipantAccessInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID participantId;
  private final String keyHash;
  private final Instant createdAt;

  private ParticipantAccessInsert(
      UUID id, UUID spaceId, UUID eventId, UUID participantId, String keyHash, Instant createdAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.participantId = participantId;
    this.keyHash = keyHash;
    this.createdAt = createdAt;
  }

  public static ParticipantAccessInsert of(
      UUID id, UUID spaceId, UUID eventId, UUID participantId, String keyHash, Instant createdAt) {
    return new ParticipantAccessInsert(id, spaceId, eventId, participantId, keyHash, createdAt);
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

  public String getKeyHash() {
    return keyHash;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
