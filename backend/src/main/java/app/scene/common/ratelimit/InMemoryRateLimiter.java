package app.scene.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Process-local counters. Callers choose the limit and the window; one key is used with one window.
 * {@link #clear()} exists so tests that share one address can start from zero.
 *
 * <p>A key whose last hit is older than its window counts zero, so it is forgotten (#418). A sweep
 * removes such keys at most once every {@link #SWEEP_INTERVAL}, from inside {@link #acquire}, so
 * one key per address does not stay in memory for good while nothing restarts.
 */
@Component
public class InMemoryRateLimiter {

  /** How often {@link #acquire} sweeps forgotten keys. One pass is a scan of the map. */
  static final Duration SWEEP_INTERVAL = Duration.ofMinutes(1);

  private final Clock clock;
  private final Map<String, Bucket> hits = new HashMap<>();
  private Instant nextSweepAt = Instant.MIN;

  public InMemoryRateLimiter(Clock clock) {
    this.clock = clock;
  }

  /** Records one hit and returns how many hits are still inside the window, including this one. */
  public synchronized int acquire(String key, Duration window) {
    Instant now = clock.instant();
    if (!now.isBefore(nextSweepAt)) {
      purgeExpired();
    }
    Bucket bucket = hits.computeIfAbsent(key, ignored -> new Bucket());
    bucket.prune(now.minus(window));
    bucket.times.addLast(now);
    Instant until = now.plus(window);
    if (until.isAfter(bucket.expiresAt)) {
      bucket.expiresAt = until;
    }
    return bucket.times.size();
  }

  /** Hits still inside the window. Records nothing. */
  public synchronized int count(String key, Duration window) {
    Bucket bucket = hits.get(key);
    if (bucket == null) {
      return 0;
    }
    bucket.prune(clock.instant().minus(window));
    return bucket.times.size();
  }

  /** Removes every key whose last hit left its window. {@link #acquire} calls it once a minute. */
  public synchronized void purgeExpired() {
    Instant now = clock.instant();
    hits.values().removeIf(bucket -> !now.isBefore(bucket.expiresAt));
    nextSweepAt = now.plus(SWEEP_INTERVAL);
  }

  /** Keys held in memory, forgotten or not yet swept. For tests and diagnostics. */
  public synchronized int size() {
    return hits.size();
  }

  public synchronized void clear() {
    hits.clear();
  }

  private static final class Bucket {
    private final ArrayDeque<Instant> times = new ArrayDeque<>();

    /** Last hit + window: from then on the key counts zero. */
    private Instant expiresAt = Instant.MIN;

    private void prune(Instant cutoff) {
      while (!times.isEmpty() && !times.peekFirst().isAfter(cutoff)) {
        times.removeFirst();
      }
    }
  }
}
