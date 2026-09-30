# Retreat v0.9 Product Audit — Source-backed Second Pass

**Reference product:** [retreat.greengroove.app](https://retreat.greengroove.app/)  
**Source repository:** [BeomhyunPark/church-retreat-ops](https://github.com/BeomhyunPark/church-retreat-ops)  
**Source baseline:** `main` at `dd9fb923ff100dba30a7660251cceb0b80d900de`  
**Audit date:** 2026-08-26  
**Scope:** Frontend route/navigation, admin screen inventory, operator workflow reconstruction, participant registration data usage, and live-UI/source comparison.

## 0. Audit contract

This is not a code review, refactoring proposal, new platform design, or architecture exercise.

The source is used only as an artifact that records what Retreat v0.9 appears to have tried to make operators and participants do. No finding in this document is a new Product Decision. In particular:

- Existing classes, APIs, tables, and routes are not treated as the future Platform structure.
- Retreat-specific terms are recorded as found and are not generalized into Platform concepts.
- A coded feature proves implementation intent, not recurring market demand or successful real-world use.
- `HYPOTHESIS` and `UNKNOWN` remain open until supported by experience review, interview, survey, usage evidence, or a product test.

### Evidence labels

- **SOURCE:** directly observable in the referenced commit.
- **LIVE OBSERVATION:** directly visible on the public deployed site without submitting registration, looking up a person, or signing in.
- **HYPOTHESIS:** an inference about the original problem, job, or intended value.
- **UNKNOWN:** the source and accessible UI do not establish the answer.

### Inspection boundary

The investigation deliberately began with the router, layouts, navigation, and admin page components. It then followed only the API/DTO/service/mapper paths necessary to understand those screens and the participant-registration flow. It did not perform a full-repository code review.

---

## 1. Executive reconstruction

### 1.1 What the product appears to have been

**SOURCE:** Retreat v0.9 is not merely a public registration form plus unrelated admin CRUD pages. Its strongest implemented pattern is:

> participant registration → operational participant list → purpose-specific roster → operator state change

The same participant record is reused in:

- a broad participant operations table;
- a fee roster;
- a retreat-group assignment board;
- a check-in roster;
- a sensitive participant-detail view with payment, check-in, and history sections.

This is visible in the dashboard's own sequence: participant list check → unpaid check → group assignment check → event-day check-in. **SOURCE:** S04.

### 1.2 Most strongly evidenced operator job

**HYPOTHESIS:** The original product was trying to help a retreat operator answer two recurring questions from one operational record:

1. **Who needs attention now?** — unpaid, unassigned, not checked in, carpool needed, newcomer, care target, cancelled.
2. **What action should I take next?** — inspect detail, mark payment, assign a group/leader, or check the person in.

The source strongly supports the existence of these screen mechanics. It does not prove how often operators experienced the underlying problem, how they handled it before, or whether the product reduced time or mistakes.

### 1.3 Most important limitation of the current product surface

**SOURCE:** The operator side is materially more complete than the participant information side. Public users can register, look up fee/status information, receive a QR credential, and access a self-edit route. There is no public route for announcements, schedules, assigned group, transportation instructions, or individualized event guidance. **SOURCE:** S01, S03, S09, S10.

**HYPOTHESIS:** The implemented product prioritized collecting participant data and transforming it into operator work queues over giving participants a complete self-service event information experience.

**UNKNOWN:** Whether this prioritization was intentional, time-constrained, or based on observed user needs.

---

## 2. Route / navigation inventory

### 2.1 Public route inventory

| Route | Component / visible purpose | Reachability from visible navigation | Audit status | Evidence |
|---|---|---|---|---|
| `/` | Event home; registration and self-lookup entry | Primary entry | SOURCE + LIVE OBSERVATION | S01, S03 |
| `/public` | Redirects to registration | Direct URL only | SOURCE | S01 |
| `/public/register` | One-question-at-a-time participant registration | Home CTA | SOURCE + LIVE OBSERVATION | S01, S09 |
| `/public/self-lookup` | Name + six-digit lookup key; shows masked registration info, fee state, registration state, and check-in QR | Home CTA and registration completion CTA | SOURCE + LIVE OBSERVATION | S01, S10 |
| `/public/self-edit` | Authenticate with name + phone last four + lookup key, then edit registration | No link found from home, registration completion, or self-lookup result | SOURCE; orphan route | S01, S03, S11 |
| `/public/check-in` | Static arrival instructions | No link found from home or self-lookup | SOURCE + LIVE OBSERVATION; orphan route | S01, S12 |
| `/admin/login` | Two-step operator login | Admin icon on home | SOURCE + LIVE OBSERVATION | S01, S03 |

**SOURCE finding:** Route existence and user-visible reachability differ. `/public/self-edit` and `/public/check-in` are routable but are not part of the home navigation. Their mere presence should not be read as evidence that participants discover or use them.

**UNKNOWN:** Whether these routes were distributed through external links, messages, or printed material.

### 2.2 Admin route inventory

All `/admin/*` routes under `AdminLayout` require a stored access token and a successful `/admin/auth/me` check. Unauthenticated direct navigation redirects to `/admin/login`. **SOURCE:** S01, S02. **LIVE OBSERVATION:** direct visits to `/admin/dashboard` and `/admin/community` redirected to the login screen.

| Route | Screen | Sidebar / topbar entry | Source-level access signal | Surface state |
|---|---|---|---|---|
| `/admin/dashboard` | Dashboard | Sidebar | Authenticated admin | Wired |
| `/admin/participants` | Participant operations list | Sidebar | STAFF+ read | Wired |
| `/admin/participants/:participantId` | Sensitive participant detail | From participant/fee/check-in rows | STAFF+ read; CHAIR+ for selected changes | Wired detail / partial management |
| `/admin/fees` | Fee roster | Sidebar | STAFF+ read; CHAIR+ change | Wired |
| `/admin/community` | Middle-group and church-cell management | **Sidebar link commented out** | STAFF+ read; CHAIR+ change | Routed but hidden |
| `/admin/retreat-groups` | Group assignment board | Sidebar | STAFF+ read; CHAIR+ change | Wired |
| `/admin/announcements` | Announcement list and publication/pin controls | Sidebar | STAFF+ read; CHAIR+ change | Partial UI |
| `/admin/schedules` | Schedule list, filter, publication controls | Sidebar | STAFF+ read; CHAIR+ change | Partial UI |
| `/admin/check-ins` | QR/manual arrival check-in roster | Sidebar | STAFF+ check-in; CHAIR+ cancel/token control | Wired |
| `/admin/accounts` | Admin-account management | SYSTEM_ADMIN-only sidebar item | SYSTEM_ADMIN | Wired system operation |
| `/admin/profile` | Own password change | Topbar “내 정보” | Authenticated admin | Wired self-service |

**SOURCE:** The sidebar exposes dashboard, participants, fees, retreat groups, announcements, schedules, and check-ins. Community is commented out; account management is added only when the profile role is `SYSTEM_ADMIN`; profile is reached from the topbar. **SOURCE:** S02.

**UNKNOWN:** Post-login screens were not visually inspected against production because no administrator login was attempted.

---

## 3. Admin screen inventory

The word “wired” below means the current source connects the screen to an API. It does not mean the workflow was validated in live retreat operations.

### 3.1 Dashboard — `/admin/dashboard`

**SOURCE observation**

- Shows total registrations from `totalElements`.
- Calculates an unpaid count from the currently returned fee-roster page.
- Links directly to participants, fees, groups, and check-ins.
- States an explicit operating sequence: preparation → communication → field operation.

**Likely operator job — HYPOTHESIS**

> Orient quickly, see which operational area needs attention, and enter the next queue.

**Caveat — SOURCE**

The unpaid number is calculated from `feesQuery.data.content`, while the fee API defaults to 50 rows. It is explicitly labeled “현재 조회된 명단 기준,” but it is not a total unpaid count when more matching rows exist. **SOURCE:** S04, S08.

### 3.2 Participant operations list — `/admin/participants`

**SOURCE observation**

The default table combines 13 operator-facing dimensions:

- name;
- birth-year cohort;
- gender;
- masked phone;
- middle group;
- church cell;
- attendance type;
- retreat group and leader marker;
- inbound/outbound transportation summary;
- fee state;
- check-in state;
- registration date;
- exception tags: cancelled, newcomer, care target.

Filters allow operators to isolate cancelled/registered, full/partial/worship-only, paid/unpaid, unassigned group/cell, checked-in/not checked-in, carpool-needed/provider, newcomer, and care-target cases. Sort order and column width/order are operator-specific preferences. **SOURCE:** S05.

**Likely operator job — HYPOTHESIS**

> Use one table as an exception-oriented operational index, rather than opening every participant record or maintaining separate spreadsheets for each state.

**Privacy behavior — SOURCE**

List responses mask the phone number and suppress detailed partial-attendance and carpool fields. Opening detail returns the full fields and creates privacy access-log entries for the detail and history views. **SOURCE:** S13, S14.

**UNKNOWN**

- Which columns operators actually used during preparation or on event day.
- Whether customizable widths/order solved a real repeated need or were implementation preference.
- Whether the table remained usable on the devices and participant counts of the real retreat.

### 3.3 Participant detail — `/admin/participants/:participantId`

**SOURCE observation**

The screen consolidates:

- identity/contact;
- registration, fee, newcomer, care-target, and check-in status;
- free-text and normalized community/group affiliation;
- attendance type, partial-arrival/departure details, lodging nights;
- direction-specific transport and carpool details;
- fee state and fee-event history;
- check-in state and operator action;
- registration-change history;
- admin memo and timestamps.

Fee change and check-in actions are connected. Fee reversal and check-in cancellation require reasons in the detail screen. **SOURCE:** S06.

**Likely operator job — HYPOTHESIS**

> Escalate from a compact roster row into a complete case view when a participant requires judgment, contact, correction, or history checking.

**Gap — SOURCE**

The screen displays status, admin memo, newcomer, care target, and church-cell assignment, but the frontend API does not expose the existing backend endpoints for updating registration status, management metadata, or participant church-cell linkage. Those values are therefore read-only in the inspected frontend. **SOURCE:** S08, S24.

### 3.4 Fee roster — `/admin/fees`

**SOURCE observation**

- Search by name or phone suffix; UI copy also claims community/group search.
- Filter paid versus unpaid.
- Show name, gender, birth year, phone last four, cell, group, fee status, and last change time.
- Toggle paid/unpaid and open participant detail.
- Backend roster joins the registration to normalized community, retreat group, and fee actor data, and orders unpaid first.

**SOURCE:** S07, S15.

**Likely operator job — HYPOTHESIS**

> Reconcile payments against the current participant roster and preserve who changed the state and when.

**UNKNOWN**

- What external evidence operators used to decide that payment was received.
- Whether this screen replaced or duplicated a banking app, spreadsheet, or separate accounting process.

### 3.5 Retreat group assignment — `/admin/retreat-groups`

**SOURCE observation**

- Loads active registrations and excludes cancelled participants.
- Shows unassigned candidates and group boards.
- Filters candidates by attendance type, gender, newcomer, name, phone suffix, and cell.
- Supports drag assignment/unassignment, group order, member order, group creation/removal, and group-leader selection.
- Renders each member's attendance as an eight-slot timeline across the three-day retreat.
- Shows per-group total, male/female count, full/partial count, and per-time-slot headcount.
- Before saving, summarizes total/assigned/unassigned counts and warns—but does not block—when people remain unassigned.

**SOURCE:** S16.

**Likely operator job — HYPOTHESIS**

> Build workable groups while seeing demographic balance, newcomer care signals, and when each member will actually be present—not merely attach a group ID.

This is the strongest source-backed evidence that attendance detail was collected for a later operator decision, rather than only for reporting.

**UNKNOWN**

- The actual group-making criteria and who had authority to make tradeoffs.
- Whether gender, birth year, cell, newcomer status, attendance overlap, or pastoral care carried the most weight.
- Whether drag-and-drop supported collaboration or forced one operator to become the bottleneck.

### 3.6 Announcements — `/admin/announcements`

**SOURCE observation**

The screen lists title/content, active state, pinned state, display period, targets, and last updater. It can only toggle active and pinned state. It cannot create or edit an announcement, although the backend has create and update endpoints. The empty state explicitly says authoring must still be connected. **SOURCE:** S17, S21.

**Likely operator job — HYPOTHESIS**

> Control whether already-prepared operational messages are visible and prioritized.

**UNKNOWN**

- How announcements were initially created.
- Who was supposed to read them; no public announcement route or public controller was found.
- Whether “targeting” ever affected a real delivery surface.

### 3.7 Schedules — `/admin/schedules`

**SOURCE observation**

The screen filters by date, category, and public/private state and can toggle active state. It cannot create or edit a schedule, although the backend exposes create/update endpoints. There is no public schedule route or public schedule controller. **SOURCE:** S18, S21.

**Likely operator job — HYPOTHESIS**

> Review an event timetable and control which items are considered published.

**UNKNOWN:** How schedule data entered the system and where “published” schedules were consumed.

### 3.8 Check-in — `/admin/check-ins`

**SOURCE observation**

- Provides a camera-based QR entry point.
- After success, shows participant name, group, check-in time, and “next participant scan.”
- Provides a searchable/paged roster with checked-in versus not-checked-in filter.
- Allows manual processing and cancellation.
- Backend roster joins participant identity, normalized community, retreat group, leader marker, and check-in actor/event data; pending participants are ordered first.

**SOURCE:** S19, S20.

**Likely operator job — HYPOTHESIS**

> Process a queue of arriving people quickly, recover when QR scanning is unavailable, and leave an accountable check-in record.

The explicit “next participant scan” action is source evidence of repeated, high-throughput processing intent.

**Gap — SOURCE**

The public check-in page says the desk checks participant fee and registration state and gives group/lodging guidance. The check-in roster itself shows group but not fee, registration status, or lodging; an operator must open participant detail for the broader context. **SOURCE:** S12, S19.

### 3.9 Community structure — `/admin/community`

**SOURCE observation**

The page can create, edit, filter, activate, and deactivate middle groups and church cells. The route and backend are present, but its sidebar link is commented out. Participant-cell linkage exists in the backend but not in the inspected frontend API. **SOURCE:** S02, S21, S24.

**HYPOTHESIS:** This appears to be supporting data for search, fee/check-in rosters, and group formation rather than an operator workflow that was fully integrated into the product surface.

**UNKNOWN:** Why the navigation was hidden and how existing participants received normalized cell assignments.

### 3.10 Account and profile administration

**SOURCE observation**

- SYSTEM_ADMIN can create/edit accounts, change role/status, lock accounts, and reset passwords.
- Every authenticated admin can change their own password.
- These screens support operation of the product itself, not retreat operations directly.

**SOURCE:** S02, S22, S23.

---

## 4. Reconstructed operator workflows

These workflows describe what the source makes possible. They are not claims that real operators followed them.

### WF-01 — Pre-event operational triage

1. Sign in.
2. Open dashboard.
3. Check participant count and current unpaid count.
4. Open participant list.
5. Filter for exceptions such as cancelled, unpaid, group/cell unassigned, carpool need, newcomer, care target, or unchecked-in.
6. Open participant detail when compact roster data is insufficient.

**SOURCE:** S02, S04, S05, S06.  
**Original problem — HYPOTHESIS:** operators otherwise inspect multiple lists or ask different owners to find who is incomplete.  
**Current workflow before v0.9 — UNKNOWN:** no source artifact establishes the actual pre-product tools or handoffs.

### WF-02 — Fee reconciliation

1. Open fee roster.
2. Filter unpaid or search by participant.
3. Use phone suffix, cell, and group as disambiguation context.
4. Mark paid/unpaid.
5. Open participant detail for fee-event history or broader context.

**SOURCE:** S07, S15.  
**Original problem — HYPOTHESIS:** manual reconciliation needed a shared state and change accountability.  
**UNKNOWN:** bank/accounting evidence source, reconciliation cadence, and error rate.

### WF-03 — Group formation

1. Load active registered participants.
2. Filter unassigned candidates by name/cell, attendance type, gender, or newcomer status.
3. Drag participants into group boards.
4. Compare group composition and attendance timelines.
5. Select a leader and order members.
6. Review assigned/unassigned counts.
7. Save even if unassigned people remain, after warning.

**SOURCE:** S16.  
**Original problem — HYPOTHESIS:** group assignment required repeated manual joins between registration details, attendance windows, community affiliation, and care considerations.  
**UNKNOWN:** actual decision rules, collaboration model, and whether the operator trusted the calculated time-slot counts.

### WF-04 — Event-day arrival

1. Participant registers or later self-lookups and receives a QR credential.
2. Operator opens the check-in screen.
3. Operator scans the QR or searches the roster and checks in manually.
4. Screen confirms the participant and group.
5. Operator immediately proceeds to the next scan.
6. CHAIR+ can cancel an incorrect check-in.

**SOURCE:** S09, S10, S19, S20.  
**Original problem — HYPOTHESIS:** arrival processing needed speed, fallback, and a shared current count.  
**UNKNOWN:** actual desk layout, arrival volume, device/camera reliability, network conditions, queue time, and whether participants retained the QR.

### WF-05 — Communication publication control

1. Operator reviews pre-existing announcements or schedules.
2. Filters schedules or inspects announcement targets/period.
3. CHAIR+ makes an item public/private and pins/unpins announcements.

**SOURCE:** S17, S18.  
**Status:** incomplete workflow in the inspected UI.  
**UNKNOWN:** creation path and audience-consumption path.

---

## 5. How participant registration data is used in operations

### 5.1 Registration input inventory

The public payload collects four different kinds of input. **SOURCE:** S09.

| Input group | Fields | Immediate participant purpose | Downstream operator use found in source |
|---|---|---|---|
| Identity / disambiguation | name, gender, birth year, phone, free-text church cell/department | Identify the registration | Participant table, fee roster, group board, check-in roster, detail |
| Attendance | full/partial/worship-only, arrival/departure, partial note, lodging nights, per-session attendance flags | Describe how the person will attend | Participant table/detail; group-board attendance timeline and time-slot counts |
| Directional transport | separate inbound/outbound method, carpool offer/need, seats, areas, route, notes, worship-shuttle slot | Describe how the person will arrive and return | Participant table summary/filter; full participant detail |
| Self-service / consent | six-digit lookup key, privacy consent | Re-access registration and authorize collection | Self-lookup, self-update, QR retrieval; not exposed to admin UI |

The form builds different question sequences by attendance type and by inbound/outbound transport answers, then removes irrelevant fields before submission. **SOURCE:** S09.

### 5.2 Source trace by operator surface

| Registration-derived data | Participant list | Participant detail | Fee roster | Group board | Check-in roster |
|---|---:|---:|---:|---:|---:|
| Name / gender / birth year | Yes | Yes | Yes | Yes | Yes |
| Phone | Masked | Full | Last four | Masked suffix used for search | Last four |
| Free-text cell/department | Fallback display | Yes | No; normalized cell only | Candidate card | No; normalized cell only |
| Attendance type | Yes | Yes | No | Yes | No |
| Per-session attendance flags | Not displayed | Yes | No | **Timeline + counts** | No |
| Partial arrival/departure/note | Suppressed from list response | Yes | No | Indirectly through attendance slots | No |
| Inbound/outbound method | Summary + filter | Yes | No | No | No |
| Detailed carpool data | Suppressed from list response | Yes | No | No | No |
| Lodging nights | Not displayed | Yes | No | Timeline logic uses attendance flags, not lodging as a visible field | No |
| Fee paid | Yes | Yes + history | Primary state | No | No |
| Registration status | Exception tag/filter | Yes | No explicit status filter | Cancelled excluded | No explicit status field |
| Newcomer / care target | Tag/filter | Yes | No | Newcomer visible/filter; care target not visible | No |
| Group / leader | Yes | Yes | Yes | Primary assignment state | Yes |
| Check-in | Yes | Yes + actions | No | No | Primary state |

### 5.3 What this trace establishes

**SOURCE:** Registration data is deliberately reused to construct several role/task-specific views. Fee and check-in mappers join registrations to normalized community and retreat-group assignment rather than maintaining standalone participant copies. **SOURCE:** S15, S20.

**HYPOTHESIS:** Retreat v0.9 was attempting to reduce manual joins and duplicate entry by treating participant registration as the operational backbone.

**UNKNOWN:** Whether the database became the real operational source of truth during the retreat, or whether spreadsheets/chat remained authoritative.

### 5.4 Data added by operators rather than participants

The following values are not public registration answers; they are operational state layered onto the registration:

- paid/unpaid and fee-change actor/time/reason;
- registered/cancelled;
- normalized church cell;
- retreat group and group-leader marker;
- newcomer and care-target flags;
- admin memo;
- checked-in state, method, actor, time, cancellation.

**SOURCE:** S13, S15, S20, S24.

**HYPOTHESIS:** The product tried to turn a participant-submitted application into a shared operational case record.

---

## 6. UI and source differences

### 6.1 Live accessible UI vs current source

| Finding | Evidence | State |
|---|---|---|
| Home, first registration step, first self-lookup step, static public check-in, and admin login match the current source's visible text and route behavior. | LIVE OBSERVATION + S01, S03, S10, S12 | OBSERVED |
| Direct admin routes redirect to login. | LIVE OBSERVATION + S02 | OBSERVED |
| Deployed home displays generic `Your Church / Retreat Ops / Your Retreat`. Those are the backend/frontend defaults when identity configuration remains default or absent. | LIVE OBSERVATION + S25 | OBSERVED; deployment configuration reason UNKNOWN |
| Exact production revision cannot be proven from the accessible UI. | No build SHA surfaced publicly | UNKNOWN |
| Post-login production screens and real data states were not compared. | No login attempted | UNKNOWN |

### 6.2 Navigation and discoverability differences inside the source

| Difference | SOURCE evidence | Product interpretation |
|---|---|---|
| Community route exists but sidebar entry is commented out. | S01, S02 | HYPOTHESIS: supporting data workflow was intentionally hidden or unfinished. Reason UNKNOWN. |
| Self-edit route exists but no public navigation link was found. | S01, S03, S10, S11 | HYPOTHESIS: implemented capability was not integrated into the participant journey. External distribution UNKNOWN. |
| Public check-in route exists but no home/self-lookup link was found. | S01, S03, S10, S12 | HYPOTHESIS: static instructions were secondary or externally linked. Actual use UNKNOWN. |
| Account page is a route for all clients but only SYSTEM_ADMIN sees its navigation item; backend remains the real authorization boundary. | S01, S02, S22 | SOURCE fact; no future permission decision implied. |

### 6.3 Frontend surface vs existing backend capability

| Existing source capability | Frontend surface found | State |
|---|---|---|
| Create/edit announcement | Only list + active/pinned toggles | SOURCE gap; S17, S21 |
| Create/edit schedule | Only list/filter + active toggle | SOURCE gap; S18, S21 |
| Update registration status | No inspected frontend call | SOURCE gap; S24 |
| Update admin memo/newcomer/care-target | Values displayed, no inspected frontend call | SOURCE gap; S06, S24 |
| Assign normalized church cell to participant | Structure-management UI exists; participant-link UI/call not found | SOURCE gap; S21, S24 |
| Publish announcements/schedules for participants | No public route/controller found | SOURCE gap; S01, S21 |

These gaps are evidence of the v0.9 product's incomplete workflow boundaries. They are not instructions to copy the backend endpoints into a future platform.

### 6.4 UI promises vs actual retrieval boundaries

#### “전체” participant display

**SOURCE:** The participant page offers an “전체” page-size option of `9999`, and the group board requests `500`, while the registration service clamps every request to a maximum of `100`. **SOURCE:** S05, S14, S16.

**Operational implication — HYPOTHESIS:** Above 100 registrations, the visible “전체” participant table and group-assignment board can present an incomplete working set while using language such as “전체.” This could create missed assignments or false completion confidence.

**UNKNOWN:** Actual v0.9 participant count and whether the issue occurred in operation.

#### Dashboard unpaid count

**SOURCE:** The dashboard counts unpaid people only from the first fee-roster page, whose frontend default is 50. **SOURCE:** S04, S08.

**Operational implication — HYPOTHESIS:** The number is a queue sample, not a reliable whole-event KPI. The UI partly discloses this with “현재 조회된 명단 기준.”

#### Check-in desk instructions vs check-in roster

**SOURCE:** The participant-facing page promises fee/status confirmation and group/lodging guidance, but the check-in roster directly shows only identity, phone suffix, check-in state, community, group, and time. Fee, registration status, and lodging require a participant-detail detour. **SOURCE:** S12, S19.

**UNKNOWN:** Whether the detour was acceptable in the actual arrival queue.

---

## 7. Source-backed findings without Product Decisions

### FINDING-01 — Registration is the operational backbone

- **SOURCE:** Registration values are reused across participant, fee, group, and check-in surfaces.
- **HYPOTHESIS:** This was intended to reduce duplicate participant lists and manual joins.
- **UNKNOWN:** Whether operators made it their real source of truth.
- **Product state:** HYPOTHESIS. No KEEP/GENERALIZE/MODULE/DROP decision assigned.

### FINDING-02 — The participant list is an exception queue, not just a directory

- **SOURCE:** Filters and one-way sorts prioritize unpaid, unchecked-in, unassigned, care/newcomer, transport-need, and cancelled cases.
- **HYPOTHESIS:** Operators need to find exceptions faster than they need to browse alphabetical records.
- **UNKNOWN:** Which exceptions are frequent, costly, or cross-event.
- **Product state:** HYPOTHESIS.

### FINDING-03 — Group formation consumes multi-dimensional attendance evidence

- **SOURCE:** Group boards use demographic, newcomer, affiliation, and eight-slot attendance data with live composition counts.
- **HYPOTHESIS:** The original pain was manual balancing and attendance-aware assignment, not simple group storage.
- **UNKNOWN:** Actual decision policy, collaboration, and generality beyond this retreat.
- **Product state:** HYPOTHESIS.

### FINDING-04 — Check-in was designed as a repeated field operation

- **SOURCE:** QR scan, manual fallback, pending-first roster, immediate success feedback, and next-scan CTA form a queue-processing workflow.
- **HYPOTHESIS:** Arrival speed and recoverability were important.
- **UNKNOWN:** Throughput, error rate, device/network constraints, and actual usage.
- **Product state:** HYPOTHESIS.

### FINDING-05 — Privacy boundaries were intentionally encoded

- **SOURCE:** List phone masking, suppression of detailed carpool fields, full detail only after navigation, and access logging are explicit.
- **HYPOTHESIS:** Operators required useful roster context without exposing all participant detail by default.
- **UNKNOWN:** Whether roles, masking, and access logs matched real organizational expectations.
- **Product state:** HYPOTHESIS; privacy remains a confirmed project principle, but this exact implementation is not a future decision.

### FINDING-06 — Communication is represented but not end-to-end

- **SOURCE:** Admin list/publication controls exist; authoring and participant consumption surfaces are absent from the inspected frontend/public API.
- **HYPOTHESIS:** Announcements and schedules were planned as an operational workflow but were not completed as a participant delivery loop.
- **UNKNOWN:** Whether another channel—KakaoTalk, PDF, or verbal briefing—remained the actual delivery mechanism.
- **Product state:** UNKNOWN.

### FINDING-07 — Some “complete set” language exceeds the retrieved set

- **SOURCE:** UI request sizes of 500/9999 are clamped to 100; dashboard unpaid count uses the first 50 fee rows.
- **HYPOTHESIS:** This can undermine operator trust if counts or boards are treated as complete.
- **UNKNOWN:** Whether real data volume crossed the limits.
- **Product state:** HYPOTHESIS; this is a v0.9 workflow-risk observation, not a future architecture requirement.

---

## 8. Open questions for the next research pass

### Actual use

1. Which admin screens were used during the real retreat, by whom, and at what point in the preparation/event-day timeline?
2. Did the app replace a spreadsheet or run alongside one? Which source was authoritative when values disagreed?
3. How many registrations existed, and did any operator notice incomplete “전체” lists or boards?
4. Was QR check-in actually used? If so, what were queue length, average processing time, scan failures, and manual fallback rate?

### Decision work

5. How were group-assignment tradeoffs actually made? Which criteria mattered, and what data was missing from the board?
6. Who verified payments, using what external evidence, and how were disputes or reversals handled?
7. Who set newcomer/care-target/admin-memo values if the current frontend does not expose those actions?
8. How were free-text church cell values normalized into the community structure?

### Participant experience

9. Did participants know how to edit their registration or reach the static check-in page?
10. Did self-lookup and fee status reduce repeated questions to operators?
11. Did participants retain and present the QR credential?
12. Where did participants actually receive schedules, announcements, group assignments, lodging, and transportation updates?

### Product interpretation

13. Which of these workflows recur in other retreats at the same church?
14. Which recur in vision trips, outreach, mission, Bible school, camps, or small leadership events?
15. Which mechanics are artifacts of this retreat's three-day timetable, church structure, role names, and transport arrangements?

Until these questions are answered, the source remains evidence of one implemented retreat workflow—not evidence of Platform Core.

---

## 9. Source register

All source links below are pinned to commit `dd9fb923ff100dba30a7660251cceb0b80d900de`.

- **S01 — Router:** [`frontend/src/app/router.tsx` lines 22–60](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/app/router.tsx#L22-L60)
- **S02 — Admin navigation/auth shell:** [`AdminLayout.tsx` lines 9–20 and 43–134](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/shared/layout/AdminLayout.tsx#L9-L134)
- **S03 — Public home navigation:** [`AppHomePage.tsx` lines 7–50](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/home/AppHomePage.tsx#L7-L50)
- **S04 — Dashboard metrics and operating sequence:** [`AdminDashboardPage.tsx` lines 5–63](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminDashboardPage.tsx#L5-L63)
- **S05 — Participant list columns, filters, and “전체” option:** [`AdminParticipantsPage.tsx` lines 14–55](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminParticipantsPage.tsx#L14-L55), [lines 355–577](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminParticipantsPage.tsx#L355-L577), [lines 637–707](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminParticipantsPage.tsx#L637-L707)
- **S06 — Participant detail:** [`AdminParticipantDetailPage.tsx` lines 16–169](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminParticipantDetailPage.tsx#L16-L169), [lines 176–490](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminParticipantDetailPage.tsx#L176-L490)
- **S07 — Fee roster UI:** [`AdminFeesPage.tsx` lines 11–153](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminFeesPage.tsx#L11-L153)
- **S08 — Frontend admin API and pagination defaults:** [`adminApi.ts` lines 349–528](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/adminApi.ts#L349-L528)
- **S09 — Registration payload and conditional form:** [`publicApi.ts` lines 3–46 and 146–171](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/publicApi.ts#L3-L171), [`publicRegisterFormModel.ts` lines 114–259](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/publicRegisterFormModel.ts#L114-L259)
- **S10 — Self-lookup and QR result:** [`PublicSelfLookupPage.tsx` lines 8–125](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/PublicSelfLookupPage.tsx#L8-L125)
- **S11 — Self-edit flow:** [`PublicSelfEditPage.tsx` lines 453–500](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/PublicSelfEditPage.tsx#L453-L500), [lines 1244–1284](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/PublicSelfEditPage.tsx#L1244-L1284)
- **S12 — Static public check-in:** [`PublicCheckInPage.tsx` lines 1–14](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/public/PublicCheckInPage.tsx#L1-L14)
- **S13 — Admin registration list/detail response privacy boundary:** [`AdminRegistrationResponse.java` lines 67–130](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/registration/dto/AdminRegistrationResponse.java#L67-L130)
- **S14 — Registration query cap and privacy access logging:** [`RegistrationService.java` lines 340–420](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/registration/service/RegistrationService.java#L340-L420)
- **S15 — Fee roster joins, filters, and ordering:** [`FeeMapper.xml` lines 39–100](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/resources/mapper/fee/FeeMapper.xml#L39-L100)
- **S16 — Group assignment board:** [`AdminRetreatGroupsPage.tsx` lines 145–487](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminRetreatGroupsPage.tsx#L145-L487), [lines 500–740](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminRetreatGroupsPage.tsx#L500-L740), [lines 1089–1289](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminRetreatGroupsPage.tsx#L1089-L1289)
- **S17 — Announcement UI:** [`AdminAnnouncementsPage.tsx` lines 11–128](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminAnnouncementsPage.tsx#L11-L128)
- **S18 — Schedule UI:** [`AdminSchedulesPage.tsx` lines 21–151](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminSchedulesPage.tsx#L21-L151)
- **S19 — Check-in UI:** [`AdminCheckInsPage.tsx` lines 12–192](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminCheckInsPage.tsx#L12-L192)
- **S20 — Check-in roster joins and pending-first ordering:** [`CheckInMapper.xml` lines 32–94](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/resources/mapper/checkin/CheckInMapper.xml#L32-L94)
- **S21 — Backend announcement/schedule/community endpoints:** [`AdminAnnouncementController.java`](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/announcement/controller/AdminAnnouncementController.java), [`AdminScheduleItemController.java`](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/schedule/controller/AdminScheduleItemController.java), [`AdminCommunityController.java`](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/community/controller/AdminCommunityController.java)
- **S22 — Admin-account UI:** [`AdminAccountsPage.tsx`](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminAccountsPage.tsx)
- **S23 — Own-password UI:** [`AdminProfilePage.tsx`](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/features/admin/AdminProfilePage.tsx)
- **S24 — Backend participant-management endpoints not surfaced in frontend:** [`AdminRegistrationController.java` lines 73–114](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/registration/controller/AdminRegistrationController.java#L73-L114), [`AdminParticipantController.java` lines 20–61](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/registration/controller/AdminParticipantController.java#L20-L61)
- **S25 — Default product identity:** [`appIdentity.ts` lines 4–29](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/frontend/src/shared/identity/appIdentity.ts#L4-L29), [`AppIdentityProperties.java` lines 6–59](https://github.com/BeomhyunPark/church-retreat-ops/blob/dd9fb923ff100dba30a7660251cceb0b80d900de/src/main/java/com/gmc/retreat/identity/AppIdentityProperties.java#L6-L59)

---

## 10. Audit conclusion

The source-backed second pass adds one important conclusion to the accessible-UI audit:

> Retreat v0.9's most meaningful evidence is not its list of screens. It is the repeated transformation of participant registration data into operator-specific work queues for payment, group formation, exception triage, and arrival.

That evidence is strong enough to guide the next interviews and artifact review. It is not strong enough to determine Platform Core, modules, future navigation, data model, APIs, or architecture.

The appropriate next move is to validate the reconstructed workflows against the actual retreat operators and their pre-app artifacts—not to generalize the current source structure.
