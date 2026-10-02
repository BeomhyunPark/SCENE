package app.scene.event.lifecycle;

import java.util.UUID;

public record EventRow(UUID id, UUID spaceId, String lifecycleStatus, int lifecycleVersion) {}
