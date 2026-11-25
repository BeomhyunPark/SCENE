package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 식수 현황 (#454, DEC-089): per meal slot, the planned count of the submitted applications and the
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
  private final OperatorApplicationService reads;
  private final ArrivalSource source;
  private final Clock clock;

  public MealCountService(
      EventAccessGate gate,
      EventRepository events,
      OperatorApplicationService reads,
      ArrivalSource source,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.reads = reads;
    this.source = source;
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

    ArrivalSource.Loaded loaded = source.load(spaceId, eventId);
    List<ArrivalSource.Person> people = loaded.people();
    long checkedIn = people.stream().filter(ArrivalSource.Person::arrived).count();
    if (loaded.days().isEmpty()) {
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
    for (ArrivalSource.Person person : people) {
      tallied.add(new MealTally.Person(person.attended(), person.arrived()));
    }
    MealTally.Result result =
        MealTally.count(loaded.days(), loaded.scheduled(), tallied, now, loaded.zone());
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
