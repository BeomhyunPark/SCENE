package app.scene.event.lifecycle;

import app.scene.event.lifecycle.mapper.EventInvitationMapper;
import app.scene.event.lifecycle.param.InvitationAccept;
import app.scene.event.lifecycle.param.InvitationInsert;
import app.scene.event.lifecycle.param.InvitationKey;
import app.scene.event.lifecycle.param.InvitationPendingClose;
import app.scene.event.lifecycle.param.InvitationRevoke;
import app.scene.event.lifecycle.param.InvitationSingleRevoke;
import app.scene.event.lifecycle.param.InvitationToken;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class EventInvitationRepository {

  private static final String REVOKED = "REVOKED";
  private static final String PENDING = "PENDING";
  private static final String SUPERSEDED = "SUPERSEDED";
  private static final String ACCEPTED = "ACCEPTED";

  private final EventInvitationMapper invitations;

  public EventInvitationRepository(EventInvitationMapper invitations) {
    this.invitations = invitations;
  }

  public Optional<InvitationRow> find(UUID spaceId, UUID eventId, UUID id) {
    return Optional.ofNullable(invitations.find(InvitationKey.of(spaceId, eventId, id)));
  }

  public Optional<InvitationRow> findByTokenHash(String tokenHash) {
    return Optional.ofNullable(invitations.findByTokenHash(InvitationToken.of(tokenHash)));
  }

  public Optional<InvitationRow> findForUpdate(UUID spaceId, UUID eventId, UUID id) {
    return Optional.ofNullable(invitations.findForUpdate(InvitationKey.of(spaceId, eventId, id)));
  }

  @Transactional
  public int acceptPending(UUID spaceId, UUID eventId, UUID id, UUID acceptedUserId, Instant now) {
    return invitations.acceptPending(
        InvitationAccept.of(id, spaceId, eventId, acceptedUserId, now, ACCEPTED, PENDING));
  }

  /** Archive keeps {@link #updateRevoked}. This updates one PENDING row. */
  @Transactional
  public int revokePending(UUID spaceId, UUID eventId, UUID id, Instant now) {
    return invitations.revokePending(
        InvitationSingleRevoke.of(id, spaceId, eventId, now, REVOKED, PENDING));
  }

  @Transactional
  public void supersedePending(UUID spaceId, UUID eventId, String emailNormalized, Instant now) {
    invitations.supersedePending(
        InvitationPendingClose.of(spaceId, eventId, emailNormalized, now, SUPERSEDED, PENDING));
  }

  @Transactional
  public void savePending(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String emailNormalized,
      String role,
      String tokenHash,
      Instant expiresAt,
      UUID invitedBy,
      Instant now) {
    int saved =
        invitations.save(
            InvitationInsert.of(
                id,
                spaceId,
                eventId,
                emailNormalized,
                role,
                tokenHash,
                PENDING,
                expiresAt,
                invitedBy,
                now));
    if (saved != 1) {
      throw new IllegalStateException("invitation was not stored");
    }
  }

  /** Archive path. One transaction with the lifecycle status change. */
  @Transactional
  public void updateRevoked(UUID spaceId, UUID eventId, Instant now) {
    invitations.updateRevoked(InvitationRevoke.of(spaceId, eventId, now, REVOKED, PENDING));
  }
}
