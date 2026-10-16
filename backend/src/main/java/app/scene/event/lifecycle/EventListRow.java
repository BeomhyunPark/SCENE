package app.scene.event.lifecycle;

import java.time.LocalDate;
import java.util.UUID;

/** One event on a space list. Version and contact stay off this row. */
public record EventListRow(
    UUID eventId,
    String name,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    String eventType) {}
