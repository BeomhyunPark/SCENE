package app.scene.event.lifecycle;

import java.time.Instant;

/** Latest lifecycle transition returned with a version conflict. Reason stays out. */
public record LifecycleTransitionView(
    String command, String fromStatus, String toStatus, String actedAs, Instant occurredAt) {}
