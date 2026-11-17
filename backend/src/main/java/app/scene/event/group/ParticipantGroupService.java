package app.scene.event.group;

import app.scene.event.group.ParticipantGroup.LeaderName;
import app.scene.event.group.ParticipantGroup.Mate;
import app.scene.event.group.ParticipantGroup.MyGroup;
import app.scene.event.group.Snapshot.Placement;
import app.scene.event.group.Snapshot.SnapshotMember;
import app.scene.event.participant.ParticipantSelf;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The signed-in participant's group in the latest publication (#300, DEC-072 §6). Reads only the
 * session's event and participant and only the latest publication; the event state does not matter.
 * A participant without a SUBMITTED application is {@code NOT_ELIGIBLE} before anything else.
 * Everyone sees the group name, the leaders' names, and the publication time; a leader also sees
 * the names, 또래, and leader marks of the active members of that one group. No phone or other
 * contact, no other group, no audit.
 */
@Service
public class ParticipantGroupService {

  private final GroupRepository groups;

  public ParticipantGroupService(GroupRepository groups) {
    this.groups = groups;
  }

  @Transactional(readOnly = true)
  public ParticipantGroup current(ParticipantSelf self) {
    UUID spaceId = self.spaceId();
    UUID eventId = self.eventId();
    UUID selfId = self.participantId();
    if (groups.active(spaceId, eventId, List.of(selfId)).isEmpty()) {
      return new ParticipantGroup(ParticipantGroup.NOT_ELIGIBLE, null, null, false, null);
    }
    Optional<Publication> latest = groups.latestPublication(spaceId, eventId);
    if (latest.isEmpty()) {
      return new ParticipantGroup(ParticipantGroup.NOT_PUBLISHED, null, null, false, null);
    }
    Publication publication = latest.get();
    Placement mine = publication.snapshot().placements().get(selfId);
    if (mine == null) {
      return new ParticipantGroup(
          ParticipantGroup.UNASSIGNED, publication.publishedAt(), null, false, null);
    }

    List<UUID> ids = new ArrayList<>();
    for (SnapshotMember member : mine.group().members()) {
      ids.add(member.participantId());
    }
    Map<UUID, ActiveParticipant> current = new HashMap<>();
    for (ActiveParticipant participant : groups.active(spaceId, eventId, ids)) {
      current.put(participant.participantId(), participant);
    }
    // The publication's member order, which is the operator's order at publication time.
    List<GroupService.PublishedMember> members = new ArrayList<>();
    for (SnapshotMember member : mine.group().members()) {
      ActiveParticipant participant = current.get(member.participantId());
      if (participant != null) {
        members.add(new GroupService.PublishedMember(participant, member.leader()));
      }
    }

    List<LeaderName> leaders = new ArrayList<>();
    for (GroupService.PublishedMember member : members) {
      if (member.leader()) {
        leaders.add(new LeaderName(member.participant().name()));
      }
    }
    List<Mate> mates = null;
    if (mine.leader()) {
      mates = new ArrayList<>();
      for (GroupService.PublishedMember member : members) {
        mates.add(
            new Mate(member.participant().name(), member.participant().cohort(), member.leader()));
      }
    }
    return new ParticipantGroup(
        ParticipantGroup.ASSIGNED,
        publication.publishedAt(),
        new MyGroup(mine.group().name(), leaders),
        mine.leader(),
        mates);
  }
}
