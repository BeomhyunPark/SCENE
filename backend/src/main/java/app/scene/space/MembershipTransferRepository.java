package app.scene.space;

import app.scene.space.mapper.MembershipTransferMapper;
import app.scene.space.param.TransferCompleteUpdate;
import app.scene.space.param.TransferStatusQuery;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Handover rows read and finished while a member leaves. Accept stays on the transfer module. */
@Component
public class MembershipTransferRepository {

  private static final String PENDING = "PENDING";
  private static final String HANDOVER = "HANDOVER";
  private static final String COMPLETED = "COMPLETED";

  private final MembershipTransferMapper transfers;

  public MembershipTransferRepository(MembershipTransferMapper transfers) {
    this.transfers = transfers;
  }

  public int countPendingFrom(UUID spaceId, UUID userId) {
    return transfers.countPendingFrom(TransferStatusQuery.of(spaceId, userId, PENDING));
  }

  @Transactional
  public int updateCompleted(UUID spaceId, UUID eventId, UUID userId) {
    return transfers.updateCompleted(
        TransferCompleteUpdate.of(spaceId, eventId, userId, COMPLETED, HANDOVER));
  }
}
