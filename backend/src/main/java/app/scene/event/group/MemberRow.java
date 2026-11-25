package app.scene.event.group;

import java.time.Instant;
import java.util.UUID;

/**
 * An active participant as their group sees them (DEC-083). {@code genderLabel} is the chosen
 * GENDER option's current label, or null when the question is missing or off, there is no answer,
 * or the option is hidden. {@code attendanceAsked} and {@code lodgingAsked} are whether the form
 * has a visible ATTENDANCE or LODGING question. The {@code …Answer} columns are the stored values
 * of the visible MEALS, ARRIVAL_SLOT, DEPARTURE_SLOT, LODGING and NO_LODGING questions as JSON
 * text, or null. {@code checkedInAt} is set only while checked in. {@code revisionAt} is when the
 * current revision was stored. {@code phone} is the application phone; only the member detail sends
 * it.
 */
public record MemberRow(
    UUID participantId,
    String name,
    String phone,
    String cohort,
    String genderLabel,
    boolean attendanceAsked,
    String attendanceOptionId,
    String mealsAnswer,
    String arrivalAnswer,
    String departureAnswer,
    boolean lodgingAsked,
    String lodgingAnswer,
    String noLodgingAnswer,
    boolean checkedIn,
    Instant checkedInAt,
    int revision,
    Instant revisionAt) {}
