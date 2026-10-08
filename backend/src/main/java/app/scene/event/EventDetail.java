package app.scene.event;

import java.util.UUID;

/** Event read and name-patch body. Period and contact stay off. */
public record EventDetail(
    UUID eventId, String name, String lifecycleStatus, int lifecycleVersion) {}
