package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.security.SecureRandom;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * The six-digit number a participant chooses (DEC-078 §2). Only the bcrypt hash is stored. The raw
 * value never goes to a response, a log, or audit. Rejected: anything but six digits, one digit
 * repeated, a run that goes up or down by one, and six digits found inside the phone's digits.
 */
@Component
@EnableConfigurationProperties(ParticipantProperties.class)
public class ParticipantPins {

  private static final int LENGTH = 6;

  private final BCryptPasswordEncoder encoder;
  private final String dummyHash;
  private final SecureRandom random = new SecureRandom();

  public ParticipantPins(ParticipantProperties properties) {
    this.encoder = new BCryptPasswordEncoder(properties.bcryptStrength());
    this.dummyHash = encoder.encode("000000-not-a-pin");
  }

  /** Throws {@code PARTICIPANT_PIN_WEAK} unless the value is an accepted number. */
  public static void requireAccepted(String pin, String phoneDigits) {
    if (!accepted(pin, phoneDigits)) {
      throw new SceneException(ErrorCode.PARTICIPANT_PIN_WEAK);
    }
  }

  static boolean accepted(String pin, String phoneDigits) {
    if (pin == null || pin.length() != LENGTH) {
      return false;
    }
    for (int i = 0; i < LENGTH; i++) {
      char c = pin.charAt(i);
      if (c < '0' || c > '9') {
        return false;
      }
    }
    boolean same = true;
    boolean up = true;
    boolean down = true;
    for (int i = 1; i < LENGTH; i++) {
      int step = pin.charAt(i) - pin.charAt(i - 1);
      same &= step == 0;
      up &= step == 1;
      down &= step == -1;
    }
    if (same || up || down) {
      return false;
    }
    return phoneDigits == null || !phoneDigits.contains(pin);
  }

  public String hash(String pin) {
    return encoder.encode(pin);
  }

  /**
   * Compares in constant work: a missing hash is checked against a dummy so a missing participant
   * takes as long as a wrong number.
   */
  public boolean matches(String pin, String storedHash) {
    if (pin == null) {
      encoder.matches("", dummyHash);
      return false;
    }
    if (storedHash == null) {
      encoder.matches(pin, dummyHash);
      return false;
    }
    return encoder.matches(pin, storedHash);
  }

  /** A server-made temporary number that passes the same rules. */
  public String temporary(String phoneDigits) {
    while (true) {
      StringBuilder pin = new StringBuilder(LENGTH);
      for (int i = 0; i < LENGTH; i++) {
        pin.append((char) ('0' + random.nextInt(10)));
      }
      String value = pin.toString();
      if (accepted(value, phoneDigits)) {
        return value;
      }
    }
  }

  /** Digits of a phone text. */
  public static String digits(String phone) {
    if (phone == null) {
      return "";
    }
    StringBuilder out = new StringBuilder(phone.length());
    for (int i = 0; i < phone.length(); i++) {
      char c = phone.charAt(i);
      if (c >= '0' && c <= '9') {
        out.append(c);
      }
    }
    return out.toString();
  }

  /** The stored identity key of a phone: SHA-256 hex of its digits (DEC-078 §1). */
  public static String phoneKey(String phone) {
    return Digests.sha256Hex(digits(phone));
  }

  /** Trims and folds inner whitespace so "김 하늘" and "김 하늘 " compare equal. */
  public static String normalizeName(String name) {
    return name == null ? "" : name.strip().replaceAll("\\s+", " ");
  }
}
