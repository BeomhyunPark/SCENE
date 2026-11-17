package app.scene.event.group;

import java.util.UUID;

/** One group of the working copy. {@code version} moves on rename and leader changes. */
public record Group(UUID groupId, String name, int sortOrder, int version) {}
