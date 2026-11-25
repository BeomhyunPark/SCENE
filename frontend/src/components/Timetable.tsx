import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { axisTop, blockDensity, buildAxis, clockOf, placeDay, MIN_BLOCK_MINUTES, type Placed, type TimedRow } from "./timetable";
import "./Timetable.css";

export type TimetableColumn<T extends TimedRow> = {
  key: string;
  /** Names the column's list ("1월 22일 (금)"). */
  label: string;
  /** The day bar above the column. */
  header?: ReactNode;
  rows: readonly T[];
  /** Where the current-time line goes, or null. */
  nowMinute: number | null;
};

export type TimetableBlock = { key: string; className?: string; current?: boolean; content: ReactNode };

/**
 * 시간표 (#466): hour labels on the left, each item a block as long as it lasts, overlapping items side by
 * side, long empty stretches folded, and a line at the current time on today's column. Follows the SCENE
 * 시간표 frame (SCENE Design System, "01 시간표 · 행사 3일" 172:3, Venture harvest): a 시간 · day header
 * row, hour labels on the left, neutral blocks with time → title → context (Calendar / Event Item 79:33,
 * where colour carries state only), and the Venture Daily/Weekly calendars' red current-time line. One
 * column on phones (Day); wide screens can show every day side by side (Week).
 *
 * Each column is an `<ol>` of blocks in time order, so the list still reads top to bottom without the
 * picture. `scrollKey` brings the current-time line into view once each time it changes (opening the
 * screen, picking another day); the minute ticks do not scroll.
 */
export function Timetable<T extends TimedRow>({
  columns,
  block,
  scrollKey,
}: {
  columns: TimetableColumn<T>[];
  block: (placed: Placed<T>, column: TimetableColumn<T>) => TimetableBlock;
  scrollKey?: string;
}) {
  const layouts = useMemo(() => columns.map((column) => placeDay(column.rows)), [columns]);
  const axis = useMemo(() => {
    const stretches: [number, number][] = layouts.flat().map((entry) => [entry.start, Math.max(entry.end, entry.start + MIN_BLOCK_MINUTES)]);
    for (const column of columns) {
      if (column.nowMinute !== null) stretches.push([column.nowMinute, column.nowMinute + 1]);
    }
    return buildAxis(stretches);
  }, [layouts, columns]);
  const lineRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef<string | undefined>(undefined);
  const nowMinute = columns.find((column) => column.nowMinute !== null)?.nowMinute ?? null;
  const hasLine = nowMinute !== null;

  useEffect(() => {
    if (scrollKey === undefined || scrolled.current === scrollKey || !hasLine) return;
    const line = lineRef.current;
    if (line && typeof line.scrollIntoView === "function") line.scrollIntoView({ block: "center" });
    scrolled.current = scrollKey;
  }, [scrollKey, hasLine]);

  const multi = columns.length > 1;
  const style = { "--timetable-columns": columns.length, "--timetable-height": axis.height } as CSSProperties;
  // The line on the first column that has one is the one to scroll to.
  const lineColumn = columns.findIndex((column) => column.nowMinute !== null);
  return (
    <div className={`timetable${multi ? " timetable--multi" : ""}`} style={style}>
      {columns.some((column) => column.header) ? (
        <div className="timetable__headers">
          <span className="timetable__corner">시간</span>
          {columns.map((column) => (
            <div key={column.key} className={`timetable__header${column.nowMinute !== null ? " timetable__header--today" : ""}`}>
              {column.header}
            </div>
          ))}
        </div>
      ) : null}
      <div className="timetable__body">
        <div className="timetable__gutter" aria-hidden="true">
          {axis.ticks.map((tick) => (
            <span key={tick.minute} className="timetable__tick" style={{ top: `calc(var(--timetable-scale) * ${tick.top})` }}>
              {clockOf(tick.minute)}
            </span>
          ))}
        </div>
        {columns.map((column, index) => {
          const placed = layouts[index];
          const attach = index === lineColumn;
          return (
            <div key={column.key} className="timetable__column">
              <div className="timetable__grid" aria-hidden="true">
                {axis.ticks.map((tick) => (
                  <span key={tick.minute} className="timetable__hour" style={{ top: `calc(var(--timetable-scale) * ${tick.top})` }} />
                ))}
                {axis.parts
                  .filter((part) => part.kind === "fold")
                  .map((part) => (
                    <span key={part.from} className="timetable__fold" style={{ top: `calc(var(--timetable-scale) * ${part.top})` }} />
                  ))}
              </div>
              <ol className="timetable__list" aria-label={column.label}>
                {placed.map((entry) => {
                  const { key, className, current, content } = block(entry, column);
                  const top = axisTop(axis, entry.start);
                  const bottom = axisTop(axis, Math.max(entry.end, entry.start + MIN_BLOCK_MINUTES));
                  const classes = ["timetable__block"];
                  if (entry.realEnd === null) classes.push("timetable__block--open");
                  const density = blockDensity(entry);
                  if (density === "line") classes.push("timetable__block--short");
                  if (density === "compact") classes.push("timetable__block--compact");
                  if (className) classes.push(className);
                  return (
                    <li
                      key={key}
                      className={classes.join(" ")}
                      aria-current={current ? "time" : undefined}
                      style={{
                        top: `calc(var(--timetable-scale) * ${top})`,
                        ["--block-height" as string]: `calc(var(--timetable-scale) * ${bottom - top} - 2px)`,
                        left: `calc(${(entry.lane / entry.lanes) * 100}% )`,
                        width: `calc(${100 / entry.lanes}% - 4px)`,
                      }}
                    >
                      {content}
                    </li>
                  );
                })}
              </ol>
              {column.nowMinute !== null ? (
                <div
                  ref={attach ? lineRef : undefined}
                  className="timetable__now"
                  aria-hidden="true"
                  style={{ top: `calc(var(--timetable-scale) * ${axisTop(axis, column.nowMinute)})` }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
