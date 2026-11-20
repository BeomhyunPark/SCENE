import { useState } from "react";
import { isApiError } from "../api/errors";
import { setAcceptingEdits, type FormDetail } from "../api/forms";
import { Button } from "./Button";

/**
 * "신청 수정 받기" (DEC-078 §6, #427): whether participants may still change what they submitted,
 * apart from taking new applications. Closing applications keeps edits open; closing edits makes the
 * participant's 내 정보 read-only. Opening needs an ACTIVE event; an ended event takes no edits at all.
 * Without `FORM_WRITE` the state is shown without the button.
 */
export function EditsSwitch({
  eventId,
  form,
  canWrite,
  status,
  onSaved,
}: {
  eventId: string;
  form: FormDetail;
  canWrite: boolean;
  status: string;
  onSaved: (detail: FormDetail) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const ended = status === "ENDED" || status === "ARCHIVED";
  const on = form.acceptingEdits && !ended;
  const canOpen = status === "ACTIVE";

  async function change(next: boolean) {
    setError("");
    setPending(true);
    try {
      onSaved(await setAcceptingEdits(eventId, form.formId, next));
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setPending(false);
    }
  }

  let note: string;
  if (ended) note = "행사가 끝나서 신청을 고칠 수 없어요.";
  else if (on) note = form.acceptingApplications ? "참가자가 낸 신청을 직접 고칠 수 있어요." : "신청은 닫혔지만 이미 낸 신청은 고칠 수 있어요.";
  else note = "참가자는 낸 신청을 보기만 해요.";

  return (
    <section className="registration-setup__edits" aria-labelledby="registration-edits-title">
      <div className="registration-setup__edits-copy">
        <h3 id="registration-edits-title">신청 수정 받기</h3>
        <p>
          <strong>{on ? "받는 중" : "받지 않음"}</strong> · {note}
        </p>
      </div>
      {canWrite && !ended ? (
        on ? (
          <Button type="button" variant="secondary" size={40} loading={pending} onClick={() => void change(false)}>
            수정 닫기
          </Button>
        ) : (
          <Button type="button" variant="secondary" size={40} loading={pending} disabled={!canOpen} onClick={() => void change(true)}>
            수정 받기
          </Button>
        )
      ) : null}
      {canWrite && !ended && !on && !canOpen ? (
        <p className="registration-setup__note">행사를 시작하면 수정을 받을 수 있어요.</p>
      ) : null}
      {error ? (
        <p className="registration-setup__alert" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function failure(caught: unknown): string {
  if (isApiError(caught, "FORBIDDEN", "OVERRIDE_REQUIRED")) return "신청서를 바꿀 권한이 없어요.";
  if (isApiError(caught, "INVALID_STATE_TRANSITION")) return "진행 중인 행사에서만 수정을 받을 수 있어요.";
  if (isApiError(caught) && (caught.code === "RESOURCE_NOT_FOUND" || caught.status === 404)) return "신청서를 찾을 수 없어요.";
  return "저장하지 못했어요. 다시 시도해 주세요.";
}
