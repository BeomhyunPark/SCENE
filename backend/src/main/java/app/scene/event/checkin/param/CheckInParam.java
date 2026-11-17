package app.scene.event.checkin.param;

import app.scene.common.mybatis.PageParam;
import java.time.Instant;
import java.util.UUID;

/** Mapper parameter for check-in reads and writes. Unused fields stay null. */
public final class CheckInParam {

  private final UUID spaceId;
  private final UUID eventId;
  private UUID participantId;
  private UUID checkInId;
  private UUID logId;
  private String action;
  private String method;
  private UUID actorUserId;
  private Instant at;
  private String reason;
  private String idempotencyKey;
  private String q;
  private boolean phoneSearch;
  private Boolean checkedIn;
  private PageParam page;

  private CheckInParam(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static CheckInParam of(UUID spaceId, UUID eventId) {
    return new CheckInParam(spaceId, eventId);
  }

  public CheckInParam participant(UUID value) {
    this.participantId = value;
    return this;
  }

  public CheckInParam checkIn(UUID value) {
    this.checkInId = value;
    return this;
  }

  public CheckInParam log(UUID value, String actionValue) {
    this.logId = value;
    this.action = actionValue;
    return this;
  }

  public CheckInParam method(String value) {
    this.method = value;
    return this;
  }

  public CheckInParam actor(UUID userId, Instant when) {
    this.actorUserId = userId;
    this.at = when;
    return this;
  }

  public CheckInParam reason(String value) {
    this.reason = value;
    return this;
  }

  public CheckInParam idempotencyKey(String value) {
    this.idempotencyKey = value;
    return this;
  }

  public CheckInParam search(String text, boolean byPhone, Boolean checkedInFilter) {
    this.q = text;
    this.phoneSearch = byPhone;
    this.checkedIn = checkedInFilter;
    return this;
  }

  public CheckInParam page(PageParam value) {
    this.page = value;
    return this;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getParticipantId() {
    return participantId;
  }

  public UUID getCheckInId() {
    return checkInId;
  }

  public UUID getLogId() {
    return logId;
  }

  public String getAction() {
    return action;
  }

  public String getMethod() {
    return method;
  }

  public UUID getActorUserId() {
    return actorUserId;
  }

  public Instant getAt() {
    return at;
  }

  public String getReason() {
    return reason;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public String getQ() {
    return q;
  }

  public boolean isPhoneSearch() {
    return phoneSearch;
  }

  public Boolean getCheckedIn() {
    return checkedIn;
  }

  public PageParam getPage() {
    return page;
  }
}
