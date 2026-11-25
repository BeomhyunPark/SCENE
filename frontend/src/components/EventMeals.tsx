import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import { getMealCounts, type MealCounts, type MealCountSlot } from "../api/mealCounts";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { readEventAreas } from "./eventLocalState";
import { fieldRefresh } from "./fieldRefresh";
import { kitchenText, mealLines, remainingLines, type MealLine } from "./mealCountText";
import { OperatorShell } from "./OperatorShell";
import "./EventHome.css";
import "./EventMeals.css";

/**
 * 식수 현황 (#454, DEC-089): per meal, 예정 (신청 기준) next to 도착 반영 (도착 + 올 예정), with the next meal on
 * top and its numbers ready to copy for the kitchen. Nobody is counted at a meal (로드맵 결정 1): the numbers come
 * from the application answers and the arrival check-ins. Read again every 10 seconds while the page is visible,
 * like 현장 운영 (#408). No dedicated Figma frame; it follows the 신청 집계 cards. Copy is a draft.
 */
export function EventMeals() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <MealsBody event={event} spaceName={spaceName} />}</EventScreen>;
}

type Copied = { tone: "success" | "error"; text: string; manual?: string } | null;

function MealsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const counts = useQuery({
    queryKey: queryKeys.mealCounts(eventId),
    queryFn: ({ signal }) => getMealCounts(eventId, signal),
    refetchInterval: fieldRefresh.intervalMs,
  });
  const { refetch: readAgain } = counts;
  const [copied, setCopied] = useState<Copied>(null);

  async function copy(lines: MealLine[], what: string) {
    if (!counts.data) return;
    const text = kitchenText(event.name, counts.data, lines);
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopied({ tone: "success", text: `${what}를 복사했어요. 주방 연락처에 붙여 넣어 주세요.` });
    } catch {
      setCopied({ tone: "error", text: "복사하지 못했어요. 아래 글을 길게 눌러 복사해 주세요.", manual: text });
    }
  }

  return (
    <OperatorShell
      title="식수 현황"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={`${eventHref}/field`} aria-label="현장 운영">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-home meals">
        <div className="meals__title">
          <h2>식수 현황</h2>
          <p>신청 답과 도착 체크인으로 계산해요. 끼니마다 세지 않아요.</p>
        </div>
        {counts.isPending ? <p role="status">불러오는 중이에요.</p> : null}
        {counts.isError && !counts.data ? (
          isApiError(counts.error) && counts.error.status === 403 ? (
            <section className="meals__notice" role="status">
              <h3>식수 현황을 볼 권한이 없어요</h3>
              <p>행사를 볼 수 있는 운영자만 볼 수 있어요. 행사 소유자에게 요청해 주세요.</p>
            </section>
          ) : (
            <section className="meals__notice">
              <p role="alert">식수 현황을 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(counts)}>
                다시 시도
              </Button>
            </section>
          )
        ) : null}
        {counts.data ? (
          <MealsContent
            eventId={eventId}
            data={counts.data}
            copied={copied}
            onCopyNext={(line) => void copy([line], "다음 끼니")}
            onCopyRest={(lines) => void copy(lines, "남은 끼니")}
          />
        ) : null}
        {counts.data ? (
          <div className="meals__refresh" role="status">
            <span>
              {readAt(counts.dataUpdatedAt)}에 읽음{counts.isError ? " · 새로 읽지 못했어요" : ""}
            </span>
            <Button
              type="button"
              variant="secondary"
              size={40}
              loading={counts.isFetching}
              onClick={() => void readAgain()}
            >
              새로 고침
            </Button>
          </div>
        ) : null}
      </div>
    </OperatorShell>
  );
}

function MealsContent({
  eventId,
  data,
  copied,
  onCopyNext,
  onCopyRest,
}: {
  eventId: string;
  data: MealCounts;
  copied: Copied;
  onCopyNext: (line: MealLine) => void;
  onCopyRest: (lines: MealLine[]) => void;
}) {
  if (data.days.length === 0) {
    return (
      <section className="meals__notice">
        <h3>식사 칸이 없어요</h3>
        <p>신청서 설정에서 일차별 식사를 고르면 끼니마다 식수를 볼 수 있어요.</p>
        <Link className="meals__link" to={`/events/${eventId}/participants/setup`}>
          신청서 설정으로 가기
        </Link>
      </section>
    );
  }
  const lines = mealLines(data);
  const next = lines.find((line) => line.slot.slotId === data.nextSlotId) ?? null;
  const rest = remainingLines(data);
  return (
    <>
      {next ? (
        <section className="meals__next" aria-labelledby="meals-next-title">
          <p className="meals__next-kicker" id="meals-next-title">
            다음 끼니 · {next.dayLabel} {next.slot.label} {next.slot.startTime}
            <span className="meals__time-source"> ({next.slot.timeFromSchedule ? "일정표" : "기본 시각"})</span>
          </p>
          <p className="meals__next-count">
            <span>도착 반영</span>
            <strong>{count(next.slot.reflected)}명</strong>
          </p>
          <Breakdown slot={next.slot} />
          <div className="meals__actions">
            <Button type="button" variant="primary" size={48} onClick={() => onCopyNext(next)}>
              다음 끼니 복사
            </Button>
            {rest.length > 1 ? (
              <Button type="button" variant="secondary" size={48} onClick={() => onCopyRest(rest)}>
                남은 끼니 복사
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="meals__notice" role="status">
          <h3>남은 끼니가 없어요</h3>
          <p>모든 끼니 시각이 지났어요. 아래 표에서 끼니마다 숫자를 볼 수 있어요.</p>
        </section>
      )}
      {copied ? (
        <div className={`meals__copied meals__copied--${copied.tone}`} role={copied.tone === "error" ? "alert" : "status"}>
          <p>{copied.text}</p>
          {copied.manual ? (
            <textarea className="meals__manual" readOnly rows={Math.min(8, copied.manual.split("\n").length)} value={copied.manual} aria-label="복사할 글" />
          ) : null}
        </div>
      ) : null}
      {data.unknown.count > 0 ? (
        <p className="meals__unknown" role="note">
          끼니를 모르는 신청 {count(data.unknown.count)}명(그중 도착 {count(data.unknown.arrived)}명)은 어느 끼니에도 세지
          않았어요. 신청 답을 확인해 손으로 더해 주세요.
        </p>
      ) : null}

      <section className="meals__table" aria-label="끼니별 식수">
        {data.days.map((day) => (
          <div key={day.day} className="meals__day">
            <h3>{day.label}</h3>
            <ul>
              {day.slots.map((slot) => (
                <li
                  key={slot.slotId}
                  className={`meals__row${slot.passed ? " meals__row--passed" : ""}${slot.slotId === data.nextSlotId ? " meals__row--next" : ""}`}
                  aria-label={`${day.label} ${slot.label}`}
                >
                  <div className="meals__row-head">
                    <span className="meals__row-name">
                      {slot.label} <span className="meals__row-time">{slot.startTime}</span>
                    </span>
                    {slot.passed ? <span className="meals__tag">지남</span> : null}
                    {slot.slotId === data.nextSlotId ? <span className="meals__tag meals__tag--next">다음</span> : null}
                  </div>
                  <div className="meals__pair">
                    <p>
                      <span>예정</span>
                      <strong>{count(slot.planned)}</strong>
                    </p>
                    <p>
                      <span>도착 반영</span>
                      <strong>{count(slot.reflected)}</strong>
                    </p>
                  </div>
                  <Breakdown slot={slot} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <details className="meals__how">
        <summary>숫자는 이렇게 나와요</summary>
        <ul>
          <li>예정: 그 끼니에 참석한다고 신청한 사람이에요. 고친 신청은 지금 답으로, 취소된 신청은 빼고 세요.</li>
          <li>도착: 도착 체크인을 한 사람이에요. 체크인을 취소하면 안 온 사람이에요.</li>
          <li>올 예정: 아직 안 왔지만 도착하기로 한 끼니가 아직 지나지 않은 사람이에요.</li>
          <li>아직 안 옴: 도착하기로 한 끼니가 지났는데 체크인이 없는 사람이에요. 도착 반영에서 빠져요.</li>
          <li>도착 반영 = 도착 + 올 예정. 끼니는 시작 1시간 뒤에 지나요. 시각은 일정표의 식사 항목, 없으면 기본 시각(아침 8시·점심 12시·저녁 6시)이에요.</li>
        </ul>
      </details>
    </>
  );
}

function Breakdown({ slot }: { slot: MealCountSlot }) {
  return (
    <p className="meals__breakdown">
      예정 {count(slot.planned)} · 도착 {count(slot.arrived)} · 올 예정 {count(slot.coming)} · 아직 안 옴 {count(slot.missing)}
    </p>
  );
}

function count(value: number): string {
  return value.toLocaleString("ko-KR");
}

function readAt(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
