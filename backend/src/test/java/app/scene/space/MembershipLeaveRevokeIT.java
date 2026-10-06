package app.scene.space;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(PostgresTestcontainer.class)
class MembershipLeaveRevokeIT {

  @Autowired JdbcTemplate jdbc;
  @Autowired MembershipLeaveService leave;

  @Test
  void operatorRemovalClearsTodoDoingAndDone() {
    // API §8 회귀 #36. 이탈은 TODO/DOING을 막으므로 제거 경로를 직접 부른다.
    UUID spaceId = UUID.randomUUID();
    UUID eventId = UUID.randomUUID();
    UUID userId = UUID.randomUUID();
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'owner')", ownerId);
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'operator')", userId);
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", spaceId);
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'event', 'ACTIVE', 0)
        """,
        eventId,
        spaceId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        spaceId,
        eventId,
        ownerId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        spaceId,
        eventId,
        userId);
    UUID todo = task(spaceId, eventId, userId, "TODO");
    UUID doing = task(spaceId, eventId, userId, "DOING");
    UUID done = task(spaceId, eventId, userId, "DONE");
    item(spaceId, eventId, todo);
    item(spaceId, eventId, doing);
    item(spaceId, eventId, done);

    leave.revokeEventAccess(spaceId, eventId, userId, "운영자 제거");

    assertThat(assignee(todo)).isNull();
    assertThat(assignee(doing)).isNull();
    assertThat(assignee(done)).isNull();
    assertThat(version(todo)).isEqualTo(1);
    assertThat(version(doing)).isEqualTo(1);
    assertThat(version(done)).isEqualTo(1);
    assertThat(status(todo)).isEqualTo("TODO");
    assertThat(status(doing)).isEqualTo("DOING");
    assertThat(status(done)).isEqualTo("DONE");
    assertThat(count("tasks", eventId)).isEqualTo(3);
    assertThat(count("task_checklist_items", eventId)).isEqualTo(3);
    assertThat(count("event_users", eventId)).isEqualTo(1);
    List<String> details =
        jdbc.query(
            """
            SELECT detail::text FROM audit_logs
            WHERE event_id = ? AND action = 'TASK_ASSIGNEE_CLEARED'
            ORDER BY detail::text
            """,
            (rs, row) -> rs.getString(1),
            eventId);
    assertThat(details).hasSize(3);
    assertThat(details)
        .allSatisfy(
            detail -> assertThat(detail).contains(userId.toString(), "운영자 제거", "\"version\": 1"));
  }

  private UUID task(UUID spaceId, UUID eventId, UUID assignee, String status) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', ?, ?)
        """,
        taskId,
        spaceId,
        eventId,
        status,
        assignee);
    return taskId;
  }

  private void item(UUID spaceId, UUID eventId, UUID taskId) {
    jdbc.update(
        """
        INSERT INTO task_checklist_items (id, space_id, event_id, task_id, label, position)
        VALUES (?, ?, ?, ?, 'item', 0)
        """,
        UUID.randomUUID(),
        spaceId,
        eventId,
        taskId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.query(
            "SELECT assignee_user_id FROM tasks WHERE id = ?",
            (rs, row) -> rs.getObject(1, UUID.class),
            taskId)
        .getFirst();
  }

  private int version(UUID taskId) {
    return jdbc.queryForObject("SELECT version FROM tasks WHERE id = ?", Integer.class, taskId);
  }

  private String status(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private int count(String table, UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE event_id = ?", Integer.class, eventId);
  }
}
