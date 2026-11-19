package app.scene.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Process-local consecutive-failure lock. A key is locked for {@code duration} once it fails {@code
 * limit} times in a row. Success resets it. Counters live in memory and start from zero after a
 * restart (DEC-078). {@link #clear()} exists for tests.
 */
@Component
public class FailureLockout {

  private final Clock clock;
  private final Map<String, Entry> entries = new HashMap<>();

  public FailureLockout(Clock clock) {
    this.clock = clock;
  }

  /** The time left on a lock, or empty when the key is open. */
  public synchronized Optional<Duration> lockedFor(String key) {
    Entry entry = entries.get(key);
    if (entry == null || entry.lockedUntil == null) {
      return Optional.empty();
    }
    Instant now = clock.instant();
    if (!now.isBefore(entry.lockedUntil)) {
      entries.remove(key);
      return Optional.empty();
    }
    return Optional.of(Duration.between(now, entry.lockedUntil));
  }

  /** Records one failure. Returns true when this failure locked the key. */
  public synchronized boolean fail(String key, int limit, Duration duration) {
    Entry entry = entries.computeIfAbsent(key, ignored -> new Entry());
    entry.failures++;
    if (entry.failures >= limit) {
      entry.failures = 0;
      entry.lockedUntil = clock.instant().plus(duration);
      return true;
    }
    return false;
  }

  public synchronized void reset(String key) {
    entries.remove(key);
  }

  public synchronized void clear() {
    entries.clear();
  }

  private static final class Entry {
    private int failures;
    private Instant lockedUntil;
  }
}
