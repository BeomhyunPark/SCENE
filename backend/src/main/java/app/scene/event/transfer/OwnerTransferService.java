package app.scene.event.transfer;

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
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** Accepts an event-owner handover. A repeated accept keeps the original end time (DEC-063). */
@Service
public class OwnerTransferService {

  static final String ACCEPTED = "ACCEPTED";
  static final String ALREADY_ACCEPTED = "ALREADY_ACCEPTED";
  static final String AUDIT_ACTION = "OWNER_TRANSFER_ACCEPTED";

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

  @Transactional
  public TransferAcceptResult accept(UUID spaceId, UUID transferId, UUID actorUserId) {
    TransferRow row =
        transfers
            .findForUpdate(spaceId, transferId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!actorUserId.equals(row.toUserId())) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if ("HANDOVER".equals(row.status())) {
      return new TransferAcceptResult(ALREADY_ACCEPTED, row.handoverEndsAt());
    }
    if ("DECLINED".equals(row.status()) || "CANCELLED".equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if ("COMPLETED".equals(row.status())) {
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

  private String auditDetail(UUID transferId, UUID toUserId, String priorRole, String snapshot) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("transferId", transferId);
    detail.put("toUserId", toUserId);
    detail.put("recipientPriorRole", priorRole);
    detail.put("deletedOverrides", json.readTree(snapshot));
    return json.writeValueAsString(detail);
  }
}
