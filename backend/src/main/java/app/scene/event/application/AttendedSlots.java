package app.scene.event.application;

import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormSetup;
import app.scene.event.form.MealSlots;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Attended slots for the applicant table and the CSV, with the same rule as the summary and the
 * group board ({@link MealSlots#attended}, DEC-074). A turned-off question reads as no answer, and
 * a missing attendance answer is a full attendee.
 */
final class AttendedSlots {

  private static final Map<String, String> ATTENDANCE =
      Map.of(
          "opt_full", MealSlots.FULL,
          "opt_partial", MealSlots.PARTIAL,
          "opt_worship", MealSlots.WORSHIP_ONLY);

  private final JsonNode setup;
  private final List<MealSlots.Day> days;
  private final UUID attendance;
  private final UUID meals;
  private final UUID arrival;
  private final UUID departure;

  private AttendedSlots(
      JsonNode setup,
      List<MealSlots.Day> days,
      UUID attendance,
      UUID meals,
      UUID arrival,
      UUID departure) {
    this.setup = setup;
    this.days = days;
    this.attendance = attendance;
    this.meals = meals;
    this.arrival = arrival;
    this.departure = departure;
  }

  /** {@code setup} is the stored form setup text, or null. */
  static AttendedSlots of(String setup, List<FormFieldRow> fields, JsonMapper json) {
    JsonNode tree = setup == null ? null : json.readTree(setup);
    JsonNode mealsConfig = null;
    UUID attendance = null;
    UUID meals = null;
    UUID arrival = null;
    UUID departure = null;
    for (FormFieldRow field : fields) {
      String key = field.presetKey();
      if (key == null) {
        continue;
      }
      if ("MEALS".equals(key) && field.config() != null) {
        mealsConfig = json.readTree(field.config());
      }
      UUID visible = field.hidden() ? null : field.fieldId();
      switch (key) {
        case "ATTENDANCE" -> attendance = visible;
        case "MEALS" -> meals = visible;
        case "ARRIVAL_SLOT" -> arrival = visible;
        case "DEPARTURE_SLOT" -> departure = visible;
        default -> {}
      }
    }
    return new AttendedSlots(
        tree,
        MealSlots.days(tree, MealSlots.labels(mealsConfig)),
        attendance,
        meals,
        arrival,
        departure);
  }

  /** Slot days of the setup. Empty without a setup or without any slot. */
  List<MealSlots.Day> days() {
    return days;
  }

  boolean range() {
    return MealSlots.mode(setup) == FormSetup.Mode.RANGE;
  }

  /** Slot ids one applicant attends, or null when unknown or when there are no slots. */
  List<String> of(Map<UUID, JsonNode> answers) {
    if (days.isEmpty()) {
      return null;
    }
    String kind = MealSlots.FULL;
    JsonNode chosen = attendance == null ? null : answers.get(attendance);
    if (chosen != null && chosen.path("optionId").isString()) {
      kind = ATTENDANCE.getOrDefault(chosen.get("optionId").asString(), MealSlots.FULL);
    }
    return MealSlots.attended(
        setup,
        days,
        kind,
        new MealSlots.Answers(get(answers, meals), get(answers, arrival), get(answers, departure)));
  }

  private static JsonNode get(Map<UUID, JsonNode> answers, UUID fieldId) {
    return fieldId == null ? null : answers.get(fieldId);
  }
}
