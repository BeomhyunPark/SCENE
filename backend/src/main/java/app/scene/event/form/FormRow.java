package app.scene.event.form;

import java.util.UUID;

/** One stored form. Answers are not loaded. {@code setup} is the stored jsonb as text, or null. */
public record FormRow(
    UUID id,
    UUID spaceId,
    UUID eventId,
    boolean acceptingApplications,
    boolean acceptingEdits,
    String setup) {}
