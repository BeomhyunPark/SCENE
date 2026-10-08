package app.scene.event.application;

import java.util.UUID;

/** One answer joined to its field. {@code value} is the stored JSON text. */
public record ApplicationAnswerRow(
    UUID fieldId, String kind, String systemKey, String label, int position, String value) {}
