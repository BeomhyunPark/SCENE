package app.scene.event.lifecycle;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One event the caller operates, in any space (#387). {@code eventRole} is the stored {@code
 * event_users} role. {@code spaceMember} is true when the caller still has an active membership in
 * that space. Version and contact stay off this row.
 */
public record OperatedEventRow(
    UUID eventId,
    String name,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    String eventType,
    UUID spaceId,
    String spaceName,
    String eventRole,
    boolean spaceMember) {}
