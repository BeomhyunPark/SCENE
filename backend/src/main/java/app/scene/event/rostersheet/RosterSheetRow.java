package app.scene.event.rostersheet;

import java.time.Instant;

/** Stored sheet joined with the writer's display name. {@code doc} is JSON text. */
public record RosterSheetRow(
    String doc, int version, Instant updatedAt, String updatedByDisplayName) {}
