package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;

/** One event-scoped owner transfer row, locked or loaded by id. */
public record TransferRow(
    UUID id,
    UUID spaceId,
    UUID eventId,
    UUID fromUserId,
    UUID toUserId,
    String status,
    String recipientPriorRole,
    Instant acceptedAt,
    Instant handoverEndsAt,
    String permissionSnapshot) {}
