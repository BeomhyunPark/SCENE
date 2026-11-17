package app.scene.event.application;

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
 * Operator values of one application (#335, DEC-075). The first round writes the operator memo. The
 * participant's answers are never touched. Write needs effective {@code PARTICIPANT_WRITE} (event
 * OWNER by default, others by GRANT; role defaults are unchanged). The order is 404 → 403 → 400 →
 * 409 state → 409 version, the retrospective's order (#237). {@code ARCHIVED} is {@code
 * EVENT_ARCHIVED}; an application that is not {@code SUBMITTED} is {@code
 * INVALID_STATE_TRANSITION}. Each write stores one audit row with {@code applicationId}, {@code
 * version} and {@code fields}. The memo never goes to audit, logs, or problem bodies. Reads come
 * with the application detail and the applicant table.
 */
@Service
public class ApplicationOperationService {

  /** Provisional limit. */
  public static final int MEMO_MAX = 2_000;

  private static final String ARCHIVED = "ARCHIVED";
  private static final String SUBMITTED = "SUBMITTED";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final ApplicationRepository applications;
  private final ApplicationOperationRepository operations;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final Clock clock;

  public ApplicationOperationService(
      EventAccessGate gate,
      EventRepository events,
      ApplicationRepository applications,
      ApplicationOperationRepository operations,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.applications = applications;
    this.operations = operations;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.clock = clock;
  }

  @Transactional
  public ApplicationOperation write(UUID actorId, UUID eventId, UUID applicationId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (applications.find(spaceId, eventId, applicationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!allows(opened, actorId, Permission.PARTICIPANT_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String memo = requiredMemo(body);
    int expectedVersion = requiredVersion(body);
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    String status =
        applications
            .find(spaceId, eventId, applicationId)
            .map(ApplicationRow::status)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!SUBMITTED.equals(status)) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION, Map.of("applicationStatus", status));
    }
    Instant now = clock.instant();
    if (!operations.write(spaceId, eventId, applicationId, memo, expectedVersion, actorId, now)) {
      int current = operations.find(spaceId, eventId, applicationId).version();
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", current));
    }
    int version = expectedVersion + 1;
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.APPLICATION_OPERATION_UPDATED,
        "{\"applicationId\":\""
            + applicationId
            + "\",\"version\":"
            + version
            + ",\"fields\":[\"memo\"]}",
        now);
    return operations.find(spaceId, eventId, applicationId);
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

  private static String requiredMemo(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("memo");
    if (node == null || !node.isString()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "memo"));
    }
    String memo = node.asString();
    if (memo.codePointCount(0, memo.length()) > MEMO_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "memo"));
    }
    return memo;
  }

  private static int requiredVersion(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("expectedVersion");
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "expectedVersion"));
    }
    return node.asInt();
  }
}
