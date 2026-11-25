package app.scene.event.checkin;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.event.application.ArrivalRoster;
import app.scene.event.application.ArrivalStatus;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.room.RoomDesk;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Arrival check-in (#282, DEC-071, api.md "체크인"). Reads need effective {@code EVENT_READ} or an
 * active space owner or admin. Check-in, cancel, and one participant's history need effective
 * {@code CHECKIN_WRITE}. The order is 404 → 403 → 400 → 409 state → 404 target → same key → 409
 * eligibility → result. Writes lock the event row, so two operators on the same participant
 * serialize and the later one sees {@code ALREADY_CHECKED_IN}. Each write adds a history row and an
 * audit row in the same transaction. Names, phones, and the QR value never go to audit or logs.
 *
 * <p>The summary and every roster item carry the arrival standing (E4 #456, DEC-089 Follow-up) from
 * {@link ArrivalRoster}: the meal counts' inputs and cursor, so {@code OVERDUE} is the next meal's
 * "아직 안 옴". The roster's {@code arrival} filter reads every matching row, then pages in memory.
 */
@Service
public class CheckInService {

  public static final int KEY_MAX = 100;
  public static final int REASON_MAX = 200;
  public static final int Q_MAX = 50;

  static final String QR = "QR";
  static final String MANUAL = "MANUAL";

  private static final String KEY_FIELD = "Idempotency-Key";
  private static final Pattern PHONE_LAST4 = Pattern.compile("[0-9]{4}");

  private final EventAccessGate gate;
  private final EventRepository events;
  private final CheckInRepository checkIns;
  private final CheckInCodes codes;
  private final RoomDesk roomDesk;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final ArrivalRoster arrivals;
  private final JsonMapper json;
  private final Clock clock;

  public CheckInService(
      EventAccessGate gate,
      EventRepository events,
      CheckInRepository checkIns,
      CheckInCodes codes,
      RoomDesk roomDesk,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      ArrivalRoster arrivals,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.checkIns = checkIns;
    this.codes = codes;
    this.roomDesk = roomDesk;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.arrivals = arrivals;
    this.json = json;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public CheckInSummary summary(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    EventRow event =
        events
            .find(spaceId, eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    CheckInCounts counts = checkIns.counts(spaceId, eventId);
    ArrivalRoster.Snapshot snapshot = arrivals.read(spaceId, eventId, readTime());
    CheckInSummary.Arrival arrival =
        snapshot.slotted()
            ? new CheckInSummary.Arrival(
                snapshot.asOf(),
                snapshot.nextMeal(),
                snapshot.counts().get(ArrivalStatus.OVERDUE),
                snapshot.counts().get(ArrivalStatus.COMING),
                snapshot.counts().get(ArrivalStatus.PASSED),
                snapshot.counts().get(ArrivalStatus.UNKNOWN))
            : null;
    return new CheckInSummary(
        event.lifecycleStatus(),
        counts.total(),
        counts.checkedIn(),
        counts.total() - counts.checkedIn(),
        arrival);
  }

  @Transactional(readOnly = true)
  public ItemPage<RosterItem> roster(
      UUID actorId,
      UUID eventId,
      String q,
      String checkedIn,
      String arrival,
      Integer page,
      Integer size) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    PageRequest request = PageRequest.of(page, size);
    String text = searchText(q);
    Boolean filter = checkedInFilter(checkedIn);
    ArrivalStatus wanted = arrivalFilter(arrival);
    boolean phoneVisible = allows(opened, actorId, Permission.CHECKIN_WRITE);
    boolean byPhone = phoneVisible && text != null && PHONE_LAST4.matcher(text).matches();
    RoomDesk.Stays stays = roomDesk.all(opened.location().spaceId(), eventId);
    UUID spaceId = opened.location().spaceId();
    ArrivalRoster.Snapshot snapshot = arrivals.read(spaceId, eventId, readTime());
    long total;
    List<RosterRow> rows;
    if (wanted == null) {
      total = checkIns.countRoster(spaceId, eventId, text, byPhone, filter);
      rows = checkIns.roster(spaceId, eventId, text, byPhone, filter, request);
    } else {
      List<RosterRow> matching = new ArrayList<>();
      for (RosterRow row : checkIns.rosterAll(spaceId, eventId, text, byPhone, filter)) {
        ArrivalRoster.Arrival standing = snapshot.of(row.participantId());
        if (standing != null && standing.status() == wanted) {
          matching.add(row);
        }
      }
      total = matching.size();
      int from = (int) Math.min(request.offset(), matching.size());
      rows = matching.subList(from, Math.min(from + request.size(), matching.size()));
    }
    List<RosterItem> items = new ArrayList<>();
    for (RosterRow row : rows) {
      RosterItem.Brief brief =
          row.checkInId() == null
              ? null
              : new RosterItem.Brief(
                  row.checkInId(),
                  row.status(),
                  row.method(),
                  row.checkedInAt(),
                  row.checkedInByDisplayName());
      RoomDesk.Stay stay = stays.of(row.participantId());
      items.add(
          new RosterItem(
              row.participantId(),
              row.name(),
              row.cohort(),
              phoneVisible ? row.phoneLast4() : null,
              brief,
              CheckInRoom.of(stay),
              stay.lodging(),
              snapshot.of(row.participantId())));
    }
    return ItemPage.of(items, request, total);
  }

  @Transactional(readOnly = true)
  public ItemPage<CheckInLogItem> logs(
      UUID actorId, UUID eventId, String participantId, Integer page, Integer size) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.CHECKIN_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID participant = requiredUuid(participantId, "participantId");
    PageRequest request = PageRequest.of(page, size);
    UUID spaceId = opened.location().spaceId();
    if (checkIns.findTarget(spaceId, eventId, participant).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    long total = checkIns.countLogs(spaceId, eventId, participant);
    return ItemPage.of(checkIns.logs(spaceId, eventId, participant, request), request, total);
  }

  @Transactional
  public CheckInResult checkIn(UUID actorId, UUID eventId, String idempotencyKey, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.CHECKIN_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String key = requiredKey(idempotencyKey);
    Request request = checkInRequest(body);
    UUID spaceId = opened.location().spaceId();
    requireWritable(events.getForUpdate(spaceId, eventId));

    CheckInTarget target = target(spaceId, eventId, request);
    KeyedLog keyed = checkIns.findKeyedLog(spaceId, eventId, key).orElse(null);
    if (keyed != null) {
      if (!CheckIn.CHECKED_IN.equals(keyed.action())
          || !keyed.participantId().equals(target.participantId())) {
        throw new SceneException(ErrorCode.CONFLICT);
      }
      return result(
          spaceId,
          eventId,
          CheckIn.CHECKED_IN,
          target,
          current(spaceId, eventId, keyed.checkInId()));
    }
    if (!target.submitted()) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION, Map.of("reason", "APPLICATION_NOT_SUBMITTED"));
    }

    CheckIn existing =
        checkIns.findByParticipant(spaceId, eventId, target.participantId()).orElse(null);
    if (existing != null && existing.checkedIn()) {
      return result(spaceId, eventId, "ALREADY_CHECKED_IN", target, existing);
    }
    Instant now = now();
    UUID checkInId;
    if (existing == null) {
      checkInId = UUID.randomUUID();
      checkIns.insertCheckedIn(
          spaceId, eventId, checkInId, target.participantId(), request.method(), actorId, now);
    } else {
      checkInId = existing.checkInId();
      if (!checkIns.markCheckedIn(spaceId, eventId, checkInId, request.method(), actorId, now)) {
        throw new IllegalStateException("locked check-in row changed");
      }
    }
    checkIns.saveLog(
        spaceId,
        eventId,
        checkInId,
        target.participantId(),
        CheckIn.CHECKED_IN,
        request.method(),
        null,
        key,
        actorId,
        now);
    audit(
        spaceId,
        eventId,
        actorId,
        AuditActions.CHECKIN_CREATED,
        checkInId,
        target.participantId(),
        request.method(),
        null,
        now);
    return result(
        spaceId, eventId, CheckIn.CHECKED_IN, target, current(spaceId, eventId, checkInId));
  }

  @Transactional
  public CancelResult cancel(
      UUID actorId, UUID eventId, UUID checkInId, String idempotencyKey, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.CHECKIN_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String key = requiredKey(idempotencyKey);
    String reason = optionalReason(body);
    UUID spaceId = opened.location().spaceId();
    requireWritable(events.getForUpdate(spaceId, eventId));

    CheckIn existing =
        checkIns
            .find(spaceId, eventId, checkInId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    KeyedLog keyed = checkIns.findKeyedLog(spaceId, eventId, key).orElse(null);
    if (keyed != null) {
      if (!CheckIn.CANCELLED.equals(keyed.action()) || !keyed.checkInId().equals(checkInId)) {
        throw new SceneException(ErrorCode.CONFLICT);
      }
      return new CancelResult(CheckIn.CANCELLED, existing);
    }
    if (!existing.checkedIn()) {
      return new CancelResult("ALREADY_CANCELLED", existing);
    }
    Instant now = now();
    if (!checkIns.markCancelled(spaceId, eventId, checkInId, reason, actorId, now)) {
      throw new IllegalStateException("locked check-in row changed");
    }
    checkIns.saveLog(
        spaceId,
        eventId,
        checkInId,
        existing.participantId(),
        CheckIn.CANCELLED,
        null,
        reason,
        key,
        actorId,
        now);
    audit(
        spaceId,
        eventId,
        actorId,
        AuditActions.CHECKIN_CANCELLED,
        checkInId,
        existing.participantId(),
        null,
        reason,
        now);
    return new CancelResult(CheckIn.CANCELLED, current(spaceId, eventId, checkInId));
  }

  private CheckInTarget target(UUID spaceId, UUID eventId, Request request) {
    if (MANUAL.equals(request.method())) {
      return checkIns
          .findTarget(spaceId, eventId, request.participantId())
          .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    }
    UUID participantId =
        codes
            .participantOf(request.code())
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    CheckInTarget target =
        checkIns
            .findTarget(spaceId, eventId, participantId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!codes.matches(request.code(), eventId, participantId)) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return target;
  }

  private CheckIn current(UUID spaceId, UUID eventId, UUID checkInId) {
    return checkIns
        .find(spaceId, eventId, checkInId)
        .orElseThrow(() -> new IllegalStateException("check-in row is missing"));
  }

  /** A check-in result with the published room (G5 #460) for the desk to say right away. */
  private CheckInResult result(
      UUID spaceId, UUID eventId, String result, CheckInTarget target, CheckIn checkIn) {
    RoomDesk.Stay stay =
        roomDesk.of(spaceId, eventId, List.of(target.participantId())).of(target.participantId());
    return new CheckInResult(
        result, participant(target), checkIn, CheckInRoom.of(stay), stay.lodging());
  }

  private static CheckInParticipant participant(CheckInTarget target) {
    return new CheckInParticipant(target.participantId(), target.name(), target.cohort());
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorId,
      String action,
      UUID checkInId,
      UUID participantId,
      String method,
      String reason,
      Instant at) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("checkInId", checkInId.toString());
    detail.put("participantId", participantId.toString());
    detail.put("method", method);
    detail.put("reason", reason);
    auditLogs.save(spaceId, eventId, actorId, action, json.writeValueAsString(detail), at);
  }

  private static void requireWritable(EventRow event) {
    switch (event.lifecycleStatus()) {
      case "ACTIVE" -> {}
      case "ENDED" -> throw new SceneException(ErrorCode.EVENT_ENDED);
      case "ARCHIVED" -> throw new SceneException(ErrorCode.EVENT_ARCHIVED);
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
  }

  /** Read time for the arrival standing, to the second like the meal counts. */
  private Instant readTime() {
    return clock.instant().truncatedTo(ChronoUnit.SECONDS);
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    return opened.membership().seesEveryEvent();
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

  private static String requiredKey(String key) {
    if (key == null || key.isEmpty() || key.length() > KEY_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", KEY_FIELD));
    }
    return key;
  }

  private static Request checkInRequest(JsonNode body) {
    JsonNode mode = field(body, "mode");
    if (mode == null || !mode.isString()) {
      throw invalid("mode");
    }
    if (QR.equals(mode.asString())) {
      JsonNode code = field(body, "code");
      if (code == null || !code.isString() || code.asString().isEmpty()) {
        throw invalid("code");
      }
      return new Request(QR, code.asString(), null);
    }
    if (MANUAL.equals(mode.asString())) {
      JsonNode participant = field(body, "participantId");
      if (participant == null || !participant.isString()) {
        throw invalid("participantId");
      }
      return new Request(MANUAL, null, requiredUuid(participant.asString(), "participantId"));
    }
    throw invalid("mode");
  }

  private static String optionalReason(JsonNode body) {
    if (body == null || body.isNull() || body.isMissingNode()) {
      return null;
    }
    if (!body.isObject()) {
      throw invalid("reason");
    }
    JsonNode node = body.get("reason");
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("reason");
    }
    String reason = node.asString().strip();
    if (reason.codePointCount(0, reason.length()) > REASON_MAX) {
      throw invalid("reason");
    }
    return reason.isEmpty() ? null : reason;
  }

  private static String searchText(String q) {
    if (q == null) {
      return null;
    }
    String text = q.strip();
    int length = text.codePointCount(0, text.length());
    if (length < 1 || length > Q_MAX) {
      throw invalid("q");
    }
    return text;
  }

  private static Boolean checkedInFilter(String value) {
    if (value == null) {
      return null;
    }
    if ("true".equals(value)) {
      return Boolean.TRUE;
    }
    if ("false".equals(value)) {
      return Boolean.FALSE;
    }
    throw invalid("checkedIn");
  }

  private static ArrivalStatus arrivalFilter(String value) {
    if (value == null) {
      return null;
    }
    if (!value.equals(value.toUpperCase(Locale.ROOT))) {
      throw invalid("arrival");
    }
    try {
      return ArrivalStatus.valueOf(value);
    } catch (IllegalArgumentException unknown) {
      throw invalid("arrival");
    }
  }

  private static UUID requiredUuid(String value, String fieldName) {
    if (value == null) {
      throw invalid(fieldName);
    }
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException malformed) {
      throw invalid(fieldName);
    }
  }

  private static JsonNode field(JsonNode body, String name) {
    return body == null || !body.isObject() ? null : body.get(name);
  }

  private static SceneException invalid(String fieldName) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", fieldName));
  }

  private record Request(String method, String code, UUID participantId) {}
}
