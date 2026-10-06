package app.scene.space;

import java.util.UUID;

/** Task assigned to the operator who is about to lose event access. */
public record AssignedTask(UUID id, int version) {}
