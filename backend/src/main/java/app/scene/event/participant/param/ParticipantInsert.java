package app.scene.event.participant.param;

import java.time.Instant;
import java.util.UUID;

/** One participant identity row. Status is omitted because the values are unset. */
public final class ParticipantInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final String name;
  private final String phone;
  private final String phoneHash;
  private final String phoneLast4;
  private final Instant createdAt;
  private final Instant updatedAt;

  private ParticipantInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String name,
      String phone,
      String phoneHash,
      String phoneLast4,
      Instant createdAt,
      Instant updatedAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.name = name;
    this.phone = phone;
    this.phoneHash = phoneHash;
    this.phoneLast4 = phoneLast4;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public static ParticipantInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String name,
      String phone,
      String phoneHash,
      String phoneLast4,
      Instant createdAt,
      Instant updatedAt) {
    return new ParticipantInsert(
        id, spaceId, eventId, name, phone, phoneHash, phoneLast4, createdAt, updatedAt);
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

  public String getName() {
    return name;
  }

  public String getPhone() {
    return phone;
  }

  public String getPhoneHash() {
    return phoneHash;
  }

  public String getPhoneLast4() {
    return phoneLast4;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
