package app.scene.identity;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * Development login body. Only {@link DevLoginController} accepts it, and only on the {@code local}
 * and {@code test} profiles. {@code userId} is the {@code users.id} to bind. It is not a secret.
 * {@code email} is optional. A non-blank value is stored as the session's verified invitation
 * address. There is no {@code users.email} column.
 */
public record OperatorLoginRequest(@NotNull UUID userId, String email) {}
