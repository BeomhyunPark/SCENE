package app.scene.event.form.param;

/** The editable settings of a field. {@code config} and {@code showWhen} are JSON text. */
public record FieldValues(
    String answerType,
    boolean required,
    String description,
    String config,
    String showWhen,
    boolean hidden) {}
