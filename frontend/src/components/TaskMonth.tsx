import { useState, type ReactNode } from "react";
import type { TaskListItem } from "../api/tasks";
import { Button } from "./Button";
import { taskStatusLabel } from "./taskCopy";
import {
  addMonths,
  barPart,
  covers,
  dayLabel,
  inMonth,
  inPeriod,
  monthGrid,
  monthLabel,
  monthOf,
  overdue,
  periodText,
  pickedRange,
  weekLanes,
  WEEKDAYS,
  type Month,
} from "./taskMonth";
import "./TaskMonth.css";

const PER_DAY = 3;

/**
 * 준비 업무 월 달력 (#475), after the Venture Calendar Monthly frame (853:86993) and SCENE DS
 * 43. PATTERNS — CALENDAR (65:25): a month header with ‹ 오늘 ›, a weekday row, six weeks of days; each
 * task is a bar across its start–due days; the event period is tinted and today is marked. Colour is
 * state only (past due, done). Wide screens get the grid; phones get the month as a list by day ("do
 * not shrink the Month grid into a phone").
 *
 * With `onPick`, pressing a day (or pressing one day and letting go on another) picks that period for a
 * new task.
 */
export function TaskMonth({
  tasks,
  period,
  today,
  wide,
  onOpen,
  onPick,
}: {
  tasks: readonly TaskListItem[];
  period: { startDate: string | null; endDate: string | null };
  today: string;
  wide: boolean;
  onOpen: (taskId: string) => void;
  onPick?: (range: { startDate: string; dueDate: string }) => void;
}) {
  const [month, setMonth] = useState<Month>(() => monthOf(today));
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);
  const dated = tasks.filter((task) => task.dueDate !== null);
  const days = monthGrid(month);
  const picked = drag ? pickedRange(drag.from, drag.to) : null;

  const finish = () => {
    if (drag && onPick) onPick(pickedRange(drag.from, drag.to));
    setDrag(null);
  };

  const bar = (task: TaskListItem, date: string, compact: boolean) => {
    const classes = [
      "task-month__task",
      `task-month__task--${compact ? barPart(task, date) : "single"}`,
    ];
    if (overdue(task, today)) classes.push("task-month__task--overdue");
    if (task.status === "DONE" || task.status === "CANCELLED")
      classes.push("task-month__task--closed");
    return (
      <button
        key={task.taskId}
        type="button"
        className={classes.join(" ")}
        title={`${task.title} · ${periodText(task)} · ${taskStatusLabel(task.status)}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onOpen(task.taskId)}
      >
        {task.title}
      </button>
    );
  };

  return (
    <section className="task-month" aria-label="월 달력">
      <div className="task-month__bar">
        <h3 className="task-month__title">{monthLabel(month)}</h3>
        <div className="task-month__nav">
          <Button
            type="button"
            variant="secondary"
            size={32}
            aria-label="이전 달"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            ‹
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={32}
            onClick={() => setMonth(monthOf(today))}
          >
            오늘
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={32}
            aria-label="다음 달"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            ›
          </Button>
        </div>
        {period.startDate ? (
          <span className="task-month__legend">
            <span className="task-month__swatch" aria-hidden="true" />
            행사 기간
          </span>
        ) : null}
      </div>

      {wide ? (
        <div
          className="task-month__grid"
          role="grid"
          aria-label={monthLabel(month)}
          onPointerLeave={() => setDrag(null)}
        >
          <div className="task-month__weekdays" role="row">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                role="columnheader"
                className="task-month__weekday"
              >
                {weekday}
              </span>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((week) => {
            const weekDays = days.slice(week * 7, week * 7 + 7);
            const lanes = weekLanes(weekDays, dated);
            return (
              <div key={week} className="task-month__week" role="row">
                {weekDays.map((date) => {
                  const dayTasks = dated.filter((task) => covers(task, date));
                  // Each task keeps its week row; an empty row above a task is a spacer so bars line up.
                  const rows = Array.from(
                    {
                      length: Math.min(
                        Math.max(
                          0,
                          ...dayTasks.map(
                            (task) => (lanes.get(task.taskId) ?? 0) + 1,
                          ),
                        ),
                        PER_DAY,
                      ),
                    },
                    (_, lane) =>
                      dayTasks.find(
                        (task) => lanes.get(task.taskId) === lane,
                      ) ?? null,
                  );
                  const hidden = dayTasks.filter(
                    (task) => (lanes.get(task.taskId) ?? 0) >= PER_DAY,
                  ).length;
                  const classes = ["task-month__day"];
                  if (!inMonth(date, month))
                    classes.push("task-month__day--outside");
                  if (inPeriod(date, period))
                    classes.push("task-month__day--event");
                  if (date === today) classes.push("task-month__day--today");
                  if (
                    picked &&
                    picked.startDate <= date &&
                    date <= picked.dueDate
                  )
                    classes.push("task-month__day--picked");
                  if (onPick) classes.push("task-month__day--pick");
                  return (
                    <div
                      key={date}
                      role="gridcell"
                      aria-label={`${dayLabel(date)}${dayTasks.length > 0 ? ` 업무 ${dayTasks.length}개` : ""}`}
                      className={classes.join(" ")}
                      onPointerDown={
                        onPick
                          ? () => setDrag({ from: date, to: date })
                          : undefined
                      }
                      onPointerEnter={
                        drag ? () => setDrag({ ...drag, to: date }) : undefined
                      }
                      onPointerUp={onPick ? finish : undefined}
                    >
                      <span className="task-month__date">
                        {Number(date.slice(8, 10))}
                      </span>
                      <div className="task-month__tasks">
                        {rows.map((task, lane) =>
                          task ? (
                            bar(task, date, true)
                          ) : (
                            <span
                              key={`gap-${lane}`}
                              className="task-month__gap"
                              aria-hidden="true"
                            />
                          ),
                        )}
                        {hidden > 0 ? (
                          <span className="task-month__more">+{hidden}개</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <MonthList
          month={month}
          tasks={dated}
          period={period}
          today={today}
          bar={bar}
          onPick={onPick}
        />
      )}
    </section>
  );
}

/** Phones: the month's days that have tasks (or are event days or today), in order. */
function MonthList({
  month,
  tasks,
  period,
  today,
  bar,
  onPick,
}: {
  month: Month;
  tasks: readonly TaskListItem[];
  period: { startDate: string | null; endDate: string | null };
  today: string;
  bar: (task: TaskListItem, date: string, compact: boolean) => ReactNode;
  onPick?: (range: { startDate: string; dueDate: string }) => void;
}) {
  const days = monthGrid(month).filter((date) => inMonth(date, month));
  const shown = days.filter(
    (date) =>
      date === today ||
      inPeriod(date, period) ||
      tasks.some((task) => covers(task, date)),
  );
  if (shown.length === 0)
    return (
      <p className="task-month__empty">
        이 달에는 날짜가 정해진 업무가 없어요.
      </p>
    );
  return (
    <ol className="task-month__list" aria-label={monthLabel(month)}>
      {shown.map((date) => {
        const dayTasks = tasks.filter((task) => covers(task, date));
        const classes = ["task-month__row"];
        if (inPeriod(date, period)) classes.push("task-month__row--event");
        if (date === today) classes.push("task-month__row--today");
        return (
          <li key={date} className={classes.join(" ")}>
            <div className="task-month__row-head">
              <span className="task-month__row-date">{dayLabel(date)}</span>
              {date === today ? (
                <span className="task-month__tag task-month__tag--today">
                  오늘
                </span>
              ) : null}
              {inPeriod(date, period) ? (
                <span className="task-month__tag">행사 기간</span>
              ) : null}
              {onPick ? (
                <button
                  type="button"
                  className="task-month__add scene-press scene-press--quiet"
                  onClick={() => onPick({ startDate: date, dueDate: date })}
                >
                  + 업무
                </button>
              ) : null}
            </div>
            {dayTasks.length > 0 ? (
              <div className="task-month__row-tasks">
                {dayTasks.map((task) => bar(task, date, false))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
