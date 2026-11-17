package app.scene.event.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Application read. Answers follow field position. {@code contactVisible} is true when the reader
 * has effective {@code PARTICIPANT_CONTACT_READ}; otherwise every contact answer's value is null.
 */
public record ApplicationDetail(
    UUID applicationId,
    UUID formId,
    String status,
    Instant submittedAt,
    boolean contactVisible,
    List<ApplicationAnswer> answers) {

  public ApplicationDetail {
    answers = List.copyOf(answers);
  }
}
