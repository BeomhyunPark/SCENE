package app.scene.event.audience;

import app.scene.event.audience.mapper.AudienceQueryMapper;
import app.scene.event.participant.ParticipantSelf;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The one audience check for participants (DEC-080 §8). An active participant has a {@code
 * SUBMITTED} application, the same rule the group board, check-in roster and {@code GET
 * /participant/group} use; a withdrawn or superseded-only participant is not active, so it sees no
 * item and receives no notification.
 *
 * <ul>
 *   <li>{@code ALL}: active participants.
 *   <li>{@code LEADERS}: active participants marked leader in the latest group publication. None
 *       before the first publication. A leader cleared by a later publication stops seeing them.
 *   <li>{@code STAFF} and unknown types: nobody.
 * </ul>
 *
 * <p>Reading a list: take one {@link Viewer} per request with {@link #viewer} (one SQL statement
 * for active and leader), then call {@link Viewer#sees} for each stored item. Making notifications:
 * {@link #participantIds} gives the active participants inside an audience at that moment.
 */
@Component
public class ParticipantAudience {

  private final AudienceQueryMapper queries;

  public ParticipantAudience(AudienceQueryMapper queries) {
    this.queries = queries;
  }

  /** What one participant can see. Read once per request. */
  public Viewer viewer(ParticipantSelf self) {
    return viewer(self.spaceId(), self.eventId(), self.participantId());
  }

  public Viewer viewer(UUID spaceId, UUID eventId, UUID participantId) {
    ViewerRow row = queries.findViewer(spaceId, eventId, participantId);
    return new Viewer(row != null && row.active(), row != null && row.active() && row.leader());
  }

  /**
   * Active participant ids inside {@code audience} now, without duplicates, for notification
   * recipients. {@code STAFF} and unknown types add nobody. At most two statements.
   */
  public List<UUID> participantIds(UUID spaceId, UUID eventId, Audience audience) {
    Set<UUID> out = new LinkedHashSet<>();
    if (audience.has(AudienceType.ALL)) {
      out.addAll(queries.findActiveIds(spaceId, eventId));
    } else if (audience.has(AudienceType.LEADERS)) {
      out.addAll(queries.findActiveLeaderIds(spaceId, eventId));
    }
    return new ArrayList<>(out);
  }

  /** Database row for {@link #viewer}. */
  public record ViewerRow(boolean active, boolean leader) {}

  /** One participant's view: whether they are active and a published leader. */
  public record Viewer(boolean active, boolean leader) {

    /** Whether this participant may see an item with {@code audience}. */
    public boolean sees(Audience audience) {
      for (Audience.Entry entry : audience.entries()) {
        AudienceType type = entry.known();
        if (type == AudienceType.ALL && active) {
          return true;
        }
        if (type == AudienceType.LEADERS && leader) {
          return true;
        }
      }
      return false;
    }
  }
}
