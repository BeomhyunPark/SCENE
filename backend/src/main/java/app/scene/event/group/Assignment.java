package app.scene.event.group;

import java.util.UUID;

/**
 * Current assignment of one participant of the event. {@code groupId} is null when unassigned.
 * {@code submitted} is whether the participant has a SUBMITTED application (active). {@code
 * position} orders members within the group (smaller first) and is null when unassigned.
 */
public record Assignment(
    UUID participantId, UUID groupId, boolean leader, boolean submitted, Integer position) {}
