package app.scene.event.participantsettings;

import java.time.Instant;

/**
 * Operator read and write body ({@code GET·PUT …/participant-settings}). Never stored settings are
 * the defaults with {@code version 0} and null update fields. Only the writer's display name is
 * shown.
 */
public record ParticipantSettings(
    boolean groupRosterVisibleToMembers,
    int version,
    Instant updatedAt,
    String updatedByDisplayName) {

  /** DEC-083 결정 대기 1: on by default. */
  public static final boolean ROSTER_VISIBLE_DEFAULT = true;

  static ParticipantSettings defaults() {
    return new ParticipantSettings(ROSTER_VISIBLE_DEFAULT, 0, null, null);
  }
}
