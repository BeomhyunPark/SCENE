package app.scene.event.participant;

import java.util.UUID;

/**
 * Signed-in participant. Phone, the access key, and {@code key_hash} stay off this body. The
 * contract does not name the fields, so this slice returns only these four.
 */
public record ParticipantSelf(UUID participantId, UUID eventId, UUID spaceId, String name) {}
