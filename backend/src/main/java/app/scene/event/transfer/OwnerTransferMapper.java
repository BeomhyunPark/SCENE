package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;
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
      WHERE id = #{id}
      FOR UPDATE
      """)
  TransferRow lock(@Param("id") UUID id);

  @Select(
      """
      SELECT role FROM event_users WHERE event_id = #{eventId} AND user_id = #{userId}
      """)
  String eventRole(@Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'permission', permission,
               'effect', effect,
               'grantedBy', granted_by,
               'grantedAt', granted_at))::text, '[]')
      FROM event_user_permissions
      WHERE event_id = #{eventId} AND user_id = #{userId}
      """)
  String permissionSnapshot(@Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE owner_transfers
      SET status = 'HANDOVER', recipient_prior_role = #{priorRole},
          accepted_at = #{acceptedAt}, handover_ends_at = #{endsAt},
          permission_snapshot = CAST(#{snapshot} AS jsonb)
      WHERE id = #{id} AND status = 'PENDING'
      """)
  int accept(
      @Param("id") UUID id,
      @Param("priorRole") String priorRole,
      @Param("acceptedAt") Instant acceptedAt,
      @Param("endsAt") Instant endsAt,
      @Param("snapshot") String snapshot);

  @Update(
      """
      DELETE FROM event_user_permissions
      WHERE event_id = #{eventId} AND user_id = #{userId}
      """)
  int deleteOverrides(@Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE event_users SET role = 'OWNER'
      WHERE event_id = #{eventId} AND user_id = #{userId}
      """)
  int makeOwner(@Param("eventId") UUID eventId, @Param("userId") UUID userId);
}
