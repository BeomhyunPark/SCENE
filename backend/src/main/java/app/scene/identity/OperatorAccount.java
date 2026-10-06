package app.scene.identity;

import java.util.UUID;

/** Row from {@code users}. Membership and permissions are not loaded here. */
public record OperatorAccount(UUID id, String displayName) {}
