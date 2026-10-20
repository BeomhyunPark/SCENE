---
title: event end stays on the ended home
author: BeomhyunPark
date: 2026-10-20
branch: feat/fe-event-end-flow
touches:
  - frontend/src/App.tsx
  - frontend/src/api/lifecycle.ts
  - frontend/src/api/queryKeys.ts
  - frontend/src/components/EventHome.css
  - frontend/src/components/EventHome.tsx
  - frontend/src/components/OperatorShell.css
  - frontend/src/mocks/handlers/index.ts
  - frontend/src/test/setup.ts
  - frontend/src/api/retrospective.ts
  - frontend/src/components/EventEnd.test.tsx
---

## Decided
- Ending an event opens the ended home. Reopen, archive, and data management stay off this screen.
- The end action starts at 행사 설정. A direct /events/:id/end address returns there unless the event is already ended or archived.
- Only an event owner can end. The client does not show or send override.reason. A 403 stays on the permission screen and hides the problem detail.
- Open tasks come back as CONFIRMATION_REQUIRED. The second submit sends acknowledgeWarnings. A version conflict asks the operator to reload.
- Retrospective is provisional: GET and PUT /api/v1/operator/events/{eventId}/retrospective with {text}, marked unverified. Writing is only while ENDED. An archived event, and a reopened active event, are read-only.
- The mock answers 404 when nothing is stored. The running API catch-all answers 500 unexpected with no code for this missing route. The client treats both as no retrospective yet and does not claim the save reached the server.

## Tried and ruled out
- Replacing activateEvent with endEvent. Opening applications still activates a draft through that function.
- Treating only HTTP 404 as an empty retrospective. This server never returns 404 for the missing route, so the screen stayed on the load error.

## Watch out
- Do not end the seeded Local event from the browser. In this database it is already ACTIVE.
- trail check can flag the App.tsx overlap with the public-login branch and keyword false positives. Leave the behavior as it is.
