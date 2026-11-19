package app.scene.space.invitation;

import java.time.Instant;
import java.util.UUID;

/** Stored space invitation. The raw token is not a column. */
public record SpaceInvitationRow(
    UUID id,
    UUID spaceId,
    String emailNormalized,
    String role,
    String tokenHash,
    String status,
    Instant expiresAt,
    UUID invitedBy,
    UUID acceptedUserId) {}
