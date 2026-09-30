# Church Event Operations Platform — Product Decisions

> **2026-09-30 baseline:** DEC-001~027의 기존 본문·Status 보존. 이후 사용자 승인으로 DEC-028(O01 신청 수정 정책)을 추가했다. 최신 요청의 제품명 SCENE 및 Technical Design / implementation 전 상태가 현재 기준이다. DEC-024/027의 단계와 §17 Product Name OPEN은 이전 이력이며 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)를 따른다. 이전 Decision Log 정합화는 검토 필요.
>
> DEC-027은 단계 설명에 한해 DEC-024를 대체한다고 기록하지만 DEC-024의 원래 CONFIRMED 표기는 보존한다. Evidence Type의 HYPOTHESIS 용어 충돌도 [검토 기록](../architecture/architecture-v0.1.md)에 남긴다.
> [Product Definition](PRODUCT_DEFINITION.md) · [Research](RESEARCH.md)

> 이 문서는 프로젝트에서 **실제로 확정된 제품 의사결정만 기록하는 Decision Log**다.
>
> 아이디어나 Research Hypothesis는 확정사항으로 기록하지 않는다.
>
> 새로운 대화에서 이 문서를 읽은 ChatGPT는 아래 결정을 기본 전제로 사용해야 하며, 사용자 승인 없이 임의로 변경하지 않는다.

---

# 1. Decision Status

각 Decision은 다음 상태를 사용한다.

- `CONFIRMED` — 현재 제품 원칙 또는 방향으로 확정
- `SUPERSEDED` — 이후 다른 Decision에 의해 대체됨
- `DEPRECATED` — 더 이상 적용하지 않음

`HYPOTHESIS`, `RESEARCHED`, `VALIDATED` 상태는 이 문서가 아니라 `RESEARCH.md`에서 관리한다.

---

# 2. Product Identity

## DEC-001 — Event Operations Platform

**Status:** CONFIRMED

### Decision

제품의 핵심 정체성은 **Church Event Operations Platform**이다.

특정 수련회를 위한 단발성 애플리케이션으로 만들지 않는다.

### Reason

장기적으로 다양한 교회 Event의 운영 문제를 해결하는 상용 제품을 목표로 하기 때문이다.

---

## DEC-002 — Church Management System이 아니다

**Status:** CONFIRMED

### Decision

일반적인 Church Management System을 만드는 것을 목표로 하지 않는다.

다음은 핵심 제품 범위가 아니다.

- 상시 교적관리
- 매주 셀모임 관리
- 주일 출석관리
- 목양 CRM
- 헌금관리 중심 기능

### Reason

제품의 핵심 Problem Space를 Event Operations에 집중시키기 위함이다.

---

# 3. Supported Event Direction

## DEC-003 — 특정 Event Type에 종속하지 않는다

**Status:** CONFIRMED

### Decision

제품은 특정한 수련회 Workflow에 하드코딩하지 않는다.

장기적으로 다음과 같은 Event를 고려한다.

- 수련회
- 비전트립
- 아웃리치
- 단기선교
- 성경학교
- 캠프
- 워크숍
- 기타 교회 특별 Event

### Constraint

초기 제품에서 모든 Event Type을 지원한다는 의미는 아니다.

---

## DEC-004 — 일상적인 반복 모임은 핵심 대상이 아니다

**Status:** CONFIRMED

### Decision

매주 반복되는 일반적인 모임보다 **명확한 시작과 종료가 존재하며 별도의 준비와 운영이 필요한 Event**를 중심으로 한다.

예:

- 대규모 비전트립
- 수련회
- 아웃리치
- 캠프
- 소규모 임원 MT/워크숍

---

# 4. Product Development Process

## DEC-005 — Product Discovery를 개발보다 우선한다

**Status:** CONFIRMED

### Decision

요구사항, 사용자, 문제, Workflow, Information Architecture, UX가 충분히 정의되기 전에 Backend/Frontend 구현을 시작하지 않는다.

### Forbidden Premature Work

- DB Schema 확정
- Entity 설계
- API 설계
- 구현 중심 논의
- Infrastructure 구축

### Reason

과거처럼 기능 개발을 먼저 한 뒤 제품 방향을 맞추는 방식이 아니라 실제 판매 가능한 제품을 설계하기 위함이다.

---

## DEC-006 — Product Research와 UX Design을 병렬적으로 진행할 수 있다

**Status:** CONFIRMED

### Decision

초기 화면과 User Flow를 Research 이후에만 만드는 선형 방식으로 진행하지 않는다.

다음 Loop를 허용한다.

Research  
→ UX Hypothesis  
→ Wireframe / Concept  
→ User Feedback  
→ Research  
→ Revision

### Reason

화면 자체를 Research Artifact로 활용할 수 있기 때문이다.

---

# 5. Evidence

## DEC-007 — 경험과 시장 사실을 구분한다

**Status:** CONFIRMED

### Decision

사용자의 개인적인 Event 운영 경험은 중요한 Evidence지만 시장 전체의 사실로 자동 일반화하지 않는다.

### Evidence Types

- EXPERIENCE
- INTERVIEW
- SURVEY
- OBSERVATION
- HYPOTHESIS

---

## DEC-008 — Product State를 명시한다

**Status:** CONFIRMED

### Decision

기능, 화면, 문제, 아이디어를 다음 상태로 구분한다.

- HYPOTHESIS
- RESEARCHED
- VALIDATED
- CONFIRMED
- DEFERRED
- REJECTED

ChatGPT는 사용자 승인 없이 상태를 `CONFIRMED`로 승격하지 않는다.

---

# 6. Product Architecture Direction

## DEC-009 — Platform Core + Optional Module 방향

**Status:** CONFIRMED

### Decision

제품은 장기적으로 다음 두 층을 구분한다.

### Platform Core

다양한 Event에서 공통으로 반복되는 운영 능력.

### Event-specific Capability / Module

특정 Event에서만 필요한 Workflow.

### Constraint

실제 Research 전에 기술적인 Plugin Architecture나 지나친 추상화를 만들지 않는다.

---

## DEC-010 — 범용화를 위해 무한한 Configuration을 만들지 않는다

**Status:** CONFIRMED

### Decision

"교회마다 다르다"는 이유로 초기부터 모든 것을 설정 가능하게 만들지 않는다.

Repeated Evidence가 있는 차이만 제품 구조에 반영한다.

### Principle

> Convention before Configuration.

좋은 기본값을 먼저 제공하고 실제 필요성이 확인될 때 Configuration을 늘린다.

---

# 7. User Scope

## DEC-011 — 관리자만을 위한 제품이 아니다

**Status:** CONFIRMED

### Decision

제품의 주요 가치는 준비팀과 운영진에게 집중될 가능성이 크지만 Participant Experience도 제품의 일부로 취급한다.

참가자는 권한이 제한되어 있더라도 자신의 Event 정보를 쉽게 확인할 수 있어야 한다.

예:

- 신청 정보
- 일정
- 공지
- 준비물
- 이동 정보
- 소속 팀/조
- 필요한 개인 안내

---

## DEC-012 — Buyer, Operator, Participant를 구분한다

**Status:** CONFIRMED

### Decision

제품 기획에서 다음을 동일 사용자로 취급하지 않는다.

- Buyer
- Event Owner / Leadership
- Operator
- Group Leader
- Participant

각 사용자의 Problem과 Product Value를 별도로 검토한다.

---

# 8. UX Direction

## DEC-013 — Participant는 Mobile First

**Status:** CONFIRMED

### Decision

일반 참가자의 UX는 Mobile First를 기본으로 한다.

별도의 사용법 학습 없이 사용할 수 있는 수준을 목표로 한다.

---

## DEC-014 — Operator는 Desktop + Mobile Context를 모두 고려한다

**Status:** CONFIRMED

### Decision

운영자의 업무 환경을 하나의 Device에 고정하지 않는다.

### Preparation

Desktop이 효율적인 업무가 많을 수 있다.

### Event Day

Mobile / Tablet이 핵심이 될 수 있다.

따라서 기능별 Usage Context를 분석한다.

---

## DEC-015 — 현장 UX를 독립적인 Context로 본다

**Status:** CONFIRMED

### Decision

사전 준비 화면이 잘 동작한다는 이유로 현장에서도 좋은 UX라고 판단하지 않는다.

현장에서는

- 시간 압박
- 한 손 사용
- 낮은 집중력
- 참가자 밀집
- 네트워크 문제
- 긴급 변경

등을 고려한다.

---

# 9. Information Strategy

## DEC-016 — Single Source of Truth를 핵심 방향 중 하나로 본다

**Status:** CONFIRMED

### Decision

Event 운영 핵심 정보가 개인의 기억과 여러 채팅방·문서에 분산되지 않도록 구조화하는 것을 중요한 제품 방향으로 삼는다.

### Constraint

모든 외부 문서를 제품 안에 복제하지 않는다.

외부 서비스가 더 적절하다면 Integration을 검토한다.

---

# 10. Commercial Product

## DEC-017 — 실제 유료 제품을 목표로 한다

**Status:** CONFIRMED

### Decision

이 프로젝트는 포트폴리오 데모를 최종 목표로 하지 않는다.

실제 교회 및 기독교 조직이 비용을 지불하는 상용 제품을 목표로 한다.

따라서 Product Decision에서 다음까지 고려한다.

- Buyer
- Pricing
- Packaging
- Sales
- Onboarding
- Customer Support
- Retention
- Operational Cost
- Service Reliability

---

## DEC-018 — Pricing을 아직 확정하지 않는다

**Status:** CONFIRMED

### Decision

다음과 같은 Pricing Option을 검토할 수 있으나 현재 확정하지 않는다.

- Event 기반
- Organization Subscription
- 참가자 수 기반
- Tier 기반
- Platform + Module
- Hybrid

Research와 Pilot 결과를 통해 판단한다.

---

# 11. Security / Privacy

## DEC-019 — 개인정보 보호는 Core Requirement다

**Status:** CONFIRMED

### Decision

Privacy와 Security는 개발 완료 후 추가하는 요소가 아니라 Product Design 단계부터 고려한다.

### Principles

- Data Minimization
- Least Privilege
- Server-side Authorization
- Access Logging
- Retention Policy
- Secure Export
- Sensitive Screen Protection

---

## DEC-020 — "교회니까 괜찮다"는 보안 기준을 허용하지 않는다

**Status:** CONFIRMED

### Decision

사용자들이 서로 아는 관계라는 이유로 개인정보 보호나 권한 통제를 완화하지 않는다.

---

# 12. Product Quality

## DEC-021 — 코드 동작을 Feature 완료 기준으로 사용하지 않는다

**Status:** CONFIRMED

### Decision

실제 서비스 Feature에는 필요에 따라 다음을 함께 검토한다.

- UX
- Error State
- Empty State
- Failure Scenario
- Authorization
- Privacy
- Logging
- Test
- Monitoring
- Documentation
- Operational Procedure

---

# 13. Project Standard

## DEC-022 — "대기업 수준"은 프로세스의 정교함을 의미한다

**Status:** CONFIRMED

### Decision

불필요하게 많은 문서를 만드는 것을 목표로 하지 않는다.

대신 다음을 중요하게 여긴다.

- Evidence
- Decision History
- User Research
- Alternative Comparison
- Risk
- Ownership
- Validation
- Measurement
- Operational Readiness

---

# 14. Intellectual Property

## DEC-023 — 타인의 지적재산을 침해하지 않는다

**Status:** CONFIRMED

### Decision

경쟁 서비스나 타 제품을 Research 및 Benchmark할 수 있지만

- 디자인의 직접 복제
- 소스 코드 도용
- 브랜드 자산 무단 사용
- 저작물 무단 복제

등은 제품 개발 방식으로 사용하지 않는다.

경쟁 제품에서는 **문제 해결 방식과 Product Insight**를 학습한다.

---

# 15. Current Phase

## DEC-024 — 현재는 Product Discovery 단계다

**Status:** CONFIRMED

### Decision

현재 우선순위는 구현이 아니다.

주요 작업은 다음이다.

- Product Foundation
- Problem Space
- Experience Review
- User Research
- Survey
- Interview
- Current Workflow
- Pain Point
- UX Hypothesis
- Concept Screen
- Validation

Technical Design은 충분한 Product Definition 이후 진행한다.

---

# 16. Decision Log 추가 규칙

새로운 Decision을 추가할 때 다음 형식을 사용한다.

## DEC-XXX — Decision Title

**Date:** YYYY-MM-DD  
**Status:** CONFIRMED

### Context

왜 이 결정이 필요했는가?

### Decision

무엇을 결정했는가?

### Alternatives

어떤 대안을 검토했는가?

### Reason

왜 이 선택을 했는가?

### Consequence

이 결정으로 무엇이 달라지는가?

### Evidence

어떤 Evidence가 있었는가?

---

# 17. Open Decisions

다음 항목은 아직 확정하지 않는다.

- 최초 Target Customer Segment
- 최초 Target Event Type
- MVP Scope
- Product Name
- Pricing Model
- Organization / Workspace 구조
- Event Module 구분
- Participant Account Model
- Billing Unit
- Integration Strategy
- Native App 필요 여부
- Offline 지원 수준
- AI 기능 포함 여부

별도 Research와 Product Definition을 통해 결정한다.

---

# 18. Product Definition Gate v0.1 동기화

> **Gate date:** 2026-08-31  
> **Product Definition:** `PRODUCT_DEFINITION.md` v0.1
>
> 이 절은 기존 Decision을 삭제하거나 재작성하지 않고 Gate 이후 승격된 최소 결정과 현재 단계만 추가한다. `RESEARCHED`, `HYPOTHESIS`, `OPEN QUESTION`의 세부 상태는 `PRODUCT_DEFINITION.md`에서 관리하며, 이 Decision Log에 확정 Decision으로 올리지 않는다.

## DEC-025 — Not Used ≠ Incomplete

**Date:** 2026-08-31  
**Status:** CONFIRMED

### Context

Event마다 실제로 필요한 Operational Area가 다르며, 낮은 복잡도의 Event에 사용하지 않는 영역까지 Setup 또는 완료 대상으로 강제하면 불필요한 운영 부담이 생길 수 있다.

### Decision

> 사용하지 않는 운영영역은 미완료가 아니다.

특정 Capability 또는 Operational Area가 한 Event에서 필요하지 않다면, 그 미사용 상태를 Event Setup 누락이나 완료도 부족으로 취급하지 않는다.

### Alternatives

- 모든 Event에 동일한 운영영역과 완료 조건을 강제
- Event 시작 전에 필요한 모든 Module을 선택하도록 요구

### Reason

Leadership Event와 일부 Outreach의 Negative Evidence는 모든 Event에 같은 Software 구조가 필요한 것이 아님을 보여준다. Product Definition Gate v0.1에서 이 원칙을 `CONFIRMED`로 판정했다.

### Consequence

- Product completion을 사용하지 않는 Area의 활성화 여부로 판단하지 않는다.
- Event Type별 고정 Feature Set이나 사전 Module 선택을 전제하지 않는다.
- 구체적인 IA, Navigation, Workspace 생성 규칙은 이 결정으로 확정하지 않는다.

### Evidence

- Product Definition Gate v0.1
- `Problem Cluster Synthesis v0.1`의 Negative Evidence
- `13-Year Cross-event Experience Analysis v0.1`의 Leadership MT 및 일부 Outreach 사례

---

## DEC-026 — Product Definition v0.1을 현재 기준선으로 사용한다

**Date:** 2026-08-31  
**Status:** CONFIRMED

### Context

Operational Structure Research와 Product Definition Gate를 거치며 확정 원칙과 제한적으로 승격 가능한 Research 결과, 계속 열어둘 가설을 한 문서에서 구분할 필요가 생겼다.

### Decision

`PRODUCT_DEFINITION.md` v0.1을 현재 Product Definition 기준선으로 사용한다.

이 기준선은 다음 상태를 보존한다.

- `Platform Core + Optional Capability / Module`: `CONFIRMED` 방향 유지. `DEC-009`를 변경하지 않는다.
- `Minimal Event`: `RESEARCHED`. “사전 Operational Workspace 선택·구성 없이 시작 가능”만 제한적으로 포함한다.
- `Work-first Operational Deepening`: `RESEARCHED`. 실제 운영 Job이 생길 때 Context가 깊어진다는 방향만 Caveat와 함께 포함한다.
- `State separation`: `RESEARCHED`. Participant Response / Source Information과 Operational Current State를 동일시하지 않는 원칙만 Caveat와 함께 포함한다.

### Alternatives

- Gate 결과 전체를 모두 `CONFIRMED` Decision으로 승격
- 추가 Research가 끝날 때까지 Product Definition 작성을 보류
- Figma Gate만 기준으로 사용하고 문서 기준선을 만들지 않음

### Reason

현재 Evidence가 허용하는 제품 방향은 고정하되, 메커니즘과 범용성이 아직 검증되지 않은 항목의 Research State를 보존하기 위함이다.

### Consequence

- Product Definition에 포함됐다는 이유만으로 `RESEARCHED` 항목을 `CONFIRMED`로 해석하지 않는다.
- Minimal Event의 최종 Core IA, Operational Area 정의, Navigation / Workspace 생성 규칙과 공통 State Model은 계속 미정이다.
- Module이 사용자 Mental Model / IA에 그대로 노출돼야 하는지는 `OPEN QUESTION`으로 유지한다.
- `Operational Lens`와 `Change Coordination`은 `HYPOTHESIS`로 유지하며 Decision으로 승격하지 않는다.

### Evidence

- Product Definition Gate v0.1
- `RESEARCH.md`
- `Problem Cluster Synthesis v0.1`
- `Event Operational Complexity Dimensions v0.2`
- `13-Year Cross-event Experience Analysis v0.1`
- `Retreat v0.9 Product Audit — Source-backed Second Pass`

---

## DEC-027 — 현재 단계는 초기 Product Definition v0.1이다

**Date:** 2026-08-31  
**Status:** CONFIRMED

### Context

`DEC-024` 이후 Product Definition Gate v0.1을 통과하고 초기 Product Definition 문서를 만들었다. 현재 단계를 과거의 Discovery 설명에만 두거나 곧바로 Technical Design / Implementation으로 해석하지 않도록 상태를 갱신할 필요가 있다.

### Decision

현재 Phase는 **Product Discovery에서 Product Definition Gate를 통과한 뒤의 초기 Product Definition v0.1 단계**다.

이 Decision은 현재 Phase 설명에 한해 `DEC-024`를 대체한다. `DEC-024`의 Discovery 우선 원칙과 구현 선행 금지는 계속 적용한다.

### Alternatives

- Product Discovery 단계로만 계속 표시
- Product Definition Gate 통과를 Technical Design 또는 Implementation 진입으로 해석

### Reason

현재 진행 상태를 정확히 반영하면서도, 아직 해결되지 않은 Product Scope와 UX / Business 질문보다 Engineering이 앞서지 않도록 하기 위함이다.

### Consequence

- 최종 IA, Domain Model, DB Schema, API와 Architecture는 미정이다.
- MVP Scope, Pricing / Packaging과 최초 Target Segment도 미정이다.
- Technical Design 및 Implementation 단계로 진입하지 않는다.

### Evidence

- Product Definition Gate v0.1
- `PRODUCT_DEFINITION.md` v0.1

---

## DEC-028 — O01 신규 신청 마감과 자기 신청 수정 마감 분리

**Date:** 2026-09-30

**Status:** CONFIRMED

### Decision

사용자가 다음 정책안을 승인했다.

- 신규 신청 마감과 기존 신청의 수정 마감은 별도로 설정한다. 신규 신청이 마감됐다는 이유만으로 기존 신청 수정을 금지하지 않는다.
- 수정 마감 전에는 이름·참석 범위 수정을 허용한다.
- 휴대폰 번호 변경은 새 번호 재인증을 완료한 뒤에만 저장한다. 재인증 없이 기존 연락처를 덮어쓰지 않는다.
- 수정 마감 이후에는 직접 수정 대신 운영팀 문의를 안내한다. 기존 접수 내역은 유지한다.

### Consequence

행사별 실제 마감 시각은 별도 운영 설정이며 이번 결정은 특정 날짜나 시각을 고정하지 않는다. 취소·행사 종료·운영 배정·결제 정책을 이 결정으로 변경하지 않는다. 신청 수정이 운영자의 배정 상태를 자동 변경한다는 의미도 아니다.

Figma의 시간 상태와 인증 성공은 테스트 변수·fixture로 표현한다. 실제 서비스에서는 서버에서 수정 시한을 재확인하고, 새 번호 인증 결과가 변경 대상 번호와 연결되었는지 검증해야 한다. 프로토타입의 확인 버튼은 실제 SMS 인증 구현이 아니다.

### Evidence

- 사용자 승인: 신규·수정 마감 분리, 이름·참석 범위 수정, 새 휴대폰 재인증, 수정 마감 후 운영팀 문의 제안에 대한 “ㅇㅇ” 응답.
- 관련 이슈: [D05 #17](https://github.com/BeomhyunPark/SCENE/issues/17).
- [Figma 반영 스크립트](../design/o01-figma-policy-update.figma.js) · [O01 검증 기록](../test_results/2026-09-30-o01-policy.md).
