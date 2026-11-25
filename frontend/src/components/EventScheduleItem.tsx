import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { queryKeys } from "../api/queryKeys";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  SCHEDULE_CATEGORIES,
  SCHEDULE_DESCRIPTION_MAX,
  SCHEDULE_PLACE_MAX,
  SCHEDULE_TITLE_MAX,
  changeCount,
  conflictReason,
  createScheduleItem,
  currentItemOf,
  deleteScheduleItem,
  diffInput,
  inputOf,
  otherChangesOf,
  updateScheduleItem,
  type PublishOptions,
  type ScheduleAudience,
  type ScheduleBoard,
  type ScheduleCategory,
  type ScheduleChanges,
  type ScheduleItem,
  type ScheduleItemInput,
  type ScheduleWriteResult,
} from "../api/schedule";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Select } from "./Select";
import { EventScreen } from "./EventScreen";
import { ChangeGroup, ScheduleShell, type ScheduleNotice } from "./EventSchedule";
import { commonFailure, publishedText, useScheduleBoard, useScheduleWrite, writeBlocked } from "./scheduleAccess";
import "./EventGroups.css";
import "./EventSchedule.css";

/**
 * One schedule item (C4): `/events/{eventId}/schedule/{itemId}`, or `/schedule/new?day=2`. Phone first:
 * native time pickers with "10분 당기기·미루기" that move start and end together, then one
 * "저장하고 바로 공개" request (`publish: true`). Other unpublished changes come back as
 * `409 CONFIRMATION_REQUIRED` and are listed before anything is saved. A version conflict shows the
 * current value next to mine and lets the operator choose again (DEC-046).
 */
export function EventScheduleItem() {
  const { eventId = "", itemId = "new" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => (
        <ScheduleShell event={event} spaceName={spaceName} back={`/events/${eventId}/schedule`}>
          <ItemLoader event={event} itemId={itemId} />
        </ScheduleShell>
      )}
    </EventScreen>
  );
}

function ItemLoader({ event, itemId }: { event: EventDetail; itemId: string }) {
  const board = useScheduleBoard(event.eventId);
  const [params] = useSearchParams();
  const backHref = `/events/${event.eventId}/schedule`;
  if (!board.data) {
    return <p className="event-groups__muted">{board.isError ? "일정표를 불러오지 못했어요." : "불러오는 중이에요."}</p>;
  }
  const creating = itemId === "new";
  const item = creating ? null : (board.data.items.find((entry) => entry.itemId === itemId) ?? null);
  if (!creating && !item) {
    return (
      <div className="event-schedule__empty">
        <p>이 일정을 찾을 수 없어요. 다른 운영자가 지웠을 수 있어요.</p>
        <Link className="event-schedule__link" to={backHref}>
          일정표로 돌아가기
        </Link>
      </div>
    );
  }
  const requestedDay = Number(params.get("day"));
  const day = board.data.days.some((entry) => entry.day === requestedDay) ? requestedDay : (board.data.days[0]?.day ?? 1);
  // From the timetable: a tap or drag on free time opens this with ?start=HH:mm&end=HH:mm (#466).
  const clock = (value: string | null) => (value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "");
  const span = { startTime: clock(params.get("start")), endTime: clock(params.get("end")) };
  return <ItemForm key={itemId} eventId={event.eventId} board={board.data} item={item} initialDay={day} initialSpan={span} />;
}

type Draft = {
  day: number;
  startTime: string;
  endTime: string;
  title: string;
  place: string;
  description: string;
  category: ScheduleCategory;
  audience: ScheduleAudience;
  slotId: string;
};

type Mode = "publish" | "save";
type Confirming = { action: "write" | "delete"; mode: Mode; changes: ScheduleChanges };
type Conflict = { current: ScheduleItem; mine: ScheduleItemInput; mode: Mode };

function draftOf(input: ScheduleItemInput): Draft {
  return {
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime ?? "",
    title: input.title,
    place: input.place ?? "",
    description: input.description ?? "",
    category: input.category,
    audience: input.audience,
    slotId: input.slotId ?? "",
  };
}

function inputFrom(draft: Draft): ScheduleItemInput {
  return {
    day: draft.day,
    startTime: draft.startTime,
    endTime: draft.endTime || null,
    title: draft.title.trim(),
    place: draft.place.trim() || null,
    description: draft.description.trim() || null,
    category: draft.category,
    audience: draft.audience,
    slotId: draft.slotId || null,
  };
}

function sameInput(a: ScheduleItemInput, b: ScheduleItemInput): boolean {
  return Object.keys(diffInput(a, b)).length === 0;
}

function slotMeal(category: ScheduleCategory): "MEAL" | "WORSHIP" | null {
  if (category === "MEAL") return "MEAL";
  if (category === "WORSHIP") return "WORSHIP";
  return null;
}

/** Shift "HH:mm" by minutes; null when it would leave the day. */
function shift(time: string, minutes: number): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const FIELD_LABEL: Record<keyof ScheduleItemInput, string> = {
  day: "일차",
  startTime: "시작",
  endTime: "끝",
  title: "제목",
  place: "장소",
  description: "설명",
  category: "분류",
  audience: "대상",
  slotId: "칸",
};

function ItemForm({
  eventId,
  board,
  item,
  initialDay,
  initialSpan,
}: {
  eventId: string;
  board: ScheduleBoard;
  item: ScheduleItem | null;
  initialDay: number;
  initialSpan?: { startTime: string; endTime: string };
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mayWrite, pending } = useScheduleWrite(eventId);
  const blocked = writeBlocked(board, mayWrite, pending);
  const readOnly = blocked !== null || pending;
  const creating = item === null;
  const empty: ScheduleItemInput = {
    day: initialDay,
    startTime: "",
    endTime: null,
    title: "",
    place: null,
    description: null,
    category: "PROGRAM",
    audience: "ALL",
    slotId: null,
  };
  const [baseline, setBaseline] = useState<{ input: ScheduleItemInput; version: number }>(() => ({
    input: item ? inputOf(item) : empty,
    version: item?.version ?? 0,
  }));
  // A new item picked on the timetable starts with that time filled in (still a change to save).
  const [draft, setDraft] = useState<Draft>(() => {
    const start = draftOf(baseline.input);
    if (!creating || !initialSpan?.startTime) return start;
    return { ...start, startTime: initialSpan.startTime, endTime: initialSpan.endTime };
  });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: keyof ScheduleItemInput | null; text: string } | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [deleting, setDeleting] = useState(false);
  const backHref = `/events/${eventId}/schedule`;

  const meal = slotMeal(draft.category);
  const slots = meal && board.slots ? board.slots.filter((slot) => slot.day === draft.day && (meal === "WORSHIP" ? slot.meal === "WORSHIP" : slot.meal !== "WORSHIP")) : [];
  const unknownSlot = draft.slotId !== "" && !(board.slots ?? []).some((slot) => slot.slotId === draft.slotId);
  const endsNextDay = draft.endTime !== "" && draft.startTime !== "" && draft.endTime < draft.startTime;

  function update(patch: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      // A slot must match the day and the category (api.md 항목 `slotId`); drop it rather than send a 400.
      const match = /^opt_d(\d+)_(breakfast|lunch|dinner|worship)$/.exec(next.slotId);
      if (next.slotId && match) {
        const kind = match[2] === "worship" ? "WORSHIP" : "MEAL";
        if (Number(match[1]) !== next.day || slotMeal(next.category) !== kind) next.slotId = "";
      }
      return next;
    });
    setError(null);
  }

  function moveBy(minutes: number) {
    const start = shift(draft.startTime, minutes);
    if (!start) return;
    const end = draft.endTime ? shift(draft.endTime, minutes) : "";
    update({ startTime: start, endTime: end ?? draft.endTime });
  }

  function check(input: ScheduleItemInput): { field: keyof ScheduleItemInput; text: string } | null {
    if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { field: "startTime", text: "시작 시각을 넣어 주세요." };
    if (input.endTime && input.endTime === input.startTime) return { field: "endTime", text: "끝 시각이 시작 시각과 같아요." };
    if (input.title.length === 0) return { field: "title", text: "제목을 넣어 주세요." };
    if (input.title.length > SCHEDULE_TITLE_MAX) return { field: "title", text: `제목은 ${SCHEDULE_TITLE_MAX}자까지예요.` };
    if ((input.place ?? "").length > SCHEDULE_PLACE_MAX) return { field: "place", text: `장소는 ${SCHEDULE_PLACE_MAX}자까지예요.` };
    if ((input.description ?? "").length > SCHEDULE_DESCRIPTION_MAX) return { field: "description", text: `설명은 ${SCHEDULE_DESCRIPTION_MAX}자까지예요.` };
    return null;
  }

  function finish(result: ScheduleWriteResult, mode: Mode, kind: "create" | "update" | "delete") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleBoard(eventId) });
    const done = { create: "추가했어요", update: "저장했어요", delete: "지웠어요" }[kind];
    const andPublished = { create: "추가하고 공개했어요.", update: "저장하고 공개했어요.", delete: "지우고 공개했어요." }[kind];
    let notice: ScheduleNotice;
    if (mode === "publish" && result.publication?.result === "PUBLISHED") {
      notice = { tone: "success", text: publishedText(result.publication, notify, andPublished) };
    } else if (mode === "publish" && result.publication) {
      notice = { tone: "info", text: `${done}. 공개된 내용과 같아 새로 공개하지 않았어요.` };
    } else {
      notice = { tone: "success", text: `${done}. 아직 참가자에게 보이지 않아요. 공개를 눌러야 보여요.` };
    }
    const day = result.item?.day ?? draft.day;
    navigate(`${backHref}?day=${day}`, { state: { notice } });
  }

  function options(mode: Mode, confirm: boolean): PublishOptions {
    return { publish: mode === "publish", confirmOtherChanges: confirm, notify };
  }

  async function write(mode: Mode, confirm = false, base = baseline) {
    const input = inputFrom(draft);
    const invalid = check(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = creating
        ? await createScheduleItem(eventId, input, options(mode, confirm))
        : await updateScheduleItem(eventId, item.itemId, base.version, diffInput(base.input, input), options(mode, confirm));
      finish(result, mode, creating ? "create" : "update");
    } catch (failure) {
      handle(failure, "write", mode, input);
    } finally {
      setBusy(false);
    }
  }

  async function remove(mode: Mode, confirm = false) {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteScheduleItem(eventId, item.itemId, baseline.version, options(mode, confirm));
      setDeleting(false);
      finish({ ...result, item: null }, mode, "delete");
    } catch (failure) {
      setDeleting(false);
      handle(failure, "delete", mode, baseline.input);
    } finally {
      setBusy(false);
    }
  }

  function handle(failure: unknown, action: "write" | "delete", mode: Mode, mine: ScheduleItemInput) {
    const others = otherChangesOf(failure);
    if (others) {
      setConfirming({ action, mode, changes: others });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleBoard(eventId) });
    const current = currentItemOf(failure);
    if (current) {
      if (action === "write" && sameInput(inputOf(current), mine)) {
        // The same edit already went through (a resend after a lost answer, DEC-047).
        finish({ item: current, boardVersion: board.boardVersion, publication: null }, "save", "update");
        return;
      }
      setConflict({ current, mine, mode });
      return;
    }
    if (isApiError(failure, "RESOURCE_NOT_FOUND")) {
      setError({ field: null, text: "다른 운영자가 이 일정을 지웠어요. 저장하지 않았어요." });
      return;
    }
    const reason = conflictReason(failure);
    if (reason === "SLOT_ALREADY_LINKED") {
      setError({ field: "slotId", text: "이 칸은 다른 일정이 이미 가졌어요. 다른 칸을 고르거나 비워 주세요." });
      return;
    }
    if (reason === "ITEMS_OUT_OF_PERIOD") {
      setError({ field: null, text: "행사 기간 밖의 다른 일정이 있어 공개하지 못했어요. 저장도 하지 않았어요. 일정표에서 그 일정을 옮기거나 지워 주세요." });
      return;
    }
    if (reason === "EVENT_PERIOD_REQUIRED") {
      setError({ field: null, text: "행사 기간이 없어 저장하지 않았어요. 행사 설정에서 기간을 정해 주세요." });
      return;
    }
    if (reason === "ITEM_LIMIT") {
      setError({ field: null, text: "일정은 행사당 300개까지예요." });
      return;
    }
    if (isApiError(failure, "VALIDATION_FAILED")) {
      const field = failure.errors?.[0]?.field as keyof ScheduleItemInput | undefined;
      setError({ field: field && field in FIELD_LABEL ? field : null, text: `${field && field in FIELD_LABEL ? FIELD_LABEL[field] : "입력"} 값을 확인해 주세요. 저장하지 않았어요.` });
      return;
    }
    setError({ field: null, text: commonFailure(failure) ?? "저장하지 못했어요. 다시 시도해 주세요." });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void write("publish");
  }

  const fieldError = (field: keyof ScheduleItemInput) =>
    error?.field === field ? (
      <span className="event-schedule__field-error" role="alert">
        {error.text}
      </span>
    ) : null;

  return (
    <form className="event-schedule__form" onSubmit={onSubmit} aria-label={creating ? "일정 추가" : "일정 고치기"} noValidate>
      <h2 className="event-groups__title">{creating ? "일정 추가" : "일정 고치기"}</h2>
      {item && item.publishState !== "UNCHANGED" ? (
        <p className="event-schedule__pending">{item.publishState === "ADDED" ? "아직 공개하지 않은 새 일정이에요." : "공개하지 않은 변경이 있어요."}</p>
      ) : null}
      {blocked ? (
        <p className="event-groups__blocked" role="note">
          {blocked}
        </p>
      ) : null}
      {error && error.field === null ? (
        <p className="event-groups__notice event-groups__notice--error" role="alert">
          {error.text}
        </p>
      ) : null}
      {conflict ? (
        <ConflictPanel
          conflict={conflict}
          board={board}
          busy={busy}
          onUseCurrent={() => {
            const next = { input: inputOf(conflict.current), version: conflict.current.version };
            setBaseline(next);
            setDraft(draftOf(next.input));
            setConflict(null);
          }}
          onKeepMine={() => {
            const next = { input: inputOf(conflict.current), version: conflict.current.version };
            setBaseline(next);
            setDraft(draftOf(conflict.mine));
            setConflict(null);
            void write(conflict.mode, false, next);
          }}
        />
      ) : null}
      <fieldset className="event-schedule__fields" disabled={readOnly || busy}>
        <div className="event-schedule__field">
          <span className="event-schedule__label" id="schedule-day-label">
            일차
          </span>
          <div className="event-schedule__segments" role="radiogroup" aria-labelledby="schedule-day-label">
            {board.days.map((entry) => (
              <label key={entry.day} className={`event-schedule__segment${draft.day === entry.day ? " event-schedule__segment--on" : ""}`}>
                <input type="radio" name="day" checked={draft.day === entry.day} onChange={() => update({ day: entry.day })} />
                <span>{entry.day}일차</span>
                <span className="event-schedule__segment-sub">{entry.dayLabel}</span>
              </label>
            ))}
            {item?.outOfPeriod ? <span className="event-schedule__tag event-schedule__tag--error">지금 {item.day}일차 · 기간 밖</span> : null}
          </div>
        </div>
        <div className="event-schedule__time-row">
          <label className="event-schedule__field">
            <span className="event-schedule__label">시작</span>
            <input className="event-schedule__input" type="time" required value={draft.startTime} onChange={(event) => update({ startTime: event.target.value })} />
            {fieldError("startTime")}
          </label>
          <label className="event-schedule__field">
            <span className="event-schedule__label">끝 (선택)</span>
            <input className="event-schedule__input" type="time" value={draft.endTime} onChange={(event) => update({ endTime: event.target.value })} />
            {endsNextDay ? <span className="event-schedule__hint">다음 날 {draft.endTime}에 끝나요</span> : null}
            {fieldError("endTime")}
          </label>
        </div>
        <div className="event-schedule__shift">
          <Button type="button" variant="secondary" size={40} disabled={!shift(draft.startTime, -10)} onClick={() => moveBy(-10)}>
            10분 당기기
          </Button>
          <Button type="button" variant="secondary" size={40} disabled={!shift(draft.startTime, 10)} onClick={() => moveBy(10)}>
            10분 미루기
          </Button>
          {draft.endTime ? (
            <Button type="button" variant="tertiary" size={40} onClick={() => update({ endTime: "" })}>
              끝 시각 비우기
            </Button>
          ) : null}
        </div>
        <label className="event-schedule__field">
          <span className="event-schedule__label">제목</span>
          <input className="event-schedule__input" value={draft.title} maxLength={SCHEDULE_TITLE_MAX} onChange={(event) => update({ title: event.target.value })} />
          {fieldError("title")}
        </label>
        <label className="event-schedule__field">
          <span className="event-schedule__label">장소 (선택)</span>
          <input className="event-schedule__input" value={draft.place} maxLength={SCHEDULE_PLACE_MAX} onChange={(event) => update({ place: event.target.value })} />
          {fieldError("place")}
        </label>
        <label className="event-schedule__field">
          <span className="event-schedule__label">분류</span>
          <Select
            className="event-schedule__input"
            value={draft.category}
            options={SCHEDULE_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABEL[category] }))}
            onChange={(value) => update({ category: value as ScheduleCategory })}
          />
          {fieldError("category")}
        </label>
        {meal && (board.slots || unknownSlot) ? (
          <label className="event-schedule__field">
            <span className="event-schedule__label">{meal === "WORSHIP" ? "집회 칸 연결 (선택)" : "식사 칸 연결 (선택)"}</span>
            <Select
              className="event-schedule__input"
              value={draft.slotId}
              options={[
                { value: "", label: "연결 안 함" },
                ...slots.map((slot) => {
                  const taken = slot.linkedItemId !== null && slot.linkedItemId !== item?.itemId;
                  return {
                    value: slot.slotId,
                    label: `${slot.dayLabel} ${slot.label}${taken ? " · 다른 일정에 연결됨" : ""}`,
                    disabled: taken,
                  };
                }),
                ...(unknownSlot ? [{ value: draft.slotId, label: `신청서에 없는 칸 (${draft.slotId})` }] : []),
              ]}
              onChange={(value) => update({ slotId: value })}
            />
            <span className="event-schedule__hint">신청서의 식사·집회 칸과 이어 둬요. 참가자 화면에는 보이지 않아요.</span>
            {fieldError("slotId")}
          </label>
        ) : null}
        <div className="event-schedule__field">
          <span className="event-schedule__label" id="schedule-audience-label">
            누구에게 보일까요
          </span>
          <div className="event-schedule__segments" role="radiogroup" aria-labelledby="schedule-audience-label">
            {(["ALL", "LEADERS", "STAFF"] as const).map((audience) => (
              <label key={audience} className={`event-schedule__segment${draft.audience === audience ? " event-schedule__segment--on" : ""}`}>
                <input type="radio" name="audience" checked={draft.audience === audience} onChange={() => update({ audience })} />
                <span>{AUDIENCE_LABEL[audience]}</span>
              </label>
            ))}
          </div>
          {draft.audience === "STAFF" ? <span className="event-schedule__hint">운영진 일정은 참가자에게 보이지 않아요.</span> : null}
          {draft.audience === "LEADERS" ? <span className="event-schedule__hint">공개된 조 편성의 조장에게만 보여요.</span> : null}
        </div>
        <label className="event-schedule__field">
          <span className="event-schedule__label">설명 (선택)</span>
          <textarea
            className="event-schedule__input event-schedule__textarea"
            rows={3}
            value={draft.description}
            maxLength={SCHEDULE_DESCRIPTION_MAX}
            onChange={(event) => update({ description: event.target.value })}
          />
          {fieldError("description")}
        </label>
      </fieldset>
      {readOnly ? null : (
        <div className="event-schedule__actions">
          <label className="event-schedule__check">
            <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
            <span>
              공개할 때 참가자에게 알림 보내기
              <span className="event-schedule__hint">오타 수정이면 꺼도 돼요. 꺼도 참가자 화면은 바로 바뀌어요.</span>
            </span>
          </label>
          <div className="event-schedule__buttons">
            <Button type="submit" variant="primary" size={48} disabled={busy}>
              {busy ? "보내는 중" : "저장하고 바로 공개"}
            </Button>
            <Button type="button" variant="secondary" size={48} disabled={busy} onClick={() => void write("save")}>
              저장만
            </Button>
          </div>
          {item ? (
            <Button type="button" variant="danger-outline" size={40} disabled={busy} onClick={() => setDeleting(true)}>
              이 일정 지우기
            </Button>
          ) : null}
        </div>
      )}
      {deleting ? (
        <ConfirmDialog
          title="이 일정을 지울까요?"
          onClose={() => setDeleting(false)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setDeleting(false)}>
                취소
              </Button>
              <Button type="button" variant="secondary" size={40} disabled={busy} onClick={() => void remove("save")}>
                지우기만
              </Button>
              <Button type="button" variant="primary" size={40} disabled={busy} onClick={() => void remove("publish")}>
                지우고 바로 공개
              </Button>
            </>
          }
        >
          <p>
            {item?.startTime} {item?.title}
          </p>
          <p>공개하면 참가자 화면에 "취소됨"으로 하루 동안 보여요. 지우기만 하면 다시 공개할 때까지 참가자에게는 그대로 보여요.</p>
        </ConfirmDialog>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`다른 미공개 변경 ${changeCount(confirming.changes)}건도 함께 공개돼요`}
          scroll
          onClose={() => setConfirming(null)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setConfirming(null)}>
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                size={40}
                disabled={busy}
                onClick={() => {
                  const { action, mode } = confirming;
                  setConfirming(null);
                  void (action === "delete" ? remove(mode, true) : write(mode, true));
                }}
              >
                함께 공개
              </Button>
            </>
          }
        >
          <p>아직 아무것도 저장하지 않았어요. 일정은 한 번에 모두 공개돼요.</p>
          <ChangeGroup title="새 일정" titles={confirming.changes.added.map((entry) => entry.title)} />
          <ChangeGroup title="바뀐 일정" titles={confirming.changes.changed.map((entry) => entry.title)} />
          <ChangeGroup title="지운 일정" titles={confirming.changes.removed.map((entry) => entry.title)} />
        </ConfirmDialog>
      ) : null}
    </form>
  );
}

function valueText(board: ScheduleBoard, key: keyof ScheduleItemInput, input: ScheduleItemInput): string {
  const value = input[key];
  if (value === null || value === "") return "없음";
  if (key === "day") return board.days.find((entry) => entry.day === value)?.dayLabel ?? `${value}일차`;
  if (key === "category") return CATEGORY_LABEL[value as ScheduleCategory];
  if (key === "audience") return AUDIENCE_LABEL[value as ScheduleAudience];
  if (key === "slotId") return board.slots?.find((slot) => slot.slotId === value)?.label ?? String(value);
  return String(value);
}

function ConflictPanel({
  conflict,
  board,
  busy,
  onUseCurrent,
  onKeepMine,
}: {
  conflict: Conflict;
  board: ScheduleBoard;
  busy: boolean;
  onUseCurrent: () => void;
  onKeepMine: () => void;
}) {
  const current = inputOf(conflict.current);
  const keys = (Object.keys(FIELD_LABEL) as (keyof ScheduleItemInput)[]).filter((key) => current[key] !== conflict.mine[key]);
  return (
    <section className="event-groups__conflict" aria-label="다른 운영자의 변경">
      <p className="event-groups__conflict-title" role="alert">
        그사이 {conflict.current.updatedByDisplayName ?? "다른 운영자"}님이 이 일정을 고쳤어요. 아무것도 저장하지 않았어요.
      </p>
      <table className="event-schedule__compare">
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">지금 값</th>
            <th scope="col">내 수정</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key}>
              <th scope="row">{FIELD_LABEL[key]}</th>
              <td>{valueText(board, key, current)}</td>
              <td>{valueText(board, key, conflict.mine)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="event-groups__conflict-actions">
        <Button type="button" variant="primary" size={40} disabled={busy} onClick={onKeepMine}>
          {conflict.mode === "publish" ? "내 수정으로 저장하고 공개" : "내 수정으로 저장"}
        </Button>
        <Button type="button" variant="secondary" size={40} onClick={onUseCurrent}>
          지금 값으로 다시 고치기
        </Button>
      </div>
    </section>
  );
}
