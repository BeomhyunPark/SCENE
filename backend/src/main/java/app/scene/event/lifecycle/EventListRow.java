package app.scene.event.lifecycle;

import java.util.UUID;

/** One event on a space list. Period, version, and contact stay off this row. */
public record EventListRow(UUID eventId, String name, String lifecycleStatus) {}
