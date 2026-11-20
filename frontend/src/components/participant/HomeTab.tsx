import { CheckInCard } from "./cards/CheckInCard";
import { EventHeadCard } from "./cards/EventHeadCard";
import { GroupCard } from "./cards/GroupCard";
import { LatestNoticesCard } from "./cards/LatestNoticesCard";
import { NowNextCard } from "./cards/NowNextCard";
import { RoomCard } from "./cards/RoomCard";
import { useParticipantFeed } from "./participantFeed";

/**
 * The home cards in the contract's order (§1). An area that is off has no card. Each card reads its
 * own path and fails on its own. A new card goes in its own file under `cards/` and one line here.
 * There is no 다음 식사 card: meal order is out of the January scope (user decision 2026-11-20), so
 * `features.mealOrder` and `updates.mealOrder` are ignored even if the server sends them.
 */
export function HomeTab() {
  const { features } = useParticipantFeed();
  return (
    <div className="participant-home">
      <EventHeadCard />
      {features?.schedule ? <NowNextCard /> : null}
      {features?.notices ? <LatestNoticesCard /> : null}
      <CheckInCard />
      {features?.groups ? <GroupCard /> : null}
      {features?.rooms ? <RoomCard /> : null}
    </div>
  );
}
