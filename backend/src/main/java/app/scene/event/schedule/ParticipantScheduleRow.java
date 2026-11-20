package app.scene.event.schedule;

import java.time.Instant;
import java.time.LocalDate;

/**
 * The participant read in one statement: the event period and the latest publication's time and
 * snapshot ({@code null} before the first publication).
 */
public record ParticipantScheduleRow(
    LocalDate startDate, LocalDate endDate, Instant publishedAt, String snapshot) {}
