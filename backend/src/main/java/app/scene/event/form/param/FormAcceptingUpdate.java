package app.scene.event.form.param;

import java.util.UUID;

/** The only writable form flag. Field rows are not updated here. */
public final class FormAcceptingUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final boolean acceptingApplications;

  private FormAcceptingUpdate(
      UUID spaceId, UUID eventId, UUID formId, boolean acceptingApplications) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.acceptingApplications = acceptingApplications;
  }

  public static FormAcceptingUpdate of(
      UUID spaceId, UUID eventId, UUID formId, boolean acceptingApplications) {
    return new FormAcceptingUpdate(spaceId, eventId, formId, acceptingApplications);
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

  public boolean isAcceptingApplications() {
    return acceptingApplications;
  }
}
