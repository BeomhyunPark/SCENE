import { ParticipantCheckIn } from "../../ParticipantCheckIn";
import { HomeCard } from "../HomeCard";
import { useParticipantFeed } from "../participantFeed";

/** 도착 QR (§1): the existing participant QR as it is. Reloads on `updates.checkIn`. */
export function CheckInCard() {
  const { eventId } = useParticipantFeed();
  return (
    <HomeCard title="도착 QR">
      <ParticipantCheckIn eventId={eventId} />
    </HomeCard>
  );
}
