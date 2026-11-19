package app.scene.space.invitation;

import java.time.Instant;

/**
 * Preview body. {@code outcome} is {@code PENDING}, {@code ALREADY_ACCEPTED} or {@code
 * ALREADY_MEMBER}. Contact and the raw token stay off.
 */
public record SpaceInvitationPreview(
    String spaceName, String role, String inviterName, Instant expiresAt, String outcome) {}
