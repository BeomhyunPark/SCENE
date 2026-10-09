package app.scene.event.participant.param;

import java.util.UUID;

/** Access-key lookup. The value is the stored hash, not the raw key. */
public final class ParticipantAccessKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final String keyHash;

  private ParticipantAccessKey(UUID spaceId, UUID eventId, String keyHash) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.keyHash = keyHash;
  }

  public static ParticipantAccessKey of(UUID spaceId, UUID eventId, String keyHash) {
    return new ParticipantAccessKey(spaceId, eventId, keyHash);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getKeyHash() {
    return keyHash;
  }
}
