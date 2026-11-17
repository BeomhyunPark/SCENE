package app.scene.event.group;

import java.util.UUID;

/**
 * Participant with a SUBMITTED application, the trimmed 또래 answer, and the working-copy assignment.
 * {@code groupId} is null when unassigned. No phone and no access key.
 */
public record ActiveParticipant(
    UUID participantId, String name, String cohort, UUID groupId, boolean leader) {}
