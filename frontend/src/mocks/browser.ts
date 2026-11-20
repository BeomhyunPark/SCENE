import { setupWorker } from "msw/browser";
import { localEvent } from "./fixtures/seed";
import { seedLargeGroupBoard } from "./groupStore";
import { handlers } from "./handlers";

/**
 * Mock-click seam for 조 편성 (#301): open any page with `?mockGroups=150` (people) and optionally
 * `&mockGroupCount=15` to load the local event with a retreat-sized roster instead of the small seed.
 */
const params = new URLSearchParams(window.location.search);
const size = Number(params.get("mockGroups"));
if (Number.isInteger(size) && size > 0) {
  const groups = Number(params.get("mockGroupCount") ?? "15");
  seedLargeGroupBoard(localEvent.eventId, Math.min(size, 500), Number.isInteger(groups) ? Math.min(groups, 100) : 15);
}

export const worker = setupWorker(...handlers);

/**
 * Mock-click seams (VITE_API_MOCK=1 dev only; this file is never in a production bundle). The mock
 * stores live in the page, so a click-through sets them up here and moves with in-app navigation.
 * Groups are published from the 조 편성 screen itself (#302); `sceneMock.groups` is the same store.
 */
void Promise.all([
  import("./formStore"),
  import("./operatorStore"),
  import("./participantStore"),
  import("./groupStore"),
  import("./operationStore"),
  import("./taskStore"),
  import("./participantFeedStore"),
  import("./scheduleStore"),
]).then(([forms, operator, participants, groups, operations, tasks, feed, schedule]) => {
  Object.assign(window, { sceneMock: { forms, operator, participants, groups, operations, tasks, feed, schedule } });
});
