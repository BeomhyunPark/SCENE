package app.scene.event.schedule;

import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The schedule working-copy version for other features. The operator refresh check ({@code GET
 * /operator/events/{eventId}/updates}, participant-home-contract §7.5, I3) puts {@link
 * #boardVersion} in its {@code schedule} key: operators reload the schedule screen when it differs.
 * One primary-key read; 0 before the first item change. A publication does not raise it.
 */
@Component
public class ScheduleBoards {

  private final ScheduleRepository schedule;

  ScheduleBoards(ScheduleRepository schedule) {
    this.schedule = schedule;
  }

  /** {@code schedule_boards.version} of the event, 0 when there is no row. */
  public long boardVersion(UUID spaceId, UUID eventId) {
    return schedule.boardVersion(spaceId, eventId);
  }
}
