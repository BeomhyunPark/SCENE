package app.scene.event.task.param;

import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class OpenTaskQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final List<String> openStatuses;

  private OpenTaskQuery(UUID spaceId, UUID eventId, List<String> openStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.openStatuses = openStatuses;
  }

  public static OpenTaskQuery of(UUID spaceId, UUID eventId, List<String> openStatuses) {
    return new OpenTaskQuery(spaceId, eventId, openStatuses);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public List<String> getOpenStatuses() {
    return openStatuses;
  }
}
