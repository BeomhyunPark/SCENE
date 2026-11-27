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
import { Select } from "./Select";
import { blockedCopy, taskFieldCopy, taskStatusLabel } from "./taskCopy";
import { periodText } from "./taskMonth";
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
  // 기간 (#475): kept as typed until saved, reset when the server's dates change.
  const serverDates = `${task.data?.startDate ?? ""}|${task.data?.dueDate ?? ""}`;
  const [datesSource, setDatesSource] = useState(serverDates);
  const [startDate, setStartDate] = useState(task.data?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task.data?.dueDate ?? "");
  if (serverDates !== datesSource) {
    setDatesSource(serverDates);
    setStartDate(task.data?.startDate ?? "");
    setDueDate(task.data?.dueDate ?? "");
  }

  // 바뀌면 바로 저장 (#493, Figma P07-D01에는 저장 버튼이 없다): 제목은 칸을 떠나거나 Enter, 기간은 두 날짜 칸을 떠날 때.
  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed === serverTitle) return;
    if (!trimmed) {
      setField("업무 제목을 입력해 주세요.");
      return;
    }
    void run(() => patchTask(eventId, taskId, { title: trimmed }));
  }

  function saveDates() {
    if (`${startDate}|${dueDate}` === serverDates) return;
    if ((startDate && !dueDate) || (startDate && dueDate && startDate > dueDate)) {
      setField(taskFieldCopy.dueDate);
      return;
    }
    void run(() => patchTask(eventId, taskId, { startDate: startDate || null, dueDate: dueDate || null }), "기간을 저장했어요.");
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

  if (task.isPending) return <OperatorStatus title="준비 업무" busy message="불러오는 중이에요." spaceName={spaceName} />;
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
        title="준비 업무"
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
      title="준비 업무"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={areas}
      participantsHref={areas.includes("participants") ? `/events/${eventId}/participants` : undefined}
      tasksHref={`/events/${eventId}/tasks`}
      framed
      leading={
        <Link className="event-home__back scene-press scene-press--text" to={`/events/${eventId}/tasks`} aria-label="업무 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="task-detail">
        <div className="task-detail__main">
          {canWrite ? (
            <input
              className="task-detail__title"
              aria-label="업무 제목"
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              onBlur={saveTitle}
              onKeyDown={(key) => {
                if (key.key === "Enter") {
                  key.preventDefault();
                  saveTitle();
                }
                if (key.key === "Escape") setTitle(serverTitle);
              }}
            />
          ) : (
            <h2 className="task-detail__title">{body.title}</h2>
          )}
          {notice ? <p className="task-detail__notice" role="status">{notice}</p> : null}
          {alert ? <p className="task-detail__alert" role="alert">{alert}</p> : null}
          {field ? <p className="task-detail__alert" role="alert">{field}</p> : null}
          {body.checklist.items.length > 0 ? (
            <section className="task-detail__checklist" aria-labelledby="task-detail-checklist">
              <div className="task-detail__section-head">
                <h3 id="task-detail-checklist">체크리스트</h3>
                <span>
                  {body.checklist.done}/{body.checklist.total} 완료
                </span>
              </div>
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
                      <span>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="task-detail__panel">
          <div className="task-detail__prop">
            <span className="task-detail__label">현재 상태</span>
            <span className={`task-detail__status task-detail__status--${body.status.toLowerCase()}`}>{taskStatusLabel(body.status)}</span>
          </div>
          <div className="task-detail__prop">
            <label className="task-detail__label" htmlFor="task-detail-assignee">
              담당자
            </label>
            {canWrite ? (
              <Select
                id="task-detail-assignee"
                className="task-detail__control"
                value={body.assigneeUserId ?? ""}
                options={[
                  { value: "", label: "담당 없음" },
                  ...(operators.data?.items.map((operator) => ({ value: operator.userId, label: operator.displayName })) ?? []),
                ]}
                onChange={(value) => {
                  void run(() => patchTask(eventId, taskId, { assigneeUserId: value === "" ? null : value }));
                }}
              />
            ) : (
              <span className="task-detail__value">{body.assigneeDisplayName ?? "담당 없음"}</span>
            )}
          </div>
          {canWrite ? (
            <div
              className="task-detail__dates"
              role="group"
              aria-label="기간"
              onBlur={(blur) => {
                if (!blur.currentTarget.contains(blur.relatedTarget as Node | null)) saveDates();
              }}
              onKeyDown={(key) => {
                if (key.key === "Enter") {
                  key.preventDefault();
                  saveDates();
                }
              }}
            >
              <div className="task-detail__prop">
                <label className="task-detail__label" htmlFor="task-detail-start">
                  시작일
                </label>
                <input
                  id="task-detail-start"
                  className="task-detail__control"
                  type="date"
                  value={startDate}
                  max={dueDate || undefined}
                  onChange={(change) => setStartDate(change.target.value)}
                />
              </div>
              <div className="task-detail__prop">
                <label className="task-detail__label" htmlFor="task-detail-due">
                  마감일
                </label>
                <input
                  id="task-detail-due"
                  className="task-detail__control"
                  type="date"
                  value={dueDate}
                  min={startDate || undefined}
                  onChange={(change) => setDueDate(change.target.value)}
                />
              </div>
            </div>
          ) : body.dueDate ? (
            <div className="task-detail__prop">
              <span className="task-detail__label">기간</span>
              <span className="task-detail__value task-detail__period">{periodText(body)}</span>
            </div>
          ) : null}
          {!readOnly ? (
            <div className="task-detail__actions">
              {reasonText ? (
                <p id="task-detail-blocked" className="task-detail__hint">
                  {reasonText}
                </p>
              ) : null}
              {/* 완료와 다시 진행 중 지금 쓸 수 있는 쪽만 둔다(#483, Figma P07-D01은 "업무 완료" 하나). */}
              {body.status === "DONE" ? (
                <>
                  {body.actions.canReopen ? (
                    <div className="task-detail__prop">
                      <label className="task-detail__label" htmlFor="task-detail-reason">
                        사유 (선택)
                      </label>
                      <input
                        id="task-detail-reason"
                        className="task-detail__control"
                        aria-label="사유"
                        value={reason}
                        onChange={(change) => setReason(change.target.value)}
                      />
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size={40}
                    disabled={!body.actions.canReopen || pending}
                    aria-describedby={reasonText ? "task-detail-blocked" : undefined}
                    onClick={() => void run(() => reopenTask(eventId, taskId, { version: body.version, reason: reason || undefined }))}
                  >
                    다시 진행
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size={40}
                  disabled={!body.actions.canComplete || pending}
                  aria-describedby={reasonText ? "task-detail-blocked" : undefined}
                  onClick={() => void run(() => completeTask(eventId, taskId, body.version))}
                >
                  업무 완료
                </Button>
              )}
              {canWrite ? (
                <div className="task-detail__quiet">
                  <Button type="button" variant="tertiary" size={40} onClick={() => setConfirm("cancel")}>
                    업무 취소
                  </Button>
                  <Button type="button" variant="tertiary" size={40} onClick={() => setConfirm("delete")}>
                    업무 삭제
                  </Button>
                </div>
              ) : null}
            </div>
          ) : reasonText ? (
            <p className="task-detail__hint">{reasonText}</p>
          ) : null}
        </aside>
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
