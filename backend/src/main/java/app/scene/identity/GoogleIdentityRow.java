package app.scene.identity;

import java.util.UUID;

/** A stored Google identity with its SCENE user. */
public record GoogleIdentityRow(String subject, UUID userId, String displayName) {}
