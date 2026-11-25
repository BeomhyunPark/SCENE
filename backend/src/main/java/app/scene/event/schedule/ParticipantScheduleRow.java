package app.scene.event.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The participant read in one statement: the event period and the latest publication's time and
 * snapshot ({@code null} before the first publication). {@code eventId} is never null, so an event
 * without a period or publication still maps to a row instead of {@code null}.
 */
public record ParticipantScheduleRow(
    UUID eventId, LocalDate startDate, LocalDate endDate, Instant publishedAt, String snapshot) {}
