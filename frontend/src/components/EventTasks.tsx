import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { createTask, listTasks, type TaskListItem } from "../api/tasks";
import { taskSuggester as defaultSuggester } from "../ai/taskSuggestions";
import type { TaskSuggester } from "../ai/taskSuggestions";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { reloadQuery } from "../api/queryClient";
import { readEventAreas, markEventArea } from "./eventLocalState";
import { TaskSuggestionPanel } from "./TaskSuggestionPanel";
import { taskFieldCopy, taskStatusLabel } from "./taskCopy";
import { TaskMonth } from "./TaskMonth";
import { periodText } from "./taskMonth";
import { localDate } from "./participant/scheduleNow";
import "./EventTasks.css";

type View = "list" | "month";
const WIDE_QUERY = "(min-width: 720px)";

/** The month grid needs room; phones get the month as a list by day (SCENE DS 65:25). */
function useWideMonth(): boolean {
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return wide;
}

export function EventTasks({ suggester = defaultSuggester }: { suggester?: TaskSuggester }) {
  const { eventId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "tasks");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <TaskList event={event} spaceName={spaceName} suggester={suggester} />}
    </EventScreen>
  );
}

function TaskList({
  event,
  spaceName,
  suggester,
}: {
  event: EventDetail;
  spaceName?: string;
  suggester: TaskSuggester;
}) {
  const navigate = useNavigate();
  const eventId = event.eventId;
  const areas = [...new Set([...readEventAreas(eventId), "tasks"])];
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const tasks = useQuery({
    queryKey: queryKeys.tasks(eventId, 0),
    queryFn: () => listTasks(eventId, { page: 0, size: 50 }),
  });
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [view, setView] = useState<View>("list");
  const wide = useWideMonth();
  const titleInput = useRef<HTMLInputElement>(null);
  const [today] = useState(() => localDate(Date.now()));
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  if (!panelReady && tasks.data) {
    setPanelReady(true);
    if (tasks.data.page.totalItems === 0) setPanelOpen(true);
  }
  const canWrite = permissions.data?.effective.includes("TASK_WRITE") ?? false;
  const open = panelOpen;

  async function add(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    const trimmed = title.trim();
    setFieldError("");
    setFormError("");
    if (!trimmed) {
      setFieldError("업무 제목을 입력해 주세요.");
      return;
    }
    setPending(true);
    try {
      await createTask(eventId, { title: trimmed, startDate: startDate || null, dueDate: dueDate || null });
      setTitle("");
      setStartDate("");
      setDueDate("");
      await reloadQuery(tasks);
    } catch (caught) {
      if (isApiError(caught, "VALIDATION_FAILED")) {
        const field = caught.errors?.[0]?.field ?? "";
        setFieldError(taskFieldCopy[field] ?? "제목을 확인해 주세요.");
        return;
      }
      setFormError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

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
        <Link className="event-home__back scene-press scene-press--text" to={`/events/${eventId}`} aria-label="행사로">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-tasks">
        <p className="event-tasks__support">{event.name}의 준비 업무예요.</p>
        {canWrite ? (
          <form className="event-tasks__create" onSubmit={(form) => void add(form)}>
            <label htmlFor="task-title">업무 제목</label>
            <input
              id="task-title"
              ref={titleInput}
              value={title}
              aria-invalid={fieldError.length > 0}
              onChange={(change) => setTitle(change.target.value)}
            />
            <label className="event-tasks__date">
              시작일 (선택)
              <input type="date" value={startDate} max={dueDate || undefined} onChange={(change) => setStartDate(change.target.value)} />
            </label>
            <label className="event-tasks__date">
              마감일 (선택)
              <input type="date" value={dueDate} min={startDate || undefined} onChange={(change) => setDueDate(change.target.value)} />
            </label>
            <Button type="submit" variant="primary" size={40} loading={pending}>
              업무 추가
            </Button>
          </form>
        ) : null}
        {fieldError ? <p role="alert">{fieldError}</p> : null}
        {formError ? <p role="alert">{formError}</p> : null}
        {tasks.isPending ? <p>불러오는 중이에요.</p> : null}
        {tasks.isError ? (
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(tasks)}>
            다시 시도
          </Button>
        ) : null}
        {tasks.data && tasks.data.page.totalItems === 0 ? <p>아직 준비 업무가 없어요</p> : null}
        {tasks.data ? (
          <div className="event-tasks__views" role="group" aria-label="보기">
            <Button type="button" variant={view === "list" ? "primary" : "secondary"} size={32} aria-pressed={view === "list"} onClick={() => setView("list")}>
              목록
            </Button>
            <Button type="button" variant={view === "month" ? "primary" : "secondary"} size={32} aria-pressed={view === "month"} onClick={() => setView("month")}>
              월
            </Button>
          </div>
        ) : null}
        {tasks.data && view === "month" ? (
          <>
            <TaskMonth
              tasks={tasks.data.items}
              period={{ startDate: event.startDate, endDate: event.endDate }}
              today={today}
              wide={wide}
              onOpen={(taskId) => navigate(`/events/${eventId}/tasks/${taskId}`)}
              onPick={
                canWrite
                  ? (range) => {
                      setStartDate(range.startDate === range.dueDate ? "" : range.startDate);
                      setDueDate(range.dueDate);
                      titleInput.current?.focus();
                      titleInput.current?.scrollIntoView?.({ block: "center" });
                    }
                  : undefined
              }
            />
            {tasks.data.items.some((task) => task.dueDate === null) ? (
              <section className="event-tasks__undated" aria-label="날짜 없는 업무">
                <h3>날짜 없는 업무</h3>
                <TaskRows tasks={tasks.data.items.filter((task) => task.dueDate === null)} onOpen={(taskId) => navigate(`/events/${eventId}/tasks/${taskId}`)} />
              </section>
            ) : null}
          </>
        ) : null}
        {tasks.data && view === "list" && tasks.data.items.length > 0 ? (
          <ul className="event-tasks__rows">
            {tasks.data.items.map((task) => (
              <li key={task.taskId}>
                <button
                  type="button"
                  className="scene-press scene-press--card"
                  onClick={() => navigate(`/events/${eventId}/tasks/${task.taskId}`)}
                >
                  <span>{task.title}</span>
                  <span className="event-tasks__badge">{taskStatusLabel(task.status)}</span>
                  <span>{task.assigneeDisplayName ?? "담당 없음"}</span>
                  {task.dueDate ? <span className="event-tasks__period">{periodText(task)}</span> : null}
                  {task.checklist.total > 0 ? (
                    <span>
                      {task.checklist.done}/{task.checklist.total}
                    </span>
                  ) : null}
                  <span className="scene-chevron scene-chevron--end" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <TaskSuggestionPanel eventId={eventId} titles={tasks.data?.items.map((task) => task.title) ?? []} suggester={suggester} />
        ) : (
          <Button type="button" variant="tertiary" size={40} onClick={() => setPanelOpen(true)}>
            추천 업무 보기
          </Button>
        )}
      </div>
    </OperatorShell>
  );
}

function TaskRows({ tasks, onOpen }: { tasks: readonly TaskListItem[]; onOpen: (taskId: string) => void }) {
  return (
    <ul className="event-tasks__rows">
      {tasks.map((task) => (
        <li key={task.taskId}>
          <button type="button" className="scene-press scene-press--card" onClick={() => onOpen(task.taskId)}>
            <span>{task.title}</span>
            <span className="event-tasks__badge">{taskStatusLabel(task.status)}</span>
            <span>{task.assigneeDisplayName ?? "담당 없음"}</span>
            <span className="scene-chevron scene-chevron--end" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
