package app.scene.event.lifecycle;

import java.util.UUID;

/** Event row resolved from {@code eventId} alone. Routes do not take {@code spaceId}. */
public record EventLocation(
    UUID id, UUID spaceId, String name, String lifecycleStatus, int lifecycleVersion) {}
