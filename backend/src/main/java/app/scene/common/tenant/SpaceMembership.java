package app.scene.common.tenant;

/**
 * Space-path membership for one caller. A kept event operator row does not make this active.
 * Archive and unarchive are a space owner's own lifecycle authority. End, resume, and activate are
 * an override and need a reason on the lifecycle command. No space role may change event operators
 * or their overrides. An active space owner may read those rows. A space admin may not.
 */
public record SpaceMembership(Kind kind, String role) {

  public static final String OWNER = "OWNER";
  public static final String ADMIN = "ADMIN";

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

  /** Active space owner only. A space admin may not read event operator rows. */
  public boolean mayReadEventPermissions() {
    return activeOwner();
  }

  /** Active space owner or admin: reads every event in the space without an operator row. */
  public boolean seesEveryEvent() {
    return activeOwnerOrAdmin();
  }

  /** Active space owner or admin may create an event; a member may not (DEC-077). */
  public boolean mayCreateEvents() {
    return activeOwnerOrAdmin();
  }

  /** Active space owner or admin may send a space invitation (DEC-076). */
  public boolean mayInviteMembers() {
    return activeOwnerOrAdmin();
  }

  /** Only an active space owner may invite someone as admin (DEC-076). */
  public boolean mayInviteAsAdmin() {
    return activeOwner();
  }

  /** Active space owner or admin sees member email addresses on the member list (DEC-076). */
  public boolean maySeeMemberEmails() {
    return activeOwnerOrAdmin();
  }

  public boolean mayChangeEventOperators() {
    return false;
  }

  private boolean activeOwner() {
    return kind == Kind.ACTIVE && OWNER.equals(role);
  }

  private boolean activeOwnerOrAdmin() {
    return kind == Kind.ACTIVE && (OWNER.equals(role) || ADMIN.equals(role));
  }
}
