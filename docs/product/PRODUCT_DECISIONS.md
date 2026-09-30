# Church Event Operations Platform — Product Decisions

> **2026-09-30 baseline:** DEC-001~027의 기존 본문·Status 보존. 새 DEC 생성 없음. 최신 요청의 제품명 SCENE 및 Technical Design / implementation 전 상태가 현재 기준이다. DEC-024/027의 단계와 §17 Product Name OPEN은 이전 이력이며 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)를 따른다. 공식 Decision Log 정합화는 검토 필요.
>
> DEC-027은 단계 설명에 한해 DEC-024를 대체한다고 기록하지만 DEC-024의 원래 CONFIRMED 표기는 보존한다. Evidence Type의 HYPOTHESIS 용어 충돌도 [검토 기록](../architecture/architecture-v0.1.md)에 남긴다.
> [Product Definition](PRODUCT_DEFINITION.md) · [Research](RESEARCH.md)

> **2026-09-30 후속 검토:** [이슈 #3 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902388629)에 근거한 접근·권한 방향을 DEC-028~030에 추가했다. [추가 답변](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902501911)의 전체 조회 범위와 화면·서버 일치 원칙은 해당 결정과 DEC-031에 반영했다. 앞의 baseline 설명은 문서 최초 정리 당시 이력이다. 확정 정책과 후속 작업은 [권한 검토](access-policy-review.md)에 기록한다.

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

## DEC-028 — 조직 관리자의 행사 조회와 행사 수정 권한을 구분한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 방향

### Context

조직 관리자에게 행사 진행 상황을 보고하는 업무가 있다.

### Decision

조직 관리자는 해당 행사 운영진이 아니어도 같은 조직 행사의 전체 정보를 조회한다. 참가자 개인정보·연락처·신청 답변·개인별 정산 상세 등 행사 데이터를 일부 숨기거나 별도 조회 허용 단계로 나누지 않는다. 이 조회 권한이 행사 수정 권한을 자동으로 부여하지 않는다. 조직 관리자는 앱과 운영진을 관리하는 사용자로 본다.

### Alternatives

행사 운영진에게만 조회를 허용하는 방식과 보고용 요약만 기본 제공하고 개인별 정보·정산 상세를 별도 허용하는 방식은 채택하지 않는다. 조회와 수정은 구분한다.

### Reason

조직 관리자가 행사 진행을 직접 확인할 수 있도록 한다. 사용자는 조직 관리자가 이미 교적 관리 과정에서 정보를 알고 있어 일부 정보를 숨길 필요가 없다고 설명했다.

### Consequence

조직 역할과 행사 작업 권한을 구분한다. 사용자 사례의 직책을 시스템 역할에 자동 매핑하지 않는다. 개인별 정보·정산 상세를 포함한 행사 전체 조회 방향은 확정한다. 시스템 역할 매핑·조회 계약은 기술 검토에서 정한다.

### Evidence

[최초 답변의 첫 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902388629), [추가 답변의 첫 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902501911).

---

## DEC-029 — 행사 운영진의 업무 권한을 사람별로 달리 부여한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 방향

### Context

조 편성·정산 등 특정 업무 정보가 필요 없는 운영진도 있다.

### Decision

행사 운영진의 조회·작업 권한은 담당 업무에 맞게 사람별로 달리 부여할 수 있어야 한다. 운영진이라는 이유만으로 조 편성·정산 등의 모든 정보를 제공하지 않는다.

### Alternatives

모든 행사 운영진에게 같은 정보와 작업 권한을 주는 방식은 사용자 답변의 방향으로 선택되지 않았다. 구체적인 권한 설정 UI와 기술 대안은 아직 비교·확정하지 않았다.

### Reason

사용자가 경험한 실제 행사 운영에서도 운영진별로 필요한 정보와 업무가 다르다.

### Consequence

기존 고정 Role → Permission Set 기준이 개별 권한 요구를 표현할 수 있는지 재검토한다. 개별 권한 저장 구조·부여자·기본값·회수 방식과 업무별 정확한 허용 집합은 OPEN이다.

### Evidence

[이슈 #3 사용자 답변의 두 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902388629).

---

## DEC-030 — 그룹 리더와 참가자의 정보 범위를 관계와 대상에 맞게 제한한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 방향

### Context

그룹 리더용 정보와 일반 참가자가 필요한 정보는 다르다.

### Decision

그룹 리더는 자기 그룹원의 전체 정보와 리더에게 공개된 정보를 본다. 연락처·신청 정보도 자기 그룹원 조회 범위에 포함한다. 일반 참가자는 자기 개인정보와 참가자용 공지·시간표를 본다. 운영진·리더용 정보를 일반 참가자에게 자동으로 제공하지 않는다.

### Alternatives

자기 그룹원의 이름·배정만 보여주고 연락처 등을 제한하는 안은 채택하지 않는다. 참가자에게 운영진·그룹 리더와 같은 범위의 정보를 자동 공개하지 않는다.

### Reason

그룹 리더가 자기 조원을 관리하는 데 필요한 전체 정보를 확인하고 일반 참가자는 자기 정보와 안내를 확인하도록 한다.

### Consequence

자기 정보·자기 그룹·공지 대상의 접근 경계를 구분한다. 자기 그룹원의 연락처·신청 정보를 포함한 전체 조회는 확정한다. 그룹 리더의 수정·Export 권한은 자동 부여하지 않으며 identity·Notice targeting 기술 방식은 별도 검토한다.

### Evidence

[최초 답변의 세 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902388629), [추가 답변의 두 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902501911).


---

## DEC-031 — 정보 분류를 유지하고 화면과 서버의 권한 판단을 일치시킨다

**Date:** 2026-09-30

**Status:** CONFIRMED

### Context

사용자가 정보 구분 추천안과 권한 없는 화면·서버 처리 설명을 검토했다.

### Decision

기존 PUBLIC / INTERNAL / PERSONAL / SENSITIVE / SECURITY 정보 분류를 유지하고, 실제 조회 범위는 DEC-028~030을 따른다. 조회 권한이 없는 메뉴·정보는 숨기고, 조회만 가능하면 읽기 전용, 업무 조건으로 실행 불가하면 이유와 함께 비활성화한다. 직접 URL 진입과 권한 회수 상황에도 화면과 서버가 같은 현재 권한·대상 범위를 적용한다.

### Alternatives

화면의 버튼만 숨기고 실제 데이터 요청은 허용하는 방식은 채택하지 않는다.

### Reason

사용자는 URL 등 다른 방식으로 접근할 수 있으므로 앞단과 뒷단의 권한 판단이 일치해야 한다고 답했다.

### Consequence

정보 분류만으로 승인된 조직 관리자·자기 그룹원 전체 조회를 축소하지 않는다. 기존 Permission·tenant·resource 검사를 유지한다. 조회 허용을 수정·공개·Export 허용으로 자동 확대하지 않는다.

### Evidence

[추가 답변의 세 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902501911).


---

## DEC-032 — 조직·행사 Owner는 복수 가능하며 같은 사람이 두 역할을 맡을 수 있다

**Date:** 2026-09-30

**Status:** CONFIRMED — 현재 전제

### Context

조직과 행사 책임자가 여러 명일 수 있고 같은 사람이 조직 운영과 행사 주관을 함께 맡는다.

### Decision

조직 Owner와 행사 Owner는 각각 복수 가능하다는 전제로 진행한다. 같은 사람이 두 역할을 함께 맡을 수 있다. 사용자는 조직 Owner를 단수로 제한할지는 고민 중이지만 현재는 복수를 전제로 진행하라고 답했다.

### Alternatives

조직 Owner를 한 명으로 제한하는 안은 현 단계에서 선택하지 않았다.

### Reason

사용자가 설명한 실제 조직·행사 운영 방식에 맞춘다.

### Consequence

조직 Owner와 행사 Owner를 서로 배타적인 사용자로 모델링하지 않는다. 조직 Owner라는 이유로 모든 행사 Owner·수정 권한을 자동 부여하지 않는다. 복수 관계를 반영하되 상세 cardinality·DB 제약은 기술 설계에서 정한다.

### Evidence

[이슈 #4 첫 번째 답변](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902713929).

---

## DEC-033 — Owner 위임은 수락과 인수인계 기간을 거친다

**Date:** 2026-09-30

**Status:** CONFIRMED — 업무 방향

### Context

인수인계 중 취소하는 일이 있어 위임 즉시 기존 책임자를 완전히 제거하는 방식은 적절하지 않다.

### Decision

넘기는 Owner가 시작하고 받는 사람이 수락한다. PENDING에서는 넘기는 사람이 취소하고 받는 사람은 거절한다. 수락 T0에 받는 사람이 즉시 정상 Owner가 되며 HANDOVER 14일 동안 넘기는 사람에게 해당 Owner·인수인계 권한을 유지한다. T0+14일에 넘기는 사람의 해당 권한을 종료하고 새 Owner는 유지한다. HANDOVER에서는 양쪽 모두 취소할 수 있다. COMPLETED 이후에는 취소할 수 없고 새 위임을 시작한다.

### Alternatives

수락 없이 권한을 이전하거나 위임 직후 넘기는 사람의 권한을 모두 회수하는 방식은 채택하지 않는다.

### Reason

사용자가 실제 인수인계에서 취소가 빈번하다고 설명했다.

### Consequence

수락·인수인계·취소·완료를 구분한다. 취소는 위임·인수인계 상태와 그 위임에 따른 권한·책임 이전만 복구하고 실제 행사 업무 데이터는 유지한다. 다른 조직·행사 역할과 별도 권한은 유지한다. 위임과 Membership 종료는 별도이며 인수인계 후 조직 이탈에도 남은 책임을 다시 검사한다. 기술 상세는 [검토 결과](owner-handover-review.md)에 정리한다.

### Evidence

[최초 세 번째 답변](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902713929), [추가 확정의 두 번째·세 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902838001).

---

## DEC-034 — 남은 행사 책임과 준비 업무는 수락된 인계 없이 버리지 않는다

**Date:** 2026-09-30

**Status:** CONFIRMED — 업무 방향

### Context

운영자가 탈퇴하거나 제거될 때 맡은 책임이 남을 수 있다.

### Decision

남은 행사 책임·준비 업무를 맡을 사람이 수락하지 않았다면 조직 탈퇴·멤버 제거를 허용하지 않는다. 마지막 Owner도 후임 수락 전 이탈할 수 없으며 경고·동의만으로 예외를 허용하지 않는다. 적합한 행사 담당 인계자가 없다면 조직 Owner가 책임을 받고 다른 사람에게 수락을 받아 인계할 수 있어야 한다.

### Alternatives

남은 책임을 처리하지 않고 운영자가 자유롭게 탈퇴하거나 제거되는 방식은 채택하지 않는다.

### Reason

사용자는 담당자가 임의로 이탈해 책임이 남는 것을 방지해야 한다고 답했다.

### Consequence

탈퇴·제거 전 미인계 책임과 인수자의 수락을 검사한다. 개인 이탈과 조직·행사 종료 및 데이터 삭제는 구분한다. 긴급 접근 차단은 DEC-035의 복구 흐름으로 처리하며 Membership 종료를 자동 실행하지 않는다.

### Evidence

[최초 네 번째 답변](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902713929), [추가 확정의 첫 번째·세 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902838001).


---

## DEC-035 — 조직 Owner는 행사 책임구조를 복구할 수 있다

**Date:** 2026-09-30

**Status:** CONFIRMED

### Context

행사 책임자의 부재·중단 또는 긴급 접근 차단 후에도 책임자를 지정할 수 있어야 한다.

### Decision

조직 Owner가 복구를 시작하고 새 행사 Owner를 지정한다. 대상자가 수락하면 책임을 이전한다. 긴급 상황에서는 기존 담당자 접근을 먼저 차단하고 행사에 책임자 지정 필요 상태를 표시한 뒤 새 Owner를 지정할 수 있다.

### Alternatives

조직 Owner를 모든 행사의 상시 Owner로 자동 지정하는 방식은 채택하지 않는다.

### Reason

행사 책임구조를 복구하는 관리 권한과 평소 행사 운영 권한을 구분한다.

### Consequence

긴급 접근 차단은 일반 탈퇴·제거와 구분하고 Membership 종료·실제 업무 데이터 삭제로 확대하지 않는다. 책임자 지정 필요의 저장 방식은 기술 설계에서 정하며 행사 lifecycle enum을 새로 추가하지 않는다. 모든 조직 Owner가 접근 불가능한 경우는 별도 Account/Organization Recovery 정책으로 남긴다.

### Evidence

[이슈 #4 추가 확정의 네 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/4#issuecomment-5902838001).


---

## DEC-036 — 검증된 조직 생성자가 최초 Owner가 된다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조직 생성·가입·초대와 행사 운영자 접근 경계를 검토했다.

### Decision

검증된 운영계정 사용자가 이메일 인증과 조직 검색·중복 후보 확인을 거쳐 조직을 생성하면 최초 조직 Owner가 된다. 생성·운영 권한 확인을 받고 초기에는 별도 SCENE 승인·증명서 제출을 요구하지 않는다. Owner와 결제 담당자는 구분한다.

### Alternatives

생성자와 Owner를 분리하거나 결제자를 Owner로 고정하는 안은 채택하지 않는다.

### Reason

조직 생성의 책임자를 명확히 하면서 초기 진입 부담을 줄인다.

### Consequence

복수 Owner 정책을 유지한다. 이메일 인증·중복 확인의 상세 계약은 후속 설계에서 정한다.

### Evidence

[이슈 #5 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/5#issuecomment-5902896850).


---

## DEC-037 — 조직 가입 요청은 Owner 승인, 대상자 초대는 수락으로 가입한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조직 생성·가입·초대와 행사 운영자 접근 경계를 검토했다.

### Decision

조직 검색 후 가입 요청은 조직 Owner가 승인·거절한다. 조직 Owner의 대상자 초대는 수락하면 추가 승인 없이 Membership이 성립한다. 초기 승인권은 조직 Owner에게만 있고 행사 Owner에게 자동 부여하지 않는다. 대기 사용자는 조직 내부 정보에 접근하지 못한다. 대상 이메일·조직·기본 접근 범위·만료·1회 사용 토큰을 갖는 초대를 사용한다.

### Alternatives

가입 요청과 초대에 동일한 이중 승인 절차를 적용하거나 무제한 공개 초대 링크를 사용하는 안은 채택하지 않는다.

### Reason

관계를 먼저 요청한 주체에 따라 확인 절차를 구분한다.

### Consequence

사용자 대기 요청 취소·거절 후 재신청, 초대 수락 전 취소·만료·재초대를 지원한다. 정확한 TTL과 재전송 계약은 후속 상세다. 7일은 사용자 제안값이다.

### Evidence

[이슈 #5 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/5#issuecomment-5902896850).


---

## DEC-038 — 중복 조직은 후보로 안내하며 이름만으로 생성 차단·자동 병합하지 않는다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조직 생성·가입·초대와 행사 운영자 접근 경계를 검토했다.

### Decision

생성 전 조직명·지역 등 최소 비교 정보로 중복 후보를 안내한다. 기존 조직 가입 요청 또는 다른 조직으로 새로 만들기를 선택할 수 있다. 이름만 같다고 생성을 차단하지 않고 중복 조직을 자동 병합하지 않는다.

### Alternatives

조직 이름 UNIQUE만으로 동일 조직을 판정하거나 자동 병합하는 안은 채택하지 않는다.

### Reason

같은 이름의 교회가 있을 수 있고 조직 병합은 권한·행사·결제·개인정보 관계를 함께 다뤄야 한다.

### Consequence

실제 중복 확인·이전·보관/종료는 별도 운영지원 복구 절차로 검토한다. 회원 제거는 기존 책임 인계 정책을 따른다.

### Evidence

[이슈 #5 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/5#issuecomment-5902896850).


---

## DEC-039 — 조직 소속 없이 특정 행사만 운영하는 협력자를 허용한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조직 생성·가입·초대와 행사 운영자 접근 경계를 검토했다.

### Decision

Organization Membership과 Event Role은 별개다. 조직 Member에게 행사 Role을 부여할 수 있고 조직 Membership 없이 특정 행사만 운영하는 Event-scoped Collaborator를 허용한다. 행사 초대는 해당 행사 접근만 부여하고 조직 가입은 별도로 처리한다.

### Alternatives

모든 행사 운영자에게 영구 조직 Membership을 강제하거나 행사 초대가 조직 소속을 자동 부여하는 안은 채택하지 않는다.

### Reason

임시 스태프·외부 협력자는 한 행사를 도울 수 있지만 조직 전체에 소속될 필요는 없다.

### Consequence

기존 user → member → event_user 필수 관계와 모든 추가에 memberId를 요구한 기준을 재검토한다. 운영계정과 Participant 구분·tenant·Permission 검사는 유지한다. 상세 관계·권한·API/DTO 계약은 후속 이슈에서 정한다.

### Evidence

[이슈 #5 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/5#issuecomment-5902896850).
