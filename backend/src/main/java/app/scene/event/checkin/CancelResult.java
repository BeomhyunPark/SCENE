package app.scene.event.checkin;

/** Cancel body. {@code result} is {@code CANCELLED} or {@code ALREADY_CANCELLED}. */
public record CancelResult(String result, CheckIn checkIn) {}
