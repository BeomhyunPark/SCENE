package app.scene.common.invitation;

/**
 * Outbound invitation mail. {@link SmtpInvitationMailer} sends real mail when {@code
 * scene.mail.enabled} is true. Otherwise {@link CapturingInvitationMailer} keeps the call in memory
 * and the owner passes the link on by hand.
 */
public interface InvitationMailer {

  /**
   * Sends one invitation. Throws {@code SceneException(MAIL_SEND_FAILED)} when the mail server
   * refuses it, so the caller's transaction rolls back and no unusable invitation is left.
   */
  void send(InvitationMail mail);

  /** True when {@link #send} really reaches the recipient's inbox. */
  boolean deliversMail();

  /**
   * What create and resend answer. {@code EMAIL}: the link went to the inbox and is not returned.
   * {@code LINK}: no mail went out, so the link is returned once for the owner to pass on.
   */
  default Delivery delivery() {
    return deliversMail() ? Delivery.EMAIL : Delivery.LINK;
  }

  /** The link to put in the response body, or null when mail carried it. */
  default String linkForResponse(String fragmentLink) {
    return deliversMail() ? null : fragmentLink;
  }

  enum Delivery {
    EMAIL,
    LINK
  }
}
