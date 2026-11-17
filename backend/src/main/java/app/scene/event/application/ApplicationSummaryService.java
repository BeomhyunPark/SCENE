package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.ApplicationSummary.Attendance;
import app.scene.event.application.ApplicationSummary.Carpool;
import app.scene.event.application.ApplicationSummary.Choice;
import app.scene.event.application.ApplicationSummary.CohortCount;
import app.scene.event.application.ApplicationSummary.Cohorts;
import app.scene.event.application.ApplicationSummary.Lodging;
import app.scene.event.application.ApplicationSummary.MealDay;
import app.scene.event.application.ApplicationSummary.Meals;
import app.scene.event.application.ApplicationSummary.Mobility;
import app.scene.event.application.ApplicationSummary.Night;
import app.scene.event.application.ApplicationSummary.Offer;
import app.scene.event.application.ApplicationSummary.OptionCount;
import app.scene.event.application.ApplicationSummary.Request;
import app.scene.event.application.ApplicationSummary.Shuttle;
import app.scene.event.application.ApplicationSummary.Slot;
import app.scene.event.application.ApplicationSummary.Transport;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormPreset;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.form.FormSetup;
import app.scene.event.form.MealSlots;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator summary of the event's {@code SUBMITTED} applications (#251, DEC-073). Read access is
 * the same as the application reads: effective {@code EVENT_READ}, or an active space owner or
 * admin. Every lifecycle state reads. No audit row is written, as for the other reads.
 *
 * <p>Answers are found by the fixed preset keys and option ids (DEC-070). A turned-off question
 * ({@code hidden}) reads as no answer, as on the group board (DEC-072). Missing answers count as
 * DEC-070 §3 says: a full attendee eats every meal and sleeps every night, a worship-only attendee
 * sleeps none, and a driver there drives back. Days, meals and nights follow the stored setup.
 */
@Service
public class ApplicationSummaryService {

  static final String FULL = "FULL";
  static final String PARTIAL = "PARTIAL";
  static final String WORSHIP_ONLY = "WORSHIP_ONLY";
  static final String CAR = "opt_car";
  static final String RIDE = "opt_ride";

  /** Ways there whose way back is not asked: the same car comes back (DEC-070 §3). */
  private static final Set<String> SAME_WAY_BACK = Set.of(CAR, RIDE);

  static final String SHUTTLE = "opt_shuttle";

  private static final Map<String, String> ATTENDANCE =
      Map.of("opt_full", FULL, "opt_partial", PARTIAL, "opt_worship", WORSHIP_ONLY);

  private static final Comparator<String> NAMES = Comparator.nullsLast(Comparator.naturalOrder());

  private final EventAccessGate gate;
  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final OperatorApplicationService reads;
  private final JsonMapper json;

  public ApplicationSummaryService(
      EventAccessGate gate,
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      OperatorApplicationService reads,
      JsonMapper json) {
    this.gate = gate;
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.reads = reads;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public ApplicationSummary summary(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!reads.mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    String eventStatus = events.find(spaceId, eventId).map(EventRow::lifecycleStatus).orElse(null);
    FormRow form = forms.findByEvent(spaceId, eventId).orElse(null);
    if (form == null) {
      return new ApplicationSummary(
          eventStatus,
          null,
          false,
          0,
          new Attendance(false, 0, 0, 0),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    }

    Map<String, Question> byKey = new HashMap<>();
    Question name = null;
    Question cohort = null;
    for (FormFieldRow field : forms.findFields(spaceId, eventId, form.id())) {
      Question question = new Question(field, read(field.config()));
      if (field.presetKey() != null) {
        byKey.put(field.presetKey(), question);
      } else if ("NAME".equals(field.systemKey())) {
        name = question;
      } else if ("COHORT".equals(field.systemKey())) {
        cohort = question;
      }
    }
    Map<UUID, Map<UUID, JsonNode>> stored = new HashMap<>();
    for (ExportAnswerRow answer : applications.listSubmittedAnswers(spaceId, eventId)) {
      stored
          .computeIfAbsent(answer.applicationId(), id -> new HashMap<>())
          .put(answer.fieldId(), read(answer.value()));
    }
    List<Applicant> people = new ArrayList<>();
    for (ApplicationRow row : applications.listSubmitted(spaceId, eventId)) {
      people.add(
          new Applicant(row.applicationId(), stored.getOrDefault(row.applicationId(), Map.of())));
    }

    Answers answers = new Answers(byKey);
    Question attendanceQuestion = answers.visible("ATTENDANCE");
    Map<String, List<Applicant>> byAttendance = new LinkedHashMap<>();
    byAttendance.put(FULL, new ArrayList<>());
    byAttendance.put(PARTIAL, new ArrayList<>());
    byAttendance.put(WORSHIP_ONLY, new ArrayList<>());
    for (Applicant person : people) {
      String kind = FULL;
      String optionId = optionId(person.answer(attendanceQuestion));
      if (optionId != null) {
        kind = ATTENDANCE.getOrDefault(optionId, FULL);
      }
      byAttendance.get(kind).add(person);
    }
    Attendance attendance =
        new Attendance(
            attendanceQuestion != null,
            byAttendance.get(FULL).size(),
            byAttendance.get(PARTIAL).size(),
            byAttendance.get(WORSHIP_ONLY).size());

    JsonNode setup = form.setup() == null ? null : read(form.setup());
    Directory directory = new Directory(visible(name), visible(cohort));
    Transport transport = transport(answers, people);
    return new ApplicationSummary(
        eventStatus,
        form.id(),
        setup != null,
        people.size(),
        attendance,
        single(answers.visible("GENDER"), people),
        cohorts(visible(cohort), people),
        setup == null ? null : meals(setup, answers, byAttendance),
        setup == null ? null : lodging(setup, answers, byAttendance),
        transport,
        shuttle(answers, people),
        carpool(answers, people, directory),
        mobility(answers, people, directory));
  }

  private static Choice single(Question question, List<Applicant> people) {
    if (question == null) {
      return null;
    }
    Map<String, Long> counts = new HashMap<>();
    long none = 0;
    for (Applicant person : people) {
      String id = optionId(person.answer(question));
      if (id == null || question.option(id) == null) {
        none++;
      } else {
        counts.merge(id, 1L, Long::sum);
      }
    }
    return new Choice(question.counts(counts), none);
  }

  private static Cohorts cohorts(Question question, List<Applicant> people) {
    if (question == null) {
      return null;
    }
    Map<String, Long> counts = new TreeMap<>();
    long none = 0;
    for (Applicant person : people) {
      String text = text(person.answer(question));
      if (text == null) {
        none++;
      } else {
        counts.merge(text, 1L, Long::sum);
      }
    }
    List<CohortCount> items = new ArrayList<>();
    counts.forEach((key, count) -> items.add(new CohortCount(key, count)));
    return new Cohorts(items, none);
  }

  /**
   * One row per setup meal, by day. Full attendees count in every cell. Partial and worship-only
   * attendees count in the cells they chose; with no answer they count in {@code unanswered}. Slots
   * and this rule are {@link MealSlots}, shared with the group board.
   */
  private static Meals meals(
      JsonNode setup, Answers answers, Map<String, List<Applicant>> byAttendance) {
    Question labels = answers.any("MEALS");
    List<MealSlots.Day> days =
        MealSlots.days(setup, MealSlots.labels(labels == null ? null : labels.config()));
    if (days.isEmpty()) {
      return null;
    }
    Map<String, Long> counts = new HashMap<>();
    long unanswered = 0;
    for (Map.Entry<String, List<Applicant>> kind : byAttendance.entrySet()) {
      for (Applicant person : kind.getValue()) {
        List<String> ids =
            MealSlots.attended(setup, days, kind.getKey(), slotAnswers(answers, person));
        if (ids == null) {
          unanswered++;
        } else {
          ids.forEach(id -> counts.merge(id, 1L, Long::sum));
        }
      }
    }
    List<MealDay> out = new ArrayList<>();
    for (MealSlots.Day day : days) {
      List<Slot> slots = new ArrayList<>();
      for (MealSlots.Slot slot : day.slots()) {
        slots.add(
            new Slot(
                slot.optionId(),
                slot.meal(),
                slot.label(),
                counts.getOrDefault(slot.optionId(), 0L)));
      }
      out.add(new MealDay(day.day(), day.date().toString(), day.label(), slots));
    }
    return new Meals(out, unanswered);
  }

  /**
   * One row per night of the setup period. Full attendees sleep every night, worship-only none.
   * Partial attendees count on the nights they chose; the question is optional, so no answer is no
   * night. When the question is not visible, partial attendees count in {@code unanswered}. In
   * RANGE mode (DEC-074) partial nights come from the arrival and departure slots, and a partial
   * attendee without a usable range counts in {@code unanswered}. A full or partial attendee who
   * checked {@code NO_LODGING} counts on no night, and a partial one is not unanswered either.
   */
  private static Lodging lodging(
      JsonNode setup, Answers answers, Map<String, List<Applicant>> byAttendance) {
    LocalDate start = start(setup);
    LocalDate end = date(setup.path("generatedFor").path("endDate"));
    if (start == null || end == null || !end.isAfter(start)) {
      return null;
    }
    boolean range = MealSlots.mode(setup) == FormSetup.Mode.RANGE;
    Question question = range ? null : answers.visible("LODGING");
    Question labels = answers.any("LODGING");
    // DEC-074 Follow-up 2026-11-17: a commuter sleeps at home and drops out of every night.
    Question noLodging = answers.visible("NO_LODGING");
    long full = byAttendance.get(FULL).stream().filter(person -> !home(person, noLodging)).count();
    Map<String, Long> chosen = new HashMap<>();
    long unknown = 0;
    for (Applicant person : byAttendance.get(PARTIAL)) {
      if (home(person, noLodging)) {
        continue;
      }
      if (range) {
        // DEC-074: nights follow the arrival and departure slots.
        List<Integer> nights = MealSlots.nights(slotAnswers(answers, person));
        if (nights == null) {
          unknown++;
        } else {
          nights.forEach(night -> chosen.merge("opt_n" + night, 1L, Long::sum));
        }
        continue;
      }
      Set<String> ids = optionIds(person.answer(question));
      if (ids != null) {
        ids.forEach(id -> chosen.merge(id, 1L, Long::sum));
      }
    }
    List<Night> nights = new ArrayList<>();
    int count = (int) (end.toEpochDay() - start.toEpochDay());
    for (int night = 1; night <= count; night++) {
      String id = "opt_n" + night;
      LocalDate date = start.plusDays(night - 1L);
      String label = labels == null ? null : labels.label(id);
      nights.add(
          new Night(
              id,
              night,
              date.toString(),
              label == null ? FormPreset.nightLabel(night, date) : label,
              full + chosen.getOrDefault(id, 0L)));
    }
    long unanswered = range ? unknown : question == null ? byAttendance.get(PARTIAL).size() : 0;
    return new Lodging(nights, unanswered);
  }

  /** True when the participant checked {@code 수련회장에서 숙박하지 않아요}. */
  private static boolean home(Applicant person, Question noLodging) {
    if (noLodging == null) {
      return false;
    }
    Set<String> ids = optionIds(person.answer(noLodging));
    return ids != null && ids.contains(FormPreset.NO_LODGING);
  }

  private static MealSlots.Answers slotAnswers(Answers answers, Applicant person) {
    return new MealSlots.Answers(
        person.answer(answers.visible("MEALS")),
        person.answer(answers.visible("ARRIVAL_SLOT")),
        person.answer(answers.visible("DEPARTURE_SLOT")));
  }

  /**
   * Ways there and back, in the way-there option order. The way back of a driver or a car rider
   * there is the same, because the way-back question is not asked of them (DEC-070 §3).
   */
  private static Transport transport(Answers answers, List<Applicant> people) {
    Question in = answers.visible("TRANSPORT_IN");
    if (in == null) {
      return null;
    }
    Question out = answers.visible("TRANSPORT_OUT");
    Map<String, Long> there = new HashMap<>();
    Map<String, Long> back = new HashMap<>();
    long thereNone = 0;
    long backNone = 0;
    for (Applicant person : people) {
      String way = optionId(person.answer(in));
      if (way == null || in.option(way) == null) {
        thereNone++;
        backNone++;
        continue;
      }
      there.merge(way, 1L, Long::sum);
      if (SAME_WAY_BACK.contains(way)) {
        back.merge(way, 1L, Long::sum);
        continue;
      }
      String wayBack = optionId(person.answer(out));
      if (wayBack == null || out.option(wayBack) == null) {
        backNone++;
      } else {
        back.merge(wayBack, 1L, Long::sum);
      }
    }
    List<OptionCount> backRows = new ArrayList<>();
    Set<String> listed = new HashSet<>();
    for (JsonNode option : in.options()) {
      String id = option.path("optionId").asString();
      listed.add(id);
      JsonNode source = SAME_WAY_BACK.contains(id) || out == null ? null : out.option(id);
      JsonNode shown = source == null ? option : source;
      backRows.add(new OptionCount(id, label(shown), hidden(shown), back.getOrDefault(id, 0L)));
    }
    if (out != null) {
      for (JsonNode option : out.options()) {
        String id = option.path("optionId").asString();
        if (listed.add(id)) {
          backRows.add(
              new OptionCount(id, label(option), hidden(option), back.getOrDefault(id, 0L)));
        }
      }
    }
    return new Transport(new Choice(in.counts(there), thereNone), new Choice(backRows, backNone));
  }

  private static Shuttle shuttle(Answers answers, List<Applicant> people) {
    Choice in = rounds(answers.visible("SHUTTLE_IN"), answers.visible("TRANSPORT_IN"), people);
    Choice out = rounds(answers.visible("SHUTTLE_OUT"), answers.visible("TRANSPORT_OUT"), people);
    return in == null && out == null ? null : new Shuttle(in, out);
  }

  /** Riders per round. {@code noAnswer} is shuttle riders with no round answer. */
  private static Choice rounds(Question question, Question way, List<Applicant> people) {
    if (question == null) {
      return null;
    }
    Map<String, Long> counts = new HashMap<>();
    long none = 0;
    for (Applicant person : people) {
      Set<String> ids = optionIds(person.answer(question));
      if (ids == null) {
        if (SHUTTLE.equals(optionId(person.answer(way)))) {
          none++;
        }
        continue;
      }
      for (String id : ids) {
        counts.merge(id, 1L, Long::sum);
      }
    }
    return new Choice(question.counts(counts), none);
  }

  /** Drivers who said yes, by name. Seats, area and note read null when not answered or off. */
  private static Carpool carpool(Answers answers, List<Applicant> people, Directory directory) {
    Question offer = answers.visible("CARPOOL_OFFER");
    if (offer == null) {
      return null;
    }
    Question seats = answers.visible("CARPOOL_SEATS");
    Question area = answers.visible("CARPOOL_AREA");
    Question note = answers.visible("CARPOOL_NOTE");
    List<Offer> offers = new ArrayList<>();
    long seatTotal = 0;
    for (Applicant person : people) {
      JsonNode yes = person.answer(offer);
      if (yes == null || !yes.path("value").booleanValue()) {
        continue;
      }
      JsonNode number = person.answer(seats) == null ? null : person.answer(seats).get("number");
      Long count = number != null && number.isIntegralNumber() ? number.longValue() : null;
      if (count != null) {
        seatTotal += count;
      }
      offers.add(
          new Offer(
              person.applicationId(),
              directory.name(person),
              directory.cohort(person),
              count,
              text(person.answer(area)),
              text(person.answer(note))));
    }
    offers.sort(Comparator.comparing(Offer::name, NAMES).thenComparing(Offer::applicationId));
    return new Carpool(offers.size(), seatTotal, offers);
  }

  private static Mobility mobility(Answers answers, List<Applicant> people, Directory directory) {
    List<Request> in = requests(answers.visible("MOBILITY_IN"), people, directory);
    List<Request> out = requests(answers.visible("MOBILITY_OUT"), people, directory);
    return in == null && out == null ? null : new Mobility(in, out);
  }

  private static List<Request> requests(
      Question question, List<Applicant> people, Directory directory) {
    if (question == null) {
      return null;
    }
    List<Request> out = new ArrayList<>();
    for (Applicant person : people) {
      String area = text(person.answer(question));
      if (area != null) {
        out.add(
            new Request(
                person.applicationId(), directory.name(person), directory.cohort(person), area));
      }
    }
    out.sort(Comparator.comparing(Request::name, NAMES).thenComparing(Request::applicationId));
    return out;
  }

  // ---- reading stored JSON ----

  private JsonNode read(String text) {
    return text == null ? null : json.readTree(text);
  }

  private static Question visible(Question question) {
    return question == null || question.row().hidden() ? null : question;
  }

  private static LocalDate start(JsonNode setup) {
    return date(setup.path("generatedFor").path("startDate"));
  }

  private static LocalDate date(JsonNode node) {
    return node.isString() ? LocalDate.parse(node.asString()) : null;
  }

  private static String optionId(JsonNode value) {
    return value != null && value.path("optionId").isString()
        ? value.get("optionId").asString()
        : null;
  }

  /** Null when there is no answer. */
  private static Set<String> optionIds(JsonNode value) {
    if (value == null || !value.path("optionIds").isArray()) {
      return null;
    }
    Set<String> ids = new HashSet<>();
    for (JsonNode id : value.get("optionIds")) {
      if (id.isString()) {
        ids.add(id.asString());
      }
    }
    return ids;
  }

  /** Trimmed text, or null when blank or missing. */
  private static String text(JsonNode value) {
    if (value == null || !value.path("text").isString()) {
      return null;
    }
    String text = value.get("text").asString().strip();
    return text.isEmpty() ? null : text;
  }

  private static String label(JsonNode option) {
    return option.path("label").isString() ? option.get("label").asString() : "";
  }

  private static boolean hidden(JsonNode option) {
    return option.path("hidden").isBoolean() && option.get("hidden").booleanValue();
  }

  /** One field with its parsed config. */
  private record Question(FormFieldRow row, JsonNode config) {

    List<JsonNode> options() {
      List<JsonNode> out = new ArrayList<>();
      JsonNode list = config == null ? null : config.get("options");
      if (list != null && list.isArray()) {
        list.forEach(out::add);
      }
      return out;
    }

    JsonNode option(String optionId) {
      for (JsonNode option : options()) {
        if (optionId.equals(option.path("optionId").asString())) {
          return option;
        }
      }
      return null;
    }

    String label(String optionId) {
      JsonNode option = option(optionId);
      return option == null ? null : ApplicationSummaryService.label(option);
    }

    List<OptionCount> counts(Map<String, Long> counts) {
      List<OptionCount> out = new ArrayList<>();
      for (JsonNode option : options()) {
        String id = option.path("optionId").asString();
        out.add(
            new OptionCount(
                id,
                ApplicationSummaryService.label(option),
                hidden(option),
                counts.getOrDefault(id, 0L)));
      }
      return out;
    }
  }

  /** Generated questions by preset key. */
  private record Answers(Map<String, Question> byKey) {

    Question visible(String key) {
      return ApplicationSummaryService.visible(byKey.get(key));
    }

    Question any(String key) {
      return byKey.get(key);
    }
  }

  private record Applicant(UUID applicationId, Map<UUID, JsonNode> answers) {

    /** Null for no answer, or when the question is missing or turned off. */
    JsonNode answer(Question question) {
      return question == null ? null : answers.get(question.row().fieldId());
    }
  }

  /** Name and cohort shown next to a carpool or mobility answer. */
  private record Directory(Question name, Question cohort) {

    String name(Applicant person) {
      return text(person.answer(name));
    }

    String cohort(Applicant person) {
      return text(person.answer(cohort));
    }
  }
}
