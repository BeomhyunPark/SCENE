package app.scene.event.checkin;

import java.util.UUID;

/** Participant shown on a check-in result. No phone. */
public record CheckInParticipant(UUID participantId, String name, String cohort) {}
