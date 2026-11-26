package app.scene.event.schedule;

import java.time.Instant;
import java.util.UUID;

/**
 * One {@code schedule_items} row. Times are {@code HH:mm} text; {@code audience} is the stored JSON
 * text. {@code autoFilled} is true for an item the server put in for a form slot (DEC-090).
 */
public record ScheduleItemRow(
    UUID itemId,
    int day,
    String startTime,
    String endTime,
    String title,
    String place,
    String description,
    String category,
    String audience,
    String slotId,
    int sortOrder,
    int version,
    Instant updatedAt,
    String updatedByDisplayName,
    boolean autoFilled) {}
