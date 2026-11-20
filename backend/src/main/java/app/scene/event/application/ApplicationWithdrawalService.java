package app.scene.event.application;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.group.GroupService;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.participant.ParticipantPins;
import app.scene.event.participant.ParticipantRepository;
import app.scene.event.participant.ParticipantSessionRepository;
import app.scene.space.EventUserPermissionRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Operator withdraw and restore of an application (DEC-084, #338). Needs effective {@code
 * PARTICIPANT_WRITE}. The order is 404 (event, application) → 403 → 400 → 409 event state ({@code
 * EVENT_ENDED}, {@code EVENT_ARCHIVED}) → 409 application state.
 *
 * <p>A withdraw flips the participant's current {@code SUBMITTED} row to {@code WITHDRAWN} and, in
 * the same transaction, removes the working-copy group assignment with a {@code WITHDRAWN} history
 * row (DEC-072 §5), ends every session of the participant, optionally makes the six-digit number
 * unusable ({@code blockReapply}), stores the history row with the optional reason, and writes
 * {@code APPLICATION_WITHDRAWN} without the reason. Every reader that keeps to {@code SUBMITTED}
 * drops the person at once. A restore flips the same row back; the group does not come back and the
 * previous group is returned as a reference (DEC-044).
 *
 * <p>The path's application id is the expected value: a row already in the target state answers
 * {@code ALREADY_…} with no new rows, and a row the participant has since replaced ({@code
 * SUPERSEDED}) is {@code CONCURRENT_MODIFICATION} with the current id, status and revision.
 */
@Service
public class ApplicationWithdrawalService {

  /** Provisional limit, the same as a check-in cancel reason. */
  public static final int REASON_MAX = 200;

  private static final String SUBMITTED = ApplicationStatusChanges.SUBMITTED;
  private static final String WITHDRAWN = ApplicationStatusChanges.WITHDRAWN;

  private final EventAccessGate gate;
  private final EventRepository events;
  private final ApplicationRepository applications;
  private final ApplicationRevisions revisions;
  private final ApplicationStatusChanges statuses;
  private final GroupService groups;
  private final ParticipantRepository participants;
  private final ParticipantSessionRepository sessions;
  private final ParticipantPins pins;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public ApplicationWithdrawalService(
      EventAccessGate gate,
      EventRepository events,
      ApplicationRepository applications,
      ApplicationRevisions revisions,
      ApplicationStatusChanges statuses,
      GroupService groups,
      ParticipantRepository participants,
      ParticipantSessionRepository sessions,
      ParticipantPins pins,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.applications = applications;
    this.revisions = revisions;
    this.statuses = statuses;
    this.groups = groups;
    this.participants = participants;
    this.sessions = sessions;
    this.pins = pins;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.clock = clock;
  }

  /** The group a withdraw removed. */
  public record RemovedGroup(UUID groupId, String name, boolean leader) {}

  /**
   * {@code result} is {@code WITHDRAWN} or {@code ALREADY_WITHDRAWN}. {@code removedGroup} is the
   * assignment this request removed, null when there was none or nothing was done. {@code
   * checkedInAt} is the kept arrival check-in, which no longer counts.
   */
  public record WithdrawResult(
      String result,
      UUID applicationId,
      UUID participantId,
      ApplicationWithdrawal withdrawal,
      RemovedGroup removedGroup,
      Instant checkedInAt) {}

  /**
   * {@code result} is {@code RESTORED} or {@code ALREADY_SUBMITTED}. {@code previousGroup} is the
   * group of the last withdraw when it still exists; it is not restored. {@code reapplyBlocked}
   * tells that the number was made unusable, so the person needs a number reset to sign in.
   */
  public record RestoreResult(
      String result,
      UUID applicationId,
      UUID participantId,
      WithdrawnRow.PreviousGroup previousGroup,
      boolean reapplyBlocked,
      Instant checkedInAt) {}

  @Transactional
  public WithdrawResult withdraw(UUID actorId, UUID eventId, UUID applicationId, JsonNode body) {
    UUID spaceId = open(actorId, eventId, applicationId);
    String reason = optionalReason(body);
    boolean blockReapply = optionalFlag(body, "blockReapply");
    lockWritable(spaceId, eventId);
    ApplicationRevisionRow target = revisions.find(spaceId, eventId, applicationId);
    ApplicationRevisionRow latest = revisions.lockLatest(spaceId, eventId, target.participantId());
    UUID participantId = target.participantId();
    if (WITHDRAWN.equals(target.status()) && latest.applicationId().equals(applicationId)) {
      WithdrawnRow row = statuses.withdrawn(spaceId, eventId, applicationId).orElseThrow();
      return new WithdrawResult(
          "ALREADY_WITHDRAWN",
          applicationId,
          participantId,
          row.withdrawal(),
          null,
          row.checkedInAt());
    }
    if (!SUBMITTED.equals(target.status())) {
      throw stale(latest);
    }
    Instant now = now();
    if (!statuses.setStatus(spaceId, eventId, applicationId, SUBMITTED, WITHDRAWN)) {
      throw stale(revisions.findLatest(spaceId, eventId, participantId));
    }
    Optional<GroupService.RemovedAssignment> removed =
        groups.removeWithdrawn(spaceId, eventId, participantId, actorId, now);
    sessions.deleteByParticipant(spaceId, eventId, participantId, null);
    if (blockReapply) {
      participants.updatePin(
          spaceId, eventId, participantId, pins.hash(unusableNumber()), false, now);
    }
    statuses.record(
        new ApplicationStatusChanged(
            spaceId,
            eventId,
            participantId,
            applicationId,
            ApplicationStatusChanged.WITHDRAWN,
            ApplicationStatusChanged.BY_OPERATOR,
            actorId,
            now),
        reason,
        blockReapply);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.APPLICATION_WITHDRAWN,
        "{\"applicationId\":\""
            + applicationId
            + "\",\"participantId\":\""
            + participantId
            + "\",\"groupRemoved\":"
            + removed.isPresent()
            + ",\"reasonGiven\":"
            + (reason != null)
            + ",\"blockReapply\":"
            + blockReapply
            + "}",
        now);
    WithdrawnRow row = statuses.withdrawn(spaceId, eventId, applicationId).orElseThrow();
    return new WithdrawResult(
        "WITHDRAWN",
        applicationId,
        participantId,
        row.withdrawal(),
        removed
            .map(group -> new RemovedGroup(group.groupId(), group.groupName(), group.leader()))
            .orElse(null),
        row.checkedInAt());
  }

  @Transactional
  public RestoreResult restore(UUID actorId, UUID eventId, UUID applicationId) {
    UUID spaceId = open(actorId, eventId, applicationId);
    lockWritable(spaceId, eventId);
    ApplicationRevisionRow target = revisions.find(spaceId, eventId, applicationId);
    UUID participantId = target.participantId();
    ApplicationRevisionRow latest = revisions.lockLatest(spaceId, eventId, participantId);
    if (SUBMITTED.equals(target.status())) {
      return new RestoreResult(
          "ALREADY_SUBMITTED", applicationId, participantId, null, false, null);
    }
    if (!WITHDRAWN.equals(target.status()) || !latest.applicationId().equals(applicationId)) {
      throw stale(latest);
    }
    WithdrawnRow before = statuses.withdrawn(spaceId, eventId, applicationId).orElseThrow();
    Instant now = now();
    try {
      if (!statuses.setStatus(spaceId, eventId, applicationId, WITHDRAWN, SUBMITTED)) {
        throw stale(revisions.findLatest(spaceId, eventId, participantId));
      }
    } catch (DuplicateKeyException exception) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    statuses.record(
        new ApplicationStatusChanged(
            spaceId,
            eventId,
            participantId,
            applicationId,
            ApplicationStatusChanged.RESTORED,
            ApplicationStatusChanged.BY_OPERATOR,
            actorId,
            now),
        null,
        false);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.APPLICATION_RESTORED,
        "{\"applicationId\":\"" + applicationId + "\",\"participantId\":\"" + participantId + "\"}",
        now);
    return new RestoreResult(
        "RESTORED",
        applicationId,
        participantId,
        before.previousGroup(),
        before.reapplyBlocked(),
        before.checkedInAt());
  }

  /** 404 → 403. Returns the space id. */
  private UUID open(UUID actorId, UUID eventId, UUID applicationId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (applications.find(spaceId, eventId, applicationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!allows(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return spaceId;
  }

  /** Holds the event row lock, the same lock as group writes. DRAFT and ACTIVE only. */
  private void lockWritable(UUID spaceId, UUID eventId) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    switch (event.lifecycleStatus()) {
      case "DRAFT", "ACTIVE" -> {}
      case "ENDED" -> throw new SceneException(ErrorCode.EVENT_ENDED);
      case "ARCHIVED" -> throw new SceneException(ErrorCode.EVENT_ARCHIVED);
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
  }

  private static SceneException stale(ApplicationRevisionRow latest) {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("applicationId", latest.applicationId().toString());
    details.put("status", latest.status());
    details.put("revision", latest.revision());
    return new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(
                location.spaceId(), location.id(), actorId, Permission.PARTICIPANT_WRITE.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        Permission.PARTICIPANT_WRITE, opened.eventRole(), opened.authorityEnded(), effect);
  }

  /** Optional, trimmed, null when blank, at most {@link #REASON_MAX} characters. */
  private static String optionalReason(JsonNode body) {
    if (body != null && !body.isNull() && !body.isObject()) {
      throw invalid("reason");
    }
    JsonNode node = body == null || body.isNull() ? null : body.get("reason");
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("reason");
    }
    String reason = node.asString().strip();
    if (reason.isEmpty()) {
      return null;
    }
    if (reason.codePointCount(0, reason.length()) > REASON_MAX) {
      throw invalid("reason");
    }
    return reason;
  }

  private static boolean optionalFlag(JsonNode body, String name) {
    JsonNode node = body == null || !body.isObject() ? null : body.get(name);
    if (node == null || node.isNull()) {
      return false;
    }
    if (!node.isBoolean()) {
      throw invalid(name);
    }
    return node.asBoolean();
  }

  /** A value nobody knows; its hash replaces the number so the person cannot apply again. */
  private String unusableNumber() {
    byte[] bytes = new byte[16];
    random.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }
}
