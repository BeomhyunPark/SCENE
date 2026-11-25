import { deskRoomText, type DeskRoom, type Lodging } from "../api/deskRoom";
import "./FieldRoomLine.css";

/**
 * The published room on a 현장 운영 roster row (G5 #460, DEC-085 §10): "방 301호 · 본관 3층", or 숙박 안 함
 * for someone who sleeps no night. Nothing before the room publication or for a lodging person
 * without a room, so the row reads as before.
 */
export function FieldRoomLine({ room, lodging }: { room: DeskRoom | null; lodging: Lodging | null }) {
  const text = deskRoomText(room, lodging);
  if (!text) return null;
  return (
    <p className={room ? "field-room" : "field-room field-room--away"}>
      {room ? <span className="field-room__label">방</span> : null}
      {text}
    </p>
  );
}

