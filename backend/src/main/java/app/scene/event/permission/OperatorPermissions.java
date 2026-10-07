package app.scene.event.permission;

import java.util.List;
import java.util.UUID;

/** One operator's role defaults, stored overrides, and the effective set for this request. */
public record OperatorPermissions(
    UUID userId,
    String role,
    List<String> roleDefaults,
    List<String> grants,
    List<String> revokes,
    List<String> effective) {}
