package app.scene.event.home;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.feed.FeedVersions;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.home.mapper.ParticipantHomeQueryMapper;
import app.scene.event.notification.NotificationRecipient;
import app.scene.event.notification.Notifications;
import app.scene.event.participant.ParticipantProperties;
import app.scene.event.participant.ParticipantSelf;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Participant home and refresh values (DEC-080 §3–4). Reads only the session's event and
 * participant. No audit; the event state does not gate reading.
 *
 * <p>{@link #updates} reads three statements after the session check: the event's {@code
 * participant_feed_versions} row, the participant's notification summary, and the participant's
 * newest check-in log and application revision. It never reads publications, notices or schedule
 * tables.
 */
@Service
public class ParticipantHomeService {

  private final ParticipantHomeQueryMapper home;
  private final ParticipantFeedVersions feedVersions;
  private final Notifications notifications;
  private final ParticipantProperties properties;
  private final Clock clock;

  public ParticipantHomeService(
      ParticipantHomeQueryMapper home,
      ParticipantFeedVersions feedVersions,
      Notifications notifications,
      ParticipantProperties properties,
      Clock clock) {
    this.home = home;
    this.feedVersions = feedVersions;
    this.notifications = notifications;
    this.properties = properties;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public ParticipantHome home(ParticipantSelf self) {
    HomeRow row = home.findHome(self.spaceId(), self.eventId(), self.participantId());
    if (row == null) {
      throw new SceneException(ErrorCode.AUTHENTICATION_REQUIRED);
    }
    FeedVersions versions = feedVersions.read(self.spaceId(), self.eventId());
    return new ParticipantHome(
        new ParticipantHome.HomeEvent(
            row.eventId(),
            row.name(),
            row.lifecycleStatus(),
            row.startDate(),
            row.endDate(),
            row.place(),
            properties.zone()),
        new ParticipantHome.HomeParticipant(
            self.name(), row.submitted() ? ParticipantHome.SUBMITTED : ParticipantHome.NONE),
        row.completionNotice(),
        ParticipantFeatures.of(row.eventType(), versions),
        updates(self, versions));
  }

  @Transactional(readOnly = true)
  public ParticipantUpdates updates(ParticipantSelf self) {
    return updates(self, feedVersions.read(self.spaceId(), self.eventId()));
  }

  private ParticipantUpdates updates(ParticipantSelf self, FeedVersions versions) {
    ParticipantValuesRow values =
        home.findValues(self.spaceId(), self.eventId(), self.participantId());
    return new ParticipantUpdates(
        versions.home(),
        versions.schedule(),
        versions.notices(),
        versions.groups(),
        versions.rooms(),
        versions.mealOrder(),
        values == null || values.checkIn() == null ? 0 : values.checkIn(),
        values == null || values.application() == null ? 0 : values.application(),
        notifications.summary(NotificationRecipient.participant(self)),
        properties.pollAfterSeconds(),
        clock.instant());
  }
}
