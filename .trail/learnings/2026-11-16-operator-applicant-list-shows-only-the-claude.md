---
title: "Operator applicant list shows only the name, and each application opens on its own address"
author: Claude
date: 2026-11-16
branch: claude/applicant-list-with-names-24mq1y
cost: { minutes: 10, tokens: 189826 }
id: l-1bf91848
scope: repo
status: active
src: agent
touches:
  - docs/test_results/applicant-list-1-empty.png
  - docs/test_results/applicant-list-2-list.png
  - docs/test_results/applicant-list-3-detail.png
  - frontend/src/App.tsx
  - frontend/src/components/EventApplication.tsx
  - frontend/src/components/EventHome.css
  - frontend/src/components/EventParticipation.test.tsx
  - frontend/src/components/EventParticipation.tsx
  - frontend/src/components/eventFormat.ts
  - frontend/src/api/applications.ts
---

## Decided
- The operator list item carries `name` only: the SYSTEM NAME answer text, or null when that answer is missing. Phone and CUSTOM answers are read on the detail only (user decision 2026-11-16 on #220). The screen shows "이름 없음" for null.
- The detail opens at `/events/:eventId/participants/:applicationId`, like task detail under the task list, so refresh and back work. The address holds only the application id.
- The screen follows EventHome.css. Figma P03 참가 현황 (265:10288) exists but is built around phone, group, and status-filter columns, which this slice keeps out.

## Tried and ruled out
- Calling the detail per list item to fill names (50 requests a page), a list without names, and name plus phone on the list.

## Watch out
- The list query joins applications as `app`, so the order constant must stay alias-qualified (`app.submitted_at ASC, app.id ASC`); a bare `id` is ambiguous.
- MSW stores are in memory, so a browser check must move with history.pushState + popstate, not page.goto, or the submitted applications vanish. Going from one apply screen to the same route again keeps the success state, so step through another route between submits.

In the code: backend/src/main/resources/mapper/ApplicationQueryMapper.xml (findPage), frontend/src/components/EventParticipation.tsx, frontend/src/components/EventApplication.tsx, frontend/src/mocks/handlers/applications.ts
