package app.scene.common.error;

/** Stable API error codes. HTTP status is part of the contract, not a transport detail. */
public enum ErrorCode {
  RESOURCE_NOT_FOUND(404),
  FORBIDDEN(403),
  NOT_A_MEMBER(403),
  OVERRIDE_REQUIRED(403),
  VALIDATION_FAILED(400),
  CONCURRENT_MODIFICATION(409),
  INVALID_STATE_TRANSITION(409),
  CONFIRMATION_REQUIRED(409),
  EVENT_ARCHIVED(409),
  EVENT_ENDED(409),
  TRANSFER_NOT_PENDING(409),
  TRANSFER_COMPLETED(409),
  HANDOVER_NOT_ACCEPTED(409),
  LAST_OWNER(409),
  OWNER_ROLE_HELD(409),
  RESPONSIBILITY(409),
  TASK_VERSION_CONFLICT(409),
  INVALID_TASK_STATE(409);

  private final int httpStatus;

  ErrorCode(int httpStatus) {
    this.httpStatus = httpStatus;
  }

  public int httpStatus() {
    return httpStatus;
  }
}
