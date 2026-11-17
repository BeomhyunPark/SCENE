import type { FormField } from "../../api/forms";
import type { RawAnswers } from "./answerModel";
import { rangeSummary } from "./attendanceRange";

/** "이 일정에 포함돼요": the meals and services between the chosen arrival and departure. */
export function RangeSummary({ fields, values }: { fields: FormField[]; values: RawAnswers }) {
  const days = rangeSummary(fields, values);
  if (!days) return null;
  return (
    <div className="participant-gate__range" role="status">
      <p className="participant-gate__range-title">이 일정에 포함돼요</p>
      <ul>
        {days.map((day) => (
          <li key={day.day}>
            {day.day ? <span className="participant-gate__range-day">{day.day}</span> : null}
            <span>{day.slots.join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
