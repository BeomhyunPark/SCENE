package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * A participant whose latest revision is {@code WITHDRAWN} (DEC-084 §9), flat for MyBatis. The
 * withdrawal columns are null for a withdraw stored before the history table. {@code
 * previousGroupId} is the group the withdraw removed, when that group still exists.
 */
public record WithdrawnRow(
    UUID applicationId,
    UUID participantId,
    String name,
    Instant submittedAt,
    Instant withdrawnAt,
    String withdrawnByDisplayName,
    String reason,
    boolean reapplyBlocked,
    UUID previousGroupId,
    String previousGroupName,
    Instant checkedInAt) {

  ApplicationWithdrawal withdrawal() {
    return new ApplicationWithdrawal(withdrawnAt, withdrawnByDisplayName, reason, reapplyBlocked);
  }

  PreviousGroup previousGroup() {
    return previousGroupId == null ? null : new PreviousGroup(previousGroupId, previousGroupName);
  }

  /** The group a withdraw removed, shown as a reference only (DEC-044). */
  public record PreviousGroup(UUID groupId, String name) {}
}
