package app.scene.event.checkin;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Signed fixed QR value (DEC-071, api.md "QR 값"). {@code SCENE-CI1.} + unpadded base64url of the
 * participant id (16 bytes) and the first 16 bytes of HMAC-SHA256 over {@code
 * checkin|1|{eventId}|{participantId}|0}. Nothing is stored; the same participant always gets the
 * same value. The value is never logged.
 */
@Component
@EnableConfigurationProperties(CheckInProperties.class)
public class CheckInCodes {

  static final String PREFIX = "SCENE-CI1.";
  private static final int ID_BYTES = 16;
  private static final int TAG_BYTES = 16;
  private static final int GENERATION = 0;
  private static final String ALGORITHM = "HmacSHA256";

  private final byte[] secret;

  public CheckInCodes(CheckInProperties properties) {
    String value = properties == null ? null : properties.codeSecret();
    this.secret = value == null || value.isBlank() ? null : value.getBytes(StandardCharsets.UTF_8);
  }

  /** False until the environment sets {@code scene.checkin.code-secret}. */
  public boolean configured() {
    return secret != null;
  }

  /** The QR value of one participant. Empty when no secret is configured. */
  public Optional<String> issue(UUID eventId, UUID participantId) {
    if (secret == null) {
      return Optional.empty();
    }
    ByteBuffer raw = ByteBuffer.allocate(ID_BYTES + TAG_BYTES);
    raw.putLong(participantId.getMostSignificantBits());
    raw.putLong(participantId.getLeastSignificantBits());
    raw.put(tag(eventId, participantId));
    return Optional.of(
        PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(raw.array()));
  }

  /**
   * The participant id carried by a well-formed value. The signature is not checked here; callers
   * confirm the participant belongs to the event and then call {@link #matches}.
   */
  public Optional<UUID> participantOf(String code) {
    if (secret == null || code == null || !code.startsWith(PREFIX)) {
      return Optional.empty();
    }
    String body = code.substring(PREFIX.length());
    if (body.indexOf('=') >= 0) {
      return Optional.empty();
    }
    byte[] raw;
    try {
      raw = Base64.getUrlDecoder().decode(body);
    } catch (IllegalArgumentException invalid) {
      return Optional.empty();
    }
    if (raw.length != ID_BYTES + TAG_BYTES) {
      return Optional.empty();
    }
    ByteBuffer buffer = ByteBuffer.wrap(raw);
    return Optional.of(new UUID(buffer.getLong(), buffer.getLong()));
  }

  /** Constant-time comparison of the signature in {@code code} for this event and participant. */
  public boolean matches(String code, UUID eventId, UUID participantId) {
    if (secret == null || participantOf(code).filter(participantId::equals).isEmpty()) {
      return false;
    }
    byte[] raw = Base64.getUrlDecoder().decode(code.substring(PREFIX.length()));
    byte[] given = new byte[TAG_BYTES];
    System.arraycopy(raw, ID_BYTES, given, 0, TAG_BYTES);
    return MessageDigest.isEqual(given, tag(eventId, participantId));
  }

  private byte[] tag(UUID eventId, UUID participantId) {
    String input = "checkin|1|" + eventId + "|" + participantId + "|" + GENERATION;
    try {
      Mac mac = Mac.getInstance(ALGORITHM);
      mac.init(new SecretKeySpec(secret, ALGORITHM));
      byte[] full = mac.doFinal(input.getBytes(StandardCharsets.UTF_8));
      byte[] tag = new byte[TAG_BYTES];
      System.arraycopy(full, 0, tag, 0, TAG_BYTES);
      return tag;
    } catch (GeneralSecurityException unavailable) {
      throw new IllegalStateException("HmacSHA256 is unavailable", unavailable);
    }
  }
}
