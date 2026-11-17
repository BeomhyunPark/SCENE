import type { AttendanceSlot, BoardParticipant } from "../api/groups";
import {
  slotDays,
  slotFullLabel,
  slotHeadcount,
  slotRuns,
  slotRunsText,
  slotShortLabel,
} from "./groupBoardView";

/**
 * 참석 막대 (#318) on the 조 편성 board. Columns are the form setup's day-by-day meal·worship slots (#315),
 * not morning/afternoon/evening. Each person's row draws the continuous runs of slots they attend, as the
 * retreat app did; the cell shape follows the Figma legend (1325:5669): attended is filled, absent is an
 * outline. There is no half cell: a slot is attended or not. Filled cells are green for 전체 참석 and amber
 * otherwise, and the attendance tag and the bar's label carry the same meaning without colour. With no
 * `slots` nothing renders and the screen keeps only the tag; with `slotIds: null` the row says "참석 칸 모름".
 */
export function SlotLegend({ slots }: { slots: AttendanceSlot[] | null }) {
  if (!slots || slots.length === 0) return null;
  return (
    <p className="event-groups__slot-legend">
      <span className="event-groups__legend-item">
        <span className="event-groups__slot-cell event-groups__slot-cell--on event-groups__slot-cell--full" aria-hidden="true" />
        전체 참석
      </span>
      <span className="event-groups__legend-item">
        <span className="event-groups__slot-cell event-groups__slot-cell--on event-groups__slot-cell--partial" aria-hidden="true" />
        부분 참석
      </span>
      <span className="event-groups__legend-item">
        <span className="event-groups__slot-cell" aria-hidden="true" />
        미참석
      </span>
      <span className="event-groups__legend-note">칸: 아침·점심·저녁·집회</span>
    </p>
  );
}

/** Two header rows over a card's bars: dates, then one letter per slot (full name in title). */
export function SlotHeader({ slots }: { slots: AttendanceSlot[] | null }) {
  if (!slots || slots.length === 0) return null;
  return (
    <div className="event-groups__slot-head" aria-hidden="true" style={{ ["--slot-count" as string]: slots.length }}>
      {slotDays(slots).map((day) => (
        <span key={day.day} className="event-groups__slot-day" style={{ gridColumn: `span ${day.count}` }} title={day.label}>
          <span className="event-groups__slot-day-wide">{day.short}</span>
          <span className="event-groups__slot-day-tight" aria-hidden="true">
            {day.tight}
          </span>
        </span>
      ))}
      {slots.map((slot) => (
        <span key={slot.slotId} className="event-groups__slot-name" title={slotFullLabel(slot)}>
          {slotShortLabel(slot)}
        </span>
      ))}
    </div>
  );
}

export function AttendanceBar({ slots, person }: { slots: AttendanceSlot[] | null; person: Pick<BoardParticipant, "attendance" | "slotIds"> }) {
  if (!slots || slots.length === 0) return null;
  if (person.slotIds === null) return <span className="event-groups__slot-unknown">참석 칸 모름</span>;
  const runs = slotRuns(slots, person.slotIds);
  const tone = person.attendance === "FULL" ? "full" : "partial";
  const label = slotRunsText(slots, person.slotIds);
  return (
    <span className="event-groups__slot-bar" role="img" aria-label={label} title={label} style={{ ["--slot-count" as string]: slots.length }}>
      {slots.map((slot, index) => {
        const run = runs.find((item) => index >= item.start && index <= item.end);
        const classes = ["event-groups__slot-cell"];
        if (run) {
          classes.push("event-groups__slot-cell--on", `event-groups__slot-cell--${tone}`);
          if (index > run.start) classes.push("event-groups__slot-cell--joined");
        }
        return <span key={slot.slotId} className={classes.join(" ")} />;
      })}
    </span>
  );
}

/** 시간대별 인원 at the bottom of a card: per slot, the members attending it; "모름" people apart. */
export function SlotHeadcount({ slots, members }: { slots: AttendanceSlot[] | null; members: Pick<BoardParticipant, "slotIds">[] }) {
  if (!slots || slots.length === 0) return null;
  const { counts, unknown } = slotHeadcount(slots, members);
  return (
    <div className="event-groups__headcount">
      <p className="event-groups__headcount-title">
        시간대별 인원
        {unknown > 0 ? <span className="event-groups__headcount-unknown"> · 모름 {unknown}</span> : null}
      </p>
      <ol className="event-groups__headcount-cells" aria-label="시간대별 인원" style={{ ["--slot-count" as string]: slots.length }}>
        {slots.map((slot, index) => (
          <li key={slot.slotId} title={`${slotFullLabel(slot)} ${counts[index]}명`}>
            <span aria-hidden="true">{counts[index]}</span>
            <span className="event-groups__visually-hidden">
              {slotFullLabel(slot)} {counts[index]}명
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
