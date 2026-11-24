import { Navigate, Route, Routes, useParams } from "react-router";
import { ParticipantGroup } from "../ParticipantGroup";
import { GroupMemberDetail } from "./GroupMemberDetail";
import { useParticipantFeed } from "./participantFeed";
import { participantPath } from "./participantTabs";

/**
 * 내 조 tab (`/participate/{eventId}/group`): the 내 조 view, and for a leader 조원 현황 with one member
 * opening at `group/members/{participantId}` (F3, DEC-083). The phone's back button returns to the list.
 */
export function GroupTab() {
  const feed = useParticipantFeed();
  const { eventId, name } = feed;
  return (
    <div className="participant-tab">
      <Routes>
        <Route index element={<ParticipantGroup eventId={eventId} name={name} serverOffsetMs={feed.poll.serverOffsetMs} />} />
        <Route path="members/:participantId" element={<MemberRoute eventId={eventId} />} />
        <Route path="*" element={<Navigate to={participantPath(eventId, "group")} replace />} />
      </Routes>
    </div>
  );
}

function MemberRoute({ eventId }: { eventId: string }) {
  const { participantId = "" } = useParams();
  return <GroupMemberDetail key={participantId} eventId={eventId} participantId={participantId} />;
}
