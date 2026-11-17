package app.scene.event.form;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import tools.jackson.databind.JsonNode;

/**
 * The day-by-day meal and worship slots of a stored setup (DEC-070), and which of them one
 * participant attends. The application summary (DEC-073) and the group board (DEC-072) both read
 * slots here, so a slot has the same id, order and label in both and the board's per-slot counts
 * add up to the summary's.
 *
 * <p>A slot id is the {@code MEALS} option id ({@code opt_d<day>_<meal>}). Days follow {@code
 * setup.schedule}, slots in a day go breakfast → lunch → dinner → worship, and a day without a slot
 * is left out.
 */
public final class MealSlots {

  /** Setup schedule key, kind, and generated wording, in question order. */
  private static final List<String[]> KINDS =
      List.of(
          new String[] {"breakfast", "BREAKFAST", "아침"},
          new String[] {"lunch", "LUNCH", "점심"},
          new String[] {"dinner", "DINNER", "저녁"},
          new String[] {"worship", "WORSHIP", "집회"});

  private MealSlots() {}

  /** {@code meal} is BREAKFAST, LUNCH, DINNER or WORSHIP. */
  public record Slot(String optionId, String meal, String label) {}

  /** {@code label} is the generated day label, for example {@code 1월 22일 (금)}. */
  public record Day(int day, LocalDate date, String label, List<Slot> slots) {}

  /**
   * The setup's days that have a slot. Empty when the setup is null, or has no start date or no
   * schedule, or no day has a slot. {@code labels} gives the current {@code MEALS} option label for
   * a slot id, or null to use the generated wording.
   */
  public static List<Day> days(JsonNode setup, Function<String, String> labels) {
    if (setup == null) {
      return List.of();
    }
    JsonNode start = setup.path("generatedFor").path("startDate");
    JsonNode schedule = setup.path("schedule");
    if (!start.isString() || !schedule.isArray()) {
      return List.of();
    }
    LocalDate first = LocalDate.parse(start.asString());
    List<Day> days = new ArrayList<>();
    for (int day = 1; day <= schedule.size(); day++) {
      JsonNode entry = schedule.get(day - 1);
      List<Slot> slots = new ArrayList<>();
      for (String[] kind : KINDS) {
        if (!entry.path(kind[0]).booleanValue()) {
          continue;
        }
        String id = "opt_d" + day + "_" + kind[0];
        String label = labels.apply(id);
        slots.add(new Slot(id, kind[1], label == null ? kind[2] : label));
      }
      if (!slots.isEmpty()) {
        LocalDate date = first.plusDays(day - 1L);
        days.add(new Day(day, date, FormPreset.dayLabel(date), List.copyOf(slots)));
      }
    }
    return List.copyOf(days);
  }

  /**
   * Current option labels of the {@code MEALS} question, by option id, from its stored config. Read
   * even when the question is turned off. A null config gives no label.
   */
  public static Function<String, String> labels(JsonNode mealsConfig) {
    Map<String, String> out = new HashMap<>();
    JsonNode options = mealsConfig == null ? null : mealsConfig.get("options");
    if (options != null && options.isArray()) {
      for (JsonNode option : options) {
        if (option.path("optionId").isString() && option.path("label").isString()) {
          out.put(option.get("optionId").asString(), option.get("label").asString());
        }
      }
    }
    return out::get;
  }

  /**
   * Slot ids the participant attends, in slot order. A full attendee attends every slot. A partial
   * or worship-only attendee attends the slots chosen in {@code mealsAnswer}; ids that are not a
   * slot are dropped. Null means unknown: not full, and no {@code MEALS} answer (the question is
   * off, or the application came before it).
   */
  public static List<String> attended(List<Day> days, boolean full, JsonNode mealsAnswer) {
    Set<String> chosen = null;
    if (!full) {
      if (mealsAnswer == null || !mealsAnswer.path("optionIds").isArray()) {
        return null;
      }
      chosen = new HashSet<>();
      for (JsonNode id : mealsAnswer.get("optionIds")) {
        if (id.isString()) {
          chosen.add(id.asString());
        }
      }
    }
    List<String> out = new ArrayList<>();
    for (Day day : days) {
      for (Slot slot : day.slots()) {
        if (chosen == null || chosen.contains(slot.optionId())) {
          out.add(slot.optionId());
        }
      }
    }
    return out;
  }
}
