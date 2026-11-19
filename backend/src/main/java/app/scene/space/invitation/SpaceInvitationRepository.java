package app.scene.space.invitation;

import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.space.invitation.mapper.SpaceInvitationMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class SpaceInvitationRepository {

  /** Newest first, like event invitations. Client sort is not accepted. */
  static final String PENDING_ORDER = "created_at DESC, id ASC";

  /** OWNER, ADMIN, MEMBER, then name by code point, then id. Client sort is not accepted. */
  static final String MEMBER_ORDER =
      "CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END ASC,"
          + " u.display_name COLLATE \"C\" ASC, m.user_id ASC";

  private final SpaceInvitationMapper invitations;

  public SpaceInvitationRepository(SpaceInvitationMapper invitations) {
    this.invitations = invitations;
  }

  public void lockSpace(UUID spaceId) {
    if (invitations.lockSpace(spaceId) != 1) {
      throw new IllegalStateException("space disappeared");
    }
  }

  public String spaceName(UUID spaceId) {
    String name = invitations.findSpaceName(spaceId);
    if (name == null) {
      throw new IllegalStateException("space is missing");
    }
    return name;
  }

  public Optional<SpaceInvitationRow> find(UUID spaceId, UUID id) {
    return Optional.ofNullable(invitations.find(spaceId, id));
  }

  public Optional<SpaceInvitationRow> findForUpdate(UUID spaceId, UUID id) {
    return Optional.ofNullable(invitations.findForUpdate(spaceId, id));
  }

  public Optional<SpaceInvitationRow> findByTokenHash(String tokenHash) {
    return Optional.ofNullable(invitations.findByTokenHash(tokenHash));
  }

  public long countPending(UUID spaceId) {
    return invitations.countPending(spaceId);
  }

  public List<SpaceInvitationRow> listPending(UUID spaceId, PageRequest request) {
    return invitations.findPendingPage(spaceId, page(request, PENDING_ORDER));
  }

  /** Marks the current PENDING row for this space and email SUPERSEDED, if any. */
  public void supersedePending(UUID spaceId, String emailNormalized, Instant now) {
    invitations.supersedePending(spaceId, emailNormalized, now);
  }

  public void savePending(
      UUID id,
      UUID spaceId,
      String emailNormalized,
      String role,
      String tokenHash,
      Instant expiresAt,
      UUID invitedBy,
      Instant now) {
    if (invitations.insertPending(
            id, spaceId, emailNormalized, role, tokenHash, expiresAt, invitedBy, now)
        != 1) {
      throw new IllegalStateException("space invitation was not stored");
    }
  }

  public int revokePending(UUID spaceId, UUID id, Instant now) {
    return invitations.revokePending(spaceId, id, now);
  }

  public int acceptPending(UUID spaceId, UUID id, UUID acceptedUserId, Instant now) {
    return invitations.acceptPending(spaceId, id, acceptedUserId, now);
  }

  /** {@code ACTIVE}, {@code LEFT}, or empty when the person never had a membership row. */
  public Optional<String> membershipStatusForUpdate(UUID spaceId, UUID userId) {
    return Optional.ofNullable(invitations.findMembershipStatusForUpdate(spaceId, userId));
  }

  public void insertMember(UUID spaceId, UUID userId, String role) {
    if (invitations.insertMember(spaceId, userId, role) != 1) {
      throw new IllegalStateException("member was not stored");
    }
  }

  public void reactivateMember(UUID spaceId, UUID userId, String role) {
    if (invitations.reactivateMember(spaceId, userId, role) != 1) {
      throw new IllegalStateException("member was not reactivated");
    }
  }

  public long countActiveMembers(UUID spaceId) {
    return invitations.countActiveMembers(spaceId);
  }

  public List<SpaceMemberRow> listActiveMembers(UUID spaceId, PageRequest request) {
    return invitations.findActiveMembers(spaceId, page(request, MEMBER_ORDER));
  }

  private static PageParam page(PageRequest request, String order) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return PageParam.of((int) offset, request.size(), order);
  }
}
