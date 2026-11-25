import type { TaskDates, TaskStatus } from "../api/tasks";

/**
 * 준비 업무 월 달력 (#475). Pure date helpers on "YYYY-MM-DD" strings (UTC arithmetic, so the browser's
 * own zone never shifts a day). "Today" comes from the event zone (Asia/Seoul) through `localDate`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export { WEEKDAYS };

export type Month = { year: number; month: number };

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function monthOf(date: string): Month {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function addMonths(at: Month, delta: number): Month {
  const index = at.year * 12 + (at.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthLabel(at: Month): string {
  return `${at.year}년 ${at.month}월`;
}

/** Six weeks from the Sunday on or before the 1st: 42 dates, so every month has the same height. */
export function monthGrid(at: Month): string[] {
  const first = Date.UTC(at.year, at.month - 1, 1);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, index) => iso(start + index * DAY_MS));
}

export function inMonth(date: string, at: Month): boolean {
  const { year, month } = monthOf(date);
  return year === at.year && month === at.month;
}

/** "1월 15일 (금)" */
export function dayLabel(date: string): string {
  const day = new Date(utc(date));
  return `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 (${WEEKDAYS[day.getUTCDay()]})`;
}

/** "1/10–1/15", "~1/15", or "" without dates. */
export function periodText(task: TaskDates): string {
  const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  if (!task.dueDate) return "";
  if (!task.startDate || task.startDate === task.dueDate) return `~${short(task.dueDate)}`;
  return `${short(task.startDate)}–${short(task.dueDate)}`;
}

/** A task covers its start (or due) day through its due day. */
export function covers(task: TaskDates, date: string): boolean {
  if (!task.dueDate) return false;
  return (task.startDate ?? task.dueDate) <= date && date <= task.dueDate;
}

/** Where a day sits in a task's bar, so a multi-day task reads as one bar across the week. */
export function barPart(task: TaskDates, date: string): "single" | "start" | "middle" | "end" {
  const start = task.startDate ?? task.dueDate;
  if (start === task.dueDate) return "single";
  if (date === start) return "start";
  if (date === task.dueDate) return "end";
  return "middle";
}

export function inPeriod(date: string, period: { startDate: string | null; endDate: string | null }): boolean {
  if (!period.startDate) return false;
  return period.startDate <= date && date <= (period.endDate ?? period.startDate);
}

/** Past due and still open: the due day is before today and the task is not done or cancelled. */
export function overdue(task: TaskDates & { status: TaskStatus }, today: string): boolean {
  return task.dueDate !== null && task.dueDate < today && (task.status === "TODO" || task.status === "DOING");
}

/** The range picked by pressing on one day and letting go on another, earlier first. */
export function pickedRange(from: string, to: string): { startDate: string; dueDate: string } {
  return from <= to ? { startDate: from, dueDate: to } : { startDate: to, dueDate: from };
}

/**
 * Rows for one week so a multi-day task keeps the same row on every day it covers (one straight bar).
 * Earlier starts and longer tasks take the upper rows.
 */
export function weekLanes<T extends TaskDates & { taskId: string }>(week: readonly string[], tasks: readonly T[]): Map<string, number> {
  const first = week[0];
  const last = week[week.length - 1];
  const inWeek = tasks
    .filter((task) => task.dueDate !== null && (task.startDate ?? task.dueDate) <= last && task.dueDate >= first)
    .map((task) => ({ task, from: Math.max(week.indexOf(clamp(task.startDate ?? task.dueDate!, first, last)), 0), to: week.indexOf(clamp(task.dueDate!, first, last)) }))
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const lanes = new Map<string, number>();
  const busyUntil: number[] = [];
  for (const entry of inWeek) {
    let lane = busyUntil.findIndex((until) => until < entry.from);
    if (lane === -1) lane = busyUntil.length;
    busyUntil[lane] = entry.to;
    lanes.set(entry.task.taskId, lane);
  }
  return lanes;
}

function clamp(date: string, first: string, last: string): string {
  return date < first ? first : date > last ? last : date;
}
