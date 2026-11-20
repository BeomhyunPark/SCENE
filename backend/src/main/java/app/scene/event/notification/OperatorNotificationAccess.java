package app.scene.event.notification;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventAccessGate;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Opens an operator's own notification list of one event (DEC-080 §7.5). The order is {@link
 * EventAccessGate}'s, the same as the other operator paths: missing event or another space {@code
 * 404}, removed or left {@code 403 NOT_A_MEMBER}. On top of that the caller must be an operator of
 * the event (an {@code event_users} row): an active space member without one gets {@code 403
 * NOT_A_MEMBER} too, because the list is per operator and they have none there. No permission key
 * is checked: an operator only reads what was sent to them.
 */
@Component
public class OperatorNotificationAccess {

  private final EventAccessGate gate;

  public OperatorNotificationAccess(EventAccessGate gate) {
    this.gate = gate;
  }

  public NotificationRecipient open(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (opened.eventRole() == null) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return NotificationRecipient.operator(opened.location().spaceId(), eventId, actorId);
  }
}
