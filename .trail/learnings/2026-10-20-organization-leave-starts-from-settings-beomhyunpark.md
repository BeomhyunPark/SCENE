---
title: Organization leave starts from settings
author: BeomhyunPark
date: 2026-10-20
branch: feat/fe-space-leave
touches:
  - frontend/src/App.tsx
  - frontend/src/components/EventList.tsx
  - frontend/src/components/EventList.css
  - frontend/src/components/OperatorShell.tsx
  - frontend/src/components/OperatorShell.css
  - frontend/src/components/SpaceSettings.tsx
  - frontend/src/components/SpaceSettings.css
  - frontend/src/components/SpaceLeave.test.tsx
---

## Decided
- Organization leave starts on `/settings`. The organization sidebar 설정 links there. The page has one danger button, 조직에서 나가기, which opens `/spaces/:spaceId/leave`.
- The event list no longer shows that action. A text link under the list subtitle was too easy to miss.

## Tried and ruled out
- Leaving the action as a brand-colored text link on the event list.
- Painting a raw red link into the list. The danger button on the settings page uses the existing danger variant.

## Watch out
- The 설정 item inside an event sidebar is still a button with no route. Only the organization shell, where `eventName` is absent, links to `/settings`.
- On `/settings`, the 행사 item is not current. Elsewhere in that shell it stays current.
