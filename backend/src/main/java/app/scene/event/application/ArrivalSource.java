package app.scene.event.application;

import app.scene.event.application.mapper.ApplicationTableMapper;
import app.scene.event.application.param.EventApplicationKey;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.MealSlots;
import app.scene.event.participant.ParticipantProperties;
import app.scene.event.schedule.ScheduleSlotTimes;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The one read behind the meal counts (DEC-089) and the arrival roster (E4 #456): slot days, the
 * schedule's slot times, and every submitted participant's attended slots ({@link AttendedSlots})
 * with whether they are checked in now. Both screens read it, so their numbers cannot drift.
 */
@Component
class ArrivalSource {

  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationTableMapper tables;
  private final ScheduleSlotTimes slotTimes;
  private final ParticipantProperties properties;
  private final JsonMapper json;

  ArrivalSource(
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationTableMapper tables,
      ScheduleSlotTimes slotTimes,
      ParticipantProperties properties,
      JsonMapper json) {
    this.forms = forms;
    this.applications = applications;
    this.tables = tables;
    this.slotTimes = slotTimes;
    this.properties = properties;
    this.json = json;
  }

  /** One submitted participant. {@code attended} is null when unknown or without slots. */
  record Person(UUID participantId, List<String> attended, boolean arrived) {}

  /** {@code scheduled} is the {@code HH:mm} start time by slot id from the working schedule. */
  record Loaded(
      List<MealSlots.Day> days, Map<String, String> scheduled, List<Person> people, ZoneId zone) {}

  Loaded load(UUID spaceId, UUID eventId) {
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    List<FormFieldRow> fields =
        form == null ? List.of() : forms.findFields(spaceId, eventId, form.id());
    AttendedSlots attended = AttendedSlots.of(form == null ? null : form.setup(), fields, json);

    List<ApplicationTableState> states =
        tables.findStates(EventApplicationKey.of(spaceId, eventId));
    List<MealSlots.Day> days = attended.days();
    Map<UUID, Map<UUID, JsonNode>> answers = new HashMap<>();
    if (!days.isEmpty()) {
      for (ExportAnswerRow answer : applications.listSubmittedAnswers(spaceId, eventId)) {
        answers
            .computeIfAbsent(answer.applicationId(), id -> new HashMap<>())
            .put(answer.fieldId(), json.readTree(answer.value()));
      }
    }
    List<Person> people = new ArrayList<>();
    for (ApplicationTableState state : states) {
      people.add(
          new Person(
              state.participantId(),
              attended.of(answers.getOrDefault(state.applicationId(), Map.of())),
              state.checkedInAt() != null));
    }
    Map<String, String> scheduled =
        days.isEmpty() ? Map.of() : slotTimes.startTimes(spaceId, eventId);
    return new Loaded(days, scheduled, people, ZoneId.of(properties.zone()));
  }
}
