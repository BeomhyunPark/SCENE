package app.scene.event.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * Create and resend result. {@code link} is the relative fragment link with the raw token. It is
 * returned once, here, so the owner can pass it on while no mail adapter ships. It is not stored,
 * logged, or audited. Contact stays off this body.
 */
public record IssuedInvitation(
    UUID id, String role, String status, Instant expiresAt, String link) {}
