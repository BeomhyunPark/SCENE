import { CheckInCard } from "./cards/CheckInCard";
import { EventHeadCard } from "./cards/EventHeadCard";
import { GroupCard } from "./cards/GroupCard";
import { LatestNoticesCard } from "./cards/LatestNoticesCard";
import { MealCard } from "./cards/MealCard";
import { NowNextCard } from "./cards/NowNextCard";
import { RoomCard } from "./cards/RoomCard";
import { useParticipantFeed } from "./participantFeed";

/**
 * The home cards in the contract's order (§1). An area that is off has no card. Each card reads its
 * own path and fails on its own. A new card goes in its own file under `cards/` and one line here.
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
      {features?.mealOrder ? <MealCard /> : null}
    </div>
  );
}
