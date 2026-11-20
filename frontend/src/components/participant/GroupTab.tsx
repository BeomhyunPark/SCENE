import { ParticipantGroup } from "../ParticipantGroup";
import { useParticipantFeed } from "./participantFeed";

/** 내 조 tab (`/participate/{eventId}/group`): the existing 내 조 view. F3 adds the member list here. */
export function GroupTab() {
  const { eventId, name } = useParticipantFeed();
  return (
    <div className="participant-tab">
      <ParticipantGroup eventId={eventId} name={name} />
    </div>
  );
}
