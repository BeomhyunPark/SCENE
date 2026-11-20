package app.scene.event.application;

import app.scene.event.application.mapper.ApplicationStatusMapper;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place a withdraw or restore is stored (DEC-084 §2, §7): the status flip on the
 * application row, one {@code application_status_logs} row, and an {@link ApplicationStatusChanged}
 * event in the same transaction. Callers hold the participant lock.
 */
@Component
public class ApplicationStatusChanges {

  static final String SUBMITTED = "SUBMITTED";
  static final String WITHDRAWN = "WITHDRAWN";

  private final ApplicationStatusMapper statuses;
  private final ApplicationEventPublisher events;

  public ApplicationStatusChanges(
      ApplicationStatusMapper statuses, ApplicationEventPublisher events) {
    this.statuses = statuses;
    this.events = events;
  }

  /** Flips {@code from} to {@code to}. False when the row is no longer {@code from}. */
  @Transactional
  public boolean setStatus(UUID spaceId, UUID eventId, UUID applicationId, String from, String to) {
    return statuses.setStatus(spaceId, eventId, applicationId, from, to) == 1;
  }

  /** Stores the history row and publishes the event. */
  @Transactional
  public void record(ApplicationStatusChanged change, String reason, boolean blockReapply) {
    statuses.insertLog(
        UUID.randomUUID(),
        change.spaceId(),
        change.eventId(),
        change.participantId(),
        change.applicationId(),
        change.action(),
        reason,
        blockReapply,
        change.actorKind(),
        change.actorUserId(),
        change.at());
    events.publishEvent(change);
  }

  /** Withdrawn participants of the event, newest withdraw first. */
  public List<WithdrawnRow> withdrawn(UUID spaceId, UUID eventId) {
    return statuses.listWithdrawn(spaceId, eventId);
  }

  /**
   * The withdrawal of {@code applicationId} while it is the participant's latest, withdrawn row.
   */
  public Optional<WithdrawnRow> withdrawn(UUID spaceId, UUID eventId, UUID applicationId) {
    return Optional.ofNullable(statuses.findWithdrawn(spaceId, eventId, applicationId));
  }
}
