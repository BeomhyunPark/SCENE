package app.scene.event.checkin;

import app.scene.event.room.Lodging;

/**
 * Check-in body. {@code result} is {@code CHECKED_IN} or {@code ALREADY_CHECKED_IN}. {@code room}
 * and {@code lodging} (G5 #460) are the published room and the lodging state now, so the desk can
 * say the room right after the check-in.
 */
public record CheckInResult(
    String result,
    CheckInParticipant participant,
    CheckIn checkIn,
    CheckInRoom room,
    Lodging lodging) {}
