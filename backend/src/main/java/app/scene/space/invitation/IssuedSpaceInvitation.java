package app.scene.space.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * Create and resend result. {@code link} carries the raw token and is returned only here, once
 * (DEC-076, same as DEC-060 Follow-up 2026-11-16). It is not stored, logged, or audited.
 */
public record IssuedSpaceInvitation(
    UUID id, String role, String status, Instant expiresAt, String link) {}
