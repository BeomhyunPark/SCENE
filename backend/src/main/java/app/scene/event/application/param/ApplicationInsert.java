package app.scene.event.application.param;

import java.time.Instant;
import java.util.UUID;

/** One application source row. Status is one of the three stored values. */
public final class ApplicationInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final String status;
  private final Instant submittedAt;

  private ApplicationInsert(
      UUID id, UUID spaceId, UUID eventId, UUID formId, String status, Instant submittedAt) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.status = status;
    this.submittedAt = submittedAt;
  }

  public static ApplicationInsert of(
      UUID id, UUID spaceId, UUID eventId, UUID formId, String status, Instant submittedAt) {
    return new ApplicationInsert(id, spaceId, eventId, formId, status, submittedAt);
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

  public String getStatus() {
    return status;
  }

  public Instant getSubmittedAt() {
    return submittedAt;
  }
}
