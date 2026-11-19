package app.scene.event.retrospective;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Event retrospective (#237). Read needs effective {@code EVENT_READ} or an active space owner or
 * admin. Write needs effective {@code EVENT_UPDATE} and an ENDED event (DEC-051). The order is 404
 * → 403 → 400 → 409 state → 409 version. Each write stores one audit row whose details carry the
 * new version only. The text never goes to audit, logs, or problem bodies.
 */
@Service
public class RetrospectiveService {

  /** Provisional limit. */
  public static final int TEXT_MAX = 10_000;

  private static final String ENDED = "ENDED";
  private static final String ARCHIVED = "ARCHIVED";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final RetrospectiveRepository retrospectives;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final Clock clock;

  public RetrospectiveService(
      EventAccessGate gate,
      EventRepository events,
      RetrospectiveRepository retrospectives,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.retrospectives = retrospectives;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public Retrospective read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return stored(opened.location().spaceId(), eventId);
  }

  @Transactional
  public Retrospective write(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_UPDATE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String text = requiredText(body);
    int expectedVersion = requiredVersion(body);
    UUID spaceId = opened.location().spaceId();
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    if (!ENDED.equals(locked.lifecycleStatus())) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", locked.lifecycleStatus()));
    }
    Instant now = clock.instant();
    if (!retrospectives.write(spaceId, eventId, text, expectedVersion, actorId, now)) {
      int current = retrospectives.find(spaceId, eventId).map(RetrospectiveRow::version).orElse(0);
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", current));
    }
    int version = expectedVersion + 1;
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.EVENT_RETROSPECTIVE_UPDATED,
        "{\"version\":" + version + "}",
        now);
    return stored(spaceId, eventId);
  }

  private Retrospective stored(UUID spaceId, UUID eventId) {
    RetrospectiveRow row = retrospectives.find(spaceId, eventId).orElse(null);
    if (row == null) {
      return Retrospective.empty();
    }
    return new Retrospective(
        row.body(), row.version(), row.updatedAt(), row.updatedByDisplayName());
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

  private static String requiredText(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("text");
    if (node == null || !node.isString()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "text"));
    }
    String text = node.asString();
    if (text.codePointCount(0, text.length()) > TEXT_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "text"));
    }
    return text;
  }

  private static int requiredVersion(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("expectedVersion");
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "expectedVersion"));
    }
    return node.asInt();
  }
}
