package app.scene.event.schedule;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import app.scene.event.audience.ParticipantAudience;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.MealSlots;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventProfile;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
import app.scene.event.participant.ParticipantProperties;
import app.scene.event.participant.ParticipantSelf;
import app.scene.event.schedule.ScheduleRepository.LatestPublication;
import app.scene.event.schedule.ScheduleResponses.Board;
import app.scene.event.schedule.ScheduleResponses.ItemDeleted;
import app.scene.event.schedule.ScheduleResponses.ItemWritten;
import app.scene.event.schedule.ScheduleResponses.OperatorItem;
import app.scene.event.schedule.ScheduleResponses.ParticipantItem;
import app.scene.event.schedule.ScheduleResponses.ParticipantRemoved;
import app.scene.event.schedule.ScheduleResponses.ParticipantSchedule;
import app.scene.event.schedule.ScheduleResponses.PendingChanges;
import app.scene.event.schedule.ScheduleResponses.Publication;
import app.scene.event.schedule.ScheduleResponses.PublishResult;
import app.scene.event.schedule.ScheduleResponses.Published;
import app.scene.event.schedule.ScheduleResponses.PublishedItem;
import app.scene.event.schedule.ScheduleResponses.PublishedRemoved;
import app.scene.event.schedule.ScheduleResponses.Slot;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Event schedule working copy, publication and reads (DEC-081, #435, api.md "일정표").
 *
 * <p>Operator reads need effective {@code EVENT_READ} or an active space owner or admin; every
 * write and the publication need effective {@code SCHEDULE_WRITE}. Writes run 404 → 403 → 400 → 409
 * state → 404 target → 409 version → 409 rule → 409 confirmation → result, and lock the event row,
 * so writes of one event commit one after another.
 *
 * <p>A publication inserts one {@code schedule_publications} row and, in the same transaction,
 * raises {@code participant_feed_versions.schedule}, makes the participant notifications and writes
 * audit {@code SCHEDULE_PUBLISHED}. {@code ALREADY_PUBLISHED} and working-copy saves write none of
 * these. "Save and publish" ({@code publish: true} on an item write) does the save and the
 * publication in one transaction, so a failing publication rolls the save back.
 *
 * <p>Participants read only the latest snapshot, filtered with {@link ParticipantAudience}; a
 * participant without a SUBMITTED application sees nothing ({@code NOT_ELIGIBLE}).
 */
@Service
public class ScheduleService {

  public static final int ITEMS_MAX = 300;
  static final Duration CHANGE_WINDOW = Duration.ofHours(24);
  static final int TITLES_IN_BODY = 3;

  static final String TARGET_TYPE = "SCHEDULE";
  static final String KIND_PUBLISHED = "SCHEDULE_PUBLISHED";
  static final String KIND_CHANGED = "SCHEDULE_CHANGED";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final ScheduleRepository schedule;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final FormRepository forms;
  private final JsonMapper json;
  private final Clock clock;
  private final ParticipantFeedVersions feedVersions;
  private final ParticipantAudience audiences;
  private final Notifications notifications;
  private final ParticipantProperties properties;

  public ScheduleService(
      EventAccessGate gate,
      EventRepository events,
      ScheduleRepository schedule,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      FormRepository forms,
      JsonMapper json,
      Clock clock,
      ParticipantFeedVersions feedVersions,
      ParticipantAudience audiences,
      Notifications notifications,
      ParticipantProperties properties) {
    this.gate = gate;
    this.events = events;
    this.schedule = schedule;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.forms = forms;
    this.json = json;
    this.clock = clock;
    this.feedVersions = feedVersions;
    this.audiences = audiences;
    this.notifications = notifications;
    this.properties = properties;
  }

  // ---------------------------------------------------------------- operator reads

  /** {@code GET …/schedule}: the working copy compared with the latest publication. */
  @Transactional(readOnly = true)
  public Board board(UUID actorId, UUID eventId) {
    UUID spaceId = openForRead(actorId, eventId);
    EventProfile profile = profile(eventId);
    int dayCount = ScheduleViews.dayCount(profile.startDate(), profile.endDate());
    List<ScheduleItemRow> rows = schedule.items(spaceId, eventId);
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    ScheduleSnapshot previous = latest.map(LatestPublication::snapshot).orElse(null);
    Map<UUID, ItemContent> published = publishedContent(previous);
    List<OperatorItem> items = new ArrayList<>();
    for (ScheduleItemRow row : rows) {
      items.add(operatorItem(row, profile.startDate(), dayCount, previous, published));
    }
    ScheduleChanges pending = pending(rows, previous);
    Publication publication =
        new Publication(
            latest.map(LatestPublication::publishedAt).orElse(null),
            latest.map(LatestPublication::publishedByDisplayName).orElse(null),
            latest.map(LatestPublication::boardVersion).orElse(null),
            latest.isEmpty() || pending.any(),
            new PendingChanges(
                pending.added().size(), pending.changed().size(), pending.removed().size()));
    return new Board(
        profile.lifecycleStatus(),
        schedule.boardVersion(spaceId, eventId),
        profile.startDate(),
        profile.endDate(),
        properties.zone(),
        ScheduleViews.days(profile.startDate(), profile.endDate()),
        items,
        publication,
        slots(spaceId, eventId, rows));
  }

  /** {@code GET …/schedule/published}: the latest publication with every item and audience. */
  @Transactional(readOnly = true)
  public Published published(UUID actorId, UUID eventId) {
    UUID spaceId = openForRead(actorId, eventId);
    EventProfile profile = profile(eventId);
    LocalDate start = profile.startDate();
    Instant now = now();
    List<ScheduleViews.Day> days = ScheduleViews.days(start, profile.endDate());
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return new Published(
          ParticipantSchedule.NOT_PUBLISHED,
          null,
          null,
          null,
          properties.zone(),
          now,
          days,
          List.of(),
          List.of());
    }
    ZoneId zone = zone();
    ScheduleSnapshot snapshot = latest.get().snapshot();
    List<PublishedItem> items = new ArrayList<>();
    for (ScheduleSnapshot.Item item : snapshot.items()) {
      Audience audience = schedule.audience(item.audience());
      items.add(
          new PublishedItem(
              item.itemId(),
              item.day(),
              ScheduleViews.date(start, item.day()),
              item.startTime(),
              item.endTime(),
              ScheduleViews.endsNextDay(item.startTime(), item.endTime()),
              ScheduleViews.startsAt(start, item.day(), item.startTime(), zone),
              ScheduleViews.endsAt(start, item.day(), item.startTime(), item.endTime(), zone),
              item.title(),
              item.place(),
              item.description(),
              item.category(),
              item.audience(),
              audience.leadersOnly(),
              item.slotId(),
              item.sortOrder(),
              visibleChange(item.change(), now)));
    }
    List<PublishedRemoved> removed = new ArrayList<>();
    for (ScheduleSnapshot.Removed item : recent(snapshot.removedItems(), now)) {
      removed.add(
          new PublishedRemoved(
              item.itemId(),
              item.day(),
              ScheduleViews.date(start, item.day()),
              item.title(),
              item.startTime(),
              item.audience(),
              item.removedAt()));
    }
    return new Published(
        ParticipantSchedule.PUBLISHED,
        latest.get().publishedAt(),
        latest.get().publishedByDisplayName(),
        latest.get().boardVersion(),
        properties.zone(),
        now,
        days,
        items,
        removed);
  }

  // ---------------------------------------------------------------- writes

  /** {@code POST …/schedule/items}. */
  @Transactional
  public ItemWritten create(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    ItemInput input = ItemInput.forCreate(body);
    PublishOptions options = PublishOptions.fromBody(body);
    Locked locked = lockWritable(spaceId, eventId);
    requirePeriod(locked);
    ItemInput.check(input.create(0), locked.dayCount(), true);

    List<ScheduleItemRow> rows = schedule.items(spaceId, eventId);
    if (rows.size() >= ITEMS_MAX) {
      throw new SceneException(ErrorCode.CONFLICT, Map.of("reason", "ITEM_LIMIT"));
    }
    ItemContent draft = input.create(0);
    requireFreeSlot(spaceId, eventId, draft.slotId(), null);
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    if (options.publish()) {
      confirmOthers(options, pending(rows, snapshotOf(latest)));
    }
    Instant now = now();
    UUID itemId = UUID.randomUUID();
    ItemContent content =
        input.create(schedule.nextSortOrder(spaceId, eventId, draft.day(), draft.startTime()));
    schedule.insert(spaceId, eventId, itemId, content, actorId, now);
    long boardVersion = schedule.bumpBoardVersion(spaceId, eventId, now);
    return written(spaceId, eventId, itemId, actorId, boardVersion, options, locked);
  }

  /** {@code PATCH …/schedule/items/{itemId}}: only the sent fields change. */
  @Transactional
  public ItemWritten update(UUID actorId, UUID eventId, UUID itemId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    ItemInput input = ItemInput.forUpdate(body);
    int expectedVersion = requiredVersion(body.get("expectedVersion"));
    PublishOptions options = PublishOptions.fromBody(body);
    Locked locked = lockWritable(spaceId, eventId);

    ScheduleItemRow current = target(spaceId, eventId, itemId);
    if (current.version() != expectedVersion) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("item", asMap(currentItem(current, locked))));
    }
    ItemContent base = schedule.content(current);
    ItemContent merged = input.merge(base);
    ItemInput.check(merged, locked.dayCount(), input.has("day"));
    if (merged.slotId() != null && !merged.slotId().equals(base.slotId())) {
      requireFreeSlot(spaceId, eventId, merged.slotId(), itemId);
    }
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    if (options.publish()) {
      confirmOthers(
          options, without(pending(schedule.items(spaceId, eventId), snapshotOf(latest)), itemId));
    }
    long boardVersion;
    if (merged.equals(base)) {
      boardVersion = schedule.boardVersion(spaceId, eventId);
    } else {
      boolean moved = merged.day() != base.day() || !merged.startTime().equals(base.startTime());
      if (moved && !input.has("sortOrder")) {
        merged =
            input.merge(
                withSortOrder(
                    base,
                    schedule.nextSortOrder(spaceId, eventId, merged.day(), merged.startTime())));
      }
      Instant now = now();
      schedule.update(spaceId, eventId, itemId, merged, actorId, now);
      boardVersion = schedule.bumpBoardVersion(spaceId, eventId, now);
    }
    return written(spaceId, eventId, itemId, actorId, boardVersion, options, locked);
  }

  /** {@code DELETE …/schedule/items/{itemId}?expectedVersion=…}. */
  @Transactional
  public ItemDeleted delete(
      UUID actorId,
      UUID eventId,
      UUID itemId,
      String expectedVersion,
      String publish,
      String confirmOtherChanges,
      String notify) {
    UUID spaceId = openForWrite(actorId, eventId);
    int expected = requiredVersion(expectedVersion);
    PublishOptions options = PublishOptions.fromQuery(publish, confirmOtherChanges, notify);
    Locked locked = lockWritable(spaceId, eventId);

    ScheduleItemRow current = target(spaceId, eventId, itemId);
    if (current.version() != expected) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("item", asMap(currentItem(current, locked))));
    }
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    if (options.publish()) {
      confirmOthers(
          options, without(pending(schedule.items(spaceId, eventId), snapshotOf(latest)), itemId));
    }
    Instant now = now();
    schedule.delete(spaceId, eventId, itemId);
    long boardVersion = schedule.bumpBoardVersion(spaceId, eventId, now);
    PublishResult publication =
        options.publish()
            ? publishLocked(
                    spaceId, eventId, actorId, options.notifyParticipants(), locked, boardVersion)
                .result()
            : null;
    return new ItemDeleted(boardVersion, publication);
  }

  /** {@code POST …/schedule/publish}. */
  @Transactional
  public PublishResult publish(UUID actorId, UUID eventId, JsonNode body) {
    UUID spaceId = openForWrite(actorId, eventId);
    long expected = requiredBoardVersion(body == null ? null : body.get("expectedBoardVersion"));
    boolean notify = flag(body == null ? null : body.get("notify"), "notify", true);
    Locked locked = lockWritable(spaceId, eventId);

    long boardVersion = schedule.boardVersion(spaceId, eventId);
    if (boardVersion != expected) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("boardVersion", boardVersion));
    }
    return publishLocked(spaceId, eventId, actorId, notify, locked, boardVersion).result();
  }

  private ItemWritten written(
      UUID spaceId,
      UUID eventId,
      UUID itemId,
      UUID actorId,
      long boardVersion,
      PublishOptions options,
      Locked locked) {
    PublishResult publication = null;
    ScheduleSnapshot snapshot;
    if (options.publish()) {
      Outcome published =
          publishLocked(
              spaceId, eventId, actorId, options.notifyParticipants(), locked, boardVersion);
      publication = published.result();
      snapshot = published.snapshot();
    } else {
      snapshot = snapshotOf(schedule.latestPublication(spaceId, eventId));
    }
    ScheduleItemRow row =
        schedule
            .find(spaceId, eventId, itemId)
            .orElseThrow(() -> new IllegalStateException("schedule item row is missing"));
    OperatorItem item =
        operatorItem(
            row, locked.startDate(), locked.dayCount(), snapshot, publishedContent(snapshot));
    return new ItemWritten(item, boardVersion, publication);
  }

  // ---------------------------------------------------------------- publication

  private record Outcome(PublishResult result, ScheduleSnapshot snapshot) {}

  /**
   * The publication itself, with the event row locked and {@code boardVersion} checked by the
   * caller. {@code ALREADY_PUBLISHED} when the working copy equals the latest publication; never
   * for the first publication.
   */
  private Outcome publishLocked(
      UUID spaceId, UUID eventId, UUID actorId, boolean notify, Locked locked, long boardVersion) {
    List<ScheduleItemRow> rows = schedule.items(spaceId, eventId);
    Optional<LatestPublication> latest = schedule.latestPublication(spaceId, eventId);
    ScheduleSnapshot previous = snapshotOf(latest);
    ScheduleChanges changes = pending(rows, previous);
    if (latest.isPresent() && !changes.any()) {
      LatestPublication last = latest.get();
      return new Outcome(
          new PublishResult(
              PublishResult.ALREADY_PUBLISHED,
              last.publicationId(),
              last.publishedAt(),
              boardVersion,
              ScheduleChanges.NONE,
              0),
          previous);
    }
    requirePeriod(locked);
    List<String> outside = new ArrayList<>();
    for (ScheduleItemRow row : rows) {
      if (row.day() > locked.dayCount()) {
        outside.add(row.itemId().toString());
      }
    }
    if (!outside.isEmpty()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("reason", "ITEMS_OUT_OF_PERIOD");
      details.put("itemIds", outside);
      throw new SceneException(ErrorCode.CONFLICT, details);
    }

    Instant now = now();
    boolean first = previous == null;
    Map<UUID, ScheduleSnapshot.Item> before = new HashMap<>();
    if (previous != null) {
      for (ScheduleSnapshot.Item item : previous.items()) {
        before.put(item.itemId(), item);
      }
    }
    List<ScheduleSnapshot.Item> items = new ArrayList<>();
    Set<UUID> kept = new HashSet<>();
    for (ScheduleItemRow row : rows) {
      ItemContent content = schedule.content(row);
      ScheduleSnapshot.Item old = before.get(row.itemId());
      ScheduleSnapshot.Change change =
          first
              ? null
              : change(
                  content,
                  old == null ? null : schedule.content(old),
                  old == null ? null : old.change(),
                  now);
      kept.add(row.itemId());
      items.add(
          new ScheduleSnapshot.Item(
              row.itemId(),
              content.day(),
              content.startTime(),
              content.endTime(),
              content.title(),
              content.place(),
              content.description(),
              content.category(),
              json.readTree(content.audience().toJson(json)),
              content.slotId(),
              content.sortOrder(),
              change));
    }
    List<ScheduleSnapshot.Removed> removed = new ArrayList<>();
    if (previous != null) {
      for (ScheduleSnapshot.Removed item : recent(previous.removedItems(), now)) {
        if (!kept.contains(item.itemId())) {
          removed.add(item);
        }
      }
      for (ScheduleSnapshot.Item item : previous.items()) {
        if (!kept.contains(item.itemId())) {
          removed.add(
              new ScheduleSnapshot.Removed(
                  item.itemId(), item.day(), item.title(), item.startTime(), item.audience(), now));
        }
      }
    }
    ScheduleSnapshot snapshot = new ScheduleSnapshot(items, removed);
    UUID publicationId = UUID.randomUUID();
    schedule.insertPublication(
        spaceId, eventId, publicationId, boardVersion, snapshot, changes, actorId, now);
    // DEC-080 §4: participants reload the schedule card; same transaction as the publication.
    feedVersions.bump(spaceId, eventId, FeedArea.SCHEDULE);
    int notified =
        notify ? notifyParticipants(spaceId, eventId, first, changes, rows, previous) : 0;
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("publicationId", publicationId.toString());
    detail.put("boardVersion", boardVersion);
    detail.put("added", changes.added().size());
    detail.put("changed", changes.changed().size());
    detail.put("removed", changes.removed().size());
    detail.put("notify", notify);
    detail.put("notifiedCount", notified);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.SCHEDULE_PUBLISHED,
        json.writeValueAsString(detail),
        now);
    return new Outcome(
        new PublishResult(
            PublishResult.PUBLISHED, publicationId, now, boardVersion, changes, notified),
        snapshot);
  }

  /**
   * The change mark of one item at a publication (DEC-081 §6). A change made within the last 24
   * hours carries on; a new change within that window merges into it, keeping the earliest {@code
   * previous} value, and a tracked field changed back to that value drops out.
   */
  static ScheduleSnapshot.Change change(
      ItemContent now, ItemContent before, ScheduleSnapshot.Change earlier, Instant at) {
    boolean active = earlier != null && earlier.changedAt().isAfter(at.minus(CHANGE_WINDOW));
    if (before == null) {
      return new ScheduleSnapshot.Change(ScheduleResponses.ADDED, at, List.of(), null);
    }
    List<String> diff = now.diff(before);
    if (diff.isEmpty()) {
      return active ? earlier : null;
    }
    if (active && ScheduleResponses.ADDED.equals(earlier.kind())) {
      return new ScheduleSnapshot.Change(ScheduleResponses.ADDED, at, List.of(), null);
    }
    Set<String> fields = new LinkedHashSet<>();
    Map<String, Object> previous = new LinkedHashMap<>();
    if (active && earlier.fields() != null) {
      fields.addAll(earlier.fields());
      if (earlier.previous() != null) {
        previous.putAll(earlier.previous());
      }
    }
    fields.addAll(diff);
    for (String field : diff) {
      if (ItemContent.TRACKED.contains(field) && !previous.containsKey(field)) {
        previous.put(field, before.value(field));
      }
    }
    for (String field : ItemContent.TRACKED) {
      if (previous.containsKey(field)
          && Objects.equals(normalize(previous.get(field)), now.value(field))) {
        fields.remove(field);
        previous.remove(field);
      }
    }
    if (fields.isEmpty()) {
      return null;
    }
    List<String> ordered = new ArrayList<>();
    Map<String, Object> kept = new LinkedHashMap<>();
    for (String field : ItemContent.FIELDS) {
      if (fields.contains(field)) {
        ordered.add(field);
        if (previous.containsKey(field)) {
          kept.put(field, previous.get(field));
        }
      }
    }
    return new ScheduleSnapshot.Change(ScheduleResponses.CHANGED, at, ordered, kept);
  }

  /** A JSON-read number is compared as an int. */
  private static Object normalize(Object value) {
    return value instanceof Number number ? Integer.valueOf(number.intValue()) : value;
  }

  /**
   * DEC-081 §7. First publication: {@code SCHEDULE_PUBLISHED} to the participants who can see an
   * item. Later: {@code SCHEDULE_CHANGED} to the participants who could see a changed item before
   * or after; leaders also get the leader-only titles. Only {@code STAFF} items changed: nobody.
   * The body lists item titles only.
   */
  private int notifyParticipants(
      UUID spaceId,
      UUID eventId,
      boolean first,
      ScheduleChanges changes,
      List<ScheduleItemRow> rows,
      ScheduleSnapshot previous) {
    Map<UUID, Audience> after = new HashMap<>();
    for (ScheduleItemRow row : rows) {
      after.put(row.itemId(), Audience.read(json, row.audience()));
    }
    Map<UUID, Audience> before = new HashMap<>();
    if (previous != null) {
      for (ScheduleSnapshot.Item item : previous.items()) {
        before.put(item.itemId(), schedule.audience(item.audience()));
      }
    }
    List<String> allTitles = new ArrayList<>();
    List<String> leaderTitles = new ArrayList<>();
    List<String> everyTitle = new ArrayList<>();
    if (first) {
      for (ScheduleItemRow row : rows) {
        classify(row.title(), after.get(row.itemId()), null, allTitles, leaderTitles, everyTitle);
      }
    } else {
      for (ScheduleChanges.Ref ref : changes.added()) {
        classify(ref.title(), after.get(ref.itemId()), null, allTitles, leaderTitles, everyTitle);
      }
      for (ScheduleChanges.ChangedRef ref : changes.changed()) {
        classify(
            ref.title(),
            after.get(ref.itemId()),
            before.get(ref.itemId()),
            allTitles,
            leaderTitles,
            everyTitle);
      }
      for (ScheduleChanges.Ref ref : changes.removed()) {
        classify(ref.title(), null, before.get(ref.itemId()), allTitles, leaderTitles, everyTitle);
      }
    }
    if (allTitles.isEmpty() && leaderTitles.isEmpty()) {
      return 0;
    }
    List<UUID> leaders =
        leaderTitles.isEmpty()
            ? List.of()
            : audiences.participantIds(spaceId, eventId, Audience.of(AudienceType.LEADERS));
    List<UUID> everyone =
        allTitles.isEmpty()
            ? List.of()
            : audiences.participantIds(spaceId, eventId, Audience.of(AudienceType.ALL));
    Set<UUID> leaderSet = new HashSet<>(leaders);
    List<UUID> others = new ArrayList<>();
    for (UUID id : everyone) {
      if (!leaderSet.contains(id)) {
        others.add(id);
      }
    }
    int made = 0;
    if (!others.isEmpty()) {
      made += notifications.toParticipants(spaceId, eventId, others, draft(first, allTitles));
    }
    if (!leaders.isEmpty()) {
      made += notifications.toParticipants(spaceId, eventId, leaders, draft(first, everyTitle));
    }
    return made;
  }

  /** Puts a title in the list of the widest participant audience among {@code a} and {@code b}. */
  private static void classify(
      String title,
      Audience a,
      Audience b,
      List<String> allTitles,
      List<String> leaderTitles,
      List<String> everyTitle) {
    boolean all = (a != null && a.has(AudienceType.ALL)) || (b != null && b.has(AudienceType.ALL));
    boolean leaders =
        (a != null && a.has(AudienceType.LEADERS)) || (b != null && b.has(AudienceType.LEADERS));
    if (all) {
      allTitles.add(title);
      everyTitle.add(title);
    } else if (leaders) {
      leaderTitles.add(title);
      everyTitle.add(title);
    }
  }

  static NotificationDraft draft(boolean first, List<String> titles) {
    if (first) {
      return new NotificationDraft(KIND_PUBLISHED, TARGET_TYPE, null, "일정표가 올라왔어요", null, false);
    }
    return new NotificationDraft(
        KIND_CHANGED, TARGET_TYPE, null, "일정이 바뀌었어요", titles(titles), false);
  }

  /** Up to three titles, then "외 N건". */
  static String titles(List<String> titles) {
    List<String> shown = titles.subList(0, Math.min(TITLES_IN_BODY, titles.size()));
    String body = String.join(", ", shown);
    int rest = titles.size() - shown.size();
    return rest > 0 ? body + " 외 " + rest + "건" : body;
  }

  // ---------------------------------------------------------------- participant

  /** {@code GET /participant/schedule}: three statements after the session check. */
  @Transactional(readOnly = true)
  public ParticipantSchedule participant(ParticipantSelf self) {
    ParticipantAudience.Viewer viewer = audiences.viewer(self);
    ParticipantScheduleRow row = schedule.participantView(self.spaceId(), self.eventId());
    if (row == null) {
      throw new SceneException(ErrorCode.AUTHENTICATION_REQUIRED);
    }
    Instant now = now();
    LocalDate start = row.startDate();
    List<ScheduleViews.Day> days = ScheduleViews.days(start, row.endDate());
    if (!viewer.active()) {
      return new ParticipantSchedule(
          ParticipantSchedule.NOT_ELIGIBLE,
          null,
          properties.zone(),
          now,
          days,
          List.of(),
          List.of());
    }
    if (row.snapshot() == null) {
      return new ParticipantSchedule(
          ParticipantSchedule.NOT_PUBLISHED,
          null,
          properties.zone(),
          now,
          days,
          List.of(),
          List.of());
    }
    ScheduleSnapshot snapshot = schedule.snapshot(row.snapshot());
    ZoneId zone = zone();
    List<ParticipantItem> items = new ArrayList<>();
    for (ScheduleSnapshot.Item item : snapshot.items()) {
      Audience audience = schedule.audience(item.audience());
      if (!viewer.sees(audience)) {
        continue;
      }
      items.add(
          new ParticipantItem(
              item.itemId(),
              item.day(),
              ScheduleViews.date(start, item.day()),
              item.startTime(),
              item.endTime(),
              ScheduleViews.endsNextDay(item.startTime(), item.endTime()),
              ScheduleViews.startsAt(start, item.day(), item.startTime(), zone),
              ScheduleViews.endsAt(start, item.day(), item.startTime(), item.endTime(), zone),
              item.title(),
              item.place(),
              item.description(),
              item.category(),
              item.slotId(),
              item.sortOrder(),
              audience.leadersOnly(),
              visibleChange(item.change(), now)));
    }
    List<ParticipantRemoved> removed = new ArrayList<>();
    for (ScheduleSnapshot.Removed item : recent(snapshot.removedItems(), now)) {
      if (viewer.sees(schedule.audience(item.audience()))) {
        removed.add(
            new ParticipantRemoved(
                item.itemId(),
                item.day(),
                ScheduleViews.date(start, item.day()),
                item.title(),
                item.startTime(),
                item.removedAt()));
      }
    }
    return new ParticipantSchedule(
        ParticipantSchedule.PUBLISHED,
        row.publishedAt(),
        properties.zone(),
        now,
        days,
        items,
        removed);
  }

  // ---------------------------------------------------------------- comparison

  /** Working copy against {@code previous}; every item is {@code added} before the first. */
  private ScheduleChanges pending(List<ScheduleItemRow> rows, ScheduleSnapshot previous) {
    List<ScheduleChanges.Ref> added = new ArrayList<>();
    List<ScheduleChanges.ChangedRef> changed = new ArrayList<>();
    List<ScheduleChanges.Ref> removed = new ArrayList<>();
    Map<UUID, ItemContent> published = publishedContent(previous);
    Set<UUID> present = new HashSet<>();
    for (ScheduleItemRow row : rows) {
      present.add(row.itemId());
      ItemContent old = published.get(row.itemId());
      if (old == null) {
        added.add(new ScheduleChanges.Ref(row.itemId(), row.title()));
        continue;
      }
      List<String> fields = schedule.content(row).diff(old);
      if (!fields.isEmpty()) {
        changed.add(new ScheduleChanges.ChangedRef(row.itemId(), row.title(), fields));
      }
    }
    if (previous != null) {
      for (ScheduleSnapshot.Item item : previous.items()) {
        if (!present.contains(item.itemId())) {
          removed.add(new ScheduleChanges.Ref(item.itemId(), item.title()));
        }
      }
    }
    return new ScheduleChanges(added, changed, removed);
  }

  private static ScheduleChanges without(ScheduleChanges changes, UUID itemId) {
    return new ScheduleChanges(
        changes.added().stream().filter(r -> !r.itemId().equals(itemId)).toList(),
        changes.changed().stream().filter(r -> !r.itemId().equals(itemId)).toList(),
        changes.removed().stream().filter(r -> !r.itemId().equals(itemId)).toList());
  }

  private void confirmOthers(PublishOptions options, ScheduleChanges others) {
    if (others.any() && !options.confirmOtherChanges()) {
      throw new SceneException(
          ErrorCode.CONFIRMATION_REQUIRED, Map.of("otherChanges", asMap(others)));
    }
  }

  /** Problem extensions take maps and lists only ({@code SceneExceptionHandler}). */
  @SuppressWarnings("unchecked")
  private Map<String, Object> asMap(Object value) {
    return json.convertValue(value, Map.class);
  }

  private Map<UUID, ItemContent> publishedContent(ScheduleSnapshot snapshot) {
    Map<UUID, ItemContent> out = new HashMap<>();
    if (snapshot != null) {
      for (ScheduleSnapshot.Item item : snapshot.items()) {
        out.put(item.itemId(), schedule.content(item));
      }
    }
    return out;
  }

  private static ScheduleSnapshot snapshotOf(Optional<LatestPublication> latest) {
    return latest.map(LatestPublication::snapshot).orElse(null);
  }

  private static List<ScheduleSnapshot.Removed> recent(
      List<ScheduleSnapshot.Removed> removed, Instant now) {
    Instant from = now.minus(CHANGE_WINDOW);
    return removed.stream().filter(r -> r.removedAt().isAfter(from)).toList();
  }

  /** The stored change while it is within 24 hours, otherwise null. */
  private static ScheduleResponses.Change visibleChange(
      ScheduleSnapshot.Change change, Instant now) {
    if (change == null || !change.changedAt().isAfter(now.minus(CHANGE_WINDOW))) {
      return null;
    }
    return new ScheduleResponses.Change(
        change.kind(),
        change.changedAt(),
        change.fields() == null ? List.of() : change.fields(),
        change.previous());
  }

  // ---------------------------------------------------------------- views

  private OperatorItem operatorItem(
      ScheduleItemRow row,
      LocalDate start,
      int dayCount,
      ScheduleSnapshot snapshot,
      Map<UUID, ItemContent> published) {
    ItemContent content = schedule.content(row);
    String state;
    if (snapshot == null || !published.containsKey(row.itemId())) {
      state = ScheduleResponses.ADDED;
    } else if (content.diff(published.get(row.itemId())).isEmpty()) {
      state = ScheduleResponses.UNCHANGED;
    } else {
      state = ScheduleResponses.CHANGED;
    }
    ZoneId zone = zone();
    return new OperatorItem(
        row.itemId(),
        row.day(),
        ScheduleViews.date(start, row.day()),
        row.startTime(),
        row.endTime(),
        ScheduleViews.endsNextDay(row.startTime(), row.endTime()),
        ScheduleViews.startsAt(start, row.day(), row.startTime(), zone),
        ScheduleViews.endsAt(start, row.day(), row.startTime(), row.endTime(), zone),
        row.title(),
        row.place(),
        row.description(),
        row.category(),
        json.readTree(content.audience().toJson(json)),
        content.audience().leadersOnly(),
        row.slotId(),
        row.sortOrder(),
        row.version(),
        row.updatedAt(),
        row.updatedByDisplayName(),
        state,
        row.day() > dayCount);
  }

  /** The current item for {@code 409 CONCURRENT_MODIFICATION}. */
  private OperatorItem currentItem(ScheduleItemRow row, Locked locked) {
    ScheduleSnapshot snapshot =
        snapshotOf(schedule.latestPublication(locked.spaceId(), locked.eventId()));
    return operatorItem(
        row, locked.startDate(), locked.dayCount(), snapshot, publishedContent(snapshot));
  }

  private List<Slot> slots(UUID spaceId, UUID eventId, List<ScheduleItemRow> rows) {
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    if (form == null || form.setup() == null) {
      return null;
    }
    JsonNode setup = json.readTree(form.setup());
    JsonNode meals = null;
    for (FormFieldRow field : forms.findFields(spaceId, eventId, form.id())) {
      if ("MEALS".equals(field.presetKey())) {
        meals = field.config() == null ? null : json.readTree(field.config());
      }
    }
    List<MealSlots.Day> days = MealSlots.days(setup, MealSlots.labels(meals));
    if (days.isEmpty()) {
      return null;
    }
    Map<String, UUID> linked = new HashMap<>();
    for (ScheduleItemRow row : rows) {
      if (row.slotId() != null) {
        linked.put(row.slotId(), row.itemId());
      }
    }
    List<Slot> out = new ArrayList<>();
    for (MealSlots.Day day : days) {
      for (MealSlots.Slot slot : day.slots()) {
        out.add(
            new Slot(
                slot.optionId(),
                day.day(),
                day.date().toString(),
                day.label(),
                slot.meal(),
                slot.label(),
                out.size(),
                linked.get(slot.optionId())));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- access and rules

  /** The locked event: its state is writable and its period is read under the lock. */
  private record Locked(UUID spaceId, UUID eventId, LocalDate startDate, int dayCount) {}

  private Locked lockWritable(UUID spaceId, UUID eventId) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    switch (event.lifecycleStatus()) {
      case "DRAFT", "ACTIVE" -> {}
      case "ENDED" -> throw new SceneException(ErrorCode.EVENT_ENDED);
      case "ARCHIVED" -> throw new SceneException(ErrorCode.EVENT_ARCHIVED);
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
    EventProfile profile = profile(eventId);
    return new Locked(
        spaceId,
        eventId,
        profile.startDate(),
        ScheduleViews.dayCount(profile.startDate(), profile.endDate()));
  }

  private static void requirePeriod(Locked locked) {
    if (locked.dayCount() < 1) {
      throw new SceneException(ErrorCode.CONFLICT, Map.of("reason", "EVENT_PERIOD_REQUIRED"));
    }
  }

  private void requireFreeSlot(UUID spaceId, UUID eventId, String slotId, UUID exceptItemId) {
    if (slotId == null) {
      return;
    }
    Optional<UUID> owner = schedule.slotOwner(spaceId, eventId, slotId, exceptItemId);
    if (owner.isPresent()) {
      Map<String, Object> details = new LinkedHashMap<>();
      details.put("reason", "SLOT_ALREADY_LINKED");
      details.put("itemId", owner.get().toString());
      throw new SceneException(ErrorCode.CONFLICT, details);
    }
  }

  private ScheduleItemRow target(UUID spaceId, UUID eventId, UUID itemId) {
    return schedule
        .find(spaceId, eventId, itemId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private EventProfile profile(UUID eventId) {
    return events
        .findProfile(eventId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
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
    if (!allows(opened, actorId, Permission.SCHEDULE_WRITE)) {
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

  private static ItemContent withSortOrder(ItemContent c, int sortOrder) {
    return new ItemContent(
        c.day(),
        c.startTime(),
        c.endTime(),
        c.title(),
        c.place(),
        c.description(),
        c.category(),
        c.audience(),
        c.slotId(),
        sortOrder);
  }

  private static int requiredVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 1) {
      throw ItemInput.invalid("expectedVersion");
    }
    return node.asInt();
  }

  private static int requiredVersion(String value) {
    if (value == null || !value.matches("[0-9]{1,9}") || Integer.parseInt(value) < 1) {
      throw ItemInput.invalid("expectedVersion");
    }
    return Integer.parseInt(value);
  }

  private static long requiredBoardVersion(JsonNode node) {
    if (node == null || !node.isIntegralNumber() || !node.canConvertToLong() || node.asLong() < 0) {
      throw ItemInput.invalid("expectedBoardVersion");
    }
    return node.asLong();
  }

  static boolean flag(JsonNode node, String field, boolean fallback) {
    if (node == null || node.isNull()) {
      return fallback;
    }
    if (!node.isBoolean()) {
      throw ItemInput.invalid(field);
    }
    return node.asBoolean();
  }

  static boolean flag(String value, String field, boolean fallback) {
    if (value == null) {
      return fallback;
    }
    return switch (value) {
      case "true" -> true;
      case "false" -> false;
      default -> throw ItemInput.invalid(field);
    };
  }

  private ZoneId zone() {
    return ZoneId.of(properties.zone());
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  /** {@code publish}, {@code confirmOtherChanges} and {@code notify} of an item write. */
  record PublishOptions(boolean publish, boolean confirmOtherChanges, boolean notifyParticipants) {

    static PublishOptions fromBody(JsonNode body) {
      return new PublishOptions(
          flag(body.get("publish"), "publish", false),
          flag(body.get("confirmOtherChanges"), "confirmOtherChanges", false),
          flag(body.get("notify"), "notify", true));
    }

    static PublishOptions fromQuery(String publish, String confirm, String notify) {
      return new PublishOptions(
          flag(publish, "publish", false),
          flag(confirm, "confirmOtherChanges", false),
          flag(notify, "notify", true));
    }
  }
}
