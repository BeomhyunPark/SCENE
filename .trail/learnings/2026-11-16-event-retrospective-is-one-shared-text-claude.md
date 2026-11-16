---
title: "Event retrospective is one shared text saved with a version, only while the event is ended"
author: Claude
date: 2026-11-16
branch: claude/applicant-list-with-names-24mq1y
cost: { minutes: 12, tokens: 528985 }
id: l-2f5bf4d9
scope: repo
status: active
src: agent
touches:
  - docs/test_results/retrospective-1-saved.png
  - frontend/src/components/EventEnd.test.tsx
  - frontend/src/components/EventFlow.css
  - frontend/src/components/EventRetrospective.test.tsx
  - frontend/src/components/EventRetrospective.tsx
  - frontend/src/api/retrospective.ts
  - frontend/src/mocks/formStore.ts
  - frontend/src/mocks/handlers/lifecycle.ts
  - frontend/src/mocks/handlers/retrospective.ts
  - frontend/src/mocks/problem.ts
---

## Decided
- One retrospective per event, saved by PUT with expectedVersion (user decision 2026-11-16, #237, DEC-067 Follow-up). A stale version is 409 CONCURRENT_MODIFICATION with the current version; the screen keeps the draft and offers "최신 내용 불러오기" instead of auto-refetching, so a second save cannot silently overwrite.
- Write needs effective EVENT_UPDATE and an ENDED event; read is EVENT_READ or space OWNER/ADMIN. A missing retrospective is 200 with text "" and version 0, so the client no longer treats 404/500 as empty.
- Audit row EVENT_RETROSPECTIVE_UPDATED carries only the version; the text never goes to audit or logs.

## Watch out
- The MSW mock had no POST /end; tests stubbed it per case. A browser check of end → retrospective needs the mock /end added here.
- Old retrospective tests stubbed only the event GET as ENDED while the mock store stayed DRAFT; with a real state check the PUT returns 409. Set the store lifecycle with setLifecycle instead.
- This session cannot run google-java-format; new Java was hand-formatted (100 cols, params one per line when they do not fit on one continuation line, javadoc greedy-filled). Check CI spotless first if it fails.

In the code: backend/src/main/java/app/scene/event/retrospective/RetrospectiveService.java, backend/src/main/resources/db/migration/V8__event_retrospectives.sql, frontend/src/components/EventRetrospective.tsx, frontend/src/mocks/retrospectiveStore.ts, frontend/src/mocks/formStore.ts (endEvent)
