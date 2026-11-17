package app.scene.event.application;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * One submitted answer in field order with its field type, hidden flag and current config, so a
 * reader can turn option ids into option text and mark hidden questions and options (DEC-068 §6).
 * {@code contact} is true for a phone question (SYSTEM {@code PHONE}, or a text question with
 * {@code format: PHONE}). Without effective {@code PARTICIPANT_CONTACT_READ} a contact answer's
 * {@code value} is null, the same rule as the applicant table (#308, #332).
 */
public record ApplicationAnswer(
    UUID fieldId,
    String kind,
    String systemKey,
    String label,
    int position,
    String answerType,
    boolean hidden,
    JsonNode config,
    JsonNode value,
    boolean contact) {}
