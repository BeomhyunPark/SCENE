package app.scene.event.notification;

import app.scene.event.participant.ParticipantSelf;
import java.util.UUID;

/**
 * One recipient's list inside one event. A participant is {@code participants.id}; an operator is
 * {@code users.id} and sees only the rows of that event (DEC-080 §7.5).
 */
public record NotificationRecipient(RecipientKind kind, UUID spaceId, UUID eventId, UUID id) {

  public static NotificationRecipient participant(ParticipantSelf self) {
    return participant(self.spaceId(), self.eventId(), self.participantId());
  }

  public static NotificationRecipient participant(UUID spaceId, UUID eventId, UUID participantId) {
    return new NotificationRecipient(RecipientKind.PARTICIPANT, spaceId, eventId, participantId);
  }

  public static NotificationRecipient operator(UUID spaceId, UUID eventId, UUID userId) {
    return new NotificationRecipient(RecipientKind.OPERATOR, spaceId, eventId, userId);
  }
}
