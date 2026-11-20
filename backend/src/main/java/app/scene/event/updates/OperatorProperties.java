package app.scene.event.updates;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Operator screen settings. {@code pollAfterSeconds} is the refresh interval sent in {@code GET
 * /operator/events/{eventId}/updates} (DEC-080 §7.5, I3 #436): default 15, kept within 10–300 like
 * the participant value so a typo in {@code .env} cannot stop the server during the deploy freeze.
 * Set it with {@code SCENE_OPERATOR_POLLAFTERSECONDS}.
 */
@ConfigurationProperties("scene.operator")
public record OperatorProperties(Integer pollAfterSeconds) {

  public static final int POLL_DEFAULT = 15;
  public static final int POLL_MIN = 10;
  public static final int POLL_MAX = 300;

  public OperatorProperties {
    pollAfterSeconds =
        pollAfterSeconds == null
            ? POLL_DEFAULT
            : Math.max(POLL_MIN, Math.min(POLL_MAX, pollAfterSeconds));
  }
}
