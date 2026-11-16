---
title: "Registration questions get nine answer types and conditional display in the first round, and type changes lock once applications arrive"
author: Claude
date: 2026-11-16
branch: claude/exciting-newton-6cjmsc
cost: { minutes: 1, tokens: 6051 }
id: l-11b977ed
scope: repo
status: active
src: agent
touches:
  - backend/src/main/resources/db/migration/V3__forms.sql
---

## Decided
First round (needed for a real retreat in January 2027) ships nine types: short text, long text, single choice, multiple choice, dropdown, date, date range, number, yes/no. It also ships conditional display: a question shows only when an earlier answer matches. The reference retreat form showed about 28 of 35 questions depend on earlier answers (attendance type, then transport, then carpool). Options get stable ids and answers store ids. Once a form has submitted applications, titles, descriptions, and adding or hiding options stay editable. Changing a type or deleting an option is locked. Hidden questions skip validation and store no answer. The C7 privacy warning also checks option text, warns only.

## Tried and ruled out
Four or six types only: dates would come in as free text. Deferring conditional questions: the reference retreat form cannot be built without them. Allowing every edit with a warning: breaks existing answers. Locking everything: operators cannot fix a typo.

## Watch out
fields_one_custom allows one CUSTOM field. The migration drops it and moves existing CUSTOM fields to SHORT_TEXT. Conditions may point only at earlier questions, to avoid cycles.

In the code:
- backend/src/main/resources/db/migration/V3__forms.sql (fields, fields_one_custom); answers.value is already jsonb (V4__applications.sql)
- Planned V8: answer_type, required, description, config jsonb on fields
- Issues: BeomhyunPark/SCENE#223 parent, #224–#229 sub-issues; reference analysis in #223 comments
