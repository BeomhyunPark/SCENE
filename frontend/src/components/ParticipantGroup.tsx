import { Link } from "react-router";
import { isApiError } from "../api/errors";
import type { ParticipantGroup as GroupState, LeaderView, LeaderViewMember, ParticipantGroupMember } from "../api/participantGroup";
import { reloadQuery } from "../api/queryClient";
import { Button } from "./Button";
import { formatPublishedAt } from "./eventFormat";
import { participantLabel } from "./participantLabel";
import { useParticipantGroupQuery } from "./participant/groupQuery";
import { koreaDate, slotCounts, spanText, todayMovements, type Movement } from "./participant/groupStatusView";
import { participantPath } from "./participant/participantTabs";
import "./ParticipantGroup.css";

/**
 * "내 조" from the latest publication (#303, DEC-072, DEC-083 · F3 #453), laid out after Figma P18 · group ·
 * 내 조 (667:75530) and P18 · unpublished · 내 조 (667:75584). It sits under the arrival QR so the QR stays
 * first on the day. A republish can move people, so it reloads when `updates.group` changes (#425) and
 * "새로 고침" reloads on demand.
 *
 * - A member sees the roster (또래 이름, 성별, 조장·나 marks) while `rosterVisible`; otherwise only the group
 *   and leader names. The rows are plain text: members never open each other (DEC-083 §1).
 * - A leader sees 조원 현황 instead: 미도착 first so it fits one phone screen, then 오늘 오는·가는 사람,
 *   every member (each opens the member detail), and 끼니별 인원 counted on the phone from `leaderView`.
 *   While this tab is on screen the read repeats every 60 s.
 *
 * The value lives only in the query cache and is never written to web storage. Wording is a draft.
 */
export function ParticipantGroup({
  eventId,
  name,
  serverOffsetMs = 0,
}: {
  eventId: string;
  name: string;
  /** `serverTime` − phone time from the poll (§6), so "오늘" follows the server clock. */
  serverOffsetMs?: number;
}) {
  const query = useParticipantGroupQuery(eventId, { leaderRefresh: true });
  // "오늘" is the Korea date when this answer arrived; the 60 s reread moves it past midnight.
  const now = query.dataUpdatedAt + serverOffsetMs;

  // A withdrawn application has no group to show; the arrival area already explains the withdrawal.
  if (query.data?.status === "NOT_ELIGIBLE") return null;

  const refresh = (
    <Button
      type="button"
      variant="secondary"
      size={40}
      loading={query.isFetching}
      onClick={() => void reloadQuery(query)}
    >
      새로 고침
    </Button>
  );

  let body;
  if (query.isPending) {
    body = <p className="participant-gate__body">내 조를 불러오는 중이에요.</p>;
  } else if (query.isError && !query.data) {
    body = <p className="participant-gate__body">{errorText(query.error)}</p>;
  } else {
    body = <GroupBody eventId={eventId} data={query.data!} name={name} now={now} />;
  }

  return (
    <section className="participant-group" aria-labelledby="participant-group-title">
      <h2 id="participant-group-title" className="participant-group__heading">
        내 조
      </h2>
      {body}
      {query.isError && query.data ? (
        <p className="participant-gate__error">최신 조를 불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요.</p>
      ) : null}
      {refresh}
    </section>
  );
}

function GroupBody({ eventId, data, name, now }: { eventId: string; data: GroupState; name: string; now: number }) {
  if (data.status === "NOT_PUBLISHED") {
    return (
      <Notice title="조 안내가 아직 열리지 않았어요" body="공개되면 이 화면에서 확인할 수 있어요." />
    );
  }
  if (data.status === "UNASSIGNED" || !data.group) {
    return (
      <>
        <Notice title="아직 조가 정해지지 않았어요" body="조가 정해지면 이 화면에서 확인할 수 있어요." />
        <UpdatedAt at={data.publishedAt} />
      </>
    );
  }
  const leaders = data.group.leaders.map((item) => item.name).filter((item) => item.trim().length > 0);
  return (
    <>
      <div className={`participant-group__summary${data.leader ? " participant-group__summary--compact" : ""}`}>
        {name ? <p className="participant-group__owner">{name}님의 조</p> : null}
        <p className="participant-group__name">{data.group.name}</p>
        <p className="participant-group__leaders">
          {leaders.length > 0 ? (
            <>
              조장<span className="participant-group__gap" aria-hidden="true" />
              {leaders.join(", ")}
            </>
          ) : (
            "조장은 아직 정해지지 않았어요"
          )}
        </p>
      </div>
      {data.leader && data.leaderView ? (
        <LeaderStatus eventId={eventId} view={data.leaderView} today={koreaDate(now)} />
      ) : !data.leader && data.rosterVisible && data.members ? (
        <Roster members={data.members} />
      ) : null}
      <UpdatedAt at={data.publishedAt} />
    </>
  );
}

/** Members' roster (DEC-083 §1): text only, nothing to press. 성별 is blank when the server has none. */
function Roster({ members }: { members: ParticipantGroupMember[] }) {
  return (
    <div className="participant-group__roster">
      <h3 className="participant-group__roster-title">우리 조 {members.length}명</h3>
      <ul className="participant-group__members" aria-label="우리 조 조원">
        {members.map((member, index) => (
          <li key={`${index}-${member.name}`} className="participant-group__member">
            <span className="participant-group__member-name">{participantLabel(member)}</span>
            <span className="participant-group__member-gender">{member.gender ?? ""}</span>
            <Marks leader={member.leader} me={member.me} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Marks({ leader, me, revised }: { leader: boolean; me: boolean; revised?: boolean }) {
  return (
    <span className="participant-group__marks">
      {leader ? <span className="participant-group__badge">조장</span> : null}
      {me ? <span className="participant-group__badge participant-group__badge--me">나</span> : null}
      {revised ? <span className="participant-group__badge participant-group__badge--revised">최근 수정</span> : null}
    </span>
  );
}

/** 조원 현황 (F3): the leader's own member list with arrival, today's comings and goings, and per-slot counts. */
function LeaderStatus({ eventId, view, today }: { eventId: string; view: LeaderView; today: string }) {
  const absent = view.members.filter((member) => !member.checkIn.checkedIn);
  const movements = todayMovements(view, today);
  const counts = slotCounts(view);
  const href = (member: LeaderViewMember) => participantPath(eventId, "group", "members", member.participantId);
  // The leader is the one leader of the group (조당 1명), so the 조장 row is "나".
  const isMe = (member: LeaderViewMember) => member.leader;

  return (
    <section className="participant-group__status" aria-labelledby="participant-group-status-title">
      <div className="participant-group__status-head">
        <h3 id="participant-group-status-title" className="participant-group__roster-title">
          조원 현황
        </h3>
        <p className="participant-group__arrival" aria-label={`도착 ${view.checkedInCount}명, 전체 ${view.activeCount}명`}>
          도착 <strong>{view.checkedInCount}</strong> / {view.activeCount}명
        </p>
      </div>

      <div className="participant-group__block">
        <h4 className="participant-group__block-title">미도착 {absent.length}명</h4>
        {absent.length === 0 ? (
          <p className="participant-group__muted">모두 도착했어요.</p>
        ) : (
          <ul className="participant-group__members" aria-label="미도착 조원">
            {absent.map((member) => (
              <li key={member.participantId} className="participant-group__member participant-group__member--link">
                <Link className="participant-group__member-link" to={href(member)}>
                  <span className="participant-group__member-name">{participantLabel(member)}</span>
                  <span className="participant-group__member-note">
                    {spanText(member.attendance, view.slots) ?? ""}
                  </span>
                  <Marks leader={member.leader} me={isMe(member)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {movements.inEvent ? (
        <div className="participant-group__block">
          <h4 className="participant-group__block-title">오늘 ({movements.dayLabel})</h4>
          <MovementList title="오는 사람" items={movements.coming} suffix="부터" />
          <MovementList title="가는 사람" items={movements.going} suffix="까지" />
          {movements.unknown.length > 0 ? (
            <p className="participant-group__muted">참석 칸을 모르는 조원 {movements.unknown.length}명은 세지 않았어요.</p>
          ) : null}
        </div>
      ) : null}

      <div className="participant-group__block">
        <h4 className="participant-group__block-title">조원 {view.members.length}명</h4>
        <ul className="participant-group__members" aria-label="우리 조 조원">
          {view.members.map((member) => (
            <li key={member.participantId} className="participant-group__member participant-group__member--link">
              <Link className="participant-group__member-link" to={href(member)}>
                <span className="participant-group__member-name">{participantLabel(member)}</span>
                <span className="participant-group__member-gender">{member.gender ?? ""}</span>
                <Marks leader={member.leader} me={isMe(member)} revised={member.applicationRevisedAt !== null} />
                <span
                  className={`participant-group__arrived${member.checkIn.checkedIn ? "" : " participant-group__arrived--absent"}`}
                >
                  {member.checkIn.checkedIn ? arrivedText(member.checkIn.checkedInAt) : "미도착"}
                </span>
                {member.room ? <span className="participant-group__member-note">방 {member.room.name}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {counts.days.length > 0 ? (
        <div className="participant-group__block">
          <h4 className="participant-group__block-title">식사별 인원 (신청 기준)</h4>
          <dl className="participant-group__slots" aria-label="식사별 조 인원">
            {counts.days.map((day) => (
              <div key={day.day} className="participant-group__slot-day">
                <dt>{day.dayLabel}</dt>
                <dd>{day.slots.map(({ slot, count }) => `${slot.label} ${count}`).join(" · ")}</dd>
              </div>
            ))}
          </dl>
          {counts.unknown > 0 ? (
            <p className="participant-group__muted">참석 칸을 모르는 조원 {counts.unknown}명은 세지 않았어요.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MovementList({ title, items, suffix }: { title: string; items: Movement[]; suffix: string }) {
  return (
    <div className="participant-group__movement">
      <p className="participant-group__movement-title">
        {title} {items.length}명
      </p>
      {items.length > 0 ? (
        <ul className="participant-group__movement-list" aria-label={`오늘 ${title}`}>
          {items.map(({ member, slot }) => (
            <li key={member.participantId}>
              {participantLabel(member)} · {slot.label}
              {suffix}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function arrivedText(at: string | null): string {
  const text = at ? formatPublishedAt(at) : "";
  return text ? `도착 ${text.split(" ").at(-1)}` : "도착";
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="participant-group__notice">
      <p className="participant-group__notice-title">{title}</p>
      <p className="participant-group__notice-body">{body}</p>
    </div>
  );
}

function UpdatedAt({ at }: { at: string | null }) {
  const text = at ? formatPublishedAt(at) : "";
  return text ? <p className="participant-group__updated">{text} 기준</p> : null;
}

function errorText(error: unknown): string {
  if (isApiError(error, "AUTHENTICATION_REQUIRED")) return "링크로 다시 들어와 주세요.";
  return "내 조를 불러오지 못했어요.";
}
