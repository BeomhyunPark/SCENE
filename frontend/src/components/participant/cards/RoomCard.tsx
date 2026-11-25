import { Link } from "react-router";
import { EmptyNote, HomeCard } from "../HomeCard";
import { useParticipantFeed } from "../participantFeed";
import { participantPath } from "../participantTabs";
import { useParticipantRoomsQuery } from "../roomQuery";
import { NOT_LODGING_ASSIGNED, personLine, roomMeta, roomStateNote } from "../roomText";
import "../RoomsScreen.css";

/** Roommates shown on the card besides me; the rest are "외 N명" (participant-home-contract §1). */
const CARD_MATES = 5;

/**
 * 숙소 (participant-home-contract §1, api.md "숙소" `GET /participant/rooms`, DEC-085 §9). My room's
 * name and location, then up to five other people in it (name·또래·성별). "자세히" opens the 숙소
 * screen under the home tab; with `rosterScope: ALL` the card also offers the full room table there.
 * Same query as that screen; it reloads on `updates.rooms`. `NOT_ELIGIBLE` has no card.
 */
export function RoomCard() {
  const { eventId } = useParticipantFeed();
  const query = useParticipantRoomsQuery(eventId);
  const to = participantPath(eventId, "home", "rooms");
  const data = query.data;
  if (data?.status === "NOT_ELIGIBLE") return null;

  let body;
  if (!data) {
    body = <EmptyNote>{query.isError ? "숙소를 불러오지 못했어요." : "불러오는 중이에요."}</EmptyNote>;
  } else if (data.status !== "ASSIGNED" || !data.myRoom) {
    body = (
      <>
        <EmptyNote>{roomStateNote(data)}</EmptyNote>
        {data.rooms ? <RosterLink to={to} /> : null}
      </>
    );
  } else {
    const room = data.myRoom;
    const meta = roomMeta(room);
    const mates = room.members?.filter((member) => !member.me) ?? null;
    body = (
      <>
        <p className="participant-card__event">{room.name}</p>
        {meta ? <p className="participant-card__meta">{meta}</p> : null}
        {mates === null ? null : mates.length === 0 ? (
          <p className="participant-card__meta">같은 방 사람은 아직 없어요.</p>
        ) : (
          <ul className="participant-room__mates" aria-label="같은 방 사람">
            {mates.slice(0, CARD_MATES).map((mate, index) => (
              <li key={`${index}-${mate.name}`}>{personLine(mate)}</li>
            ))}
            {mates.length > CARD_MATES ? <li>외 {mates.length - CARD_MATES}명</li> : null}
          </ul>
        )}
        {data.notLodging ? <p className="participant-card__meta">{NOT_LODGING_ASSIGNED}</p> : null}
        {data.rooms ? <RosterLink to={to} /> : null}
      </>
    );
  }
  const open = data?.status === "ASSIGNED" || data?.status === "UNASSIGNED";
  return (
    <HomeCard
      title="숙소"
      failed={query.isError && Boolean(data)}
      action={
        open ? (
          <Link className="participant-card__link" to={to} aria-label="숙소 자세히 보기">
            자세히
          </Link>
        ) : null
      }
    >
      {body}
    </HomeCard>
  );
}

function RosterLink({ to }: { to: string }) {
  return (
    <Link className="participant-card__link" to={`${to}#room-roster`}>
      전체 방 배정표
    </Link>
  );
}
