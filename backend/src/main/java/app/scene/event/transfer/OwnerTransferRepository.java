package app.scene.event.transfer;

import app.scene.event.transfer.mapper.OwnerTransferMapper;
import app.scene.event.transfer.param.TransferAcceptUpdate;
import app.scene.event.transfer.param.TransferCompletion;
import app.scene.event.transfer.param.TransferDueQuery;
import app.scene.event.transfer.param.TransferLockKey;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OwnerTransferRepository {

  private static final String HANDOVER = "HANDOVER";
  private static final String PENDING = "PENDING";
  private static final String COMPLETED = "COMPLETED";

  private final OwnerTransferMapper transfers;

  public OwnerTransferRepository(OwnerTransferMapper transfers) {
    this.transfers = transfers;
  }

  public Optional<TransferRow> findForUpdate(UUID spaceId, UUID transferId) {
    return Optional.ofNullable(transfers.findForUpdate(TransferLockKey.of(spaceId, transferId)));
  }

  public List<DueTransfer> findDueForUpdate(Instant now) {
    return transfers.findDueForUpdate(TransferDueQuery.of(now, HANDOVER));
  }

  @Transactional
  public int updateCompleted(UUID spaceId, UUID transferId) {
    return transfers.updateCompleted(
        TransferCompletion.of(spaceId, transferId, COMPLETED, HANDOVER));
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
}
