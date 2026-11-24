package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.mapper.ApplicationTableMapper;
import app.scene.event.application.param.EventApplicationKey;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.MealSlots;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.participant.ParticipantProperties;
import app.scene.event.schedule.ScheduleSlotTimes;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 식수 현황 (#454, DEC-087): per meal slot, the planned count of the submitted applications and the
 * count that reflects arrivals. Read access is the same as the application summary and the check-in
 * summary: effective {@code EVENT_READ}, or an active space OWNER or ADMIN. Every lifecycle state
 * reads; no audit row.
 *
 * <p>Attended slots are {@link AttendedSlots} (the summary's, the board's and the table's rule), so
 * {@code planned} equals the summary's meal count. Arrival is a current {@code CHECKED_IN}
 * check-in. A participant who has not arrived is {@code coming} for a slot while the start of their
 * run of attended slots has not passed, and {@code missing} after ({@link MealTally}).
 */
@Service
public class MealCountService {

  private final EventAccessGate gate;
  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationTableMapper tables;
  private final OperatorApplicationService reads;
  private final ScheduleSlotTimes slotTimes;
  private final ParticipantProperties properties;
  private final JsonMapper json;
  private final Clock clock;

  public MealCountService(
      EventAccessGate gate,
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationTableMapper tables,
      OperatorApplicationService reads,
      ScheduleSlotTimes slotTimes,
      ParticipantProperties properties,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.tables = tables;
    this.reads = reads;
    this.slotTimes = slotTimes;
    this.properties = properties;
    this.json = json;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public MealCounts read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!reads.mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
    String eventStatus = events.find(spaceId, eventId).map(EventRow::lifecycleStatus).orElse(null);

    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    List<FormFieldRow> fields =
        form == null ? List.of() : forms.findFields(spaceId, eventId, form.id());
    AttendedSlots attended = AttendedSlots.of(form == null ? null : form.setup(), fields, json);

    Map<UUID, Map<UUID, JsonNode>> answers = new HashMap<>();
    for (ExportAnswerRow answer : applications.listSubmittedAnswers(spaceId, eventId)) {
      answers
          .computeIfAbsent(answer.applicationId(), id -> new HashMap<>())
          .put(answer.fieldId(), json.readTree(answer.value()));
    }
    List<ApplicationTableState> people =
        tables.findStates(EventApplicationKey.of(spaceId, eventId));
    long checkedIn = people.stream().filter(person -> person.checkedInAt() != null).count();

    List<MealSlots.Day> days = attended.days();
    if (days.isEmpty()) {
      return new MealCounts(
          eventStatus,
          now,
          null,
          people.size(),
          checkedIn,
          new MealCounts.Unknown(0, 0),
          List.of());
    }

    List<MealTally.Person> tallied = new ArrayList<>();
    for (ApplicationTableState person : people) {
      tallied.add(
          new MealTally.Person(
              attended.of(answers.getOrDefault(person.applicationId(), Map.of())),
              person.checkedInAt() != null));
    }
    MealTally.Result result =
        MealTally.count(
            days,
            slotTimes.startTimes(spaceId, eventId),
            tallied,
            now,
            ZoneId.of(properties.zone()));
    return new MealCounts(
        eventStatus,
        now,
        result.nextSlotId(),
        people.size(),
        checkedIn,
        result.unknown(),
        result.days());
  }
}
