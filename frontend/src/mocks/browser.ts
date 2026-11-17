import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Mock-click seams (VITE_API_MOCK=1 dev only; this file is never in a production bundle). The mock
 * stores live in the page, so a click-through sets them up here and moves with in-app navigation.
 * `sceneMock.groups.publishMockGroupsFromApplicants(eventId)` publishes groups for the participant
 * "내 조" screen until the operator group board mock (#301) can publish them.
 */
void Promise.all([
  import("./formStore"),
  import("./operatorStore"),
  import("./participantStore"),
  import("./participantGroupStore"),
]).then(([forms, operator, participants, groups]) => {
  Object.assign(window, { sceneMock: { forms, operator, participants, groups } });
});
