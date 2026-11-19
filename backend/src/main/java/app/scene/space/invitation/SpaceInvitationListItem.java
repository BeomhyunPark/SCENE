package app.scene.space.invitation;

import java.time.Instant;
import java.util.UUID;

/** One pending space invitation. The raw token, its hash and the link stay off. */
public record SpaceInvitationListItem(
    UUID id, String email, String role, String status, Instant expiresAt) {}
