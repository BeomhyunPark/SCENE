package app.scene.event.retrospective;

import java.time.Instant;

/**
 * Read and write body. A missing retrospective is {@code text ""}, {@code version 0}, and null
 * update fields. The writer's contact stays off; only the display name is shown.
 */
public record Retrospective(
    String text, int version, Instant updatedAt, String updatedByDisplayName) {

  static Retrospective empty() {
    return new Retrospective("", 0, null, null);
  }
}
