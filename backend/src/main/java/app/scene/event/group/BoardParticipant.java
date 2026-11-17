package app.scene.event.group;

import java.util.UUID;

/** {@code participants[]} item of the group board. No phone and no access key. */
public record BoardParticipant(
    UUID participantId,
    String name,
    String cohort,
    Gender gender,
    String attendance,
    String middleGroup,
    String cell,
    UUID groupId,
    boolean leader,
    UUID publishedGroupId,
    boolean publishedLeader) {

  /** The GENDER answer: the option id and the option's current label. */
  public record Gender(String optionId, String label) {}
}
