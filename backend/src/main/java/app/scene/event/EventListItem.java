package app.scene.event;

import java.util.UUID;

/** One item on the space event list. */
public record EventListItem(UUID eventId, String name, String lifecycleStatus) {}
