package app.scene.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
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

  private int failFive() {
    int stage = 0;
    for (int i = 0; i < 5; i++) {
      stage = lockout.fail(KEY, 5, STAGES, WINDOW);
    }
    return stage;
  }

  private static final class MutableClock extends Clock {
    private Instant now;

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
