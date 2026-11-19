import { useState } from "react";
import { isApiError } from "../api/errors";
import type { LifecycleStatus } from "../api/events";
import { resetParticipantPin } from "../api/participant";
import { Button } from "./Button";

/**
 * 6자리 초기화 (DEC-078 §2, #405) in the 수정 서랍. Effective `PARTICIPANT_WRITE` only. The server
 * makes a temporary number, ends the participant's sessions and returns the number once; it is
 * shown here until the drawer closes and is never stored. The participant signs in with it and
 * must set a new number. Two steps in place, so no dialog opens over the drawer.
 */
export function PinReset({
  eventId,
  participantId,
  eventStatus,
  mayWrite,
}: {
  eventId: string;
  participantId: string;
  eventStatus: LifecycleStatus;
  mayWrite: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const blocked =
    eventStatus === "ARCHIVED"
      ? "보관된 행사는 초기화할 수 없어요."
      : !mayWrite
        ? "참가자 정보를 고칠 권한이 있는 운영자만 초기화할 수 있어요."
        : !participantId
          ? "지금은 초기화할 수 없어요."
          : null;

  async function reset() {
    setBusy(true);
    setFailure(null);
    try {
      setTemporary(await resetParticipantPin(eventId, participantId));
      setAsking(false);
    } catch (error) {
      setFailure(resetFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="operation-drawer__field">
      <span className="operation-drawer__label">숫자 6자리</span>
      {temporary ? (
        <div className="operation-drawer__alert" role="status">
          <p>임시 번호예요. 지금 참가자에게 알려 주세요. 이 창을 닫으면 다시 볼 수 없어요.</p>
          <p className="operation-drawer__secret" aria-label="임시 번호">
            {temporary}
          </p>
          <p>참가자는 이름, 전화번호와 이 번호로 들어와 새 번호를 정해요.</p>
        </div>
      ) : asking ? (
        <div className="operation-drawer__alert">
          <p>초기화하면 지금 번호와 들어와 있던 화면이 모두 끊기고, 임시 번호가 한 번 보여요.</p>
          <div className="operation-drawer__inline-actions">
            <Button type="button" variant="secondary" size={32} disabled={busy} onClick={() => setAsking(false)}>
              취소
            </Button>
            <Button type="button" variant="primary" size={32} loading={busy} onClick={() => void reset()}>
              초기화
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="operation-drawer__hint">{blocked ?? "참가자가 번호를 잊었을 때 초기화해요. 번호는 운영자에게도 보이지 않아요."}</p>
          <div>
            <Button type="button" variant="tertiary" size={32} disabled={Boolean(blocked)} onClick={() => setAsking(true)}>
              6자리 초기화
            </Button>
          </div>
        </>
      )}
      {failure ? (
        <p className="operation-drawer__alert" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

function resetFailure(error: unknown): string {
  if (isApiError(error, "FORBIDDEN")) return "초기화할 권한이 없어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사는 초기화할 수 없어요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "참가자를 찾을 수 없어요.";
  return "초기화하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
