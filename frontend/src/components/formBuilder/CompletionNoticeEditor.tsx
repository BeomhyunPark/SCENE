import { useState } from "react";
import { isApiError } from "../../api/errors";
import { COMPLETION_NOTICE_MAX, completionNoticeLength, putCompletionNotice, type FormDetail } from "../../api/forms";
import { Button } from "../Button";

/**
 * Operator editor for the completion notice (#406). `FORM_WRITE` only; submitted applications do
 * not lock it. The draft is lifted so the preview can show it before it is saved.
 */
export function CompletionNoticeEditor({
  eventId,
  form,
  canWrite,
  draft,
  onDraft,
  onSaved,
}: {
  eventId: string;
  form: FormDetail;
  canWrite: boolean;
  draft: string;
  onDraft: (next: string) => void;
  onSaved: (detail: FormDetail) => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const saved = form.completionNotice ?? "";
  const length = completionNoticeLength(draft);
  const tooLong = length > COMPLETION_NOTICE_MAX;
  const unchanged = draft.replace(/\r\n?/g, "\n").trim() === saved;

  async function save() {
    setPending(true);
    setMessage("");
    try {
      const detail = await putCompletionNotice(eventId, form.formId, draft.trim() === "" ? null : draft);
      onSaved(detail);
      onDraft(detail.completionNotice ?? "");
      setFailed(false);
      setMessage(detail.completionNotice ? "저장했어요." : "안내를 비웠어요.");
    } catch (caught) {
      setFailed(true);
      setMessage(failureCopy(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="registration-setup__inert completion-notice-editor" aria-labelledby="completion-notice-title">
      <h3 id="completion-notice-title">완료 안내</h3>
      {/* One line (#498): the placeholder already shows what to write. */}
      <p>신청을 마친 사람에게 보여요.</p>
      {canWrite ? (
        <>
        <textarea
            aria-label="완료 안내 문구"
            rows={6}
            value={draft}
            placeholder={"예) 참가비 3만원은 12월 31일까지 보내 주세요.\n신한 110-000-000000 (예금주 홍길동)\n문의: 010-0000-0000"}
            onChange={(event) => {
              onDraft(event.target.value);
              setMessage("");
            }}
          />
          <div className="registration-setup__row completion-notice-editor__footer">
            <small className={tooLong ? "completion-notice-editor__count is-over" : "completion-notice-editor__count"}>
              {length}/{COMPLETION_NOTICE_MAX}자
            </small>
            <Button
              type="button"
              variant="primary"
              size={40}
              loading={pending}
              disabled={unchanged || tooLong}
              onClick={() => void save()}
            >
              안내 저장
            </Button>
          </div>
          {tooLong ? (
            <p className="completion-notice-editor__error" role="alert">
              {COMPLETION_NOTICE_MAX}자까지 쓸 수 있어요.
            </p>
          ) : null}
          {message ? (
            <p className={failed ? "completion-notice-editor__error" : undefined} role={failed ? "alert" : "status"}>
              {message}
            </p>
          ) : null}
        </>
      ) : (
        <p className="completion-notice-editor__readonly">{saved || "아직 안내가 없어요."}</p>
      )}
    </section>
  );
}

function failureCopy(caught: unknown): string {
  if (isApiError(caught, "FORBIDDEN")) return "신청서를 바꿀 권한이 없어요.";
  if (isApiError(caught, "VALIDATION_FAILED")) return `안내는 ${COMPLETION_NOTICE_MAX}자까지 쓸 수 있어요.`;
  if (isApiError(caught) && caught.status === 404) return "신청서를 찾을 수 없어요.";
  return "저장하지 못했어요. 다시 시도해 주세요.";
}
