package app.scene.event.application.param;

import java.util.UUID;

/** One submitted scalar. {@code value} is JSON text such as {@code {"text":"..."}}. */
public final class AnswerInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID applicationId;
  private final UUID fieldId;
  private final String value;

  private AnswerInsert(
      UUID id, UUID spaceId, UUID eventId, UUID applicationId, UUID fieldId, String value) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.applicationId = applicationId;
    this.fieldId = fieldId;
    this.value = value;
  }

  public static AnswerInsert of(
      UUID id, UUID spaceId, UUID eventId, UUID applicationId, UUID fieldId, String value) {
    return new AnswerInsert(id, spaceId, eventId, applicationId, fieldId, value);
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

  public UUID getApplicationId() {
    return applicationId;
  }

  public UUID getFieldId() {
    return fieldId;
  }

  public String getValue() {
    return value;
  }
}
