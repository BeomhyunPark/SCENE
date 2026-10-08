package app.scene.event.form.param;

import java.util.UUID;

/** One field inside its form. */
public final class FieldKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final UUID fieldId;

  private FieldKey(UUID spaceId, UUID eventId, UUID formId, UUID fieldId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.fieldId = fieldId;
  }

  public static FieldKey of(UUID spaceId, UUID eventId, UUID formId, UUID fieldId) {
    return new FieldKey(spaceId, eventId, formId, fieldId);
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

  public UUID getFieldId() {
    return fieldId;
  }
}
