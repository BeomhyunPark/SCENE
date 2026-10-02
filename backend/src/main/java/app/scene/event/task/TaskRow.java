package app.scene.event.task;

import java.util.UUID;

public record TaskRow(
    UUID id, String status, int version, UUID assigneeUserId, String lifecycleStatus) {}
