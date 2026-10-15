package app.scene.event;

import java.time.LocalDate;
import java.util.UUID;

/** Event read and name-patch body. Contact stays off. Absent period, place, and type are null. */
public record EventDetail(
    UUID eventId,
    String name,
    String lifecycleStatus,
    int lifecycleVersion,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    EventType eventType) {}
