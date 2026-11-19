package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.ratelimit.FailureLockout;
import app.scene.common.ratelimit.InMemoryRateLimiter;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Brute-force limits for the six-digit number (DEC-078 §2, #399, #401). A phone is locked after
 * consecutive failures whether or not it has an application, so the lock does not tell anyone that
 * a phone applied. Address limits count failures only for sign-in, so many people behind one
 * retreat Wi-Fi address are not blocked by their successes, and count every public submit.
 */
@Component
public class ParticipantGuard {

  private final FailureLockout lockout;
  private final InMemoryRateLimiter limiter;
  private final ParticipantProperties properties;

  public ParticipantGuard(
      FailureLockout lockout, InMemoryRateLimiter limiter, ParticipantProperties properties) {
    this.lockout = lockout;
    this.limiter = limiter;
    this.properties = properties;
  }

  /** 429 when the address already failed too often. Records nothing. */
  public void requireAddressOpen(String address) {
    if (limiter.count(addressKey(address), properties.ipFailureWindow())
        >= properties.ipFailureLimit()) {
      throw new SceneException(ErrorCode.RATE_LIMITED);
    }
  }

  /** 429 {@code PARTICIPANT_LOGIN_LOCKED} while the phone is locked. */
  public void requirePhoneOpen(UUID eventId, String phoneKey) {
    Optional<Duration> left = lockout.lockedFor(phoneLockKey(eventId, phoneKey));
    if (left.isPresent()) {
      throw locked(left.get());
    }
  }

  /** Records one failed number for the phone and the address. */
  public void failed(UUID eventId, String phoneKey, String address) {
    lockout.fail(
        phoneLockKey(eventId, phoneKey), properties.lockFailures(), properties.lockDuration());
    limiter.acquire(addressKey(address), properties.ipFailureWindow());
  }

  public void succeeded(UUID eventId, String phoneKey) {
    lockout.reset(phoneLockKey(eventId, phoneKey));
  }

  /** Records one public submit and answers 429 past the address limit (#401). */
  public void submitted(String address) {
    int hits =
        limiter.acquire("participant-submit-ip:" + normalize(address), properties.submitIpWindow());
    if (hits > properties.submitIpLimit()) {
      throw new SceneException(ErrorCode.RATE_LIMITED);
    }
  }

  private static SceneException locked(Duration left) {
    long seconds = Math.max(1, (left.toMillis() + 999) / 1000);
    return new SceneException(
        ErrorCode.PARTICIPANT_LOGIN_LOCKED, Map.of("retryAfterSeconds", seconds));
  }

  private static String phoneLockKey(UUID eventId, String phoneKey) {
    return "participant-phone:" + eventId + ":" + phoneKey;
  }

  private static String addressKey(String address) {
    return "participant-login-ip:" + normalize(address);
  }

  private static String normalize(String address) {
    return address == null || address.isBlank() ? "unknown" : address;
  }
}
