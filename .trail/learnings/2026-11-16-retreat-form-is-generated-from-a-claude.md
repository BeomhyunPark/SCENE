---
title: "Retreat form is generated from a setup card; base questions 이름, 전화, 또래 can be reworded and moved, and 또래 can be turned off"
author: Claude
date: 2026-11-16
branch: claude/tender-gates-nhjpob
cost: { minutes: 1, tokens: 1702 }
id: l-e61c7a27
scope: repo
status: active
replaces: l-fd4e1e8e
src: agent
touches:
  - docs/product/PRODUCT_DECISIONS.md
  - backend/docs/api.md
---

## Decided
Supersedes "SYSTEM 이름 and 전화 stay read-only" and "SYSTEM fields stay first" (DEC-070, issue #244, user decision 2026-11-16). The base questions are 이름, 전화 and 또래. None can be deleted. Their label, description and placeholder can be edited, and they move up and down like any other question. 또래 is the last two digits of the birth year: exactly two digits, required while on, and the only base question that can be turned off. Existing forms got it turned on, right after 전화.

The operator no longer builds the retreat form question by question. They answer a setup card (gender, middle group, cell, partial and worship-only attendance, a per-day meal and worship table, transport modes) and the server generates the questions, options and conditions from it and the event dates. Each generated question has a fixed preset key and each option an id computed from its meaning, so later counts and group assignment find answers after rewording. Generated questions take wording changes only; structure comes from the setup. Building a question by hand stays, folded under "직접 질문 추가". Still true from before: one form per event, DRAFT 신청 열기 activates first, privacy check only warns.

Counting rules, because hidden answers are never stored: a full participant has no meals or lodging answer and counts as attending everything; a participant who drives there has no way-back answer and counts as driving back.

## Tried and ruled out
Gender as a base question: an event that does not ask it would need its own off switch. Removing switched-off options and shrinking the conditions that point at them: turning the switch back on after applications arrive would change a condition and hit the lock, so the attendance and transport questions always keep every option and hide the off ones. A generic minLength setting for the two-digit check: it changes every short-text config. Asking the way back of drivers: duplicate and contradictory answers. Collecting bus place and time on the setup card: the operator writes it in the question description instead.

## Watch out
The setup needs the event's start and end date and at most ten days, because days, nights and worship shuttle rounds are computed from them; without dates the server answers 400 with field eventPeriod and the card explains it (issue #252 tracks editing dates later). After applications arrive, a setup change that alters a stored condition is refused as FIELD_LOCKED; today that is adding or dropping the whole attendance question while the group bus is on. jsonb reorders object keys, so tests compare config by key, not by JSON text. The frontend mock generator is a looser copy of the server one.

In the code:
- backend/src/main/java/app/scene/event/form/FormPreset.java (keys, option ids, conditions), FormSetupPlan.java (regeneration), FormSetup.java, OperatorFormService.putSetup and patchField
- backend/src/main/resources/db/migration/V11__form_setup_and_cohort.sql
- backend/src/test/java/app/scene/event/form/FormSetupHttpIT.java
- frontend/src/components/formBuilder/{SetupCard,WordingEditor,FormPreview}.tsx, frontend/src/mocks/formPreset.ts
- docs/product/PRODUCT_DECISIONS.md DEC-070, backend/docs/api.md "신청서"
