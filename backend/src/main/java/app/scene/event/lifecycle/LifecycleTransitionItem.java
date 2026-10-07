package app.scene.event.lifecycle;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One history row. Conflict {@code lastTransition} stays a smaller shape and is not this record.
 * Reason is the stored transition reason. Contact, token, and session stay off.
 */
public record LifecycleTransitionItem(
    String command,
    String fromStatus,
    String toStatus,
    String actedAs,
    UUID actorUserId,
    String reason,
    Instant occurredAt,
    Map<String, Object> warnings) {}
