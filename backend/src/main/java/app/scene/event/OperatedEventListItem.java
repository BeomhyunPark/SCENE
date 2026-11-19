package app.scene.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One item on the caller's own event list across spaces (#387). {@code eventRole} is the caller's
 * {@code OWNER}, {@code MANAGER}, or {@code STAFF} role in that event. {@code spaceMember} is false
 * for an event-only collaborator (DEC-039, DEC-060). Other operators, members, and contact stay
 * off. Absent period, place, and type are null.
 */
public record OperatedEventListItem(
    UUID eventId,
    String name,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate endDate,
    String place,
    EventType eventType,
    UUID spaceId,
    String spaceName,
    String eventRole,
    boolean spaceMember) {}
