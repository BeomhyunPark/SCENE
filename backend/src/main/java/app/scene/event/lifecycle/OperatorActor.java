package app.scene.event.lifecycle;

import java.util.UUID;

/**
 * Caller already resolved by the future session layer. {@code spaceRole} and {@code eventRole} are
 * null when the person has no row there.
 */
public record OperatorActor(UUID userId, String spaceRole, String eventRole) {

  public boolean eventOwner() {
    return "OWNER".equals(eventRole);
  }

  public boolean spaceOwner() {
    return "OWNER".equals(spaceRole);
  }
}
