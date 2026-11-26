package app.scene.event.rostersheet;

import java.time.Instant;
import tools.jackson.databind.JsonNode;

/**
 * Read and write body. A missing sheet is the empty document at {@code version 0} with null update
 * fields. Only the writer's display name is shown.
 */
public record RosterSheet(
    JsonNode doc, int version, Instant updatedAt, String updatedByDisplayName) {}
