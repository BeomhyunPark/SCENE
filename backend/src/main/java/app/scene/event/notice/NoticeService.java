package app.scene.event.notice;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.mybatis.AuthorityStatuses;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import app.scene.event.audience.ParticipantAudience;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.notice.mapper.NoticeMapper;
import app.scene.event.notice.mapper.NoticeQueryMapper;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator notices (DEC-082, api.md "공지"). Reads need effective {@code EVENT_READ} or an active
 * space owner or admin; writes need effective {@code NOTICE_WRITE}. Writes run 404 → 403 → 400 →
 * 409 event state → 404 notice → {@code ALREADY_…} → 409 version → 409 state or pin rule → result,
 * and lock the event row, so writes of one event commit one after another (the pin limit is counted
 * under that lock).
 *
 * <p>Every real write raises {@link NoticeBoardVersions} (operators). A change participants can see
 * raises {@code participant_feed_versions.notices} in the same transaction: publish, and on a
 * published notice edit, pin change, archive and unarchive when the audience before or after
 * includes participants. Notifications go in the same transaction too, so a failed publish leaves
 * neither the value nor a notification. Titles and bodies never go to audit, logs or error bodies.
 */
@Service
public class NoticeService {

  public static final int TITLE_MAX = 100;
  public static final int BODY_MAX = 5000;
  public static final int PIN_MAX = 3;
  public static final int LIST_LIMIT_MAX = 50;
  public static final int LIST_LIMIT_DEFAULT = 30;

  static final String TARGET_TYPE = "NOTICE";
  static final String NOTICE_PUBLISHED = "NOTICE_PUBLISHED";
  static final String NOTICE_UPDATED = "NOTICE_UPDATED";
  static final String STAFF_NOTICE_PUBLISHED = "STAFF_NOTICE_PUBLISHED";
  static final String STAFF_NOTICE_UPDATED = "STAFF_NOTICE_UPDATED";

  private static final List<String> DEFAULT_STATUSES =
      List.of(NoticeRow.DRAFT, NoticeRow.PUBLISHED);
  private static final List<String> STATUSES =
      List.of(NoticeRow.DRAFT, NoticeRow.PUBLISHED, NoticeRow.ARCHIVED);

  private final EventAccessGate gate;
  private final EventRepository events;
  private final EventUserPermissionRepository permissions;
  private final NoticeMapper notices;
  private final NoticeQueryMapper queries;
  private final NoticeBoardVersions board;
  private final ParticipantFeedVersions feedVersions;
  private final ParticipantAudience participantAudience;
  private final Notifications notifications;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public NoticeService(
      EventAccessGate gate,
      EventRepository events,
      EventUserPermissionRepository permissions,
      NoticeMapper notices,
      NoticeQueryMapper queries,
      NoticeBoardVersions board,
      ParticipantFeedVersions feedVersions,
      ParticipantAudience participantAudience,
      Notifications notifications,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.permissions = permissions;
    this.notices = notices;
    this.queries = queries;
    this.board = board;
    this.feedVersions = feedVersions;
    this.participantAudience = participantAudience;
    this.notifications = notifications;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  // ---------------------------------------------------------------- reads

  /**
   * Operator list. Order: pinned {@code PUBLISHED}, then {@code DRAFT} by last change, then the
   * rest by {@code publishedAt} (an archived draft by last change), newest first, then id.
   */
  @Transactional(readOnly = true)
  public NoticeList list(
      UUID actorId, UUID eventId, String status, String audience, String before, String limit) {
    UUID spaceId = openForRead(actorId, eventId);
    List<String> statuses = statuses(status);
    Set<AudienceType> audiences = audiences(audience);
    NoticeCursor cursor = NoticeCursor.parse(before);
    int size = limit(limit);

    List<NoticeRow> rows = new ArrayList<>(queries.findByStatus(spaceId, eventId, statuses));
    rows.removeIf(row -> !matches(row, audiences));
    rows.sort((a, b) -> NoticeCursor.ORDER.compare(operatorKey(a), operatorKey(b)));
    if (cursor != null) {
      rows.removeIf(row -> !operatorKey(row).isAfter(cursor));
    }
    boolean more = rows.size() > size;
    List<Notice> items = new ArrayList<>();
    for (NoticeRow row : rows.subList(0, Math.min(rows.size(), size))) {
      items.add(view(row));
    }
    String next = more ? operatorKey(rows.get(size - 1)).encode() : null;
    int pinnedCount = queries.findPinnedIds(spaceId, eventId).size();
    return new NoticeList(items, pinnedCount, next);
  }

  @Transactional(readOnly = true)
  public Notice detail(UUID actorId, UUID eventId, UUID noticeId) {
    UUID spaceId = openForRead(actorId, eventId);
    return view(target(spaceId, eventId, noticeId));
  }

  // ---------------------------------------------------------------- writes

  /** Creates a {@code DRAFT}, or a {@code PUBLISHED} notice with {@code publish: true}. */
  @Transactional
  public NoticeWritten create(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    requireObject(body);
    String title = title(body.get("title"));
    String text = body(body.get("body"));
    boolean important = optionalFlag(body, "important", false);
    boolean pinned = optionalFlag(body, "pinned", false);
    Audience audience = Audience.parse(body.get(Audience.FIELD));
    boolean publish = optionalFlag(body, "publish", false);
    lockWritable(spaceId, eventId);

    if (publish && pinned) {
      requirePinRoom(spaceId, eventId, null);
    }
    Instant now = now();
    UUID id = UUID.randomUUID();
    notices.insert(
        id,
        spaceId,
        eventId,
        title,
        text,
        important,
        pinned,
        audience.toJson(json),
        publish ? NoticeRow.PUBLISHED : NoticeRow.DRAFT,
        publish ? now : null,
        actorId,
        now);
    board.bump(spaceId, eventId);
    NoticeRow row = existing(spaceId, eventId, id);
    int notified = publish ? published(row, actorId, now) : 0;
    return new NoticeWritten(view(row), notified);
  }

  /**
   * Changes {@code title}, {@code body}, {@code important}, {@code pinned}, {@code audience}. On a
   * {@code PUBLISHED} notice a content change (everything but {@code pinned}) sets {@code editedAt}
   * and writes {@code NOTICE_UPDATED} audit; {@code notify: true} with a content change sends
   * {@code NOTICE_UPDATED}. Same values change nothing.
   */
  @Transactional
  public NoticeWritten patch(UUID actorId, UUID eventId, UUID noticeId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    requireObject(body);
    int expected = requiredVersion(body.get("expectedVersion"));
    String title = has(body, "title") ? title(body.get("title")) : null;
    String text = has(body, "body") ? body(body.get("body")) : null;
    Boolean important = has(body, "important") ? flag(body, "important") : null;
    Boolean pinned = has(body, "pinned") ? flag(body, "pinned") : null;
    Audience audience = has(body, Audience.FIELD) ? Audience.parse(body.get(Audience.FIELD)) : null;
    boolean notify = optionalFlag(body, "notify", false);
    lockWritable(spaceId, eventId);

    NoticeRow row = target(spaceId, eventId, noticeId);
    requireVersion(row, expected);
    if (row.isArchived()) {
      throw stateError(row);
    }
    Audience before = Audience.read(json, row.audience());
    String nextTitle = title == null ? row.title() : title;
    String nextBody = text == null ? row.body() : text;
    boolean nextImportant = important == null ? row.important() : important;
    boolean nextPinned = pinned == null ? row.pinned() : pinned;
    Audience nextAudience = audience == null ? before : audience;

    List<String> fields = new ArrayList<>();
    if (!nextTitle.equals(row.title())) {
      fields.add("title");
    }
    if (!nextBody.equals(row.body())) {
      fields.add("body");
    }
    if (nextImportant != row.important()) {
      fields.add("important");
    }
    if (!nextAudience.equals(before)) {
      fields.add(Audience.FIELD);
    }
    boolean contentChanged = !fields.isEmpty();
    boolean pinChanged = nextPinned != row.pinned();
    if (!contentChanged && !pinChanged) {
      return new NoticeWritten(view(row), 0);
    }
    if (row.isPublished() && pinChanged && nextPinned) {
      requirePinRoom(spaceId, eventId, row.id());
    }
    Instant now = now();
    boolean published = row.isPublished();
    Instant editedAt = published && contentChanged ? now : row.editedAt();
    update(
        row,
        nextTitle,
        nextBody,
        nextImportant,
        nextPinned,
        nextAudience,
        row.status(),
        row.firstPublishedAt(),
        row.publishedAt(),
        editedAt,
        row.archivedAt(),
        actorId,
        now);
    board.bump(spaceId, eventId);
    NoticeRow after = existing(spaceId, eventId, noticeId);
    int notified = 0;
    if (published) {
      if (before.includesParticipants() || nextAudience.includesParticipants()) {
        feedVersions.bump(spaceId, eventId, FeedArea.NOTICES);
      }
      if (contentChanged) {
        if (notify) {
          notified = notify(after, nextAudience, actorId, NOTICE_UPDATED, STAFF_NOTICE_UPDATED);
        }
        if (pinChanged) {
          fields.add("pinned");
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("noticeId", noticeId.toString());
        detail.put("version", after.version());
        detail.put("fields", fields);
        detail.put("notify", notify);
        detail.put("notifiedCount", notified);
        audit(spaceId, eventId, actorId, AuditActions.NOTICE_UPDATED, detail, now);
      }
    }
    return new NoticeWritten(view(after), notified);
  }

  /** Deletes a {@code DRAFT}. Other states are {@code 409 INVALID_STATE_TRANSITION}. */
  @Transactional
  public void delete(UUID actorId, UUID eventId, UUID noticeId, String expectedVersion) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = requiredVersion(expectedVersion);
    lockWritable(spaceId, eventId);

    NoticeRow row = target(spaceId, eventId, noticeId);
    requireVersion(row, expected);
    if (!row.isDraft()) {
      throw stateError(row);
    }
    if (notices.delete(spaceId, eventId, noticeId) != 1) {
      throw new IllegalStateException("notice disappeared under the event lock");
    }
    board.bump(spaceId, eventId);
  }

  /** {@code DRAFT} → {@code PUBLISHED}. {@code ALREADY_PUBLISHED} writes nothing. */
  @Transactional
  public NoticeCommandResult publish(UUID actorId, UUID eventId, UUID noticeId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = commandVersion(body);
    lockWritable(spaceId, eventId);

    NoticeRow row = target(spaceId, eventId, noticeId);
    if (row.isPublished()) {
      return new NoticeCommandResult(NoticeCommandResult.ALREADY_PUBLISHED, view(row), 0);
    }
    requireVersion(row, expected);
    if (row.isArchived()) {
      throw stateError(row);
    }
    if (row.pinned()) {
      requirePinRoom(spaceId, eventId, row.id());
    }
    Instant now = now();
    Audience audience = Audience.read(json, row.audience());
    update(
        row,
        row.title(),
        row.body(),
        row.important(),
        row.pinned(),
        audience,
        NoticeRow.PUBLISHED,
        now,
        now,
        null,
        null,
        actorId,
        now);
    board.bump(spaceId, eventId);
    NoticeRow after = existing(spaceId, eventId, noticeId);
    int notified = published(after, actorId, now);
    return new NoticeCommandResult(NoticeCommandResult.PUBLISHED, view(after), notified);
  }

  /**
   * {@code DRAFT} or {@code PUBLISHED} → {@code ARCHIVED}; the pin is cleared and unread
   * notifications pointing at it are marked read. {@code ALREADY_ARCHIVED} writes nothing.
   */
  @Transactional
  public NoticeCommandResult archive(UUID actorId, UUID eventId, UUID noticeId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = commandVersion(body);
    lockWritable(spaceId, eventId);

    NoticeRow row = target(spaceId, eventId, noticeId);
    if (row.isArchived()) {
      return new NoticeCommandResult(NoticeCommandResult.ALREADY_ARCHIVED, view(row), 0);
    }
    requireVersion(row, expected);
    Instant now = now();
    Audience audience = Audience.read(json, row.audience());
    update(
        row,
        row.title(),
        row.body(),
        row.important(),
        false,
        audience,
        NoticeRow.ARCHIVED,
        row.firstPublishedAt(),
        row.publishedAt(),
        row.editedAt(),
        now,
        actorId,
        now);
    board.bump(spaceId, eventId);
    if (row.isPublished() && audience.includesParticipants()) {
      feedVersions.bump(spaceId, eventId, FeedArea.NOTICES);
    }
    notifications.markTargetReadForAll(spaceId, eventId, TARGET_TYPE, noticeId);
    NoticeRow after = existing(spaceId, eventId, noticeId);
    audit(spaceId, eventId, actorId, AuditActions.NOTICE_ARCHIVED, versionDetail(after), now);
    return new NoticeCommandResult(NoticeCommandResult.ARCHIVED, view(after), 0);
  }

  /**
   * {@code ARCHIVED} → {@code PUBLISHED} when it was ever published ({@code publishedAt} kept, no
   * notification), otherwise {@code DRAFT}. Comes back unpinned.
   */
  @Transactional
  public NoticeCommandResult unarchive(UUID actorId, UUID eventId, UUID noticeId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = commandVersion(body);
    lockWritable(spaceId, eventId);

    NoticeRow row = target(spaceId, eventId, noticeId);
    requireVersion(row, expected);
    if (!row.isArchived()) {
      throw stateError(row);
    }
    Instant now = now();
    Audience audience = Audience.read(json, row.audience());
    boolean wasPublished = row.firstPublishedAt() != null;
    update(
        row,
        row.title(),
        row.body(),
        row.important(),
        false,
        audience,
        wasPublished ? NoticeRow.PUBLISHED : NoticeRow.DRAFT,
        row.firstPublishedAt(),
        row.publishedAt(),
        row.editedAt(),
        null,
        actorId,
        now);
    board.bump(spaceId, eventId);
    if (wasPublished && audience.includesParticipants()) {
      feedVersions.bump(spaceId, eventId, FeedArea.NOTICES);
    }
    NoticeRow after = existing(spaceId, eventId, noticeId);
    audit(spaceId, eventId, actorId, AuditActions.NOTICE_UNARCHIVED, versionDetail(after), now);
    return new NoticeCommandResult(NoticeCommandResult.UNARCHIVED, view(after), 0);
  }

  // ---------------------------------------------------------------- effects

  /** After a row became {@code PUBLISHED}: participant value, notifications, audit. */
  private int published(NoticeRow row, UUID actorId, Instant now) {
    Audience audience = Audience.read(json, row.audience());
    if (audience.includesParticipants()) {
      feedVersions.bump(row.spaceId(), row.eventId(), FeedArea.NOTICES);
    }
    int notified = notify(row, audience, actorId, NOTICE_PUBLISHED, STAFF_NOTICE_PUBLISHED);
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("noticeId", row.id().toString());
    detail.put("version", row.version());
    detail.put("audienceTypes", audienceTypes(audience));
    detail.put("important", row.important());
    detail.put("notifiedCount", notified);
    audit(row.spaceId(), row.eventId(), actorId, AuditActions.NOTICE_PUBLISHED, detail, now);
    return notified;
  }

  /**
   * Participants inside the audience now, and for {@code STAFF} every active operator but the
   * actor. Recipients are fixed here; someone who becomes a leader later sees the notice in the
   * list without a notification.
   */
  private int notify(
      NoticeRow row, Audience audience, UUID actorId, String participantKind, String staffKind) {
    UUID spaceId = row.spaceId();
    UUID eventId = row.eventId();
    int made = 0;
    List<UUID> participants = participantAudience.participantIds(spaceId, eventId, audience);
    if (!participants.isEmpty()) {
      made +=
          notifications.toParticipants(
              spaceId, eventId, participants, draft(participantKind, row, false));
    }
    if (audience.has(AudienceType.STAFF)) {
      List<UUID> operators =
          new ArrayList<>(queries.findActiveOperatorIds(spaceId, eventId, AuthorityStatuses.ENDED));
      operators.remove(actorId);
      if (!operators.isEmpty()) {
        made += notifications.toOperators(spaceId, eventId, operators, draft(staffKind, row, true));
      }
    }
    return made;
  }

  private static NotificationDraft draft(String kind, NoticeRow row, boolean staff) {
    String title;
    if (kind.endsWith("_UPDATED")) {
      title = row.important() ? "중요 공지 수정" : "공지 수정";
    } else if (staff) {
      title = row.important() ? "중요 운영진 공지" : "운영진 공지";
    } else {
      title = row.important() ? "중요 공지" : "새 공지";
    }
    return new NotificationDraft(kind, TARGET_TYPE, row.id(), title, row.title(), row.important());
  }

  // ---------------------------------------------------------------- helpers

  private void update(
      NoticeRow row,
      String title,
      String body,
      boolean important,
      boolean pinned,
      Audience audience,
      String status,
      Instant firstPublishedAt,
      Instant publishedAt,
      Instant editedAt,
      Instant archivedAt,
      UUID actorId,
      Instant now) {
    int written =
        notices.update(
            row.spaceId(),
            row.eventId(),
            row.id(),
            title,
            body,
            important,
            pinned,
            audience.toJson(json),
            status,
            firstPublishedAt,
            publishedAt,
            editedAt,
            archivedAt,
            actorId,
            now);
    if (written != 1) {
      throw new IllegalStateException("notice disappeared under the event lock");
    }
  }

  private void requirePinRoom(UUID spaceId, UUID eventId, UUID self) {
    List<UUID> pinned = new ArrayList<>(queries.findPinnedIds(spaceId, eventId));
    pinned.remove(self);
    if (pinned.size() >= PIN_MAX) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("reason", "PIN_LIMIT");
      details.put("pinnedNoticeIds", pinned.stream().map(UUID::toString).toList());
      throw new SceneException(ErrorCode.CONFLICT, details);
    }
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorId,
      String action,
      Map<String, Object> detail,
      Instant now) {
    auditLogs.save(spaceId, eventId, actorId, action, json.writeValueAsString(detail), now);
  }

  private static Map<String, Object> versionDetail(NoticeRow row) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("noticeId", row.id().toString());
    detail.put("version", row.version());
    return detail;
  }

  private static List<String> audienceTypes(Audience audience) {
    List<String> out = new ArrayList<>();
    for (Audience.Entry entry : audience.entries()) {
      out.add(entry.type());
    }
    return out;
  }

  Notice view(NoticeRow row) {
    List<Notice.AudienceEntry> audience = new ArrayList<>();
    for (Audience.Entry entry : Audience.read(json, row.audience()).entries()) {
      audience.add(new Notice.AudienceEntry(entry.type()));
    }
    return new Notice(
        row.id(),
        row.title(),
        row.body(),
        row.important(),
        row.pinned(),
        audience,
        row.status(),
        row.version(),
        row.firstPublishedAt(),
        row.publishedAt(),
        row.editedAt(),
        row.archivedAt(),
        row.createdByDisplayName(),
        row.updatedByDisplayName(),
        row.updatedAt());
  }

  private static NoticeCursor operatorKey(NoticeRow row) {
    if (row.isPublished() && row.pinned()) {
      return NoticeCursor.of(0, row.publishedAt(), row.id());
    }
    if (row.isDraft()) {
      return NoticeCursor.of(1, row.updatedAt(), row.id());
    }
    Instant at = row.publishedAt() == null ? row.updatedAt() : row.publishedAt();
    return NoticeCursor.of(2, at, row.id());
  }

  private boolean matches(NoticeRow row, Set<AudienceType> audiences) {
    if (audiences == null) {
      return true;
    }
    for (AudienceType type : audiences) {
      if (Audience.read(json, row.audience()).has(type)) {
        return true;
      }
    }
    return false;
  }

  private UUID openForRead(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_READ) && !opened.membership().seesEveryEvent()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return opened.location().spaceId();
  }

  private UUID openForWrite(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.NOTICE_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return opened.location().spaceId();
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId, Permission permission) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(location.spaceId(), location.id(), actorId, permission.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        permission, opened.eventRole(), opened.authorityEnded(), effect);
  }

  /** Notices are written in DRAFT, ACTIVE and ENDED (follow-up notices, DEC-051). */
  private void lockWritable(UUID spaceId, UUID eventId) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    switch (event.lifecycleStatus()) {
      case "DRAFT", "ACTIVE", "ENDED" -> {}
      case "ARCHIVED" ->
          throw new SceneException(
              ErrorCode.EVENT_ARCHIVED, Map.of("eventStatus", event.lifecycleStatus()));
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
  }

  private NoticeRow target(UUID spaceId, UUID eventId, UUID noticeId) {
    NoticeRow row = queries.find(spaceId, eventId, noticeId);
    if (row == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return row;
  }

  private NoticeRow existing(UUID spaceId, UUID eventId, UUID noticeId) {
    NoticeRow row = queries.find(spaceId, eventId, noticeId);
    if (row == null) {
      throw new IllegalStateException("notice row is missing after a write");
    }
    return row;
  }

  private static void requireVersion(NoticeRow row, int expected) {
    if (row.version() != expected) {
      // Title and body stay out of error bodies (notice-contract §9); the screen reads the detail.
      Map<String, Object> current = new LinkedHashMap<>();
      current.put("noticeId", row.id().toString());
      current.put("status", row.status());
      current.put("version", row.version());
      current.put("updatedAt", row.updatedAt().toString());
      current.put("updatedByDisplayName", row.updatedByDisplayName());
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, Map.of("notice", current));
    }
  }

  private static SceneException stateError(NoticeRow row) {
    return new SceneException(
        ErrorCode.INVALID_STATE_TRANSITION, Map.of("noticeStatus", row.status()));
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  // ---------------------------------------------------------------- parsing

  private static List<String> statuses(String value) {
    if (value == null) {
      return DEFAULT_STATUSES;
    }
    Set<String> out = new LinkedHashSet<>();
    for (String part : value.split(",", -1)) {
      String status = part.strip();
      if (!STATUSES.contains(status)) {
        throw invalid("status");
      }
      out.add(status);
    }
    return List.copyOf(out);
  }

  private static Set<AudienceType> audiences(String value) {
    if (value == null) {
      return null;
    }
    Set<AudienceType> out = new LinkedHashSet<>();
    for (String part : value.split(",", -1)) {
      String type = part.strip();
      AudienceType found = null;
      for (AudienceType candidate : AudienceType.values()) {
        if (candidate.name().equals(type)) {
          found = candidate;
        }
      }
      if (found == null) {
        throw invalid(Audience.FIELD);
      }
      out.add(found);
    }
    return out;
  }

  static int limit(String value, int max, int fallback) {
    if (value == null) {
      return fallback;
    }
    if (!value.matches("[0-9]{1,3}")) {
      throw invalid("limit");
    }
    int parsed = Integer.parseInt(value);
    if (parsed < 1 || parsed > max) {
      throw invalid("limit");
    }
    return parsed;
  }

  private static int limit(String value) {
    return limit(value, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT);
  }

  private static String title(JsonNode node) {
    if (node == null || !node.isString()) {
      throw invalid("title");
    }
    String title = node.asString().strip();
    int length = title.codePointCount(0, title.length());
    if (length < 1 || length > TITLE_MAX) {
      throw invalid("title");
    }
    return title;
  }

  private static String body(JsonNode node) {
    if (node == null || !node.isString()) {
      throw invalid("body");
    }
    String body = node.asString().strip();
    int length = body.codePointCount(0, body.length());
    if (length < 1 || length > BODY_MAX) {
      throw invalid("body");
    }
    return body;
  }

  private static boolean has(JsonNode body, String name) {
    return body.has(name);
  }

  private static boolean flag(JsonNode body, String name) {
    JsonNode node = body.get(name);
    if (node == null || !node.isBoolean()) {
      throw invalid(name);
    }
    return node.asBoolean();
  }

  private static boolean optionalFlag(JsonNode body, String name, boolean fallback) {
    JsonNode node = body.get(name);
    if (node == null || node.isNull()) {
      return fallback;
    }
    return flag(body, name);
  }

  private static int requiredVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 1) {
      throw invalid("expectedVersion");
    }
    return node.asInt();
  }

  private static int requiredVersion(String value) {
    if (value == null || !value.matches("[0-9]{1,9}") || Integer.parseInt(value) < 1) {
      throw invalid("expectedVersion");
    }
    return Integer.parseInt(value);
  }

  private static int commandVersion(JsonNode body) {
    requireObject(body);
    return requiredVersion(body.get("expectedVersion"));
  }

  private static void requireObject(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid("body");
    }
  }

  static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }
}
