package app.scene.event.invitation;

import java.time.Instant;

/** Preview body. Contact and the raw token stay off this response. */
public record InvitationPreview(
    String eventName, String role, String inviterName, Instant expiresAt, String outcome) {}
