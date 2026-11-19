package app.scene.space.invitation;

import java.util.UUID;

/**
 * One active member. {@code email} is the verified Google address of the last sign-in, or null when
 * the account has none. The service drops it for viewers who may not see it.
 */
public record SpaceMemberRow(UUID userId, String displayName, String role, String email) {}
