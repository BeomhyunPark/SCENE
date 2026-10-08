package app.scene.event.transfer.param;

import java.time.Instant;

/** Query values bound into one MyBatis statement. */
public final class TransferDueQuery {

  private final Instant now;
  private final String handoverStatus;

  private TransferDueQuery(Instant now, String handoverStatus) {
    this.now = now;
    this.handoverStatus = handoverStatus;
  }

  public static TransferDueQuery of(Instant now, String handoverStatus) {
    return new TransferDueQuery(now, handoverStatus);
  }

  public Instant getNow() {
    return now;
  }

  public String getHandoverStatus() {
    return handoverStatus;
  }
}
