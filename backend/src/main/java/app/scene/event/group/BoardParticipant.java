package app.scene.event.group;

import java.util.UUID;

/**
 * {@code participants[]} item of the group board. No phone and no access key. {@code newcomer} is
 * care information: it stays on this operator board and never reaches participant reads.
 */
public record BoardParticipant(
    UUID participantId,
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
    boolean publishedLeader) {

  /** The GENDER answer: the option id and the option's current label. */
  public record Gender(String optionId, String label) {}
}
