package app.scene.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventLifecycleService;
import app.scene.event.lifecycle.LifecycleRequest;
import app.scene.event.lifecycle.LifecycleResult;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.event.task.TaskProgressService;
import app.scene.event.transfer.OwnerTransferService;
import app.scene.space.MembershipLeaveService;
import app.scene.support.PostgresTestcontainer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@Import(PostgresTestcontainer.class)
class LifecycleAndTaskIT {

  @Autowired JdbcTemplate jdbc;
  @Autowired EventLifecycleService lifecycle;
  @Autowired TaskProgressService tasks;
  @Autowired OwnerTransferService transfers;
  @Autowired MembershipLeaveService leave;

  @Test
  void ownerActivatesDraft() {
    Fixture fx = seed("DRAFT");
    LifecycleResult result = lifecycle.activate(fx.spaceId, fx.eventId, req(0), fx.ownerActor());
    assertThat(result.outcome()).isEqualTo("TRANSITIONED");
    assertThat(result.lifecycleStatus()).isEqualTo("ACTIVE");
    assertThat(result.lifecycleVersion()).isEqualTo(1);
    assertThat(count(fx, "event_lifecycle_transitions")).isEqualTo(1);
  }

  @Test
  void missingEventIsNotFoundBeforeAuthorization() {
    Fixture fx = seed("DRAFT");
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () -> lifecycle.end(fx.spaceId, UUID.randomUUID(), req(0), fx.managerActor()));
  }

  @Test
  void managerCannotEnd() {
    Fixture fx = seed("ACTIVE");
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> lifecycle.end(fx.spaceId, fx.eventId, req(0), fx.managerActor()));
    assertThat(status(fx)).isEqualTo("ACTIVE");
  }

  @Test
  void spaceOwnerEndRequiresReasonThenNotifiesOwners() {
    Fixture fx = seed("ACTIVE");
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    assertCode(
        ErrorCode.OVERRIDE_REQUIRED,
        () -> lifecycle.end(fx.spaceId, fx.eventId, req(0), spaceOwner));
    LifecycleResult result =
        lifecycle.end(
            fx.spaceId, fx.eventId, new LifecycleRequest(0, null, null, "연락 두절"), spaceOwner);
    assertThat(result.actedAs()).isEqualTo("SPACE_OWNER_OVERRIDE");
    assertThat(count(fx, "operator_notices")).isEqualTo(1);
  }

  @Test
  void spaceOwnerArchivesWithoutOverrideReason() {
    Fixture fx = seed("ENDED");
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    LifecycleResult result = lifecycle.archive(fx.spaceId, fx.eventId, req(0), spaceOwner);
    assertThat(result.actedAs()).isEqualTo("SPACE_OWNER");
    assertThat(result.lifecycleStatus()).isEqualTo("ARCHIVED");
  }

  @Test
  void endWithOpenTasksRequiresAcknowledgementAndDoesNotCompleteThem() {
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    assertCode(
        ErrorCode.CONFIRMATION_REQUIRED,
        () -> lifecycle.end(fx.spaceId, fx.eventId, req(0), fx.ownerActor()));
    LifecycleResult result =
        lifecycle.end(
            fx.spaceId, fx.eventId, new LifecycleRequest(0, true, null, null), fx.ownerActor());
    assertThat(result.lifecycleStatus()).isEqualTo("ENDED");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
  }

  @Test
  void secondEndIsAlreadyInState() {
    Fixture fx = seed("ACTIVE");
    lifecycle.end(
        fx.spaceId, fx.eventId, new LifecycleRequest(0, true, null, null), fx.ownerActor());
    LifecycleResult again = lifecycle.end(fx.spaceId, fx.eventId, req(0), fx.ownerActor());
    assertThat(again.outcome()).isEqualTo("ALREADY_IN_STATE");
    assertThat(count(fx, "event_lifecycle_transitions")).isEqualTo(1);
  }

  @Test
  void activeArchiveAndArchivedReopenAreRejected() {
    Fixture active = seed("ACTIVE");
    assertCode(
        ErrorCode.INVALID_STATE_TRANSITION,
        () -> lifecycle.archive(active.spaceId, active.eventId, req(0), active.ownerActor()));
    Fixture archived = seed("ARCHIVED");
    assertCode(
        ErrorCode.INVALID_STATE_TRANSITION,
        () ->
            lifecycle.reopen(
                archived.spaceId,
                archived.eventId,
                new LifecycleRequest(0, null, "잘못", null),
                archived.ownerActor()));
  }

  @Test
  void archiveRevokesPendingInvitations() {
    Fixture fx = seed("ENDED");
    jdbc.update(
        """
        INSERT INTO event_invitations (
          id, space_id, event_id, email_normalized, role, token_hash, status, expires_at, invited_by, created_at, updated_at)
        VALUES (?, ?, ?, 'a@example.com', 'STAFF', 'hash', 'PENDING', now() + interval '7 days', ?, now(), now())
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        fx.ownerId);
    lifecycle.archive(fx.spaceId, fx.eventId, req(0), fx.ownerActor());
    String status =
        jdbc.queryForObject(
            "SELECT status FROM event_invitations WHERE event_id = ?", String.class, fx.eventId);
    assertThat(status).isEqualTo("REVOKED");
  }

  @Test
  void archivedTaskWriteIsBlockedAndEndedWriteMovesTodoToDoing() {
    Fixture ended = seed("ENDED");
    UUID taskId = insertTask(ended, "TODO");
    UUID itemId = insertItem(taskId);
    tasks.setChecked(ended.spaceId, taskId, itemId, true, ended.staffActor());
    assertThat(taskStatus(taskId)).isEqualTo("DOING");

    Fixture archived = seed("ARCHIVED");
    UUID archivedTask = insertTask(archived, "TODO");
    UUID archivedItem = insertItem(archivedTask);
    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () ->
            tasks.setChecked(
                archived.spaceId, archivedTask, archivedItem, true, archived.ownerActor()));
  }

  @Test
  void staffWhoIsNotAssigneeCannotCheck() {
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(taskId);
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.setChecked(fx.spaceId, taskId, itemId, true, fx.staffActor()));
  }

  @Test
  void repeatedAcceptKeepsHandoverEnd() {
    Fixture fx = seed("ACTIVE");
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        transferId,
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'TASK_WRITE', 'GRANT', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);
    Instant first = transfers.accept(transferId);
    Instant second = transfers.accept(transferId);
    assertThat(second).isEqualTo(first);
    Integer overrides =
        jdbc.queryForObject(
            "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
            Integer.class,
            fx.eventId,
            fx.managerId);
    String snapshot =
        jdbc.queryForObject(
            "SELECT permission_snapshot::text FROM owner_transfers WHERE id = ?",
            String.class,
            transferId);
    assertThat(overrides).isZero();
    assertThat(snapshot).contains("TASK_WRITE");
  }

  @Test
  void cancelledTransferCannotBeAccepted() {
    Fixture fx = seed("ACTIVE");
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'CANCELLED')
        """,
        transferId,
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);
    assertCode(ErrorCode.TRANSFER_NOT_PENDING, () -> transfers.accept(transferId));
  }

  @Test
  void coOwnerCannotLeaveWithoutTransfer() {
    Fixture fx = seed("ACTIVE");
    UUID other = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'other')", other);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        fx.spaceId,
        fx.eventId,
        other);
    assertCode(ErrorCode.OWNER_ROLE_HELD, () -> leave.leave(fx.spaceId, fx.ownerId, List.of()));
    assertThat(leave.leavePreview(fx.spaceId, fx.ownerId)).isEqualTo(ErrorCode.OWNER_ROLE_HELD);
    assertThat(statusOfMember(fx)).isEqualTo("ACTIVE");
  }

  @Test
  void acceptedHandoverLetsOutgoingOwnerLeaveAndEndsAuthority() {
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now() + interval '14 days')
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);
    jdbc.update(
        "UPDATE event_users SET role = 'OWNER' WHERE event_id = ? AND user_id = ?",
        fx.eventId,
        fx.managerId);
    leave.leave(fx.spaceId, fx.ownerId, List.of());
    Integer stillOperator =
        jdbc.queryForObject(
            "SELECT count(*) FROM event_users WHERE event_id = ? AND user_id = ?",
            Integer.class,
            fx.eventId,
            fx.ownerId);
    String transferStatus =
        jdbc.queryForObject(
            "SELECT status FROM owner_transfers WHERE event_id = ? AND from_user_id = ?",
            String.class,
            fx.eventId,
            fx.ownerId);
    assertThat(stillOperator).isZero();
    assertThat(transferStatus).isEqualTo("COMPLETED");
    assertCode(ErrorCode.NOT_A_MEMBER, () -> leave.leavePreview(fx.spaceId, fx.ownerId));
  }

  @Test
  void pendingHandoverOutranksLastOwner() {
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);
    jdbc.update("DELETE FROM members WHERE space_id = ? AND user_id <> ?", fx.spaceId, fx.ownerId);
    assertCode(
        ErrorCode.HANDOVER_NOT_ACCEPTED, () -> leave.leave(fx.spaceId, fx.ownerId, List.of()));
  }

  @Test
  void ownerActivateLeavesTheTransitionReasonEmpty() {
    // lifecycle 회귀 #1
    Fixture fx = seed("DRAFT");
    lifecycle.activate(fx.spaceId, fx.eventId, req(0), fx.ownerActor());
    String reason =
        jdbc.query(
                "SELECT reason FROM event_lifecycle_transitions WHERE event_id = ?",
                (rs, row) -> rs.getString(1),
                fx.eventId)
            .getFirst();
    String detail =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'EVENT_ACTIVATE'",
            String.class,
            fx.eventId);
    assertThat(reason).isNull();
    assertThat(detail).contains("EVENT_OWNER").doesNotContain("overrideReason");
  }

  @Test
  void endWithoutAcknowledgementReturnsWarningCounts() {
    // lifecycle 회귀 #6
    Fixture fx = seed("ACTIVE");
    insertTask(fx, "TODO");
    assertThatThrownBy(() -> lifecycle.end(fx.spaceId, fx.eventId, req(0), fx.ownerActor()))
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(ErrorCode.CONFIRMATION_REQUIRED);
              @SuppressWarnings("unchecked")
              Map<String, Object> warnings = (Map<String, Object>) scene.details().get("warnings");
              assertThat(warnings)
                  .containsEntry("openTasks", 1)
                  .containsEntry("unsettledFees", 0)
                  .containsEntry("unassignedParticipants", 0)
                  .containsEntry("unsentNotices", 0);
            });
  }

  @Test
  void staleVersionReturnsTheLastTransition() {
    // lifecycle 회귀 #8 주변
    Fixture fx = seed("DRAFT");
    lifecycle.activate(fx.spaceId, fx.eventId, req(0), fx.ownerActor());
    assertThatThrownBy(
            () ->
                lifecycle.end(
                    fx.spaceId,
                    fx.eventId,
                    new LifecycleRequest(0, true, null, null),
                    fx.ownerActor()))
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(ErrorCode.CONCURRENT_MODIFICATION);
              assertThat(scene.details()).containsEntry("lifecycleVersion", 1);
              @SuppressWarnings("unchecked")
              Map<String, Object> last =
                  (Map<String, Object>) scene.details().get("lastTransition");
              assertThat(last)
                  .containsEntry("command", "ACTIVATE")
                  .containsEntry("fromStatus", "DRAFT")
                  .containsEntry("toStatus", "ACTIVE")
                  .containsEntry("actedAs", "EVENT_OWNER");
              assertThat(last.get("occurredAt")).isNotNull();
              assertThat(last).doesNotContainKey("reason");
            });
  }

  @Test
  void spaceOwnerReopenKeepsTheReopenReasonAndTheOverrideReason() {
    // lifecycle 회귀 #17
    Fixture fx = seed("ACTIVE");
    lifecycle.end(
        fx.spaceId, fx.eventId, new LifecycleRequest(0, true, null, null), fx.ownerActor());
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    lifecycle.reopen(
        fx.spaceId,
        fx.eventId,
        new LifecycleRequest(1, null, "일정을 다시 연다", "소유자가 연락되지 않음"),
        spaceOwner);
    String reason =
        jdbc.queryForObject(
            """
            SELECT reason FROM event_lifecycle_transitions
            WHERE event_id = ? AND command = 'REOPEN'
            """,
            String.class,
            fx.eventId);
    String detail =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'EVENT_REOPEN'",
            String.class,
            fx.eventId);
    assertThat(reason).isEqualTo("일정을 다시 연다");
    assertThat(detail).contains("SPACE_OWNER_OVERRIDE").contains("소유자가 연락되지 않음");
  }

  @Test
  void spaceOwnerOverrideAuditsTheReasonOnActivateAndEnd() {
    // lifecycle 회귀 #18
    Fixture fx = seed("DRAFT");
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    lifecycle.activate(
        fx.spaceId, fx.eventId, new LifecycleRequest(0, null, null, "준비를 마쳤다"), spaceOwner);
    lifecycle.end(
        fx.spaceId, fx.eventId, new LifecycleRequest(1, true, null, "행사를 끝낸다"), spaceOwner);
    String activate =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'EVENT_ACTIVATE'",
            String.class,
            fx.eventId);
    String end =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'EVENT_END'",
            String.class,
            fx.eventId);
    assertThat(activate).contains("SPACE_OWNER_OVERRIDE").contains("준비를 마쳤다");
    assertThat(end).contains("SPACE_OWNER_OVERRIDE").contains("행사를 끝낸다");
  }

  @Test
  void oversizedOverrideReasonIsRejectedBeforeAnyWrite() {
    // lifecycle 회귀 #19
    Fixture fx = seed("ACTIVE");
    String tooLong = "x".repeat(501);
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    LifecycleRequest override = new LifecycleRequest(0, true, "재개 사유", tooLong);
    assertField(() -> lifecycle.end(fx.spaceId, fx.eventId, override, spaceOwner));
    assertField(() -> lifecycle.reopen(fx.spaceId, fx.eventId, override, spaceOwner));
    assertField(() -> lifecycle.end(fx.spaceId, fx.eventId, override, fx.ownerActor()));
    assertField(() -> lifecycle.archive(fx.spaceId, fx.eventId, override, fx.ownerActor()));
    assertField(() -> lifecycle.archive(fx.spaceId, fx.eventId, override, spaceOwner));
    assertThat(status(fx)).isEqualTo("ACTIVE");
    assertThat(count(fx, "event_lifecycle_transitions")).isZero();
    assertThat(count(fx, "audit_logs")).isZero();
  }

  private static void assertCode(ErrorCode code, Throwing call) {
    assertThatThrownBy(call::run)
        .isInstanceOf(SceneException.class)
        .extracting("code")
        .isEqualTo(code);
  }

  private static void assertField(Throwing call) {
    assertThatThrownBy(call::run)
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
              assertThat(scene.details()).containsEntry("field", "override.reason");
            });
  }

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'owner')", fx.ownerId);
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'manager')", fx.managerId);
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'staff')", fx.staffId);
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'space-owner')", fx.spaceOwnerId);
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')",
        fx.spaceId,
        fx.ownerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')",
        fx.spaceId,
        fx.spaceOwnerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        fx.spaceId,
        fx.managerId);
    jdbc.update(
        "INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version) VALUES (?, ?, 'event', ?, 0)",
        fx.eventId,
        fx.spaceId,
        lifecycle);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        fx.spaceId,
        fx.eventId,
        fx.ownerId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'MANAGER')",
        fx.spaceId,
        fx.eventId,
        fx.managerId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        fx.spaceId,
        fx.eventId,
        fx.staffId);
    return fx;
  }

  private UUID insertTask(Fixture fx, String status) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', ?, ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        status,
        fx.staffId);
    return taskId;
  }

  private UUID insertItem(UUID taskId) {
    UUID itemId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO task_checklist_items (id, task_id, label, position) VALUES (?, ?, 'item', 0)",
        itemId,
        taskId);
    return itemId;
  }

  private String status(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?", String.class, fx.eventId);
  }

  private String taskStatus(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private String statusOfMember(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT status FROM members WHERE space_id = ? AND user_id = ?",
        String.class,
        fx.spaceId,
        fx.ownerId);
  }

  private int count(Fixture fx, String table) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE event_id = ?", Integer.class, fx.eventId);
  }

  private static LifecycleRequest req(int version) {
    return new LifecycleRequest(version, null, null, null);
  }

  @FunctionalInterface
  interface Throwing {
    void run();
  }

  record Fixture(
      UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId, UUID spaceOwnerId) {
    static Fixture create() {
      return new Fixture(
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID());
    }

    OperatorActor ownerActor() {
      return new OperatorActor(ownerId, "OWNER", "OWNER");
    }

    OperatorActor managerActor() {
      return new OperatorActor(managerId, "MEMBER", "MANAGER");
    }

    OperatorActor staffActor() {
      return new OperatorActor(staffId, null, "STAFF");
    }
  }
}
