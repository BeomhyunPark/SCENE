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
 *
 * <p>A key is forgotten once it has nothing left to remember: its lock is over, its last lock is
 * older than {@code window} and its last failure is older than {@code window} (#418). Forgetting
 * then changes nothing a caller can see, except that failures that did not reach a lock stop
 * counting after a day without failures, which leaves fewer guesses than the lock stages allow. A
 * sweep removes such keys at most once every {@link #SWEEP_INTERVAL}, from inside {@link #fail}, so
 * keys stop piling up during a deployment freeze when nothing restarts.
 */
@Component
public class FailureLockout {

  /** How often {@link #fail} sweeps forgotten keys. One pass is a scan of the map. */
  static final Duration SWEEP_INTERVAL = Duration.ofMinutes(1);

  private final Clock clock;
  private final Map<String, Entry> entries = new HashMap<>();
  private Instant nextSweepAt = Instant.MIN;

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
    sweepIfDue(now);
    Entry entry = entries.get(key);
    if (entry == null || entry.expired(now)) {
      // An expired key that the sweep has not reached yet behaves exactly like a removed one.
      entry = new Entry();
      entries.put(key, entry);
    }
    entry.failures++;
    entry.keepUntil(now.plus(window));
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
    entry.keepUntil(entry.lockedUntil);
    return stage;
  }

  /** Forgets the key: failures, lock and lock history. */
  public synchronized void reset(String key) {
    entries.remove(key);
  }

  /** Removes every key with nothing left to remember now. {@link #fail} calls it once a minute. */
  public synchronized void purgeExpired() {
    Instant now = clock.instant();
    entries.values().removeIf(entry -> entry.expired(now));
    nextSweepAt = now.plus(SWEEP_INTERVAL);
  }

  /** Keys held in memory, forgotten or not yet swept. For tests and diagnostics. */
  public synchronized int size() {
    return entries.size();
  }

  public synchronized void clear() {
    entries.clear();
  }

  private void sweepIfDue(Instant now) {
    if (!now.isBefore(nextSweepAt)) {
      purgeExpired();
    }
  }

  private static final class Entry {
    private int failures;
    private Instant lockedUntil;
    private final ArrayDeque<Instant> locks = new ArrayDeque<>(4);

    /** The latest of: lock end, last lock + window, last failure + window. */
    private Instant expiresAt = Instant.MIN;

    private void keepUntil(Instant until) {
      if (until.isAfter(expiresAt)) {
        expiresAt = until;
      }
    }

    private boolean expired(Instant now) {
      return !now.isBefore(expiresAt);
    }
  }
}
