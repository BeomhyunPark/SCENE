package app.scene.event.group;

import java.util.UUID;

/**
 * Active participant with the answers the board filters on. {@code attendanceAsked} is whether the
 * form has a visible ATTENDANCE question. {@code newcomer} is the NEWCOMER yes/no answer, null when
 * there is none or the question is missing or hidden. {@code mealsAnswer} is the stored value of
 * the visible MEALS question as JSON text, or null. {@code arrivalAnswer} and {@code
 * departureAnswer} are the same for the visible ARRIVAL_SLOT and DEPARTURE_SLOT questions
 * (DEC-074).
 */
public record BoardRow(
    UUID participantId,
    String name,
    String cohort,
    String genderOptionId,
    String genderLabel,
    boolean attendanceAsked,
    String attendanceOptionId,
    String middleGroup,
    String cell,
    Boolean newcomer,
    UUID groupId,
    boolean leader,
    String mealsAnswer,
    String arrivalAnswer,
    String departureAnswer) {}
