package app.scene.event.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * Create and resend result. {@code delivery} is {@code EMAIL} when the invitation mail went to the
 * invited address; then {@code link} is null. {@code LINK} means no mail adapter is on, and {@code
 * link} is the relative fragment link with the raw token, returned once so the owner can pass it
 * on. It is not stored, logged, or audited. Contact stays off this body.
 */
public record IssuedInvitation(
    UUID id, String role, String status, Instant expiresAt, String link, String delivery) {}
