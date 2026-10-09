package app.scene.common.error;

import java.net.URI;
import java.util.Locale;

/**
 * Single registry for confirmed API error codes. HTTP status, title, and detail travel with the
 * code. Clients branch on {@code code}, not on the sentence.
 */
public enum ErrorCode {
  AUTHENTICATION_REQUIRED(401, "Authentication required", "로그인이 필요합니다."),
  PARTICIPANT_ACCESS_INVALID(401, "Participant access invalid", "참여자 접근 키가 올바르지 않습니다."),
  FORBIDDEN(403, "Forbidden", "이 작업을 할 수 없습니다."),
  NOT_A_MEMBER(403, "Not a member", "이 공간 또는 행사의 접근이 없습니다."),
  OVERRIDE_REQUIRED(403, "Override required", "대신 실행하려면 사유가 필요합니다."),
  RESOURCE_NOT_FOUND(404, "Resource not found", "대상을 찾을 수 없습니다."),
  VALIDATION_FAILED(400, "Validation failed", "요청 값이 올바르지 않습니다."),
  PAGE_SIZE_EXCEEDED(400, "Page size exceeded", "페이지 크기가 허용된 최대값을 넘었습니다."),
  CONFLICT(409, "Conflict", "이미 있어서 이 변경을 저장할 수 없습니다."),
  CONCURRENT_MODIFICATION(409, "Concurrent modification", "다른 변경이 먼저 반영되었습니다."),
  INVALID_STATE_TRANSITION(409, "Invalid state transition", "현재 상태에서는 이 전이를 할 수 없습니다."),
  CONFIRMATION_REQUIRED(409, "Confirmation required", "경고를 확인해야 진행할 수 있습니다."),
  EVENT_ARCHIVED(409, "Event archived", "보관된 행사에서는 이 변경을 할 수 없습니다."),
  EVENT_ENDED(409, "Event ended", "종료된 행사에서는 이 신청을 받을 수 없습니다."),
  FORM_NOT_FOUND(404, "Form not found", "신청 폼을 찾을 수 없습니다."),
  FORM_CLOSED(409, "Form closed", "신청을 받지 않는 폼입니다."),
  APPLICATION_VALIDATION_FAILED(400, "Application validation failed", "신청 답변이 올바르지 않습니다."),
  INVITATION_REVOKED(410, "Invitation revoked", "초대가 취소되었습니다."),
  INVITATION_EMAIL_MISMATCH(403, "Invitation email mismatch", "초대한 이메일과 다른 계정입니다."),
  INVITATION_EXPIRED(410, "Invitation expired", "초대가 만료되었습니다."),
  INVITATION_SUPERSEDED(410, "Invitation superseded", "다시 보낸 초대로 이전 링크는 쓸 수 없습니다."),
  INVITATION_ALREADY_ACCEPTED(409, "Invitation already accepted", "다른 사용자가 이미 이 초대를 수락했습니다."),
  INVITATION_NOT_FOUND(404, "Invitation not found", "초대를 찾을 수 없습니다."),
  RATE_LIMITED(429, "Rate limited", "요청이 너무 많습니다."),
  TRANSFER_NOT_PENDING(409, "Transfer not pending", "수락할 수 있는 이전이 아닙니다."),
  TRANSFER_COMPLETED(409, "Transfer completed", "끝난 이전은 바꿀 수 없습니다."),
  HANDOVER_NOT_ACCEPTED(409, "Handover not accepted", "수락되지 않은 인수인계가 있습니다."),
  LAST_OWNER(409, "Last owner", "마지막 소유자는 떠날 수 없습니다."),
  OWNER_ROLE_HELD(409, "Owner role held", "소유자 역할은 이전 없이 내려놓을 수 없습니다."),
  RESPONSIBILITY(409, "Responsibility", "남은 책임이 있어 떠날 수 없습니다."),
  TASK_VERSION_CONFLICT(409, "Task version conflict", "다른 사람이 먼저 이 업무를 바꿨습니다."),
  INVALID_TASK_STATE(409, "Invalid task state", "업무 상태 때문에 이 변경을 할 수 없습니다."),
  PERMISSION_OWNER_NOT_OVERRIDABLE(
      422, "Owner permissions are not overridable", "소유자의 권한은 개별 설정할 수 없습니다."),
  PERMISSION_OWNER_ONLY(422, "Owner only permission", "소유자만 가질 수 있는 권한입니다."),
  PERMISSION_NOT_OVERRIDABLE(422, "Permission not overridable", "이 권한은 개별 설정으로 뺄 수 없습니다.");

  private final int httpStatus;
  private final String title;
  private final String detail;

  ErrorCode(int httpStatus, String title, String detail) {
    this.httpStatus = httpStatus;
    this.title = title;
    this.detail = detail;
  }

  public int httpStatus() {
    return httpStatus;
  }

  public String title() {
    return title;
  }

  public String detail() {
    return detail;
  }

  public URI type() {
    String slug = name().toLowerCase(Locale.ROOT).replace('_', '-');
    return URI.create("urn:scene:problem:" + slug);
  }
}
