package app.scene.event.room;

import java.util.UUID;

/** One stored room of the working copy. {@code capacity} null is "no capacity". */
public record RoomRow(
    UUID roomId,
    String name,
    String locationNote,
    Integer capacity,
    String genderOptionId,
    int sortOrder,
    int version) {}
