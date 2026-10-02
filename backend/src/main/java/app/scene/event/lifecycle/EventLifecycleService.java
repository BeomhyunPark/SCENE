package app.scene.event.lifecycle;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** DEC-063 lifecycle commands. HTTP stays unwired until operator sessions exist. */
@Service
public class EventLifecycleService {

  private static final int REASON_MAX = 500;

  private final EventLifecycleMapper mapper;
  private final Clock clock;

  public EventLifecycleService(EventLifecycleMapper mapper, Clock clock) {
    this.mapper = mapper;
    this.clock = clock;
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
    EventRow row = lock(spaceId, eventId);
    String actedAs = authorize(command, actor, request.overrideReason());
    if (command == LifecycleCommand.REOPEN) {
      requireReason(request.reason(), "reason");
    }
    if (row.lifecycleStatus().equals(command.toStatus())) {
      return new LifecycleResult(
          "ALREADY_IN_STATE", row.lifecycleStatus(), row.lifecycleVersion(), actedAs);
    }
    if (row.lifecycleVersion() != request.expectedLifecycleVersion()) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION,
          Map.of(
              "lifecycleVersion", row.lifecycleVersion(), "currentStatus", row.lifecycleStatus()));
    }
    if (!row.lifecycleStatus().equals(command.fromStatus())) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION,
          Map.of("currentStatus", row.lifecycleStatus(), "command", command.name()));
    }
    int openTasks = mapper.openTaskCount(spaceId, eventId);
    String snapshot = warnings(openTasks);
    if (command.needsWarningAck()
        && openTasks > 0
        && !Boolean.TRUE.equals(request.acknowledgeWarnings())) {
      throw new SceneException(ErrorCode.CONFIRMATION_REQUIRED, Map.of("warnings", snapshot));
    }
    Instant now = clock.instant();
    int updated =
        mapper.transition(spaceId, eventId, request.expectedLifecycleVersion(), command.toStatus());
    if (updated != 1) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("lifecycleVersion", row.lifecycleVersion()));
    }
    String reason =
        command == LifecycleCommand.REOPEN
            ? request.reason().trim()
            : blankToNull(request.overrideReason());
    mapper.insertTransition(
        UUID.randomUUID(),
        spaceId,
        eventId,
        command.name(),
        row.lifecycleStatus(),
        command.toStatus(),
        actor.userId(),
        actedAs,
        reason,
        snapshot,
        now);
    if (command == LifecycleCommand.ARCHIVE) {
      mapper.revokePendingInvitations(spaceId, eventId, now);
    }
    if ("SPACE_OWNER_OVERRIDE".equals(actedAs)) {
      mapper.notifyEventOwners(spaceId, eventId, "LIFECYCLE_OVERRIDE", now);
    }
    mapper.audit(
        UUID.randomUUID(),
        spaceId,
        eventId,
        actor.userId(),
        "EVENT_" + command.name(),
        "{\"actedAs\":\"" + actedAs + "\"}",
        now);
    return new LifecycleResult(
        "TRANSITIONED", command.toStatus(), row.lifecycleVersion() + 1, actedAs);
  }

  private EventRow lock(UUID spaceId, UUID eventId) {
    EventRow row = mapper.lock(spaceId, eventId);
    if (row == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return row;
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
      requireReason(overrideReason, "override.reason");
      return "SPACE_OWNER_OVERRIDE";
    }
    throw new SceneException(ErrorCode.FORBIDDEN);
  }

  private static void requireReason(String value, String field) {
    if (value == null || value.isBlank()) {
      if ("override.reason".equals(field)) {
        throw new SceneException(ErrorCode.OVERRIDE_REQUIRED);
      }
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
    }
    if (value.trim().length() > REASON_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
    }
  }

  private static String blankToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private static String warnings(int openTasks) {
    return "{\"openTasks\":"
        + openTasks
        + ",\"unsettledFees\":0,\"unassignedParticipants\":0,\"unsentNotices\":0}";
  }
}
