package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction of a withdraw, an operator restore, or a withdrawn participant's
 * re-application (DEC-084 §7). The operator notifications (I3) listen to this to make {@code
 * APPLICATION_CANCELLED} and {@code APPLICATION_RESTORED} rows; nothing listens yet. {@code
 * actorUserId} is null when the participant acted. The reason is not carried.
 */
public record ApplicationStatusChanged(
    UUID spaceId,
    UUID eventId,
    UUID participantId,
    UUID applicationId,
    String action,
    String actorKind,
    UUID actorUserId,
    Instant at) {

  public static final String WITHDRAWN = "WITHDRAWN";
  public static final String RESTORED = "RESTORED";
  public static final String BY_OPERATOR = "OPERATOR";
  public static final String BY_PARTICIPANT = "PARTICIPANT";
}
