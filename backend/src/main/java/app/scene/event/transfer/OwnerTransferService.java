package app.scene.event.transfer;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Accepts an event-owner handover. A repeated accept keeps the original end time (DEC-063). */
@Service
public class OwnerTransferService {

  private final OwnerTransferMapper mapper;
  private final Clock clock;

  public OwnerTransferService(OwnerTransferMapper mapper, Clock clock) {
    this.mapper = mapper;
    this.clock = clock;
  }

  @Transactional
  public Instant accept(UUID transferId) {
    TransferRow row = mapper.lock(transferId);
    if (row == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if ("HANDOVER".equals(row.status())) {
      return row.handoverEndsAt();
    }
    if ("DECLINED".equals(row.status()) || "CANCELLED".equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    if ("COMPLETED".equals(row.status())) {
      throw new SceneException(ErrorCode.TRANSFER_COMPLETED);
    }
    Instant acceptedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
    Instant endsAt = acceptedAt.plus(java.time.Duration.ofDays(14));
    String prior = mapper.eventRole(row.eventId(), row.toUserId());
    String snapshot = mapper.permissionSnapshot(row.eventId(), row.toUserId());
    if (mapper.accept(transferId, prior, acceptedAt, endsAt, snapshot) != 1) {
      throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
    }
    mapper.deleteOverrides(row.eventId(), row.toUserId());
    mapper.makeOwner(row.eventId(), row.toUserId());
    return endsAt;
  }
}
