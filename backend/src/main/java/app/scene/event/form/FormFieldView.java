package app.scene.event.form;

import java.util.UUID;

/** One field on a form detail. */
public record FormFieldView(
    UUID fieldId, String kind, String systemKey, String label, int position) {}
