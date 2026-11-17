package app.scene.event.group;

import java.util.List;
import java.util.UUID;

/** Response bodies of the group writes (api.md "조 편성"). */
public final class GroupResults {

  private GroupResults() {}

  /** Create and rename. */
  public record GroupWritten(Group group, long boardVersion) {}

  /** Delete. {@code unassignedCount} is the people this deletion left unassigned. */
  public record GroupDeleted(int unassignedCount, long boardVersion) {}

  /** Reorder. */
  public record BoardVersion(long boardVersion) {}

  /** Assignment changes. */
  public record Assigned(int changed, int alreadyApplied, long boardVersion) {}

  /** Leader replacement. */
  public record LeadersWritten(Group group, List<UUID> leaderIds, long boardVersion) {}
}
