import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  restoreApplication,
  withdrawApplication,
  WITHDRAW_REASON_MAX,
  type RestoreResult,
  type TableRow,
  type WithdrawnApplicant,
} from "../api/applications";
import { isApiError } from "../api/errors";
import { refreshAfterStatusChange } from "./applicationStatus";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatSubmittedAt } from "./eventFormat";
import "./ApplicationWithdraw.css";

/**
 * 신청 취소 in the 수정 서랍 (DEC-084, #421). One confirm dialog with what changes, an optional
 * reason and "다시 신청 막기". On success the drawer closes and the person moves to 취소된 신청.
 */
export function WithdrawApplication({
  eventId,
  row,
  name,
  blocked,
  onWithdrawn,
  onDialog,
}: {
  eventId: string;
  row: TableRow;
  name: string;
  blocked: string | null;
  onWithdrawn: (message: string) => void;
  /** Tells the drawer a dialog is open over it, so its own Esc and Tab handling stands aside. */
  onDialog?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const blockId = useId();
  const [asking, setAskingState] = useState(false);
  function setAsking(open: boolean) {
    setAskingState(open);
    onDialog?.(open);
  }
  const [reason, setReason] = useState("");
  const [blockReapply, setBlockReapply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      const result = await withdrawApplication(eventId, row.applicationId, { reason, blockReapply });
      refreshAfterStatusChange(queryClient, eventId);
      setAsking(false);
      onWithdrawn(
        result.result === "ALREADY_WITHDRAWN"
          ? `${name}님의 신청은 이미 취소되어 있어요.`
          : `${name}님의 신청을 취소했어요. 참가 현황의 "취소된 신청"에서 되돌릴 수 있어요.`,
      );
    } catch (error) {
      if (isApiError(error, "CONCURRENT_MODIFICATION")) refreshAfterStatusChange(queryClient, eventId);
      setFailure(withdrawFailure(error));
    } finally {
      setBusy(false);
    }
  }

  const reasonLength = [...reason.trim()].length;
  return (
    <>
      <div className="withdraw__action">
        <Button type="button" variant="tertiary" size={32} disabled={Boolean(blocked)} onClick={() => setAsking(true)}>
          신청 취소
        </Button>
        <span className="withdraw__hint">{blocked ?? "못 오게 된 사람, 잘못 낸 신청을 명단에서 빼요. 나중에 되돌릴 수 있어요."}</span>
      </div>
      {asking ? (
        <ConfirmDialog
          title={`${name}님의 신청을 취소할까요?`}
          scroll
          onClose={() => !busy && setAsking(false)}
          footer={
            <>
              <Button type="button" variant="secondary" size={40} disabled={busy} onClick={() => setAsking(false)}>
                돌아가기
              </Button>
              <Button
                type="button"
                variant="danger"
                size={40}
                loading={busy}
                disabled={reasonLength > WITHDRAW_REASON_MAX}
                onClick={() => void confirm()}
              >
                신청 취소하기
              </Button>
            </>
          }
        >
          <div className="withdraw__impact">
            <strong>바로 바뀌는 것</strong>
            <ul>
              <li>신청 집계(식수·숙박·이동), 체크인 현황, CSV, 참가 현황 표에서 빠져요.</li>
              {row.group ? (
                <li>
                  조 배정({row.group.name})이 지워져요.
                  {row.group.leader ? <strong className="withdraw__warn"> {row.group.name} 조장 표시도 풀려요.</strong> : null} 공개된 조
                  편성에서도 다시 공개하지 않아도 바로 빠져요.
                </li>
              ) : null}
              {row.checkedInAt ? <li>도착 체크인 기록({formatSubmittedAt(row.checkedInAt)})은 남지만 현황 숫자에서 빠져요.</li> : null}
              <li>참가자가 들어와 있던 화면은 끊기고, 다시 들어올 수 없어요.</li>
              <li>되돌리면 신청은 돌아오지만 조는 다시 정해야 해요.</li>
            </ul>
          </div>
          <label className="withdraw__label" htmlFor={reasonId}>
            취소 사유 (선택)
          </label>
          <textarea
            id={reasonId}
            className="withdraw__reason"
            value={reason}
            rows={2}
            maxLength={WITHDRAW_REASON_MAX + 20}
            placeholder="예: 가족 사정으로 참석 못 함"
            aria-describedby={`${reasonId}-meta`}
            onChange={(event) => setReason(event.target.value)}
          />
          <p id={`${reasonId}-meta`} className="withdraw__meta">
            운영자만 봐요. {reasonLength.toLocaleString("ko-KR")} / {WITHDRAW_REASON_MAX}자
          </p>
          <label className="withdraw__check" htmlFor={blockId}>
            <input id={blockId} type="checkbox" checked={blockReapply} onChange={(event) => setBlockReapply(event.target.checked)} />
            <span>
              다시 신청 막기
              <span className="withdraw__meta">
                장난 신청일 때 골라요. 숫자 6자리가 무효가 되어 같은 전화번호로 다시 신청해도 돌아오지 못해요. 고르지 않으면 본인이 같은
                번호·6자리로 다시 신청해 돌아올 수 있어요.
              </span>
            </span>
          </label>
          {failure ? (
            <p className="withdraw__alert" role="alert">
              {failure}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
      {failure && !asking ? (
        <p className="withdraw__alert" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}

/**
 * 취소된 신청 (DEC-084 §9): the withdrawn applicants apart from the table, newest first, each with
 * who, when, why and 되돌리기. The group does not come back; the previous one is shown as a hint.
 */
export function WithdrawnList({
  eventId,
  withdrawn,
  blocked,
}: {
  eventId: string;
  withdrawn: WithdrawnApplicant[];
  blocked: string | null;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<WithdrawnApplicant | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function restore(item: WithdrawnApplicant) {
    setBusy(true);
    setFailure(null);
    try {
      const result = await restoreApplication(eventId, item.applicationId);
      refreshAfterStatusChange(queryClient, eventId);
      setAsking(null);
      setDone(restoredMessage(item.name, result));
    } catch (error) {
      if (isApiError(error, "CONCURRENT_MODIFICATION")) refreshAfterStatusChange(queryClient, eventId);
      setFailure(restoreFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="withdrawn" aria-labelledby="withdrawn-title">
      <h3 id="withdrawn-title" className="withdrawn__title">
        취소된 신청 {withdrawn.length}명
      </h3>
      <p className="withdrawn__lead">표와 집계·체크인·CSV에는 들어가지 않아요. 되돌리면 신청은 돌아오고 조는 다시 정해요.</p>
      {done ? (
        <p className="withdrawn__done" role="status">
          {done}
        </p>
      ) : null}
      {failure ? (
        <p className="withdraw__alert" role="alert">
          {failure}
        </p>
      ) : null}
      {withdrawn.length === 0 ? (
        <p className="withdrawn__empty">취소된 신청이 없어요.</p>
      ) : (
        <ul className="withdrawn__list">
          {withdrawn.map((item) => (
            <li key={item.applicationId} className="withdrawn__item">
              <div className="withdrawn__who">
                <strong>{item.name || "이름 없음"}</strong>
                <span className="withdrawn__when">
                  {item.withdrawal.withdrawnAt ? `${formatSubmittedAt(item.withdrawal.withdrawnAt)} 취소` : "취소됨"}
                  {item.withdrawal.withdrawnByDisplayName ? ` · ${item.withdrawal.withdrawnByDisplayName}` : ""}
                </span>
                <span className="withdrawn__reason">사유: {item.withdrawal.reason ?? "사유 없음"}</span>
                {item.previousGroup ? <span className="withdrawn__meta">이전 조: {item.previousGroup.name}</span> : null}
                {item.withdrawal.reapplyBlocked ? <span className="withdrawn__meta">다시 신청 막음</span> : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                size={32}
                disabled={Boolean(blocked) || busy}
                onClick={() => {
                  setDone(null);
                  setFailure(null);
                  setAsking(item);
                }}
              >
                되돌리기
              </Button>
            </li>
          ))}
        </ul>
      )}
      {blocked && withdrawn.length > 0 ? <p className="withdrawn__lead">{blocked}</p> : null}
      {asking ? (
        <ConfirmDialog
          title={`${asking.name}님의 신청을 되돌릴까요?`}
          onClose={() => !busy && setAsking(null)}
          footer={
            <>
              <Button type="button" variant="secondary" size={40} disabled={busy} onClick={() => setAsking(null)}>
                돌아가기
              </Button>
              <Button type="button" variant="primary" size={40} loading={busy} onClick={() => void restore(asking)}>
                되돌리기
              </Button>
            </>
          }
        >
          <ul className="withdraw__impact-list">
            <li>집계·체크인·CSV·참가 현황 표에 다시 들어가요.</li>
            <li>
              조는 돌아오지 않아요. 미배정으로 들어가니 조 편성에서 다시 정해 주세요
              {asking.previousGroup ? ` (이전 조: ${asking.previousGroup.name})` : ""}.
            </li>
            <li>참가자는 이름·전화번호·숫자 6자리로 다시 들어와요.</li>
            {asking.withdrawal.reapplyBlocked ? (
              <li className="withdraw__warn">다시 신청을 막아 6자리가 무효예요. 되돌린 뒤 수정 서랍에서 6자리를 초기화해 주세요.</li>
            ) : null}
          </ul>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function restoredMessage(name: string, result: RestoreResult): string {
  if (result.result === "ALREADY_SUBMITTED") return `${name}님의 신청은 이미 접수 상태예요.`;
  const group = result.previousGroup ? ` 이전 조는 ${result.previousGroup.name}였어요.` : "";
  const pin = result.reapplyBlocked ? " 6자리를 초기화해야 들어올 수 있어요." : "";
  return `${name}님의 신청을 되돌렸어요. 조는 미배정이에요.${group}${pin}`;
}

function withdrawFailure(error: unknown): string {
  if (isApiError(error, "FORBIDDEN")) return "신청을 취소할 권한이 없어요.";
  if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) return "끝나거나 보관된 행사는 참가 상태를 바꿀 수 없어요.";
  if (isApiError(error, "CONCURRENT_MODIFICATION")) return "그 사이 참가자가 신청을 고쳤어요. 표를 다시 불러왔으니 확인한 뒤 다시 취소해 주세요.";
  if (isApiError(error, "VALIDATION_FAILED")) return `취소 사유는 ${WITHDRAW_REASON_MAX}자까지 쓸 수 있어요.`;
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "신청을 찾을 수 없어요.";
  return "취소하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function restoreFailure(error: unknown): string {
  if (isApiError(error, "FORBIDDEN")) return "신청을 되돌릴 권한이 없어요.";
  if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) return "끝나거나 보관된 행사는 참가 상태를 바꿀 수 없어요.";
  if (isApiError(error, "CONCURRENT_MODIFICATION", "CONFLICT")) return "그 사이 신청이 바뀌었어요. 목록을 다시 불러왔으니 확인해 주세요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "신청을 찾을 수 없어요.";
  return "되돌리지 못했어요. 잠시 후 다시 시도해 주세요.";
}
