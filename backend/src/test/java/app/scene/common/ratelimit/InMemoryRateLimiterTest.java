package app.scene.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.common.ratelimit.FailureLockoutTest.MutableClock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** #418: one key per address is forgotten once its window passes; counting does not change. */
class InMemoryRateLimiterTest {

  private static final Duration WINDOW = Duration.ofMinutes(10);

  private final MutableClock clock = new MutableClock(Instant.parse("2026-12-16T00:00:00Z"));
  private final InMemoryRateLimiter limiter = new InMemoryRateLimiter(clock);

  @Test
  void addressesAreForgottenOnceTheWindowPasses() {
    for (int i = 0; i < 10_000; i++) {
      limiter.acquire("ip-" + i, WINDOW);
    }
    clock.advance(WINDOW.minusSeconds(1));
    limiter.purgeExpired();
    assertThat(limiter.size()).isEqualTo(10_000);

    // The sweep above set the next one a minute out; acquire runs it on its own from then on.
    clock.advance(InMemoryRateLimiter.SWEEP_INTERVAL);
    limiter.acquire("next", WINDOW);
    assertThat(limiter.size()).isEqualTo(1);
  }

  @Test
  void anAddressStillInsideItsWindowKeepsItsCount() {
    for (int i = 0; i < 300; i++) {
      limiter.acquire("wifi", WINDOW);
    }
    clock.advance(Duration.ofMinutes(9));
    limiter.purgeExpired();
    assertThat(limiter.count("wifi", WINDOW)).isEqualTo(300);
    assertThat(limiter.acquire("wifi", WINDOW)).isEqualTo(301);

    clock.advance(Duration.ofMinutes(1));
    limiter.purgeExpired();
    assertThat(limiter.count("wifi", WINDOW)).isEqualTo(1);
    clock.advance(Duration.ofMinutes(9));
    limiter.purgeExpired();
    assertThat(limiter.size()).isZero();
    assertThat(limiter.count("wifi", WINDOW)).isZero();
  }
}
