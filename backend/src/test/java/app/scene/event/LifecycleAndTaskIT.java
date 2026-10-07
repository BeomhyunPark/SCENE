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
import app.scene.event.task.TaskWriteResult;
import app.scene.event.transfer.OwnerTransferService;
import app.scene.event.transfer.TransferAcceptResult;
import app.scene.space.MembershipLeaveService;
import app.scene.support.PostgresTestcontainer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
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
    assertThat(auditCount(fx, "EVENT_END")).isEqualTo(1);
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
    assertThat(count(active, "audit_logs")).isZero();
    assertThat(count(archived, "audit_logs")).isZero();
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
    UUID itemId = insertItem(ended, taskId);
    // API §8 회귀 #21
    tasks.setChecked(ended.spaceId, ended.eventId, taskId, itemId, true, ended.staffActor());
    assertThat(taskStatus(taskId)).isEqualTo("DOING");

    Fixture archived = seed("ARCHIVED");
    UUID archivedTask = insertTask(archived, "TODO");
    UUID archivedItem = insertItem(archived, archivedTask);
    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () ->
            tasks.setChecked(
                archived.spaceId,
                archived.eventId,
                archivedTask,
                archivedItem,
                true,
                archived.ownerActor()));
  }

  @Test
  void staffWhoIsNotAssigneeCannotCheck() {
    // API §8 회귀 #16
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor()));
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
  }

  @Test
  void firstCheckMovesTodoToDoingAndRecordsWhoChecked() {
    // API §8 회귀 #1, #29
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID first = insertItem(fx, taskId, 0);
    insertItem(fx, taskId, 1);
    TaskWriteResult result =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, first, true, fx.staffActor());
    assertThat(result.outcome()).isEqualTo("UPDATED");
    assertThat(result.status()).isEqualTo("DOING");
    assertThat(result.version()).isEqualTo(1);
    assertThat(result.done()).isEqualTo(1);
    assertThat(result.total()).isEqualTo(2);
    assertThat(checkedBy(first)).isEqualTo(fx.staffId);
    assertThat(checkedAt(first)).isNotNull();
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isEqualTo(1);
    String detail = auditDetail(fx, "TASK_ITEM_CHECKED");
    assertThat(detail).contains("TODO").contains("DOING").contains(first.toString());
  }

  @Test
  void repeatingTheSameCheckDoesNotChangeVersionOrAudit() {
    // API §8 회귀 #2
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor());
    TaskWriteResult again =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor());
    assertThat(again.outcome()).isEqualTo("NO_CHANGE");
    assertThat(again.version()).isEqualTo(1);
    assertThat(version(taskId)).isEqualTo(1);
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isEqualTo(1);
  }

  @Test
  void secondCheckOfTheSameItemIsNoChangeAfterTheFirstCommits() throws Exception {
    // API §8 회귀 #3. The row lock makes the later transaction see the committed check.
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<TaskWriteResult> first =
          pool.submit(
              () ->
                  tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor()));
      Future<TaskWriteResult> second =
          pool.submit(
              () ->
                  tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor()));
      TaskWriteResult a = first.get();
      TaskWriteResult b = second.get();
      assertThat(List.of(a.outcome(), b.outcome()))
          .containsExactlyInAnyOrder("UPDATED", "NO_CHANGE");
      assertThat(version(taskId)).isEqualTo(1);
      assertThat(checkedBy(itemId)).isEqualTo(fx.staffId);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void checkingTwoItemsBumpsVersionTwice() {
    // API §8 회귀 #4
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID first = insertItem(fx, taskId, 0);
    UUID second = insertItem(fx, taskId, 1);
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, first, true, fx.staffActor());
    TaskWriteResult result =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, second, true, fx.ownerActor());
    assertThat(result.outcome()).isEqualTo("UPDATED");
    assertThat(result.done()).isEqualTo(2);
    assertThat(result.version()).isEqualTo(2);
    assertThat(result.status()).isEqualTo("DOING");
  }

  @Test
  void completeRecordsWhoFinishedAndReopenClearsThatRecord() {
    // API §8 회귀 #6, #11
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID first = insertItem(fx, taskId, 0);
    UUID second = insertItem(fx, taskId, 1);
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, first, true, fx.staffActor());
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, second, true, fx.staffActor());
    TaskWriteResult completed = tasks.complete(fx.spaceId, fx.eventId, taskId, 2, fx.staffActor());
    assertThat(completed.outcome()).isEqualTo("COMPLETED");
    assertThat(completed.status()).isEqualTo("DONE");
    assertThat(completed.version()).isEqualTo(3);
    assertThat(completedBy(taskId)).isEqualTo(fx.staffId);
    assertThat(auditCount(fx, "TASK_COMPLETED")).isEqualTo(1);

    TaskWriteResult reopened = tasks.reopen(fx.spaceId, fx.eventId, taskId, 3, fx.staffActor());
    assertThat(reopened.outcome()).isEqualTo("REOPENED");
    assertThat(reopened.status()).isEqualTo("DOING");
    assertThat(reopened.done()).isEqualTo(2);
    assertThat(completedBy(taskId)).isNull();
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, first, false, fx.staffActor());
    TaskWriteResult unchecked =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, second, false, fx.staffActor());
    assertThat(unchecked.outcome()).isEqualTo("UPDATED");
    assertThat(unchecked.status()).isEqualTo("DOING");
    assertThat(unchecked.done()).isZero();
    assertThat(checkedBy(second)).isNull();
  }

  @Test
  void completeWithAnOpenItemUsesChecklistIncompleteOnlyWhenTheVersionMatches() {
    // API §8 회귀 #7, #12
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID first = insertItem(fx, taskId, 0);
    UUID second = insertItem(fx, taskId, 1);
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, first, true, fx.staffActor());
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, second, true, fx.staffActor());
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, second, false, fx.staffActor());
    assertReason(
        ErrorCode.TASK_VERSION_CONFLICT,
        null,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 2, fx.staffActor()));
    assertThat(version(taskId)).isEqualTo(3);
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "CHECKLIST_INCOMPLETE",
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 3, fx.staffActor()));
    assertThat(taskStatus(taskId)).isEqualTo("DOING");
  }

  @Test
  void taskWithNoItemsCanBeCompleted() {
    // API §8 회귀 #8
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    TaskWriteResult result = tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.staffActor());
    assertThat(result.outcome()).isEqualTo("COMPLETED");
    assertThat(result.done()).isZero();
    assertThat(result.total()).isZero();
    assertThat(result.status()).isEqualTo("DONE");
  }

  @Test
  void doneTaskRejectsAChangedCheckAndIgnoresTheSameValue() {
    // API §8 회귀 #9, #10
    Fixture fx = seed("ACTIVE");
    UUID taskId = doneTask(fx);
    UUID itemId = onlyItem(taskId);
    TaskWriteResult same =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor());
    assertThat(same.outcome()).isEqualTo("NO_CHANGE");
    assertThat(version(taskId)).isEqualTo(1);
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "TASK_DONE",
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, false, fx.staffActor()));
    assertThat(itemChecked(itemId)).isTrue();
    assertThat(taskStatus(taskId)).isEqualTo("DONE");
  }

  @Test
  void uncheckingAfterCompleteStaysDone() {
    // API §8 회귀 #13
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor());
    tasks.complete(fx.spaceId, fx.eventId, taskId, 1, fx.staffActor());
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "TASK_DONE",
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, false, fx.staffActor()));
    assertThat(taskStatus(taskId)).isEqualTo("DONE");
    assertThat(itemChecked(itemId)).isTrue();
  }

  @Test
  void repeatingCompleteIsAlreadyDoneRegardlessOfVersion() {
    // API §8 회귀 #14
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    TaskWriteResult first = tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.staffActor());
    TaskWriteResult again = tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.staffActor());
    assertThat(again.outcome()).isEqualTo("ALREADY_DONE");
    assertThat(again.version()).isEqualTo(first.version());
    assertThat(version(taskId)).isEqualTo(first.version());
    assertThat(auditCount(fx, "TASK_COMPLETED")).isEqualTo(1);
  }

  @Test
  void reopeningAnOpenTaskIsAlreadyOpenRegardlessOfVersion() {
    // API §8 회귀 #15
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "DOING");
    jdbc.update("UPDATE tasks SET version = 4 WHERE id = ?", taskId);
    TaskWriteResult current = tasks.reopen(fx.spaceId, fx.eventId, taskId, 4, fx.staffActor());
    TaskWriteResult stale = tasks.reopen(fx.spaceId, fx.eventId, taskId, 1, fx.staffActor());
    assertThat(current.outcome()).isEqualTo("ALREADY_OPEN");
    assertThat(stale.outcome()).isEqualTo("ALREADY_OPEN");
    assertThat(stale.version()).isEqualTo(4);
    assertThat(auditCount(fx, "TASK_REOPENED")).isZero();
  }

  @Test
  void taskFromAnotherEventIsNotFound() {
    // API §8 회귀 #20
    Fixture fx = seed("ACTIVE");
    UUID otherEvent = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'other', 'ACTIVE', 0)
        """,
        otherEvent,
        fx.spaceId);
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () -> tasks.setChecked(fx.spaceId, otherEvent, taskId, itemId, true, fx.ownerActor()));
  }

  @Test
  void archivedEventRejectsARepeatedCheckAndARepeatedComplete() {
    // API §8 회귀 #23, #41
    Fixture fx = seed("ARCHIVED");
    UUID taskId = doneTask(fx);
    UUID itemId = onlyItem(taskId);
    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.ownerActor()));
    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.ownerActor()));
    assertThat(version(taskId)).isEqualTo(1);
    assertThat(auditCount(fx, "TASK_COMPLETED")).isZero();
  }

  @Test
  void missingChecklistItemIsNotFound() {
    // API §8 회귀 #27
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () ->
            tasks.setChecked(
                fx.spaceId, fx.eventId, taskId, UUID.randomUUID(), true, fx.staffActor()));
  }

  @Test
  void cancelledTaskUsesTaskStateOnlyWhenTheVersionMatches() {
    // API §8 회귀 #31, #40
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "CANCELLED");
    UUID itemId = insertItem(fx, taskId);
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "TASK_CANCELLED",
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor()));
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "TASK_CANCELLED",
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.staffActor()));
    assertReason(
        ErrorCode.TASK_VERSION_CONFLICT,
        null,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 9, fx.staffActor()));
    assertReason(
        ErrorCode.INVALID_TASK_STATE,
        "TASK_CANCELLED",
        () -> tasks.reopen(fx.spaceId, fx.eventId, taskId, 0, fx.staffActor()));
    assertReason(
        ErrorCode.TASK_VERSION_CONFLICT,
        null,
        () -> tasks.reopen(fx.spaceId, fx.eventId, taskId, 9, fx.staffActor()));
    assertThat(taskStatus(taskId)).isEqualTo("CANCELLED");
    assertThat(version(taskId)).isZero();
  }

  @Test
  void staffGrantChecksAnotherOperatorsTask() {
    // API §8 회귀 #17
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    grantTaskWrite(fx, fx.staffId, "GRANT");
    TaskWriteResult result =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.staffActor());
    assertThat(result.outcome()).isEqualTo("UPDATED");
  }

  @Test
  void revokedManagerCannotWriteSomeoneElsesTaskButCanFinishTheirOwn() {
    // API §8 회귀 #18, API 개인별 권한 회귀 #14
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    grantTaskWrite(fx, fx.managerId, "REVOKE");
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.managerActor()));
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    TaskWriteResult own = tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.managerActor());
    assertThat(own.outcome()).isEqualTo("COMPLETED");
  }

  @Test
  void spaceAdminWhoIsNotAnEventOperatorCannotCheck() {
    // API §8 회귀 #19
    Fixture fx = seed("ACTIVE");
    UUID adminId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'admin')", adminId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'ADMIN')",
        fx.spaceId,
        adminId);
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    OperatorActor lyingOwner = new OperatorActor(adminId, "ADMIN", "OWNER");
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, lyingOwner));
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
  }

  @Test
  void ownerTaskWriteRevokeIsIgnored() {
    // API 개인별 권한: OWNER는 override 대상이 아니다
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertTask(fx, "TODO");
    UUID itemId = insertItem(fx, taskId);
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.managerId, taskId);
    grantTaskWrite(fx, fx.ownerId, "REVOKE");
    TaskWriteResult result =
        tasks.setChecked(fx.spaceId, fx.eventId, taskId, itemId, true, fx.ownerActor());
    assertThat(result.outcome()).isEqualTo("UPDATED");
  }

  @Test
  void repeatedAcceptKeepsHandoverEnd() {
    // lifecycle 회귀 #12, #13. API 개인별 권한 회귀 #34
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
    TransferAcceptResult first = transfers.accept(fx.spaceId, transferId, fx.managerId);
    TransferAcceptResult second = transfers.accept(fx.spaceId, transferId, fx.managerId);
    assertThat(first.outcome()).isEqualTo("ACCEPTED");
    assertThat(second.outcome()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(second.handoverEndsAt()).isEqualTo(first.handoverEndsAt());
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
    assertThat(auditCount(fx, "OWNER_TRANSFER_ACCEPTED")).isEqualTo(1);
    String detail = auditDetail(fx, "OWNER_TRANSFER_ACCEPTED");
    assertThat(detail).contains(transferId.toString()).contains("MANAGER").contains("TASK_WRITE");
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
    assertCode(
        ErrorCode.TRANSFER_NOT_PENDING,
        () -> transfers.accept(fx.spaceId, transferId, fx.managerId));
  }

  @Test
  void someoneOtherThanTheRecipientCannotAccept() {
    // 계약 회귀 없음. Q2: 받는 사람이 아니면 404
    Fixture fx = seed("ACTIVE");
    UUID transferId = pendingTransfer(fx, fx.managerId);
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND, () -> transfers.accept(fx.spaceId, transferId, fx.ownerId));
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
    transfers.accept(fx.spaceId, transferId, fx.managerId);
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND, () -> transfers.accept(fx.spaceId, transferId, fx.ownerId));
  }

  @Test
  void recipientWhoIsNotAnActiveMemberCannotAccept() {
    // 계약 회귀 없음. Q3: 403 NOT_A_MEMBER
    Fixture fx = seed("ACTIVE");
    UUID outsider = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'outsider')", outsider);
    UUID transferId = pendingTransfer(fx, outsider);
    assertCode(ErrorCode.NOT_A_MEMBER, () -> transfers.accept(fx.spaceId, transferId, outsider));
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
  }

  @Test
  void acceptInsertsAnOwnerRowWhenTheRecipientHasNone() {
    // 계약 회귀 없음. Q4: OWNER INSERT, recipient_prior_role NULL
    Fixture fx = seed("ACTIVE");
    UUID newbie = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'newbie')", newbie);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        fx.spaceId,
        newbie);
    UUID transferId = pendingTransfer(fx, newbie);
    transfers.accept(fx.spaceId, transferId, newbie);
    String role =
        jdbc.queryForObject(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            String.class,
            fx.eventId,
            newbie);
    String prior =
        jdbc.query(
                "SELECT recipient_prior_role FROM owner_transfers WHERE id = ?",
                (rs, row) -> rs.getString(1),
                transferId)
            .getFirst();
    assertThat(role).isEqualTo("OWNER");
    assertThat(prior).isNull();
  }

  @Test
  void transferFromAnotherSpaceOrWithoutAnEventIsNotFound() {
    // 계약 회귀 없음. X5, X6
    Fixture fx = seed("ACTIVE");
    Fixture other = seed("ACTIVE");
    UUID transferId = pendingTransfer(fx, fx.managerId);
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () -> transfers.accept(other.spaceId, transferId, fx.managerId));
    UUID orgTransfer = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, NULL, ?, ?, 'PENDING')
        """,
        orgTransfer,
        fx.spaceId,
        fx.ownerId,
        fx.managerId);
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () -> transfers.accept(fx.spaceId, orgTransfer, fx.managerId));
  }

  @Test
  void expiredHandoverIsCompletedWhenTheSenderLeaves() {
    // lifecycle 회귀 #15, 만료된 경우
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now() - interval '15 days', now() - interval '1 second')
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
    assertThat(transferStatusOfSender(fx)).isEqualTo("COMPLETED");
  }

  @Test
  void expiredSenderIsNotNotifiedAndDoesNotCountAsAnotherOwner() {
    // X9
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now() - interval '15 days', now() - interval '1 second')
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
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    lifecycle.end(fx.spaceId, fx.eventId, new LifecycleRequest(0, true, null, "연락 두절"), spaceOwner);
    Integer notices =
        jdbc.queryForObject(
            "SELECT count(*) FROM operator_notices WHERE event_id = ? AND recipient_user_id = ?",
            Integer.class,
            fx.eventId,
            fx.ownerId);
    Integer managerNotices =
        jdbc.queryForObject(
            "SELECT count(*) FROM operator_notices WHERE event_id = ? AND recipient_user_id = ?",
            Integer.class,
            fx.eventId,
            fx.managerId);
    assertThat(notices).isZero();
    assertThat(managerNotices).isEqualTo(1);
    assertThat(leave.leavePreview(fx.spaceId, fx.managerId)).isEqualTo(ErrorCode.LAST_OWNER);
  }

  @Test
  void expiredSenderLosesOwnerTaskWriteUnlessTheyAreTheAssignee() {
    // X9 on the task-write role check
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now() - interval '15 days', now() - interval '1 second')
        """,
        UUID.randomUUID(),
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.managerId);
    UUID taskId = insertTask(fx, "TODO");
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.ownerActor()));
    jdbc.update("UPDATE tasks SET assignee_user_id = ? WHERE id = ?", fx.ownerId, taskId);
    assertThat(tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.ownerActor()).outcome())
        .isEqualTo("COMPLETED");
  }

  @Test
  void acceptingTheEventBackRestoresOwnerAuthority() {
    // 현 결정 10/6 D1. 만료된 A→B 뒤 B→A 수락은 A를 다시 유효 OWNER로 본다.
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now() - interval '15 days', now() - interval '1 second')
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
    UUID taskId = insertTask(fx, "TODO");
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.ownerActor()));

    UUID backId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (id, space_id, event_id, from_user_id, to_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        """,
        backId,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);
    assertThat(transfers.accept(fx.spaceId, backId, fx.ownerId).outcome()).isEqualTo("ACCEPTED");
    assertThat(tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.ownerActor()).outcome())
        .isEqualTo("COMPLETED");

    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    lifecycle.end(fx.spaceId, fx.eventId, new LifecycleRequest(0, true, null, "재위임"), spaceOwner);
    Integer notices =
        jdbc.queryForObject(
            "SELECT count(*) FROM operator_notices WHERE event_id = ? AND recipient_user_id = ?",
            Integer.class,
            fx.eventId,
            fx.ownerId);
    assertThat(notices).isEqualTo(1);

    jdbc.update(
        "UPDATE owner_transfers SET handover_ends_at = now() - interval '1 second' WHERE id = ?",
        backId);
    UUID other = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'other-owner')", other);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", fx.spaceId, other);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        fx.spaceId,
        fx.eventId,
        other);
    assertThat(leave.leavePreview(fx.spaceId, other)).isEqualTo(ErrorCode.OWNER_ROLE_HELD);
  }

  @Test
  void archivedEventStillAcceptsAnOwnerTransfer() {
    // API L5, 현 결정 10/6 D5
    Fixture fx = seed("ARCHIVED");
    UUID transferId = pendingTransfer(fx, fx.managerId);
    assertThat(transfers.accept(fx.spaceId, transferId, fx.managerId).outcome())
        .isEqualTo("ACCEPTED");
    assertThat(eventRole(fx, fx.managerId)).isEqualTo("OWNER");
    assertThat(auditCount(fx, "OWNER_TRANSFER_ACCEPTED")).isEqualTo(1);
  }

  @Test
  void archivedAcceptInsertsOwnerWhenTheRecipientWasRemoved() {
    // 현 결정 10/6 D5. 제거된 회원의 수락은 OWNER 행을 만든다.
    Fixture fx = seed("ARCHIVED");
    jdbc.update(
        "DELETE FROM event_users WHERE event_id = ? AND user_id = ?", fx.eventId, fx.managerId);
    UUID transferId = pendingTransfer(fx, fx.managerId);
    assertThat(transfers.accept(fx.spaceId, transferId, fx.managerId).outcome())
        .isEqualTo("ACCEPTED");
    assertThat(eventRole(fx, fx.managerId)).isEqualTo("OWNER");
    assertThat(priorRole(transferId)).isNull();
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
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'HANDOVER', now(), now() + interval '14 days')
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
  void leavingUnassignsDoneAndCancelledTasks() {
    // API §8 회귀 #36, #37, #39. 이탈은 TODO/DOING을 RESPONSIBILITY로 막으므로
    // DONE·CANCELLED만 둔다. 해제 SQL에는 상태 조건이 없다(제안).
    Fixture fx = seed("ACTIVE");
    UUID done = insertAssignedTask(fx, fx.eventId, fx.managerId, "DONE");
    UUID cancelled = insertAssignedTask(fx, fx.eventId, fx.managerId, "CANCELLED");
    UUID itemId = insertItem(fx, done);
    jdbc.update(
        """
        UPDATE task_checklist_items
        SET checked = true, checked_by_user_id = ?, checked_at = now()
        WHERE id = ?
        """,
        fx.managerId,
        itemId);
    jdbc.update(
        """
        UPDATE tasks SET completed_by_user_id = ?, completed_at = now() WHERE id = ?
        """,
        fx.managerId,
        done);
    UUID stillAssigned = insertAssignedTask(fx, fx.eventId, fx.staffId, "TODO");

    leave.leave(fx.spaceId, fx.managerId, List.of());

    assertThat(assigneeOf(done)).isNull();
    assertThat(assigneeOf(cancelled)).isNull();
    assertThat(version(done)).isEqualTo(1);
    assertThat(version(cancelled)).isEqualTo(1);
    assertThat(assigneeOf(stillAssigned)).isEqualTo(fx.staffId);
    assertThat(version(stillAssigned)).isZero();
    assertThat(taskStatus(done)).isEqualTo("DONE");
    assertThat(taskStatus(cancelled)).isEqualTo("CANCELLED");
    assertThat(itemChecked(itemId)).isTrue();
    assertThat(checkedBy(itemId)).isEqualTo(fx.managerId);
    assertThat(checkedAt(itemId)).isNotNull();
    assertThat(completedBy(done)).isEqualTo(fx.managerId);
    assertThat(completedAt(done)).isNotNull();
    assertThat(auditCount(fx, "TASK_ASSIGNEE_CLEARED")).isEqualTo(2);
    assertThat(auditDetail(fx, "TASK_ASSIGNEE_CLEARED").replace(" ", ""))
        .contains(fx.managerId.toString(), "이탈", "\"version\":1");
    assertThat(auditActors(fx, "TASK_ASSIGNEE_CLEARED")).containsOnly(fx.managerId);
    assertThat(auditActors(fx, "EVENT_ACCESS_REVOKED")).containsExactly(fx.managerId);
    assertThat(count(fx, "tasks")).isEqualTo(3);
    assertThat(count(fx, "task_checklist_items")).isEqualTo(1);

    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'MANAGER')",
        fx.spaceId,
        fx.eventId,
        fx.managerId);
    assertThat(assigneeOf(done)).isNull();
    assertThat(assigneeOf(cancelled)).isNull();
  }

  @Test
  void unassignedTaskAfterLeaveFollowsTaskWrite() {
    // API §8 회귀 #38. 이탈은 TODO를 RESPONSIBILITY로 막으므로 체크는 미배정 TODO로 한다.
    Fixture fx = seed("ACTIVE");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        fx.spaceId,
        fx.staffId);
    insertAssignedTask(fx, fx.eventId, fx.staffId, "DONE");
    leave.leave(fx.spaceId, fx.staffId, List.of());
    UUID todo = insertUnassignedTask(fx);
    UUID itemId = insertItem(fx, todo);
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> tasks.setChecked(fx.spaceId, fx.eventId, todo, itemId, true, fx.staffActor()));
    assertThat(
            tasks
                .setChecked(fx.spaceId, fx.eventId, todo, itemId, true, fx.managerActor())
                .outcome())
        .isEqualTo("UPDATED");
    assertThat(version(todo)).isEqualTo(1);
    assertThat(taskStatus(todo)).isEqualTo("DOING");
  }

  @Test
  void leavingKeepsTasksAndOverridesOnTheChosenEvent() {
    Fixture fx = seed("ACTIVE");
    UUID kept = addEvent(fx);
    UUID droppedTask = insertAssignedTask(fx, fx.eventId, fx.managerId, "DONE");
    UUID keptTask = insertAssignedTask(fx, kept, fx.managerId, "DONE");
    grantTaskWrite(fx, fx.managerId, "GRANT");
    grantOn(fx, kept, fx.managerId, "REVOKE");

    leave.leave(fx.spaceId, fx.managerId, List.of(kept));

    assertThat(assigneeOf(droppedTask)).isNull();
    assertThat(assigneeOf(keptTask)).isEqualTo(fx.managerId);
    assertThat(operatorCount(fx.eventId, fx.managerId)).isZero();
    assertThat(operatorCount(kept, fx.managerId)).isEqualTo(1);
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(overrideCount(kept, fx.managerId)).isEqualTo(1);
    assertThat(auditCount(fx, "TASK_ASSIGNEE_CLEARED")).isEqualTo(1);
    assertThat(auditCount(fx, "EVENT_ACCESS_REVOKED")).isEqualTo(1);
    assertThat(auditCountOn(kept, "TASK_ASSIGNEE_CLEARED")).isZero();
    assertThat(auditCountOn(kept, "EVENT_ACCESS_REVOKED")).isZero();
  }

  @Test
  void leavingRecordsDeletedOverrides() {
    // API 개인별 권한 회귀 #6, #19. DELETE /operators는 아직 없어 이탈로 회수한다.
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertAssignedTask(fx, fx.eventId, fx.staffId, "TODO");
    grantTaskWrite(fx, fx.managerId, "REVOKE");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'FINANCE_READ', 'GRANT', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);

    leave.leave(fx.spaceId, fx.managerId, List.of());

    assertThat(operatorCount(fx.eventId, fx.managerId)).isZero();
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(auditCount(fx, "EVENT_ACCESS_REVOKED")).isEqualTo(1);
    String detail = auditDetail(fx, "EVENT_ACCESS_REVOKED");
    assertThat(detail).contains(fx.managerId.toString(), "TASK_WRITE", "FINANCE_READ");
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'MANAGER')",
        fx.spaceId,
        fx.eventId,
        fx.managerId);
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(tasks.complete(fx.spaceId, fx.eventId, taskId, 0, fx.managerActor()).outcome())
        .isEqualTo("COMPLETED");
  }

  @Test
  void handoverLeaveUnassignsTheOutgoingOwner() {
    Fixture fx = seed("ACTIVE");
    UUID taskId = insertAssignedTask(fx, fx.eventId, fx.ownerId, "CANCELLED");
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

    assertThat(assigneeOf(taskId)).isNull();
    assertThat(operatorCount(fx.eventId, fx.ownerId)).isZero();
    assertThat(transferStatusOfSender(fx)).isEqualTo("COMPLETED");
    assertThat(auditCount(fx, "TASK_ASSIGNEE_CLEARED")).isEqualTo(1);
    assertThat(auditDetail(fx, "EVENT_ACCESS_REVOKED").replace(" ", ""))
        .contains("\"deletedOverrides\":[]");
  }

  @Test
  void assigneeWhoIsNotAnOperatorIsRejected() {
    Fixture fx = seed("ACTIVE");
    UUID outsider = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'outsider')", outsider);
    assertThatThrownBy(() -> insertAssignedTask(fx, fx.eventId, outsider, "TODO"))
        .isInstanceOf(DataIntegrityViolationException.class);
    Fixture other = seed("ACTIVE");
    assertThatThrownBy(() -> insertAssignedTask(fx, fx.eventId, other.managerId, "TODO"))
        .isInstanceOf(DataIntegrityViolationException.class);
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
    String activateReason =
        jdbc.queryForObject(
            """
            SELECT reason FROM event_lifecycle_transitions
            WHERE event_id = ? AND command = 'ACTIVATE'
            """,
            String.class,
            fx.eventId);
    String endReason =
        jdbc.queryForObject(
            """
            SELECT reason FROM event_lifecycle_transitions
            WHERE event_id = ? AND command = 'END'
            """,
            String.class,
            fx.eventId);
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
    assertThat(activateReason).isEqualTo("준비를 마쳤다");
    assertThat(endReason).isEqualTo("행사를 끝낸다");
    assertThat(activate).contains("SPACE_OWNER_OVERRIDE").contains("준비를 마쳤다");
    assertThat(end).contains("SPACE_OWNER_OVERRIDE").contains("행사를 끝낸다");
    assertThat(auditActors(fx, "EVENT_ACTIVATE")).containsExactly(fx.spaceOwnerId);
    assertThat(auditActors(fx, "EVENT_END")).containsExactly(fx.spaceOwnerId);
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

  @Test
  void blankOverrideReasonIsRejectedWhenItWasSent() {
    // 현 결정 10/6 D3. 대행 경로의 공백은 authorize의 403이 먼저다.
    Fixture fx = seed("ACTIVE");
    OperatorActor spaceOwner = new OperatorActor(fx.spaceOwnerId, "OWNER", null);
    LifecycleRequest blank = new LifecycleRequest(0, true, null, " ");
    assertField(() -> lifecycle.end(fx.spaceId, fx.eventId, blank, fx.ownerActor()));
    assertField(() -> lifecycle.archive(fx.spaceId, fx.eventId, blank, fx.ownerActor()));
    assertField(() -> lifecycle.archive(fx.spaceId, fx.eventId, blank, spaceOwner));
    assertCode(
        ErrorCode.OVERRIDE_REQUIRED,
        () -> lifecycle.end(fx.spaceId, fx.eventId, blank, spaceOwner));
    assertThat(status(fx)).isEqualTo("ACTIVE");
    assertThat(count(fx, "event_lifecycle_transitions")).isZero();
    assertThat(count(fx, "audit_logs")).isZero();
  }

  private static void assertCode(ErrorCode code, Throwing call) {
    assertReason(code, null, call);
  }

  private static void assertReason(ErrorCode code, String reason, Throwing call) {
    assertThatThrownBy(call::run)
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(code);
              if (reason == null) {
                assertThat(scene.details()).doesNotContainKey("reason");
              } else {
                assertThat(scene.details()).containsEntry("reason", reason);
              }
            });
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
    return insertAssignedTask(fx, fx.eventId, fx.staffId, status);
  }

  private UUID insertAssignedTask(Fixture fx, UUID eventId, UUID assignee, String status) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, 'task', ?, ?)
        """,
        taskId,
        fx.spaceId,
        eventId,
        status,
        assignee);
    return taskId;
  }

  private UUID insertUnassignedTask(Fixture fx) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status)
        VALUES (?, ?, ?, 'task', 'TODO')
        """,
        taskId,
        fx.spaceId,
        fx.eventId);
    return taskId;
  }

  private UUID addEvent(Fixture fx) {
    UUID eventId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'kept', 'ACTIVE', 0)
        """,
        eventId,
        fx.spaceId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'MANAGER')",
        fx.spaceId,
        eventId,
        fx.managerId);
    return eventId;
  }

  private UUID insertItem(Fixture fx, UUID taskId) {
    return insertItem(fx, taskId, 0);
  }

  private UUID insertItem(Fixture fx, UUID taskId, int position) {
    UUID itemId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO task_checklist_items (id, space_id, event_id, task_id, label, position)
        VALUES (?, ?, ?, ?, 'item', ?)
        """,
        itemId,
        fx.spaceId,
        fx.eventId,
        taskId,
        position);
    return itemId;
  }

  private String status(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?", String.class, fx.eventId);
  }

  private String taskStatus(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private int version(UUID taskId) {
    return jdbc.queryForObject("SELECT version FROM tasks WHERE id = ?", Integer.class, taskId);
  }

  private UUID assigneeOf(UUID taskId) {
    return jdbc.query(
            "SELECT assignee_user_id FROM tasks WHERE id = ?",
            (rs, row) -> rs.getObject(1, UUID.class),
            taskId)
        .getFirst();
  }

  private Instant completedAt(UUID taskId) {
    return jdbc.query(
            "SELECT completed_at FROM tasks WHERE id = ?",
            (rs, row) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(),
            taskId)
        .getFirst();
  }

  private UUID completedBy(UUID taskId) {
    return jdbc.query(
            "SELECT completed_by_user_id FROM tasks WHERE id = ?",
            (rs, row) -> rs.getObject(1, UUID.class),
            taskId)
        .getFirst();
  }

  private UUID checkedBy(UUID itemId) {
    return jdbc.query(
            "SELECT checked_by_user_id FROM task_checklist_items WHERE id = ?",
            (rs, row) -> rs.getObject(1, UUID.class),
            itemId)
        .getFirst();
  }

  private Instant checkedAt(UUID itemId) {
    return jdbc.query(
            "SELECT checked_at FROM task_checklist_items WHERE id = ?",
            (rs, row) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(),
            itemId)
        .getFirst();
  }

  private boolean itemChecked(UUID itemId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT checked FROM task_checklist_items WHERE id = ?", Boolean.class, itemId));
  }

  private List<UUID> auditActors(Fixture fx, String action) {
    return jdbc.query(
        "SELECT actor_user_id FROM audit_logs WHERE event_id = ? AND action = ?",
        (rs, row) -> rs.getObject(1, UUID.class),
        fx.eventId,
        action);
  }

  private int auditCount(Fixture fx, String action) {
    return auditCountOn(fx.eventId, action);
  }

  private int auditCountOn(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private int operatorCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_users WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private int overrideCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private String auditDetail(Fixture fx, String action) {
    return jdbc.queryForObject(
        """
        SELECT detail::text FROM audit_logs
        WHERE event_id = ? AND action = ?
        ORDER BY occurred_at DESC
        LIMIT 1
        """,
        String.class,
        fx.eventId,
        action);
  }

  private UUID doneTask(Fixture fx) {
    UUID taskId = insertTask(fx, "DONE");
    UUID itemId = insertItem(fx, taskId);
    jdbc.update(
        """
        UPDATE task_checklist_items
        SET checked = true, checked_by_user_id = ?, checked_at = now()
        WHERE id = ?
        """,
        fx.staffId,
        itemId);
    jdbc.update(
        """
        UPDATE tasks
        SET version = 1, completed_by_user_id = ?, completed_at = now()
        WHERE id = ?
        """,
        fx.staffId,
        taskId);
    return taskId;
  }

  private void grantTaskWrite(Fixture fx, UUID userId, String effect) {
    grantOn(fx, fx.eventId, userId, effect);
  }

  private void grantOn(Fixture fx, UUID eventId, UUID userId, String effect) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'TASK_WRITE', ?, ?, now())
        """,
        fx.spaceId,
        eventId,
        userId,
        effect,
        fx.ownerId);
  }

  private UUID onlyItem(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT id FROM task_checklist_items WHERE task_id = ?", UUID.class, taskId);
  }

  private UUID pendingTransfer(Fixture fx, UUID toUserId) {
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
        toUserId);
    return transferId;
  }

  private String eventRole(Fixture fx, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
        fx.eventId,
        userId);
  }

  private String priorRole(UUID transferId) {
    return jdbc.query(
            "SELECT recipient_prior_role FROM owner_transfers WHERE id = ?",
            (rs, row) -> rs.getString(1),
            transferId)
        .getFirst();
  }

  private String transferStatus(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT status FROM owner_transfers WHERE id = ?", String.class, transferId);
  }

  private String transferStatusOfSender(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT status FROM owner_transfers WHERE event_id = ? AND from_user_id = ?",
        String.class,
        fx.eventId,
        fx.ownerId);
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
