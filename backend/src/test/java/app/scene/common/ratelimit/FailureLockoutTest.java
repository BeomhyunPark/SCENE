package app.scene.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

/** DEC-078 §2: the phone lock escalates 5m → 30m → 24h inside 24 hours. */
class FailureLockoutTest {

  private static final List<Duration> STAGES =
      List.of(Duration.ofMinutes(5), Duration.ofMinutes(30), Duration.ofHours(24));
  private static final Duration WINDOW = Duration.ofHours(24);
  private static final String KEY = "phone";

  private final MutableClock clock = new MutableClock(Instant.parse("2026-12-16T00:00:00Z"));
  private final FailureLockout lockout = new FailureLockout(clock);

  @Test
  void eachLockInsideTheWindowLastsLonger() {
    assertThat(failFive()).isEqualTo(1);
    assertThat(lockout.lockedFor(KEY)).contains(Duration.ofMinutes(5));
    clock.advance(Duration.ofMinutes(5));
    assertThat(lockout.lockedFor(KEY)).isEmpty();

    assertThat(failFive()).isEqualTo(2);
    assertThat(lockout.lockedFor(KEY)).contains(Duration.ofMinutes(30));
    clock.advance(Duration.ofMinutes(30));

    assertThat(failFive()).isEqualTo(3);
    assertThat(lockout.lockedFor(KEY)).contains(Duration.ofHours(24));
    clock.advance(Duration.ofHours(24));

    // Past the end the last stage repeats while earlier locks are still inside the window.
    clock.advance(Duration.ofMinutes(-1));
    assertThat(lockout.lockedFor(KEY)).isPresent();
  }

  @Test
  void aboutFifteenGuessesFitInADay() {
    int guesses = 0;
    Instant end = clock.instant().plus(Duration.ofHours(24));
    while (clock.instant().isBefore(end)) {
      var left = lockout.lockedFor(KEY);
      if (left.isPresent()) {
        clock.advance(left.get());
        continue;
      }
      lockout.fail(KEY, 5, STAGES, WINDOW);
      guesses++;
    }
    assertThat(guesses).isLessThanOrEqualTo(20);
  }

  @Test
  void locksOlderThanTheWindowStopCounting() {
    failFive();
    clock.advance(Duration.ofHours(25));
    assertThat(failFive()).isEqualTo(1);
    assertThat(lockout.lockedFor(KEY)).contains(Duration.ofMinutes(5));
  }

  @Test
  void resetStartsOverAndFewerFailuresDoNotLock() {
    failFive();
    clock.advance(Duration.ofMinutes(5));
    failFive();
    lockout.reset(KEY);
    assertThat(lockout.lockedFor(KEY)).isEmpty();
    for (int i = 0; i < 4; i++) {
      assertThat(lockout.fail(KEY, 5, STAGES, WINDOW)).isZero();
    }
    assertThat(lockout.lockedFor(KEY)).isEmpty();
    assertThat(lockout.fail(KEY, 5, STAGES, WINDOW)).isEqualTo(1);
  }

  @Test
  void tenThousandUnknownPhonesAreForgottenOnceTheWindowPasses() {
    for (int i = 0; i < 10_000; i++) {
      lockout.fail("unknown-" + i, 5, STAGES, WINDOW);
    }
    assertThat(lockout.size()).isEqualTo(10_000);

    clock.advance(WINDOW.minusSeconds(1));
    lockout.purgeExpired();
    assertThat(lockout.size()).isEqualTo(10_000);

    clock.advance(Duration.ofSeconds(1));
    lockout.purgeExpired();
    assertThat(lockout.size()).isZero();
  }

  @Test
  void failSweepsOnItsOwnOnceAMinute() {
    for (int i = 0; i < 1_000; i++) {
      lockout.fail("unknown-" + i, 5, STAGES, WINDOW);
    }
    clock.advance(WINDOW);
    lockout.fail("next", 5, STAGES, WINDOW);
    assertThat(lockout.size()).isEqualTo(1);
  }

  @Test
  void lockedKeysAndKeysWithRecentLocksSurviveTheSweep() {
    // "locked": third stage, 24h lock still running. "recent": first lock over, but it still counts
    // toward the stages for 24 hours. "idle": failures only, a day ago.
    lockout.fail("idle", 5, STAGES, WINDOW);
    failFive("locked");
    clock.advance(Duration.ofMinutes(5));
    failFive("locked");
    clock.advance(Duration.ofMinutes(30));
    failFive("locked");
    failFive("recent");
    clock.advance(Duration.ofHours(23));

    lockout.purgeExpired();
    assertThat(lockout.size()).isEqualTo(3);

    clock.advance(Duration.ofMinutes(35));
    lockout.purgeExpired();
    assertThat(lockout.size()).isEqualTo(2);
    assertThat(lockout.lockedFor("locked")).isPresent();
    assertThat(lockout.lockedFor("recent")).isEmpty();
    // The earlier lock still counts, so the next one is stage 2, not stage 1.
    assertThat(failFive("recent")).isEqualTo(2);
    assertThat(lockout.lockedFor("recent")).contains(Duration.ofMinutes(30));

    clock.advance(Duration.ofHours(24));
    lockout.purgeExpired();
    assertThat(lockout.lockedFor("locked")).isEmpty();
  }

  @Test
  void aLockLongerThanTheWindowIsKeptUntilItEnds() {
    List<Duration> longLock = List.of(Duration.ofHours(48));
    for (int i = 0; i < 5; i++) {
      lockout.fail(KEY, 5, longLock, WINDOW);
    }
    clock.advance(Duration.ofHours(47));
    lockout.purgeExpired();
    assertThat(lockout.lockedFor(KEY)).contains(Duration.ofHours(1));
  }

  @Test
  void failuresBelowTheLimitStillAddUpInsideTheWindow() {
    for (int i = 0; i < 4; i++) {
      lockout.fail(KEY, 5, STAGES, WINDOW);
      clock.advance(Duration.ofHours(5));
      lockout.purgeExpired();
    }
    assertThat(lockout.fail(KEY, 5, STAGES, WINDOW)).isEqualTo(1);
  }

  @Test
  void sweepsRunningAlongsideFailuresLoseNoCount() throws Exception {
    int threads = 4;
    int perThread = 2_500;
    int limit = threads * perThread;
    ExecutorService pool = Executors.newFixedThreadPool(threads + 1);
    AtomicBoolean done = new AtomicBoolean();
    try {
      Future<?> sweeper =
          pool.submit(
              () -> {
                while (!done.get()) {
                  lockout.purgeExpired();
                }
              });
      List<Callable<Integer>> workers = new ArrayList<>();
      for (int t = 0; t < threads; t++) {
        int id = t;
        workers.add(
            () -> {
              int locks = 0;
              for (int i = 0; i < perThread; i++) {
                if (lockout.fail(KEY, limit, STAGES, WINDOW) > 0) {
                  locks++;
                }
                lockout.fail("other-" + id + "-" + i, limit, STAGES, WINDOW);
              }
              return locks;
            });
      }
      int locks = 0;
      for (Future<Integer> result : pool.invokeAll(workers)) {
        locks += result.get();
      }
      done.set(true);
      sweeper.get(10, TimeUnit.SECONDS);
      assertThat(locks).isEqualTo(1);
      assertThat(lockout.lockedFor(KEY)).contains(Duration.ofMinutes(5));
      assertThat(lockout.size()).isEqualTo(1 + limit);
    } finally {
      done.set(true);
      pool.shutdownNow();
    }
  }

  private int failFive(String key) {
    int stage = 0;
    for (int i = 0; i < 5; i++) {
      stage = lockout.fail(key, 5, STAGES, WINDOW);
    }
    return stage;
  }

  private int failFive() {
    int stage = 0;
    for (int i = 0; i < 5; i++) {
      stage = lockout.fail(KEY, 5, STAGES, WINDOW);
    }
    return stage;
  }

  static final class MutableClock extends Clock {
    private volatile Instant now;

    MutableClock(Instant now) {
      this.now = now;
    }

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
