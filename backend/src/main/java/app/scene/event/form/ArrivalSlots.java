package app.scene.event.form;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * When a participant is due to arrive, from their attended slots ({@link MealSlots#attended}). The
 * meal counts (DEC-087 §4) use it to tell "still coming" from "should have come", and the arrival
 * roster (E4, #456) can show the same slot.
 */
public final class ArrivalSlots {

  private ArrivalSlots() {}

  /** The first attended slot, or null when {@code attended} is null or empty. */
  public static String arrival(List<String> attended) {
    return attended == null || attended.isEmpty() ? null : attended.getFirst();
  }

  /**
   * The first slot of the run of attended slots that holds {@code slotId}, or null when the
   * participant does not attend it. A run is broken by a meal slot the participant does not attend;
   * a skipped worship slot does not break it. A full or RANGE attendee has one run, so this is
   * their arrival slot; a SLOTS attendee who comes on separate days is due again at each run.
   */
  public static String dueSlot(List<MealSlots.Day> days, List<String> attended, String slotId) {
    if (attended == null || !attended.contains(slotId)) {
      return null;
    }
    Set<String> chosen = new HashSet<>(attended);
    String start = null;
    for (MealSlots.Day day : days) {
      for (MealSlots.Slot slot : day.slots()) {
        if (chosen.contains(slot.optionId())) {
          if (start == null) {
            start = slot.optionId();
          }
          if (slot.optionId().equals(slotId)) {
            return start;
          }
        } else if (!"WORSHIP".equals(slot.meal())) {
          start = null;
        }
      }
    }
    return null;
  }
}
