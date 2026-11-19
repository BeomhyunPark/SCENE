package app.scene.event.participant;

import java.util.UUID;

/**
 * Signed-in participant. Phone and the number hash stay off this body. {@code pinChangeRequired} is
 * true for a session opened with an operator's temporary number (DEC-078 §2).
 */
public record ParticipantSelf(
    UUID participantId, UUID eventId, UUID spaceId, String name, boolean pinChangeRequired) {}
