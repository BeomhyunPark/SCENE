package app.scene.event.application;

import app.scene.event.form.MealSlots;
import java.time.Instant;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Arrival standing per participant for the check-in roster (E4 #456, DEC-089 Follow-up). Same
 * inputs ({@link ArrivalSource}) and the same cursor as the meal counts, so the roster's {@code
 * OVERDUE} people are the next meal's "아직 안 옴". Callers check read access first.
 */
@Component
public class ArrivalRoster {

  private final ArrivalSource source;

  ArrivalRoster(ArrivalSource source) {
    this.source = source;
  }

  /** The slot a standing is about. {@code day} is the 1-based day, {@code dayLabel} its date. */
  public record Slot(String slotId, int day, String dayLabel, String label) {}

  /** One participant. {@code slot} is null when unknown or when nothing is attended. */
  public record Arrival(ArrivalStatus status, Slot slot) {}

  /**
   * {@code slotted} is false when the form has no setup or no slot: then {@code byParticipant} is
   * empty and the roster shows no arrival. {@code counts} has every status, zeros included.
   */
  public record Snapshot(
      boolean slotted,
      Instant asOf,
      Slot nextMeal,
      Map<UUID, Arrival> byParticipant,
      Map<ArrivalStatus, Long> counts) {

    /** The participant's arrival, or null when not slotted or not a submitted participant. */
    public Arrival of(UUID participantId) {
      return byParticipant.get(participantId);
    }
  }

  public Snapshot read(UUID spaceId, UUID eventId, Instant now) {
    ArrivalSource.Loaded loaded = source.load(spaceId, eventId);
    Map<ArrivalStatus, Long> counts = new EnumMap<>(ArrivalStatus.class);
    for (ArrivalStatus status : ArrivalStatus.values()) {
      counts.put(status, 0L);
    }
    if (loaded.days().isEmpty()) {
      return new Snapshot(false, now, null, Map.of(), counts);
    }
    Map<String, Slot> slots = new HashMap<>();
    for (MealSlots.Day day : loaded.days()) {
      for (MealSlots.Slot slot : day.slots()) {
        slots.put(slot.optionId(), new Slot(slot.optionId(), day.day(), day.label(), slot.label()));
      }
    }
    int cursor = MealTally.times(loaded.days(), loaded.scheduled(), now, loaded.zone()).cursor();
    Map<UUID, Arrival> byParticipant = new HashMap<>();
    for (ArrivalSource.Person person : loaded.people()) {
      MealTally.Standing standing =
          MealTally.standing(loaded.days(), person.attended(), person.arrived(), cursor);
      byParticipant.put(
          person.participantId(),
          new Arrival(
              standing.status(), standing.slotId() == null ? null : slots.get(standing.slotId())));
      counts.merge(standing.status(), 1L, Long::sum);
    }
    String next = MealTally.nextMeal(loaded.days(), cursor);
    return new Snapshot(true, now, next == null ? null : slots.get(next), byParticipant, counts);
  }
}
