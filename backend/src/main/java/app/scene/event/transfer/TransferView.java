package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;

/** Transfer plus the names the HTTP body returns. No email, token, or session. */
public record TransferView(
    UUID transferId,
    UUID spaceId,
    String spaceName,
    UUID eventId,
    String eventName,
    UUID fromUserId,
    String fromDisplayName,
    UUID toUserId,
    String toDisplayName,
    String status,
    Instant acceptedAt,
    Instant handoverEndsAt) {}
