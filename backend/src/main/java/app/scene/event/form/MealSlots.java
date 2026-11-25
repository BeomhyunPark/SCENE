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

  /** {@code attendance.mode} of a stored setup. A setup saved before the key existed is SLOTS. */
  public static FormSetup.Mode mode(JsonNode setup) {
    JsonNode mode = setup == null ? null : setup.path("attendance").path("mode");
    return mode != null && mode.isString() && "RANGE".equals(mode.asString())
        ? FormSetup.Mode.RANGE
        : FormSetup.Mode.SLOTS;
  }

  /**
   * Position of a slot id in slot order (day, then breakfast → lunch → dinner → worship), or -1
   * when {@code id} is not a slot id. Arrival and departure answers compare by this.
   */
  public static int order(String id) {
    if (id == null || !id.startsWith("opt_d")) {
      return -1;
    }
    int bar = id.indexOf('_', 5);
    if (bar < 0) {
      return -1;
    }
    int day;
    try {
      day = Integer.parseInt(id.substring(5, bar));
    } catch (NumberFormatException exception) {
      return -1;
    }
    String kind = id.substring(bar + 1);
    for (int index = 0; index < KINDS.size(); index++) {
      if (KINDS.get(index)[0].equals(kind)) {
        return day * KINDS.size() + index;
      }
    }
    return -1;
  }

  /** Day number of a slot id, or -1. */
  public static int day(String id) {
    int order = order(id);
    return order < 0 ? -1 : order / KINDS.size();
  }

  /**
   * One participant's answers that decide attended slots. Each is the stored value of a visible
   * question, or null: {@code meals} is {@code MEALS}, {@code arrival} and {@code departure} are
   * {@code ARRIVAL_SLOT} and {@code DEPARTURE_SLOT} (DEC-074).
   */
  public record Answers(JsonNode meals, JsonNode arrival, JsonNode departure) {}

  /** {@code kind} values, as the summary and the board name them. */
  public static final String FULL = "FULL";

  public static final String PARTIAL = "PARTIAL";
  public static final String WORSHIP_ONLY = "WORSHIP_ONLY";

  /**
   * Slot ids the participant attends, in slot order. The one rule for the summary, the board, the
   * table and the CSV (DEC-073, DEC-074).
   *
   * <ul>
   *   <li>A full attendee ({@code kind} FULL) attends every slot.
   *   <li>In SLOTS mode, and for a worship-only attendee in either mode, the slots chosen in {@code
   *       MEALS}.
   *   <li>In RANGE mode a partial attendee attends every slot from the arrival slot to the
   *       departure slot, both included.
   * </ul>
   *
   * Null means unknown: no usable answer (the question is off, the application came before it, or a
   * range runs backwards).
   */
  public static List<String> attended(
      JsonNode setup, List<Day> days, String kind, Answers answers) {
    if (FULL.equals(kind)) {
      return attended(days, true, null);
    }
    if (mode(setup) == FormSetup.Mode.RANGE && PARTIAL.equals(kind)) {
      int from = order(optionId(answers.arrival()));
      int to = order(optionId(answers.departure()));
      if (from < 0 || to < 0 || from > to) {
        return null;
      }
      List<String> out = new ArrayList<>();
      for (Day day : days) {
        for (Slot slot : day.slots()) {
          int at = order(slot.optionId());
          if (at >= from && at <= to) {
            out.add(slot.optionId());
          }
        }
      }
      return out;
    }
    return attended(days, false, answers.meals());
  }

  /**
   * Nights a RANGE-mode partial attendee sleeps over: night {@code n} (the evening of day {@code
   * n}) when they arrive on day {@code n} or earlier and leave on day {@code n + 1} or later. Null
   * when the range is unknown, as in {@link #attended(JsonNode, List, String, Answers)}.
   */
  public static List<Integer> nights(Answers answers) {
    String arrival = optionId(answers.arrival());
    String departure = optionId(answers.departure());
    int from = order(arrival);
    int to = order(departure);
    if (from < 0 || to < 0 || from > to) {
      return null;
    }
    List<Integer> out = new ArrayList<>();
    for (int night = day(arrival); night < day(departure); night++) {
      out.add(night);
    }
    return out;
  }

  /**
   * One participant's answers that decide lodging nights, besides the slot answers. {@code
   * lodgingAsked} is whether the form has a visible {@code LODGING} question; {@code lodging} and
   * {@code noLodging} are the stored values of the visible {@code LODGING} and {@code NO_LODGING}
   * questions, or null.
   */
  public record LodgingAnswers(boolean lodgingAsked, JsonNode lodging, JsonNode noLodging) {}

  /**
   * Number of nights of the setup period ({@code generatedFor.startDate} to {@code endDate}), or 0
   * when the setup has no usable period.
   */
  public static int nightCount(JsonNode setup) {
    if (setup == null) {
      return 0;
    }
    JsonNode start = setup.path("generatedFor").path("startDate");
    JsonNode end = setup.path("generatedFor").path("endDate");
    if (!start.isString() || !end.isString()) {
      return 0;
    }
    long nights =
        LocalDate.parse(end.asString()).toEpochDay()
            - LocalDate.parse(start.asString()).toEpochDay();
    return nights > 0 ? (int) nights : 0;
  }

  /**
   * Nights (1-based, night {@code n} is the evening of day {@code n}) one participant sleeps over,
   * in order. The one rule for the summary's lodging rows (DEC-073), the group leader's {@code
   * lodgingNights} (DEC-083) and rooms (DEC-085 §6).
   *
   * <ul>
   *   <li>Someone who checked {@code NO_LODGING} sleeps no night (DEC-074 Follow-up 2026-11-17).
   *   <li>A full attendee sleeps every night; a worship-only attendee none.
   *   <li>A RANGE-mode partial attendee sleeps the nights of {@link #nights(Answers)}.
   *   <li>Another partial attendee sleeps the nights chosen in {@code LODGING}; the question is
   *       optional, so no answer is no night.
   * </ul>
   *
   * Null means unknown: the setup has no period, or a partial attendee has no usable range (RANGE)
   * or no visible {@code LODGING} question. Nights outside the period are dropped.
   */
  public static List<Integer> lodgingNights(
      JsonNode setup, String kind, Answers slots, LodgingAnswers answers) {
    int count = nightCount(setup);
    if (count == 0) {
      return null;
    }
    if (home(answers.noLodging()) || WORSHIP_ONLY.equals(kind)) {
      return List.of();
    }
    List<Integer> out = new ArrayList<>();
    if (!PARTIAL.equals(kind)) {
      for (int night = 1; night <= count; night++) {
        out.add(night);
      }
      return out;
    }
    if (mode(setup) == FormSetup.Mode.RANGE) {
      List<Integer> range = nights(slots);
      if (range == null) {
        return null;
      }
      range.stream().filter(night -> night >= 1 && night <= count).forEach(out::add);
      return out;
    }
    if (!answers.lodgingAsked()) {
      return null;
    }
    JsonNode ids = answers.lodging() == null ? null : answers.lodging().get("optionIds");
    Set<Integer> chosen = new HashSet<>();
    if (ids != null && ids.isArray()) {
      for (JsonNode id : ids) {
        if (id.isString() && id.asString().startsWith("opt_n")) {
          try {
            chosen.add(Integer.parseInt(id.asString().substring(5)));
          } catch (NumberFormatException exception) {
            // Not a night option.
          }
        }
      }
    }
    for (int night = 1; night <= count; night++) {
      if (chosen.contains(night)) {
        out.add(night);
      }
    }
    return out;
  }

  private static boolean home(JsonNode noLodging) {
    JsonNode ids = noLodging == null ? null : noLodging.get("optionIds");
    if (ids == null || !ids.isArray()) {
      return false;
    }
    for (JsonNode id : ids) {
      if (id.isString() && FormPreset.NO_LODGING.equals(id.asString())) {
        return true;
      }
    }
    return false;
  }

  private static String optionId(JsonNode answer) {
    JsonNode id = answer == null ? null : answer.get("optionId");
    return id != null && id.isString() ? id.asString() : null;
  }

  /**
   * Slot ids the participant attends, in slot order. A full attendee attends every slot. A partial
   * or worship-only attendee attends the slots chosen in {@code mealsAnswer}; ids that are not a
   * slot are dropped. Null means unknown: not full, and no {@code MEALS} answer (the question is
   * off, or the application came before it).
   */
  static List<String> attended(List<Day> days, boolean full, JsonNode mealsAnswer) {
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
