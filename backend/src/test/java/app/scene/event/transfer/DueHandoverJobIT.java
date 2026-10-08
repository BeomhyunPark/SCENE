package app.scene.event.transfer;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.common.audit.AuditActions;
import app.scene.support.PostgresTestcontainer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.config.ScheduledTaskHolder;

/**
 * The scheduled caller only. Permission row 36 stays in {@link OwnerTransferCompletionIT}.
 * Lifecycle rows 1–19 stay out.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class DueHandoverJobIT {

  @Autowired JdbcTemplate jdbc;
  @Autowired DueHandoverJob job;
  @Autowired OwnerTransferService transfers;
  @Autowired Clock clock;

  @Autowired(required = false)
  ScheduledTaskHolder scheduledTasks;

  @Test
  void jobUsesAFixedDelayAndDoesNotRegisterWhileTestsCallIt() throws NoSuchMethodException {
    Scheduled scheduled =
        DueHandoverJob.class
            .getDeclaredMethod("completeDueHandovers")
            .getAnnotation(Scheduled.class);
    assertThat(scheduled.fixedDelay()).isEqualTo(DueHandoverJob.DELAY_MILLIS);
    assertThat(scheduled.fixedRate()).isEqualTo(-1L);
    assertThat(scheduledTasks).isNull();
  }

  @Test
  void jobCompletesADueHandoverAndLeavesALaterOne() {
    World world = world();
    UUID dueId = accept(world, world.dueEventId);
    UUID laterId = accept(world, world.laterEventId);
    Instant now = clock.instant();
    jdbc.update(
        "UPDATE owner_transfers SET handover_ends_at = ? WHERE id = ?",
        java.sql.Timestamp.from(now.minus(Duration.ofSeconds(1))),
        dueId);

    job.completeDueHandovers();

    assertThat(status(dueId)).isEqualTo("COMPLETED");
    assertThat(role(world.dueEventId, world.ownerId)).isEqualTo("STAFF");
    assertThat(role(world.dueEventId, world.managerId)).isEqualTo("OWNER");
    assertThat(status(laterId)).isEqualTo("HANDOVER");
    assertThat(role(world.laterEventId, world.ownerId)).isEqualTo("OWNER");
    assertThat(auditCount(world.dueEventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isEqualTo(1);
    assertThat(auditCount(world.laterEventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();

    job.completeDueHandovers();

    assertThat(status(dueId)).isEqualTo("COMPLETED");
    assertThat(role(world.dueEventId, world.ownerId)).isEqualTo("STAFF");
    assertThat(auditCount(world.dueEventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isEqualTo(1);
  }

  private UUID accept(World world, UUID eventId) {
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        transferId,
        world.spaceId,
        eventId,
        world.ownerId,
        world.managerId);
    assertThat(transfers.accept(world.spaceId, transferId, world.managerId).outcome())
        .isEqualTo("ACCEPTED");
    return transferId;
  }

  private World world() {
    UUID spaceId = UUID.randomUUID();
    UUID ownerId = user("Sender");
    UUID managerId = user("Recipient");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Green Grove')", spaceId);
    member(spaceId, ownerId);
    member(spaceId, managerId);
    UUID dueEventId = event(spaceId, "Due");
    UUID laterEventId = event(spaceId, "Later");
    eventUser(spaceId, dueEventId, ownerId, "OWNER");
    eventUser(spaceId, dueEventId, managerId, "MANAGER");
    eventUser(spaceId, laterEventId, ownerId, "OWNER");
    eventUser(spaceId, laterEventId, managerId, "MANAGER");
    return new World(spaceId, dueEventId, laterEventId, ownerId, managerId);
  }

  private UUID user(String displayName) {
    UUID userId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", userId, displayName);
    return userId;
  }

  private void member(UUID spaceId, UUID userId) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, userId);
  }

  private UUID event(UUID spaceId, String name) {
    UUID eventId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, 'ACTIVE', 0)
        """,
        eventId,
        spaceId,
        name);
    return eventId;
  }

  private void eventUser(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private String status(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT status FROM owner_transfers WHERE id = ?", String.class, transferId);
  }

  private String role(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
  }

  private int auditCount(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private record World(
      UUID spaceId, UUID dueEventId, UUID laterEventId, UUID ownerId, UUID managerId) {}
}
