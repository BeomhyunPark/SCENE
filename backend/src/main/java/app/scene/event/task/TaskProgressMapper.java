package app.scene.event.task;

import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TaskProgressMapper {

  @Select(
      """
      SELECT t.id, t.status, t.version, t.assignee_user_id, e.lifecycle_status
      FROM tasks t
      JOIN events e ON e.id = t.event_id AND e.space_id = t.space_id
      WHERE t.id = #{taskId} AND t.space_id = #{spaceId}
      FOR UPDATE OF t
      """)
  TaskRow lock(@Param("spaceId") UUID spaceId, @Param("taskId") UUID taskId);

  @Update(
      """
      UPDATE task_checklist_items
      SET checked = #{checked}
      WHERE id = #{itemId} AND task_id = #{taskId}
      """)
  int setChecked(
      @Param("taskId") UUID taskId,
      @Param("itemId") UUID itemId,
      @Param("checked") boolean checked);

  @Update("UPDATE tasks SET status = 'DOING' WHERE id = #{taskId} AND status = 'TODO'")
  int markDoing(@Param("taskId") UUID taskId);

  @Select(
      """
      SELECT count(*) FROM task_checklist_items
      WHERE task_id = #{taskId} AND checked = false
      """)
  int uncheckedCount(@Param("taskId") UUID taskId);

  @Update(
      """
      UPDATE tasks SET status = 'DONE', version = version + 1
      WHERE id = #{taskId} AND version = #{version} AND status <> 'CANCELLED'
      """)
  int complete(@Param("taskId") UUID taskId, @Param("version") int version);

  @Update(
      """
      UPDATE tasks SET status = 'DOING', version = version + 1
      WHERE id = #{taskId} AND version = #{version} AND status = 'DONE'
      """)
  int reopen(@Param("taskId") UUID taskId, @Param("version") int version);
}
