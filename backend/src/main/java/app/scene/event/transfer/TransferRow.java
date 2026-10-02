package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;

public record TransferRow(
    UUID id, UUID eventId, UUID fromUserId, UUID toUserId, String status, Instant handoverEndsAt) {}
