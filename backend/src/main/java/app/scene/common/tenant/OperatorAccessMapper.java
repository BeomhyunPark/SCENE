package app.scene.common.tenant;

import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Tenant predicates live in the SQL. Callers do not load a row and then compare {@code space_id}.
 */
@Mapper
public interface OperatorAccessMapper {

  /**
   * The event must already sit in {@code spaceId}. Access facts use the same {@code space_id}.
   * {@code EVENT_ACCESS_REVOKED} is the history written for the person who lost the event, stored
   * as {@code actor_user_id}.
   */
  @Select(
      """
      SELECT e.id AS event_id,
             e.name AS event_name,
             EXISTS (
               SELECT 1 FROM event_users eu
               WHERE eu.space_id = e.space_id
                 AND eu.event_id = e.id
                 AND eu.user_id = #{userId}
             ) AS event_operator,
             EXISTS (
               SELECT 1 FROM audit_logs a
               WHERE a.space_id = e.space_id
                 AND a.event_id = e.id
                 AND a.actor_user_id = #{userId}
                 AND a.action = 'EVENT_ACCESS_REVOKED'
             ) AS access_revoked
      FROM events e
      WHERE e.space_id = #{spaceId}
        AND e.id = #{eventId}
      """)
  EventAccessRow findEvent(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("userId") UUID userId);

  /**
   * No membership row means no row at all, including when the space exists. A former member still
   * matches, and the status says whether that membership has ended.
   */
  @Select(
      """
      SELECT s.id AS space_id,
             s.name AS space_name,
             m.status AS membership_status
      FROM members m
      JOIN spaces s ON s.id = m.space_id
      WHERE m.space_id = #{spaceId}
        AND m.user_id = #{userId}
      """)
  SpaceAccessRow findSpace(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);
}
