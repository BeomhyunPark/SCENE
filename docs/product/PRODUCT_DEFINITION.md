# Church Event Operations Platform — Product Definition v0.1

> **2026-09-30 baseline:** 아래는 2026-08-31 Product Definition 원문. CONFIRMED / RESEARCHED / HYPOTHESIS / OPEN QUESTION 및 Caveat 보존. 현재 단계는 Technical Design / implementation 전이며 최신 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)에 기록한다. §10·§12의 기술 미정/진입 설명은 작성 당시 범위다. 기술 기준선 추가가 제품 가설·MVP·IA의 일괄 확정을 의미하지 않는다.
>
> [Decisions](PRODUCT_DECISIONS.md) · [Research](RESEARCH.md) · [Context](PROJECT_CONTEXT.md)

> **2026-09-30 역할·권한 후속 방향:** 조직 관리자의 행사 조회와 행사 수정은 구분하고, 행사 운영진의 업무 권한은 사람별로 달리 부여한다. 조직 관리자는 같은 조직 행사의 개인별 정보·정산 상세를 포함한 전체 정보를 조회하고, 그룹 리더는 자기 그룹원의 전체 정보와 리더용 정보, 참가자는 자기 정보·참가자용 안내를 본다. [DEC-028~030](PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다)에 사용자 답변을 기록했으며 전체 조회 범위와 화면·서버 권한 일치 결정, 후속 기술 검토는 [권한 검토](access-policy-review.md)에 기록한다.

> **2026-09-30 Owner 후속 정책:** 조직·행사 Owner는 복수 가능하며, 수락 후 새 Owner 권한을 즉시 부여하고 넘긴 사람의 해당 인수인계 권한은 14일 후 종료한다. 실제 업무 데이터는 위임 취소로 되돌리지 않으며 마지막 Owner 이탈은 후임 수락 전 차단한다. 조직 Owner의 책임 복구와 긴급 접근 차단은 [DEC-032~035 및 검토 결과](owner-handover-review.md)를 따른다.

> **2026-09-30 가입·초대 후속 정책:** 생성자 Owner, 가입 요청 승인과 대상자 초대 수락, 중복 후보 안내, 조직 소속과 행사 접근 분리를 [DEC-036~039 및 검토 결과](organization-entry-review.md)에 반영했다. 조직 소속 없이 특정 행사만 운영하는 협력자를 허용하며 상세 관계·권한 계약은 후속 설계에서 정한다.

- **Version:** v0.1
- **Date:** 2026-08-31
- **Phase:** Product Definition Gate 통과 후 초기 Product Definition
- **Status:** 현재 제품 정의의 기준선. 최종 Product Scope, IA, Domain, DB, API 또는 Architecture Specification이 아님.

> 이 문서는 Product Discovery에서 확보한 Evidence와 `Product Definition Gate v0.1`의 판정을 제품 정의 수준으로 동기화한다.
>
> `CONFIRMED`는 현재 제품 원칙 또는 방향으로 확정된 상태, `RESEARCHED`는 관련 Evidence가 있으나 범위·메커니즘·효과가 아직 검증되지 않은 상태, `HYPOTHESIS`는 검증이 필요한 해석, `OPEN QUESTION`은 선택 또는 구조가 아직 결정되지 않은 상태를 뜻한다.

## Evidence / Interpretation 규칙

- **Evidence**는 실제 Experience, Source-backed Audit, Research Finding과 Gate 판정을 기록한다.
- **Interpretation**은 Evidence가 현재 Product Definition에 허용하는 의미만 기록한다.
- `RESEARCHED`를 시장 전체의 사실이나 검증된 Solution으로 표현하지 않는다.
- Product Definition에 포함됐다는 사실만으로 모든 항목이 `CONFIRMED`로 승격되는 것은 아니다.
- `Operational Lens`와 `Change Coordination`은 이 버전에서 `HYPOTHESIS`이며 확정 정의문으로 사용하지 않는다.

---

## 1. Product Identity

**State: CONFIRMED**

### Evidence

- `DEC-001`: 제품의 핵심 정체성은 **Church Event Operations Platform**이다.
- `DEC-002`, `DEC-004`: 상시 교적관리, 매주 모임·주일 출석관리, 목양 CRM 또는 헌금관리 중심의 Church Management System(CMS)을 목표로 하지 않는다.
- Cross-event Research는 명확한 시작과 종료가 있고 별도의 준비와 운영이 필요한 여러 교회 Event를 다뤘다.

### Product Definition

이 제품은 교회 및 기독교 단체가 Event를 기획하고 준비하며 참가·현장 운영·종료 후 정산과 회고까지 이어가는 과정을 지원하는 **Event Operations Platform**이다.

제품의 중심은 콘텐츠 게시나 상시 교인 관리가 아니라, Event 동안 발생하는 실제 운영 Job, 정보, 판단, Coordination과 Current State다.

### Boundary

- Event 안에서 참가 여부나 현장 도착을 다룰 수는 있지만, 이를 상시 출석관리 제품으로 일반화하지 않는다.
- Church Member Record와 Event Participation을 동일한 개념으로 확정하지 않는다.

---

## 2. Product Problem

**State: RESEARCHED**

### Evidence

- Retreat와 Cross-event Experience에서 Operational State의 분산, 변경 재반영, Information Handoff, 담당자 의존과 예외 복구 비용이 반복적으로 관찰됐다.
- `Problem Cluster Synthesis v0.1`은 Current State, Change Propagation, Coordination / Handoff, Operational Memory, Exception / Recoverability 등을 반복 Problem 후보로 합성했다.
- 높은 Shared Context와 Human Recoverability를 가진 Leadership Event 및 일부 Outreach에서는 전용 Software 필요성이 낮을 수 있다는 Negative Evidence도 확인됐다.

### Interpretation

이 제품이 풀고자 하는 중심 문제는 Event 정보가 존재하느냐만이 아니다. 필요한 사람이 실제 운영 시점에 유효한 정보를 찾고, 판단하고, 변경을 반영하고, 다음 행동으로 이어가는 데 드는 비용이다.

제품은 반복 연락, 수동 대조, Version 불일치, 사람의 기억 의존과 인수인계 비용을 줄일 가능성을 탐색한다. 다만 모든 운영 문제를 Software Problem으로 취급하지 않으며, 기존 도구와 사람의 직접 Coordination이 더 빠르고 안전한 영역은 그대로 인정한다.

---

## 3. Who This Product Is For

**State: CONFIRMED / RESEARCHED**

### Evidence

- `DEC-011`, `DEC-012`: 관리자만을 위한 제품이 아니며 Buyer, Event Leadership, Operator, Group Leader, Participant를 구분한다.
- Cross-event Evidence는 Event에 따라 실제 Information Consumer가 Participant 본인, Guardian 또는 Leader로 달라질 수 있음을 보여준다.

### Product Definition

핵심 사용자는 Event를 책임지고 준비하고 현장에서 운영하는 사람들이다. 동시에 Participant, Group Leader, Guardian 등 Event 안에서 정보를 소비하거나 행동해야 하는 사용자도 제품 경험의 일부다.

사용자 역할과 직책 명칭은 교회마다 다를 수 있으므로 특정 교회의 직책을 범용 Platform Role로 바로 일반화하지 않는다.

### Still Researching

- 최초 Target Customer Segment와 최초 Target Event는 `OPEN QUESTION`이다.
- 역할별 Surface, 권한, 정보 접근 범위의 구체적 구조는 `OPEN QUESTION`이다.
- Buyer Problem과 Willingness to Pay는 별도 검증이 필요하다.

---

## 4. Event Model

**State: CONFIRMED direction / RESEARCHED basis**

### Evidence

- `DEC-003`: 특정 수련회 Workflow나 하나의 Event Type에 제품을 하드코딩하지 않는다.
- `RES-011`, `RES-012`, `RES-017`과 Complexity Research는 Event 이름이나 참가자 수만으로 운영 복잡도를 설명하기 어렵다는 Longitudinal single-observer Evidence를 제공한다.
- Vision Trip, Outreach, Bible School, Retreat와 Leadership Event는 비슷한 규모에서도 Change Frequency, Assignment, Team Readiness, External Partner, Supervision, Shared Context와 Human Recoverability에 따라 다른 운영 양상을 보였다.

### Product Definition

제품은 다양한 교회 Event에 범용적으로 적용되는 방향을 유지한다. 다만 Event Type 자체를 고정 Feature Set이나 Workflow의 직접적인 결정자로 사용하지 않는다.

어떤 지원이 필요한지는 실제 **Operational Characteristics / Operational Needs**를 따라 이해한다. Event 이름은 Context를 설명하는 단서일 수 있지만, Product Configuration, Module 선택 또는 IA를 자동 결정하는 규칙이 아니다.

### Boundary

- Complexity Dimension을 사용자에게 입력시키는 설정표나 Event Score로 사용하지 않는다.
- 특정 Event Type을 고정 Template, Module 또는 Pricing Tier에 매핑하지 않는다.
- Operational Characteristics가 Software Need를 더 잘 설명한다는 해석은 아직 독립 시장 검증을 거치지 않았다.

---

## 5. Product Operating Principles

### 5.1 반복되는 운영은 시스템이, 새로운 행사는 사람이

**State: CONFIRMED**

제품은 반복되는 정리, 확인, 연결과 상태 반영을 지원하되, 새로운 Event의 목적·맥락·예외를 해석하고 운영 판단을 내리는 책임은 사람에게 남긴다.

> **반복되는 운영은 시스템이, 새로운 행사는 사람이.**

### 5.2 Setup asks for facts, not configuration

**State: CONFIRMED direction**

Setup은 사용자에게 제품 구조를 설계하도록 요구하기보다, 현재 Event에 관해 이미 알고 있는 사실과 실제 운영 필요를 묻는 방향을 따른다.

초기부터 Module, Entity, Workflow와 권한 구조를 사용자가 설계하게 하지 않는다. 단, 구체적인 Setup 질문, Default와 Onboarding Flow는 아직 확정하지 않는다.

### 5.3 Complexity should emerge, not be configured upfront

**State: RESEARCHED → Product Definition v0.1에 제한적 승격**

제품 복잡도는 Event 시작 전에 모든 운영영역을 구성하는 데서 생기기보다, 실제 운영 Job과 Context가 발생하면서 필요한 만큼 깊어져야 한다.

이 원칙은 `Work-first Operational Deepening` 방향을 허용하지만 Navigation, Workspace, Module 또는 Data Structure의 생성 규칙을 확정하지 않는다.

### 5.4 Not Used ≠ Incomplete

**State: CONFIRMED**

> 사용하지 않는 운영영역은 미완료가 아니다.

특정 Capability 또는 Operational Area가 한 Event에서 필요하지 않다면, 그 미사용 상태를 Event Setup의 누락이나 완료도 부족으로 표시하지 않는다.

### 5.5 사람의 운영 판단을 시스템이 빼앗지 않는다

**State: CONFIRMED direction**

System은 필요한 정보와 제약, 영향 범위와 Current State를 더 잘 보이게 할 수 있다. 그러나 관계, Care, 안전, 현장 맥락과 예외를 포함한 판단을 무조건 자동화하지 않는다.

특히 조 편성과 같이 Tacit Knowledge와 민감한 관계정보가 개입되는 업무는 Algorithmic Assignment를 전제하지 않으며, Privacy와 Data Minimization을 우선한다.

---

## 6. Minimal Event Principle

**State: RESEARCHED → 제한적 승격**

### Evidence

- Product Definition Gate v0.1은 Minimal Event 전체 구조를 확정하지 않았고, **사전 Workspace 선택 없이 시작 가능**하다는 범위만 승격했다.
- Negative Evidence는 복잡도가 낮고 직접 Coordination으로 충분한 Event가 존재함을 보여준다.

### Product Definition

> Event는 필요한 Operational Workspace를 사전에 선택하거나 구성하지 않고도 시작할 수 있어야 한다.

Event를 생성하기 전에 모든 Operational Area를 선택하거나 완료하도록 요구하지 않는다. 제품은 낮은 복잡도의 Event에도 불필요한 Setup 부담을 만들지 않아야 한다.

### Not Defined

- `행사 홈 + 참여 + 일정` 또는 다른 조합을 최종 Core IA로 확정하지 않는다.
- Minimal Event의 필수 화면, 필수 데이터, 완료 조건과 생성 Flow는 `OPEN QUESTION`이다.
- Organization / Workspace / Event의 구조를 확정하지 않는다.

---

## 7. Operational Deepening Model

**State: RESEARCHED → Caveat와 함께 승격**

### Evidence

- Event마다 실제로 발생하는 Operational Job과 복잡도가 다르며, 단순 Event에 동일한 구조를 강제하면 Software-induced Burden이 생길 수 있다.
- Gate는 `Work-first Operational Deepening`을 Product Definition에 포함하되 구체적인 생성 규칙을 열어두었다.

### Product Definition

제품은 **Work-first Deepening** 방향을 따른다.

실제 운영 Job이 생기면 그 Job에 필요한 Operational Context가 깊어진다. 사용자가 사전에 제품 구조를 모두 설계하는 방식보다, 실제 업무를 시작하고 진행하면서 필요한 Capability가 드러나는 방향이다.

### Caveat

다음은 아직 `OPEN QUESTION`이다.

- 무엇을 하나의 Operational Area로 보는가?
- 누가 어떤 Action으로 Operational Context를 시작하는가?
- Context가 언제 Navigation에 나타나는가?
- Workspace가 실제로 생성되는가, 기존 Surface가 깊어지는가?
- 사용하지 않게 된 Area를 어떻게 표현하는가?

따라서 Work-first Deepening을 Dynamic Navigation, 자동 Module 생성 또는 특정 IA 패턴과 동일시하지 않는다.

---

## 8. State Model Principles

**State: RESEARCHED → Caveat와 함께 승격**

### Evidence

- Retreat Source-backed Audit에서 Participant가 제출한 Registration 정보 위에 paid/unpaid, cancelled, Group Assignment와 Check-in 같은 Operator-managed State가 별도로 쌓였다.
- `RES-001`, `RES-005`, `RES-013`, `RES-019`는 Source Information, Participation, Assignment, Arrival과 Readiness가 서로 다른 운영 의미를 가질 수 있음을 보여준다.

### Product Definition

> **Participant Response 또는 Source Information과 Operational Current State는 동일한 것으로 취급하지 않는다.**

Participant가 제공한 응답은 중요한 Source다. 그러나 운영자는 확인, 판단, 배정, 변경과 현장 사실을 바탕으로 별도의 Current State를 관리할 수 있다.

예를 들어 참가자가 제출한 이동 희망, 참석 범위 또는 신청정보가 곧바로 운영자가 현재 사용하는 배정·도착·확정 상태와 같다고 가정하지 않는다.

### Caveat

- Source Information과 Current State를 어떤 항목에서 분리할지는 영역별 Research가 필요하다.
- 모든 Operational Area가 동일한 4단계 State Model을 따른다고 확정하지 않는다.
- 공통 State Machine, 상태명, 전이 규칙, 이력 및 충돌 해결 방식을 확정하지 않는다.
- 이 원칙을 Entity, Table 또는 API 구조로 번역하지 않는다.

---

## 9. Platform Core + Optional Capability Direction

**State: CONFIRMED direction / OPEN QUESTION at user model**

### Evidence

- `DEC-009`: 다양한 Event에서 반복되는 Platform Core와 특정 Context에 필요한 Event-specific Capability / Module의 두 층을 구분하는 방향이 확정돼 있다.
- Gate는 이 방향을 유지하면서도 Module과 사용자 Mental Model / IA의 관계는 확정하지 않았다.

### Product Definition

제품은 **Platform Core + Optional Capability / Module** 방향을 유지한다.

- **Platform Core:** 여러 Event에서 공통으로 반복되는 제품 능력의 방향.
- **Optional Capability / Module:** 특정 Operational Need가 생길 때 필요한 추가 능력의 방향.

### Boundary

- `Module`은 현재 기술 Plugin Architecture를 뜻하지 않는다.
- Module이 사용자에게 동일한 이름의 메뉴, Workspace 또는 On/Off 설정으로 노출돼야 한다는 뜻이 아니다.
- Platform Core의 세부 Feature, Optional Capability 목록, Packaging과 구매 단위를 확정하지 않는다.

### Open Question

**Module과 사용자 Mental Model / IA의 관계는 OPEN QUESTION이다.**

제품 내부의 Capability 구분이 사용자에게도 같은 경계로 이해되는지, 아니면 사용자는 Job과 Current State 중심으로 인식하는지 추가 Research가 필요하다.

---

## 10. What Is Still NOT Defined

**State: OPEN QUESTION**

다음은 Product Definition v0.1이 확정하지 않는다.

- 최초 Target Customer Segment와 최초 Target Event
- 최종 Product Scope와 MVP Scope
- 최종 Feature Set과 Screen 목록
- 최종 Information Architecture와 Navigation
- Operational Area와 Workspace의 구체적 구조
- Module과 사용자 Mental Model의 관계
- Organization / Workspace / Event 구조
- Participant Account Model
- 역할·권한 및 정보 접근의 상세 모델
- 공통 State Model과 상태 전이 규칙
- Integration Strategy와 Native App 필요 여부
- Offline 지원 수준과 AI 기능 포함 여부
- Pricing, Packaging과 Billing Unit
- Domain Model, Entity, Database Schema, API
- Technical Architecture, Infrastructure와 구현 기술

---

## 11. Active Research Questions

### HYPOTHESIS — Operational Lens

`Operational Lens`는 Event를 실제 운영 특성으로 이해하는 데 유용할 가능성이 있다. 그러나 현재 Complexity Dimensions는 Research Lens이며 Product Configuration, User-facing Filter, Event Score 또는 IA로 승격되지 않았다.

검증할 질문:

- 어떤 Operational Characteristics가 실제 운영시간, 오류, Stress와 Software Need를 가장 잘 설명하는가?
- 이 Lens가 Operator의 Mental Model과 맞는가?
- Lens를 제품에 노출하지 않고도 Product Decision에 활용할 수 있는가?

### HYPOTHESIS — Change Coordination

변경이 여러 State와 사람에게 미치는 영향을 줄이는 것이 중요한 Product Opportunity일 가능성이 있다. 그러나 `Change Coordination`은 아직 확정된 Product Capability나 Module이 아니다.

검증할 질문:

- 어떤 변경이 실제로 높은 Change Propagation Cost를 만드는가?
- 현재 대안이 놓치는 영향 대상은 무엇인가?
- 자동화가 사람의 판단을 침해하거나 새로운 관리 부담을 만들지 않는가?

### OPEN QUESTION — Module과 Mental Model / IA

- 사용자는 Capability를 Module로 이해하는가, Job으로 이해하는가, 결과 State로 이해하는가?
- Optional Capability가 Navigation에 항상 보여야 하는가?
- Work-first Deepening과 예측 가능한 Navigation을 어떻게 함께 만족시키는가?

### RESEARCHED — 추가 검증 필요

- Source Information과 Current State의 분리가 실제로 필요한 영역과 예외
- Minimal Event가 필요로 하는 최소 Context
- Operational Deepening을 시작하는 실제 사용자 Action
- 기존 KakaoTalk, Spreadsheet, Docs와 직접 Coordination보다 Software가 유리한 조건
- Human Recoverability가 높은 영역과 핵심 인물의 과로가 숨겨진 영역의 구분

---

## 12. Product Definition Boundaries

**State: CONFIRMED boundary**

이 문서의 역할은 현재 Product Discovery 결과에서 제품 정체성, 운영 원칙과 제한적으로 승격 가능한 구조 방향을 고정하는 것이다.

이 문서는 다음을 하지 않는다.

- Research Finding을 시장 전체의 사실로 일반화하지 않는다.
- 모든 Research Item을 Product Requirement로 바꾸지 않는다.
- `Operational Lens` 또는 `Change Coordination`을 확정 Capability로 선언하지 않는다.
- Optional Module을 사용자 IA나 기술 Plugin Architecture로 확정하지 않는다.
- 모든 Event에 동일한 Workflow 또는 State Model을 강제하지 않는다.
- 사람의 판단이 필요한 영역을 자동화 대상으로 전제하지 않는다.
- 최종 IA, Domain, DB, API 또는 Architecture를 결정하지 않는다.
- 구현 단계 진입을 승인하지 않는다.

다음 단계는 Product Definition v0.1의 Open Question을 Research와 UX Artifact로 검증하고, Product Scope와 MVP가 어떤 핵심 가설을 검증해야 하는지 정의하는 것이다. Technical Design과 Implementation은 충분한 Product Definition 이후에만 진행한다.
