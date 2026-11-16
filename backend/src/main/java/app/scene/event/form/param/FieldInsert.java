package app.scene.event.form.param;

import java.util.UUID;

/** Values for one field row. A custom field passes a null system key. JSON values are text. */
public final class FieldInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final String kind;
  private final String systemKey;
  private final String label;
  private final int position;
  private final FieldValues values;

  private FieldInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID formId,
      String kind,
      String systemKey,
      String label,
      int position,
      FieldValues values) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.kind = kind;
    this.systemKey = systemKey;
    this.label = label;
    this.position = position;
    this.values = values;
  }

  public static FieldInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID formId,
      String kind,
      String systemKey,
      String label,
      int position,
      FieldValues values) {
    return new FieldInsert(id, spaceId, eventId, formId, kind, systemKey, label, position, values);
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

  public UUID getFormId() {
    return formId;
  }

  public String getKind() {
    return kind;
  }

  public String getSystemKey() {
    return systemKey;
  }

  public String getLabel() {
    return label;
  }

  public int getPosition() {
    return position;
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
