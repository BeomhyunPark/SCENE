package app.scene.event;

import java.time.LocalDate;
import java.util.UUID;

/** One item on the space event list. Absent period, place, and type are null. */
public record EventListItem(
    UUID eventId,
    String name,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    EventType eventType) {}
