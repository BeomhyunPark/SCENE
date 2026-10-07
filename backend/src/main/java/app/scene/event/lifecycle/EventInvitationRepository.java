package app.scene.event.lifecycle;

import app.scene.event.lifecycle.mapper.EventInvitationMapper;
import app.scene.event.lifecycle.param.InvitationRevoke;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class EventInvitationRepository {

  private static final String REVOKED = "REVOKED";
  private static final String PENDING = "PENDING";

  private final EventInvitationMapper invitations;

  public EventInvitationRepository(EventInvitationMapper invitations) {
    this.invitations = invitations;
  }

  @Transactional
  public void updateRevoked(UUID spaceId, UUID eventId, Instant now) {
    invitations.updateRevoked(InvitationRevoke.of(spaceId, eventId, now, REVOKED, PENDING));
  }
}
