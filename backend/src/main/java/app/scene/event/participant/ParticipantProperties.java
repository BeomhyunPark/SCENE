package app.scene.event.participant;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Participant sign-in limits (DEC-078). Provisional numbers. The per-phone lock is the guard
 * against guessing; the address limits are loose abuse caps that 200 people behind one Wi-Fi
 * address do not reach. {@code lockFailures} consecutive failures on one phone lock it; the n-th
 * lock inside {@code lockEscalationWindow} lasts {@code lockDurations[n-1]} (5m, 30m, 24h). More
 * than {@code ipFailureLimit} failures from one address inside {@code ipFailureWindow} answer 429.
 * More than {@code submitIpLimit} public submits from one address inside {@code submitIpWindow}
 * answer 429. Sessions end {@code sessionDaysAfterEnd} days after the day after the event's end
 * date, at midnight in {@code zone}. The cookie lives as long; for an event with no end date it
 * lives {@code cookieMaxAgeWithoutEnd} (the server still decides).
 */
@ConfigurationProperties("scene.participant")
public record ParticipantProperties(
    Integer lockFailures,
    List<Duration> lockDurations,
    Duration lockEscalationWindow,
    Integer ipFailureLimit,
    Duration ipFailureWindow,
    Integer submitIpLimit,
    Duration submitIpWindow,
    Integer sessionDaysAfterEnd,
    String zone,
    Integer bcryptStrength,
    Duration cookieMaxAgeWithoutEnd) {

  public ParticipantProperties {
    lockFailures = lockFailures == null ? 5 : lockFailures;
    lockDurations =
        lockDurations == null || lockDurations.isEmpty()
            ? List.of(Duration.ofMinutes(5), Duration.ofMinutes(30), Duration.ofHours(24))
            : List.copyOf(lockDurations);
    lockEscalationWindow =
        lockEscalationWindow == null ? Duration.ofHours(24) : lockEscalationWindow;
    ipFailureLimit = ipFailureLimit == null ? 300 : ipFailureLimit;
    ipFailureWindow = ipFailureWindow == null ? Duration.ofMinutes(10) : ipFailureWindow;
    submitIpLimit = submitIpLimit == null ? 1000 : submitIpLimit;
    submitIpWindow = submitIpWindow == null ? Duration.ofMinutes(10) : submitIpWindow;
    sessionDaysAfterEnd = sessionDaysAfterEnd == null ? 7 : sessionDaysAfterEnd;
    zone = zone == null || zone.isBlank() ? "Asia/Seoul" : zone;
    bcryptStrength = bcryptStrength == null ? 10 : bcryptStrength;
    cookieMaxAgeWithoutEnd =
        cookieMaxAgeWithoutEnd == null ? Duration.ofDays(180) : cookieMaxAgeWithoutEnd;
  }
}
