package app.scene.event.transfer;

import java.time.Instant;
import java.util.UUID;

/** One stored HANDOVER whose end time has arrived. The sender role is not on this row. */
public record DueTransfer(
    UUID id, UUID spaceId, UUID eventId, UUID fromUserId, UUID toUserId, Instant handoverEndsAt) {}
