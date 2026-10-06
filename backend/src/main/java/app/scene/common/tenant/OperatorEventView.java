package app.scene.common.tenant;

import java.util.UUID;

/** Event the caller is allowed to see. No role or permission payload. */
public record OperatorEventView(UUID eventId, UUID spaceId, String name) {}
