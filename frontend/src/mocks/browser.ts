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
