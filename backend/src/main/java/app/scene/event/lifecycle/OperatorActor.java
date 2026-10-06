package app.scene.event.lifecycle;

import java.util.UUID;

/**
 * Caller already resolved by the future session layer. {@code spaceRole} and {@code eventRole} are
 * null when the person has no row there. The session layer must set {@code eventRole} with the
 * effective-owner predicate: role OWNER, and no HANDOVER or COMPLETED transfer for this user as
 * {@code from_user_id} whose {@code handover_ends_at} is at or before now.
 */
public record OperatorActor(UUID userId, String spaceRole, String eventRole) {

  public boolean eventOwner() {
    return "OWNER".equals(eventRole);
  }

  public boolean spaceOwner() {
    return "OWNER".equals(spaceRole);
  }
}
