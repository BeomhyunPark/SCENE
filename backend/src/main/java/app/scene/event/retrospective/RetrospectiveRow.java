package app.scene.event.retrospective;

import java.time.Instant;

/** Stored retrospective joined with the writer's display name. */
public record RetrospectiveRow(
    String body, int version, Instant updatedAt, String updatedByDisplayName) {}
