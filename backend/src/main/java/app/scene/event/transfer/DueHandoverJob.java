package app.scene.event.transfer;

import java.time.Clock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Calls {@link OwnerTransferService#completeDue} on the application clock. The next run starts 60
 * seconds after the previous one finishes. There is no route. A failure is not caught, so the row
 * stays {@code HANDOVER} for the next run.
 */
@Component
public class DueHandoverJob {

  static final long DELAY_MILLIS = 60_000;

  private final OwnerTransferService transfers;
  private final Clock clock;

  public DueHandoverJob(OwnerTransferService transfers, Clock clock) {
    this.transfers = transfers;
    this.clock = clock;
  }

  @Scheduled(fixedDelay = DELAY_MILLIS)
  public void completeDueHandovers() {
    transfers.completeDue(clock.instant());
  }
}
