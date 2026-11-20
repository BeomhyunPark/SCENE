import { EmptyNote, HomeCard } from "../HomeCard";

/**
 * 숙소 (§1, room-contract §10.1). G4 fills it from `GET /participant/rooms` under
 * `queryKeys.participantRooms(eventId)` with `participantCardQuery`; it reloads on `updates.rooms`.
 * Until then it is the `NOT_PUBLISHED` empty state.
 */
export function RoomCard() {
  return (
    <HomeCard title="숙소">
      <EmptyNote>숙소가 정해지면 여기에 보여요.</EmptyNote>
    </HomeCard>
  );
}
