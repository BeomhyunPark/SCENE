package app.scene.event.form;

import java.util.UUID;

/**
 * One field row. A custom field has a null system key. {@code config} and {@code showWhen} are the
 * stored jsonb as text; {@link FieldDefinition#from} parses them.
 */
public record FormFieldRow(
    UUID fieldId,
    String kind,
    String systemKey,
    String label,
    int position,
    String answerType,
    boolean required,
    String description,
    String config,
    String showWhen,
    boolean hidden) {}
