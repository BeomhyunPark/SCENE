package app.scene.event.checkin;

/** Check-in body. {@code result} is {@code CHECKED_IN} or {@code ALREADY_CHECKED_IN}. */
public record CheckInResult(String result, CheckInParticipant participant, CheckIn checkIn) {}
