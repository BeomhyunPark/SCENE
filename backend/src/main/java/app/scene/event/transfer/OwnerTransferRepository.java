package app.scene.event.transfer;

import app.scene.event.transfer.mapper.OwnerTransferMapper;
import app.scene.event.transfer.param.TransferAcceptUpdate;
import app.scene.event.transfer.param.TransferId;
import app.scene.event.transfer.param.TransferInsert;
import app.scene.event.transfer.param.TransferLockKey;
import app.scene.event.transfer.param.TransferSnapshotRestore;
import app.scene.event.transfer.param.TransferStatusUpdate;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OwnerTransferRepository {

  private static final String HANDOVER = "HANDOVER";
  private static final String PENDING = "PENDING";

  private final OwnerTransferMapper transfers;

  public OwnerTransferRepository(OwnerTransferMapper transfers) {
    this.transfers = transfers;
  }

  public Optional<TransferRow> findEvent(UUID transferId) {
    return Optional.ofNullable(transfers.findEventById(TransferId.of(transferId)));
  }

  public Optional<TransferRow> findForUpdate(UUID spaceId, UUID transferId) {
    return Optional.ofNullable(transfers.findForUpdate(TransferLockKey.of(spaceId, transferId)));
  }

  public Optional<TransferView> findView(UUID spaceId, UUID transferId) {
    return Optional.ofNullable(transfers.findView(TransferLockKey.of(spaceId, transferId)));
  }

  @Transactional
  public int insertPending(
      UUID transferId, UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId) {
    return transfers.insertPending(
        TransferInsert.of(transferId, spaceId, eventId, fromUserId, toUserId));
  }

  @Transactional
  public int updateAccepted(
      UUID spaceId,
      UUID transferId,
      String priorRole,
      Instant acceptedAt,
      Instant endsAt,
      String snapshot) {
    return transfers.updateAccepted(
        TransferAcceptUpdate.of(
            spaceId, transferId, priorRole, acceptedAt, endsAt, snapshot, HANDOVER, PENDING));
  }

  @Transactional
  public int updateStatus(UUID spaceId, UUID transferId, String status, String expectedStatus) {
    return transfers.updateStatus(
        TransferStatusUpdate.of(spaceId, transferId, status, expectedStatus));
  }

  @Transactional
  public int restoreOverrides(UUID spaceId, UUID eventId, UUID userId, String snapshot) {
    return transfers.restoreOverrides(
        TransferSnapshotRestore.of(spaceId, eventId, userId, snapshot));
  }
}
