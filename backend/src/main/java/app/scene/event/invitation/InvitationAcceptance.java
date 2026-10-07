package app.scene.event.invitation;

/** Accept body. {@code outcome} is {@code ACCEPTED} or {@code ALREADY_ACCEPTED}. */
public record InvitationAcceptance(String outcome) {}
