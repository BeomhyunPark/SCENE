package app.scene.event.group;

import java.util.UUID;

/**
 * Active participant with the answers the board filters on. {@code attendanceAsked} is whether the
 * form has a visible ATTENDANCE question. {@code mealsAnswer} is the stored value of the visible
 * MEALS question as JSON text, or null.
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
    UUID groupId,
    boolean leader,
    String mealsAnswer) {}
