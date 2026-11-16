package app.scene.event.form.param;

import java.util.UUID;

/** Replaces the preset state of one generated question (DEC-070). */
public final class FieldPresetStateUpdate {

  private final FieldKey key;
  private final String presetState;

  private FieldPresetStateUpdate(FieldKey key, String presetState) {
    this.key = key;
    this.presetState = presetState;
  }

  public static FieldPresetStateUpdate of(
      UUID spaceId, UUID eventId, UUID formId, UUID fieldId, String presetState) {
    return new FieldPresetStateUpdate(FieldKey.of(spaceId, eventId, formId, fieldId), presetState);
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

  public String getPresetState() {
    return presetState;
  }
}
