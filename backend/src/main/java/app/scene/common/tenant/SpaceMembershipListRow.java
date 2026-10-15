package app.scene.common.tenant;

import java.util.UUID;

/** One active membership joined to its space. The API item is built outside this row. */
public record SpaceMembershipListRow(UUID spaceId, String name, String role) {}
