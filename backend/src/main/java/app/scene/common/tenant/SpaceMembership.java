package app.scene.common.tenant;

/**
 * Space-path membership for one caller. A kept event operator row does not make this active.
 * Archive and unarchive are a space owner's own lifecycle authority. End, resume, and activate are
 * an override and need a reason on the lifecycle command. No space role may change event operators
 * or their overrides. An active space owner may read those rows. A space admin may not.
 */
public record SpaceMembership(Kind kind, String role) {

  public enum Kind {
    ABSENT,
    ENDED,
    ACTIVE
  }

  public static SpaceMembership absent() {
    return new SpaceMembership(Kind.ABSENT, null);
  }

  public static SpaceMembership ended() {
    return new SpaceMembership(Kind.ENDED, null);
  }

  public static SpaceMembership active(String role) {
    return new SpaceMembership(Kind.ACTIVE, role);
  }

  public boolean mayReadEventPermissions() {
    return kind == Kind.ACTIVE && "OWNER".equals(role);
  }

  public boolean mayChangeEventOperators() {
    return false;
  }
}
