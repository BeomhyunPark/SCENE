package app.scene.common.tenant;

import java.util.UUID;

/** One space loaded only when this operator has a membership row there. */
public record SpaceAccessRow(
    UUID spaceId, String spaceName, String membershipStatus, String role) {}
