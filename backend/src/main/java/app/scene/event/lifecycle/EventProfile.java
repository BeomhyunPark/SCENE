package app.scene.event.lifecycle;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Event detail columns. Period, place, and type stay off {@link EventLocation} so access checks do
 * not take them.
 */
public record EventProfile(
    UUID eventId,
    String name,
    String lifecycleStatus,
    int lifecycleVersion,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    String eventType) {}
