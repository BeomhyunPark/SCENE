package app.scene.space.invitation.mapper;

import app.scene.common.mybatis.PageParam;
import app.scene.space.invitation.SpaceInvitationRow;
import app.scene.space.invitation.SpaceMemberRow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SpaceInvitationMapper {

  int lockSpace(@Param("spaceId") UUID spaceId);

  String findSpaceName(@Param("spaceId") UUID spaceId);

  SpaceInvitationRow find(@Param("spaceId") UUID spaceId, @Param("id") UUID id);

  SpaceInvitationRow findForUpdate(@Param("spaceId") UUID spaceId, @Param("id") UUID id);

  SpaceInvitationRow findByTokenHash(@Param("tokenHash") String tokenHash);

  long countPending(@Param("spaceId") UUID spaceId);

  List<SpaceInvitationRow> findPendingPage(
      @Param("spaceId") UUID spaceId, @Param("page") PageParam page);

  int insertPending(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("emailNormalized") String emailNormalized,
      @Param("role") String role,
      @Param("tokenHash") String tokenHash,
      @Param("expiresAt") Instant expiresAt,
      @Param("invitedBy") UUID invitedBy,
      @Param("now") Instant now);

  int supersedePending(
      @Param("spaceId") UUID spaceId,
      @Param("emailNormalized") String emailNormalized,
      @Param("now") Instant now);

  int revokePending(
      @Param("spaceId") UUID spaceId, @Param("id") UUID id, @Param("now") Instant now);

  int acceptPending(
      @Param("spaceId") UUID spaceId,
      @Param("id") UUID id,
      @Param("acceptedUserId") UUID acceptedUserId,
      @Param("now") Instant now);

  String findMembershipStatusForUpdate(
      @Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  int insertMember(
      @Param("spaceId") UUID spaceId, @Param("userId") UUID userId, @Param("role") String role);

  int reactivateMember(
      @Param("spaceId") UUID spaceId, @Param("userId") UUID userId, @Param("role") String role);

  long countActiveMembers(@Param("spaceId") UUID spaceId);

  List<SpaceMemberRow> findActiveMembers(
      @Param("spaceId") UUID spaceId, @Param("page") PageParam page);
}
