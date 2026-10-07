package app.scene.event.lifecycle;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.mapper.EventLifecycleTransitionMapper;
import app.scene.event.lifecycle.mapper.EventLifecycleTransitionQueryMapper;
import app.scene.event.lifecycle.mapper.EventMapper;
import app.scene.event.lifecycle.param.EventKey;
import app.scene.event.lifecycle.param.EventStatusUpdate;
import app.scene.event.lifecycle.param.LifecycleTransitionInsert;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Event row plus its lifecycle transition log. The two are written in one command. */
@Component
public class EventRepository {

  private final EventMapper events;
  private final EventLifecycleTransitionMapper transitions;
  private final EventLifecycleTransitionQueryMapper transitionQueries;

  public EventRepository(
      EventMapper events,
      EventLifecycleTransitionMapper transitions,
      EventLifecycleTransitionQueryMapper transitionQueries) {
    this.events = events;
    this.transitions = transitions;
    this.transitionQueries = transitionQueries;
  }

  public Optional<EventRow> find(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(events.find(EventKey.of(spaceId, eventId)));
  }

  /** Resolves {@code spaceId} from {@code eventId}. Missing events are empty, not a cross-check. */
  public Optional<EventLocation> findLocation(UUID eventId) {
    return Optional.ofNullable(events.findLocation(eventId));
  }

  public Optional<EventRow> findForUpdate(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(events.findForUpdate(EventKey.of(spaceId, eventId)));
  }

  public EventRow getForUpdate(UUID spaceId, UUID eventId) {
    return findForUpdate(spaceId, eventId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  public Optional<LifecycleTransitionView> findLatestTransition(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(transitionQueries.findLatest(EventKey.of(spaceId, eventId)));
  }

  @Transactional
  public int updateStatus(UUID spaceId, UUID eventId, int expectedVersion, String status) {
    return events.updateStatus(EventStatusUpdate.of(spaceId, eventId, expectedVersion, status));
  }

  @Transactional
  public void saveTransition(
      UUID spaceId,
      UUID eventId,
      String command,
      String fromStatus,
      String toStatus,
      UUID actorUserId,
      String actedAs,
      String reason,
      String warningsSnapshot,
      Instant occurredAt) {
    transitions.save(
        LifecycleTransitionInsert.of(
            UUID.randomUUID(),
            spaceId,
            eventId,
            command,
            fromStatus,
            toStatus,
            actorUserId,
            actedAs,
            reason,
            warningsSnapshot,
            occurredAt));
  }
}
