package app.scene.event.lifecycle;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.event.lifecycle.mapper.EventLifecycleTransitionMapper;
import app.scene.event.lifecycle.mapper.EventLifecycleTransitionQueryMapper;
import app.scene.event.lifecycle.mapper.EventMapper;
import app.scene.event.lifecycle.mapper.EventQueryMapper;
import app.scene.event.lifecycle.param.EventInsert;
import app.scene.event.lifecycle.param.EventKey;
import app.scene.event.lifecycle.param.EventListQuery;
import app.scene.event.lifecycle.param.EventNameUpdate;
import app.scene.event.lifecycle.param.EventStatusUpdate;
import app.scene.event.lifecycle.param.LifecycleTransitionInsert;
import app.scene.event.lifecycle.param.LifecycleTransitionListQuery;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Event row plus its lifecycle transition log. The two are written in one command. */
@Component
public class EventRepository {

  /** Events have no created-at column. Client sort is rejected before this clause is used. */
  static final String LIST_ORDER = "e.name ASC, e.id ASC";

  private final EventMapper events;
  private final EventQueryMapper eventQueries;
  private final EventLifecycleTransitionMapper transitions;
  private final EventLifecycleTransitionQueryMapper transitionQueries;

  public EventRepository(
      EventMapper events,
      EventQueryMapper eventQueries,
      EventLifecycleTransitionMapper transitions,
      EventLifecycleTransitionQueryMapper transitionQueries) {
    this.events = events;
    this.eventQueries = eventQueries;
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

  public long countTransitions(UUID spaceId, UUID eventId) {
    return transitionQueries.count(EventKey.of(spaceId, eventId));
  }

  /**
   * Events in the space. {@code operatorUserId} limits the rows to events that person operates. A
   * null value returns every event in the space.
   */
  public long countInSpace(UUID spaceId, UUID operatorUserId) {
    return eventQueries.count(EventListQuery.of(spaceId, operatorUserId, null));
  }

  public List<EventListRow> listInSpace(UUID spaceId, UUID operatorUserId, PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return eventQueries.findPage(
        EventListQuery.of(
            spaceId, operatorUserId, PageParam.of((int) offset, request.size(), LIST_ORDER)));
  }

  @Transactional
  public int save(UUID id, UUID spaceId, String name) {
    return events.save(EventInsert.of(id, spaceId, name));
  }

  @Transactional
  public int updateName(UUID spaceId, UUID eventId, String name) {
    return events.updateName(EventNameUpdate.of(spaceId, eventId, name));
  }

  public List<LifecycleTransitionRow> findTransitions(
      UUID spaceId, UUID eventId, PageRequest request, String orderByClause) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return transitionQueries.findPage(
        LifecycleTransitionListQuery.of(
            spaceId, eventId, PageParam.of((int) offset, request.size(), orderByClause)));
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
