package app.scene.event.group;

import java.util.UUID;

/**
 * An assignment row whose participant has no SUBMITTED application. {@code groupId} is advisory.
 */
public record WithdrawnParticipant(UUID participantId, String name, UUID groupId) {}
