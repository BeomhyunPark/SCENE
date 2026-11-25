package app.scene.event.schedule;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Start times of the working-copy schedule items tied to a form slot ({@code slotId}, DEC-081), for
 * other features. The meal counts (DEC-087 §5) read when each meal starts from here.
 */
@Component
public class ScheduleSlotTimes {

  private final ScheduleRepository schedule;

  ScheduleSlotTimes(ScheduleRepository schedule) {
    this.schedule = schedule;
  }

  /** {@code HH:mm} start time by slot id. A slot without an item is absent. */
  public Map<String, String> startTimes(UUID spaceId, UUID eventId) {
    Map<String, String> out = new HashMap<>();
    for (ScheduleItemRow item : schedule.items(spaceId, eventId)) {
      if (item.slotId() != null) {
        out.put(item.slotId(), item.startTime());
      }
    }
    return out;
  }
}
