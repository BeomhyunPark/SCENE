package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface OwnerTransferMapper {

  @Select(
      """
      SELECT id, event_id, from_user_id, to_user_id, status, handover_ends_at
      FROM owner_transfers
      WHERE id = #{id} AND space_id = #{spaceId} AND event_id IS NOT NULL
      FOR UPDATE
      """)
  TransferRow lock(@Param("spaceId") UUID spaceId, @Param("id") UUID id);

  @Select(
      """
      SELECT count(*) FROM members
      WHERE space_id = #{spaceId} AND user_id = #{userId} AND status = 'ACTIVE'
      """)
  int activeMember(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT role FROM event_users
      WHERE space_id = #{spaceId} AND event_id = #{eventId} AND user_id = #{userId}
      FOR UPDATE
      """)
  String lockEventRole(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'permission', permission,
               'effect', effect,
               'grantedBy', granted_by,
               'grantedAt', granted_at) ORDER BY permission)::text, '[]')
      FROM event_user_permissions
      WHERE space_id = #{spaceId} AND event_id = #{eventId} AND user_id = #{userId}
      """)
  String permissionSnapshot(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE owner_transfers
      SET status = 'HANDOVER', recipient_prior_role = #{priorRole},
          accepted_at = #{acceptedAt}, handover_ends_at = #{endsAt},
          permission_snapshot = CAST(#{snapshot} AS jsonb)
      WHERE id = #{id} AND space_id = #{spaceId} AND status = 'PENDING'
      """)
  int accept(
      @Param("spaceId") UUID spaceId,
      @Param("id") UUID id,
      @Param("priorRole") String priorRole,
      @Param("acceptedAt") Instant acceptedAt,
      @Param("endsAt") Instant endsAt,
      @Param("snapshot") String snapshot);

  @Update(
      """
      DELETE FROM event_user_permissions
      WHERE space_id = #{spaceId} AND event_id = #{eventId} AND user_id = #{userId}
      """)
  int deleteOverrides(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE event_users SET role = 'OWNER'
      WHERE space_id = #{spaceId} AND event_id = #{eventId} AND user_id = #{userId}
      """)
  int makeOwner(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Insert(
      """
      INSERT INTO event_users (space_id, event_id, user_id, role)
      VALUES (#{spaceId}, #{eventId}, #{userId}, 'OWNER')
      """)
  int insertOwner(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Insert(
      """
      INSERT INTO audit_logs (id, space_id, event_id, actor_user_id, action, detail, occurred_at)
      VALUES (
        #{id}, #{spaceId}, #{eventId}, #{actorUserId}, #{action},
        CAST(#{detail} AS jsonb), #{occurredAt})
      """)
  void audit(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("actorUserId") UUID actorUserId,
      @Param("action") String action,
      @Param("detail") String detail,
      @Param("occurredAt") Instant occurredAt);
}
