package app.scene.event.form.param;

import java.util.UUID;

/** One form inside its event. */
public final class FormKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;

  private FormKey(UUID spaceId, UUID eventId, UUID formId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
  }

  public static FormKey of(UUID spaceId, UUID eventId, UUID formId) {
    return new FormKey(spaceId, eventId, formId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getFormId() {
    return formId;
  }
}
