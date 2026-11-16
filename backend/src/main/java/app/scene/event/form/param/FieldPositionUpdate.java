package app.scene.event.form.param;

import java.util.UUID;

/** Moves one field to a new position. */
public final class FieldPositionUpdate {

  private final FieldKey key;
  private final int position;

  private FieldPositionUpdate(FieldKey key, int position) {
    this.key = key;
    this.position = position;
  }

  public static FieldPositionUpdate of(
      UUID spaceId, UUID eventId, UUID formId, UUID fieldId, int position) {
    return new FieldPositionUpdate(FieldKey.of(spaceId, eventId, formId, fieldId), position);
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

  public int getPosition() {
    return position;
  }
}
