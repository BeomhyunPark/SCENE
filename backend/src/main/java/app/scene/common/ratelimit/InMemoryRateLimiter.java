package app.scene.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Process-local counters. Callers choose the limit and the window. {@link #clear()} exists so tests
 * that share one address can start from zero.
 */
@Component
public class InMemoryRateLimiter {

  private final Clock clock;
  private final Map<String, ArrayDeque<Instant>> hits = new HashMap<>();

  public InMemoryRateLimiter(Clock clock) {
    this.clock = clock;
  }

  /** Records one hit and returns how many hits are still inside the window, including this one. */
  public synchronized int acquire(String key, Duration window) {
    Instant now = clock.instant();
    ArrayDeque<Instant> deque = hits.computeIfAbsent(key, ignored -> new ArrayDeque<>());
    Instant cutoff = now.minus(window);
    while (!deque.isEmpty() && !deque.peekFirst().isAfter(cutoff)) {
      deque.removeFirst();
    }
    deque.addLast(now);
    return deque.size();
  }

  public synchronized void clear() {
    hits.clear();
  }
}
