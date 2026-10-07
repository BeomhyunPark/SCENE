package app.scene.event.permission;

import java.util.List;
import java.util.UUID;

/** GET and PUT permission body. Grants and revokes stay under {@code overrides}. */
public record OperatorPermissionBody(
    UUID userId,
    String role,
    List<String> roleDefaults,
    Overrides overrides,
    List<String> effective) {

  public OperatorPermissionBody {
    roleDefaults = List.copyOf(roleDefaults);
    effective = List.copyOf(effective);
  }

  public record Overrides(List<String> grants, List<String> revokes) {
    public Overrides {
      grants = List.copyOf(grants);
      revokes = List.copyOf(revokes);
    }
  }

  public static OperatorPermissionBody of(OperatorPermissions permissions) {
    return new OperatorPermissionBody(
        permissions.userId(),
        permissions.role(),
        permissions.roleDefaults(),
        new Overrides(permissions.grants(), permissions.revokes()),
        permissions.effective());
  }
}
