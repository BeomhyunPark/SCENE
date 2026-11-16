package app.scene.event.invitation;

import java.time.Instant;
import java.util.UUID;

/**
 * One pending invitation on the owner's list. The email is the normalized address the owner typed.
 * The raw token and its hash stay off.
 */
public record InvitationListItem(
    UUID id, String email, String role, String status, Instant expiresAt) {}
