package app.scene.event.form;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * One field on a form detail or public form (DEC-068). {@code showWhen} is null when always shown.
 */
public record FormFieldView(
    UUID fieldId,
    String kind,
    String systemKey,
    String label,
    int position,
    String answerType,
    boolean required,
    String description,
    JsonNode config,
    JsonNode showWhen,
    boolean hidden) {}
