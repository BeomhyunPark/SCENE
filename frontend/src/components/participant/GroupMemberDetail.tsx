import { Link } from "react-router";
import { isApiError } from "../../api/errors";
import { reloadQuery } from "../../api/queryClient";
import { Button } from "../Button";
import { formatPublishedAt } from "../eventFormat";
import { participantLabel } from "../participantLabel";
import { useGroupMemberQuery, useParticipantGroupQuery } from "./groupQuery";
import { attendanceText, lodgingText, spanText } from "./groupStatusView";
import { participantPath } from "./participantTabs";

/**
 * 조원 상세 (F3, DEC-083 §3): one member of the leader's group, opened from 조원 현황. The server logs
 * every read that carries a phone, so this reads once when it opens and never on a timer, focus or
 * `updates` (`useGroupMemberQuery`). The phone is a `tel:` link. Answers are drawn with the server's
 * `display` as is (the operator table's wording, DEC-083 Follow-up 결정 대기 3). Every refusal is one
 * 404 on the server and one sentence here, so nothing tells who exists in another group.
 */
export function GroupMemberDetail({ eventId, participantId }: { eventId: string; participantId: string }) {
  const query = useGroupMemberQuery(eventId, participantId);
  // Slot names for the attendance line come from the 내 조 read already on this tab (no extra request).
  const group = useParticipantGroupQuery(eventId);
  const slots = group.data?.leaderView?.slots ?? null;
  const back = (
    <Link className="participant-card__link participant-member__back" to={participantPath(eventId, "group")}>
      조원 현황으로
    </Link>
  );

  let body;
  if (query.isPending) {
    body = <p className="participant-gate__body">조원 정보를 불러오는 중이에요.</p>;
  } else if (query.isError) {
    body = isApiError(query.error, "RESOURCE_NOT_FOUND") ? (
      <p className="participant-gate__body">볼 수 없어요.</p>
    ) : (
      <>
        <p className="participant-gate__body">조원 정보를 불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(query)}>
          다시 시도
        </Button>
      </>
    );
  } else {
    const member = query.data;
    const span = spanText(member.attendance, slots);
    const revisedAt = member.application.revisedAt ? formatPublishedAt(member.application.revisedAt) : "";
    body = (
      <>
        <div className="participant-member__head">
          <p className="participant-member__name">{participantLabel(member)}</p>
          <p className="participant-member__meta">
            {[member.gender, member.leader ? "조장" : null].filter(Boolean).join(" · ")}
            {revisedAt ? <span className="participant-group__badge participant-group__badge--revised">최근 수정 {revisedAt}</span> : null}
          </p>
        </div>
        {member.phone ? (
          <a className="scene-button scene-button--primary scene-button--size-48 participant-member__call" href={telHref(member.phone)}>
            <span className="scene-button__label">전화 걸기 {member.phone}</span>
          </a>
        ) : (
          <p className="participant-group__muted">신청한 전화번호가 없어요.</p>
        )}
        <dl className="participant-member__facts">
          <div>
            <dt>도착</dt>
            <dd>
              {member.checkIn.checkedIn
                ? `도착${member.checkIn.checkedInAt ? ` ${formatPublishedAt(member.checkIn.checkedInAt)}` : ""}`
                : "미도착"}
            </dd>
          </div>
          <div>
            <dt>참석</dt>
            <dd>
              {attendanceText(member.attendance.type)}
              {span ? ` · ${span}` : member.attendance.type === "FULL" ? "" : " · 참석 칸 모름"}
            </dd>
          </div>
          <div>
            <dt>숙박</dt>
            <dd>{lodgingText(member.attendance.lodgingNights)}</dd>
          </div>
          {member.room ? (
            <div>
              <dt>방</dt>
              <dd>
                {member.room.name}
                {member.room.locationNote ? ` · ${member.room.locationNote}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="participant-member__answers">
          <h3 className="participant-group__roster-title">신청 답</h3>
          {member.application.answers.length === 0 ? (
            <p className="participant-group__muted">보여 줄 신청 답이 없어요.</p>
          ) : (
            <dl className="participant-member__facts" aria-label="신청 답">
              {member.application.answers.map((answer) => (
                <div key={answer.fieldId}>
                  <dt>{answer.label}</dt>
                  <dd>
                    {answer.display.length > 0 ? answer.display : "답 없음"}
                    {answer.operatorEdited ? <span className="participant-group__badge">운영자가 고침</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <p className="participant-group__muted">
          조장만 볼 수 있는 정보예요. 이 화면을 열 때마다 연락처 열람 기록이 남아요. 다른 사람에게 옮기지 말아 주세요.
        </p>
      </>
    );
  }

  return (
    <section className="participant-group participant-member" aria-labelledby="participant-member-title">
      {back}
      <h2 id="participant-member-title" className="participant-group__heading">
        조원 상세
      </h2>
      {body}
    </section>
  );
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
