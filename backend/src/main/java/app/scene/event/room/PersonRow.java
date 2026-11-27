package app.scene.event.room;

import java.time.Instant;
import java.util.UUID;

/**
 * A participant of the event with the working-copy room and the answers of the latest SUBMITTED
 * application (null answers when {@code submitted} is false). {@code genderLabel} is the chosen
 * GENDER option's current label, hidden or not; {@code genderShown} is whether that option is
 * shown. The {@code …Answer} columns are stored values of the visible questions as JSON text, or
 * null. {@code applicationId} is that application, null when {@code submitted} is false. {@code
 * basis} is the stored assignment basis as JSON text. No phone.
 */
public record PersonRow(
    UUID participantId,
    String name,
    boolean submitted,
    UUID applicationId,
    String cohort,
    String genderOptionId,
    String genderLabel,
    boolean genderShown,
    boolean attendanceAsked,
    String attendanceOptionId,
    String mealsAnswer,
    String arrivalAnswer,
    String departureAnswer,
    boolean lodgingAsked,
    String lodgingAnswer,
    String noLodgingAnswer,
    UUID roomId,
    String basis,
    Instant basisAt) {}
