package app.scene.event.form;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * The operator's answers on the form setup card (DEC-070). {@link FormPreset} turns them into
 * questions. {@code schedule} has one entry per event day, in date order.
 */
public record FormSetup(
    boolean gender,
    boolean middleGroup,
    boolean cell,
    List<String> middleGroups,
    List<String> cells,
    boolean partial,
    boolean worshipOnly,
    Mode mode,
    List<Day> schedule,
    boolean groupBus,
    boolean worshipShuttle,
    boolean car,
    boolean publicTransit,
    boolean support,
    boolean partialByTime) {

  /** Events longer than this cannot use the setup. Meals fit in one question's 50 options. */
  public static final int DAYS_MAX = 10;

  /**
   * Most entries in the middle group or cell list. One more option, {@code 새가족 (등반X)}, may join
   * them, and a question holds at most 50 options.
   */
  public static final int LIST_MAX = 49;

  /** Longest middle group or cell name. */
  public static final int LIST_ITEM_MAX = 50;

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  public FormSetup {
    schedule = List.copyOf(schedule);
    middleGroups = List.copyOf(middleGroups);
    cells = List.copyOf(cells);
  }

  /**
   * How a partial attendee says which slots they attend (DEC-074). {@code RANGE}: an arrival slot
   * and a departure slot, and every slot between is attended. {@code SLOTS}: each slot is chosen in
   * {@code MEALS}.
   */
  public enum Mode {
    RANGE,
    SLOTS
  }

  /** Which meals and worship services one event day has. */
  public record Day(boolean breakfast, boolean lunch, boolean dinner, boolean worship) {

    boolean any() {
      return breakfast || lunch || dinner || worship;
    }
  }

  /** True when the form asks how the participant attends. */
  public boolean asksAttendance() {
    return partial || worshipOnly;
  }

  /** True when partial attendees give an arrival and a departure slot instead of choosing slots. */
  public boolean range() {
    return mode == Mode.RANGE;
  }

  public boolean anyTransport() {
    return groupBus || worshipShuttle || car || publicTransit || support;
  }

  /** Days from {@code start} to {@code end}, both included. */
  public static int days(LocalDate start, LocalDate end) {
    return (int) ChronoUnit.DAYS.between(start, end) + 1;
  }

  /**
   * Reads the request body. Every key is required and every switch is a boolean, except the lists
   * below. {@code middleGroups} and {@code cells} are lists of names, empty when missing; blank
   * entries are dropped and repeats kept once. A former {@code newcomer} switch (DEC-070 Follow-up
   * 2026-11-17, replaced the same day) is accepted and ignored, and the next save drops it. {@code
   * schedule} must list exactly {@code days} entries. {@code generatedFor} from an earlier response
   * is accepted and ignored. {@code attendance.mode} may be missing; then {@code fallback} is used
   * (the stored mode, or RANGE for a form without a setup). {@code transport.partialByTime} may be
   * missing too; then {@code fallbackByTime} is used (the stored value, or false).
   */
  public static FormSetup parse(JsonNode body, int days, Mode fallback, boolean fallbackByTime) {
    if (body == null || !body.isObject()) {
      throw FieldRules.invalid("setup");
    }
    only(
        body,
        "setup",
        "gender",
        "middleGroup",
        "cell",
        "middleGroups",
        "cells",
        "newcomer",
        "attendance",
        "schedule",
        "transport",
        "generatedFor");
    JsonNode attendance = object(body.get("attendance"), "attendance");
    only(attendance, "attendance", "partial", "worshipOnly", "mode");
    Mode mode = fallback;
    if (attendance.has("mode")) {
      JsonNode node = attendance.get("mode");
      if (!node.isString()) {
        throw FieldRules.invalid("attendance");
      }
      try {
        mode = Mode.valueOf(node.asString());
      } catch (IllegalArgumentException exception) {
        throw FieldRules.invalid("attendance");
      }
    }
    JsonNode transport = object(body.get("transport"), "transport");
    only(
        transport,
        "transport",
        "groupBus",
        "worshipShuttle",
        "car",
        "publicTransit",
        "support",
        "partialByTime");
    JsonNode schedule = body.get("schedule");
    if (schedule == null || !schedule.isArray() || schedule.size() != days) {
      throw FieldRules.invalid("schedule");
    }
    List<Day> list = new ArrayList<>();
    for (JsonNode day : schedule) {
      JsonNode entry = object(day, "schedule");
      only(entry, "schedule", "breakfast", "lunch", "dinner", "worship");
      list.add(
          new Day(
              flag(entry, "breakfast", "schedule"),
              flag(entry, "lunch", "schedule"),
              flag(entry, "dinner", "schedule"),
              flag(entry, "worship", "schedule")));
    }
    return new FormSetup(
        flag(body, "gender", "gender"),
        flag(body, "middleGroup", "middleGroup"),
        flag(body, "cell", "cell"),
        names(body.get("middleGroups"), "middleGroups"),
        names(body.get("cells"), "cells"),
        flag(attendance, "partial", "attendance"),
        flag(attendance, "worshipOnly", "attendance"),
        mode,
        list,
        flag(transport, "groupBus", "transport"),
        flag(transport, "worshipShuttle", "transport"),
        flag(transport, "car", "transport"),
        flag(transport, "publicTransit", "transport"),
        flag(transport, "support", "transport"),
        transport.has("partialByTime")
            ? flag(transport, "partialByTime", "transport")
            : fallbackByTime);
  }

  /**
   * {@code transport.partialByTime} of a stored setup. A setup saved before the key existed is
   * false, so its vehicle options keep the conditions they were made with.
   */
  public static boolean partialByTime(JsonNode setup) {
    JsonNode node = setup == null ? null : setup.path("transport").path("partialByTime");
    return node != null && node.isBoolean() && node.booleanValue();
  }

  /** The stored and returned JSON. {@code generatedFor} is the event period the questions used. */
  public ObjectNode toJson(LocalDate start, LocalDate end) {
    ObjectNode out = NODES.objectNode();
    out.put("gender", gender);
    out.put("middleGroup", middleGroup);
    out.put("cell", cell);
    ArrayNode middleGroupList = out.putArray("middleGroups");
    middleGroups.forEach(middleGroupList::add);
    ArrayNode cellList = out.putArray("cells");
    cells.forEach(cellList::add);
    ObjectNode attendance = out.putObject("attendance");
    attendance.put("partial", partial);
    attendance.put("worshipOnly", worshipOnly);
    attendance.put("mode", mode.name());
    ArrayNode days = out.putArray("schedule");
    for (Day day : schedule) {
      ObjectNode entry = days.addObject();
      entry.put("breakfast", day.breakfast());
      entry.put("lunch", day.lunch());
      entry.put("dinner", day.dinner());
      entry.put("worship", day.worship());
    }
    ObjectNode transport = out.putObject("transport");
    transport.put("groupBus", groupBus);
    transport.put("worshipShuttle", worshipShuttle);
    transport.put("car", car);
    transport.put("publicTransit", publicTransit);
    transport.put("support", support);
    transport.put("partialByTime", partialByTime);
    ObjectNode generatedFor = out.putObject("generatedFor");
    generatedFor.put("startDate", start.toString());
    generatedFor.put("endDate", end.toString());
    return out;
  }

  private static JsonNode object(JsonNode node, String name) {
    if (node == null || !node.isObject()) {
      throw FieldRules.invalid(name);
    }
    return node;
  }

  private static boolean flag(JsonNode parent, String key, String name) {
    JsonNode node = parent.get(key);
    if (node == null || !node.isBoolean()) {
      throw FieldRules.invalid(name);
    }
    return node.booleanValue();
  }

  /** A list of names that may be missing (then empty). */
  private static List<String> names(JsonNode node, String name) {
    if (node == null || node.isNull()) {
      return List.of();
    }
    if (!node.isArray()) {
      throw FieldRules.invalid(name);
    }
    Set<String> out = new LinkedHashSet<>();
    for (JsonNode item : node) {
      if (!item.isString()) {
        throw FieldRules.invalid(name);
      }
      String text = item.asString().strip();
      if (text.length() > LIST_ITEM_MAX) {
        throw FieldRules.invalid(name);
      }
      if (!text.isEmpty()) {
        out.add(text);
      }
    }
    if (out.size() > LIST_MAX) {
      throw FieldRules.invalid(name);
    }
    return List.copyOf(out);
  }

  private static void only(JsonNode node, String name, String... keys) {
    Set<String> allowed = Set.of(keys);
    for (String key : node.propertyNames()) {
      if (!allowed.contains(key)) {
        throw FieldRules.invalid(name);
      }
    }
  }
}
