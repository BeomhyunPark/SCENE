package app.scene.event.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * Preview body. Contact and the raw token stay off this response. {@code eventId} is shown only
 * after the session email matches, so the landing page can open the event once it is accepted
 * (#387).
 */
public record InvitationPreview(
    UUID eventId,
    String eventName,
    String role,
    String inviterName,
    Instant expiresAt,
    String outcome) {}
