package app.scene.event.checkin;

import java.time.Instant;
import java.util.UUID;

/**
 * Roster row. {@code checkInId} is null when the participant never checked in. {@code
 * applicationId} is the latest SUBMITTED application the roster row comes from.
 */
public record RosterRow(
    UUID participantId,
    String name,
    String cohort,
    String phoneLast4,
    UUID checkInId,
    String status,
    String method,
    Instant checkedInAt,
    String checkedInByDisplayName,
    UUID applicationId) {}
