package app.scene.event.group;

import java.util.List;
import java.util.UUID;

/**
 * {@code participants[]} item of the group board. No phone and no access key. {@code newcomer} is
 * care information: it stays on this operator board and never reaches participant reads. {@code
 * slotIds} are the board's {@code slots} the participant attends, in slot order: every slot for a
 * full attendee, the chosen ones otherwise, and null when unknown (no MEALS answer) or when the
 * board has no slots. {@code applicationId} is the latest SUBMITTED application, so the screen can
 * open its detail.
 */
public record BoardParticipant(
    UUID participantId,
    UUID applicationId,
    String name,
    String cohort,
    Gender gender,
    String attendance,
    String middleGroup,
    String cell,
    Boolean newcomer,
    UUID groupId,
    boolean leader,
    UUID publishedGroupId,
    boolean publishedLeader,
    List<String> slotIds) {

  /** The GENDER answer: the option id and the option's current label. */
  public record Gender(String optionId, String label) {}
}
