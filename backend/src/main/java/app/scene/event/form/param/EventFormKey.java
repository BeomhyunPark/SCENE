package app.scene.event.form.param;

import java.util.UUID;

/** The form that belongs to one event, if one exists. */
public final class EventFormKey {

  private final UUID spaceId;
  private final UUID eventId;

  private EventFormKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static EventFormKey of(UUID spaceId, UUID eventId) {
    return new EventFormKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
