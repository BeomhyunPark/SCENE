package app.scene.event.rostersheet.param;

import java.util.UUID;

/** The sheet of one event. */
public final class RosterSheetKey {

  private final UUID spaceId;
  private final UUID eventId;

  private RosterSheetKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static RosterSheetKey of(UUID spaceId, UUID eventId) {
    return new RosterSheetKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
