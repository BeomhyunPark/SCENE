---
title: "Registration question answers keep the shapes already built, locked edits use one FIELD_LOCKED code, and hidden questions stay in the CSV marked hidden"
author: Claude
date: 2026-11-16
branch: claude/magical-noether-hrkn1d
cost: { minutes: 3, tokens: 106869 }
id: l-0eeeddb0
scope: repo
status: active
src: agent
touches:
  - docs/product/PRODUCT_DECISIONS.md
---

## Decided
DEC-068 (issue #224) records the registration question policy docs-only from main. The user kept the answer shapes that the earlier branch built and tested: single choice and dropdown store {"optionId"} or {"other"}, multiple choice {"optionIds":[...],"other"}, date {"date"} or {"dateTime"} when time is on, yes/no {"value": bool}. A form locks once it has one SUBMITTED application. Locked edits (type change, removing an existing option, changing showWhen on a question or option, deleting a question) all return 409 FIELD_LOCKED, one code. After the lock, deleting a question means hiding it. A hidden question stays a column in the original view and the CSV with "(숨김)" after its title. A hidden option that was already chosen shows its text plus "(숨김)". Required, description, order and range changes stay allowed and apply to new submissions only.

## Tried and ruled out
Making all three choice types {"optionIds"} and yes/no {"bool"}: tidier for conditions and CSV, but the server AnswerEvaluator and frontend answerModel are already built on the other shapes, and the 12/10 deadline is close. One error code per locked action: the builder already disables locked controls. Leaving hidden questions out of the CSV: collected answers would disappear from it.

## Watch out
The earlier branch claude/exciting-newton-6cjmsc holds the implementation, but its migration is V8, which main already used for retrospectives. #225 must renumber it to V9 and bump the pinned Flyway version check. The #224 issue body still says "defer conditional questions". That predates the user's decision and is not followed.

In the code:
- docs/product/PRODUCT_DECISIONS.md DEC-068 (config keys, answer shapes, lock table, hidden handling)
- Implementation reference: origin/claude/exciting-newton-6cjmsc FieldRules.java, AnswerEvaluator.java, V8__field_answer_types.sql
