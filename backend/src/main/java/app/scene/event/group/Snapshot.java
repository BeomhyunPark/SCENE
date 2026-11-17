package app.scene.event.group;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Stored content of one publication (DEC-072 §1): groups in board order, and per group the
 * participant ids of its active members at publication time with their leader mark. No name, phone,
 * or answer.
 */
public record Snapshot(List<SnapshotGroup> groups) {

  public static final Snapshot EMPTY = new Snapshot(List.of());

  /** Where each participant of the snapshot is. */
  public Map<UUID, Placement> placements() {
    Map<UUID, Placement> out = new HashMap<>();
    for (SnapshotGroup group : groups) {
      for (SnapshotMember member : group.members()) {
        out.put(member.participantId(), new Placement(group, member.leader()));
      }
    }
    return out;
  }

  public record SnapshotGroup(
      UUID groupId, String name, int sortOrder, List<SnapshotMember> members) {}

  public record SnapshotMember(UUID participantId, boolean leader) {}

  public record Placement(SnapshotGroup group, boolean leader) {}
}
