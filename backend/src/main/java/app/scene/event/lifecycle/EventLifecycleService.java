package app.scene.event.lifecycle;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
import app.scene.event.notification.OperatorRecipients;
import app.scene.event.task.TaskRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** DEC-063 lifecycle commands. HTTP calls these methods and does not transition on its own. */
@Service
public class EventLifecycleService {

  private static final int REASON_MAX = 500;

  private final EventRepository events;
  private final TaskRepository tasks;
  private final EventInvitationRepository invitations;
  private final Notifications notifications;
  private final OperatorRecipients recipients;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;
  private final ParticipantFeedVersions feedVersions;

  public EventLifecycleService(
      EventRepository events,
      TaskRepository tasks,
      EventInvitationRepository invitations,
      Notifications notifications,
      OperatorRecipients recipients,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock,
      ParticipantFeedVersions feedVersions) {
    this.events = events;
    this.tasks = tasks;
    this.invitations = invitations;
    this.notifications = notifications;
    this.recipients = recipients;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
    this.feedVersions = feedVersions;
  }

  @Transactional
  public LifecycleResult activate(
      UUID spaceId, UUID eventId, LifecycleRequest request, OperatorActor actor) {
    return execute(LifecycleCommand.ACTIVATE, spaceId, eventId, request, actor);
  }

  @Transactional
  public LifecycleResult end(
      UUID spaceId, UUID eventId, LifecycleRequest request, OperatorActor actor) {
    return execute(LifecycleCommand.END, spaceId, eventId, request, actor);
  }

  @Transactional
  public LifecycleResult reopen(
      UUID spaceId, UUID eventId, LifecycleRequest request, OperatorActor actor) {
    return execute(LifecycleCommand.REOPEN, spaceId, eventId, request, actor);
  }

  @Transactional
  public LifecycleResult archive(
      UUID spaceId, UUID eventId, LifecycleRequest request, OperatorActor actor) {
    return execute(LifecycleCommand.ARCHIVE, spaceId, eventId, request, actor);
  }

  @Transactional
  public LifecycleResult unarchive(
      UUID spaceId, UUID eventId, LifecycleRequest request, OperatorActor actor) {
    return execute(LifecycleCommand.UNARCHIVE, spaceId, eventId, request, actor);
  }

  private LifecycleResult execute(
      LifecycleCommand command,
      UUID spaceId,
      UUID eventId,
      LifecycleRequest request,
      OperatorActor actor) {
    EventRow row = events.getForUpdate(spaceId, eventId);
    String actedAs = authorize(command, actor, request.overrideReason());
    rejectOversizedOverride(request.overrideReason());
    if (command == LifecycleCommand.REOPEN) {
      requireReason(request.reason(), "reason");
    }
    if (request.invalidField() != null) {
      throw new SceneException(
          ErrorCode.VALIDATION_FAILED, Map.of("field", request.invalidField()));
    }
    Integer expectedVersion = request.expectedLifecycleVersion();
    if (expectedVersion == null) {
      throw new SceneException(
          ErrorCode.VALIDATION_FAILED, Map.of("field", "expectedLifecycleVersion"));
    }
    if (row.lifecycleStatus().equals(command.toStatus())) {
      return new LifecycleResult(
          "ALREADY_IN_STATE", row.lifecycleStatus(), row.lifecycleVersion(), actedAs);
    }
    if (row.lifecycleVersion() != expectedVersion) {
      throw concurrent(spaceId, eventId, row);
    }
    if (!row.lifecycleStatus().equals(command.fromStatus())) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION,
          Map.of("currentStatus", row.lifecycleStatus(), "command", command.name()));
    }
    int openTasks = tasks.countOpen(spaceId, eventId);
    Map<String, Object> warnings = warningCounts(openTasks);
    if (command.needsWarningAck()
        && openTasks > 0
        && !Boolean.TRUE.equals(request.acknowledgeWarnings())) {
      throw new SceneException(ErrorCode.CONFIRMATION_REQUIRED, Map.of("warnings", warnings));
    }
    Instant now = clock.instant();
    int updated = events.updateStatus(spaceId, eventId, expectedVersion, command.toStatus());
    if (updated != 1) {
      throw concurrent(spaceId, eventId, row);
    }
    String reason = storedReason(command, actedAs, request);
    events.saveTransition(
        spaceId,
        eventId,
        command.name(),
        row.lifecycleStatus(),
        command.toStatus(),
        actor.userId(),
        actedAs,
        reason,
        json.writeValueAsString(warnings),
        now);
    if (command == LifecycleCommand.ARCHIVE) {
      invitations.updateRevoked(spaceId, eventId, now);
    }
    // DEC-080 §4: the participant home shows the event status.
    feedVersions.bump(spaceId, eventId, FeedArea.HOME);
    if ("SPACE_OWNER_OVERRIDE".equals(actedAs)) {
      overrideNotice(spaceId, eventId, command);
    }
    auditLogs.save(
        spaceId,
        eventId,
        actor.userId(),
        action(command),
        json.writeValueAsString(auditDetail(actedAs, request.overrideReason())),
        now);
    return new LifecycleResult(
        "TRANSITIONED", command.toStatus(), row.lifecycleVersion() + 1, actedAs);
  }

  /**
   * DEC-080 §7.2 {@code LIFECYCLE_OVERRIDE}: the event OWNERs whose handover has not ended, the
   * same people {@code operator_notices} had. Since I3 (#436) it is a row in {@code notifications};
   * the old table is no longer written and is dropped by a later migration.
   */
  private void overrideNotice(UUID spaceId, UUID eventId, LifecycleCommand command) {
    List<UUID> owners = recipients.owners(spaceId, eventId);
    if (owners.isEmpty()) {
      return;
    }
    notifications.toOperators(
        spaceId,
        eventId,
        owners,
        new NotificationDraft(
            "LIFECYCLE_OVERRIDE",
            "EVENT",
            eventId,
            "행사 상태를 공간 소유자가 바꿨어요",
            overrideBody(command),
            true));
  }

  private static String overrideBody(LifecycleCommand command) {
    return switch (command) {
      case ACTIVATE -> "행사를 시작했어요";
      case END -> "행사를 종료했어요";
      case REOPEN -> "행사를 다시 열었어요";
      case ARCHIVE -> "행사를 보관했어요";
      case UNARCHIVE -> "행사 보관을 풀었어요";
    };
  }

  private static String action(LifecycleCommand command) {
    return switch (command) {
      case ACTIVATE -> AuditActions.EVENT_ACTIVATE;
      case END -> AuditActions.EVENT_END;
      case REOPEN -> AuditActions.EVENT_REOPEN;
      case ARCHIVE -> AuditActions.EVENT_ARCHIVE;
      case UNARCHIVE -> AuditActions.EVENT_UNARCHIVE;
    };
  }

  private static String authorize(
      LifecycleCommand command, OperatorActor actor, String overrideReason) {
    if (actor.eventOwner()) {
      return "EVENT_OWNER";
    }
    if (command.spaceOwnerDirect() && actor.spaceOwner()) {
      return "SPACE_OWNER";
    }
    if (actor.spaceOwner()) {
      if (overrideReason == null || overrideReason.isBlank()) {
        throw new SceneException(ErrorCode.OVERRIDE_REQUIRED);
      }
      return "SPACE_OWNER_OVERRIDE";
    }
    throw new SceneException(ErrorCode.FORBIDDEN);
  }

  /** A sent override is 1 to 500 characters. Null was not sent. Blank or whitespace is 400. */
  private static void rejectOversizedOverride(String overrideReason) {
    if (overrideReason == null) {
      return;
    }
    if (overrideReason.isBlank() || overrideReason.trim().length() > REASON_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "override.reason"));
    }
  }

  private static void requireReason(String value, String field) {
    if (value == null || value.isBlank() || value.trim().length() > REASON_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
    }
  }

  private static String storedReason(
      LifecycleCommand command, String actedAs, LifecycleRequest request) {
    if (command == LifecycleCommand.REOPEN) {
      return request.reason().trim();
    }
    if ("SPACE_OWNER_OVERRIDE".equals(actedAs)) {
      return request.overrideReason().trim();
    }
    return null;
  }

  private static Map<String, Object> auditDetail(String actedAs, String overrideReason) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("actedAs", actedAs);
    if ("SPACE_OWNER_OVERRIDE".equals(actedAs)) {
      detail.put("overrideReason", overrideReason.trim());
    }
    return detail;
  }

  private SceneException concurrent(UUID spaceId, UUID eventId, EventRow row) {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("lifecycleVersion", row.lifecycleVersion());
    details.put("currentStatus", row.lifecycleStatus());
    LifecycleTransitionView last = events.findLatestTransition(spaceId, eventId).orElse(null);
    if (last != null) {
      Map<String, Object> transition = new LinkedHashMap<>();
      transition.put("command", last.command());
      transition.put("fromStatus", last.fromStatus());
      transition.put("toStatus", last.toStatus());
      transition.put("actedAs", last.actedAs());
      transition.put("occurredAt", last.occurredAt().toString());
      details.put("lastTransition", transition);
    }
    return new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
  }

  private static Map<String, Object> warningCounts(int openTasks) {
    Map<String, Object> warnings = new LinkedHashMap<>();
    warnings.put("openTasks", openTasks);
    warnings.put("unsettledFees", 0);
    warnings.put("unassignedParticipants", 0);
    warnings.put("unsentNotices", 0);
    return warnings;
  }
}
