package app.scene.event.group;

import java.util.UUID;

/**
 * Active participant with the answers the board filters on. {@code attendanceAsked} is whether the
 * form has a visible ATTENDANCE question. {@code newcomer} is the NEWCOMER yes/no answer, null when
 * there is none or the question is missing or hidden.
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
    boolean leader) {}
