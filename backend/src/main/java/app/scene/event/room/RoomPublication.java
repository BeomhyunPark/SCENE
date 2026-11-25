package app.scene.event.room;

import java.time.Instant;
import java.util.UUID;

/** The latest room publication of an event with its snapshot read back. */
public record RoomPublication(
    UUID publicationId,
    long boardVersion,
    Instant publishedAt,
    String publishedByDisplayName,
    RoomSnapshot snapshot) {}
