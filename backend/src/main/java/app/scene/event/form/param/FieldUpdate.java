package app.scene.event.form.param;

import java.util.UUID;

/** Replaces a field's label and settings. Kind, system key, and position stay. */
public final class FieldUpdate {

  private final FieldKey key;
  private final String label;
  private final FieldValues values;

  private FieldUpdate(FieldKey key, String label, FieldValues values) {
    this.key = key;
    this.label = label;
    this.values = values;
  }

  public static FieldUpdate of(
      UUID spaceId, UUID eventId, UUID formId, UUID fieldId, String label, FieldValues values) {
    return new FieldUpdate(FieldKey.of(spaceId, eventId, formId, fieldId), label, values);
  }

  public UUID getSpaceId() {
    return key.getSpaceId();
  }

  public UUID getEventId() {
    return key.getEventId();
  }

  public UUID getFormId() {
    return key.getFormId();
  }

  public UUID getFieldId() {
    return key.getFieldId();
  }

  public String getLabel() {
    return label;
  }

  public String getAnswerType() {
    return values.answerType();
  }

  public boolean isRequired() {
    return values.required();
  }

  public String getDescription() {
    return values.description();
  }

  public String getConfig() {
    return values.config();
  }

  public String getShowWhen() {
    return values.showWhen();
  }

  public boolean isHidden() {
    return values.hidden();
  }
}
