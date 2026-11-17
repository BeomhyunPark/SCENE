package app.scene.event.group;

import java.util.UUID;

/**
 * Current assignment of one participant of the event. {@code groupId} is null when unassigned.
 * {@code submitted} is whether the participant has a SUBMITTED application (active).
 */
public record Assignment(UUID participantId, UUID groupId, boolean leader, boolean submitted) {}
