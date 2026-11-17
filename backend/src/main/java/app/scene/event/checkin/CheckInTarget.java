package app.scene.event.checkin;

import java.util.UUID;

/** Participant of the event with the cohort of its SUBMITTED application, if any. */
public record CheckInTarget(UUID participantId, String name, String cohort, boolean submitted) {}
