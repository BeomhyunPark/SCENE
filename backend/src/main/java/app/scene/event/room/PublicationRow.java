package app.scene.event.room;

import java.time.Instant;
import java.util.UUID;

/** A stored room publication with the snapshot as JSON text. */
public record PublicationRow(
    UUID publicationId,
    long boardVersion,
    String snapshot,
    Instant publishedAt,
    String publishedByDisplayName) {}
