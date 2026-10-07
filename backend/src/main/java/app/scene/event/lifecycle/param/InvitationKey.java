package app.scene.event.lifecycle.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID id;

  private InvitationKey(UUID spaceId, UUID eventId, UUID id) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.id = id;
  }

  public static InvitationKey of(UUID spaceId, UUID eventId, UUID id) {
    return new InvitationKey(spaceId, eventId, id);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getId() {
    return id;
  }
}
