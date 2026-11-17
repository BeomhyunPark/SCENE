package app.scene.event.checkin;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.participant.ParticipantSelf;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in participant's QR value (#283, DEC-071). The event state decides first: {@code
 * DRAFT} is {@code NOT_STARTED}, {@code ENDED} and {@code ARCHIVED} are {@code ENDED}. In an {@code
 * ACTIVE} event a participant without a SUBMITTED application is {@code NOT_ELIGIBLE}. Only {@code
 * AVAILABLE} carries the value, recomputed by {@link CheckInCodes} and never stored. With no
 * configured secret an {@code AVAILABLE} answer would carry no usable value, so it is {@code 404
 * RESOURCE_NOT_FOUND}, the same answer operator QR check-in gives. Nothing here writes audit or
 * logs the value.
 */
@Service
public class ParticipantCheckInService {

  private final EventRepository events;
  private final CheckInRepository checkIns;
  private final CheckInCodes codes;

  public ParticipantCheckInService(
      EventRepository events, CheckInRepository checkIns, CheckInCodes codes) {
    this.events = events;
    this.checkIns = checkIns;
    this.codes = codes;
  }

  @Transactional(readOnly = true)
  public ParticipantCheckIn current(ParticipantSelf self) {
    UUID spaceId = self.spaceId();
    UUID eventId = self.eventId();
    UUID participantId = self.participantId();
    EventRow event = events.find(spaceId, eventId).orElseThrow(ParticipantCheckInService::missing);
    CheckInTarget target =
        checkIns
            .findTarget(spaceId, eventId, participantId)
            .orElseThrow(ParticipantCheckInService::missing);
    Optional<CheckIn> row = checkIns.findByParticipant(spaceId, eventId, participantId);
    boolean checkedIn = row.map(CheckIn::checkedIn).orElse(false);
    Instant checkedInAt = checkedIn ? row.get().checkedInAt() : null;

    String status = status(event.lifecycleStatus(), target.submitted());
    if (!ParticipantCheckIn.AVAILABLE.equals(status)) {
      return new ParticipantCheckIn(status, null, checkedIn, checkedInAt);
    }
    String code =
        codes.issue(eventId, participantId).orElseThrow(ParticipantCheckInService::missing);
    return new ParticipantCheckIn(status, code, checkedIn, checkedInAt);
  }

  private static String status(String lifecycle, boolean submitted) {
    return switch (lifecycle) {
      case "DRAFT" -> ParticipantCheckIn.NOT_STARTED;
      case "ENDED", "ARCHIVED" -> ParticipantCheckIn.ENDED;
      case "ACTIVE" -> submitted ? ParticipantCheckIn.AVAILABLE : ParticipantCheckIn.NOT_ELIGIBLE;
      default -> throw new IllegalStateException("unknown event status " + lifecycle);
    };
  }

  private static SceneException missing() {
    return new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
  }
}
