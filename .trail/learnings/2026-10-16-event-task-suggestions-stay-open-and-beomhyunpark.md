---
title: Event task suggestions stay open and honor abort
author: BeomhyunPark
date: 2026-10-16
branch: feat/fe-tasks-c1-suggestions
touches:
  - frontend/src/App.tsx
  - frontend/src/api/queryClient.ts
  - frontend/src/api/queryKeys.ts
  - frontend/src/components/EventHome.tsx
  - frontend/src/components/OperatorShell.tsx
  - frontend/src/mocks/handlers/index.ts
  - frontend/src/mocks/problem.ts
  - frontend/src/test/setup.ts
  - frontend/src/ai/taskSuggestions/durationBucket.test.ts
  - frontend/src/ai/taskSuggestions/durationBucket.ts
---

## Decided
- The suggestion panel opens itself only on the first empty task list, then stays open. Closing it when the first task appears hides "업무 N개를 추가했어요."
- A hanging suggester does not reject when its AbortSignal fires. The panel listens for abort and shows the failure copy. Unmount marks the request dead before aborting, so that abort is not a visible failure.
- A checklist click writes the React checked value back onto the input before the optimistic update. A fast NO_CHANGE response otherwise leaves the jsdom property toggled.

## Tried and ruled out
- Wrapping findByRole in vi.useFakeTimers(). Testing Library waits on timers, so the timeout test never reached the button. Fake only setTimeout after the button is on screen, advance 0 so the event query can schedule the 3s timer, then advance 3000.
- Asserting toBeChecked immediately after clicking an already-checked box. Stub the item PUT as NO_CHANGE and wait until the check is restored.

## Watch out
- The owner task-list query can take longer than Testing Library's 1s default when the whole vitest run is parallel. That assertion waits 4s.
- A full document load resets the MSW operator session. Browser checks after dev login have to stay on client-side navigation.
- Local event 00000000-0000-4000-8000-000000000020 has no seed task. Delete verification tasks before finishing. POST /tasks does not create checklist items.
