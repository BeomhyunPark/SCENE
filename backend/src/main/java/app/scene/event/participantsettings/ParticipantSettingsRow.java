package app.scene.event.participantsettings;

import java.time.Instant;

/** Stored settings joined with the writer's display name. */
public record ParticipantSettingsRow(
    boolean groupRosterVisibleToMembers,
    int version,
    Instant updatedAt,
    String updatedByDisplayName) {}
