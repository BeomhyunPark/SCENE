package app.scene.event.group;

import java.time.Instant;
import java.util.List;

/**
 * {@code GET /api/v1/participant/group} (DEC-072 §6). {@code group} is set only for {@code
 * ASSIGNED}. {@code members} is set only when the participant is a leader of that group in the
 * latest publication. No phone or other contact anywhere.
 */
public record ParticipantGroup(
    String status, Instant publishedAt, MyGroup group, boolean leader, List<Mate> members) {

  static final String NOT_PUBLISHED = "NOT_PUBLISHED";
  static final String UNASSIGNED = "UNASSIGNED";
  static final String ASSIGNED = "ASSIGNED";
  static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";

  public record MyGroup(String name, List<LeaderName> leaders) {}

  public record LeaderName(String name) {}

  public record Mate(String name, String cohort, boolean leader) {}
}
