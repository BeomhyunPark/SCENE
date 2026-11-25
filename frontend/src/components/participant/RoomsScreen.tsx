import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import type { ParticipantRooms, RosterRoom } from "../../api/participantRooms";
import { EmptyNote } from "./HomeCard";
import { clockText, useParticipantFeed } from "./participantFeed";
import { participantPath } from "./participantTabs";
import { useParticipantRoomsQuery } from "./roomQuery";
import { NOT_LODGING_ASSIGNED, personLine, roomMeta, roomStateNote } from "./roomText";
import "./RoomsScreen.css";

/**
 * 숙소 screen (`/participate/{eventId}/rooms`), opened from the home 숙소 card, so it stays under the
 * 홈 tab (no sixth tab; DEC-085 Follow-up 2026-11-25 G4). It draws one `GET /participant/rooms` answer:
 * my room with everyone in it (name·또래·성별, "나"), then — only with `rosterScope: ALL` — the full
 * table of every room with names·또래, my room marked. No participant id, phone or answer is shown.
 */
export function RoomsScreen() {
  const { eventId } = useParticipantFeed();
  const query = useParticipantRoomsQuery(eventId);
  const data = query.data;
  const { hash } = useLocation();
  const ready = Boolean(data?.rooms);
  useEffect(() => {
    if (hash === "#room-roster" && ready) document.getElementById("room-roster")?.scrollIntoView?.({ block: "start" });
  }, [hash, ready]);

  let body;
  if (!data) {
    body = <EmptyNote>{query.isError ? "숙소를 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요." : "불러오는 중이에요."}</EmptyNote>;
  } else {
    body = (
      <>
        {query.isError ? (
          <p className="participant-card__failed" role="status">
            최신 숙소를 불러오지 못했어요. 지난 내용을 보여 드려요.
          </p>
        ) : null}
        <MyRoomSection data={data} />
        {data.rooms ? <RosterSection rooms={data.rooms} myRoomId={data.myRoom?.roomId ?? null} /> : null}
        {data.publishedAt ? <p className="participant-room__updated">{publishedText(data.publishedAt)} 공개</p> : null}
      </>
    );
  }
  return (
    <div className="participant-tab">
      <Link className="participant-card__link" to={participantPath(eventId, "home")}>
        ← 홈
      </Link>
      <h1 className="participant-tab__title">숙소</h1>
      {body}
    </div>
  );
}

function MyRoomSection({ data }: { data: ParticipantRooms }) {
  const room = data.myRoom;
  if (data.status !== "ASSIGNED" || !room) {
    return (
      <section className="participant-card" aria-labelledby="my-room-title">
        <h2 id="my-room-title" className="participant-card__title">
          내 방
        </h2>
        <EmptyNote>{roomStateNote(data)}</EmptyNote>
      </section>
    );
  }
  const meta = roomMeta(room);
  return (
    <section className="participant-card" aria-labelledby="my-room-title">
      <h2 id="my-room-title" className="participant-card__title">
        내 방
      </h2>
      <p className="participant-card__event">{room.name}</p>
      {meta ? <p className="participant-card__meta">{meta}</p> : null}
      {room.members ? (
        <>
          <h3 className="participant-room__subtitle">같은 방 {room.members.length}명</h3>
          <ul className="participant-room__people" aria-label="같은 방 사람">
            {room.members.map((member, index) => (
              <li key={`${index}-${member.name}`} className="participant-room__person">
                <span>{personLine(member)}</span>
                {member.me ? <span className="participant-room__badge">나</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.notLodging ? <p className="participant-card__meta">{NOT_LODGING_ASSIGNED}</p> : null}
    </section>
  );
}

function RosterSection({ rooms, myRoomId }: { rooms: RosterRoom[]; myRoomId: string | null }) {
  return (
    <section className="participant-room__roster" id="room-roster" aria-labelledby="room-roster-title">
      <h2 id="room-roster-title" className="participant-room__roster-title">
        전체 방 배정표 <span className="participant-room__count">방 {rooms.length}개</span>
      </h2>
      {rooms.length === 0 ? <EmptyNote>공개된 방이 없어요.</EmptyNote> : null}
      <ul className="participant-room__rooms">
        {rooms.map((room) => {
          const mine = room.roomId === myRoomId;
          const meta = roomMeta(room);
          return (
            <li key={room.roomId} className={`participant-room__room${mine ? " participant-room__room--mine" : ""}`} aria-label={`${room.name}${mine ? " (내 방)" : ""}`}>
              <div className="participant-room__room-head">
                <span className="participant-room__room-name">{room.name}</span>
                {mine ? <span className="participant-room__badge">내 방</span> : null}
                <span className="participant-room__count">{room.members.length}명</span>
              </div>
              {meta ? <p className="participant-room__room-meta">{meta}</p> : null}
              {room.members.length === 0 ? (
                <p className="participant-room__room-meta">아직 배정된 사람이 없어요.</p>
              ) : (
                <p className="participant-room__names">{room.members.map((member) => personLine(member)).join(", ")}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function publishedText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
  return `${day} ${clockText(date.getTime())}`;
}
