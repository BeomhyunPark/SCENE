package app.scene.event.permission;

import java.util.List;
import java.util.UUID;

/** Operator list item when {@code include=permissions} is explicit. */
public record OperatorListItem(
    UUID userId, String displayName, String role, List<String> effectivePermissions) {

  public OperatorListItem {
    effectivePermissions = List.copyOf(effectivePermissions);
  }
}
