package app.scene.event.group;

import java.util.UUID;

/**
 * Active participant with the answers the board filters on. {@code attendanceAsked} is whether the
 * form has a visible ATTENDANCE question. {@code middleGroup} and {@code cell} are the free answer
 * or the chosen option's current label. The {@code …Config} and {@code …Answer} columns are the
 * visible MIDDLE_GROUP and CELL questions' config and stored value as JSON text, or null; {@link
 * app.scene.event.form.FormPreset#newcomer} reads them. {@code mealsAnswer} is the stored value of
 * the visible MEALS question as JSON text, or null. {@code arrivalAnswer} and {@code
 * departureAnswer} are the same for the visible ARRIVAL_SLOT and DEPARTURE_SLOT questions
 * (DEC-074). {@code applicationId} is the latest SUBMITTED application the answers come from.
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
    String middleGroupConfig,
    String middleGroupAnswer,
    String cellConfig,
    String cellAnswer,
    UUID groupId,
    boolean leader,
    String mealsAnswer,
    String arrivalAnswer,
    String departureAnswer,
    UUID applicationId) {}
