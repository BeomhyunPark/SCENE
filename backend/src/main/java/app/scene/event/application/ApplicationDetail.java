package app.scene.event.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Application read. Answers follow field position. */
public record ApplicationDetail(
    UUID applicationId,
    UUID formId,
    String status,
    Instant submittedAt,
    List<ApplicationAnswer> answers) {

  public ApplicationDetail {
    answers = List.copyOf(answers);
  }
}
