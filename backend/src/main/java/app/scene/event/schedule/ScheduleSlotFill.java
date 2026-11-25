package app.scene.event.schedule;

import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.MealSlots;
import app.scene.event.lifecycle.EventProfile;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Keeps one working-copy schedule item for every meal and worship slot of the form setup (DEC-090,
 * roadmap C6). The operator does not press anything: a setup save fits the schedule to the setup.
 *
 * <ul>
 *   <li>A slot with no item, that the operator has not taken off the schedule, gets one: its title
 *       is the slot label, its start the default time ({@link MealSlots#defaultStart}), its
 *       category MEAL or WORSHIP, for everyone, and it holds the slot id.
 *   <li>An item that already holds the slot is never touched, so the operator's time, title and
 *       place stay.
 *   <li>A slot whose item the operator deleted or unlinked is remembered ({@code
 *       schedule_slot_dismissals}) and is not filled again until "식사·집회 다시 넣기".
 *   <li>An item the server put in and nobody changed (version 1) leaves when its slot leaves the
 *       setup. A changed one stays and the board marks it {@code slotRemoved}.
 * </ul>
 *
 * Everything lands in the working copy only. Participants see it after a publication, and the fill
 * raises no feed version, notification or audit.
 */
@Component
public class ScheduleSlotFill {

  /** Items put in and taken out by one fill. */
  public record Result(int added, int removed) {
    static final Result NONE = new Result(0, 0);

    boolean any() {
      return added > 0 || removed > 0;
    }
  }

  private final FormRepository forms;
  private final ScheduleRepository schedule;
  private final EventRepository events;
  private final JsonMapper json;
  private final Clock clock;

  ScheduleSlotFill(
      FormRepository forms,
      ScheduleRepository schedule,
      EventRepository events,
      JsonMapper json,
      Clock clock) {
    this.forms = forms;
    this.schedule = schedule;
    this.events = events;
    this.json = json;
    this.clock = clock;
  }

  /**
   * After the form setup is saved, in the same transaction (DEC-090 §1). Locks the event row as
   * schedule writes do. An event that is ended or archived, or has no period, is left as it is.
   */
  public Result afterSetupSaved(UUID spaceId, UUID eventId, UUID actorId) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    if (!"DRAFT".equals(event.lifecycleStatus()) && !"ACTIVE".equals(event.lifecycleStatus())) {
      return Result.NONE;
    }
    EventProfile profile = events.findProfile(eventId).orElse(null);
    if (profile == null) {
      return Result.NONE;
    }
    return fillLocked(
        spaceId, eventId, actorId, ScheduleViews.dayCount(profile.startDate(), profile.endDate()));
  }

  /**
   * The fill itself. The caller holds the event row lock and has checked the event state. Raises
   * the board version once when anything changed.
   */
  Result fillLocked(UUID spaceId, UUID eventId, UUID actorId, int dayCount) {
    if (dayCount < 1) {
      return Result.NONE;
    }
    List<MealSlots.Day> days = setupDays(spaceId, eventId);
    Set<String> current = new LinkedHashSet<>();
    for (MealSlots.Day day : days) {
      if (day.day() <= dayCount) {
        day.slots().forEach(slot -> current.add(slot.optionId()));
      }
    }
    Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
    List<ScheduleItemRow> rows = schedule.items(spaceId, eventId);
    int removed = 0;
    Set<String> linked = new HashSet<>();
    for (ScheduleItemRow row : rows) {
      if (row.slotId() == null) {
        continue;
      }
      if (row.autoFilled() && row.version() == 1 && !current.contains(row.slotId())) {
        schedule.delete(spaceId, eventId, row.itemId());
        removed++;
      } else {
        linked.add(row.slotId());
      }
    }
    int count = rows.size() - removed;
    int added = 0;
    Set<String> dismissed = schedule.dismissedSlots(spaceId, eventId);
    for (MealSlots.Day day : days) {
      if (day.day() > dayCount) {
        continue;
      }
      for (MealSlots.Slot slot : day.slots()) {
        if (linked.contains(slot.optionId()) || dismissed.contains(slot.optionId())) {
          continue;
        }
        if (count >= ScheduleService.ITEMS_MAX) {
          break;
        }
        String start = MealSlots.defaultStart(slot.meal());
        ItemContent content =
            new ItemContent(
                day.day(),
                start,
                null,
                title(slot.label()),
                null,
                null,
                MealSlots.category(slot.meal()),
                Audience.of(AudienceType.ALL),
                slot.optionId(),
                schedule.nextSortOrder(spaceId, eventId, day.day(), start));
        schedule.insertAutoFilled(spaceId, eventId, UUID.randomUUID(), content, actorId, now);
        count++;
        added++;
      }
    }
    Result result = new Result(added, removed);
    if (result.any()) {
      schedule.bumpBoardVersion(spaceId, eventId, now);
    }
    return result;
  }

  /**
   * The setup's slot days with the current {@code MEALS} labels, as the group board and the meal
   * counts read them ({@link MealSlots#days}). Empty without a form or a setup.
   */
  List<MealSlots.Day> setupDays(UUID spaceId, UUID eventId) {
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    if (form == null || form.setup() == null) {
      return List.of();
    }
    JsonNode setup = json.readTree(form.setup());
    JsonNode meals = null;
    for (FormFieldRow field : forms.findFields(spaceId, eventId, form.id())) {
      if ("MEALS".equals(field.presetKey())) {
        meals = field.config() == null ? null : json.readTree(field.config());
      }
    }
    return MealSlots.days(setup, MealSlots.labels(meals));
  }

  private static String title(String label) {
    String trimmed = label.strip();
    return trimmed.length() > ItemInput.TITLE_MAX
        ? trimmed.substring(0, ItemInput.TITLE_MAX)
        : trimmed;
  }
}
