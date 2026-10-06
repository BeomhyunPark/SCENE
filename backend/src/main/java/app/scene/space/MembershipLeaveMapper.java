package app.scene.space;

import app.scene.common.sql.EffectiveOwnerSql;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MembershipLeaveMapper {

  @Select(
      """
      SELECT eu.event_id,
             eu.role = 'OWNER' AS owner,
             (SELECT count(*) FROM event_users o
               WHERE o.event_id = eu.event_id AND o.role = 'OWNER' AND o.user_id <> eu.user_id
                 AND NOT
      """
          + EffectiveOwnerSql.OWNER_AUTHORITY_ENDED
          + """
                 ) AS other_owners,
             EXISTS (
               SELECT 1 FROM owner_transfers t
               WHERE t.event_id = eu.event_id AND t.from_user_id = eu.user_id AND t.status = 'HANDOVER'
             ) AS handover_accepted,
             (SELECT count(*) FROM tasks tk
               WHERE tk.event_id = eu.event_id AND tk.assignee_user_id = eu.user_id
                 AND tk.status IN ('TODO', 'DOING')) AS open_tasks
      FROM event_users eu
      WHERE eu.space_id = #{spaceId} AND eu.user_id = #{userId}
      """)
  List<OperatedEvent> operatedEvents(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT count(*) FROM owner_transfers
      WHERE space_id = #{spaceId} AND from_user_id = #{userId} AND status = 'PENDING'
      """)
  int pendingHandoverFrom(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT count(*) FROM members
      WHERE space_id = #{spaceId} AND user_id <> #{userId} AND role = 'OWNER' AND status = 'ACTIVE'
      """)
  int otherSpaceOwners(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT count(*) FROM members
      WHERE space_id = #{spaceId} AND user_id = #{userId} AND role = 'OWNER' AND status = 'ACTIVE'
      """)
  int isSpaceOwner(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Select(
      """
      SELECT count(*) FROM members
      WHERE space_id = #{spaceId} AND user_id = #{userId} AND status = 'ACTIVE'
      """)
  int activeMember(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  @Update("DELETE FROM event_users WHERE event_id = #{eventId} AND user_id = #{userId}")
  int deleteOperator(@Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE owner_transfers
      SET status = 'COMPLETED'
      WHERE event_id = #{eventId} AND from_user_id = #{userId} AND status = 'HANDOVER'
      """)
  int completeHandover(@Param("eventId") UUID eventId, @Param("userId") UUID userId);

  @Update(
      """
      UPDATE members SET status = 'LEFT'
      WHERE space_id = #{spaceId} AND user_id = #{userId} AND status = 'ACTIVE'
      """)
  int leaveMembership(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);
}
