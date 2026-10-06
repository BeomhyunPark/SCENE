package app.scene.identity;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * Login body. {@code userId} is the {@code users.id} to bind. It is not a secret. Credential format
 * is still open.
 */
public record OperatorLoginRequest(@NotNull UUID userId) {}
