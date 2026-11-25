package app.scene.event.application;

import java.util.UUID;

/** The display name of the operator who stored one revision (DEC-088 §6). */
public record RevisorName(UUID applicationId, String displayName) {}
