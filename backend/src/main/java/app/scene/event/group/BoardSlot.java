package app.scene.event.group;

/**
 * {@code slots[]} item of the group board: one meal or worship slot of the form setup (DEC-070),
 * the same slot as the summary's {@code meals.days[].slots[]}. {@code slotId} is the {@code MEALS}
 * option id, {@code meal} is BREAKFAST, LUNCH, DINNER or WORSHIP, and {@code sortOrder} is the
 * 0-based position in the list.
 */
public record BoardSlot(
    String slotId,
    int day,
    String date,
    String dayLabel,
    String meal,
    String label,
    int sortOrder) {}
