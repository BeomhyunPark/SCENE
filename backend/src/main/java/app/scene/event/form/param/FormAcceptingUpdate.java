package app.scene.event.form.param;

import java.util.UUID;

/** The two writable form switches. A null value is left as it is. Field rows are not updated. */
public final class FormAcceptingUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final Boolean acceptingApplications;
  private final Boolean acceptingEdits;

  private FormAcceptingUpdate(
      UUID spaceId,
      UUID eventId,
      UUID formId,
      Boolean acceptingApplications,
      Boolean acceptingEdits) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.acceptingApplications = acceptingApplications;
    this.acceptingEdits = acceptingEdits;
  }

  public static FormAcceptingUpdate of(
      UUID spaceId,
      UUID eventId,
      UUID formId,
      Boolean acceptingApplications,
      Boolean acceptingEdits) {
    return new FormAcceptingUpdate(spaceId, eventId, formId, acceptingApplications, acceptingEdits);
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

  public Boolean getAcceptingApplications() {
    return acceptingApplications;
  }

  public Boolean getAcceptingEdits() {
    return acceptingEdits;
  }
}
