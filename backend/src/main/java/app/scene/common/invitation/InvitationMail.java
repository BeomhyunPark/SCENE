package app.scene.common.invitation;

import java.time.Instant;

/**
 * One port call. The raw token is only inside {@code fragmentLink}, the relative link built by
 * {@link InvitationTokens}. The mailer turns it into an absolute address for the recipient.
 *
 * @param kind which screen sent the invitation
 * @param recipient normalized invited email
 * @param role invited role code (MANAGER, STAFF, ADMIN, MEMBER)
 * @param targetName event name or space name
 * @param inviterName display name of the operator who sent it
 * @param fragmentLink {@code /operator/invitations#<token>}
 * @param expiresAt when the link stops working
 */
public record InvitationMail(
    Kind kind,
    String recipient,
    String role,
    String targetName,
    String inviterName,
    String fragmentLink,
    Instant expiresAt) {

  public enum Kind {
    EVENT,
    SPACE
  }
}
