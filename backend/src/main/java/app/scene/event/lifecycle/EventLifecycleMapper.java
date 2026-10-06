package app.scene.event.lifecycle;

import app.scene.common.sql.EffectiveOwnerSql;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface EventLifecycleMapper {

  @Select(
      """
      SELECT id, space_id, lifecycle_status, lifecycle_version
      FROM events
      WHERE id = #{eventId} AND space_id = #{spaceId}
      FOR UPDATE
      """)
  EventRow lock(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  @Select(
      """
      SELECT command, from_status, to_status, acted_as, occurred_at
      FROM event_lifecycle_transitions
      WHERE space_id = #{spaceId} AND event_id = #{eventId}
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1
      """)
  LifecycleTransitionView lastTransition(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  @Select(
      """
      SELECT count(*)
      FROM tasks
      WHERE event_id = #{eventId} AND space_id = #{spaceId}
        AND status IN ('TODO', 'DOING')
      """)
  int openTaskCount(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  @Update(
      """
      UPDATE events
      SET lifecycle_status = #{status}, lifecycle_version = lifecycle_version + 1
      WHERE id = #{eventId} AND space_id = #{spaceId} AND lifecycle_version = #{expectedVersion}
      """)
  int transition(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("expectedVersion") int expectedVersion,
      @Param("status") String status);

  @Insert(
      """
      INSERT INTO event_lifecycle_transitions (
        id, space_id, event_id, command, from_status, to_status, actor_user_id, acted_as,
        reason, warnings_snapshot, occurred_at)
      VALUES (
        #{id}, #{spaceId}, #{eventId}, #{command}, #{fromStatus}, #{toStatus}, #{actorUserId},
        #{actedAs}, #{reason}, CAST(#{warningsSnapshot} AS jsonb), #{occurredAt})
      """)
  void insertTransition(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("command") String command,
      @Param("fromStatus") String fromStatus,
      @Param("toStatus") String toStatus,
      @Param("actorUserId") UUID actorUserId,
      @Param("actedAs") String actedAs,
      @Param("reason") String reason,
      @Param("warningsSnapshot") String warningsSnapshot,
      @Param("occurredAt") Instant occurredAt);

  @Update(
      """
      UPDATE event_invitations
      SET status = 'REVOKED', updated_at = #{now}
      WHERE event_id = #{eventId} AND space_id = #{spaceId} AND status = 'PENDING'
      """)
  int revokePendingInvitations(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("now") Instant now);

  @Insert(
      """
      INSERT INTO operator_notices (id, space_id, event_id, recipient_user_id, kind, created_at)
      SELECT gen_random_uuid(), #{spaceId}, #{eventId}, o.user_id, #{kind}, #{now}
      FROM event_users o
      WHERE o.event_id = #{eventId} AND o.space_id = #{spaceId} AND o.role = 'OWNER'
        AND NOT
      """
          + EffectiveOwnerSql.OWNER_AUTHORITY_ENDED
          + """
      """)
  int notifyEventOwners(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("kind") String kind,
      @Param("now") Instant now);

  @Insert(
      """
      INSERT INTO audit_logs (id, space_id, event_id, actor_user_id, action, detail, occurred_at)
      VALUES (#{id}, #{spaceId}, #{eventId}, #{actorUserId}, #{action}, CAST(#{detail} AS jsonb), #{occurredAt})
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
