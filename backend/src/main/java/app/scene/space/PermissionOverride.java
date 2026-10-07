package app.scene.space;

import java.time.Instant;
import java.util.UUID;

/** One stored GRANT or REVOKE for an event operator. */
public record PermissionOverride(
    String permission, String effect, UUID grantedBy, Instant grantedAt) {}
