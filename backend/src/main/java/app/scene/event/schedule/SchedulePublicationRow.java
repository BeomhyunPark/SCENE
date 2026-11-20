package app.scene.event.schedule;

import java.time.Instant;
import java.util.UUID;

/** The latest {@code schedule_publications} row. {@code snapshot} is the stored JSON text. */
public record SchedulePublicationRow(
    UUID publicationId,
    long boardVersion,
    String snapshot,
    Instant publishedAt,
    String publishedByDisplayName) {}
