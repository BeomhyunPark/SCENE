# Problem Cluster Synthesis v0.1

- **Type:** Research Synthesis Artifact
- **Status:** HYPOTHESIS / RESEARCHED
- **Version:** v0.1
- **Date:** 2026-08-26
- **Evidence Basis:**
  - Retreat EXPERIENCE
  - Retreat SOURCE
  - 13-Year Longitudinal single-observer EXPERIENCE
  - Event Operational Complexity Dimensions v0.2

이 문서는 Feature List나 Product Scope가 아니다.

`RES-001`~`RES-021`과 관련 Research Artifact를 근본 Problem 단위로 합성하여, 어떤 문제가 반복되고 서로 어떻게 연결되는지 이해하기 위한 Research Artifact다. Cluster 이름은 Product Module 이름이 아니며 Platform Core, Optional Module, MVP, IA, Screen, Requirement, Data Model, API 또는 Architecture를 결정하지 않는다.

Longitudinal `EXPERIENCE`는 한 사용자의 약 13년 경험에 기반한다. 여러 해와 여러 Event에서 반복된 관찰은 중요한 1차 Evidence지만 independent market validation이나 시장 전체의 `FACT`가 아니다. `SOURCE`는 Retreat v0.9의 구현 의도를 직접 보여주지만 실제 사용, Problem Frequency 또는 해결 효과를 증명하지 않는다.

---

## 1. Synthesis Method

개별 Finding을 다음 기준으로 묶었다.

- 같은 Root Cause를 가리키는가?
- 같은 Operator Cost를 발생시키는가?
- 동일한 State / Information Failure에서 파생되는가?
- Event Type이 달라도 비슷한 Failure Mechanism을 보이는가?
- 해결책이 아니라 Problem 관점에서 묶을 수 있는가?

다음 방식으로 해석하지 않는다.

```text
RES 1개 = Feature 1개

Problem Cluster = Product Module
```

### 1.1 Synthesis decisions

- `Current State`와 `Change Propagation`은 밀접하지만 분리했다. 전자는 현재 정답을 알 수 없는 문제이고, 후자는 변경이 여러 State와 사람에게 재반영되는 비용이다.
- `Coordination / Handoff`는 Current State와 분리했다. 정답이 존재하는 것과 정답이 필요한 사람에게 제때 도달하는 것은 다른 Failure다.
- `Relationship Complexity`는 독립 Cluster로 만들지 않았다. 현재 Evidence에서는 Retreat Group Formation의 판단 제약이자 Privacy-sensitive Tacit Knowledge 문제로 나타나므로 Current State, Change Propagation, Operational Continuity에 걸친 하위 Context로 두었다.
- `Information Ownership / Access Bottleneck`도 독립 Cluster로 만들지 않았다. 이는 Current State와 Handoff를 악화시키는 Access Constraint로 보는 편이 현재 Evidence에 더 맞다.
- `External Partner Dependency`와 `Environmental Volatility`는 내부 운영자가 통제할 수 없는 Context에서 시작한다는 공통점 때문에 하나의 Cluster로 합쳤다. 다만 Partner Handoff와 환경변화는 하위 Failure Mechanism으로 구분한다.
- Manual Fee Reconciliation, Transportation, Participant Self-service는 현재 독립 Root Cluster로 승격할 Evidence가 부족하다. 각 사례는 관련 Cluster의 Manifestation 또는 Open Question으로 남긴다.

---

## 2. Problem Cluster Overview

| ID | Problem Cluster | Root question | Current interpretation |
| --- | --- | --- | --- |
| PC-01 | Operational State Visibility & Consistency | 필요한 사람이 현재 유효한 Event State를 즉시 알 수 있는가? | Cross-event 반복 후보 |
| PC-02 | Change Propagation & State Dependency | 변경 하나를 몇 개 State, 문서, 역할과 사람에게 다시 반영해야 하는가? | Cross-event 반복 후보 |
| PC-03 | Coordination & Information Handoff | Source의 정보가 실제 Action 담당자에게 정확하고 제때 도달하는가? | Cross-event 반복 후보 |
| PC-04 | Operational Memory & Continuity | 다음 운영자가 재사용할 수 있는 판단·시행착오·맥락이 남는가? | Cross-event 반복 후보 |
| PC-05 | Exception Handling & Human Recoverability | 예외 발생 시 사람이 얼마나 빠르고 안전하게 복구할 수 있는가? | Cross-event 반복 후보이자 Software Need 조절 Lens |
| PC-06 | Human Attention, Supervision & Field Capacity | 운영자가 도구를 확인·사용할 Attention과 Capacity 자체가 있는가? | Context-sensitive 후보 |
| PC-07 | Preparation & Team Readiness | 등록을 넘어 역할을 실제 수행할 준비가 됐는가? | Context-sensitive 후보 |
| PC-08 | External Context Dependency & Volatility | 외부 Partner와 Environment가 내부 계획을 얼마나 좌우하는가? | Context-sensitive 후보 |

---

## 3. PC-01 — Operational State Visibility & Consistency

### Root Problem

Event Operational State가 여러 Artifact와 사람 사이에 분산되고 갱신되면서, 필요한 사람이 현재 유효한 Version을 즉시 확인하기 어렵다.

핵심 질문은 다음이다.

> 지금 현재 정답이 무엇인가?

### Manifestations

- 참가자 명단은 있지만 신청·입금·참석·배정·도착의 현재 상태를 함께 알기 어렵다.
- 조·숙소 Assignment의 최신 결과가 문서와 메시지 사이에서 다르다.
- 변경 공지는 존재하지만 현재 유효한 일정이나 안내가 따로 정리되지 않는다.
- Staff가 공식 담당자가 아니라는 이유로 현장 안내에 필요한 기본 Context를 모른다.
- 참가자가 자신의 정보를 사람에게 반복 문의한다.
- 기준 문서가 있어도 Access가 특정 담당자에게 집중되면 실질적인 Current State 조회가 막힌다.

`Single Source of Truth`는 이미 존재하는 Product Direction이지만, 이 Cluster에서 특정 중앙화 방식이나 기능을 결론 내리지는 않는다. 기존 문서의 적절한 유지, Integration, 조회 범위와 입력부담도 함께 검증해야 한다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-001 | Retreat | EXPERIENCE / SOURCE | MODERATE | Participant Management가 정적 명단보다 변하는 Current State 관리에 가까웠음 | Retreat 중심이며 다른 Event의 핵심 Job인지는 미검증 |
| RES-004 | Retreat | EXPERIENCE / SOURCE | MODERATE | 변경 메시지와 현재 유효한 정보가 분리되지 않아 Version 차이가 발생 | KakaoTalk 실패 빈도와 대안 효과 미측정 |
| RES-005 | Retreat | EXPERIENCE / SOURCE | MODERATE | Assignment가 문서가 아니라 계속 변하는 State였음 | Group·Accommodation 중심 사례 |
| RES-020 | Retreat / Bible School | EXPERIENCE | MODERATE | Formal Responsibility보다 넓은 Result Context가 현장 대응에 필요 | 필요한 범위와 Privacy 경계 미확정 |
| Retreat Source-backed FINDING-01/02 | Retreat v0.9 | SOURCE | Not rated — direct implementation intent | Registration을 여러 운영 Queue의 기반으로 재사용하고 Exception을 찾도록 구현 | 실제 사용, 효과와 시장 반복성은 증명하지 않음 |

### Boundary with other Clusters

- PC-01: “현재 정답이 무엇인가?”
- PC-02: “정답이 바뀌었을 때 무엇을 다시 고쳐야 하는가?”
- PC-03: “그 정답이 필요한 사람에게 도달했는가?”

---

## 4. PC-02 — Change Propagation & State Dependency

### Root Problem

하나의 Operational State 변경이 여러 Assignment, 문서, 역할과 사람에게 연쇄 반영돼야 하며, 영향 대상을 사람이 찾아 수동으로 다시 수정·공지해야 한다.

```text
Participant Cancellation
→ Group
→ Accommodation
→ Transportation
→ Communication
```

### Manifestations

- 동일 변경을 여러 Spreadsheet와 문서에 수동 재입력한다.
- 어떤 downstream State가 영향을 받는지 담당자가 기억으로 찾아야 한다.
- 일부 State만 갱신돼 서로 다른 Version이 남는다.
- 관련 조장·참가자·담당자에게 재공지한다.
- 예외 한 건이 다른 사람의 배정과 현장 Workflow까지 재작업하게 한다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-005 | Retreat | EXPERIENCE / SOURCE | MODERATE | Group·Accommodation Assignment의 변경과 재전달 패턴 | 다른 Assignment와 Event에서의 반복성 미검증 |
| RES-006 | Retreat | EXPERIENCE / SOURCE | MODERATE | Check-in 예외가 뒤의 정상 Queue 전체에 영향을 줌 | 한 현장과 미사용 QR 구현 의도에 기반 |
| RES-011 / RES-012 | Cross-event | EXPERIENCE | MODERATE — single observer | Event Type·Scale보다 State 변화와 Operational Characteristics가 Severity를 달리할 수 있음 | 독립 외부 Evidence 없음 |
| RES-015 | Retreat / Vision Trip / Outreach / Leadership Event | EXPERIENCE | MODERATE — single observer | Propagation Cost가 Human Recovery와 Software Need를 조절함 | 시간·재작업량 미측정 |
| Complexity v0.2 C1/C2 | Cross-event synthesis | EXPERIENCE / SOURCE | HYPOTHESIS lens | Change Frequency와 State Dependency를 함께 봐야 함 | 독립 Dimension·인과관계 미검증 |

### Relationship to PC-01

Change Propagation 실패는 Current State mismatch를 만든다. 그러나 Current State 문제는 변경이 적어도 접근 제한, 문서 분산 또는 불명확한 Authority 때문에 발생할 수 있으므로 두 Cluster를 동일시하지 않는다.

---

## 5. PC-03 — Coordination & Information Handoff

### Root Problem

정보가 최초 Source에서 실제 Action을 해야 하는 사람까지 이동하는 과정에서 Silo, 중개 단계, 지연, 누락과 Version 차이가 발생한다.

핵심 질문은 다음이다.

> 정답이 존재하는가가 아니라, 그 정답이 필요한 사람에게 정확하고 제때 도달했는가?

### Manifestations

- 전문 Team 안에 결과정보가 머물고 다른 Staff가 기본 안내를 하지 못한다.
- Operator → Group Leader → Participant Relay 과정에서 내용이 누락되거나 늦어진다.
- External Partner → Leadership → Preparing Team 전달에서 현지 Context가 축약되거나 늦어진다.
- Guardian → Pastor → Teacher 전달에서 Child 관련 필요한 정보가 중개된다.
- 분산된 Team은 서로의 현재 상황과 변경을 즉시 파악하기 어렵다.
- Shared Context가 낮거나 Handoff가 깊을수록 누구에게 물어야 하는지 찾는 비용도 커진다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-003 | Retreat | EXPERIENCE | MODERATE | 업무분장 뒤에 결과정보 Silo와 담당자 재탐색이 발생 | 한 조직구조 중심 |
| RES-004 | Retreat | EXPERIENCE / SOURCE | MODERATE | Relay-dependent Communication의 누락·지연·Version 차이 | 전달 실패량 미측정 |
| RES-014 | Vision Trip / Outreach | EXPERIENCE | MODERATE — single observer | External Partner 정보가 Leadership을 거쳐 내부 Team으로 전달 | Partner 본인의 관점 없음 |
| RES-020 | Retreat / Bible School | EXPERIENCE | MODERATE — single observer | 담당 범위를 넘어선 Operational Context 소비 필요 | Access 범위와 Attention Cost 미확정 |
| RES-021 | Leadership Event | EXPERIENCE | WEAK | Shared Context와 직접 대화가 Coordination Cost를 낮출 수 있음 | 어려움이 기억되지 않는 단일 회고 |
| Retreat Source-backed FINDING-06 | Retreat v0.9 | SOURCE | Not rated — direct implementation intent | Communication Surface가 있었지만 authoring-to-consumption loop가 불완전 | 실제 KakaoTalk 병행 방식과 효과 UNKNOWN |

### Boundary with PC-01

Current State는 정보의 유효성과 조회 가능성에 관한 문제다. Handoff는 정보가 Source와 소비자 사이를 이동하는 과정의 문제다. Current State가 정확해도 소비자에게 도달하지 않으면 Coordination은 실패할 수 있다.

---

## 6. PC-04 — Operational Memory & Continuity

### Root Problem

Event 종료 후 결과물은 남더라도, 다음 운영자가 같은 판단과 시행착오를 재사용하는 데 필요한 Operational Knowledge가 사람의 기억에 남는다.

```text
Event Record
= 무엇을 했는가

Operational Memory
= 왜 그렇게 결정했는가
  어떻게 준비했는가
  어디서 실패했는가
  어떤 대체재가 유효했는가
  누구와 어떻게 조정했는가
  다음에는 무엇을 바꿔야 하는가
```

### Manifestations

- 영상, 간증, 결과보고, 정산은 남지만 다음 준비팀이 “작년에 어떻게 했어요?”라고 다시 묻는다.
- Partner와의 실제 Coordination 방식과 유효한 대체재가 개인 경험으로 남는다.
- 조편성 판단처럼 중요한 Context가 소수 리더의 Tacit Knowledge에 집중된다.
- 담당자 변경 시 판단 이유와 Failure Recovery 방식이 사라진다.

### Privacy Boundary

Operational Continuity를 이유로 모든 Tacit Knowledge를 저장하지 않는다. 과거 연애, 갈등, Care와 같은 관계정보는 Data Minimization, 목적 제한, Least Privilege가 우선이며 저장하지 않는 것이 더 안전할 수 있다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-008 | Retreat | EXPERIENCE | WEAK | Group Formation 판단이 소수 리더의 Privacy-sensitive Tacit Knowledge에 의존 | 단일 Retreat, 저장 적절성 불명 |
| RES-016 | Retreat / Vision Trip / Outreach | EXPERIENCE | MODERATE — single observer | Formal Reporting과 재사용 가능한 Operational Memory의 간극 | 재사용 빈도·효과·기록비용 미측정 |
| HYP-005 | Cross-event hypothesis | HYPOTHESIS state | Not evidence strength | 이전 Event 구조 재사용이 준비비용을 줄일 가능성 | Solution과 가치 모두 미검증 |
| 13-Year Analysis §4.11 | Cross-event | EXPERIENCE | MODERATE — single observer | 여러 Event에서 사람의 기억 의존 패턴 반복 | 다른 교회·다른 후임 운영자 Evidence 없음 |

---

## 7. PC-05 — Exception Handling & Human Recoverability

### Root Problem

정상 흐름에서 예외가 발생했을 때 복구에 필요한 시간, 사람, 재작업과 Risk가 Event마다 크게 다르며, 낮은 Recoverability에서는 한 예외가 넓은 운영 중단으로 이어진다.

```text
Outreach 물품 누락
→ 현지 구매
→ 종료

Retreat Check-in Exception
→ 담당자 장시간 처리
→ Normal Queue 정체
→ 다수 참가자 대기
```

### Severity factors

- Failure Impact
- Recovery Time
- Number of people affected
- Downstream rework
- Safety / Privacy
- Key-person dependency
- 복구가 특정인의 과로에 의존하는지 여부
- Software를 추가했을 때 생기는 새로운 입력·확인 부담

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-006 | Retreat | EXPERIENCE / SOURCE | MODERATE | 예외와 Normal Flow를 직렬 처리해 전체 Queue가 지연 | 현장 처리시간·예외율 미측정 |
| RES-015 | Retreat / Vision Trip / Outreach / Leadership Event | EXPERIENCE | MODERATE — single observer | 같은 Problem도 Recovery Cost에 따라 Software Need가 달라짐 | 정량 비교와 독립 검증 없음 |
| Outreach Negative Evidence | Outreach | EXPERIENCE | MODERATE within single-observer set | 물품 누락·우천 변경·현장 추가를 구매·즉석결정·배정으로 복구 | 복구가 항상 안전하거나 지속가능한지는 미확인 |
| Leadership MT Negative Evidence | Leadership Event | EXPERIENCE | WEAK | 직접 확인과 명확한 Authority가 전용 Software 필요성을 낮춤 | 실제 준비시간·누락 미측정 |
| Complexity v0.2 E2 | Cross-event synthesis | EXPERIENCE / SOURCE | HYPOTHESIS lens | Recoverability를 Frequency와 분리해 조사할 필요 | Priority Rule이나 Score로 검증되지 않음 |

### Research Insight

Human Recoverability가 높은 Problem은 Software Priority가 낮을 수 있다. 다만 “누군가가 무리해서 해결했다”는 사실을 높은 Recoverability로 오판하지 않아야 한다.

---

## 8. PC-06 — Human Attention, Supervision & Field Capacity

### Root Problem

현장 운영자는 사람을 직접 돌보고 여러 업무를 동시에 수행하므로, Software를 확인하고 갱신할 Attention과 Capacity 자체가 부족할 수 있다.

### Manifestations

- Teacher 1명당 약 4~6명의 Child를 직접 돌본다.
- 이동, 물놀이, 식사, 취침, 건강과 안전을 동시에 살핀다.
- 보호자 문의와 전체 일정 변경까지 대응한다.
- 사람을 직접 보느라 KakaoTalk이나 Mobile Screen을 확인하지 못한다.
- 한 Operator가 여러 역할을 동시에 맡으면 입력·확인 자체가 새로운 부담이 된다.

높은 Operator Burden은 자동으로 Software Opportunity가 되지 않는다. 불침번과 Staffing 부족은 Software가 직접 해결하기 어려운 Human Capacity Problem이다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-018 | Bible School / Children Event | EXPERIENCE | MODERATE — single observer | Low Autonomy가 Teacher Supervision과 Attention Burden으로 이동 | Safety Workflow 외부 검증 없음 |
| RES-020 | Retreat / Bible School | EXPERIENCE | MODERATE — single observer | 좁은 책임범위보다 넓은 Context가 필요하지만 확인 Attention도 제한 | 정보 제공이 실제 부담을 줄이는지 미검증 |
| Bible School longitudinal evidence | Bible School | EXPERIENCE | MODERATE — single observer | 이동·물놀이·취침·건강 등 지속 Attention이 필요 | 실제 Incident, 비율, 시간 미측정 |
| Complexity v0.2 B3/C5 | Cross-event synthesis | EXPERIENCE | HYPOTHESIS lens | Supervision Intensity와 Field Throughput을 구분할 필요 | 별도 Dimension 독립성 미검증 |
| Staffing Negative Evidence | Bible School | EXPERIENCE | MODERATE within case set | 불침번·지속 돌봄은 Software보다 인력·절차 문제 | 보조 도구가 도움 될 세부 범위는 UNKNOWN |

---

## 9. PC-07 — Preparation & Team Readiness

### Root Problem

Participant가 등록돼 있다는 사실과 맡은 역할을 실제로 수행할 준비가 됐다는 사실은 다르며, 준비상태가 사람별·Team별로 분산돼 반복 확인과 보완이 필요하다.

```text
Registered
≠
Ready
```

### Manifestations

- Program과 Performance 연습
- Language와 현지 Culture 교육
- Supplies와 역할별 준비
- Prayer / Ministry Preparation
- Safety Preparation
- Team Leader가 준비상태를 반복 확인하고 미준비 항목을 재요청

이 Cluster가 Mission/Vision 계열에 주로 강한지, Retreat·Bible School을 포함한 Cross-event Problem인지 현재는 `UNKNOWN`이다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-013 | Vision Trip 3회 | EXPERIENCE | MODERATE — single observer | Participant가 준비팀 구성원이며 Readiness State가 별도로 존재 | 다른 Mission Team 미검증 |
| RES-012 | Vision Trip / Outreach / Leadership Event | EXPERIENCE | MODERATE — single observer | 비슷한 Scale에서도 Readiness가 Complexity 차이를 설명 | 임계값·비용 미측정 |
| 13-Year Analysis §4.8 | Vision Trip | EXPERIENCE | MODERATE — single observer | 안정적인 참가자 State와 별개로 Program·Training·Supplies 준비 필요 | Tracking 가치와 부담 미검증 |
| Complexity v0.2 C3 | Vision Trip / Outreach synthesis | EXPERIENCE | HYPOTHESIS lens | Team Readiness와 Preparation Time Horizon을 함께 조사 | 기능, 상태모델, 독립 Dimension 미확정 |

### Planning Time Horizon Open Question

준비기간이 길지만 Team Training은 낮은 Event도 장소 계약, 업체 Coordination, 예산, Approval, 장기 Scheduling과 Decision Dependency 때문에 별도 Complexity를 가질 수 있다. 현재 `Planning Time Horizon`을 독립 Cluster나 Dimension으로 승격하지 않고 관찰한다.

---

## 10. PC-08 — External Context Dependency & Volatility

### Root Problem

내부 운영계획의 정확성과 실행 가능성이 조직 밖 Partner의 정보·승인·자원과 날씨·교통·통신·규제 같은 Environment에 의존하며, 내부 State가 정확해도 외부변화가 계획을 무효화할 수 있다.

### Manifestations

- 현지 선교사 또는 개척교회 목회자가 대상자, 시설, 일정과 Need의 유일한 Source다.
- Partner의 정보가 늦거나 바뀌면 Program, 물품과 인력구성이 달라진다.
- 현지 Child·Guardian 정보는 Source 쪽에 있고 준비팀에는 필요한 일부만 전달된다.
- 폭우, 홍수, 정전, 교통, 통신과 규제 변화가 현장계획을 바꾼다.
- 같은 Outreach 명칭이어도 Partner Need에 따라 마을잔치, Bible School, 시설보수로 Work Structure가 달라진다.

이 Cluster는 External Partner Collaboration Feature를 의미하지 않는다. 직접 대화, 기존 문서, Source-held data와 최소정보 전달이 더 적절할 수 있다.

### Evidence Map

| Evidence | Event | Evidence Type | Strength | What it supports | Limitation |
| --- | --- | --- | --- | --- | --- |
| RES-014 | Vision Trip / Outreach | EXPERIENCE | MODERATE — single observer | Partner 정보·자원·승인이 내부 준비의 Dependency | Partner 관점과 실패 빈도 없음 |
| RES-017 | Outreach 3회 | EXPERIENCE | MODERATE — single observer | Partner Need가 실제 Work Structure를 바꿈 | 동일 관찰자의 세 사례 |
| 13-Year Analysis §4.7/4.9 | Vision Trip / Outreach | EXPERIENCE | MODERATE — single observer | Partner Dependency와 Environmental Volatility가 내부 State와 별개로 작동 | 환경 사건 수가 적고 효과 미측정 |
| Complexity v0.2 D2/D3 | Cross-event synthesis | EXPERIENCE | HYPOTHESIS lens | External Partner와 Environment를 별도 조사할 필요 | D3는 소수 사례, 일반성 불명 |
| Outreach Recovery cases | Outreach | EXPERIENCE | MODERATE within case set | 외부변화가 있어도 한 장소·명확한 Authority에서는 빠른 복구 가능 | 다른 분산·고위험 Outreach와 다를 수 있음 |

---

## 11. Problem Relationship Map

Cluster는 독립적이지 않다. 현재 Evidence에서 반복적으로 보이는 연결은 다음과 같다.

### 11.1 State-change chain

```text
State change
→ downstream State 재수정 필요
→ 일부 반영 누락
→ Current State mismatch
→ 서로 다른 Version 전달
→ 반복 문의 또는 Exception
→ Human Recovery Cost 증가
```

### 11.2 Knowledge-silo chain

```text
Operator specialization
→ 결과정보와 판단맥락이 Team 안에 머묾
→ Handoff dependency 증가
→ 담당자 탐색과 반복 확인
→ Key-person dependency
→ Event 종료 후 Operational Memory 손실
```

### 11.3 Low-autonomy chain

```text
Participant autonomy 감소
→ Guardian / Leader mediation 증가
→ Handoff와 Supervision 증가
→ Operator attention 감소
→ Software 확인·입력 여력 감소
```

### 11.4 External-change chain

```text
Partner 또는 Environment 변화
→ 내부 계획·준비상태 변경
→ Handoff와 Change Propagation 필요
→ Recovery Authority가 명확하면 빠른 복구
→ 분산·고위험·낮은 Recoverability이면 Coordination Cost 확대
```

### 11.5 Important interpretation

Current State를 더 잘 보이게 하는 것만으로 Handoff, Attention 또는 Staffing Problem이 자동 해결되지 않는다. 반대로 직접 Coordination이 잘 작동하는 Event에서는 별도 State 관리가 오히려 입력·확인 비용을 늘릴 수 있다.

---

## 12. Cross-event Coverage Matrix

아래 `Strong / Medium / Low`는 Evidence Strength가 아니다. 한 사용자의 비교 사례에서 해당 Problem이 얼마나 두드러졌는지를 나타내는 **qualitative prominence**다. 시장 `FACT`, Event Type의 고정 특성 또는 Feature 필요도 점수로 해석하지 않는다.

| Problem Cluster | Retreat | Vision Trip | Outreach | Bible School | Leadership MT |
| --- | --- | --- | --- | --- | --- |
| PC-01 State Visibility & Consistency | Strong | Medium | Low–Medium | Medium | Low |
| PC-02 Change Propagation & Dependency | Strong | Low–Medium | Medium | Medium | Low |
| PC-03 Coordination & Handoff | Strong | Medium–High | Medium | High | Low |
| PC-04 Operational Memory & Continuity | Strong | Strong | Strong | UNKNOWN | Low / UNKNOWN |
| PC-05 Exception & Recoverability | Strong | Medium | Low–Medium | Medium | Low |
| PC-06 Attention & Supervision | Medium | Medium | Medium | Strong | Low |
| PC-07 Preparation & Readiness | Medium | Strong | Strong | Medium | Low |
| PC-08 External Context Dependency | Low | Strong | Strong | Low–Medium | Low |

### Matrix interpretation notes

- Retreat는 가장 상세한 Experience와 SOURCE가 있어 다른 Event보다 관찰 해상도가 높다.
- Vision Trip은 대규모 Participant Current State보다 Readiness, External Partner, Dispersion과 환경조건이 두드러졌다.
- Outreach는 Problem이 존재해도 한 장소, 명확한 Authority와 현지 구매로 Recoverability가 높은 사례가 있었다.
- Bible School은 Participant-facing 정보보다 Guardian / Teacher Handoff, Supervision과 Attention 문제가 더 강했다.
- Leadership MT는 높은 Shared Context와 직접 대화가 여러 Cluster의 실제 비용을 낮춘 Negative Evidence다.

---

## 13. Problem Severity Lens — No Numeric Scoring

Cluster를 Feature Priority로 점수화하지 않는다. 다음 Lens로 사례별 Severity와 Software 적합성을 질적으로 비교한다.

| Cluster | Frequency / Impact | Actors / Propagation | Recovery / Key person | Attention / Safety / Privacy | Existing alternative / Software burden |
| --- | --- | --- | --- | --- | --- |
| PC-01 State | Retreat에서 반복적이고 오류 시 배정·안내 영향 | Operator, Leader, Participant | 기준정보 보유자 의존 가능 | 개인정보 Access 경계 중요 | Sheets는 유연하지만 최신성·조회범위 관리 필요; 새 입력 중복 위험 |
| PC-02 Change | 빈도보다 downstream 범위가 Impact 결정 | 여러 Assignment와 전달대상 | 수동 재편집 능력과 담당자 기억에 의존 | 잘못된 배정·이동정보 Risk | 소규모·저의존 Event는 직접 수정이 더 빠를 수 있음 |
| PC-03 Handoff | 단계와 분산이 늘수록 누락 가능성 증가 | Source, 중개자, Action 담당자 | 핵심 중개자 부재 시 지연 | Child·Partner 정보의 최소공개 필요 | KakaoTalk·직접 대화가 빠른 경우가 많고 별도 확인 Surface는 Attention을 요구 |
| PC-04 Continuity | Event 종료마다 잠재적으로 반복 | 현 운영자와 미래 운영자 | 과거 핵심인물 의존 | Tacit Knowledge 저장은 높은 Privacy Risk | Docs·회고 미팅이 더 적절할 수 있으며 기록부담이 재사용가치보다 클 수 있음 |
| PC-05 Recovery | 예외 빈도보다 Queue·재작업 Impact 중요 | 한 예외가 다수에게 영향 가능 | 핵심 Operator와 Authority에 크게 의존 | Recovery의 안전·지속가능성 확인 필요 | 현지구매·즉석결정이 충분하면 Software가 느릴 수 있음 |
| PC-06 Attention | Supervision 구간에서 지속적 | Teacher, Guardian, Child, Staff | 인력 부족을 도구가 대체하지 못함 | Safety 영향이 크고 화면 사용이 돌봄과 경쟁 | 입력·알림 추가가 오히려 Attention을 빼앗을 수 있음 |
| PC-07 Readiness | 장기 준비 동안 반복 확인 가능 | Team Leader, Participant, Specialist | 미준비를 다른 사람이 보완 | Safety·사역준비 정보의 적절한 범위 필요 | 기존 모임·Task 도구가 충분할 수 있고 Tracking 자체가 부담 |
| PC-08 External Context | Partner·환경 변화 빈도는 사례별 상이 | 외부 Source와 내부 여러 Team | Partner와 현장 Authority에 의존 | Sensitive Data, 해외환경, 안전 Risk | 직접 관계와 기존 채널이 신뢰의 핵심일 수 있으며 Portal은 Partner 부담 가능 |

추가 Research에서는 각 사례마다 다음을 묻는다.

- Frequency
- Impact
- Number of actors affected
- Change Propagation Cost
- Human Recovery Cost
- Key-person Dependency
- Attention Cost
- Safety / Privacy Risk
- Existing Alternative Quality
- Software-induced Burden

아직 숫자, 가중치, 임계값 또는 Ranking을 부여하지 않는다.

---

## 14. Negative Evidence — When a Cluster does not imply Software Need

Problem이 존재하는 것과 전용 Software가 필요한 것은 다르다. Leadership MT와 일부 Outreach는 SaaS Feature Creep을 막는 중요한 반례다.

### 14.1 Leadership MT

- 약 20~30명이지만 참가자 대부분이 조직, 역할과 의사결정자를 이미 안다.
- 날짜, 장소, 식사, 강의와 Activity 중심으로 Assignment와 State Dependency가 낮다.
- 빠진 공지는 옆 사람이나 담당자에게 직접 확인할 수 있다.
- 한 장소, 명확한 Authority, 높은 Shared Context와 Human Recoverability가 결합한다.

이 조건에서는 구조화된 입력과 별도 Surface를 추가하는 것이 직접 대화보다 느릴 수 있다.

### 14.2 일부 Outreach

- 물품 누락은 현지 구매로 복구했다.
- 날씨 변경은 목회자가 즉석 결정하고 현장에서 공지했다.
- 추가 참가자는 현장 반배정으로 흡수했다.
- 숙소·교통이 단순하고 한 장소에서 함께 움직이는 경우가 있었다.

Problem이 있었지만 Recovery Path가 짧고 영향범위가 제한적이었다. 이를 모두 전용 Workflow로 구조화하면 사전 입력과 유지비용이 더 커질 수 있다.

### 14.3 Bible School Staffing

야간 불침번, 지속적 Child Supervision과 낮은 교사 대비 참가자 비율은 Software만으로 해결할 수 없는 Human Staffing Problem이다. 화면, 알림 또는 Tracking을 추가하면 돌봄 Attention을 빼앗거나 Privacy·Safety Risk를 새로 만들 수 있다.

### 14.4 Guardrail

다음 조건에서는 KakaoTalk, Spreadsheet, Docs 또는 Direct Coordination가 더 나은 대안일 수 있다.

- 높은 Shared Context
- 한 장소
- 단순 Assignment와 낮은 State Dependency
- 명확한 Decision Authority
- 짧고 안전한 Recovery Path
- 소수의 숙련된 참가자
- 기존 도구에서 쉽게 수정·전달 가능
- 전용 Software의 입력·학습·확인 비용이 더 큼

> Software를 사용하지 않는 것이 실패가 아니라 더 나은 Product Decision일 수 있다.

---

## 15. Initial Synthesis — No Product Decision

### 15.1 Cross-event Repeated Problem Candidates

다음 Cluster는 둘 이상의 Event 또는 Cross-event Evidence에서 비슷한 Failure Mechanism이 관찰됐다.

- **PC-01 Operational State Visibility & Consistency** — Retreat에서 가장 강하고 Bible School·Vision Trip·Outreach에서는 중간 또는 제한적 Evidence가 있다.
- **PC-02 Change Propagation & State Dependency** — Retreat에서 강하며 Outreach·Bible School에서는 더 높은 Recoverability와 결합해 다른 Severity로 나타났다.
- **PC-03 Coordination & Information Handoff** — Retreat, Vision Trip, Outreach, Bible School에서 Source와 소비자 구조가 다르지만 Handoff Failure가 반복됐다.
- **PC-04 Operational Memory & Continuity** — Retreat, Vision Trip, Outreach에서 Formal Record와 재사용 가능한 Know-how의 간극이 반복됐다.
- **PC-05 Exception Handling & Human Recoverability** — 여러 Event에서 Problem Severity를 설명하는 공통 조절 Lens로 나타났다.

이는 제품의 공통 범위 목록이 아니다. 반복되는 Problem 후보일 뿐 해결방식과 제품 범위는 미정이다.

### 15.2 Context-sensitive Problem Candidates

- **PC-06 Human Attention, Supervision & Field Capacity** — Low Autonomy, Child Safety, 높은 Supervision과 낮은 Attention에서 강해진다.
- **PC-07 Preparation & Team Readiness** — Vision Trip과 Outreach처럼 참가자가 역할 수행자이고 준비과제가 많은 Context에서 강하다.
- **PC-08 External Context Dependency & Volatility** — 외부 Partner가 핵심 Source이거나 해외·환경 변화가 큰 Context에서 강하다.

Event 이름 자체보다 Operational Characteristics가 이 Cluster의 Severity를 더 잘 설명할 가능성이 있다.

### 15.3 Event-specific / Insufficient Evidence

- **Relationship-sensitive Group Formation** — Retreat에서 강하지만 독립 Cross-event Root Problem으로 보기에는 Evidence가 부족하며 Privacy Risk가 크다.
- **Manual Fee Reconciliation** — 현재 단일 Retreat Workflow와 구현 의도만 확인됐고 빈도·오류율·자동화 가치가 `UNKNOWN`이다.
- **Transportation Coordination** — 상세 필드와 복잡했던 기억은 있으나 실제 Workflow가 충분히 복원되지 않았다.
- **Participant Self-service의 문의 감소 효과** — 필요한 정보 사례는 있으나 실제 문의 감소와 사용효과가 검증되지 않았다.
- **Environmental Volatility의 일반성** — Vision Trip과 일부 Outreach 사례가 있으나 독립 Cluster로 더 세분할 만큼 Evidence가 충분하지 않다.
- **Planning Time Horizon** — Readiness와 무관하게 장기계약·예산·Approval이 Complexity를 만드는지 Open Question이다.

---

## 16. Product Decision Boundary

현재 Synthesis는 다음 Open Decision을 확정할 수준이 아니다.

- 최초 Target Customer
- 최초 Target Event
- Platform Core 세부내용
- Optional Module
- MVP
- Product IA 또는 Screen 목록
- Pricing / Packaging
- Integration Strategy
- Participant Account Model
- DB / Entity / API / Architecture

새로운 Product Decision이나 `CONFIRMED` 상태를 만들지 않는다. `PRODUCT_DECISIONS.md`는 수정하지 않는다.

---

## 17. Recommended Next Research / UX Steps

1. Cluster 간 overlap을 다시 검토하고 사례가 두 Cluster에 걸릴 때 Root Cause와 Result를 분리한다.
2. 숫자점수 없이 Problem Severity를 질적으로 비교한다.
3. KakaoTalk, Spreadsheet, Docs와 Human Coordination가 잘하는 것과 못하는 것을 Cluster별로 비교한다.
4. Evidence와 Severity가 상대적으로 높은 Problem 2~3개에 대해 UX Hypothesis를 만든다.
5. Concept Screen을 정답이 아닌 Research Artifact로 제작한다.
6. Solution이 기존 방식보다 실제 운영비용을 줄이는지 검증한다.

화면 목록이나 Feature Requirement는 이 단계에서 작성하지 않는다.

---

## 18. Research Quality Check

### Evidence

- Longitudinal `EXPERIENCE`를 시장 `FACT`로 표현하지 않았다.
- Retreat `SOURCE`는 구현 의도와 Workflow 구조 근거로만 사용했다.
- 기존 Finding의 Strength를 임의로 승격하지 않았다.
- Negative Evidence와 Software-induced Burden을 별도 분석했다.

### Problem Synthesis

- Cluster를 Feature 또는 Module 이름으로 만들지 않았다.
- Current State, Change Propagation, Handoff의 경계와 관계를 구분했다.
- Relationship Complexity와 Access Bottleneck은 중복 Cluster로 늘리지 않고 하위 Context로 배치했다.
- Event-specific 현상을 Cross-event 문제로 임의 일반화하지 않았다.

### Product and Software Skepticism

- Platform Core, Optional Module, MVP, IA와 Architecture를 결정하지 않았다.
- KakaoTalk, Spreadsheet, Docs와 Direct Coordination가 더 나은 경우를 인정했다.
- 높은 Human Recoverability를 가진 Problem을 자동으로 SaaS Opportunity로 해석하지 않았다.
- Staffing과 지속 돌봄 문제를 Software Feature Opportunity로 오해하지 않았다.
