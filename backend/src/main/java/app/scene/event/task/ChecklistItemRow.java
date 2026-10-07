package app.scene.event.task;

import java.time.Instant;
import java.util.UUID;

/** One checklist row, including the display name of the person who checked it. */
public record ChecklistItemRow(
    UUID id,
    String label,
    int position,
    boolean checked,
    UUID checkedByUserId,
    String checkedByDisplayName,
    Instant checkedAt) {}
