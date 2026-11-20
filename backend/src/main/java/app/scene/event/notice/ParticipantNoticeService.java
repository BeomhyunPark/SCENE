package app.scene.event.notice;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.audience.Audience;
import app.scene.event.audience.ParticipantAudience;
import app.scene.event.notice.mapper.NoticeQueryMapper;
import app.scene.event.notification.NotificationRecipient;
import app.scene.event.notification.Notifications;
import app.scene.event.participant.ParticipantSelf;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Participant notices (DEC-082 §6, notice-contract §5). Reads {@code PUBLISHED} rows of the
 * session's event and keeps those the participant may see ({@link ParticipantAudience}, judged on
 * every read with the latest group publication). A withdrawn participant is not active and sees
 * none. Notices a participant cannot see are {@code 404} without telling why. No audit; reading
 * marks nothing read.
 *
 * <p>A list request is the session check, one viewer statement, one notice statement (only the head
 * of each body), and one unread statement for the page; the event has at most a few dozen notices,
 * so filtering and paging are done here after the audience check and never come up short.
 */
@Service
public class ParticipantNoticeService {

  public static final int PREVIEW_MAX = 80;
  public static final int LIMIT_MAX = 50;
  public static final int LIMIT_DEFAULT = 20;

  private final NoticeQueryMapper queries;
  private final ParticipantAudience audience;
  private final Notifications notifications;
  private final JsonMapper json;

  public ParticipantNoticeService(
      NoticeQueryMapper queries,
      ParticipantAudience audience,
      Notifications notifications,
      JsonMapper json) {
    this.queries = queries;
    this.audience = audience;
    this.notifications = notifications;
    this.json = json;
  }

  /** Pinned first, then {@code publishedAt} newest first, then {@code noticeId} descending. */
  public ParticipantNoticePage list(ParticipantSelf self, String before, String limit) {
    NoticeCursor cursor = NoticeCursor.parse(before);
    int size = NoticeService.limit(limit, LIMIT_MAX, LIMIT_DEFAULT);
    ParticipantAudience.Viewer viewer = audience.viewer(self);
    if (!viewer.active()) {
      return new ParticipantNoticePage(List.of(), null);
    }
    List<NoticeRow> rows =
        new ArrayList<>(
            queries.findPublishedHeads(self.spaceId(), self.eventId(), PREVIEW_MAX + 1));
    rows.removeIf(row -> !viewer.sees(Audience.read(json, row.audience())));
    rows.sort((a, b) -> NoticeCursor.ORDER.compare(key(a), key(b)));
    if (cursor != null) {
      rows.removeIf(row -> !key(row).isAfter(cursor));
    }
    boolean more = rows.size() > size;
    List<NoticeRow> page = rows.subList(0, Math.min(rows.size(), size));
    List<UUID> ids = page.stream().map(NoticeRow::id).toList();
    Set<UUID> unread =
        notifications.unreadTargets(
            NotificationRecipient.participant(self), NoticeService.TARGET_TYPE, ids);
    List<ParticipantNoticeItem> items = new ArrayList<>();
    for (NoticeRow row : page) {
      items.add(
          new ParticipantNoticeItem(
              row.id(),
              row.title(),
              preview(row.body()),
              row.important(),
              row.pinned(),
              Audience.read(json, row.audience()).leadersOnly(),
              row.publishedAt(),
              row.editedAt(),
              unread.contains(row.id())));
    }
    String next = more ? key(page.get(page.size() - 1)).encode() : null;
    return new ParticipantNoticePage(items, next);
  }

  public ParticipantNoticeDetail detail(ParticipantSelf self, UUID noticeId) {
    NoticeRow row = queries.find(self.spaceId(), self.eventId(), noticeId);
    if (row == null || !row.isPublished()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    Audience stored = Audience.read(json, row.audience());
    if (!audience.viewer(self).sees(stored)) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    boolean unread =
        notifications.hasUnread(
            NotificationRecipient.participant(self), NoticeService.TARGET_TYPE, row.id());
    return new ParticipantNoticeDetail(
        row.id(),
        row.title(),
        preview(row.body()),
        row.body(),
        row.important(),
        row.pinned(),
        stored.leadersOnly(),
        row.publishedAt(),
        row.editedAt(),
        unread);
  }

  private static NoticeCursor key(NoticeRow row) {
    return NoticeCursor.of(row.pinned() ? 0 : 1, row.publishedAt(), row.id());
  }

  /** First 80 characters, line breaks as single spaces, "…" when cut. */
  static String preview(String body) {
    String flat = body.replaceAll("\\s*[\\r\\n]+\\s*", " ").strip();
    if (flat.codePointCount(0, flat.length()) <= PREVIEW_MAX) {
      return flat;
    }
    return flat.substring(0, flat.offsetByCodePoints(0, PREVIEW_MAX)).stripTrailing() + "…";
  }
}
