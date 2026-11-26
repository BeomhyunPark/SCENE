import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../api/events";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { listTasks, type TaskListItem } from "../api/tasks";
import { taskSuggester as defaultSuggester } from "../ai/taskSuggestions";
import type { TaskSuggester } from "../ai/taskSuggestions";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { reloadQuery } from "../api/queryClient";
import { readEventAreas, markEventArea } from "./eventLocalState";
import { TaskSuggestionPanel } from "./TaskSuggestionPanel";
import { taskStatusLabel } from "./taskCopy";
import { TaskCreateDrawer } from "./TaskCreateDrawer";
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
  const [view, setView] = useState<View>("list");
  const wide = useWideMonth();
  const [today] = useState(() => localDate(Date.now()));
  // 만들기 서랍 (#493, P07-D02): 오른쪽 위 버튼이나 월 달력에서 고른 기간으로 연다.
  const [creating, setCreating] = useState<{ startDate: string; dueDate: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  if (!panelReady && tasks.data) {
    setPanelReady(true);
    if (tasks.data.page.totalItems === 0) setPanelOpen(true);
  }
  const canWrite = permissions.data?.effective.includes("TASK_WRITE") ?? false;
  const open = panelOpen;
  const openTask = (taskId: string) => navigate(`/events/${eventId}/tasks/${taskId}`);

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
        <p className="event-tasks__support">행사 준비에 필요한 업무와 담당자, 마감 상태를 확인해요.</p>
        {tasks.isPending ? <p>불러오는 중이에요.</p> : null}
        {tasks.isError ? (
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(tasks)}>
            다시 시도
          </Button>
        ) : null}
        {tasks.data && tasks.data.page.totalItems === 0 ? <p>아직 준비 업무가 없어요</p> : null}
        {tasks.data || canWrite ? (
          <div className="event-tasks__toolbar">
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
            {canWrite ? (
              <Button type="button" variant="primary" size={40} className="event-tasks__add" onClick={() => setCreating({ startDate: "", dueDate: "" })}>
                <span className="event-tasks__plus" aria-hidden="true">+</span>업무 추가
              </Button>
            ) : null}
          </div>
        ) : null}
        {tasks.data && view === "month" ? (
          <>
            <TaskMonth
              tasks={tasks.data.items}
              period={{ startDate: event.startDate, endDate: event.endDate }}
              today={today}
              wide={wide}
              onOpen={openTask}
              onPick={
                canWrite
                  ? (range) => setCreating({ startDate: range.startDate === range.dueDate ? "" : range.startDate, dueDate: range.dueDate })
                  : undefined
              }
            />
            {tasks.data.items.some((task) => task.dueDate === null) ? (
              <section className="event-tasks__undated" aria-label="날짜 없는 업무">
                <h3>날짜 없는 업무</h3>
                <TaskRows tasks={tasks.data.items.filter((task) => task.dueDate === null)} onOpen={openTask} />
              </section>
            ) : null}
          </>
        ) : null}
        {tasks.data && view === "list" && tasks.data.items.length > 0 ? (
          <TaskRows tasks={tasks.data.items} onOpen={openTask} />
        ) : null}
        {open ? (
          <TaskSuggestionPanel eventId={eventId} titles={tasks.data?.items.map((task) => task.title) ?? []} suggester={suggester} />
        ) : (
          <Button type="button" variant="tertiary" size={40} onClick={() => setPanelOpen(true)}>
            추천 업무 보기
          </Button>
        )}
        {/* 서랍은 이 안에 둔다: 넓은 화면의 framed 본문은 직계 자식마다 좌우 여백을 주기 때문이다. */}
        {creating ? (
          <TaskCreateDrawer eventId={eventId} initial={creating} onClose={() => setCreating(null)} onCreated={() => reloadQuery(tasks)} />
        ) : null}
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
            <span className="event-tasks__title">{task.title}</span>
            <span className="event-tasks__badge">{taskStatusLabel(task.status)}</span>
            <span className="event-tasks__meta">{task.assigneeDisplayName ?? "담당 없음"}</span>
            {task.dueDate ? <span className="event-tasks__period">{periodText(task)}</span> : null}
            {task.checklist.total > 0 ? (
              <span className="event-tasks__meta">
                {task.checklist.done}/{task.checklist.total}
              </span>
            ) : null}
            <span className="scene-chevron scene-chevron--end" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
