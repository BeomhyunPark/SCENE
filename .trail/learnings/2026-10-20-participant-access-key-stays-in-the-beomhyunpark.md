---
title: participant access key stays in the fragment
author: BeomhyunPark
date: 2026-10-20
branch: feat/fe-participant-apply-link
touches:
  - frontend/src/accessKey.ts
  - frontend/src/App.tsx
  - frontend/src/api/applications.ts
  - frontend/src/api/participant.ts
  - frontend/src/api/queryKeys.ts
  - frontend/src/components/PublicApply.tsx
  - frontend/src/components/ParticipantEnter.tsx
  - frontend/src/components/ParticipantFrame.tsx
  - frontend/src/components/ParticipantGate.css
  - frontend/src/components/ParticipantApply.test.tsx
  - frontend/src/components/EventParticipation.tsx
  - frontend/src/components/EventHome.css
  - frontend/src/mocks/participantStore.ts
  - frontend/src/mocks/handlers/participant.ts
  - frontend/src/mocks/formStore.ts
  - frontend/src/mocks/handlers/index.ts
  - frontend/src/test/setup.ts
---

## Decided
- Apply is `/apply/:eventId/:formId`. Return is `/participate/:eventId` and the access key is only in the fragment. The operator copies the key-less apply address, and only while a form is accepting.
- After submit the link is shown once, with copy and 들어가기. 들어가기 posts the key still in memory, then opens `/participate/:eventId` with no hash. The key is not written to localStorage, sessionStorage, the path, or the query.
- The fragment is stripped with `history.replaceState` in the first render, before effects. A module variable holds it for that turn. `exchangeAccessKey` dedupes the session POST so StrictMode does not send it twice. Success calls `releaseAccessKey`.
- After `GET /api/v1/participant/me` the screen is the name plus 로그아웃. An empty name is only "참가 신청이 됐어요." Notices, schedules, event name, eventId, and spaceId stay off this screen.
- These three participant routes already exist, so the MSW handlers are real-shaped and are not marked unverified. SMS and OTP stay out.

## Tried and ruled out
- Storing the key the way the invitation token is stored. The invitation uses localStorage. This key must not.
- A participant home of notices and schedules after `me`. Those reads are not built, and this slice stops at the name and logout.
- A text field where the person pastes the key. A missing session says to come back through the link.

## Watch out
- The seeded Local event form is closed. Do not open accepting or POST an application just to see the success screen. Tests cover the one-time link.
- Do not edit PublicLogin. trail check can flag the App.tsx overlap with the public-login branch and keyword false positives. Leave that behavior as it is.
