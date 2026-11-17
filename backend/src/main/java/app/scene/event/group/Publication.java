package app.scene.event.group;

import java.time.Instant;
import java.util.UUID;

/** The latest publication of an event with its snapshot read back. */
public record Publication(
    UUID publicationId,
    long boardVersion,
    Instant publishedAt,
    String publishedByDisplayName,
    Snapshot snapshot) {}
