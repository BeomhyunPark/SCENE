package app.scene.event.form.param;

import java.util.UUID;

/** Values for one new form. accepting_applications is fixed false in the statement. */
public final class FormInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;

  private FormInsert(UUID id, UUID spaceId, UUID eventId) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static FormInsert of(UUID id, UUID spaceId, UUID eventId) {
    return new FormInsert(id, spaceId, eventId);
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
}
