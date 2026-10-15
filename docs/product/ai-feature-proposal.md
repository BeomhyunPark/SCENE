# SCENE: AI Feature Proposal (MVP+AI)

> **Decision: see [DEC-066](PRODUCT_DECISIONS.md#dec-066--scene은-ai-기능을-포함하고-첫-ai-범위는-c1과-c7이다); C1 and C7 selected.** Recorded 2026-10-15 (현, CONFIRMED). C2–C6 and C8 are backlog; C3 stays code-only with no AI. The open items in §5 that DEC-066 does not decide stay OPEN there. The text below is the original proposal, kept as written; its "Nothing was written to the repo" status describes the proposal before this file was added, and the box-context files in §6 (`/workspace/scene/...`) are not in the repo.

- **Status:** PROPOSAL for 현. Docs only. Nothing was written to the repo (no comments, branches, PRs or issues).
- **Date:** 2026-10-15 (KST). **Repo baseline:** `BeomhyunPark/SCENE` `main` @ `94be076` (2026-10-15 15:28 KST), local clone pulled; issue #107 read via GitHub MCP.
- **Labels:** **[Repo]** = stated in a repo file/issue. **[Jev docs]** = confirmed on docs.typesafe.ai. **[Vendor claim]** = TypeSafe blog/marketing, not docs. **[Unverified]** = could not confirm. **[Proposal]** = our recommendation. **[Legal]** = needs legal review.

## 1. Context

**Goal [Proposal].** 현 decided on 2026-10-15 that SCENE must ship AI features for adoption. This doc picks AI features that make the first real event easier without breaking confirmed privacy and "human decides" rules.

**Constraints [Repo]**
- SCENE is a church *event* operations platform, not a CMS (DEC-001/002). "AI 기능 포함 여부" is still listed as OPEN (`PRODUCT_DECISIONS.md` §17, `PRODUCT_DEFINITION.md`). 현's 10/15 decision is **not yet recorded** as a DEC.
- The system must not take over human judgment on relationships, care, safety or exceptions. Group assignment assumes **no algorithmic assignment** and puts privacy and data minimization first (`PRODUCT_DEFINITION.md` §5.5; API §11 "자동 편성을 확정하지 않는다").
- Not Used ≠ Incomplete (DEC-025). The product is not hard-coded to one event type (DEC-003).
- The church is the controller (개인정보처리자) for participant data and SCENE is the processor (수탁자). For operator account data, SCENE is the controller (DEC-061).
- DEC-060: event-only collaborators see other operators' names and roles only. Contacts stay hidden, and no GRANT unlocks them. Participant contact is a separate endpoint (`GET /participants/{id}/contact`, `PARTICIPANT_CONTACT_READ`, `CONTACT_VIEW` privacy log; API §6).
- DEC-064: the participant access key sits in the link fragment and is stripped with `history.replaceState` before any analytics or third-party script runs. It never goes into logs or URLs.
- Data classes are `PUBLIC / INTERNAL / PERSONAL / SENSITIVE / SECURITY` (security-privacy §5).
- 현 writes the code with a coding agent. AI features therefore need small, typed integration surfaces.

**What exists in code today [Repo]** (`backend/src`, `backend/docs/api.md`)
- Built: operator auth; lifecycle (`/activate|end|reopen|archive|unarchive`); invitations (`POST /events/{id}/invitations`, `/invitations/preview|accept`); operators and permissions; tasks (`GET/POST/PATCH/DELETE /tasks`, `PUT /tasks/{t}/items/{i}`, `/complete`, `/reopen`); forms and fields; public application submit; operator application read; `POST /public/events/{id}/participant-sessions`.
- Not built: groups, check-in, notices/schedules, exports, retrospective save, and an HTTP route for adding checklist items ("체크 항목 추가 HTTP 없음"). #107 says calls missing from the contract are mocked as "서버 미검증".

**Jev versus a general LLM**

| | TypeSafe Jev | General LLM (e.g. a Korean-capable chat model) |
|---|---|---|
| What it returns | **[Jev docs]** A "System One" model. Takes a `state` (text/JSON) plus typed questions and returns typed answers: `choice` (+probabilities, confidence), `score` (+probabilities, confidence), `noul` (0–1). **No text generation**, no code, no reasoning explanations. Choice max 255 options. Endpoint `POST https://api.typesafe.ai/v1/systemone` | Free text (can also do JSON with parsing and validation) |
| Fit for SCENE | Classification, routing, scoring, guardrails over **human-written Korean options** | Drafting Korean prose (summaries, notice drafts) |
| Price | **[Jev docs]** $0.042 per Mtok input; output tokens free (Jev 1.13 and 1.14). 64k per-request / 32k per-question context | Varies by vendor; not evaluated here |
| Speed | **[Jev docs]** "fast"; questions in one call run in parallel. **[Vendor claim]** 70–500 ms end to end, measured from the US West Coast | Typically seconds |
| Input | **[Jev docs]** Text, JSON, arrays of text. Images exist only as a "Dreamer-ready", not-production preview behind a `TypeSafe-Danger-Zone-Images` header | Text (+ multimodal for some) |
| Korean | **[Jev docs]** "English is the primary training language… CJK scripts are handled but not equally well; test on your own content… pay close attention to Confidence" | Vendor-dependent; generally stronger for Korean generation |
| Known weak spots | **[Jev docs]** (1.13 jaggedness) literal reading, counting/math, date comparison, large irrelevant state, adversarial content, Choice option-order bias, generation | Hallucination, format drift, higher cost/latency |
| Data | **[Jev docs]** Not trained on customer data. DPA: TypeSafe is processor, retention "as long as necessary", 72h breach notice, subprocessors at trust.typesafe.ai, EU SCC/UK transfer terms. ZDR **enterprise only** | Vendor-dependent |
| Access | **[Vendor claim]** Early access with a waitlist from 2026-09-15 (blog). **Official @typesafeai post, 2026-09-21 06:30 KST: "Jev is now available to everyone. No waitlist."** The Dev Lead's "waitlisted" description is **outdated** | — |

## 2. Candidate features

All candidates follow one rule **[Proposal]**: the AI suggests and a person confirms. No AI output writes state by itself. Each one has an org-level off switch (§5) and degrades to today's manual screen.

### C1. Starter task suggestions at event setup (operator)
- **Screen/flow [Repo]:** minimal event creation (S01 행사 작성, F03 "name, dates, place, optional type") → event home → tasks (D02).
- **Value / adoption:** removes the blank-page problem. The operator gets a short list of suggested prep tasks with checklists to accept or skip, so the first session shows value in minutes.
- **Model:** **Jev.** A Choice/Noul per item in a **SCENE-curated Korean task library**, given event name, type, dates and place. Text comes from the library, so no Korean generation is needed. An LLM would only be needed to invent new tasks (not recommended).
- **Input / privacy:** event metadata only (INTERNAL). No participant PII, no contacts, so DEC-060 is untouched. Church org name not needed; send event type + duration bucket computed in code (dates stay in code, per Jev date weakness). Processing contract unaffected (no personal data), but list TypeSafe in SCENE's vendor list.
- **Effort / deps:** **M.** Uses `POST /tasks` (exists). Needs a **new checklist-item create endpoint** (missing) and the curated library. Must respect DEC-025: suggestions are optional and never appear as "incomplete".
- **Fallback UX:** the panel "추천 업무" shows a loading state with a short timeout, then "추천을 불러오지 못했어요 · 직접 추가". Low-confidence items are unchecked by default. Nothing is created until the operator presses [선택한 업무 추가].

### C2. Pre-end readiness triage (operator, End flow)
- **Screen/flow [Repo]:** end flow L05 → `POST /events/{id}/end` → 409 `CONFIRMATION_REQUIRED` warning screen (`840:44422`, #32). Warning counts are open tasks, unsettled, unassigned and unsent (DEC-063 L4, DEC-050).
- **Value / adoption:** turns "N open tasks" into two groups: "끝내기 전에 확인 권장" and "종료 후에 해도 됨" (ENDED still allows task writes, DEC-062). The Owner can end with confidence.
- **Model:** **Jev.** One Noul per open task title + checklist progress. No generation.
- **Input / privacy:** task titles and status (INTERNAL). Titles can contain names, e.g. "김민수 회비 확인". Redact Korean person names and phone patterns in code first, and drop the assignee name (operator data; DEC-060). Low PII.
- **Effort / deps:** **S.** `GET /tasks`, `GET /lifecycle` exist. Front-end only grouping plus one server call.
- **Fallback UX:** if Jev is down or slow, show today's plain warning list (DEC-063 behavior). Grouping is labelled "참고용". The end command and the `acknowledgeWarnings` contract are unchanged.

### C3. Group assignment (D04) balance hints (operator)
- **Screen/flow [Repo]:** D04 v2 조 편성 board (working copy vs published, DEC-040/041/046; issue #16). The group API is **not built**, and **leader identity is an OPEN blocker** (API §20 #7).
- **Value / adoption:** high perceived value ("AI 조 편성"), but it **conflicts with §5.5** (no algorithmic assignment; tacit and relationship knowledge).
- **Model:** **Neither for v1.** Balance checks (size, partial attendance, gender/age distribution if collected) are exact arithmetic, so do them **in code**. Jev's docs say counting and math are weak.
- **Input / privacy:** participant attributes and relationship notes. PERSONAL/SENSITIVE data leaving to a vendor, with high re-identification risk in small groups. Would require 재위탁 consent (§5).
- **Effort / deps:** **L** with AI. **S–M** as code-only hints once the group API exists.
- **Fallback UX:** N/A. Code hints show as badges ("1조 정원 초과") and never move people.

### C4. Paste-to-invite helper (operator, invites)
- **Screen/flow [Repo]:** add operators → `POST /events/{id}/invitations` (7-day single-use token, DEC-060). Results go to P14 screens 14–17/35–38 (#27/#107).
- **Value / adoption:** leaders paste a KakaoTalk list ("박지은 jieun@… 찬양팀 스태프"). SCENE pre-fills one invite row per person with a suggested role (MANAGER/STAFF).
- **Model:** **Jev + code.** Regex extracts emails (Jev "pre-parsed value extraction" pattern), and a Jev Choice picks the role from the surrounding text.
- **Input / privacy:** operator names and emails, for which SCENE is controller. Not participant data, so the church's 위탁 contract is unaffected, but SCENE's own privacy policy must list the vendor. DEC-060 is untouched: invitees still see only names and roles.
- **Effort / deps:** **S.** The invitation endpoint exists. Value is modest.
- **Fallback UX:** rows always editable. Role defaults to STAFF when confidence is low. Invites are sent only after [초대 보내기]. On failure, the paste is kept and split by line in code.

### C5. Attendance-note structuring (operator, attendance / check-in)
- **Screen/flow [Repo]:** application answers → D04 v2 attendance slots (Full/Partial/Absent) → check-in roster (`GET /check-in-roster`, `POST /check-ins`; API §14, **not built**, P1).
- **Value / adoption:** converts free-text answers like "토요일 저녁부터 참석" into a proposed attendance tone, so operators stop retyping sheets.
- **Model:** **Jev.** Choice over the event's day/session options built in code. Date logic stays in code. Name search at check-in should use code (Korean initial-consonant search), not AI.
- **Input / privacy:** one answer field per participant. **Send only that field, with a random surrogate ID; never name, phone or contacts.** The answer can reveal health or care reasons (SENSITIVE), so it is in scope of 재위탁 (§5).
- **Effort / deps:** **M.** Needs check-in/attendance storage, which does not exist yet.
- **Fallback UX:** the proposed tone is shown dashed with "확인 필요". Low confidence leaves the slot empty. Save requires a human click.

### C6. Retrospective assist (operator, end / wrap-up)
- **Screen/flow [Repo]:** S11 회고 작성 / S12 회고 저장됨. Allowed only in ENDED, read-only in ARCHIVED (#107). The save API is **not in contract** (mock).
- **Value / adoption:** supports H4 (reuse memory for next event). Option A: an LLM drafts a Korean summary from tasks, notices and the schedule. Option B: Jev tags operator-written notes into keep/improve/next-time and links them to tasks.
- **Model:** **A = LLM** (Korean generation). **B = Jev.**
- **Input / privacy:** ops records. Free text may name participants, so redaction is required. DEC-056 already says ops records keep non-identifying content only.
- **Effort / deps:** **L** (A) / **M** (B). Needs a retrospective API first.
- **Fallback UX:** the draft is never auto-saved and is labelled "AI 초안"; empty editor on failure.

### C7. Application form privacy guardrail (participant application, operator builder)
- **Screen/flow [Repo]:** form builder `POST /forms/{formId}/fields` (exists) → participant application B01–B09 (consent at B03).
- **Value / adoption:** when an operator adds a custom question ("복용 중인 약", "가정 상황", "주민번호"), SCENE warns: "민감정보일 수 있어요: 별도 동의가 필요하고, 행사 후 바로 삭제돼요". This helps the church meet its controller duty and builds trust with pastors and admins.
- **Model:** **Jev.** A Choice per field label over `PUBLIC/PERSONAL/SENSITIVE/고유식별정보` + a Noul "is this needed for operations?". No generation, because the warning texts are fixed and human-written.
- **Input / privacy:** **field labels only, no participant data.** Zero participant PII leaves SCENE, and the 위탁 contract is unaffected.
- **Effort / deps:** **S.** Hooks into field create/update.
- **Fallback UX:** it is a warning, not a block. If down, nothing is shown (same as today). False positives can be dismissed with one tap, and the dismissal is logged for evaluation.

### C8. Participant question router (participant, access-key link)
- **Screen/flow [Repo]:** access-key link → `POST /public/events/{id}/participant-sessions` (DEC-064, built) → participant info home (F11; `GET /participant/notices|schedules`, **not built**).
- **Value / adoption:** the participant types "몇 시까지 가요? 뭐 챙겨요?" and SCENE opens the matching **published** schedule or notice. Otherwise it shows "운영팀에 문의". This targets the pilot measure "participant questions to operators drop" (MVP draft item 18) and H2 (self-serve info).
- **Model:** **Jev.** A Choice over the titles/IDs of PUBLISHED items + `none`, with confidence gating (Jev "intent routing" pattern). Answers are existing human-written content, so it **cannot hallucinate** an answer. An LLM would be needed only for generated answers (not recommended).
- **Input / privacy:** the participant's question (may contain their own PII → redact phone/email patterns in code) + PUBLIC published content. The access key, session and participant ID are **never sent** (DEC-064). It is still processing of participant data, so 재위탁 applies (§5). Prompt injection only changes which public page opens.
- **Effort / deps:** **M.** Needs the participant notices/schedules endpoints first.
- **Fallback UX:** results are shown as "이 안내를 찾으셨나요?" with the top 1–3 options. Below threshold or on timeout, the full notice list and "운영팀에 문의" appear. The router never answers in its own words.

## 3. Comparison

| # | Feature | Side | Model | Participant PII to vendor | 위탁/consent impact | Effort | API ready? | Korean generation? | Adoption |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Starter task suggestions | Op | Jev | None | None (vendor list only) | M | Partly (no item-create) | No | High |
| C2 | Pre-end triage | Op | Jev | None (redacted titles) | None | S | Yes | No | Med |
| C3 | D04 balance hints | Op | Code only | — (AI: high) | AI: yes | S–M / L | No (+blocker) | No | High but §5.5 conflict |
| C4 | Paste-to-invite | Op | Jev+code | None (operator data) | SCENE policy only | S | Yes | No | Low–Med |
| C5 | Attendance notes | Op | Jev | One field, surrogate ID | Yes (재위탁) | M | No | No | Med |
| C6 | Retrospective assist | Op | LLM / Jev | Possible (redact) | Yes if not redacted | L / M | No | A: yes | Med |
| C7 | Form privacy guardrail | Op→Part | Jev | None | None | S | Yes | No | Med (trust) |
| C8 | Question router | Part | Jev | Question text (redacted) | Yes (재위탁) | M | Session yes; notices no | No | High |

## 4. Recommended MVP+AI slice [Proposal]

1. **C1 Starter task suggestions.** This is the visible "AI helps me start" moment on the operator's first day. There is no PII and no Korean generation, and it uses the existing task API. Cost: one new checklist-item endpoint + a curated library (the library is product work, not AI work).
2. **C7 Form privacy guardrail.** S effort, zero participant PII, and it uses an existing endpoint. It turns AI into a *trust* feature for church admins (the controller), which de-risks every later AI feature.
3. **C8 Participant question router.** This is the strongest adoption lever on the participant side and it is tied to a pilot success measure. It never generates text. Ship it only after the notices/schedules endpoints, with redaction, after the 재위탁 decision in §5.

Runner-up: **C2** (S, no PII) if C8's dependencies slip. **Do not** ship AI for C3 (conflicts with §5.5). Do C5/C6 after the pilot.
Main risk: all three need Jev to *read* Korean, which its docs say is weaker than English. Gate on confidence and pass a Korean eval (§5.6) before launch.

## 5. Decisions for 현

1. **Vendor.** (a) Jev: access is open per the official 9/21 post. Pricing is documented. Korean is "handled, not equally well". The service is US-based per the blog, and no region choice is documented. (b) A general LLM vendor: better Korean generation, but more cost and latency and hallucination risk. (c) Hybrid: Jev for C1/C2/C7/C8, an LLM only if C6-A is wanted. **Rec: (c), Jev-first, pinned model ID (`jev-1.13.0`, not `jev-latest`, which moves).**
2. **Data processing consent and 위탁 contract.** C8/C5 (and C6 unredacted) send participant data to a US vendor. As processor, SCENE re-delegating needs the church's consent (재위탁, PIPA 제26조), and overseas transfer rules apply (PIPA 제28조의8) **[Legal]**. TypeSafe's DPA has EU/UK transfer terms and no PIPA terms. Decide whether to (i) add TypeSafe as a sub-processor in the church DPA annex and the privacy notice, or (ii) ship only no-participant-PII features (C1, C2, C4, C7) first. **Rec: (ii) first, then (i) before C8.**
3. **Cost cap.** Set a token budget per event and per org per month, enforced in code (hard stop → manual UI). Jev price is $0.042/Mtok input; no per-event estimate is given here until measured.
4. **PII redaction policy.** A server-side allowlist of fields per feature. Regex-strip phone, email and resident ID patterns. Replace participant and operator names with surrogates. Never send access keys, session IDs, contacts or SENSITIVE fields. Log only feature, token count, model ID and confidence (no raw text), consistent with audit rules (API §17).
5. **AI on/off per org** (Space OWNER), default **off** until the org accepts the AI terms. Per-feature toggles, plus a global kill switch for SCENE ops.
6. **Evaluation criteria.** A Korean gold set per feature (size set by the team, built from realistic but fake data): accept rate, false-positive rate (C7), wrong-route rate and "none" precision (C8), p95 latency, cost per call, and calibration (confidence vs accuracy). Set launch thresholds before testing, and re-run them on every model-ID change.
7. **Record the decision.** Add a DEC for "AI features ship" (closes the §17 OPEN item) and state the "AI suggests, human confirms" rule.

## 6. Sources

**Repo** (`BeomhyunPark/SCENE` `main` @ `94be076`): `docs/product/PRODUCT_DECISIONS.md` (DEC-001/002/003/025, §17, DEC-060–065), `docs/product/PRODUCT_DEFINITION.md` §5.5, `docs/architecture/api-architecture-v0.1.md` (§3, §6–§9, §11, §14, §17, §20, DEC-063/064 sections), `docs/architecture/data-model-v0.1.md`, `docs/architecture/security-privacy-v0.1.md` (§3, §5–§7), `backend/docs/api.md`, `backend/src/main` controllers, `docs/design/fe-handoff.md`, `docs/test_results/d04-repair-review.md`, issue [#107](https://github.com/BeomhyunPark/SCENE/issues/107) (body; 0 comments). Box context: `/workspace/scene/mvp-scope-draft.md`, `/workspace/scene/retention-table-issue12.md`.
**TypeSafe:** https://docs.typesafe.ai/introduction/coding-agents · /introduction · /introduction/quickstart · /concepts/system-one · /models · /images · /model-jaggedness/jev-1.13 · /legal · https://typesafe.ai/legal/data-processing · https://typesafe.ai/blog/introducing-system-one-models-and-jev · https://x.com/typesafeai/status/2101786156572823624
**Not verified:** Korean accuracy on SCENE content; data retention period (DPA says only "as long as necessary"); subprocessor list (trust.typesafe.ai not read); serving region / Korea option (only the blog says the US West Coast); latency in Korea; ZDR terms and price; PIPA fit of the DPA; signup pause/reopen dates (third-party only).
