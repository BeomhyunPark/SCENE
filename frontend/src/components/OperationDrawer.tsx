import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApplicationTable,
  OPERATION_MEMO_MAX,
  saveApplicationOperation,
  type ApplicationOperation,
  type ApplicationTable,
  type TableRow,
} from "../api/applications";
import { isApiError } from "../api/errors";
import type { LifecycleStatus } from "../api/events";
import { assignParticipants, assignmentConflicts, getGroupBoard } from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { buildColumns, slotSummary } from "./applicantTable/model";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatSubmittedAt } from "./eventFormat";
import { PinReset } from "./PinReset";
import { WithdrawApplication } from "./ApplicationWithdraw";
import { statusChangeBlocked } from "./applicationStatus";
import "./OperationDrawer.css";

const UNASSIGNED = "";

type Failure =
  | { kind: "memo-conflict"; latest: ApplicationOperation }
  | { kind: "memo"; text: string }
  | { kind: "group"; text: string };

/**
 * 현재 운영 정보 수정 (#337, DEC-075, Figma P03-M01 1325:5552 · 1325:5581). One applicant's
 * operator-side values: the memo (saved with a version) and the working-copy group (the board's
 * `group-assignments`). 현재 참가 상태 offers 신청 취소 (#338, DEC-084); attendance stays read-only
 * until #339. The participant's original answers never change. Copy is a draft.
 */
export function OperationDrawer({
  eventId,
  eventStatus,
  table,
  row,
  onClose,
  onWithdrawn,
}: {
  eventId: string;
  eventStatus: LifecycleStatus;
  table: ApplicationTable;
  row: TableRow;
  onClose: () => void;
  /** Called after a withdraw with the message to show; the drawer closes. */
  onWithdrawn?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const memoId = useId();
  const groupId = useId();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const effective = permissions.data?.effective ?? [];
  const board = useQuery({
    queryKey: queryKeys.groupBoard(eventId),
    queryFn: ({ signal }) => getGroupBoard(eventId, signal),
    enabled: table.groupVisible,
  });

  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const columns = buildColumns(table);
  const name = columns[0]?.text(row) ?? "";
  const nameField = table.columns.find((column) => column.systemKey === "NAME");
  const nameValue = nameField ? row.answers[nameField.fieldId]?.text : undefined;
  const personName = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : name;
  const attendanceField = table.columns.find((column) => column.presetKey === "ATTENDANCE");
  const attendance = attendanceField ? (columns.find((column) => column.id === attendanceField.fieldId)?.text(row) ?? "") : "";
  const slots = table.slots ? slotSummary(table.slots, row.slotIds) : null;

  const memoBlocked = memoBlockedReason(eventStatus, effective.includes("PARTICIPANT_WRITE"), permissions.isPending);
  const groupBlocked = groupBlockedReason(eventStatus, effective.includes("GROUP_WRITE"), permissions.isPending, row.participantId);
  const memo = memoDraft ?? row.operation.memo;
  const currentGroup = row.group?.groupId ?? UNASSIGNED;
  const targetGroup = groupDraft ?? currentGroup;
  const memoChanged = memoDraft !== null && memoDraft !== row.operation.memo;
  const groupChanged = groupDraft !== null && groupDraft !== currentGroup;
  const dirty = memoChanged || groupChanged;
  const groups = board.data?.groups ?? (row.group ? [{ groupId: row.group.groupId, name: row.group.name }] : []);
  const groupName = (id: string) => (id === UNASSIGNED ? "미배정" : (groups.find((group) => group.groupId === id)?.name ?? "알 수 없는 조"));

  // Focus moves in on open and back to the 수정 button on close; Tab stays inside; Esc asks to close.
  const panel = useRef<HTMLDivElement>(null);
  const nested = useRef(false);
  const requestCloseRef = useRef<() => void>(() => {});
  function requestClose() {
    if (dirty) setAskClose(true);
    else onClose();
  }
  useLayoutEffect(() => {
    nested.current = confirming || askClose || withdrawOpen;
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (nested.current || !panel.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = active === panel.current || !panel.current.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, []);

  function putOperation(operation: ApplicationOperation) {
    queryClient.setQueryData<ApplicationTable>(queryKeys.applicationTable(eventId), (before) =>
      before
        ? { ...before, rows: before.rows.map((item) => (item.applicationId === row.applicationId ? { ...item, operation } : item)) }
        : before,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.application(eventId, row.applicationId) });
  }

  async function latestOperation(): Promise<ApplicationOperation | null> {
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: queryKeys.applicationTable(eventId),
        queryFn: ({ signal }) => getApplicationTable(eventId, signal),
        staleTime: 0,
      });
      return fresh.rows.find((item) => item.applicationId === row.applicationId)?.operation ?? null;
    } catch {
      return null;
    }
  }

  async function save() {
    setConfirming(false);
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      if (memoChanged) {
        try {
          const result = await saveApplicationOperation(eventId, row.applicationId, {
            memo: memoDraft,
            expectedVersion: row.operation.version,
          });
          putOperation(result);
          setMemoDraft(null);
        } catch (error) {
          if (isApiError(error, "CONCURRENT_MODIFICATION")) {
            // Keep the draft; the row now carries the latest version, so the next save is on purpose.
            const latest = await latestOperation();
            setFailure(latest ? { kind: "memo-conflict", latest } : { kind: "memo", text: memoFailure(error) });
          } else {
            setFailure({ kind: "memo", text: memoFailure(error) });
          }
          return;
        }
      }
      if (groupChanged) {
        try {
          await assignParticipants(eventId, [
            { participantId: row.participantId, fromGroupId: row.group?.groupId ?? null, toGroupId: groupDraft || null },
          ]);
          setGroupDraft(null);
        } catch (error) {
          setFailure({ kind: "group", text: groupFailure(error) });
          return;
        } finally {
          void queryClient.invalidateQueries({ queryKey: queryKeys.applicationTable(eventId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard(eventId) });
        }
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const memoLength = [...memo].length;
  const submitted = formatSubmittedAt(row.submittedAt).replace(/\s\d{2}:\d{2}$/, "");

  return (
    <div className="operation-drawer" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <div ref={panel} className="operation-drawer__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="operation-drawer__head">
          <button type="button" className="operation-drawer__back" aria-label="닫기" onClick={requestClose}>
            ‹
          </button>
          <div>
            <h2 id={titleId} className="operation-drawer__title">
              현재 운영 정보 수정
            </h2>
            <p className="operation-drawer__name">{name}</p>
          </div>
        </header>
        <div className="operation-drawer__body">
          <p className="operation-drawer__lead">현재 운영 정보만 수정해요. 참가자가 제출한 원본 응답은 바뀌지 않아요.</p>

          <div className="operation-drawer__field">
            <span className="operation-drawer__label">현재 참가 상태</span>
            <p className="operation-drawer__value">
              신청 접수 · {row.checkedInAt ? `도착 완료 (${formatSubmittedAt(row.checkedInAt)})` : "도착 전"}
            </p>
            <WithdrawApplication
              eventId={eventId}
              row={row}
              name={personName}
              blocked={
                dirty
                  ? "저장하지 않은 변경이 있어요. 저장하거나 되돌린 뒤 취소해 주세요."
                  : statusChangeBlocked(eventStatus, effective.includes("PARTICIPANT_WRITE"), permissions.isPending)
              }
              onDialog={setWithdrawOpen}
              onWithdrawn={(message) => {
                onWithdrawn?.(message);
                onClose();
              }}
            />
          </div>
          <div className="operation-drawer__field">
            <span className="operation-drawer__label">참석 범위</span>
            <p className="operation-drawer__value">
              {attendance || "참석 범위 질문이 없어요"}
              {slots ? <span className="operation-drawer__sub">참석 일정: {slots}</span> : null}
            </p>
          </div>
          <p className="operation-drawer__note">참석 범위는 아직 여기서 바꿀 수 없어요. 다른 사정은 운영 메모에 적어 주세요.</p>

          {table.groupVisible ? (
            <div className="operation-drawer__field">
              <label className="operation-drawer__label" htmlFor={groupId}>
                조 배정
              </label>
              <select
                id={groupId}
                className="operation-drawer__control"
                value={targetGroup}
                disabled={Boolean(groupBlocked) || busy}
                aria-describedby={`${groupId}-note`}
                onChange={(event) => {
                  setGroupDraft(event.target.value);
                  setSaved(false);
                }}
              >
                <option value={UNASSIGNED}>미배정</option>
                {groups.map((group) => (
                  <option key={group.groupId} value={group.groupId}>
                    {group.name}
                    {row.group?.groupId === group.groupId && row.group.leader ? " · 조장" : ""}
                  </option>
                ))}
              </select>
              <p id={`${groupId}-note`} className="operation-drawer__hint">
                {groupBlocked ?? "조 편성의 작업본이 바뀌어요. 참가자에게는 조 편성에서 공개해야 보여요."}
              </p>
            </div>
          ) : null}

          <div className="operation-drawer__field">
            <label className="operation-drawer__label" htmlFor={memoId}>
              운영 메모
            </label>
            <textarea
              id={memoId}
              className="operation-drawer__control operation-drawer__memo"
              value={memo}
              readOnly={Boolean(memoBlocked)}
              disabled={busy}
              maxLength={OPERATION_MEMO_MAX}
              placeholder={memoBlocked ? "" : "예: 토 저녁 잠시 외출 후 복귀, 통근"}
              aria-describedby={`${memoId}-count ${memoId}-meta`}
              onChange={(event) => {
                setMemoDraft(event.target.value);
                setSaved(false);
              }}
            />
            <div className="operation-drawer__meta">
              <span id={`${memoId}-meta`}>
                {memoBlocked ??
                  (row.operation.version > 0 && row.operation.updatedAt
                    ? `마지막 저장 ${formatSubmittedAt(row.operation.updatedAt)}${row.operation.updatedByDisplayName ? ` · ${row.operation.updatedByDisplayName}` : ""}`
                    : "운영자만 봐요. 참가자와 CSV에는 나가지 않아요.")}
              </span>
              <span id={`${memoId}-count`}>
                {memoLength.toLocaleString("ko-KR")} / {OPERATION_MEMO_MAX.toLocaleString("ko-KR")}자
              </span>
            </div>
          </div>

          {failure?.kind === "memo-conflict" ? (
            <div className="operation-drawer__alert" role="alert">
              <p>다른 운영자가 이 메모를 먼저 고쳤어요. 내가 쓴 글은 그대로 두었어요. 아래 최신 내용과 비교한 뒤 다시 저장해 주세요.</p>
              <p className="operation-drawer__latest-meta">
                지금 저장된 메모
                {failure.latest.updatedAt ? ` · ${formatSubmittedAt(failure.latest.updatedAt)}` : ""}
                {failure.latest.updatedByDisplayName ? ` · ${failure.latest.updatedByDisplayName}` : ""}
              </p>
              <p className="operation-drawer__latest">{failure.latest.memo || "(빈 메모)"}</p>
              <Button
                type="button"
                variant="tertiary"
                size={32}
                onClick={() => {
                  setMemoDraft(null);
                  setFailure(null);
                }}
              >
                최신 내용으로 바꾸기
              </Button>
            </div>
          ) : null}
          {failure && failure.kind !== "memo-conflict" ? (
            <p className="operation-drawer__alert" role="alert">
              {failure.text}
            </p>
          ) : null}
          {saved && !dirty ? (
            <p className="operation-drawer__saved" role="status">
              저장했어요.
            </p>
          ) : null}

          <PinReset
            eventId={eventId}
            participantId={row.participantId}
            eventStatus={eventStatus}
            mayWrite={!permissions.isPending && effective.includes("PARTICIPANT_WRITE")}
          />

          <p className="operation-drawer__origin">
            신청 당시 값: {attendance || "참석 범위 없음"} · {submitted} 제출
          </p>
        </div>
        <footer className="operation-drawer__foot">
          <Button type="button" variant="secondary" size={40} disabled={busy} onClick={requestClose}>
            {dirty ? "취소" : "닫기"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size={40}
            loading={busy}
            disabled={!dirty || busy || [...(memoDraft ?? "")].length > OPERATION_MEMO_MAX}
            onClick={() => (groupChanged ? setConfirming(true) : void save())}
          >
            변경 저장
          </Button>
        </footer>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="현재 운영 정보를 변경할까요?"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button type="button" variant="secondary" size={40} onClick={() => setConfirming(false)}>
                취소
              </Button>
              <Button type="button" variant="primary" size={40} onClick={() => void save()}>
                저장
              </Button>
            </>
          }
        >
          <p>바뀐 운영 정보만 저장해요. 참가자 원본 응답은 그대로예요.</p>
          <div className="operation-drawer__impact">
            <strong>실제 영향 항목</strong>
            <ul>
              {groupChanged ? (
                <li>
                  조 배정: {groupName(currentGroup)} → {groupName(targetGroup)} (공개 전까지 참가자에게는 보이지 않아요)
                  {targetGroup !== UNASSIGNED ? " · 새 조의 맨 뒤에 들어가요" : ""}
                </li>
              ) : null}
              {groupChanged && row.group?.leader ? (
                <li className="operation-drawer__impact-warn">
                  {row.group.name} 조장 표시가 풀려요. 조장은 조마다 1명이라 필요하면 조 편성에서 다시 정해 주세요.
                </li>
              ) : null}
              {memoChanged ? <li>운영 메모</li> : null}
            </ul>
          </div>
        </ConfirmDialog>
      ) : null}
      {askClose ? (
        <ConfirmDialog
          title="저장하지 않은 변경이 있어요"
          onClose={() => setAskClose(false)}
          footer={
            <>
              <Button type="button" variant="secondary" size={40} onClick={() => setAskClose(false)}>
                계속 고치기
              </Button>
              <Button type="button" variant="primary" size={40} onClick={onClose}>
                저장하지 않고 닫기
              </Button>
            </>
          }
        >
          <p>닫으면 고친 내용이 사라져요.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function memoBlockedReason(status: LifecycleStatus, mayWrite: boolean, pending: boolean): string | null {
  if (status === "ARCHIVED") return "보관된 행사는 운영 메모를 고칠 수 없어요.";
  if (pending) return null;
  if (!mayWrite) return "운영 메모를 고칠 권한이 없어요. 행사 소유자에게 요청해 주세요.";
  return null;
}

function groupBlockedReason(status: LifecycleStatus, mayWrite: boolean, pending: boolean, participantId: string): string | null {
  if (status === "ENDED" || status === "ARCHIVED") return "끝나거나 보관된 행사는 조를 바꿀 수 없어요.";
  if (pending) return null;
  if (!mayWrite) return "조 편성 권한이 있는 운영자만 조를 바꿀 수 있어요.";
  if (!participantId) return "지금은 조를 바꿀 수 없어요. 조 편성 화면에서 바꿔 주세요.";
  return null;
}

function memoFailure(error: unknown): string {
  if (isApiError(error, "FORBIDDEN")) return "운영 메모를 고칠 권한이 없어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사는 운영 메모를 고칠 수 없어요.";
  if (isApiError(error, "INVALID_STATE_TRANSITION")) return "취소되었거나 바뀐 신청이라 메모를 저장할 수 없어요.";
  if (isApiError(error, "VALIDATION_FAILED")) return `운영 메모는 ${OPERATION_MEMO_MAX.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`;
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "신청을 찾을 수 없어요.";
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function groupFailure(error: unknown): string {
  if (assignmentConflicts(error).length > 0 || isApiError(error, "CONCURRENT_MODIFICATION")) {
    return "다른 운영자가 이 사람의 조를 먼저 바꿨어요. 지금 조를 다시 불러왔으니 확인한 뒤 다시 저장해 주세요.";
  }
  if (isApiError(error, "FORBIDDEN")) return "조 편성 권한이 없어 조를 바꾸지 못했어요.";
  if (isApiError(error, "INVALID_STATE_TRANSITION", "EVENT_ARCHIVED")) return "지금 행사 상태나 신청 상태에서는 조를 바꿀 수 없어요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "그 조가 지워졌어요. 다시 골라 주세요.";
  return "조를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";
}
