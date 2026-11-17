package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/** Stored operator values of one application joined with the writer's display name. */
public record ApplicationOperationRow(
    UUID applicationId, String memo, int version, Instant updatedAt, String updatedByDisplayName) {

  ApplicationOperation operation() {
    return new ApplicationOperation(memo, version, updatedAt, updatedByDisplayName);
  }
}
