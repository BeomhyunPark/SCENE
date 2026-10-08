package app.scene.event.application.param;

import java.util.UUID;

/** One application inside its event. */
public final class ApplicationKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID applicationId;

  private ApplicationKey(UUID spaceId, UUID eventId, UUID applicationId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.applicationId = applicationId;
  }

  public static ApplicationKey of(UUID spaceId, UUID eventId, UUID applicationId) {
    return new ApplicationKey(spaceId, eventId, applicationId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getApplicationId() {
    return applicationId;
  }
}
