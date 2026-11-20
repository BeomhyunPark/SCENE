package app.scene.event.notification;

import app.scene.event.notification.mapper.NotificationMapper;
import app.scene.event.notification.mapper.NotificationQueryMapper;
import app.scene.event.notification.param.NotificationParam;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The shared notification list of participants and operators (DEC-080 §7, {@code notifications}).
 * Everything is in the database; nothing is kept in memory.
 *
 * <p><b>Making.</b> A publish path calls {@link #toParticipants} or {@link #toOperators} inside its
 * own transaction, so a rolled back publish leaves no notification. Recipients are fixed at that
 * moment (for example {@code ParticipantAudience.participantIds}); leave out the person who caused
 * it. An unread row with the same recipient, {@code kind} and target is merged: it is deleted and a
 * new row with a new {@code seq} and {@code count + 1} goes in (§7.3). One SQL statement handles up
 * to {@link #INSERT_CHUNK} recipients, so 200 participants are one statement.
 *
 * <p>Two makers for the same recipient, kind and target at the same instant can each leave one
 * unread row; callers that publish hold the event row lock, so this does not happen in practice.
 *
 * <p><b>Reading.</b> {@link #summary} (latest {@code seq} and unread count, one statement), {@link
 * #page}, {@link #markRead}. For notices: {@link #markTargetReadForAll} when a notice is archived
 * and {@link #unreadTargets} for the list's {@code unread} flag.
 */
@Component
public class Notifications {

  /** The unread count stops here; the screen shows "99+" (DEC-080 §4). */
  public static final int UNREAD_CAP = 100;

  static final int INSERT_CHUNK = 1000;

  private final NotificationMapper notifications;
  private final NotificationQueryMapper queries;
  private final Clock clock;

  public Notifications(
      NotificationMapper notifications, NotificationQueryMapper queries, Clock clock) {
    this.notifications = notifications;
    this.queries = queries;
    this.clock = clock;
  }

  /** One notification for each participant id, in the caller's transaction. Returns rows made. */
  @Transactional(propagation = Propagation.MANDATORY)
  public int toParticipants(
      UUID spaceId, UUID eventId, Collection<UUID> participantIds, NotificationDraft draft) {
    return insert(spaceId, eventId, RecipientKind.PARTICIPANT, participantIds, draft);
  }

  /** One notification for each operator user id, in the caller's transaction. */
  @Transactional(propagation = Propagation.MANDATORY)
  public int toOperators(
      UUID spaceId, UUID eventId, Collection<UUID> userIds, NotificationDraft draft) {
    return insert(spaceId, eventId, RecipientKind.OPERATOR, userIds, draft);
  }

  private int insert(
      UUID spaceId,
      UUID eventId,
      RecipientKind kind,
      Collection<UUID> recipientIds,
      NotificationDraft draft) {
    List<UUID> unique = new ArrayList<>(new LinkedHashSet<>(recipientIds));
    unique.remove(null);
    int made = 0;
    for (int from = 0; from < unique.size(); from += INSERT_CHUNK) {
      List<UUID> chunk = unique.subList(from, Math.min(unique.size(), from + INSERT_CHUNK));
      made +=
          notifications.insertMerged(
              NotificationParam.of(spaceId, eventId)
                  .recipients(kind, chunk)
                  .draft(draft)
                  .at(clock.instant()));
    }
    return made;
  }

  /** Latest {@code seq} (0 with none) and unread count up to {@link #UNREAD_CAP}. One statement. */
  public NotificationSummary summary(NotificationRecipient recipient) {
    NotificationSummaryRow row = queries.findSummary(NotificationParam.of(recipient));
    long latest = row == null || row.latestSeq() == null ? 0 : row.latestSeq();
    int unread = row == null ? 0 : Math.min(row.unreadCount(), UNREAD_CAP);
    return new NotificationSummary(latest, unread);
  }

  /** Newest first, {@code seq < before}. Reading does not mark anything read. */
  public NotificationPage page(NotificationRecipient recipient, NotificationListQuery query) {
    List<NotificationRow> rows =
        queries.findPage(
            NotificationParam.of(recipient).before(query.before()).limit(query.limit() + 1));
    boolean more = rows.size() > query.limit();
    List<Notification> items = new ArrayList<>();
    for (NotificationRow row : rows.subList(0, Math.min(rows.size(), query.limit()))) {
      items.add(row.toItem());
    }
    Long nextBefore = more ? items.get(items.size() - 1).seq() : null;
    return new NotificationPage(items, summary(recipient).unreadCount(), nextBefore);
  }

  /**
   * Marks the recipient's unread notifications read and returns the new unread count. Ids of other
   * recipients change nothing and give the same answer. Already read rows keep {@code readAt}.
   */
  @Transactional
  public UnreadCount markRead(NotificationRecipient recipient, NotificationReadRequest request) {
    NotificationParam param = NotificationParam.of(recipient).at(clock.instant());
    if (request.notificationIds() != null) {
      param.ids(request.notificationIds());
    } else if (request.target() != null) {
      param.target(request.target().type(), request.target().id());
    } else {
      param.upToSeq(request.upToSeq());
    }
    notifications.markRead(param);
    return new UnreadCount(summary(recipient).unreadCount());
  }

  /**
   * Marks every recipient's unread notifications that point at one target read, in the caller's
   * transaction (DEC-082 §6: archiving a notice).
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public int markTargetReadForAll(UUID spaceId, UUID eventId, String targetType, UUID targetId) {
    return notifications.markTargetReadForAll(
        NotificationParam.of(spaceId, eventId).target(targetType, targetId).at(clock.instant()));
  }

  /**
   * Which of {@code targetIds} have an unread notification of {@code targetType} for the recipient
   * (DEC-082 §5 {@code unread}). One statement for the whole list.
   */
  public Set<UUID> unreadTargets(
      NotificationRecipient recipient, String targetType, Collection<UUID> targetIds) {
    if (targetIds.isEmpty()) {
      return Set.of();
    }
    return new HashSet<>(
        queries.findUnreadTargets(
            NotificationParam.of(recipient).target(targetType, null).ids(targetIds)));
  }

  /** Whether the recipient has an unread notification pointing at the target. */
  public boolean hasUnread(NotificationRecipient recipient, String targetType, UUID targetId) {
    return unreadTargets(recipient, targetType, List.of(targetId)).contains(targetId);
  }
}
