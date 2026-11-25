import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { getApplicationSummary } from "../api/applicationSummary";
import { getCheckInSummary } from "../api/checkIns";
import type { EventDetail } from "../api/events";
import { listOperatorNotifications } from "../api/operatorNotifications";
import { queryKeys } from "../api/queryKeys";
import { getScheduleBoard, type ScheduleBoard, type ScheduleItem } from "../api/schedule";
import { listTasks, type TaskListItem } from "../api/tasks";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { eventContext, lifecycleLabel } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { StaffNoticesCard } from "./notices/StaffNoticesCard";
import { taskStatusLabel } from "./taskCopy";
import "./EventHome.css";

/** Application changes a participant made after submitting: the "변경 요청" summary card (#467). */
const CHANGE_KINDS = new Set(["APPLICATION_REVISED", "APPLICATION_RESUBMITTED", "APPLICATION_CANCELLED"]);
const EMPTY = "–";

export function EventHome() {
  const { eventId = "" } = useParams();
  const areas = readEventAreas(eventId);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => (
        <EventHomeBody event={event} spaceName={spaceName} areas={areas} />
      )}
    </EventScreen>
  );
}

function EventHomeBody({
  event,
  spaceName,
  areas,
}: {
  event: EventDetail;
  spaceName?: string;
  areas: string[];
}) {
  const navigate = useNavigate();
  const eventId = event.eventId;
  const title = event.name;
  const context = eventContext(event);
  const status = event.lifecycleStatus;
  const draftStatus = status === "DRAFT";
  const closed = status === "ENDED" || status === "ARCHIVED";

  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={areas}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      tasksHref={areas.includes("tasks") && eventId ? `/events/${eventId}/tasks` : undefined}
      framed
      leading={
        <Link className="event-home__back" to="/events" aria-label="행사 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${eventId}/settings`)}>
          행사 설정
        </Button>
      }
    >
      <div className="event-home event-home--dashboard">
        <div className="event-home__context">
          <div>
            {context ? <p className="event-home__facts">{context}</p> : null}
            <p className="event-home__state">
              {draftStatus ? "새로 만든 행사" : lifecycleLabel(status)}
              {draftStatus || closed ? null : (
                <>
                  {" · "}
                  <Link className="event-home__retrospective" to={`/events/${eventId}/retrospective`}>
                    회고
                  </Link>
                </>
              )}
            </p>
          </div>
          <span className="event-home__badge">{draftStatus ? "준비 시작" : lifecycleLabel(status)}</span>
        </div>
        {closed ? (
          <section className="event-home__panel event-home__ended">
            <div>
              <h2 className="event-home__panel-title">{status === "ARCHIVED" ? "보관된 행사예요" : "행사가 종료됐어요"}</h2>
              <p className="event-home__panel-support">{status === "ARCHIVED" ? "읽을 수만 있어요." : "회고를 남길 수 있어요."}</p>
            </div>
            <Button type="button" variant="primary" size={40} onClick={() => navigate(`/events/${eventId}/retrospective`)}>
              회고
            </Button>
          </section>
        ) : null}
        <SummaryCards event={event} />
        {closed ? null : (
          <div className="event-home__columns">
            <NowTasks eventId={eventId} />
            <UpcomingSchedule eventId={eventId} />
          </div>
        )}
        {/* 운영진 공지 (DEC-082 §5): every state, an archived event reads. */}
        <StaffNoticesCard eventId={eventId} />
        {/* The sidebar hides under 1024px, so on a phone these are the ways into each area (#286, C4). */}
        <nav className="event-home__modules" aria-label="바로가기">
          <ModuleLink to={`/events/${eventId}/participants`} title="참가 현황" detail="신청 기록과 현재 운영 상태" />
          <ModuleLink to={`/events/${eventId}/tasks`} title="준비 업무" detail="담당·체크리스트" />
          <ModuleLink to={`/events/${eventId}/schedule`} title="일정" detail="시각·장소를 고쳐 바로 공개" />
          {status === "ACTIVE" ? (
            <ModuleLink to={`/events/${eventId}/field`} title="현장 운영" detail="QR 스캔이나 이름으로 도착 확인" />
          ) : null}
        </nav>
      </div>
    </OperatorShell>
  );
}

function ModuleLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link className="event-home__module" to={to}>
      <span className="event-home__module-title">{title}</span>
      <span className="event-home__module-detail">{detail}</span>
    </Link>
  );
}

function SummaryCard({
  to,
  label,
  value,
  detail,
  hint,
  brand = false,
}: {
  to: string;
  label: string;
  value: string;
  detail: string;
  /** Where the card opens, when its label alone does not say (참가자 → 신청 집계). */
  hint?: string;
  brand?: boolean;
}) {
  return (
    <Link className={`event-home__stat${brand ? " event-home__stat--brand" : ""}`} to={to}>
      <span className="event-home__stat-head">
        <span className="event-home__stat-label">{label}</span>
        {hint ? <span className="event-home__stat-hint">{hint}</span> : null}
      </span>
      <span className="event-home__stat-value">{value}</span>
      <span className="event-home__stat-detail">{detail}</span>
    </Link>
  );
}

const FAILED = "불러오지 못했어요";
const LOADING = "불러오는 중";

function SummaryCards({ event }: { event: EventDetail }) {
  const eventId = event.eventId;
  const checkInsOpen = event.lifecycleStatus !== "DRAFT";
  const applications = useQuery({
    queryKey: queryKeys.applicationSummary(eventId),
    queryFn: ({ signal }) => getApplicationSummary(eventId, signal),
  });
  const checkIns = useQuery({
    queryKey: queryKeys.checkInSummary(eventId),
    queryFn: ({ signal }) => getCheckInSummary(eventId, signal),
    enabled: checkInsOpen,
  });
  const tasks = useTasks(eventId);
  const schedule = useSchedule(eventId);
  const notifications = useQuery({
    queryKey: [...queryKeys.operatorNotifications(eventId), "home"],
    queryFn: ({ signal }) => listOperatorNotifications(eventId, null, signal),
  });

  let people = { value: EMPTY, detail: LOADING };
  if (applications.isError) people = { value: EMPTY, detail: FAILED };
  else if (applications.data) {
    const summary = applications.data;
    let detail = "아직 신청이 없어요";
    if (summary.total > 0 && checkIns.data && event.lifecycleStatus === "ACTIVE") {
      detail = `도착 ${checkIns.data.checkedIn} · 미도착 ${checkIns.data.notCheckedIn}`;
    } else if (summary.total > 0 && summary.attendance.asked) {
      const parts = [`전체 ${summary.attendance.full}`, `부분 ${summary.attendance.partial}`];
      if (summary.attendance.worshipOnly > 0) parts.push(`집회만 ${summary.attendance.worshipOnly}`);
      detail = parts.join(" · ");
    } else if (summary.total > 0) detail = `전체 참석 ${summary.attendance.full}`;
    people = { value: `${summary.total}명`, detail };
  }

  let work = { value: EMPTY, detail: LOADING };
  if (tasks.isError) work = { value: EMPTY, detail: FAILED };
  else if (tasks.data) {
    const live = tasks.data.items.filter((task) => task.status !== "CANCELLED");
    const done = live.filter((task) => task.status === "DONE").length;
    const doing = live.filter((task) => task.status === "DOING").length;
    work =
      live.length === 0
        ? { value: "0", detail: "아직 업무가 없어요" }
        : { value: `${done} / ${live.length}`, detail: doing > 0 ? `진행 중 ${doing}` : `남은 업무 ${live.length - done}` };
  }

  let plan = { value: EMPTY, detail: LOADING };
  if (schedule.isError) plan = { value: EMPTY, detail: FAILED };
  else if (schedule.data) {
    const board = schedule.data;
    const pending = board.publication.pendingChanges;
    const unpublished = pending.added + pending.changed + pending.removed;
    let detail = "아직 일정이 없어요";
    if (board.items.length > 0) {
      if (unpublished > 0) detail = `공개 전 변경 ${unpublished}`;
      else detail = board.publication.lastPublishedAt ? "모두 공개됨" : "아직 공개 전";
    }
    plan = { value: `${board.items.length}개`, detail };
  }

  let changes = { value: EMPTY, detail: LOADING };
  if (notifications.isError) changes = { value: EMPTY, detail: FAILED };
  else if (notifications.data) {
    const rows = notifications.data.items.filter((item) => CHANGE_KINDS.has(item.kind));
    const total = rows.reduce((sum, item) => sum + item.count, 0);
    const unread = rows.filter((item) => item.readAt === null).reduce((sum, item) => sum + item.count, 0);
    changes = { value: `${total}건`, detail: total === 0 ? "신청 변경이 없어요" : `미확인 ${unread}` };
  }

  return (
    <section className="event-home__stats" aria-label="운영 요약">
      <SummaryCard to={`/events/${eventId}/participants/summary`} label="참가자" hint="신청 집계" brand {...people} />
      <SummaryCard to={`/events/${eventId}/tasks`} label="준비 업무" {...work} />
      <SummaryCard to={`/events/${eventId}/schedule`} label="일정" {...plan} />
      <SummaryCard to={`/events/${eventId}/notifications`} label="변경 요청" {...changes} />
    </section>
  );
}

/** Same request and cache entry as the 준비 업무 screen's first page. */
function useTasks(eventId: string) {
  return useQuery({
    queryKey: queryKeys.tasks(eventId, 0),
    queryFn: () => listTasks(eventId, { page: 0, size: 50 }),
  });
}

function useSchedule(eventId: string) {
  return useQuery({
    queryKey: queryKeys.scheduleBoard(eventId),
    queryFn: ({ signal }) => getScheduleBoard(eventId, signal),
  });
}

const BADGE_TONE: Record<TaskListItem["status"], string> = {
  TODO: "neutral",
  DOING: "brand",
  DONE: "success",
  CANCELLED: "neutral",
};

function NowTasks({ eventId }: { eventId: string }) {
  const tasks = useTasks(eventId);
  const open = (tasks.data?.items ?? [])
    .filter((task) => task.status === "TODO" || task.status === "DOING")
    .sort((a, b) => Number(b.status === "DOING") - Number(a.status === "DOING"))
    .slice(0, 3);
  const hasTasks = (tasks.data?.items.length ?? 0) > 0;
  return (
    <section className="event-home__panel event-home__now" aria-labelledby="event-home-now">
      <div className="event-home__panel-head">
        <h2 id="event-home-now" className="event-home__panel-title">
          지금 할 일
        </h2>
        <p className="event-home__panel-support">운영에 영향을 주는 항목부터 확인해요.</p>
      </div>
      {tasks.isPending ? <p className="event-home__empty">불러오는 중이에요.</p> : null}
      {tasks.isError ? <p className="event-home__empty">준비 업무를 불러오지 못했어요.</p> : null}
      {tasks.isSuccess && open.length === 0 ? (
        <p className="event-home__empty">{hasTasks ? "남은 준비 업무가 없어요." : "아직 준비 업무가 없어요."}</p>
      ) : null}
      {open.length > 0 ? (
        <ul className="event-home__rows">
          {open.map((task) => (
            <li key={task.taskId}>
              <Link className="event-home__task" to={`/events/${eventId}/tasks/${task.taskId}`}>
                <span className="event-home__check" aria-hidden="true" />
                <span className="event-home__row-copy">
                  <span className="event-home__row-title">{task.title}</span>
                  <span className="event-home__row-meta">{taskMeta(task)}</span>
                </span>
                <span className={`event-home__pill event-home__pill--${BADGE_TONE[task.status]}`}>{taskStatusLabel(task.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function taskMeta(task: TaskListItem): string {
  const parts = [task.assigneeDisplayName ? `담당 ${task.assigneeDisplayName}` : "담당 미정"];
  if (task.checklist.total > 0) parts.unshift(`체크 ${task.checklist.done}/${task.checklist.total}`);
  return parts.join(" · ");
}

/** The next items from now (or the first day before the event), all on one day, at most three. */
function upcomingItems(board: ScheduleBoard, now = new Date()): { dayLabel: string | null; items: ScheduleItem[] } {
  const timed = board.items
    .filter((item) => item.startsAt !== null && new Date(item.startsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
  const first = timed[0];
  if (!first) return { dayLabel: null, items: [] };
  const items = timed.filter((item) => item.day === first.day).slice(0, 3);
  const dayLabel = board.days.find((day) => day.day === first.day)?.dayLabel ?? null;
  return { dayLabel, items };
}

function UpcomingSchedule({ eventId }: { eventId: string }) {
  const schedule = useSchedule(eventId);
  const upcoming = schedule.data ? upcomingItems(schedule.data) : null;
  return (
    <section className="event-home__panel event-home__upcoming" aria-labelledby="event-home-upcoming">
      <div className="event-home__panel-head">
        <h2 id="event-home-upcoming" className="event-home__panel-title">
          다가오는 일정
        </h2>
        {upcoming?.dayLabel ? <p className="event-home__panel-support">{upcoming.dayLabel}</p> : null}
      </div>
      {schedule.isPending ? <p className="event-home__empty">불러오는 중이에요.</p> : null}
      {schedule.isError ? <p className="event-home__empty">일정을 불러오지 못했어요.</p> : null}
      {upcoming && upcoming.items.length === 0 ? (
        <p className="event-home__empty">{schedule.data?.items.length ? "남은 일정이 없어요." : "아직 일정이 없어요."}</p>
      ) : null}
      {upcoming && upcoming.items.length > 0 ? (
        <ul className="event-home__rows">
          {upcoming.items.map((item) => (
            <li key={item.itemId}>
              <Link className="event-home__slot" to={`/events/${eventId}/schedule/${item.itemId}`}>
                <span className="event-home__slot-time">{item.startTime}</span>
                <span className="event-home__row-copy">
                  <span className="event-home__slot-title">{item.title}</span>
                  {item.place ? <span className="event-home__slot-meta">{item.place}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
