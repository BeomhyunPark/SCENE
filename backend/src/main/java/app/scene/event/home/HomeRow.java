package app.scene.event.home;

import java.time.LocalDate;
import java.util.UUID;

/** Event, form notice, and whether the participant has a SUBMITTED application. */
public record HomeRow(
    UUID eventId,
    String name,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    String eventType,
    String completionNotice,
    boolean submitted) {}
