package app.scene.event.lifecycle;

import java.time.Instant;
import java.util.UUID;

/** Stored invitation. The raw token is not a column. */
public record InvitationRow(
    UUID id,
    UUID spaceId,
    UUID eventId,
    String emailNormalized,
    String role,
    String tokenHash,
    String status,
    Instant expiresAt,
    UUID invitedBy,
    UUID acceptedUserId) {}
