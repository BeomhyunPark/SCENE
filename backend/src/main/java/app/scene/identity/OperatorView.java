package app.scene.identity;

import java.util.UUID;

/** Operator self view. Space and event roles stay on their own APIs. */
public record OperatorView(UUID userId, String displayName) {}
