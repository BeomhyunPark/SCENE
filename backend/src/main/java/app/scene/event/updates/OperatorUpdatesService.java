package app.scene.event.updates;

import app.scene.event.notice.NoticeBoardVersions;
import app.scene.event.notification.NotificationRecipient;
import app.scene.event.notification.Notifications;
import app.scene.event.notification.OperatorNotificationAccess;
import app.scene.event.updates.mapper.OperatorUpdatesQueryMapper;
import java.time.Clock;
import java.util.UUID;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

/**
 * The operator screen's cheap refresh check (DEC-080 §7.5, I3 #436). The access check is the
 * notification list's ({@link OperatorNotificationAccess}); then one statement for the notification
 * summary and one for the check-in value. No list or publication is read. Nothing is kept in
 * memory, and there is no address limit (operators share the venue Wi-Fi).
 *
 * <p>{@code notices} is {@link NoticeBoardVersions#read} (D2, one row per event). <b>{@code
 * schedule} is still 0:</b> the schedule server (C2, branch {@code
 * claude/roadmap-c-schedule-server}) is not on main yet; when it merges it fills that field in
 * {@link #read} with its working copy's {@code boardVersion} reader (one indexed statement; keep
 * the count in {@code OperatorUpdatesCostIT}).
 */
@Service
@EnableConfigurationProperties(OperatorProperties.class)
public class OperatorUpdatesService {

  private final OperatorNotificationAccess access;
  private final Notifications notifications;
  private final OperatorUpdatesQueryMapper queries;
  private final OperatorProperties properties;
  private final NoticeBoardVersions noticeVersions;
  private final Clock clock;

  public OperatorUpdatesService(
      OperatorNotificationAccess access,
      Notifications notifications,
      OperatorUpdatesQueryMapper queries,
      OperatorProperties properties,
      NoticeBoardVersions noticeVersions,
      Clock clock) {
    this.access = access;
    this.notifications = notifications;
    this.queries = queries;
    this.properties = properties;
    this.noticeVersions = noticeVersions;
    this.clock = clock;
  }

  public OperatorUpdates read(UUID actorId, UUID eventId) {
    NotificationRecipient recipient = access.open(actorId, eventId);
    long notices = noticeVersions.read(recipient.spaceId(), eventId);
    long schedule = 0; // C2 connects the working copy's boardVersion here.
    return new OperatorUpdates(
        notifications.summary(recipient),
        notices,
        schedule,
        queries.findCheckInSeq(recipient.spaceId(), eventId),
        properties.pollAfterSeconds(),
        clock.instant());
  }
}
