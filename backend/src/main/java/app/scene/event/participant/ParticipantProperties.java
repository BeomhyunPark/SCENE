package app.scene.event.participant;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Participant sign-in limits (DEC-078). Provisional numbers. {@code lockFailures} consecutive
 * failures on one phone lock it for {@code lockDuration}. More than {@code ipFailureLimit} failures
 * from one address inside {@code ipFailureWindow} answer 429. More than {@code submitIpLimit}
 * public submits from one address inside {@code submitIpWindow} answer 429. Sessions end {@code
 * sessionDaysAfterEnd} days after the day after the event's end date, at midnight in {@code zone}.
 */
@ConfigurationProperties("scene.participant")
public record ParticipantProperties(
    Integer lockFailures,
    Duration lockDuration,
    Integer ipFailureLimit,
    Duration ipFailureWindow,
    Integer submitIpLimit,
    Duration submitIpWindow,
    Integer sessionDaysAfterEnd,
    String zone,
    Integer bcryptStrength) {

  public ParticipantProperties {
    lockFailures = lockFailures == null ? 5 : lockFailures;
    lockDuration = lockDuration == null ? Duration.ofMinutes(15) : lockDuration;
    ipFailureLimit = ipFailureLimit == null ? 30 : ipFailureLimit;
    ipFailureWindow = ipFailureWindow == null ? Duration.ofMinutes(10) : ipFailureWindow;
    submitIpLimit = submitIpLimit == null ? 100 : submitIpLimit;
    submitIpWindow = submitIpWindow == null ? Duration.ofMinutes(10) : submitIpWindow;
    sessionDaysAfterEnd = sessionDaysAfterEnd == null ? 7 : sessionDaysAfterEnd;
    zone = zone == null || zone.isBlank() ? "Asia/Seoul" : zone;
    bcryptStrength = bcryptStrength == null ? 10 : bcryptStrength;
  }
}
