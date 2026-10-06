package app.scene.common.security;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;

/** Authenticated marker for chain tests. Not a user model and not {@code UserDetails}. */
final class ProbeAuthentication extends AbstractAuthenticationToken {

  private static final long serialVersionUID = 1L;

  private final String chain;

  ProbeAuthentication(String chain) {
    super(List.of());
    this.chain = chain;
    super.setAuthenticated(true);
  }

  @Override
  public Object getCredentials() {
    return null;
  }

  @Override
  public Object getPrincipal() {
    return chain;
  }
}
