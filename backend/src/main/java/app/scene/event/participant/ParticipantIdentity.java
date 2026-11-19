package app.scene.event.participant;

import java.util.UUID;

/**
 * One participant for sign-in and re-submit (DEC-078). {@code pinHash} is the bcrypt hash and never
 * leaves the server. {@code applicationId} is the current {@code SUBMITTED} application, or null.
 */
public record ParticipantIdentity(
    UUID id,
    UUID spaceId,
    UUID eventId,
    String name,
    String phone,
    String pinHash,
    boolean pinTemporary,
    UUID applicationId) {}
