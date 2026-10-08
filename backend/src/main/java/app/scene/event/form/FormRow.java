package app.scene.event.form;

import java.util.UUID;

/** One stored form. Answers are not loaded. */
public record FormRow(UUID id, UUID spaceId, UUID eventId, boolean acceptingApplications) {}
