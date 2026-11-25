import type { ReactNode } from "react";
import { compareCohort } from "./cohort";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import {
  getApplicationSummary,
  type ApplicationSummary,
  type CarpoolOffer,
  type MealKind,
  type MobilityRequest,
  type SummaryChoice,
} from "../api/applicationSummary";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { applicantName, eventContext } from "./eventFormat";
import { participantLabel } from "./participantLabel";
import "./EventHome.css";
import "./EventApplicationSummary.css";

/**
 * 신청 집계 (#251, DEC-073): the numbers operators used to count in a sheet, read from one request.
 * No dedicated Figma frame exists for this screen; it follows the v2 Light 참가 현황 (1325:5059) title
 * row, count chips, bordered cards and tags. Copy is a draft.
 */
export function EventApplicationSummary() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <SummaryBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

const NOT_ASKED = "이 신청서에서는 묻지 않았어요.";
const MEAL_ORDER: MealKind[] = ["BREAKFAST", "LUNCH", "DINNER", "WORSHIP"];
const MEAL_NAMES: Record<MealKind, string> = { BREAKFAST: "아침", LUNCH: "점심", DINNER: "저녁", WORSHIP: "집회" };

function SummaryBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const context = eventContext(event);
  const summary = useQuery({
    queryKey: queryKeys.applicationSummary(eventId),
    queryFn: ({ signal }) => getApplicationSummary(eventId, signal),
    enabled: eventId.length > 0,
  });

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={["participants"]}
      participantsHref={`/events/${eventId}/participants`}
      framed
      leading={
        // 신청 집계 sits under 참가 현황 (/participants/summary, the 신청 집계 button in its toolbar), so the back
        // arrow goes up to 참가 현황 like 신청자 상세·직접 추가, also when opened from 행사 홈's link (#497).
        <Link className="event-home__back scene-press scene-press--text" to={`/events/${eventId}/participants`} aria-label="참가 현황">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        summary.isSuccess && summary.data.total > 0 ? (
          <Button type="button" variant="secondary" size={40} onClick={() => window.print()}>
            인쇄
          </Button>
        ) : undefined
      }
    >
      <div className="event-home app-summary">
        <div className="app-summary__title">
          <div>
            <h2>신청 집계</h2>
            <p>{context ? `${context} · ` : ""}제출된 신청을 지금 신청서 설정으로 세요.</p>
          </div>
        </div>
        {summary.isPending ? <p role="status">불러오는 중이에요.</p> : null}
        {summary.isError ? (
          isApiError(summary.error) && summary.error.status === 403 ? (
            <section className="app-summary__notice" role="status">
              <h3>신청 집계를 볼 권한이 없어요</h3>
              <p>신청을 읽을 수 있는 운영자만 볼 수 있어요. 행사 소유자에게 요청해 주세요.</p>
            </section>
          ) : (
            <section className="app-summary__notice">
              <p role="alert">집계를 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(summary)}>
                다시 시도
              </Button>
            </section>
          )
        ) : null}
        {summary.isSuccess ? <SummaryContent eventId={eventId} data={summary.data} /> : null}
      </div>
    </OperatorShell>
  );
}

function SummaryContent({ eventId, data }: { eventId: string; data: ApplicationSummary }) {
  const setupLink = (
    <Link className="app-summary__link scene-press scene-press--text" to={`/events/${eventId}/participants/setup`}>
      신청서 설정으로 가기
    </Link>
  );
  if (data.formId === null) {
    return (
      <section className="app-summary__notice">
        <h3>아직 신청서가 없어요</h3>
        <p>신청서를 만들고 신청을 받으면 여기서 식수·숙박·차량 인원을 볼 수 있어요.</p>
        {setupLink}
      </section>
    );
  }
  return (
    <>
      {data.total === 0 ? (
        <section className="app-summary__notice">
          <h3>아직 들어온 신청이 없어요</h3>
          <p>신청이 들어오면 숫자가 채워져요. 아래는 지금 신청서로 셀 항목이에요.</p>
        </section>
      ) : null}
      {!data.fromSetup ? (
        <section className="app-summary__notice">
          <h3>설정 카드로 만든 신청서가 아니에요</h3>
          <p>
            그래서 총 신청 수, 또래, 참석 방식만 셀 수 있어요. 식수·숙박·차량을 세려면 신청서 설정에서 설정 카드를
            채워 주세요.
          </p>
          {setupLink}
        </section>
      ) : null}
      <Overview data={data} />
      {data.fromSetup ? (
        <>
          <Meals meals={data.meals} />
          <Lodging lodging={data.lodging} />
          <Transport transport={data.transport} shuttle={data.shuttle} />
          <Rides eventId={eventId} carpool={data.carpool} mobility={data.mobility} />
        </>
      ) : null}
    </>
  );
}

function Card({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="app-summary__card" aria-labelledby={id}>
      <div className="app-summary__card-head">
        <h3 id={id}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NotAsked() {
  return <p className="app-summary__not-asked">{NOT_ASKED}</p>;
}

function Count({ value, unit = "명" }: { value: number; unit?: string }) {
  return (
    <span className="app-summary__count">
      <strong>{value}</strong>
      {unit}
    </span>
  );
}

function Overview({ data }: { data: ApplicationSummary }) {
  const { attendance } = data;
  return (
    <Card id="summary-overview" title="신청" aside={<Count value={data.total} />}>
      <div className="app-summary__overview">
        <div className="app-summary__group">
          <h4>참석 방식</h4>
          <ul className="app-summary__chips">
            <Chip label="전체 참석" count={attendance.full} />
            {attendance.asked ? (
              <>
                <Chip label="부분 참석" count={attendance.partial} />
                <Chip label="집회만 참석" count={attendance.worshipOnly} />
              </>
            ) : null}
          </ul>
          {!attendance.asked ? <p className="app-summary__hint">참석 방식을 묻지 않아 모두 전체 참석으로 셌어요.</p> : null}
        </div>
        <div className="app-summary__group">
          <h4>성별</h4>
          {data.gender ? (
            <ul className="app-summary__chips">
              {visibleOptions(data.gender).map((option) => (
                <Chip key={option.optionId} label={option.label} count={option.count} off={option.hidden} />
              ))}
              {data.gender.noAnswer > 0 ? <Chip label="답 없음" count={data.gender.noAnswer} muted /> : null}
            </ul>
          ) : (
            <NotAsked />
          )}
        </div>
        <div className="app-summary__group">
          <h4>또래</h4>
          {data.cohorts ? (
            data.cohorts.items.length === 0 && data.cohorts.noAnswer === 0 ? (
              <p className="app-summary__hint">아직 답이 없어요.</p>
            ) : (
              <ul className="app-summary__chips">
                {[...data.cohorts.items].sort((a, b) => compareCohort(a.cohort, b.cohort)).map((item) => (
                  <Chip key={item.cohort} label={item.cohort} count={item.count} />
                ))}
                {data.cohorts.noAnswer > 0 ? <Chip label="답 없음" count={data.cohorts.noAnswer} muted /> : null}
              </ul>
            )
          ) : (
            <NotAsked />
          )}
        </div>
      </div>
    </Card>
  );
}

function Chip({ label, count, off = false, muted = false }: { label: string; count: number; off?: boolean; muted?: boolean }) {
  return (
    <li className={muted ? "app-summary__chip is-muted" : "app-summary__chip"}>
      <span>
        {label}
        {off ? <span className="app-summary__off"> (꺼짐)</span> : null}
      </span>
      <strong>{count}</strong>
    </li>
  );
}

/** A turned-off option shows only when someone already chose it (DEC-073 §6). */
function visibleOptions(choice: SummaryChoice) {
  return choice.options.filter((option) => !option.hidden || option.count > 0);
}

function Meals({ meals }: { meals: ApplicationSummary["meals"] }) {
  if (!meals) {
    return (
      <Card id="summary-meals" title="식수·집회">
        <NotAsked />
      </Card>
    );
  }
  const columns = MEAL_ORDER.filter((kind) => meals.days.some((day) => day.slots.some((slot) => slot.meal === kind)));
  return (
    <Card id="summary-meals" title="식수·집회">
      <div className="app-summary__table-wrap">
        <table className="app-summary__table">
          <caption className="app-summary__sr">일차별 식사와 집회 인원</caption>
          <thead>
            <tr>
              <th scope="col">일차</th>
              {columns.map((kind) => (
                <th key={kind} scope="col">
                  {MEAL_NAMES[kind]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meals.days.map((day) => (
              <tr key={day.day}>
                <th scope="row">
                  <span className="app-summary__day">{day.day}일차</span>
                  <span className="app-summary__date">{day.label}</span>
                </th>
                {columns.map((kind) => {
                  const slot = day.slots.find((item) => item.meal === kind);
                  return (
                    <td key={kind}>
                      {slot ? (
                        <>
                          <strong className="app-summary__cell">{slot.count}</strong>
                          {slot.label !== MEAL_NAMES[kind] ? <span className="app-summary__date">{slot.label}</span> : null}
                        </>
                      ) : (
                        <span className="app-summary__none" aria-label="없음">
                          –
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meals.unanswered > 0 ? (
        <p className="app-summary__warning">
          부분·집회만 참석 {meals.unanswered}명은 식사 답이 없어 위 숫자에 들어가지 않았어요.
        </p>
      ) : null}
    </Card>
  );
}

function Lodging({ lodging }: { lodging: ApplicationSummary["lodging"] }) {
  return (
    <Card id="summary-lodging" title="숙박">
      {lodging ? (
        <>
          <ul className="app-summary__tiles">
            {lodging.nights.map((night) => (
              <li key={night.optionId} className="app-summary__tile">
                <span>{night.label}</span>
                <Count value={night.count} />
              </li>
            ))}
          </ul>
          {lodging.unanswered > 0 ? (
            <p className="app-summary__warning">
              부분 참석 {lodging.unanswered}명은 숙박 답이 없어 위 숫자에 들어가지 않았어요.
            </p>
          ) : null}
        </>
      ) : (
        <p className="app-summary__not-asked">하루 행사이거나 숙박을 묻지 않았어요.</p>
      )}
    </Card>
  );
}

const DRIVE = "opt_car";
const RIDE = "opt_ride";
const CHURCH_VEHICLES = ["opt_group", "opt_shuttle"];

type Row = { key: string; label: string; hidden: boolean; count: number; detail?: string };

/**
 * Rows in option order. With `joinCar`, 자차 (직접 운전) and 자차 합승 (#324) read as one 자차 row
 * with the split under it, so the two are not mistaken for each other.
 */
function rowsOf(choice: SummaryChoice, joinCar: boolean): Row[] {
  const options = visibleOptions(choice);
  const drive = options.find((option) => option.optionId === DRIVE);
  const ride = options.find((option) => option.optionId === RIDE);
  const rows: Row[] = [];
  for (const option of options) {
    if (joinCar && drive && ride && (option.optionId === DRIVE || option.optionId === RIDE)) {
      if (option.optionId === RIDE) continue;
      rows.push({
        key: "car",
        label: "자차",
        hidden: drive.hidden && ride.hidden,
        count: drive.count + ride.count,
        detail: `직접 운전 ${drive.count} · 합승 ${ride.count}`,
      });
      continue;
    }
    rows.push({ key: option.optionId, label: option.label, hidden: option.hidden, count: option.count });
  }
  return rows;
}

function ChoiceRows({ title, choice, joinCar = false }: { title: string; choice: SummaryChoice | null; joinCar?: boolean }) {
  return (
    <div className="app-summary__group">
      <h4>{title}</h4>
      {choice ? (
        <ul className="app-summary__rows">
          {rowsOf(choice, joinCar).map((row) => (
            <li key={row.key}>
              <span>
                {row.detail ? <span>{row.label}</span> : row.label}
                {row.hidden ? <span className="app-summary__off"> (꺼짐)</span> : null}
                {row.detail ? <small className="app-summary__row-detail">{row.detail}</small> : null}
              </span>
              <Count value={row.count} />
            </li>
          ))}
          {choice.noAnswer > 0 ? (
            <li className="is-muted">
              <span>답 없음</span>
              <Count value={choice.noAnswer} />
            </li>
          ) : null}
        </ul>
      ) : (
        <NotAsked />
      )}
    </div>
  );
}

/** Church vehicles first and large: the counts the operators book seats with. */
function ChurchVehicles({ transport }: { transport: NonNullable<ApplicationSummary["transport"]> }) {
  const tiles = CHURCH_VEHICLES.flatMap((optionId) => {
    const there = transport.in.options.find((option) => option.optionId === optionId);
    const back = transport.out.options.find((option) => option.optionId === optionId);
    if (!there && !back) return [];
    if ((there?.hidden ?? true) && (back?.hidden ?? true) && !there?.count && !back?.count) return [];
    return [{ optionId, label: there?.label ?? back?.label ?? "", there: there?.count ?? 0, back: back?.count ?? 0 }];
  });
  if (tiles.length === 0) return null;
  return (
    <ul className="app-summary__tiles app-summary__vehicles" aria-label="교회 차량 탑승 인원">
      {tiles.map((tile) => (
        <li key={tile.optionId} className="app-summary__tile">
          <span>{tile.label}</span>
          <span className="app-summary__vehicle-counts">
            <span>
              가는 길 <Count value={tile.there} />
            </span>
            <span>
              오는 길 <Count value={tile.back} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Transport({
  transport,
  shuttle,
}: {
  transport: ApplicationSummary["transport"];
  shuttle: ApplicationSummary["shuttle"];
}) {
  const riding = transport?.in.options.some((option) => option.optionId === RIDE && (!option.hidden || option.count > 0));
  return (
    <Card id="summary-transport" title="차량">
      {transport ? <ChurchVehicles transport={transport} /> : null}
      {transport ? (
        <div className="app-summary__pair">
          <ChoiceRows title="가는 길" choice={transport.in} joinCar />
          <ChoiceRows title="오는 길" choice={transport.out} joinCar />
        </div>
      ) : (
        <NotAsked />
      )}
      {transport ? (
        <p className="app-summary__hint">
          {riding
            ? "가는 길에 자차(직접 운전·합승)를 고른 사람은 오는 길도 같은 방법으로 셌어요."
            : "가는 길에 자차를 고른 사람은 오는 길도 자차로 셌어요."}
        </p>
      ) : null}
      {shuttle ? (
        <>
          <h4 className="app-summary__subhead">집회 차량 회차</h4>
          <div className="app-summary__pair">
            <ChoiceRows title="가는 차량" choice={shuttle.in} />
            <ChoiceRows title="오는 차량" choice={shuttle.out} />
          </div>
          <p className="app-summary__hint">한 사람이 여러 회차를 고를 수 있어 합이 인원보다 클 수 있어요.</p>
        </>
      ) : null}
    </Card>
  );
}

function PersonLink({ eventId, person }: { eventId: string; person: { applicationId: string; name: string | null; cohort: string | null } }) {
  return (
    <Link className="app-summary__person" to={`/events/${eventId}/participants/${person.applicationId}`}>
      {participantLabel({ name: applicantName(person.name), cohort: person.cohort })}
    </Link>
  );
}

function Rides({
  eventId,
  carpool,
  mobility,
}: {
  eventId: string;
  carpool: ApplicationSummary["carpool"];
  mobility: ApplicationSummary["mobility"];
}) {
  return (
    <Card id="summary-rides" title="카풀·이동 지원">
      <p className="app-summary__hint">자동으로 짝을 맞추지 않아요. 이름을 누르면 신청 내용을 볼 수 있어요.</p>
      <div className="app-summary__pair">
        <div className="app-summary__group">
          <h4>카풀 제공</h4>
          {carpool ? (
            <>
              <p className="app-summary__totals">
                운전자 <Count value={carpool.offerCount} /> · 좌석 <Count value={carpool.seatTotal} unit="석" />
              </p>
              {carpool.offers.length === 0 ? (
                <p className="app-summary__hint">아직 없어요.</p>
              ) : (
                <ul className="app-summary__people">
                  {carpool.offers.map((offer) => (
                    <OfferRow key={offer.applicationId} eventId={eventId} offer={offer} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <NotAsked />
          )}
        </div>
        <div className="app-summary__group">
          <h4>이동 지원 요청</h4>
          {mobility ? (
            <>
              <RequestList eventId={eventId} title="가는 길" requests={mobility.in} />
              <RequestList eventId={eventId} title="오는 길" requests={mobility.out} />
            </>
          ) : (
            <NotAsked />
          )}
        </div>
      </div>
    </Card>
  );
}

function OfferRow({ eventId, offer }: { eventId: string; offer: CarpoolOffer }) {
  return (
    <li>
      <PersonLink eventId={eventId} person={offer} />
      <span className="app-summary__meta">
        {offer.seats !== null ? `${offer.seats}석` : "좌석 답 없음"}
        {offer.area ? ` · ${offer.area}` : ""}
      </span>
      {offer.note ? <span className="app-summary__note">{offer.note}</span> : null}
    </li>
  );
}

function RequestList({ eventId, title, requests }: { eventId: string; title: string; requests: MobilityRequest[] | null }) {
  return (
    <div className="app-summary__requests">
      <h5>
        {title}
        {requests ? <span> {requests.length}명</span> : null}
      </h5>
      {requests === null ? (
        <NotAsked />
      ) : requests.length === 0 ? (
        <p className="app-summary__hint">아직 없어요.</p>
      ) : (
        <ul className="app-summary__people">
          {requests.map((request) => (
            <li key={request.applicationId}>
              <PersonLink eventId={eventId} person={request} />
              <span className="app-summary__meta">{request.area}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
