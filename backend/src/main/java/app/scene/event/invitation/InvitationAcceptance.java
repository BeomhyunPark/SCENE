package app.scene.event.invitation;

import java.util.UUID;

/**
 * Accept body. {@code outcome} is {@code ACCEPTED} or {@code ALREADY_ACCEPTED}. {@code role} is the
 * caller's role in the event now, or null when that access has since ended. An invitee who was
 * already an operator keeps the role they had; the invitation does not change it (#387).
 */
public record InvitationAcceptance(String outcome, UUID eventId, String role) {}
