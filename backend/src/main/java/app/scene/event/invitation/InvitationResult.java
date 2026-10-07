package app.scene.event.invitation;

import java.time.Instant;
import java.util.UUID;

/** Command result. Contact and the raw token stay off this body. */
public record InvitationResult(UUID id, String role, String status, Instant expiresAt) {}
