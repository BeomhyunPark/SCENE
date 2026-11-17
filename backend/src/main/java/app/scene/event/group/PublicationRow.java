package app.scene.event.group;

import java.time.Instant;
import java.util.UUID;

/** One {@code group_publications} row. {@code snapshot} is the stored JSON text. */
public record PublicationRow(
    UUID publicationId,
    long boardVersion,
    String snapshot,
    Instant publishedAt,
    String publishedByDisplayName) {}
