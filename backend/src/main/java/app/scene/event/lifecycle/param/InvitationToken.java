package app.scene.event.lifecycle.param;

/** Query or update values bound into one MyBatis statement. */
public final class InvitationToken {

  private final String tokenHash;

  private InvitationToken(String tokenHash) {
    this.tokenHash = tokenHash;
  }

  public static InvitationToken of(String tokenHash) {
    return new InvitationToken(tokenHash);
  }

  public String getTokenHash() {
    return tokenHash;
  }
}
