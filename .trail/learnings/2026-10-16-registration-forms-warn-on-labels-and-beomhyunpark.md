---
title: Registration forms warn on labels and open only after activation
author: BeomhyunPark
date: 2026-10-16
branch: feat/fe-form-builder-c7-privacy
touches:
  - frontend/src/api/queryKeys.ts
  - frontend/src/components/EventRegistrationSetup.tsx
  - frontend/src/mocks/handlers/index.ts
  - frontend/src/mocks/operatorStore.ts
  - frontend/src/mocks/problem.ts
  - frontend/src/mocks/taskStore.ts
  - frontend/src/test/setup.ts
  - frontend/src/ai/fieldPrivacy/index.ts
  - frontend/src/ai/fieldPrivacy/localRuleChecker.test.ts
  - frontend/src/ai/fieldPrivacy/localRuleChecker.ts
---

## Decided
The setup screen uses the form API. An event has one form. SYSTEM 이름 and 전화 stay read-only, and there is at most one CUSTOM label. DRAFT 신청 열기 confirms, calls activate with expectedLifecycleVersion, then sets acceptingApplications. ACTIVE skips activate. ENDED and ARCHIVED hide that button. checkFieldPrivacy takes only {label}, warns, and never blocks the save. The mock OWNER permission list includes FORM_WRITE, matching RoleDefaults. MANAGER does not.

## Tried and ruled out
Keeping the static card "이름 · 연락처 · 참석 여부". Sending the event or the answer into the privacy check.

## Watch out
A browser check that creates an event has to delete that event's fields, form, lifecycle transition, audit row, and membership. The seed Local event stays DRAFT with no form. Playwright's accessible name match includes a longer name, so the confirm control needs an exact name.
