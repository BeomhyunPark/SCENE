package app.scene.identity;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Authenticated operator bound to {@code users.id}. No password is stored. Credential format is
 * still open, and this type carries no role or permission.
 */
public final class OperatorPrincipal implements UserDetails, Serializable {

  @Serial private static final long serialVersionUID = 1L;

  private final UUID userId;
  private final String displayName;

  public OperatorPrincipal(UUID userId, String displayName) {
    this.userId = userId;
    this.displayName = displayName;
  }

  public UUID userId() {
    return userId;
  }

  public String displayName() {
    return displayName;
  }

  @Override
  public Collection<? extends GrantedAuthority> getAuthorities() {
    return List.of();
  }

  @Override
  public String getPassword() {
    return null;
  }

  @Override
  public String getUsername() {
    return userId.toString();
  }
}
