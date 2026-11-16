package app.scene.event.form.param;

import java.util.UUID;

/** Stores the operator's form setup as JSON text (DEC-070). */
public final class FormSetupUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final String setup;

  private FormSetupUpdate(UUID spaceId, UUID eventId, UUID formId, String setup) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.setup = setup;
  }

  public static FormSetupUpdate of(UUID spaceId, UUID eventId, UUID formId, String setup) {
    return new FormSetupUpdate(spaceId, eventId, formId, setup);
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

  public String getSetup() {
    return setup;
  }
}
