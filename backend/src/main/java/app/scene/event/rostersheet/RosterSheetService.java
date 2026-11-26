package app.scene.event.rostersheet;

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
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 참가 현황 operator sheet (#507, #508). Read follows the applicant table: effective {@code EVENT_READ}
 * or an active space owner or admin. A change needs effective {@code PARTICIPANT_WRITE}, the
 * operation memo's permission. Changes are operations merged under the event row lock, so two
 * operators writing different cells never conflict; no expected version is sent. The order is 404 →
 * 403 → 409 archived → 400. Each change stores one audit row with the new version and the number of
 * operations; cell values never go to audit, logs, or problem bodies.
 */
@Service
public class RosterSheetService {

  private static final String ARCHIVED = "ARCHIVED";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final RosterSheetRepository sheets;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final Clock clock;
  private final JsonMapper json;

  public RosterSheetService(
      EventAccessGate gate,
      EventRepository events,
      RosterSheetRepository sheets,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      Clock clock,
      JsonMapper json) {
    this.gate = gate;
    this.events = events;
    this.sheets = sheets;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.clock = clock;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public RosterSheet read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_READ) && !opened.membership().seesEveryEvent()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return stored(opened.location().spaceId(), eventId);
  }

  @Transactional
  public RosterSheet apply(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.PARTICIPANT_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    RosterSheetRow row = sheets.find(spaceId, eventId).orElse(null);
    RosterSheetDoc doc =
        row == null ? RosterSheetDoc.empty(json) : RosterSheetDoc.parse(row.doc(), json);
    int count = doc.apply(body);
    int expected = row == null ? 0 : row.version();
    Instant now = clock.instant();
    // The event row lock serializes writers, so a lost compare means a broken invariant.
    if (!sheets.write(spaceId, eventId, doc.text(), expected, actorId, now)) {
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION);
    }
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.ROSTER_SHEET_UPDATED,
        "{\"version\":" + (expected + 1) + ",\"ops\":" + count + "}",
        now);
    return stored(spaceId, eventId);
  }

  private RosterSheet stored(UUID spaceId, UUID eventId) {
    RosterSheetRow row = sheets.find(spaceId, eventId).orElse(null);
    if (row == null) {
      return new RosterSheet(RosterSheetDoc.empty(json).node(), 0, null, null);
    }
    return new RosterSheet(
        RosterSheetDoc.parse(row.doc(), json).node(),
        row.version(),
        row.updatedAt(),
        row.updatedByDisplayName());
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
}
