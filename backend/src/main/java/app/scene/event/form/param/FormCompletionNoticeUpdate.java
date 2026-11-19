package app.scene.event.form.param;

import java.util.UUID;

/** Stores the form's completion notice, or null to clear it (#406). */
public final class FormCompletionNoticeUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final String completionNotice;

  private FormCompletionNoticeUpdate(
      UUID spaceId, UUID eventId, UUID formId, String completionNotice) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.completionNotice = completionNotice;
  }

  public static FormCompletionNoticeUpdate of(
      UUID spaceId, UUID eventId, UUID formId, String completionNotice) {
    return new FormCompletionNoticeUpdate(spaceId, eventId, formId, completionNotice);
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

  public String getCompletionNotice() {
    return completionNotice;
  }
}
