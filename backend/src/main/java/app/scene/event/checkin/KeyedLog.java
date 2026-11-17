package app.scene.event.checkin;

import java.util.UUID;

/** The history row an {@code Idempotency-Key} already wrote. */
public record KeyedLog(UUID checkInId, UUID participantId, String action) {}
