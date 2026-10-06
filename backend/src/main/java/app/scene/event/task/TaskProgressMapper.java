package app.scene.event.task;

import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TaskProgressMapper {

  @Select(
      """
      SELECT t.id, t.event_id, t.status, t.version, t.assignee_user_id,
             t.completed_by_user_id, t.completed_at, e.lifecycle_status
      FROM tasks t
      JOIN events e ON e.id = t.event_id AND e.space_id = t.space_id
      WHERE t.id = #{taskId} AND t.space_id = #{spaceId} AND t.event_id = #{eventId}
      FOR UPDATE OF t
      """)
  TaskRow lock(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("taskId") UUID taskId);

  @Select(
      """
      SELECT checked
      FROM task_checklist_items
      WHERE id = #{itemId} AND task_id = #{taskId}
        AND space_id = #{spaceId} AND event_id = #{eventId}
      """)
  Boolean item(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("taskId") UUID taskId,
      @Param("itemId") UUID itemId);

  @Select(
      """
      SELECT (count(*) FILTER (WHERE checked))::int AS done, count(*)::int AS total
      FROM task_checklist_items
      WHERE task_id = #{taskId} AND space_id = #{spaceId} AND event_id = #{eventId}
      """)
  ChecklistCounts counts(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("taskId") UUID taskId);

  @Update(
      """
      UPDATE task_checklist_items
      SET checked = #{checked},
          checked_by_user_id = #{checkedByUserId},
          checked_at = #{checkedAt}
      WHERE id = #{itemId} AND task_id = #{taskId}
        AND space_id = #{spaceId} AND event_id = #{eventId}
      """)
  int setChecked(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("taskId") UUID taskId,
      @Param("itemId") UUID itemId,
      @Param("checked") boolean checked,
      @Param("checkedByUserId") UUID checkedByUserId,
      @Param("checkedAt") Instant checkedAt);

  @Update(
      """
      UPDATE tasks
      SET status = #{status}, version = version + 1
      WHERE id = #{taskId} AND space_id = #{spaceId} AND event_id = #{eventId}
      """)
  int bump(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("taskId") UUID taskId,
      @Param("status") String status);

  @Update(
      """
      UPDATE tasks
      SET status = 'DONE', version = version + 1,
          completed_by_user_id = #{completedByUserId}, completed_at = #{completedAt}
      WHERE id = #{taskId} AND space_id = #{spaceId} AND event_id = #{eventId}
        AND version = #{version} AND status IN ('TODO', 'DOING')
      """)
  int complete(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("taskId") UUID taskId,
      @Param("version") int version,
      @Param("completedByUserId") UUID completedByUserId,
      @Param("completedAt") Instant completedAt);

  @Update(
      """
      UPDATE tasks
      SET status = 'DOING', version = version + 1,
          completed_by_user_id = NULL, completed_at = NULL
      WHERE id = #{taskId} AND space_id = #{spaceId} AND event_id = #{eventId}
        AND version = #{version} AND status = 'DONE'
      """)
  int reopen(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("taskId") UUID taskId,
      @Param("version") int version);

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
