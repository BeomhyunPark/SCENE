package app.scene.common.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.ratelimit.InMemoryRateLimiter;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Provisional preview and accept limit. The document leaves the number undecided. One bucket is
 * shared by event and space invitation preview and accept, per account and per direct client
 * address, so the shared landing page gives no extra guesses.
 */
@Component
public class InvitationAttempts {

  public static final int LIMIT = 5;

  public static final Duration WINDOW = Duration.ofHours(1);

  private final InMemoryRateLimiter attempts;

  public InvitationAttempts(InMemoryRateLimiter attempts) {
    this.attempts = attempts;
  }

  public void acquire(UUID actorId, String remoteAddress) {
    String address = remoteAddress == null || remoteAddress.isBlank() ? "unknown" : remoteAddress;
    int byAccount = attempts.acquire("invitation-account:" + actorId, WINDOW);
    int byAddress = attempts.acquire("invitation-ip:" + address, WINDOW);
    if (byAccount > LIMIT || byAddress > LIMIT) {
      throw new SceneException(ErrorCode.RATE_LIMITED);
    }
  }
}
