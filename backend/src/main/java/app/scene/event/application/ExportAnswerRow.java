package app.scene.event.application;

import java.util.UUID;

/** One stored answer for the CSV export. {@code value} is the stored JSON text. */
public record ExportAnswerRow(UUID applicationId, UUID fieldId, String value) {}
