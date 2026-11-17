package app.scene.event.group;

import app.scene.event.group.Snapshot.Placement;
import app.scene.event.group.Snapshot.SnapshotGroup;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Working copy against the latest publication (api.md group-board {@code publication}). {@code
 * changedParticipants} counts active participants whose group or leader mark differs; {@code
 * groupChanges} counts groups added, deleted, renamed, or moved in order. With no publication the
 * snapshot is empty, so every assigned participant and every group is a change.
 */
record PublicationDiff(long changedParticipants, long groupChanges) {

  boolean any() {
    return changedParticipants != 0 || groupChanges != 0;
  }

  static PublicationDiff of(List<Group> groups, List<ActiveParticipant> active, Snapshot snapshot) {
    Map<UUID, Placement> placements = snapshot.placements();
    long changed = 0;
    for (ActiveParticipant participant : active) {
      Placement placement = placements.get(participant.participantId());
      UUID publishedGroupId = placement == null ? null : placement.group().groupId();
      boolean publishedLeader = placement != null && placement.leader();
      if (!Objects.equals(participant.groupId(), publishedGroupId)
          || participant.leader() != publishedLeader) {
        changed++;
      }
    }
    Map<UUID, SnapshotGroup> published = new HashMap<>();
    for (SnapshotGroup group : snapshot.groups()) {
      published.put(group.groupId(), group);
    }
    Set<UUID> seen = new HashSet<>();
    long groupChanges = 0;
    for (Group group : groups) {
      seen.add(group.groupId());
      SnapshotGroup before = published.get(group.groupId());
      if (before == null
          || !before.name().equals(group.name())
          || before.sortOrder() != group.sortOrder()) {
        groupChanges++;
      }
    }
    for (UUID id : published.keySet()) {
      if (!seen.contains(id)) {
        groupChanges++;
      }
    }
    return new PublicationDiff(changed, groupChanges);
  }
}
