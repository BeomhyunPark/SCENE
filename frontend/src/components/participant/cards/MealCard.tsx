import { EmptyNote, HomeCard } from "../HomeCard";

/**
 * 다음 식사 (§1). H4 fills it from `schedule` + `meal-order` under `queryKeys.participantMealOrder(eventId)`;
 * reloads on `updates.mealOrder` (and `updates.schedule` through the schedule key).
 */
export function MealCard() {
  return (
    <HomeCard title="다음 식사">
      <EmptyNote>식사 순서가 정해지면 여기에 보여요.</EmptyNote>
    </HomeCard>
  );
}
