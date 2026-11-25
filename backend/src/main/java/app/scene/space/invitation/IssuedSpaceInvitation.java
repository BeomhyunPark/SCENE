package app.scene.space.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * Create and resend result. {@code delivery} is {@code EMAIL} when the invitation mail went to the
 * invited address; then {@code link} is null. {@code LINK} means no mail adapter is on, and {@code
 * link} carries the raw token, returned only here, once (DEC-076, same as DEC-060 Follow-up
 * 2026-11-16). It is not stored, logged, or audited.
 */
public record IssuedSpaceInvitation(
    UUID id, String role, String status, Instant expiresAt, String link, String delivery) {}
