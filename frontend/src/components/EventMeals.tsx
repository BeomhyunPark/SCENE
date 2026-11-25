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
import { OperatorShell } from "./OperatorShell";
import "./EventHome.css";
import "./EventMeals.css";

/**
 * 식수 현황 (#454, DEC-089): per meal two numbers, 예정 (신청 기준) and 도착 (of those, checked in now). A meal that
 * has passed says 식사 완료; the others carry no state word. The user cut the copy for the kitchen and the 도착 반영
 * breakdown (2026-11-25); the server still sends them. Nobody is counted at a meal (로드맵 결정 1). Read again every
 * 10 seconds while the page is visible, like 현장 운영 (#408). No dedicated Figma frame: the next meal is the one
 * emphasised block, and the meals are a table per day (SCENE DS Data Workbench ZFajaGIQ3VneNqkncKYXbJ 50:17, #485).
 */
export function EventMeals() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <MealsBody event={event} spaceName={spaceName} />}</EventScreen>;
}

function MealsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const counts = useQuery({
    queryKey: queryKeys.mealCounts(eventId),
    queryFn: ({ signal }) => getMealCounts(eventId, signal),
    refetchInterval: fieldRefresh.intervalMs,
  });
  const { refetch: readAgain } = counts;

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
          <MealsContent eventId={eventId} data={counts.data} />
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

function MealsContent({ eventId, data }: { eventId: string; data: MealCounts }) {
  if (data.days.length === 0) {
    return (
      <section className="meals__notice">
        <h3>식사 칸이 없어요</h3>
        <p>신청서 설정에서 일차별 식사를 고르면 식사마다 식수를 볼 수 있어요.</p>
        <Link className="meals__link" to={`/events/${eventId}/participants/setup`}>
          신청서 설정으로 가기
        </Link>
      </section>
    );
  }
  const next =
    data.days.flatMap((day) => day.slots.map((slot) => ({ dayLabel: day.label, slot }))).find((line) => line.slot.slotId === data.nextSlotId) ??
    null;
  return (
    <>
      {next ? (
        <section className="meals__next" aria-labelledby="meals-next-title">
          <p className="meals__next-kicker" id="meals-next-title">
            다음 식사 · {next.dayLabel} {next.slot.label} {next.slot.startTime}
          </p>
          <NextCounts slot={next.slot} />
        </section>
      ) : (
        <section className="meals__notice" role="status">
          <h3>남은 식사가 없어요</h3>
        </section>
      )}

      {/* One table per day instead of a box per meal (#485): each number once, in its own column. */}
      <section className="meals__table" aria-label="식사별 식수">
        {data.days.map((day) => (
          <div key={day.day} className="meals__day">
            <h3 id={`meals-day-${day.day}`}>{day.label}</h3>
            <table aria-labelledby={`meals-day-${day.day}`}>
              <thead>
                <tr>
                  <th scope="col">식사</th>
                  <th scope="col">예정</th>
                  <th scope="col">도착</th>
                </tr>
              </thead>
              <tbody>
                {day.slots.map((slot) => (
                  <tr
                    key={slot.slotId}
                    className={`${slot.passed ? "meals__row--passed" : ""}${slot.slotId === data.nextSlotId ? " meals__row--next" : ""}`.trim() || undefined}
                    aria-label={`${day.label} ${slot.label}`}
                  >
                    <th scope="row">
                      <span className="meals__row-name">{slot.label}</span>{" "}
                      <span className="meals__row-time">{slot.startTime}</span>
                      {slot.passed ? <span className="meals__state">식사 완료</span> : null}
                    </th>
                    <td>{count(slot.planned)}명</td>
                    <td>{count(slot.arrived)}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </>
  );
}

function NextCounts({ slot }: { slot: MealCountSlot }) {
  return (
    <div className="meals__next-counts">
      <p className="meals__next-count">
        <span>예정</span>
        <strong>{count(slot.planned)}명</strong>
      </p>
      <p className="meals__next-count">
        <span>도착</span>
        <strong>{count(slot.arrived)}명</strong>
      </p>
    </div>
  );
}

function count(value: number): string {
  return value.toLocaleString("ko-KR");
}

function readAt(at: number): string {
  return new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
