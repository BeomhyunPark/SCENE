package app.scene.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Process-local consecutive-failure lock that escalates. A key locks once it fails {@code limit}
 * times in a row. The n-th lock inside {@code window} lasts {@code durations[n-1]} (the last one is
 * reused past the end). Success or {@link #reset} clears the failures and the lock history. State
 * lives in memory and starts from zero after a restart (DEC-078). {@link #clear()} exists for
 * tests.
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
      entry.lockedUntil = null;
      return Optional.empty();
    }
    return Optional.of(Duration.between(now, entry.lockedUntil));
  }

  /**
   * Records one failure. Returns the lock stage this failure started (1 for the first lock inside
   * the window, 2 for the second, …), or 0 when it did not lock.
   */
  public synchronized int fail(String key, int limit, List<Duration> durations, Duration window) {
    Instant now = clock.instant();
    Entry entry = entries.computeIfAbsent(key, ignored -> new Entry());
    entry.failures++;
    if (entry.failures < limit) {
      return 0;
    }
    entry.failures = 0;
    Instant cutoff = now.minus(window);
    while (!entry.locks.isEmpty() && !entry.locks.peekFirst().isAfter(cutoff)) {
      entry.locks.removeFirst();
    }
    entry.locks.addLast(now);
    int stage = entry.locks.size();
    Duration duration = durations.get(Math.min(stage, durations.size()) - 1);
    entry.lockedUntil = now.plus(duration);
    return stage;
  }

  /** Forgets the key: failures, lock and lock history. */
  public synchronized void reset(String key) {
    entries.remove(key);
  }

  public synchronized void clear() {
    entries.clear();
  }

  private static final class Entry {
    private int failures;
    private Instant lockedUntil;
    private final ArrayDeque<Instant> locks = new ArrayDeque<>();
  }
}
