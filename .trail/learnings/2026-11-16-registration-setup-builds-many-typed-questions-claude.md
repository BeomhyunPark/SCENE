---
title: Registration setup builds many typed questions; open applications still go through activation and privacy checks only warn
author: Claude
date: 2026-11-16
branch: claude/exciting-newton-6cjmsc
cost: { minutes: 13, tokens: 130682 }
id: l-fd4e1e8e
scope: repo
status: active
replaces: l-fc51cd
src: agent
touches:
  - backend/docs/api.md
  - backend/src/main/java/app/scene/event/form/FormDetail.java
  - backend/src/main/java/app/scene/event/form/OperatorFormService.java
  - backend/src/test/java/app/scene/ApplicationContextIT.java
  - backend/src/test/java/app/scene/event/application/PublicApplicationSubmitHttpIT.java
  - backend/src/test/java/app/scene/event/form/FormCommandHttpIT.java
  - docs/product/PRODUCT_DECISIONS.md
  - docs/product/form-question-types-review.md
  - backend/src/main/java/app/scene/common/error/ErrorCode.java
  - backend/src/main/java/app/scene/event/application/AnswerEvaluator.java
---

## Decided
The setup screen still uses the form API, and an event still has one form. SYSTEM 이름 and 전화 stay read-only. The one-CUSTOM limit is gone (DEC-068, 2026-11-16): operators add any number of questions of nine types, with options, required, description, show conditions, and order (move up and down among CUSTOM questions). The operator form detail has `locked`. Once it is true, the builder disables type change, deleting a stored option, and condition edits, and it offers 숨기기 instead of 삭제. DRAFT 신청 열기 still confirms, activates with expectedLifecycleVersion, then sets acceptingApplications. The privacy check still takes only {label} and warns without blocking. It now runs on the label, the description, and every option label.

## Tried and ruled out
Keeping one CUSTOM question: the January retreat needs dozens, many of them conditional.

## Watch out
A full page reload wipes the browser MSW store and the mock login. Drive mock checks with in-app navigation. Playwright name matches are partial: "질문" also matches "질문 추가", and "보기 1" also matches "보기 1 묶음", so use exact names. The mock form store mirrors the server rules loosely. The backend IT is the source of truth.

In the code:
- frontend/src/components/EventRegistrationSetup.tsx, frontend/src/components/formBuilder/{QuestionEditor,ConditionPicker}.tsx, questionDraft.ts
- frontend/src/mocks/formStore.ts (updateField, reorderFields, markSubmitted), frontend/src/api/forms.ts
