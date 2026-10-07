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

/**
 * Permission row 36, status and overrides only. The role half stays blocked. Lifecycle rows 1–19
 * stay out. An accepted handover is opened through {@link OwnerTransferService#accept}.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OwnerTransferCompletionIT {

  @Autowired JdbcTemplate jdbc;
  @Autowired OwnerTransferService transfers;
  @Autowired Clock clock;

  @Test
  void completeDueBeforeTheEndLeavesTheHandover() {
    World world = world("ACTIVE");
    UUID transferId = accept(world, world.eventId, world.ownerId, world.managerId);
    grant(world.spaceId, world.eventId, world.ownerId, "TASK_WRITE");
    Instant endsAt = endsAt(transferId);

    transfers.completeDue(clock.instant());

    assertThat(status(transferId)).isEqualTo("HANDOVER");
    assertThat(role(world.eventId, world.ownerId)).isEqualTo("OWNER");
    assertThat(overrides(world.eventId, world.ownerId)).isEqualTo(1);
    assertThat(endsAt(transferId)).isEqualTo(endsAt);
    assertThat(auditCount(world.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
  }

  @Test
  void completeDueAtTheEndStoresCompletedAndDropsSenderOverrides() {
    World world = world("ACTIVE");
    UUID coOwnerId = user("Co Owner");
    member(world.spaceId, coOwnerId, "MEMBER");
    eventUser(world.spaceId, world.eventId, coOwnerId, "OWNER");
    UUID transferId = accept(world, world.eventId, world.ownerId, world.managerId);
    grant(world.spaceId, world.eventId, world.ownerId, "TASK_WRITE");
    Instant endsAt = endsAt(transferId);

    UUID laterEventId = event(world.spaceId, "Later", "ACTIVE");
    eventUser(world.spaceId, laterEventId, world.ownerId, "OWNER");
    eventUser(world.spaceId, laterEventId, world.managerId, "MANAGER");
    UUID laterId = accept(world, laterEventId, world.ownerId, world.managerId);
    jdbc.update(
        "UPDATE owner_transfers SET handover_ends_at = ? WHERE id = ?",
        java.sql.Timestamp.from(endsAt.plus(Duration.ofDays(1))),
        laterId);
    grant(world.spaceId, laterEventId, world.ownerId, "DATA_EXPORT");

    UUID otherEventId = event(world.spaceId, "Other", "ACTIVE");
    eventUser(world.spaceId, otherEventId, world.ownerId, "MANAGER");
    grant(world.spaceId, otherEventId, world.ownerId, "DATA_EXPORT");

    UUID pendingId =
        stored(world, world.eventId, world.staffId, world.managerId, "PENDING", endsAt);
    UUID declinedId =
        stored(world, otherEventId, world.staffId, world.managerId, "DECLINED", endsAt);
    UUID cancelledId =
        stored(world, laterEventId, world.staffId, world.ownerId, "CANCELLED", endsAt);
    int acceptAudits = auditCount(world.eventId, "OWNER_TRANSFER_ACCEPTED");

    transfers.completeDue(endsAt);

    assertThat(status(transferId)).isEqualTo("COMPLETED");
    assertThat(endsAt(transferId)).isEqualTo(endsAt);
    assertThat(role(world.eventId, world.managerId)).isEqualTo("OWNER");
    assertThat(role(world.eventId, coOwnerId)).isEqualTo("OWNER");
    assertThat(role(world.eventId, world.ownerId)).isEqualTo("OWNER");
    assertThat(overrides(world.eventId, world.ownerId)).isZero();
    assertThat(status(laterId)).isEqualTo("HANDOVER");
    assertThat(role(laterEventId, world.ownerId)).isEqualTo("OWNER");
    assertThat(overrides(laterEventId, world.ownerId)).isEqualTo(1);
    assertThat(role(otherEventId, world.ownerId)).isEqualTo("MANAGER");
    assertThat(overrides(otherEventId, world.ownerId)).isEqualTo(1);
    assertThat(status(pendingId)).isEqualTo("PENDING");
    assertThat(status(declinedId)).isEqualTo("DECLINED");
    assertThat(status(cancelledId)).isEqualTo("CANCELLED");
    assertThat(memberStatus(world.spaceId, world.ownerId)).isEqualTo("ACTIVE");
    assertThat(auditCount(world.eventId, "OWNER_TRANSFER_ACCEPTED")).isEqualTo(acceptAudits);
    assertThat(auditCount(world.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();

    transfers.completeDue(endsAt);

    assertThat(status(transferId)).isEqualTo("COMPLETED");
    assertThat(endsAt(transferId)).isEqualTo(endsAt);
    assertThat(auditCount(world.eventId, "OWNER_TRANSFER_ACCEPTED")).isEqualTo(acceptAudits);
    assertThat(auditCount(world.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
    assertThat(auditCount(laterEventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
  }

  @Test
  void archivedDueHandoverIsCompleted() {
    World world = world("ARCHIVED");
    UUID transferId = accept(world, world.eventId, world.ownerId, world.managerId);
    grant(world.spaceId, world.eventId, world.ownerId, "TASK_WRITE");
    Instant endsAt = endsAt(transferId);

    transfers.completeDue(endsAt);

    assertThat(status(transferId)).isEqualTo("COMPLETED");
    assertThat(role(world.eventId, world.ownerId)).isEqualTo("OWNER");
    assertThat(role(world.eventId, world.managerId)).isEqualTo("OWNER");
    assertThat(overrides(world.eventId, world.ownerId)).isZero();
    assertThat(endsAt(transferId)).isEqualTo(endsAt);
    assertThat(auditCount(world.eventId, AuditActions.EVENT_USER_ROLE_CHANGED)).isZero();
  }

  private UUID accept(World world, UUID eventId, UUID fromUserId, UUID toUserId) {
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        transferId,
        world.spaceId,
        eventId,
        fromUserId,
        toUserId);
    assertThat(transfers.accept(world.spaceId, transferId, toUserId).outcome())
        .isEqualTo("ACCEPTED");
    return transferId;
  }

  private UUID stored(
      World world, UUID eventId, UUID fromUserId, UUID toUserId, String status, Instant endsAt) {
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        transferId,
        world.spaceId,
        eventId,
        fromUserId,
        toUserId,
        status,
        java.sql.Timestamp.from(endsAt));
    return transferId;
  }

  private void grant(UUID spaceId, UUID eventId, UUID userId, String permission) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'GRANT', ?, now())
        """,
        spaceId,
        eventId,
        userId,
        permission,
        userId);
  }

  private World world(String lifecycle) {
    UUID spaceId = UUID.randomUUID();
    UUID ownerId = user("Sender");
    UUID managerId = user("Recipient");
    UUID staffId = user("Staff");
    UUID spaceOwnerId = user("Space Owner");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Green Grove')", spaceId);
    member(spaceId, ownerId, "OWNER");
    member(spaceId, managerId, "MEMBER");
    member(spaceId, staffId, "MEMBER");
    member(spaceId, spaceOwnerId, "OWNER");
    UUID eventId = event(spaceId, "Gathering", lifecycle);
    eventUser(spaceId, eventId, ownerId, "OWNER");
    eventUser(spaceId, eventId, managerId, "MANAGER");
    eventUser(spaceId, eventId, staffId, "STAFF");
    return new World(spaceId, eventId, ownerId, managerId, staffId);
  }

  private UUID user(String displayName) {
    UUID userId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", userId, displayName);
    return userId;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private UUID event(UUID spaceId, String name, String lifecycle) {
    UUID eventId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, ?, 0)
        """,
        eventId,
        spaceId,
        name,
        lifecycle);
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

  private Instant endsAt(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT handover_ends_at FROM owner_transfers WHERE id = ?",
        (rs, row) -> rs.getTimestamp(1).toInstant(),
        transferId);
  }

  private String role(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
  }

  private int overrides(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private String memberStatus(UUID spaceId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT status FROM members WHERE space_id = ? AND user_id = ?",
        String.class,
        spaceId,
        userId);
  }

  private int auditCount(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private record World(UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId) {}
}
