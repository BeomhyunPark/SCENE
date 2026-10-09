package app.scene.event.participant;

import java.util.UUID;

/** Access row matched by key hash. The raw key is not loaded. */
public record ParticipantAccessMatch(UUID id, UUID participantId) {}
