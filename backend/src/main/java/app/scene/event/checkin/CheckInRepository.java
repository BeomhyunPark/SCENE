package app.scene.event.checkin;

import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.event.checkin.mapper.CheckInMapper;
import app.scene.event.checkin.param.CheckInParam;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@code checkins} current rows and {@code checkin_logs} history, scoped by space and event. */
@Component
public class CheckInRepository {

  private static final String ROSTER_ORDER = "p.name ASC, p.id ASC";

  private final CheckInMapper checkIns;

  public CheckInRepository(CheckInMapper checkIns) {
    this.checkIns = checkIns;
  }

  public Optional<CheckInTarget> findTarget(UUID spaceId, UUID eventId, UUID participantId) {
    return Optional.ofNullable(
        checkIns.findTarget(CheckInParam.of(spaceId, eventId).participant(participantId)));
  }

  public Optional<CheckIn> findByParticipant(UUID spaceId, UUID eventId, UUID participantId) {
    return Optional.ofNullable(
        checkIns.findCheckIn(CheckInParam.of(spaceId, eventId).participant(participantId)));
  }

  public Optional<CheckIn> find(UUID spaceId, UUID eventId, UUID checkInId) {
    return Optional.ofNullable(
        checkIns.findCheckIn(CheckInParam.of(spaceId, eventId).checkIn(checkInId)));
  }

  public Optional<KeyedLog> findKeyedLog(UUID spaceId, UUID eventId, String idempotencyKey) {
    return Optional.ofNullable(
        checkIns.findKeyedLog(CheckInParam.of(spaceId, eventId).idempotencyKey(idempotencyKey)));
  }

  public void insertCheckedIn(
      UUID spaceId,
      UUID eventId,
      UUID checkInId,
      UUID participantId,
      String method,
      UUID actorId,
      Instant at) {
    checkIns.insertCheckIn(
        CheckInParam.of(spaceId, eventId)
            .checkIn(checkInId)
            .participant(participantId)
            .method(method)
            .actor(actorId, at));
  }

  /** Returns false when the row is not CANCELLED. */
  public boolean markCheckedIn(
      UUID spaceId, UUID eventId, UUID checkInId, String method, UUID actorId, Instant at) {
    return checkIns.updateCheckedIn(
            CheckInParam.of(spaceId, eventId).checkIn(checkInId).method(method).actor(actorId, at))
        == 1;
  }

  /** Returns false when the row is not CHECKED_IN. */
  public boolean markCancelled(
      UUID spaceId, UUID eventId, UUID checkInId, String reason, UUID actorId, Instant at) {
    return checkIns.updateCancelled(
            CheckInParam.of(spaceId, eventId).checkIn(checkInId).reason(reason).actor(actorId, at))
        == 1;
  }

  public void saveLog(
      UUID spaceId,
      UUID eventId,
      UUID checkInId,
      UUID participantId,
      String action,
      String method,
      String reason,
      String idempotencyKey,
      UUID actorId,
      Instant at) {
    checkIns.insertLog(
        CheckInParam.of(spaceId, eventId)
            .log(UUID.randomUUID(), action)
            .checkIn(checkInId)
            .participant(participantId)
            .method(method)
            .reason(reason)
            .idempotencyKey(idempotencyKey)
            .actor(actorId, at));
  }

  public CheckInCounts counts(UUID spaceId, UUID eventId) {
    return checkIns.counts(CheckInParam.of(spaceId, eventId));
  }

  public long countRoster(UUID spaceId, UUID eventId, String q, boolean phone, Boolean checkedIn) {
    return checkIns.countRoster(CheckInParam.of(spaceId, eventId).search(q, phone, checkedIn));
  }

  public List<RosterRow> roster(
      UUID spaceId, UUID eventId, String q, boolean phone, Boolean checkedIn, PageRequest request) {
    return checkIns.findRoster(
        CheckInParam.of(spaceId, eventId).search(q, phone, checkedIn).page(page(request)));
  }

  /** Every matching roster row in roster order, for a filter the database cannot apply. */
  public List<RosterRow> rosterAll(
      UUID spaceId, UUID eventId, String q, boolean phone, Boolean checkedIn) {
    return checkIns.findRoster(
        CheckInParam.of(spaceId, eventId)
            .search(q, phone, checkedIn)
            .page(PageParam.of(0, Integer.MAX_VALUE, ROSTER_ORDER)));
  }

  public long countLogs(UUID spaceId, UUID eventId, UUID participantId) {
    return checkIns.countLogs(CheckInParam.of(spaceId, eventId).participant(participantId));
  }

  public List<CheckInLogItem> logs(
      UUID spaceId, UUID eventId, UUID participantId, PageRequest request) {
    return checkIns.findLogs(
        CheckInParam.of(spaceId, eventId).participant(participantId).page(page(request)));
  }

  private static PageParam page(PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      offset = Integer.MAX_VALUE;
    }
    return PageParam.of((int) offset, request.size(), ROSTER_ORDER);
  }
}
