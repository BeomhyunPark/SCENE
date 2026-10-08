package app.scene.event.form.param;

import java.util.UUID;

/** Label-only update. Kind and system key stay on the row. */
public final class FieldLabelUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final UUID fieldId;
  private final String label;

  private FieldLabelUpdate(UUID spaceId, UUID eventId, UUID formId, UUID fieldId, String label) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.fieldId = fieldId;
    this.label = label;
  }

  public static FieldLabelUpdate of(
      UUID spaceId, UUID eventId, UUID formId, UUID fieldId, String label) {
    return new FieldLabelUpdate(spaceId, eventId, formId, fieldId, label);
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

  public String getLabel() {
    return label;
  }
}
