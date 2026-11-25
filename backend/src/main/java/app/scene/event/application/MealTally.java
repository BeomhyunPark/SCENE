package app.scene.event.application;

import app.scene.event.form.ArrivalSlots;
import app.scene.event.form.MealSlots;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The counting rule of the meal counts (DEC-087 §5–§7), apart from reading, so it is tested with
 * any time. Each slot starts at its schedule item's time, or the meal's default time, on its day in
 * the event zone, and has passed {@link #GRACE} later. The first slot that has not passed (worship
 * included) is the cursor. For each meal slot a person attends: checked in is {@code arrived}; not
 * checked in is {@code coming} when their due slot ({@link ArrivalSlots#dueSlot}) is the cursor or
 * later, {@code missing} otherwise. A person with unknown slots counts in no slot.
 */
final class MealTally {

  /** A slot stays current until this long after it starts (DEC-087 §5). */
  static final Duration GRACE = Duration.ofHours(1);

  /** Start time when no schedule item holds the slot (DEC-087 §5). */
  static final Map<String, LocalTime> DEFAULT_TIMES =
      Map.of(
          "BREAKFAST", LocalTime.of(8, 0),
          "LUNCH", LocalTime.of(12, 0),
          "DINNER", LocalTime.of(18, 0),
          "WORSHIP", LocalTime.of(19, 30));

  private static final String WORSHIP = "WORSHIP";

  private MealTally() {}

  /** {@code attended} is {@link AttendedSlots#of}: slot ids in order, or null when unknown. */
  record Person(List<String> attended, boolean arrived) {}

  record Result(String nextSlotId, MealCounts.Unknown unknown, List<MealCounts.Day> days) {}

  /** {@code scheduled} is the {@code HH:mm} start time by slot id from the schedule. */
  static Result count(
      List<MealSlots.Day> days,
      Map<String, String> scheduled,
      List<Person> people,
      Instant now,
      ZoneId zone) {
    Map<String, LocalTime> starts = new HashMap<>();
    Map<String, Boolean> passed = new HashMap<>();
    int cursor = Integer.MAX_VALUE;
    for (MealSlots.Day day : days) {
      for (MealSlots.Slot slot : day.slots()) {
        String time = scheduled.get(slot.optionId());
        LocalTime start = time == null ? DEFAULT_TIMES.get(slot.meal()) : LocalTime.parse(time);
        starts.put(slot.optionId(), start);
        Instant over = day.date().atTime(start).atZone(zone).toInstant().plus(GRACE);
        boolean gone = !now.isBefore(over);
        passed.put(slot.optionId(), gone);
        if (!gone && cursor == Integer.MAX_VALUE) {
          cursor = MealSlots.order(slot.optionId());
        }
      }
    }

    // arrived, coming, missing
    Map<String, long[]> counts = new HashMap<>();
    long unknown = 0;
    long unknownArrived = 0;
    for (Person person : people) {
      List<String> ids = person.attended();
      if (ids == null) {
        unknown++;
        if (person.arrived()) {
          unknownArrived++;
        }
        continue;
      }
      for (String id : ids) {
        long[] count = counts.computeIfAbsent(id, key -> new long[3]);
        if (person.arrived()) {
          count[0]++;
        } else if (MealSlots.order(ArrivalSlots.dueSlot(days, ids, id)) >= cursor) {
          count[1]++;
        } else {
          count[2]++;
        }
      }
    }

    String next = null;
    List<MealCounts.Day> out = new ArrayList<>();
    for (MealSlots.Day day : days) {
      List<MealCounts.Slot> slots = new ArrayList<>();
      for (MealSlots.Slot slot : day.slots()) {
        if (WORSHIP.equals(slot.meal())) {
          continue;
        }
        String id = slot.optionId();
        if (next == null && MealSlots.order(id) >= cursor) {
          next = id;
        }
        long[] count = counts.getOrDefault(id, new long[3]);
        slots.add(
            new MealCounts.Slot(
                id,
                slot.meal(),
                slot.label(),
                starts.get(id).toString(),
                scheduled.containsKey(id),
                passed.get(id),
                count[0] + count[1] + count[2],
                count[0],
                count[1],
                count[2],
                count[0] + count[1]));
      }
      if (!slots.isEmpty()) {
        out.add(new MealCounts.Day(day.day(), day.date().toString(), day.label(), slots));
      }
    }
    return new Result(next, new MealCounts.Unknown(unknown, unknownArrived), out);
  }
}
