package app.scene.event.form;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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
    boolean newcomer,
    boolean partial,
    boolean worshipOnly,
    Mode mode,
    List<Day> schedule,
    boolean groupBus,
    boolean worshipShuttle,
    boolean car,
    boolean publicTransit,
    boolean support) {

  /** Events longer than this cannot use the setup. Meals fit in one question's 50 options. */
  public static final int DAYS_MAX = 10;

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  public FormSetup {
    schedule = List.copyOf(schedule);
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
   * Reads the request body. Every key is required and every switch is a boolean, except {@code
   * newcomer}, which was added later and is off when missing. {@code schedule} must list exactly
   * {@code days} entries. {@code generatedFor} from an earlier response is accepted and ignored.
   * {@code attendance.mode} may be missing; then {@code fallback} is used (the stored mode, or
   * RANGE for a form without a setup).
   */
  public static FormSetup parse(JsonNode body, int days, Mode fallback) {
    if (body == null || !body.isObject()) {
      throw FieldRules.invalid("setup");
    }
    only(
        body,
        "setup",
        "gender",
        "middleGroup",
        "cell",
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
    only(transport, "transport", "groupBus", "worshipShuttle", "car", "publicTransit", "support");
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
        optionalFlag(body, "newcomer"),
        flag(attendance, "partial", "attendance"),
        flag(attendance, "worshipOnly", "attendance"),
        mode,
        list,
        flag(transport, "groupBus", "transport"),
        flag(transport, "worshipShuttle", "transport"),
        flag(transport, "car", "transport"),
        flag(transport, "publicTransit", "transport"),
        flag(transport, "support", "transport"));
  }

  /** The stored and returned JSON. {@code generatedFor} is the event period the questions used. */
  public ObjectNode toJson(LocalDate start, LocalDate end) {
    ObjectNode out = NODES.objectNode();
    out.put("gender", gender);
    out.put("middleGroup", middleGroup);
    out.put("cell", cell);
    out.put("newcomer", newcomer);
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

  /** A switch that may be missing (then off). A present value must be a boolean. */
  private static boolean optionalFlag(JsonNode parent, String key) {
    return parent.has(key) && flag(parent, key, "setup");
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
