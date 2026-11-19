package app.scene.event.participant;

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

/**
 * Operator reset of a participant's six-digit number (DEC-078 §2, #399). Needs effective {@code
 * PARTICIPANT_WRITE}. The order is 404 (event, participant) → 403 → 409 {@code EVENT_ARCHIVED}. The
 * server makes a temporary number, stores its hash with {@code pin_temporary}, ends every session
 * of the participant, unlocks the phone, and writes {@code PARTICIPANT_PIN_RESET} with the
 * participant id only. The temporary number is returned once and never logged.
 */
@Service
public class ParticipantPinResetService {

  private static final String ARCHIVED = "ARCHIVED";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final ParticipantRepository participants;
  private final ParticipantSessionRepository sessions;
  private final ParticipantPins pins;
  private final ParticipantGuard guard;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final Clock clock;

  public ParticipantPinResetService(
      EventAccessGate gate,
      EventRepository events,
      ParticipantRepository participants,
      ParticipantSessionRepository sessions,
      ParticipantPins pins,
      ParticipantGuard guard,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.participants = participants;
    this.sessions = sessions;
    this.pins = pins;
    this.guard = guard;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.clock = clock;
  }

  /** Returns the temporary number. */
  @Transactional
  public String reset(UUID actorId, UUID eventId, UUID participantId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    ParticipantIdentity participant =
        participants
            .findById(spaceId, eventId, participantId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!allows(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    String temporary = pins.temporary(ParticipantPins.digits(participant.phone()));
    Instant now = clock.instant();
    participants.updatePin(spaceId, eventId, participantId, pins.hash(temporary), true, now);
    sessions.deleteByParticipant(spaceId, eventId, participantId, null);
    guard.succeeded(eventId, ParticipantPins.phoneKey(participant.phone()));
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.PARTICIPANT_PIN_RESET,
        "{\"participantId\":\"" + participantId + "\"}",
        now);
    return temporary;
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
}
