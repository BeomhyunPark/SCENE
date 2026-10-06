package app.scene.common.tenant;

import java.util.UUID;

/** Space the caller is still a member of. Not an organization-settings API. */
public record OperatorSpaceView(UUID spaceId, String name) {}
