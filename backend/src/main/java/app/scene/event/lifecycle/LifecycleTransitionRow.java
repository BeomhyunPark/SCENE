package app.scene.event.lifecycle;

import java.time.Instant;
import java.util.UUID;

/** One stored transition. {@code warningsSnapshot} is the jsonb text, not a client field. */
public record LifecycleTransitionRow(
    String command,
    String fromStatus,
    String toStatus,
    String actedAs,
    UUID actorUserId,
    String reason,
    Instant occurredAt,
    String warningsSnapshot) {}
