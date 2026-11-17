package app.scene.event.group;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code GET …/groups/published}: the latest publication with current names and 또래. Withdrawn
 * participants are left out; active participants outside every published group are {@code
 * unassigned}. Before the first publication {@code publishedAt} is null and both lists are empty.
 */
public record PublishedGroups(
    Instant publishedAt, List<PublishedGroup> groups, List<Unassigned> unassigned) {

  public record PublishedGroup(
      UUID groupId, String name, List<Leader> leaders, List<Member> members) {}

  public record Leader(UUID participantId, String name) {}

  public record Member(UUID participantId, String name, String cohort, boolean leader) {}

  public record Unassigned(UUID participantId, String name, String cohort) {}
}
