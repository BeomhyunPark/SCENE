package app.scene.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The registry is the confirmed API code list, with the task example text. */
class ErrorCodeTest {

  @Test
  void confirmedCodesKeepTheirHttpStatus() {
    assertThat(ErrorCode.AUTHENTICATION_REQUIRED.httpStatus()).isEqualTo(401);
    assertThat(ErrorCode.VALIDATION_FAILED.httpStatus()).isEqualTo(400);
    assertThat(ErrorCode.PAGE_SIZE_EXCEEDED.httpStatus()).isEqualTo(400);
    assertThat(ErrorCode.FORBIDDEN.httpStatus()).isEqualTo(403);
    assertThat(ErrorCode.NOT_A_MEMBER.httpStatus()).isEqualTo(403);
    assertThat(ErrorCode.OVERRIDE_REQUIRED.httpStatus()).isEqualTo(403);
    assertThat(ErrorCode.RESOURCE_NOT_FOUND.httpStatus()).isEqualTo(404);
    assertThat(ErrorCode.EVENT_ARCHIVED.httpStatus()).isEqualTo(409);
    assertThat(ErrorCode.EVENT_ENDED.httpStatus()).isEqualTo(409);
    assertThat(ErrorCode.TASK_VERSION_CONFLICT.httpStatus()).isEqualTo(409);
    assertThat(ErrorCode.INVALID_TASK_STATE.httpStatus()).isEqualTo(409);
    assertThat(ErrorCode.INVITATION_REVOKED.httpStatus()).isEqualTo(410);
    assertThat(ErrorCode.PERMISSION_OWNER_NOT_OVERRIDABLE.httpStatus()).isEqualTo(422);
    assertThat(ErrorCode.PERMISSION_OWNER_ONLY.httpStatus()).isEqualTo(422);
    assertThat(ErrorCode.PERMISSION_NOT_OVERRIDABLE.httpStatus()).isEqualTo(422);
  }

  @Test
  void typeIsAStableUrnAndTaskConflictUsesTheContractSentence() {
    assertThat(ErrorCode.TASK_VERSION_CONFLICT.type())
        .hasToString("urn:scene:problem:task-version-conflict");
    assertThat(ErrorCode.TASK_VERSION_CONFLICT.title()).isEqualTo("Task version conflict");
    assertThat(ErrorCode.TASK_VERSION_CONFLICT.detail()).isEqualTo("다른 사람이 먼저 이 업무를 바꿨습니다.");
    assertThat(ErrorCode.PAGE_SIZE_EXCEEDED.type())
        .hasToString("urn:scene:problem:page-size-exceeded");
    assertThat(ErrorCode.VALIDATION_FAILED.type())
        .hasToString("urn:scene:problem:validation-failed");
    assertThat(ErrorCode.VALIDATION_FAILED.detail()).isEqualTo("요청 값이 올바르지 않습니다.");
  }
}
