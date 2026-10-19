---
title: Operator leave keeps event names off the preview
author: BeomhyunPark
date: 2026-10-19
branch: feat/fe-space-leave
touches:
  - frontend/src/App.tsx
  - frontend/src/api/events.ts
  - frontend/src/api/leave.ts
  - frontend/src/api/queryKeys.ts
  - frontend/src/components/EventList.tsx
  - frontend/src/components/EventList.css
  - frontend/src/components/OperatorShell.css
  - frontend/src/components/SpaceLeave.css
  - frontend/src/components/SpaceLeave.test.tsx
  - frontend/src/components/SpaceLeave.tsx
---

## Decided
- `/spaces/:spaceId/leave` is inside `RequireOperator`. The event list links there with 조직에서 나가기.
- Preview is `eventId`, `isOwner`, `handoverAccepted`, and `openTasks` only. Names come from `GET /spaces/{spaceId}/events`. The rows do not show a date or a lifecycle status. The default choice is 그만 보기.
- An owner row and a `handoverAccepted` row stay on 그만 보기. The server rejects those ids in `keepEventIds`. There is no Owner 넘기기 button and no 업무 넘기기 button.
- `OWNER_ROLE_HELD` stays on the row screen and cannot submit. `HANDOVER_NOT_ACCEPTED`, `LAST_OWNER`, and `RESPONSIBILITY` replace the picker. A 400 whose field is `keepEventIds` clears the selection and reloads the preview. A 409 uses the same block screen.
- After leave, zero kept events go to `/find-organization`. One or more kept events show 나갔어요 and the count, then 조직 찾기. Do not list the kept events. The space event list is `NOT_A_MEMBER` after leave.

## Tried and ruled out
- Reading a kept-event list after leave.
- Putting handoff buttons on the block screens. Those screens are not in this slice, and a button with nowhere to go is a dead control.

## Watch out
- Do not submit leave for the local seed owner. That user is the last owner, so the screen is the block. Local staff can open the picker. A browser check should cancel before POST.
- A disabled TanStack query reports `isPending`. Wait for event names only when the preview actually has events.
