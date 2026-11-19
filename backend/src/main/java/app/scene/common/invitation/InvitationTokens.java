package app.scene.common.invitation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Invitation token rules shared by event invitations (DEC-060) and space invitations (DEC-076).
 * Only the SHA-256 hex of the raw token is stored. The raw token lives only in the fragment link
 * returned once by create and resend.
 */
public final class InvitationTokens {

  /** One server constant for both invitation kinds. There is no per-space setting. */
  public static final Duration TTL = Duration.ofDays(7);

  /** Shared landing page. The token sits in the fragment so it never reaches a server log. */
  public static final String LINK_PREFIX = "/operator/invitations#";

  /**
   * Marks a space invitation token on the shared landing page (DEC-076). {@code .} is outside the
   * base64url alphabet, so an event token (no marker) can never start with it.
   */
  public static final String SPACE_MARKER = "s.";

  private static final SecureRandom RANDOM = new SecureRandom();

  private InvitationTokens() {}

  public static String hash(String token) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable", ex);
    }
  }

  /**
   * A fresh token behind {@code marker} (empty for event invitations). The hash covers the whole
   * token, marker included.
   */
  public static Issued issue(String marker) {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    String token = marker + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    String link = LINK_PREFIX + token;
    if (link.indexOf('?') >= 0 || link.indexOf('#') != LINK_PREFIX.length() - 1) {
      throw new IllegalStateException("invitation link must keep the token in the fragment");
    }
    return new Issued(hash(token), link);
  }

  /** Hash and fragment link. The raw token is not retained. */
  public record Issued(String hash, String link) {}
}
