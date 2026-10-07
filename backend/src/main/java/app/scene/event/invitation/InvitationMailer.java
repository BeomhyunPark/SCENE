package app.scene.event.invitation;

/** Outbound invitation mail. No SMTP adapter ships with the server. */
public interface InvitationMailer {

  void send(InvitationMail mail);
}
