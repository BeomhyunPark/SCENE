package app.scene.event.participantsettings;

import java.time.Instant;
import java.util.Set;

/**
 * Operator read and write body ({@code GET·PUT …/participant-settings}). Never stored settings are
 * the defaults with {@code version 0} and null update fields. Only the writer's display name is
 * shown. {@code roomRosterScope} is {@code ALL}, {@code ROOMMATES} or {@code MY_ROOM} (DEC-085
 * §8.1).
 */
public record ParticipantSettings(
    boolean groupRosterVisibleToMembers,
    String roomRosterScope,
    int version,
    Instant updatedAt,
    String updatedByDisplayName) {

  /** DEC-083 결정 대기 1: on by default. */
  public static final boolean ROSTER_VISIBLE_DEFAULT = true;

  /** Room list scope: rooms, roommates and the whole room list (user decision 2026-11-19). */
  public static final String ROOM_SCOPE_ALL = "ALL";

  /** Room list scope: my room and my roommates, no room list. */
  public static final String ROOM_SCOPE_ROOMMATES = "ROOMMATES";

  /** Room list scope: my room's name and location note only. */
  public static final String ROOM_SCOPE_MY_ROOM = "MY_ROOM";

  static final Set<String> ROOM_SCOPES =
      Set.of(ROOM_SCOPE_ALL, ROOM_SCOPE_ROOMMATES, ROOM_SCOPE_MY_ROOM);

  static ParticipantSettings defaults() {
    return new ParticipantSettings(ROSTER_VISIBLE_DEFAULT, ROOM_SCOPE_ALL, 0, null, null);
  }
}
