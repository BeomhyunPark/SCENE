package app.scene.event.application;

import java.time.Instant;

/**
 * Operator-side values of one application (#335, DEC-075), apart from the participant's answers.
 * The first round holds the operator memo only. Nothing is stored yet when {@code version} is 0;
 * then {@code memo} is empty and the update fields are null. Only the writer's display name is
 * shown. Never sent on participant routes.
 */
public record ApplicationOperation(
    String memo, int version, Instant updatedAt, String updatedByDisplayName) {

  static ApplicationOperation empty() {
    return new ApplicationOperation("", 0, null, null);
  }
}
