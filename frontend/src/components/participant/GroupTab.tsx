import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
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
  const { pathname } = useLocation();
  // Coming from the home card (scrolled under the QR) or from a member, start at the top so the
  // leader sees 미도착 on the first screen.
  // "instant": the page has `scroll-behavior: smooth`, which would still show the old place while it moves.
  useEffect(() => {
    document.documentElement.scrollTo?.({ top: 0, behavior: "instant" });
  }, [pathname]);
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
