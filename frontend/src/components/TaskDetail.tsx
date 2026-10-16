import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { getMyPermissions, listOperators } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import {
  completeTask,
  deleteTask,
  getTask,
  patchTask,
  reopenTask,
  setItemChecked,
  type TaskDetail as TaskBody,
  type TaskProgress,
} from "../api/tasks";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { markEventArea, readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import { blockedCopy, taskFieldCopy, taskStatusLabel } from "./taskCopy";
import "./TaskDetail.css";

export function TaskDetail() {
  const { eventId = "", taskId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "tasks");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <Detail event={event} spaceName={spaceName} taskId={taskId} />}
    </EventScreen>
  );
}

function Detail({ event, spaceName, taskId }: { event: EventDetail; spaceName?: string; taskId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const eventId = event.eventId;
  const areas = [...new Set([...readEventAreas(eventId), "tasks"])];
  const task = useQuery({
    queryKey: queryKeys.task(eventId, taskId),
    queryFn: () => getTask(eventId, taskId),
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const operators = useQuery({
    queryKey: queryKeys.operators(eventId),
    queryFn: () => listOperators(eventId),
  });
  const serverTitle = task.data?.title ?? "";
  const [titleSource, setTitleSource] = useState(serverTitle);
  const [title, setTitle] = useState(serverTitle);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [alert, setAlert] = useState("");
  const [field, setField] = useState("");
  const [readOnly, setReadOnly] = useState(event.lifecycleStatus === "ARCHIVED");
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const canWrite = !readOnly && (permissions.data?.effective.includes("TASK_WRITE") ?? false);
  if (serverTitle !== titleSource) {
    setTitleSource(serverTitle);
    setTitle(serverTitle);
  }

  function merge(progress: TaskProgress) {
    queryClient.setQueryData<TaskBody>(queryKeys.task(eventId, taskId), (current) =>
      current ? { ...current, ...progress, title: current.title } : current,
    );
  }

  function fail(caught: unknown): boolean {
    if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert("업무를 찾을 수 없어요.");
      void queryClient.invalidateQueries({ queryKey: ["events", eventId, "tasks"] });
      return true;
    }
    if (isApiError(caught, "NOT_A_MEMBER")) {
      navigate("/events");
      return true;
    }
    if (isApiError(caught, "FORBIDDEN")) {
      setAlert("이 업무를 바꿀 권한이 없어요.");
      void reloadQuery(task);
      return true;
    }
    if (isApiError(caught, "TASK_VERSION_CONFLICT")) {
      const next = caught.extensions.task;
      if (isProgress(next)) merge(next);
      setAlert("다른 사람이 먼저 이 업무를 바꿨어요. 최신 상태를 확인하고 다시 시도해 주세요.");
      return true;
    }
    if (isApiError(caught, "INVALID_TASK_STATE")) {
      const next = caught.extensions.task;
      if (isProgress(next)) merge(next);
      const reasonCode = caught.extensions.reason;
      if (reasonCode === "CHECKLIST_INCOMPLETE") setAlert("체크 항목을 모두 확인해야 완료할 수 있어요.");
      else if (reasonCode === "TASK_CANCELLED") setAlert("취소된 업무예요.");
      else if (reasonCode === "TASK_DONE") setAlert("완료된 업무예요. 다시 진행한 뒤 바꿀 수 있어요.");
      else setAlert("저장하지 못했어요. 다시 시도해 주세요.");
      return true;
    }
    if (isApiError(caught, "EVENT_ARCHIVED")) {
      const next = caught.extensions.task;
      if (isProgress(next)) merge(next);
      setReadOnly(true);
      setAlert("보관된 행사는 바꿀 수 없어요.");
      return true;
    }
    if (isApiError(caught, "VALIDATION_FAILED")) {
      const name = caught.errors?.[0]?.field ?? "";
      setField(taskFieldCopy[name] ?? "저장하지 못했어요. 다시 시도해 주세요.");
      return true;
    }
    setAlert("저장하지 못했어요. 다시 시도해 주세요.");
    return true;
  }

  async function run(action: () => Promise<TaskProgress | TaskBody | void>, quiet?: string) {
    setNotice("");
    setAlert("");
    setField("");
    setPending(true);
    try {
      const result = await action();
      if (result && "outcome" in result) {
        if ("title" in result) {
          queryClient.setQueryData(queryKeys.task(eventId, taskId), result);
        } else if (result.outcome) {
          merge(result);
        }
        if (result.outcome === "ALREADY_DONE") setNotice("이미 완료된 업무예요.");
        if (result.outcome === "ALREADY_OPEN") setNotice("이미 진행 중인 업무예요.");
      }
      if (quiet) setNotice(quiet);
      await queryClient.invalidateQueries({ queryKey: ["events", eventId, "tasks", 0] });
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  }

  if (task.isPending) return <OperatorStatus busy message="불러오는 중이에요." spaceName={spaceName} />;
  if (alert === "업무를 찾을 수 없어요." || isApiError(task.error, "RESOURCE_NOT_FOUND")) {
    return (
      <OperatorShell title="준비 업무" spaceName={spaceName} eventName={event.name}>
        <p role="alert">업무를 찾을 수 없어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${eventId}/tasks`)}>
          목록으로
        </Button>
      </OperatorShell>
    );
  }
  if (task.isError || !task.data) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        spaceName={spaceName}
        action={
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(task)}>
            다시 시도
          </Button>
        }
      />
    );
  }

  const body = task.data;
  const reasonText = blockedCopy(body.actions.blockedReason);

  return (
    <OperatorShell
      title={body.title}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={areas}
      participantsHref={areas.includes("participants") ? `/events/${eventId}/participants` : undefined}
      tasksHref={`/events/${eventId}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={`/events/${eventId}/tasks`} aria-label="업무 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="task-detail">
        <p className="task-detail__badge">{taskStatusLabel(body.status)}</p>
        {notice ? <p role="status">{notice}</p> : null}
        {alert ? <p role="alert">{alert}</p> : null}
        {reasonText ? <p>{reasonText}</p> : null}
        {canWrite ? (
          <form
            className="task-detail__title"
            onSubmit={(form) => {
              form.preventDefault();
              void run(() => patchTask(eventId, taskId, { title }));
            }}
          >
            <label htmlFor="task-edit-title">업무 제목</label>
            <input id="task-edit-title" value={title} onChange={(change) => setTitle(change.target.value)} />
            <Button type="submit" variant="secondary" size={40} loading={pending}>
              제목 저장
            </Button>
          </form>
        ) : (
          <h2>{body.title}</h2>
        )}
        {field ? <p role="alert">{field}</p> : null}
        <label className="task-detail__assignee">
          담당자
          <select
            aria-label="담당자"
            value={body.assigneeUserId ?? ""}
            disabled={!canWrite}
            onChange={(change) => {
              const value = change.target.value;
              void run(() => patchTask(eventId, taskId, { assigneeUserId: value === "" ? null : value }));
            }}
          >
            <option value="">담당 없음</option>
            {operators.data?.items.map((operator) => (
              <option key={operator.userId} value={operator.userId}>
                {operator.displayName}
              </option>
            ))}
          </select>
        </label>
        <ul className="task-detail__items">
          {body.checklist.items.map((item) => (
            <li key={item.itemId}>
              <label>
                <input
                  type="checkbox"
                  aria-label={item.label}
                  checked={item.checked}
                  disabled={!body.actions.canCheck || readOnly}
                  onChange={(event) => {
                    event.currentTarget.checked = item.checked;
                    const previous = queryClient.getQueryData<TaskBody>(queryKeys.task(eventId, taskId));
                    if (previous) {
                      queryClient.setQueryData<TaskBody>(queryKeys.task(eventId, taskId), {
                        ...previous,
                        checklist: {
                          ...previous.checklist,
                          items: previous.checklist.items.map((row) =>
                            row.itemId === item.itemId ? { ...row, checked: !row.checked } : row,
                          ),
                        },
                      });
                    }
                    void run(async () => {
                      try {
                        return await setItemChecked(eventId, taskId, item.itemId, !item.checked);
                      } catch (caught) {
                        if (previous) queryClient.setQueryData(queryKeys.task(eventId, taskId), previous);
                        throw caught;
                      }
                    });
                  }}
                />
                {item.label}
              </label>
            </li>
          ))}
        </ul>
        {!readOnly ? (
          <div className="task-detail__actions">
            <Button
              type="button"
              variant="primary"
              size={40}
              disabled={!body.actions.canComplete || pending}
              onClick={() => void run(() => completeTask(eventId, taskId, body.version))}
            >
              완료
            </Button>
            <Button
              type="button"
              variant="secondary"
              size={40}
              disabled={!body.actions.canReopen || pending}
              onClick={() => void run(() => reopenTask(eventId, taskId, { version: body.version, reason: reason || undefined }))}
            >
              다시 진행
            </Button>
            {canWrite ? (
              <>
                <Button type="button" variant="secondary" size={40} onClick={() => setConfirm("cancel")}>
                  업무 취소
                </Button>
                <Button type="button" variant="danger" size={40} onClick={() => setConfirm("delete")}>
                  삭제
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {!readOnly && body.actions.canReopen ? (
          <label>
            사유 (선택)
            <input aria-label="사유" value={reason} onChange={(change) => setReason(change.target.value)} />
          </label>
        ) : null}
      </div>
      {confirm ? (
        <ConfirmDialog
          title={confirm === "delete" ? "업무를 삭제할까요?" : "업무를 취소할까요?"}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setConfirm(null)}>
                닫기
              </Button>
              <Button
                type="button"
                variant="danger"
                size={40}
                onClick={() => {
                  const mode = confirm;
                  setConfirm(null);
                  if (mode === "delete") {
                    void run(async () => {
                      await deleteTask(eventId, taskId);
                      navigate(`/events/${eventId}/tasks`);
                    });
                    return;
                  }
                  void run(() => patchTask(eventId, taskId, { status: "CANCELLED" }));
                }}
              >
                {confirm === "delete" ? "삭제" : "업무 취소"}
              </Button>
            </>
          }
        >
          {confirm === "delete" ? "삭제한 업무는 목록에서 빠져요." : "취소한 업무는 다시 진행할 수 없어요."}
        </ConfirmDialog>
      ) : null}
    </OperatorShell>
  );
}

function isProgress(value: unknown): value is TaskProgress {
  return typeof value === "object" && value !== null && "taskId" in value && "version" in value && !("title" in value);
}
