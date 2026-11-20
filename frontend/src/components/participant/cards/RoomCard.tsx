import { EmptyNote, HomeCard } from "../HomeCard";

/** 숙소 (§1). G4 fills it from `rooms` under `queryKeys.participantRooms(eventId)`; reloads on `updates.rooms`. */
export function RoomCard() {
  return (
    <HomeCard title="숙소">
      <EmptyNote>방이 정해지면 여기에 보여요.</EmptyNote>
    </HomeCard>
  );
}
