---
title: "Retreat form needs like times, consent and per-day options are settings on the nine types, options can be conditional, and hidden answers are dropped"
author: Claude
date: 2026-11-16
branch: claude/exciting-newton-6cjmsc
cost: { minutes: 9, tokens: 210411 }
id: l-ca29f9b6
scope: repo
status: active
src: agent
touches:
  - docs/devops/hosting-decision.md
  - docs/product/PRODUCT_DECISIONS.md
  - docs/product/form-question-types-review.md
  - docs/README.md
---

## Decided
The new types the reference retreat form needed are settings, not types. Arrival and departure time is DATE or DATE_RANGE with includeTime. Consent is YES_NO with style CONSENT and required. Per-day meal or program choices are options with a group label. A phone or digits-only input is SHORT_TEXT format. Two or three choices shown as buttons is display BUTTONS. Options can carry their own showWhen, so transport choices change with attendance type inside one question and the roster keeps one column. The server recalculates conditions and silently drops answers to hidden questions or hidden options. It does not reject them. After applications arrive, deleting a question hides it so its answers stay on the roster, and changing any showWhen is locked.

## Tried and ruled out
Separate types for date-time and consent: more builder UI and validation code before the December 15 opening. No option-level conditions: operators would copy the transport question per attendance type, which splits the roster column. Rejecting stale answers to hidden questions: a client bug would block a participant from applying. Allowing question delete and condition edits after applications: answers would vanish or stop matching.

## Watch out
Conditions may point only at earlier questions (no cycles), one condition with OR over options, no AND. Hiding a target question hides questions that depend on it.

In the code:
- docs/product/form-question-types-review.md (sections 2, 4, 6, 10), DEC-068 Follow-up in docs/product/PRODUCT_DECISIONS.md
- Issues BeomhyunPark/SCENE#224, #225, #229
