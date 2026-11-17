package app.scene.event.checkin;

import java.time.Instant;
import java.util.UUID;

/** History row. {@code method} is null on CANCELLED, {@code reason} on CHECKED_IN. */
public record CheckInLogItem(
    UUID logId,
    UUID checkInId,
    String action,
    String method,
    UUID actorUserId,
    String actorDisplayName,
    String reason,
    Instant createdAt) {}
