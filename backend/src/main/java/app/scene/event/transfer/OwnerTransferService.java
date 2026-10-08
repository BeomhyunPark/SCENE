package app.scene.event.transfer;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import app.scene.space.MemberRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Event owner handover. Accept, request, decline, and cancel stay on this service. {@code
 * completeDue} stores a due handover as COMPLETED and sets that sender's role to STAFF. A repeated
 * accept keeps the original end time (DEC-063). No completion route and no scheduler. Decline
 * stores {@code DECLINED}. Request, decline, and cancel write no audit: the contract names an
 * action only for accept.
 */
@Service
public class OwnerTransferService {

  static final String ACCEPTED = "ACCEPTED";
  static final String ALREADY_ACCEPTED = "ALREADY_ACCEPTED";
  static final String AUDIT_ACTION = "OWNER_TRANSFER_ACCEPTED";

  private static final String PENDING = "PENDING";
  private static final String HANDOVER = "HANDOVER";
  private static final String DECLINED = "DECLINED";
  private static final String CANCELLED = "CANCELLED";
  private static final String COMPLETED = "COMPLETED";
  private static final String OWNER = "OWNER";
  private static final String STAFF = "STAFF";

  private final OwnerTransferRepository transfers;
  private final MemberRepository members;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public OwnerTransferService(
      OwnerTransferRepository transfers,
      MemberRepository members,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.transfers = transfers;
    this.members = members;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  /**
   * Opens one {@code PENDING} row. The recipient's role and overrides stay as they are. A second
   * pending row from the same sender fails on {@code owner_transfers_one_pending}.
   */
  @Transactional
  public UUID request(UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId) {
    if (members.countActive(spaceId, toUserId) == 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "toUserId"));
    }
    UUID transferId = UUID.randomUUID();
    transfers.insertPending(transferId, spaceId, eventId, fromUserId, toUserId);
    return transferId;
  }

  @Transactional
  public TransferAcceptResult accept(UUID spaceId, UUID transferId, UUID actorUserId) {
    TransferRow row =
        transfers
            .findForUpdate(spaceId, transferId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!actorUserId.equals(row.toUserId())) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (HANDOVER.equals(row.status())) {
      return new TransferAcceptResult(ALREADY_ACCEPTED, row.handoverEndsAt());
    }
    if (DECLINED.equals(row.status()) || CANCELLED.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if (COMPLETED.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_COMPLETED);
    }
    if (members.countActive(spaceId, actorUserId) == 0) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    String prior =
        eventUsers.findRoleForUpdate(spaceId, row.eventId(), row.toUserId()).orElse(null);
    String snapshot = permissions.findSnapshot(spaceId, row.eventId(), row.toUserId());
    Instant acceptedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
    Instant endsAt = acceptedAt.plus(Duration.ofDays(14));
    if (transfers.updateAccepted(spaceId, transferId, prior, acceptedAt, endsAt, snapshot) != 1) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    permissions.delete(spaceId, row.eventId(), row.toUserId());
    if (eventUsers.updateOwner(spaceId, row.eventId(), row.toUserId()) == 0
        && eventUsers.saveOwner(spaceId, row.eventId(), row.toUserId()) != 1) {
      throw new IllegalStateException("recipient was not stored as event owner");
    }
    auditLogs.save(
        spaceId,
        row.eventId(),
        actorUserId,
        AUDIT_ACTION,
        auditDetail(transferId, row.toUserId(), prior, snapshot),
        acceptedAt);
    return new TransferAcceptResult(ACCEPTED, endsAt);
  }

  /**
   * Stores COMPLETED for each event HANDOVER whose {@code handoverEndsAt} is at or before {@code
   * now}, deletes that sender's overrides, and sets the sender's role on that event to STAFF. A
   * missing sender row stays missing and writes no role audit. A later row, and PENDING, DECLINED,
   * or CANCELLED, stay as stored. A second call finds nothing left to complete. Leave does not call
   * this.
   */
  @Transactional
  public void completeDue(Instant now) {
    Objects.requireNonNull(now, "now");
    for (DueTransfer row : transfers.findDueForUpdate(now)) {
      if (transfers.updateCompleted(row.spaceId(), row.id()) != 1) {
        continue;
      }
      String current =
          eventUsers.findRoleForUpdate(row.spaceId(), row.eventId(), row.fromUserId()).orElse(null);
      String snapshot = permissions.findSnapshot(row.spaceId(), row.eventId(), row.fromUserId());
      permissions.delete(row.spaceId(), row.eventId(), row.fromUserId());
      if (current == null || STAFF.equals(current)) {
        continue;
      }
      if (eventUsers.updateRole(row.spaceId(), row.eventId(), row.fromUserId(), STAFF) != 1) {
        throw new IllegalStateException("sender role was not stored as STAFF");
      }
      if (!OWNER.equals(current)) {
        continue;
      }
      auditLogs.save(
          row.spaceId(),
          row.eventId(),
          row.fromUserId(),
          AuditActions.EVENT_USER_ROLE_CHANGED,
          senderRoleDetail(row.id(), row.fromUserId(), snapshot),
          now);
    }
  }

  /** Recipient only, and only while {@code PENDING}. Stores {@code DECLINED}. */
  @Transactional
  public void decline(UUID spaceId, UUID transferId, UUID actorUserId) {
    TransferRow row = locked(spaceId, transferId);
    if (!actorUserId.equals(row.toUserId())) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (DECLINED.equals(row.status())
        || CANCELLED.equals(row.status())
        || HANDOVER.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if (COMPLETED.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_COMPLETED);
    }
    if (transfers.updateStatus(spaceId, transferId, DECLINED, PENDING) != 1) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
  }

  /**
   * Pending cancel is the sender. Handover cancel is the sender or the recipient, and puts the
   * recipient's prior role and stored overrides back in this transaction. Task rows are not
   * changed. A stored {@code COMPLETED} is not derived from {@code handover_ends_at}.
   */
  @Transactional
  public void cancel(UUID spaceId, UUID transferId, UUID actorUserId) {
    TransferRow row = locked(spaceId, transferId);
    boolean sender = actorUserId.equals(row.fromUserId());
    boolean recipient = actorUserId.equals(row.toUserId());
    if (!sender && !recipient) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (DECLINED.equals(row.status()) || CANCELLED.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if (COMPLETED.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_COMPLETED);
    }
    if (PENDING.equals(row.status())) {
      if (!sender) {
        throw new SceneException(ErrorCode.FORBIDDEN);
      }
      if (transfers.updateStatus(spaceId, transferId, CANCELLED, PENDING) != 1) {
        throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
      }
      return;
    }
    if (!HANDOVER.equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if (transfers.updateStatus(spaceId, transferId, CANCELLED, HANDOVER) != 1) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    restoreRecipient(spaceId, row);
  }

  private TransferRow locked(UUID spaceId, UUID transferId) {
    return transfers
        .findForUpdate(spaceId, transferId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private void restoreRecipient(UUID spaceId, TransferRow row) {
    UUID eventId = row.eventId();
    UUID userId = row.toUserId();
    eventUsers.findRoleForUpdate(spaceId, eventId, userId);
    String prior = row.recipientPriorRole();
    if (prior == null) {
      eventUsers.delete(spaceId, eventId, userId);
      return;
    }
    if (eventUsers.updateRole(spaceId, eventId, userId, prior) == 0) {
      eventUsers.save(spaceId, eventId, userId, prior);
    }
    permissions.delete(spaceId, eventId, userId);
    transfers.restoreOverrides(spaceId, eventId, userId, snapshotOrEmpty(row.permissionSnapshot()));
  }

  private static String snapshotOrEmpty(String snapshot) {
    if (snapshot == null || snapshot.isBlank()) {
      return "[]";
    }
    return snapshot;
  }

  private String senderRoleDetail(UUID transferId, UUID userId, String snapshot) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("transferId", transferId);
    detail.put("userId", userId);
    detail.put("fromRole", OWNER);
    detail.put("toRole", STAFF);
    detail.put("deletedOverrides", json.readTree(snapshot));
    return json.writeValueAsString(detail);
  }

  private String auditDetail(UUID transferId, UUID toUserId, String priorRole, String snapshot) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("transferId", transferId);
    detail.put("toUserId", toUserId);
    detail.put("recipientPriorRole", priorRole);
    detail.put("deletedOverrides", json.readTree(snapshot));
    return json.writeValueAsString(detail);
  }
}
