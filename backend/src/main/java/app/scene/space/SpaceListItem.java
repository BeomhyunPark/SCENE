package app.scene.space;

import java.util.UUID;

/** One space the caller still belongs to. {@code role} is that caller's membership role. */
public record SpaceListItem(UUID spaceId, String name, String role) {}
