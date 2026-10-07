package app.scene.event.task;

import java.util.UUID;

/**
 * Fields present on one PATCH. A present assignee may be null, which clears it. A present status
 * has already been limited to {@code CANCELLED}.
 */
public record TaskPatch(
    boolean titlePresent,
    String title,
    boolean assigneePresent,
    UUID assigneeUserId,
    boolean statusPresent,
    String status) {}
