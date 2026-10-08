package app.scene.event.form;

import java.util.UUID;

/** One field. A custom field has a null system key. */
public record FormFieldRow(
    UUID fieldId, String kind, String systemKey, String label, int position) {}
