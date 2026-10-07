package app.scene.event.transfer.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TransferId {

  private final UUID id;

  private TransferId(UUID id) {
    this.id = id;
  }

  public static TransferId of(UUID id) {
    return new TransferId(id);
  }

  public UUID getId() {
    return id;
  }
}
