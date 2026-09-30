# Event Operational Complexity Dimensions v0.2

## Document Status

- **Type:** Research Artifact
- **Status:** HYPOTHESIS
- **Version:** v0.2
- **Date:** 2026-08-26
- **Evidence Basis:** Longitudinal single-observer EXPERIENCE + Retreat SOURCE
- **Supersedes:** 없음. v0.1을 보존한 상태에서 비교·검증하기 위한 후속 Artifact

이 문서는 Event Type taxonomy, Product Configuration Specification, Feature Matrix 또는 Event Scoring Model이 아니다.

목적은 다음과 같다.

> Event의 이름이 아니라 어떤 운영 특성이 Problem Severity, Human Recovery Cost와 Software Need를 증폭하거나 완화하는지 조사하기 위한 Research Lens를 개선한다.

각 Dimension은 한 사용자의 장기 경험을 구조화한 `HYPOTHESIS`다. 다른 교회, 역할, Event와 Pilot에서 검증되기 전 Product Requirement나 Product Decision으로 전환하지 않는다.

---

## 1. What changed from v0.1

v0.1은 Participant Scale, Autonomy, Change, Assignment, Handoff, Throughput, Risk 등 주요 운영 특성을 식별했다. 이후 Retreat, Vision Trip, Outreach, Bible School, Leadership MT를 비교하면서 단일 Dimension만으로 Complexity와 Software Need를 설명하기 어렵다는 Evidence가 추가됐다.

### Newly visible gaps

- `Participant Scale`이 작아도 Vision Trip은 Team Readiness, External Partner, Sensitive Data와 해외환경 때문에 복잡할 수 있었다.
- `Participant Autonomy`가 낮은 Bible School에서는 Complexity가 사라지지 않고 Teacher Supervision과 Attention Burden으로 이동했다.
- 유사한 20~30명 Event라도 Shared Context가 높은 Leadership MT와 Vision Trip의 Coordination Cost가 달랐다.
- Guangzhou Vision Trip처럼 여러 장소에 분산된 운영은 한 장소 중심 Outreach와 다른 Coordination Problem을 만들었다.
- Vision Trip과 Outreach의 실제 계획은 외부 Partner의 정보와 Need에 의존했다.
- Mongolia의 날씨·정전·교통, Guangzhou의 통신환경처럼 외부환경이 내부 State와 별도로 계획을 바꿨다.
- Problem의 Frequency뿐 아니라 사람이 빠르고 안전하게 복구할 수 있는지가 Software Need를 낮추거나 높일 수 있었다.

### Structural revision

Dimension을 5개의 상위 Category로 재배치한다.

1. Event Scale & Structure
2. Human Structure
3. Workflow Complexity
4. Environment
5. Risk & Recovery

### v0.1 Dimension disposition

| v0.1 Dimension | v0.2 Treatment | Reason |
| --- | --- | --- |
| Participant Scale | 유지 / Category A | 중요하지만 단독 Predictor가 아님을 명시 |
| Participant Autonomy | 재정의 / Category B | Low Autonomy의 부담 이전과 Participant Operational Capability를 포함 |
| Change Frequency | 재정의 / Category C | Change Propagation Cost와 State Dependency를 하위 Lens로 추가 |
| Assignment Complexity | 유지 / Category C | Assignment 간 Dependency를 명시 |
| Relationship Complexity | 유지 / Category B | Retreat와 Bible School의 관계구조 차이를 반영 |
| Operator Count / Specialization | 유지 / Category A | 작은 Team도 전문화될 수 있다는 Vision Trip Evidence 추가 |
| Information Handoff Depth | 유지 / Category C | External Partner와 Guardian/Teacher Handoff 사례 추가 |
| Field Throughput | 유지 / Category C | Retreat Serial Check-in과 Child Presence 상황을 구분 |
| Preparation Duration | Team Readiness에 흡수 / Category C | 시간 자체보다 기간 동안 필요한 Task·Training·Practice를 함께 봄 |
| Participant Information Need | Participant Autonomy에 흡수 / Category B | 실제 Information Consumer가 Participant, Guardian, Leader로 달라짐 |
| Geographic Complexity | 유지 / Category D | 물리적 이동 범위에 집중 |
| Operational Risk | 유지 / Category E | Safety와 Sensitive Information 포함 |

### Candidate Dimensions added

- Operational Dispersion
- Shared Context / Operational Familiarity
- Supervision Intensity
- Team Readiness
- External Partner Dependency
- Environmental Volatility
- Human Recoverability

`State Dependency`는 중요한 Lens지만 이번 v0.2에서는 독립 Dimension으로 늘리지 않고 `Change Frequency`와 `Assignment Complexity`의 Interaction Lens로 둔다.

---

## 2. Revised Dimensions

### A. Event Scale & Structure

#### A1. Participant Scale

##### Definition

Event에 참여하고 운영상 식별·지원·처리해야 하는 참가자의 규모.

##### Examples

- Lower: 약 20~30명 Leadership MT, 18명 Mongolia Vision Trip
- Higher: 100~200명 Bible School, Large Retreat

##### Research Questions

- 참가자 수 증가가 어떤 Workflow를 비선형적으로 어렵게 만드는가?
- Scale 증가가 State 수, Handoff, Throughput과 Operator Specialization을 어떻게 바꾸는가?
- 같은 규모에서 Complexity가 다른 이유는 무엇인가?

##### Evidence Note

18~30명 Vision Trip과 20~30명 Leadership MT의 Complexity가 크게 달랐다. Scale은 독립적인 필요 Lens지만 전체 Complexity의 대리변수로 사용하지 않는다.

---

#### A2. Operator Count / Specialization

##### Definition

Event 운영 인원 수와 행정, 회계, 프로그램, 물품, 교통, 안전 등 역할이 전문 영역으로 분화된 정도.

##### Examples

- Lower: 소수 리더가 날짜·장소·식사·Program을 함께 결정하는 Leadership MT
- Higher: 총무, 회계, Program Team, 물품, 간식, 여권·항공, 후원, Team Leader로 역할이 나뉜 Vision Trip

##### Research Questions

- Team 규모가 작아도 업무 전문화가 높은 경우 Coordination Cost는 어떻게 변하는가?
- 역할 분화가 Knowledge Silo를 만드는가, 아니면 책임 명확화로 비용을 줄이는가?
- 책임과 결과정보 소비 범위가 다를 때 어떤 Handoff가 필요한가?

##### Revision from v0.1

Operator 수와 Specialization을 동일하게 보지 않는다. 작은 Team도 높은 Specialization과 Readiness Dependency를 가질 수 있다.

---

#### A3. Operational Dispersion — Candidate

##### Definition

Event 운영자와 참가자가 같은 시간에 여러 장소 또는 Team으로 분산돼 활동하는 정도.

##### Examples

- Lower: 대부분 한 장소에서 함께 움직이는 Outreach, Leadership MT
- Higher: 여러 Campus와 위치에서 Team별로 활동한 Guangzhou Vision Trip

##### Research Questions

- 분산된 Team의 현재 인원, 일정과 예외는 누가 파악하는가?
- 의사결정과 변경사항이 각 장소에 도달하는 데 얼마나 걸리는가?
- Geographic Distance보다 동시 활동 분산이 Coordination Cost를 더 잘 설명하는 경우가 있는가?

##### Status

HYPOTHESIS — Guangzhou 사례에서 발견. 다른 분산형 Event 검증 필요.

---

### B. Human Structure

#### B1. Participant Autonomy & Information Need

##### Definition

Participant가 자신의 정보, 다음 행동과 Event Context를 직접 이해하고 판단해야 하는 정도. 실제 Information Consumer가 Participant 본인인지 Guardian·Leader인지도 함께 본다.

##### Examples

- Lower Autonomy: Guardian과 Teacher가 행동을 안내하는 어린이 Bible School
- Higher Autonomy: 각자 일정·이동·배정을 확인하는 성인 Retreat
- Higher Operational Capability: 조직 Context를 알고 직접 확인 가능한 Leadership MT 참가자

##### Research Questions

- 누가 실제 Information Consumer인가?
- Participant는 Event 안에서 필요한 판단과 행동을 수행할 수 있는가?
- Autonomy가 낮을 때 부담은 누구에게 이동하는가?
- 연령과 역할에 따라 Participant, Guardian, Leader Surface의 필요가 어떻게 달라지는가?

##### Revision from v0.1

기존 `Participant Information Need`를 흡수한다. Low Autonomy를 Low Complexity로 해석하지 않으며 Supervision Intensity와 함께 본다.

---

#### B2. Shared Context / Operational Familiarity — Candidate

##### Definition

Participant와 Operator가 Organization, 서로의 역할, Event 방식, 의사결정 구조와 필요한 연락경로를 이미 이해하는 정도.

##### Examples

- Higher: Pastor, Elder, Cell Leader, Ministry Team Leader가 참여하는 Leadership MT
- Lower 또는 Role-mediated: 여러 예배부서와 신규 친구가 함께하는 Bible School

##### Research Questions

- 사용자는 누구에게 무엇을 물어봐야 하는지 이미 알고 있는가?
- Event 방식과 역할을 설명하는 데 어느 정도 Communication이 필요한가?
- Shared Context가 높을 때 기존 KakaoTalk과 직접 대화만으로 충분한가?
- Familiarity가 실제 정보정확성을 보장하는가, 아니면 암묵적 가정을 만드는가?

##### Status

HYPOTHESIS — Leadership MT Negative Evidence에서 발견. 외부 검증 필요.

---

#### B3. Supervision Intensity — Candidate

##### Definition

Participant가 안전하게 Event에 참여하도록 Leader, Teacher 또는 Guardian이 지속적으로 Attention을 제공해야 하는 정도.

##### Examples

- Lower: 스스로 이동·판단 가능한 성인 Leadership Event
- Higher: 이동, 식사, 물놀이, 취침과 건강상태를 계속 살펴야 하는 Bible School

##### Research Questions

- 어떤 순간에 단순 Attendance보다 현재 Presence와 관리범위가 중요한가?
- Supervisor가 동시에 몇 명과 몇 업무를 담당하는가?
- 화면 확인이 돌봄 Attention과 경쟁하는가?
- 어떤 부분은 Software가 아니라 Staffing과 현장절차 Problem인가?

##### Status

HYPOTHESIS — 여러 Bible School EXPERIENCE가 지지. Tracking Requirement 미확정.

---

#### B4. Relationship Complexity

##### Definition

배정, Care, Team Cohesion과 갈등조정에서 인간관계 맥락이 판단에 영향을 주는 정도.

##### Examples

- Retreat: 기존 관계, 가족, 갈등, Care와 Leader 적합성을 함께 고려하는 Group Formation
- Vision Trip: 처음 보는 Team Member 사이 Team Building과 Conflict 조정
- Bible School: 개인 간 친밀도보다 Teacher–Child–Guardian 책임관계가 중심

##### Research Questions

- 관계 맥락이 어떤 운영 판단을 바꾸는가?
- 누가 Tacit Knowledge를 가지고 있는가?
- Sensitive Relationship Data를 저장하지 않고 판단을 지원할 수 있는가?

##### Privacy Guardrail

Relationship Complexity는 과거 연애, 갈등, Care 정보의 수집·저장을 정당화하지 않는다. Data Minimization과 사람의 판단영역을 우선 검토한다.

---

### C. Workflow Complexity

#### C1. Change Frequency & Propagation

##### Definition

Operational State가 변경되는 빈도와 변경 하나가 문서, 역할, Assignment와 사람에게 다시 반영돼야 하는 범위.

##### Examples

- Higher Frequency / Propagation: Retreat 직전 취소·부분참석·조·숙소·교통 변경
- Lower Frequency: 최종 참가자 State가 비교적 안정적인 Vision Trip
- Medium–High Frequency but lower recovery cost: 중간 추가 참가자를 현장 배정한 Outreach

##### Research Questions

- 무엇이 얼마나 자주 바뀌는가?
- 변경 하나가 몇 개 downstream State와 사람에게 영향을 주는가?
- 서로 다른 Version이 존재할 때 Impact는 무엇인가?
- Change Frequency가 높아도 Human Recovery가 쉬운 경우가 있는가?

##### State Dependency Lens

```text
Participant Cancellation
→ Group
→ Accommodation
→ Transportation
→ Communication
```

`State Dependency`는 이번 버전에서 독립 Dimension으로 추가하지 않고 Change Propagation을 설명하는 하위 Lens로 둔다.

---

#### C2. Assignment Complexity

##### Definition

Participant와 Operator를 Group, Class, Accommodation, Transportation, Role과 Team에 배정해야 하는 정도 및 Assignment 간 상호의존성.

##### Examples

- Higher: 관계, 참석시간, 성별, Care와 전체 균형을 함께 보는 Retreat Group Formation
- Medium–High: Teacher당 약 4~6명과 신규·초청관계를 고려하는 Bible School Class Formation
- Lower: 별도 Assignment가 거의 없는 Leadership MT

##### Research Questions

- 어떤 Assignment가 존재하고 서로 영향을 주는가?
- 변경 시 몇 개 Assignment를 다시 조정해야 하는가?
- 어떤 판단을 Software가 지원할 수 있고 어떤 판단은 사람에게 남아야 하는가?

##### Privacy Guardrail

Decision Support 가능성을 연구하되 민감한 관계정보의 저장이나 Algorithmic Assignment를 전제하지 않는다.

---

#### C3. Team Readiness & Preparation Time Horizon — Candidate

##### Definition

Event 참가자와 Team이 맡은 역할이나 사역을 수행하기 위해 완료해야 하는 Task, Training, Education, Practice와 준비기간의 양.

##### Examples

- Higher: Language, Culture, Program, Performance, Prayer, Training과 Supplies가 필요한 Vision Trip
- High: Program, Worship, Supplies와 전문 봉사준비가 필요한 Outreach
- Lower: 날짜, 장소, 식사와 Activity 중심 Leadership MT

##### Research Questions

- 준비 완료 여부를 누가 어떤 근거로 판단하는가?
- Participant Registration State와 Team Readiness State는 어떻게 다른가?
- 준비기간이 길어질수록 Ownership, Task, Decision과 Change History가 중요해지는가?
- 반복 확인과 미준비 보완에 실제로 얼마나 시간이 드는가?

##### Revision from v0.1

`Preparation Duration`을 단순 시간축으로 유지하지 않고 Team Readiness에 흡수한다. 기간이 길다는 사실만으로 Complexity가 높다고 판단하지 않는다.

##### Open Research Note — Planning Time Horizon

v0.2에서는 `Preparation Duration`을 독립 Dimension으로 유지하지 않았다. 그러나 Team Training이나 Readiness가 높지 않더라도 장소 계약, 외부 업체 Coordination, 예산, Approval, 장기 Scheduling 또는 Decision Dependency 때문에 준비기간이 길어지는 Event가 존재할 수 있다.

따라서 `Planning Time Horizon` 자체가 Ownership, Decision History, 변경 누적과 Coordination Complexity를 별도로 설명하는지는 계속 관찰한다. 현재는 이를 독립 Dimension으로 다시 승격하거나 Product Requirement로 해석하지 않는다.

##### Status

HYPOTHESIS — Vision Trip 3회와 Outreach 경험이 지지. Readiness Tracking 기능 미확정.

---

#### C4. Information Handoff Depth

##### Definition

정보가 최초 Source에서 최종 Action을 수행하는 사람까지 전달되는 단계와 중개자의 수.

##### Examples

```text
External Partner
→ Pastor / Team Leader
→ Preparing Team
```

```text
Pastor
→ Guardian / Teacher
→ Child Participant
```

```text
Event Owner
→ Operator
→ Group Leader
→ Participant
```

##### Research Questions

- 각 Handoff에서 누락, 지연과 Version 차이가 발생하는가?
- 최초 Source를 유지하면서 필요한 최소정보만 전달할 수 있는가?
- Broadcast와 Current State를 어떤 도구에서 소비하는가?
- 직접 대화가 더 빠르고 안전한 단계는 어디인가?

---

#### C5. Field Throughput

##### Definition

제한된 시간과 현장자원 안에서 처리해야 하는 사람 또는 업무 건수.

##### Examples

- Higher: 수백 명이 짧은 시간에 도착하는 Retreat Check-in
- Lower: 소수 Team이 순차 이동하는 Vision Trip

##### Research Questions

- Exception 한 건이 전체 Normal Queue에 어떤 영향을 주는가?
- 처리량, Operator 수, 장소, Device와 Network 조건은 어떠한가?
- Fast Path와 Exception Path를 구분할 가치가 있는가?

##### Boundary

Bible School의 Presence Awareness는 처리량만의 문제가 아니라 지속적 Supervision과 Safety Context이므로 Field Throughput 하나로 설명하지 않는다.

---

### D. Environment

#### D1. Geographic Complexity

##### Definition

Event가 진행되는 장소의 수, 이동거리, 국내외 이동과 교통수단의 복잡도.

##### Examples

- Lower: 한 교회 또는 한 숙소에서 진행하는 Event
- Higher: 항공, 현지 차량과 여러 지역이 포함된 Vision Trip

##### Research Questions

- 이동구간과 교통수단이 늘어날 때 어떤 정보와 Coordination이 필요한가?
- Inbound, Outbound, 경유, 현지 이동을 누가 결정하고 갱신하는가?
- Geographic Complexity와 Operational Dispersion은 어떻게 다른가?

---

#### D2. External Partner Dependency — Candidate

##### Definition

Event 운영이 외부 Partner의 정보, 승인, 자원 또는 Coordination에 의존하는 정도.

##### Examples

- Higher: 현지 선교사와 지속 조정하는 Vision Trip
- Higher: 현지 목회자의 대상자·시설·Need 정보에 따라 Work Structure가 달라지는 Outreach
- Lower: 내부 리더만으로 계획 가능한 Leadership MT

##### Research Questions

- Partner가 유일한 Source인 정보는 무엇인가?
- 정보와 결정은 언제, 누구에게, 어떤 형식으로 전달되는가?
- Partner 정보가 늦거나 바뀔 때 내부 준비에 어떤 영향이 있는가?
- Sensitive Information은 Source에 남기고 Minimum Necessary Access만 전달할 수 있는가?

##### Status

HYPOTHESIS — Vision Trip과 Outreach 반복 경험이 지지. Portal이나 계정 Requirement 미확정.

---

#### D3. Environmental Volatility — Candidate

##### Definition

날씨, 교통, 정전, 통신, 현지 규제, Partner 상황 등 외부환경이 운영계획을 바꿀 가능성과 영향.

##### Examples

- Mongolia: 폭우, 홍수, 정전, 교통 지연
- Guangzhou: 통신 및 KakaoTalk 검열 환경
- Outreach: 날씨에 따른 Program 변경

##### Research Questions

- External Change를 얼마나 미리 알 수 있는가?
- 변경 시 Decision Authority와 Communication Path는 무엇인가?
- 사람이 현장에서 빠르게 복구 가능한가?
- Software가 해결 가능한 정보문제와 해결할 수 없는 환경문제는 무엇인가?

##### Status

HYPOTHESIS — 소수 사례. Event-specific Risk와 일반적 Lens의 경계 확인 필요.

---

### E. Risk & Recovery

#### E1. Operational Risk

##### Definition

운영 실패가 Safety, Health, Privacy, Finance, Legal/Travel, 일정과 사람에게 미치는 영향의 정도.

##### Examples

- Bible School: Child Safety, Health, Allergy, Guardian Contact
- Vision Trip: Passport Copy, Visa, Insurance, Vaccination, Overseas Cash
- Retreat: 대규모 Participant Information과 현장 Queue

##### Research Questions

- 어떤 Failure가 단순 불편을 넘어 안전 또는 중대한 손실이 되는가?
- 현재 누가 어떤 절차와 정보로 Risk를 통제하는가?
- Minimum Necessary Data는 무엇이며 누가 접근해야 하는가?
- Software가 Operator에게 새로운 Privacy 또는 Attention Risk를 만들 수 있는가?

##### Guardrail

Risk가 높다는 사실을 특정 Feature Requirement로 바로 연결하지 않는다.

---

#### E2. Human Recoverability — Candidate

##### Definition

문제가 발생했을 때 Software 없이도 사람이 얼마나 빠르고 저렴하고 안전하게 정상상태로 복구할 수 있는가?

##### Higher Recoverability examples

- Outreach 물품 누락 → 현지 구매
- Leadership MT 공지 누락 → 직접 확인
- 한 장소 Outreach 일정 변경 → 목회자 즉석 결정과 현장 공지

##### Lower Recoverability examples

- Retreat Check-in Exception → 전체 Queue 지연
- 복잡한 Assignment 변경 → 여러 downstream State와 사람에게 재반영

##### Research Questions

- 복구에 얼마나 많은 시간, 사람, 비용과 재작업이 필요한가?
- 복구가 빠르지만 특정 사람의 과로 또는 기억에 의존하지 않는가?
- Recovery가 Safety와 Privacy를 유지하는가?
- Software를 추가하면 Recovery가 실제로 쉬워지는가, 새로운 관리부담이 생기는가?

##### Product Insight — HYPOTHESIS

> 문제가 발생한다는 사실만으로 Software가 필요하다고 판단하지 않는다.

> 문제의 Frequency, Impact, Change Propagation Cost, Human Recovery Cost를 함께 본다.

##### Status

HYPOTHESIS — v0.2에서 가장 중요한 Candidate. 정량 Score나 Feature Priority Rule로 사용하지 않음.

---

## 3. Cross-event Evidence Examples

아래 표는 한 사용자의 Longitudinal EXPERIENCE를 Dimension별로 연결한 Research Map이다. 시장 검증 결과가 아니다.

| Event | Evidence Combination | Observed Effect | Negative / Limiting Evidence |
| --- | --- | --- | --- |
| Large Retreat | High Scale + High Change Propagation + High Assignment + Lower Recoverability | Participant Current State, Group/Accommodation changes, Check-in Queue가 중요 | v0.9 사용효과와 QR 실사용은 UNKNOWN |
| Mongolia Vision Trip | Small Scale + High Team Readiness + External Partner + Environmental Volatility + Sensitive Data | 소규모여도 장기 Preparation과 해외 Coordination 필요 | 참가자 State는 비교적 안정적 |
| Malaysia Vision Trip | Small Scale + High Team Readiness + External Partner | 공연·Program 연습과 현지 연계 중요 | 대규모 Assignment Evidence 없음 |
| Guangzhou Vision Trip | Small–Medium Scale + High Dispersion + External Partner + Communication Constraint | Team Leader별 인원 파악과 분산 Coordination 중요 | 전체 Check-in Throughput 문제는 확인되지 않음 |
| Taean Outreach | External Partner + Program/Supplies + High Recoverability | 현지 Need에 따라 마을잔치·봉사 구조 결정 | 누락은 현지 구매로 복구 가능 |
| Gimhae Outreach | Child Participation + On-site Adds + Teacher Mediation | 사전·현장 참가 혼재와 반 추가배정 | 엄격한 출석 System이 필요했다는 Evidence는 없음 |
| Cheorwon Outreach | Child Safety + Specialized Repair Work + External Partner | Bible School과 시설보수의 서로 다른 준비 필요 | Accommodation과 Transportation은 단순 |
| Bible School | High Scale + Low Autonomy + High Supervision + High Risk + Low Attention | Guardian/Teacher Handoff와 Presence Awareness 중요 | Staffing Burden은 Software로 직접 해결하기 어려움 |
| Leadership MT | Small Scale + Very High Shared Context + High Recoverability + Low Assignment | 낮은 Coordination Cost | 전용 SaaS 필요성이 낮을 수 있는 Negative Evidence |

---

## 4. Interaction between Dimensions

Dimension 하나를 독립적으로 해석하지 않는다.

### Interaction A — Small but complex Vision Trip

```text
Small Participant Scale
+ High External Partner Dependency
+ High Team Readiness
+ High Sensitive Information
+ Environmental Volatility
= Small Event can still be operationally complex
```

Scale가 낮아도 장기 준비와 외부 의존, Risk가 결합하면 운영 부담이 커질 수 있다.

### Interaction B — Simple Leadership MT

```text
20–30 Participants
+ High Shared Context
+ High Human Recoverability
+ Low Assignment Complexity
+ Direct Communication
= Leadership MT can remain operationally simple
```

같은 규모라도 Familiarity와 Recovery 조건이 Software Need를 낮출 수 있다.

### Interaction C — Low Autonomy Bible School

```text
Low Participant Autonomy
+ High Supervision Intensity
+ High Safety Risk
+ Low Operator Attention
= Significant operator effort
```

Participant가 직접 정보를 소비하지 않는다고 운영 Complexity가 낮아지는 것은 아니다.

### Interaction D — Change propagation in Retreat

```text
High Change Frequency
+ High State Dependency
+ Multiple Assignments
+ Deep Information Handoff
= High Change Propagation Cost
```

Change Frequency만으로는 동일한 변경이 왜 어떤 Event에서 더 큰 비용을 만드는지 설명하기 어렵다.

### Interaction E — Outreach Recovery

```text
Medium Change Frequency
+ One Location
+ Direct Decision Authority
+ High Human Recoverability
= Change can remain manageable without dedicated Software
```

Problem이 존재해도 Recovery가 빠르고 안전하다면 기존 Coordination이 더 효율적일 수 있다.

---

## 5. Research Guardrails

- Dimension은 User에게 입력시키는 Configuration Form이 아니다.
- Dimension을 합산한 Event Complexity Score를 만들지 않는다.
- Pricing Tier 또는 Packaging에 바로 사용하지 않는다.
- Feature On/Off Rule이나 Feature Gating 기준으로 바로 사용하지 않는다.
- Event Type을 평가하거나 우열을 가리는 모델이 아니다.
- 특정 Event Type을 고정 Feature Set으로 매핑하지 않는다.
- 시장 검증 전 Product Requirement로 전환하지 않는다.
- Platform Core 또는 Optional Module의 구체적인 내용을 확정하지 않는다.
- Human Recoverability가 높다는 이유로 Safety, Privacy 또는 특정 사람의 과로를 무시하지 않는다.
- 모든 Problem을 Software Problem으로 취급하지 않는다.

> 사람이 기존 방식으로 빠르고 안전하게 복구할 수 있는 Problem에 Software가 추가 운영 부담을 만들어서는 안 된다.

---

## 6. Open Research Questions

1. 어떤 Dimension 조합이 실제 운영시간, 오류와 Stress 증가를 가장 잘 설명하는가?
2. Participant Scale보다 State Dependency나 Change Propagation Cost가 더 강한 Predictor인가?
3. Shared Context가 높은 조직에서도 정보누락이나 책임 불명확이 발생하는 조건은 무엇인가?
4. Human Recoverability가 실제로 높은지, 특정 핵심 인물의 과로가 숨겨져 있는지 어떻게 구분하는가?
5. Low Participant Autonomy에서 Participant-facing Surface와 Guardian/Leader-facing Surface의 실제 필요는 어떻게 달라지는가?
6. Supervision Intensity가 높은 현장에서 화면 확인 없이도 작동해야 하는 Workflow는 무엇인가?
7. External Partner가 유일한 Source인 정보 중 Product가 다룰 가치가 있는 것은 무엇인가?
8. Environmental Volatility에서 Software가 도움 되는 부분과 현장 의사결정에 맡겨야 하는 부분은 무엇인가?
9. Team Readiness를 추적하는 비용이 실제 준비 누락 감소보다 작을 수 있는 조건은 무엇인가?
10. Operational Dispersion이 인원수보다 Communication Failure를 더 잘 설명하는가?
11. Formal Reporting과 Operational Memory의 간극이 다음 Event 준비비용에 미치는 영향은 얼마인가?
12. 어떤 조건에서 KakaoTalk / Spreadsheet / Direct Coordination가 전용 SaaS보다 더 효율적인가?

---

## 7. Current Research Limits

- Longitudinal Evidence는 한 사용자의 약 13년 경험에 기반한다.
- Dimension의 인과관계와 중요도 순서는 검증되지 않았다.
- Event별 정량 데이터와 다른 역할의 직접 Evidence가 부족하다.
- Candidate Dimension이 독립 Dimension이어야 하는지 일부는 추가 Research가 필요하다.
- 이 문서는 Product Definition, Product Scope, Platform Core, Optional Module, MVP, Pricing, IA, Data Model, API 또는 Architecture를 결정하지 않는다.
