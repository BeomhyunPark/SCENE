package app.scene.identity;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * Login body. {@code userId} is the {@code users.id} to bind. It is not a secret. Credential format
 * is still open. {@code email} is optional and is kept on the session only, for invitation
 * matching. There is no {@code users.email} column.
 */
public record OperatorLoginRequest(@NotNull UUID userId, String email) {}
