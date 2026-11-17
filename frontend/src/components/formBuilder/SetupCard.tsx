import { useState } from "react";
import type { AttendanceMode, FormSetup, SetupDay } from "../../api/forms";
import { Button } from "../Button";

const DAYS_MAX = 10;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const SLOTS: { key: keyof SetupDay; label: string }[] = [
  { key: "breakfast", label: "아침" },
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
  { key: "worship", label: "집회" },
];
const TRANSPORTS: { key: keyof FormSetup["transport"]; label: string; hint?: string }[] = [
  { key: "groupBus", label: "단체 이동 차량" },
  { key: "worshipShuttle", label: "집회 차량", hint: "부분 참석·집회만 참석자에게, 집회가 있는 날만 물어요." },
  { key: "car", label: "자차 (카풀)", hint: "동승 가능 여부와 인원, 동네를 이어서 물어요." },
  { key: "publicTransit", label: "대중교통" },
  { key: "support", label: "이동 지원 요청", hint: "편한 동네를 묻고, 매칭이 보장되지 않는다고 안내해요." },
];

/** Days from `start` to `end`, both included. */
function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Example: `1월 22일 (금)`, the server's wording for a day. */
function dateLabel(start: string, index: number): string {
  const date = new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAYS[date.getUTCDay()]})`;
}

function dayLabel(start: string, index: number): string {
  return `${index + 1}일차 · ${dateLabel(start, index)}`;
}

/** The slots on the schedule in order, worded like the generated options (`1월 22일 (금) 저녁`). */
function slotLabels(start: string, schedule: SetupDay[]): string[] {
  return schedule.flatMap((day, index) =>
    SLOTS.filter((slot) => day[slot.key]).map((slot) => `${dateLabel(start, index)} ${slot.label}`),
  );
}

const MODES: { mode: AttendanceMode; label: string; hint: string }[] = [
  {
    mode: "RANGE",
    label: "도착~출발만 받기",
    hint: "언제 도착하고 언제 출발하는지만 골라요. 그 사이의 식사와 집회는 모두 참석으로 세요.",
  },
  {
    mode: "SLOTS",
    label: "칸마다 고르기",
    hint: "참석하는 식사와 집회를 하나씩 골라요. 숙박하는 밤과 도착·출발 시각도 따로 물어요.",
  },
];

/** A usual retreat: arrive for dinner and worship, full days in between, leave after lunch. */
function suggestedDay(index: number, days: number): SetupDay {
  if (days === 1) return { breakfast: false, lunch: true, dinner: true, worship: true };
  if (index === 0) return { breakfast: false, lunch: false, dinner: true, worship: true };
  if (index === days - 1) return { breakfast: true, lunch: true, dinner: false, worship: false };
  return { breakfast: true, lunch: true, dinner: true, worship: true };
}

/** The saved setup fitted to the event's days, or the suggested starting point. */
function initialSetup(saved: FormSetup | null, days: number): FormSetup {
  const schedule = Array.from({ length: days }, (_, index) => saved?.schedule[index] ?? suggestedDay(index, days));
  // A setup saved before the 새가족 switch existed has no key: keep it off there.
  // A setup saved before DEC-074 has no mode: it keeps asking slot by slot.
  if (saved) {
    const attendance = { ...saved.attendance, mode: saved.attendance.mode ?? "SLOTS" };
    return { ...saved, newcomer: saved.newcomer ?? false, attendance, schedule };
  }
  return {
    gender: true,
    middleGroup: false,
    cell: false,
    newcomer: true,
    attendance: { partial: true, worshipOnly: false, mode: "RANGE" },
    schedule,
    transport: { groupBus: true, worshipShuttle: false, car: true, publicTransit: true, support: false },
  };
}

/**
 * The setup card (DEC-070). The operator answers what the retreat needs and the server builds
 * the questions, options, and conditions. 또래 is a base question, so its switch saves at once.
 */
export function SetupCard({
  startDate,
  endDate,
  saved,
  cohortOn,
  locked,
  pending,
  error,
  onSave,
  onCohort,
}: {
  startDate: string | null;
  endDate: string | null;
  saved: FormSetup | null;
  cohortOn: boolean;
  locked: boolean;
  pending: boolean;
  error: string;
  onSave: (setup: FormSetup) => void;
  onCohort: (on: boolean) => void;
}) {
  const days = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const usable = days >= 1 && days <= DAYS_MAX;
  const [draft, setDraft] = useState<FormSetup>(() => initialSetup(saved, usable ? days : 0));
  const [touched, setTouched] = useState(false);
  // A saved setup from the server replaces the draft unless the operator is mid-edit.
  // Every server response carries a new setup object, so compare by content. Saving 또래 or a
  // question must not throw away what the operator is choosing on this card.
  const savedKey = JSON.stringify(saved);
  const [seen, setSeen] = useState(savedKey);
  if (savedKey !== seen) {
    setSeen(savedKey);
    setDraft(initialSetup(saved, usable ? days : 0));
    setTouched(false);
  }

  if (!usable) {
    return (
      <section className="registration-setup__panel" aria-labelledby="setup-card-title">
        <h3 id="setup-card-title">신청서 설정</h3>
        <p className="registration-setup__note">
          {days > DAYS_MAX
            ? `행사 기간이 ${DAYS_MAX}일을 넘으면 자동 설정을 쓸 수 없어요. 아래에서 질문을 직접 추가해 주세요.`
            : "이 행사에는 날짜가 없어서 자동 설정을 쓸 수 없어요. 날짜로 일차별 식사·집회 표와 숙박 질문을 만들어요. 지금은 행사를 만들 때만 날짜를 정할 수 있으니, 날짜를 넣어 행사를 새로 만들거나 아래에서 질문을 직접 추가해 주세요."}
        </p>
      </section>
    );
  }

  const stale =
    saved?.generatedFor !== undefined &&
    (saved.generatedFor.startDate !== startDate || saved.generatedFor.endDate !== endDate);
  // Once an application is in, the server refuses another mode (DEC-074 §6). A form that never
  // saved a setup has no answers that depend on it.
  const modeFixed = locked && saved !== null;
  const change = (next: FormSetup) => {
    setDraft(next);
    setTouched(true);
  };
  const check = (label: string, checked: boolean, onChange: (next: boolean) => void, hint?: string, disabled = false) => (
    <label className="setup-card__check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );

  return (
    <section className="registration-setup__panel" aria-labelledby="setup-card-title">
      <div className="registration-setup__heading">
        <h3 id="setup-card-title">신청서 설정</h3>
        <span>{saved ? "설정을 바꾸면 질문이 다시 맞춰져요" : "고르면 질문이 자동으로 만들어져요"}</span>
      </div>
      {stale ? (
        <p className="registration-setup__alert" role="status">
          행사 날짜가 바뀌었어요. 아래 표를 확인하고 다시 저장해 주세요.
        </p>
      ) : null}
      {locked ? (
        <p className="registration-setup__note">
          신청이 들어온 뒤에도 묶음을 켜고 끌 수 있어요. 받은 답은 지워지지 않고, 끈 질문과 보기는 숨겨져요.
        </p>
      ) : null}

      <fieldset className="setup-card__group">
        <legend>받을 기본정보</legend>
        <div className="setup-card__checks">
          {check("이름", true, () => undefined, undefined, true)}
          {check("전화", true, () => undefined, undefined, true)}
          {check("또래", cohortOn, onCohort, "출생연도 뒤 두 자리 (예: 94)")}
          {check("성별", draft.gender, (gender) => change({ ...draft, gender }))}
          {check("중그룹", draft.middleGroup, (middleGroup) => change({ ...draft, middleGroup }))}
          {check("셀", draft.cell, (cell) => change({ ...draft, cell }))}
          {check(
            "새가족",
            draft.newcomer,
            (newcomer) => change({ ...draft, newcomer }),
            "예/아니오로 물어요. 조 편성에서 새가족만 골라 볼 수 있어요.",
          )}
        </div>
      </fieldset>

      <fieldset className="setup-card__group">
        <legend>참석 방식</legend>
        <div className="setup-card__checks">
          {check("전체 참석", true, () => undefined, undefined, true)}
          {check(
            "부분 참석 받기",
            draft.attendance.partial,
            (partial) => change({ ...draft, attendance: { ...draft.attendance, partial } }),
            draft.attendance.mode === "RANGE"
              ? "도착 칸과 출발 칸을 이어서 물어요."
              : "도착·출발 시각, 숙박하는 밤, 참석할 식사·집회를 이어서 물어요.",
          )}
          {check(
            "집회만 받기",
            draft.attendance.worshipOnly,
            (worshipOnly) => change({ ...draft, attendance: { ...draft.attendance, worshipOnly } }),
            draft.attendance.mode === "RANGE" ? "참석할 집회만 물어요." : "참석할 식사·집회만 물어요.",
          )}
        </div>
        {draft.attendance.partial ? (
          <ModePicker
            mode={draft.attendance.mode}
            slots={slotLabels(startDate!, draft.schedule)}
            fixed={modeFixed}
            onChange={(mode) => change({ ...draft, attendance: { ...draft.attendance, mode } })}
          />
        ) : null}
        {!draft.attendance.partial && !draft.attendance.worshipOnly ? (
          <p className="registration-setup__note">둘 다 끄면 참석 방식을 묻지 않고 모두 전체 참석으로 받아요.</p>
        ) : null}
      </fieldset>

      <fieldset className="setup-card__group">
        <legend>일차별 식사·집회</legend>
        <p className="registration-setup__note">
          실제로 있는 칸만 체크해 주세요. 부분 참석·집회만 참석자가 이 중에서 골라요. 전체 참석자는 모두 참석으로 세요.
        </p>
        <table className="setup-card__table">
          <thead>
            <tr>
              <th scope="col">일차</th>
              {SLOTS.map((slot) => (
                <th key={slot.key} scope="col">
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.schedule.map((day, index) => (
              <tr key={index}>
                <th scope="row">{dayLabel(startDate!, index)}</th>
                {SLOTS.map((slot) => (
                  <td key={slot.key}>
                    <input
                      type="checkbox"
                      aria-label={`${index + 1}일차 ${slot.label}`}
                      checked={day[slot.key]}
                      onChange={(event) =>
                        change({
                          ...draft,
                          schedule: draft.schedule.map((item, at) =>
                            at === index ? { ...item, [slot.key]: event.target.checked } : item,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <fieldset className="setup-card__group">
        <legend>운영하는 이동 수단</legend>
        <div className="setup-card__checks">
          {TRANSPORTS.map((item) => (
            <span key={item.key}>
              {check(
                item.label,
                draft.transport[item.key],
                (on) => change({ ...draft, transport: { ...draft.transport, [item.key]: on } }),
                item.hint,
              )}
            </span>
          ))}
        </div>
        <p className="registration-setup__note">
          가는 길과 오는 길을 따로 물어요. 자차로 가는 사람에게는 오는 길을 묻지 않아요. 출발 장소와 시간은 만들어진 질문의
          설명에 적어 주세요.
        </p>
      </fieldset>

      <p className="registration-setup__note">개인정보 수집·이용 동의는 항상 마지막에 들어가요.</p>
      {error ? (
        <p className="registration-setup__alert" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size={40}
        loading={pending}
        disabled={Boolean(saved) && !touched && !stale}
        onClick={() => onSave(draft)}
      >
        {saved ? "설정 저장" : "질문 만들기"}
      </Button>
    </section>
  );
}

/**
 * How partial attendees answer (DEC-074), with a small sample of what they see. New element: the
 * design has no frame for it, so it reuses the card's radio rows and the participant choice chips.
 */
function ModePicker({
  mode,
  slots,
  fixed,
  onChange,
}: {
  mode: AttendanceMode;
  slots: string[];
  fixed: boolean;
  onChange: (mode: AttendanceMode) => void;
}) {
  const first = slots[0];
  const last = slots.at(-1);
  return (
    <fieldset className="setup-card__mode">
      <legend>부분 참석을 받는 방식</legend>
      <div className="setup-card__checks setup-card__checks--column">
        {MODES.map((item) => (
          <label key={item.mode} className="setup-card__check">
            <input
              type="radio"
              name="attendance-mode"
              value={item.mode}
              checked={mode === item.mode}
              disabled={fixed}
              onChange={() => onChange(item.mode)}
            />
            <span>
              {item.label}
              <small>{item.hint}</small>
            </span>
          </label>
        ))}
      </div>
      {fixed ? (
        <p className="registration-setup__note">
          신청이 들어온 신청서라 방식을 바꿀 수 없어요. 이미 받은 답과 집계가 같은 방식으로 세어져야 해요.
        </p>
      ) : null}
      {mode === "RANGE" ? (
        <p className="registration-setup__note">중간에 나갔다가 다시 오는 경우는 따로 챙겨 주세요. 부분 참석 메모에 적게 안내해요.</p>
      ) : null}
      {first && last ? (
        <div className="setup-card__sample" aria-label="참가자에게 보이는 모습">
          <p className="setup-card__sample-title">참가자에게 이렇게 보여요</p>
          {mode === "RANGE" ? (
            <>
              <p>수련회장에 언제 도착하나요?</p>
              <span className="setup-card__sample-chip">{first}부터</span>
              <p>수련회장에서 언제 출발하나요?</p>
              <span className="setup-card__sample-chip">{last}까지</span>
            </>
          ) : (
            <>
              <p>참석할 프로그램과 식사를 선택해주세요</p>
              <div className="setup-card__sample-chips">
                {slots.slice(0, 4).map((slot) => (
                  <span key={slot} className="setup-card__sample-chip">
                    {slot}
                  </span>
                ))}
                {slots.length > 4 ? <span className="setup-card__sample-more">외 {slots.length - 4}칸</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
