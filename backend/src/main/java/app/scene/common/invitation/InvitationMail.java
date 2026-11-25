package app.scene.event.invitation;

/** One port call. The token is only inside {@code fragmentLink}. */
public record InvitationMail(
    String recipient, String role, String eventName, String fragmentLink) {}
