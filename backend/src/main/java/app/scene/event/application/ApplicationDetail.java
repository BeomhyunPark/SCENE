package app.scene.event.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Application read. Answers follow field position. {@code contactVisible} is true when the reader
 * has effective {@code PARTICIPANT_CONTACT_READ}; otherwise every contact answer's value is null.
 * {@code operation} is the operator values (#335, DEC-075), apart from the answers, which stay as
 * the participant sent them. {@code revision} counts edits from 1 (DEC-078 §4). {@code withdrawal}
 * is who withdrew it, when and why while this is the participant's latest, withdrawn row (DEC-084
 * §9); null otherwise.
 */
public record ApplicationDetail(
    UUID applicationId,
    UUID formId,
    String status,
    Instant submittedAt,
    boolean contactVisible,
    List<ApplicationAnswer> answers,
    ApplicationOperation operation,
    UUID participantId,
    int revision,
    ApplicationWithdrawal withdrawal) {

  public ApplicationDetail {
    answers = List.copyOf(answers);
  }
}
