# Church Event Operations Platform — Product Decisions

> **2026-09-30 baseline:** DEC-001~027의 기존 본문·Status 보존. 최초 정리 당시에는 새 DEC를 만들지 않았고, 이후 검토에서 DEC-028~059를 추가했다. 2026-10-01 #11·#12 기술 계약으로 DEC-060~061을, 2026-10-02 #31 업무·체크리스트 저장 계약으로 DEC-062를 추가했다(현재 마지막 번호 DEC-062). 최신 요청의 제품명 SCENE 및 Technical Design / implementation 전 상태가 현재 기준이다. DEC-024/027의 단계와 §17 Product Name OPEN은 이전 이력이며 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)를 따른다. 공식 Decision Log 정합화는 검토 필요.
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

모든 행사 운영진에게 같은 정보와 작업 권한을 주는 방식은 사용자 답변의 방향으로 선택되지 않았다. 구체적인 권한 설정 UI와 기술 대안은 아직 비교·확정하지 않았다. (2026-10-02 기술 방식은 아래 Consequence 보강으로 정했다. 권한 설정 UI는 미정.)

### Reason

사용자가 경험한 실제 행사 운영에서도 운영진별로 필요한 정보와 업무가 다르다.

### Consequence

기존 고정 Role → Permission Set 기준이 개별 권한 요구를 표현할 수 있는지 재검토한다. 개별 권한 저장 구조·부여자·기본값·회수 방식과 업무별 정확한 허용 집합은 OPEN이다.

- (2026-10-02 보강, 현 결정, SCENE 개발 리드 전달) Event 권한은 `event_users` role의 기본 Permission Set에 사람별 `event_user_permissions` GRANT/REVOKE를 더하고 뺀 effective 집합이다. role 기본 집합은 Java enum mapping으로 두고, 고정 Role만으로 권한이 정해진다는 기존 기준을 대체한다.
- (2026-10-02 보강) 부여·회수는 Event Owner만 한다. OWNER 권한은 override하지 않고, Owner 위임·행사 삭제 요청·개인정보 정리·권한 관리 등 OWNER 전용 권한은 다른 운영자(행사 전용 협력자 포함)에게 부여하지 않는다. role 변경과 운영자 제거 시 해당 운영자의 override는 사라진다. 서버가 모든 요청에서 effective 집합으로 판정하고 변경마다 audit을 남긴다.
- (2026-10-02 보강) 위 OPEN 중 저장 구조·부여자·회수 방식은 해소했다. role별 기본 집합과 업무별 정확한 허용 집합(Permission 키 목록 초안)은 계속 확인이 필요하다. 테이블은 Flyway V1 초기 스키마에 포함하며(SCENE Backend Lead) 상세 계약은 아키텍처 문서의 2026-10-02 절에 둔다.

### Evidence

[이슈 #3 사용자 답변의 두 번째 항목](https://github.com/BeomhyunPark/SCENE/issues/3#issuecomment-5902388629), 2026-10-02 현 결정(SCENE 개발 리드 전달, 테이블 형태는 SCENE Backend Lead와 합의).

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

사용자 대기 요청 취소·거절 후 재신청, 초대 수락 전 취소·만료·재초대를 지원한다. 정확한 TTL과 재전송 계약은 후속 상세다. 7일은 사용자 제안값이다. (2026-10-01 DEC-060에서 초대 TTL 7일과 재전송 계약을 확정했다.)

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


---

## DEC-040 — 조 편성의 작업본 저장과 참가자 공개를 분리한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 저장·공개와 참가자 안내 범위를 검토했다.

### Decision

Working State와 Published State를 구분한다. 저장은 작업 보존이며 참가자·일반 조장에게 자동 노출하거나 안내하지 않는다. 공개 후 수정하면 미공개 변경 있음 상태가 되고 다시 공개하기 전까지 직전 공개본을 제공한다. 공개는 한 번에 반영하며 마지막 공개 시각·미공개 변경 건수·이전 편성 표시 안내·변경사항 공개 행동을 제공한다.

### Alternatives

저장 즉시 참가자에게 공개하는 방식 대신 별도 공개 실행을 사용한다.

### Reason

운영자가 재편성하는 중간 상태를 참가자에게 노출하지 않고 공식 안내 시점을 선택한다.

### Consequence

작업본과 공개본의 저장·버전·스냅샷 구현, 공개 권한과 API는 후속 설계한다.

### Evidence

[이슈 #6 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/6#issuecomment-5903217761).


---

## DEC-041 — 일부 배정도 저장·공개하며 미배정 공개는 경고와 확인을 받는다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 저장·공개와 참가자 안내 범위를 검토했다.

### Decision

부분 배정·미배정이 남아 있어도 저장한다. 공개도 가능하되 활성 미배정자의 수와 참가자에게 보일 상태를 경고하고 명시적 확인을 받는다. 취소 참가자는 완료 검사·공개 명단에서 제외한다. 부분 참석자는 배정됐다면 일반 배정처럼 공개한다.

### Alternatives

전체 배정 완료를 저장·공개의 필수 조건으로 강제하는 방식 대신 미배정 경고와 공개 확인을 사용한다.

### Reason

늦은 신청·참석 확인·판단 보류 때문에 전체 배정 완료를 기다리지 않고 확정된 편성을 안내할 수 있어야 한다.

### Consequence

인증·권한·유효성 검사는 유지한다. 이후 #7의 DEC-044에서 취소자의 활성 편성·공개 명단·조장 조회 즉시 제외를 확정했다.

### Evidence

[이슈 #6 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/6#issuecomment-5903217761).


---

## DEC-042 — 공개와 안내 전달을 구분하고 변경 영향에 따라 안내 대상을 정한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 저장·공개와 참가자 안내 범위를 검토했다.

### Decision

최초 공개는 대상 참가자·조장에게 안내한다. 이후 변경 공개는 실제 영향을 받은 참가자와 기존·신규 조장에게 안내한다. 내부 저장은 안내를 발생시키지 않는다. A의 1조→3조 변경은 A·1조 조장·3조 조장에게 안내한다.

### Alternatives

저장마다 또는 변경과 무관하게 모든 참가자에게 안내하는 방식 대신 공개 시 영향 대상을 식별한다.

### Reason

변경을 알아야 할 사람이 안내를 받고 관련 없는 전체 참가자는 반복 안내를 받지 않도록 한다.

### Consequence

전달 채널·실패·재시도·중복 방지·공개와 알림의 기술 경계는 후속 검토한다.

### Evidence

[이슈 #6 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/6#issuecomment-5903217761).


---

## DEC-043 — 참가자와 일반 조장은 공개본을 조회하며 준비 중 접근은 업무 권한으로 구분한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 저장·공개와 참가자 안내 범위를 검토했다.

### Decision

일반 참가자는 자기 공개된 배정과 참가자용 정보만 본다. 일반 조장은 공개된 자기 조 명단과 #3에서 허용한 자기 조원 전체 정보·리더용 정보를 본다. 편성 작업 권한을 가진 조장·운영자는 준비 중 편성도 조회한다. 참가자 화면은 준비 중·아직 미배정·현재 배정을 구분하고 공개된 배정의 마지막 갱신 시각을 제공한다.

### Alternatives

일반 조장 역할만으로 준비 중 편성을 조회하는 방식 대신 편성 업무 권한을 구분한다.

### Reason

공식 편성 기준의 접근 범위를 유지하고 참가자가 자신의 배정 상태와 정보 갱신 시점을 이해하도록 한다.

### Consequence

다른 조 개인정보·전체 명단을 참가자에게 자동 공개하지 않는다. 조직 관리자 전체 조회 원칙은 유지하며 겸임 권한 계약과 공개 시 조장 범위 전환·권한 회수는 후속 설계한다.

### Evidence

[이슈 #6 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/6#issuecomment-5903217761).


---

## DEC-044 — 참가 정보 변경은 배정을 검토하고 취소자는 즉시 활성 편성·조장 조회에서 제외한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 변경·동시 수정·실패 복구를 검토했다.

### Decision

배정을 무효화하지 않는 정보 변경은 기존 배정을 유지한다. 편성 판단에 영향을 주는 변경은 배정 검토 필요와 영향을 표시하고 운영자가 유지·이동·미배정을 결정한다. 취소자는 재공개를 기다리지 않고 활성 편성·공개 명단·조장 조회에서 즉시 제외하며 과거 기록은 보존한다. 복귀 시 과거 조를 자동 복원하지 않고 참고값으로 운영자에게 제시한다.

### Alternatives

정보 변경마다 자동으로 미배정 처리하거나 취소자의 접근 제외를 다음 공개까지 미루는 방식을 채택하지 않는다.

### Reason

운영자 배정 판단을 유지하면서 현재 참가 자격·접근 상태를 공개본 유지보다 우선한다.

### Consequence

과거 기록은 보존하되 일반 조장 조회 근거로 사용하지 않는다. 변경 검토 조건과 복귀 확인 계약은 후속 설계한다.

### Evidence

[이슈 #7 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/7#issuecomment-5903652283), [검토 결과](group-change-recovery-review.md).


---

## DEC-045 — 배정 변경의 영향을 식별하고 관련 운영정보의 재검토를 안내한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 변경·동시 수정·실패 복구를 검토했다.

### Decision

영향 참가자·이전/신규 조장·조별 현황·조 단위 안내 대상·배정을 참조하는 운영정보를 식별해 보여준다. 숙소·차량 등 실제 의존 정보는 필요한 재검토를 안내하며 무조건 자동 수정하지 않는다.

### Alternatives

조 이동에 따라 관련 배정을 일괄 자동 변경하는 방식 대신 의존 감지와 재검토 안내를 구분한다.

### Reason

관련 업무의 변경 누락을 줄이면서 숙소·차량 등의 별도 판단을 유지한다.

### Consequence

실제 참조 관계와 영향 감지 범위는 후속 기술 계약이다. 작업본 이동과 공식 공개 반영 시점은 #6을 따른다.

### Evidence

[이슈 #7 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/7#issuecomment-5903652283), [검토 결과](group-change-recovery-review.md).


---

## DEC-046 — 오래된 저장의 조용한 덮어쓰기를 금지하고 공개 버전을 재확인한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 변경·동시 수정·실패 복구를 검토했다.

### Decision

최신 상태와 내 변경을 비교한다. 같은 대상 충돌은 사용자 확인 후 해결하고 판단하기 어려우면 저장을 거절한다. 안전하게 병합할 수 있는 비충돌 변경은 유지할 수 있다. 공개 확인 이후 현재 편성이 달라지면 최신 내용을 다시 확인해야 한다. 화면 열기만으로 전체 편성을 독점 잠그지 않는다.

### Alternatives

마지막 저장이 이전 변경을 조용히 덮어쓰는 방식이나 화면 전체 독점 잠금을 채택하지 않는다.

### Reason

여러 운영자의 작업을 보존하고 실제 공개되는 편성을 사용자가 확인하도록 한다.

### Consequence

버전 단위·병합·검사 형식은 후속 설계한다. Presence는 보조 제안이며 필수 구현으로 확정하지 않는다.

### Evidence

[이슈 #7 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/7#issuecomment-5903652283), [검토 결과](group-change-recovery-review.md).


---

## DEC-047 — 저장·공개 결과와 알림 결과를 구분하며 재시도 중복 반영을 막는다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 변경·동시 수정·실패 복구를 검토했다.

### Decision

확실한 저장 실패는 변경을 기기에 임시 보관하고 재시도한다. 결과 불명은 서버 반영 여부 확인 후 이미 반영됐다면 성공 처리하고 없으면 재시도한다. 공개 실패는 작업본과 이전 공개본을 유지한다. 공개 성공·알림 실패는 실패 알림만 재전송하고 공개를 재실행하지 않는다. 동일 작업 재시도로 변경·공개가 중복 반영되지 않아야 한다.

### Alternatives

응답 유실을 무조건 실패로 간주해 즉시 중복 요청하거나 알림 실패 때문에 공개를 다시 실행하는 방식을 채택하지 않는다.

### Reason

네트워크 장애가 중복 변경이나 공식 편성의 되돌림으로 이어지지 않도록 한다.

### Consequence

key·TTL·반영 확인·알림 추적·임시 보관 방식과 개인정보 처리 계약은 후속 설계한다. 최초 공개 실패는 공개 전 상태를 유지한다.

### Evidence

[이슈 #7 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/7#issuecomment-5903652283), [검토 결과](group-change-recovery-review.md).


---

## DEC-048 — 편성 변경을 기록하고 되돌리기는 현재 상태의 새로운 역변경으로 처리한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

조 편성 변경·동시 수정·실패 복구를 검토했다.

### Decision

변경자·시간·대상·변경 전후를 기록한다. 되돌리기는 현재 상태에서 역변경·영향·충돌을 확인한 뒤 새로운 작업 변경으로 저장하고 필요하면 별도 공개한다.

### Alternatives

과거 전체 편성을 강제 복원하는 방식 대신 현재 상태의 역변경을 생성한다.

### Reason

후속 정상 변경을 보존하면서 되돌리기 영향도 확인한다.

### Consequence

현재 참가 자격·권한·동시성 검사를 유지한다. History schema·공개 기록 필드·보존 기간은 후속 설계한다.

### Evidence

[이슈 #7 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/7#issuecomment-5903652283), [검토 결과](group-change-recovery-review.md).


---

## DEC-049 — 행사 활성화·종료·재개는 Event Owner가 결정하고 조직 Owner의 복구 권한을 구분한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

행사 종료·보관·재개와 상태별 허용 행동을 검토했다.

### Decision

활성화·종료·재개는 Event Owner가 실행한다. Organization Owner는 Owner 부재·복구 등 조직 관리 상황에서 Override할 수 있다. ENDED 보관은 Event Owner 또는 Organization Owner가 실행한다.

### Alternatives

모든 운영자에게 전이를 자동 허용하거나 조직 전체 조회를 일상 행사 종료 권한으로 취급하지 않는다.

### Reason

일상 행사 책임과 조직의 복구·관리 책임을 구분한다.

### Consequence

전이 Permission·Override 조건·보관 해제 권한과 API는 상세 계약에서 정한다.

### Evidence

[이슈 #8 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/8#issuecomment-5903987318), [검토 결과](event-lifecycle-review.md).


---

## DEC-050 — 미완료 항목은 경고와 확인 후 행사 종료를 허용한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

행사 종료·보관·재개와 상태별 허용 행동을 검토했다.

### Decision

미완료 업무·미정산·미배정 등 운영상 미완료가 남아 있어도 종료 가능하다. 종료 전 현황·영향과 후속 정리 가능 안내를 제공하고 명시적 확인을 받는다.

### Alternatives

모든 업무 완료를 종료의 필수 조건으로 강제하지 않는다.

### Reason

실제 행사가 끝났어도 후속 정리 때문에 시스템에서 계속 진행 중으로 남는 상황을 줄인다.

### Consequence

현재 상태·인증·권한은 검사한다. 미사용 업무를 새로 시작하거나 회고를 작성하도록 강제하지 않는다.

### Evidence

[이슈 #8 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/8#issuecomment-5903987318), [검토 결과](event-lifecycle-review.md).


---

## DEC-051 — 종료 후 정산·후속 정리를 허용하고 현장 운영과 기록 정정을 구분한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

행사 종료·보관·재개와 상태별 허용 행동을 검토했다.

### Decision

ENDED에서 조회·정산·회고·후속 업무·후속 공지·감사 가능한 기록 정리를 허용한다. 참가 신청·체크인 및 취소 등 현장 작업·새 조 편성·참가자 재공개·현장 일정 운영은 차단한다. 마지막 공개 편성은 기록으로 유지한다. 기록 오류 정정은 일반 운영 변경과 구분하고 이유·이력을 남긴다.

### Alternatives

ENDED를 완전 읽기 전용으로 만들거나 현장 운영을 계속 허용하지 않는다.

### Reason

행사 후 정산·회고·후속 소통이 이어지는 실제 업무를 지원한다.

### Consequence

정정 가능한 필드·권한·계약, 종료 후 참가 취소/복귀·지연 알림 범위는 후속 설계한다. 현재 접근 회수·취소자 조회 제외를 유지한다.

### Evidence

[이슈 #8 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/8#issuecomment-5903987318), [검토 결과](event-lifecycle-review.md).


---

## DEC-052 — 종료 행사 재개는 사유를 기록하는 새로운 상태 전이다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

행사 종료·보관·재개와 상태별 허용 행동을 검토했다.

### Decision

Event Owner는 ENDED → ACTIVE로 재개할 수 있다. 중단된 운영 기능의 사용 가능성을 안내하고 실행자·시간·사유를 기록한다. Organization Owner Override는 복구 등 조직 관리 상황을 따른다.

### Alternatives

종료 전 데이터 전체를 Rollback하지 않는다.

### Reason

잘못 종료하거나 일정이 연장된 행사를 재개하면서 종료 후 정상 작업을 유지한다.

### Consequence

전이·신청 설정·동시성·실패 계약은 후속 설계한다. 재개가 모든 접수 설정을 자동 변경하는 결정은 아니다.

### Evidence

[이슈 #8 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/8#issuecomment-5903987318), [검토 결과](event-lifecycle-review.md).


---

## DEC-053 — 보관은 읽기 전용 기록 전환이며 보관 해제와 재개를 분리한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

행사 종료·보관·재개와 상태별 허용 행동을 검토했다.

### Decision

ENDED → ARCHIVED만 허용하고 ACTIVE 직접 보관은 차단한다. 남은 후속 업무는 강하게 경고하되 확인 후 보관 가능하다. 보관은 삭제가 아니며 기본 작업 목록에서 분리하고 보관 목록·검색으로 재진입한다. 다시 운영하려면 ARCHIVED → 보관 해제 → ENDED → 재개 → ACTIVE를 거친다.

### Alternatives

보관을 삭제로 처리하거나 보관 해제만으로 즉시 ACTIVE로 전환하지 않는다.

### Reason

과거 기록 정리와 실제 운영 재시작을 별도 의사결정으로 구분한다.

### Consequence

ARCHIVED는 읽기 전용이고 수정 전 해제한다. 보존·삭제·Export는 #9, 실제 재진입·해제·재개 클릭은 #10에서 검토한다.

### Evidence

[이슈 #8 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/8#issuecomment-5903987318), [검토 결과](event-lifecycle-review.md).


---

## DEC-054 — Export는 조회와 별도 권한이며 목적·대상·필드를 최소화한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

행사 Export는 Event Owner, 조직 관리·복구 목적의 Organization Owner, 명시적 Export 권한을 받은 운영자에게 해당 범위로 허용한다. 일반 조장은 기본 불가이며 참가자 자기 다운로드는 별도다. 목적·대상·필드를 최소화하고 민감정보 포함은 추가 확인한다.

### Alternatives

전체 조회가 대량 반출 권한을 자동 부여하거나 전체 컬럼 반출을 기본값으로 삼지 않는다.

### Reason

조회와 파일 반출의 범위를 구분한다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).


---

## DEC-055 — Export 생성과 다운로드를 구분하고 반출 범위를 기록한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

개인정보/내부정보 Export에 실행자·시각·조직/행사·목적·범위·등급·건수·성공 여부를 기록한다. 생성과 실제 다운로드를 구분하고 파일 내용을 로그에 복제하지 않는다.

### Alternatives

파일 내용 전체를 감사 로그에 복제하거나 생성만으로 실제 다운로드를 완료 처리하지 않는다.

### Reason

누가 무엇을 반출했는지 확인하면서 로그에 개인정보를 중복 축적하지 않는다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).


---

## DEC-056 — 데이터 종류별 보존 목적과 lifecycle을 구분한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

참가자 개인정보·운영 기록·정산·Audit/Security는 각각 보존 목적을 가진다. 행사 보관을 무기한 개인정보 보존 근거로 사용하지 않는다. 필요한 운영 기록은 유지하고 불필요한 개인 연결은 제거한다. 행사 삭제와 감사 기록의 lifecycle을 구분한다.

### Alternatives

모든 데이터에 동일 기간을 적용하거나 행사 삭제로 감사 기록까지 무조건 제거하지 않는다.

### Reason

운영 기록 활용과 불필요한 개인 정보 보유를 구분한다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).


---

## DEC-057 — 보관·익명화·최종 삭제는 서로 다른 처리다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

보관은 읽기 전용 관리 상태다. 익명화와 최종 삭제는 원칙적으로 되돌릴 수 없다. 이름만 제거한 데이터를 실질 익명화로 단정하지 않고 soft delete를 삭제 완료로 표시하지 않는다.

### Alternatives

보관을 삭제로 안내하거나 논리 삭제를 최종 파기로 완료 처리하지 않는다.

### Reason

사용자가 데이터 상태와 복구 가능성을 정확히 이해하도록 한다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).


---

## DEC-058 — 삭제 전 영향·유지 데이터와 의존 관계를 확인한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

삭제 전 영향 데이터와 유지 데이터를 보여주고 명시적 확인을 받는다. 배정·체크인·정산·History·안내 등 의존 관계를 검사해 삭제·익명화·참조 제거·필요 보존을 구분한다.

### Alternatives

단순 row 삭제 또는 사용자가 감사/예외 보존 데이터를 임의 청소하는 흐름을 제공하지 않는다.

### Reason

연결된 업무 기록과 보존 근거를 함께 처리한다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).


---

## DEC-059 — 최종 삭제의 일반 복구를 제공하지 않으며 보존·유예·백업 기간은 근거로 정한다

**Date:** 2026-09-30

**Status:** CONFIRMED — 제품 정책

### Context

Export·보존·삭제·복구를 검토했다.

### Decision

최종 삭제 후 일반 복구를 제공하지 않는다. 유예 상태를 도입하면 최종 삭제와 구분한다. 백업 재해복구와 사용자 복구를 구분한다. 보존·유예·백업 소멸 기간은 실제 목적·적용 법령·계약·운영 필요에 따라 데이터별 근거로 정한다.

### Alternatives

7일/30일/5년/7년 또는 백업 기반 휴지통 복원을 임의 약속하지 않는다.

### Reason

복구 약속과 파기 요구가 충돌하지 않게 한다.

### Consequence

기간·삭제 실행권·익명화 필드·Export 파일/다운로드·파기와 백업 상세 계약은 #12에서 정한다. 행사 전체 삭제의 조직 Owner 제한은 본문의 제안으로 남기며 최종 실행권으로 자동 확정하지 않는다. 실제 클릭 검토는 #10이다.

### Evidence

[사용자 #9 답변](https://github.com/BeomhyunPark/SCENE/issues/9#issuecomment-5904121761), [검토 결과](data-retention-export-review.md).

---

## DEC-060 — 행사 전용 협력자는 Event 운영자 관계로 접근하고 초대는 1회 소비 토큰으로 처리한다

**Date:** 2026-10-01

**Status:** CONFIRMED — 기술 계약

### Context

DEC-039로 조직 Membership 없이 특정 행사만 운영하는 협력자를 허용했다. 최초 기술 기준은 `user → member → event_user` 필수 경로와 memberId 기반 운영자 추가였다. [#11 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/11#issuecomment-5906372340)에서 외부 협력자는 운영자·팀/조 리더까지, Event Owner는 활성 조직 멤버만 맡도록 정했다.

### Decision

- `event_users`는 `user_id`를 직접 참조한다(`space_id`, `event_id`, `user_id`, `role`). `member_id` 필수 참조는 두지 않는다. 조직 소속 여부는 저장하지 않고 `members` 조인으로 계산한다. `UNIQUE(event_id, user_id)`와 composite FK `(event_id, space_id) → events`를 유지한다.
- Event 권한은 `event_users` role과 개인별 업무 권한에서만 나온다. (2026-10-02: 개인별 업무 권한은 `event_user_permissions`, DEC-029 보강) 조직 설정·구성원 목록·다른 행사 등 Space 범위 API는 활성 Membership이 필요하다. 행사 전용 협력자에게 다른 운영자는 이름·역할만 보이고 연락처는 숨긴다.
- 외부 협력자는 MANAGER/STAFF와 리더만 맡는다. OWNER 지정·위임 시 활성 Membership을 서비스에서 검사한다.
- 자진 조직 탈퇴 시 행사별 접근 유지/회수를 묻고 유지하면 행사 전용 협력자로 전환한다. 관리자 제거 시 기본값은 해당 Space 행사 접근 전체 회수이며 유지할 행사만 명시 선택하고 남는 접근권을 표시한다. Event Owner는 #4 인수인계 완료 전 탈퇴·제거를 차단한다.
- 기존 멤버는 userId로 바로 추가한다. 비멤버는 `event_invitations`로 초대한다. 저장 상태는 `PENDING / ACCEPTED / REVOKED / SUPERSEDED`이며 만료는 `expires_at`으로 계산하고 저장하지 않는다. 같은 행사·이메일의 PENDING은 하나만 허용한다. 재전송은 새 행을 만들고 이전 행을 SUPERSEDED로 남긴다. 초대 TTL은 7일 서버 상수다.
- 수락은 대상 이메일로 로그인한 사용자만 가능하며 결과를 성공과 6가지 오류 코드(토큰 없음·이메일 불일치·만료·회수·재전송 무효·타인 수락)로 구분한다. 로그인 전에는 서버를 호출하지 않고 단일 안내 화면을 보여 토큰 존재 여부를 드러내지 않는다.
- (2026-10-02 보강, #27) 로그인 후 수락 전에 조회 전용 미리보기(`POST /api/v1/operator/invitations/preview`)로 행사명·역할을 보여 준다. 미리보기는 수락과 같은 판정 순서·같은 오류 코드를 쓰고 상태를 바꾸지 않으며, 수락은 미리보기 결과와 무관하게 다시 판정한다. 같은 사용자의 재수락은 200 `outcome: ALREADY_ACCEPTED`로 구분한다.
- (2026-10-02 보강, #27) 이메일 불일치 화면에서 '계정 바꾸기'는 로그아웃해도 저장된 토큰을 최초 저장 시각 기준 30분 안에서만 유지하고 시간을 연장하지 않는다. '돌아가기'는 토큰을 지우고 S00으로 간다. 그 밖의 로그아웃은 토큰을 지운다. 미리보기·수락이 종결 결과(토큰 없음·만료·회수·재전송 무효·타인 수락·본인 재수락)를 돌려주면 토큰을 즉시 지운다. 토큰은 128비트 이상 난수이고 해시만 저장하며, 미리보기·수락에 계정·IP별 rate limit(429)을 둔다.
- 행사 전용 협력자도 조회 권한만으로 Export하지 않는다(DEC-054, DEC-061). Space OWNER는 행사 운영자가 아니어도 자기 Space 행사의 협력자를 조회·회수할 수 있다.

### Alternatives

비멤버를 '게스트 Membership'으로 `members`에 넣는 안은 Space 범위 접근이 새기 쉽고 DEC-039와 어긋나 채택하지 않는다. memberId를 userId로 단순 치환하는 안은 #11에서 금지했다. 재전송 시 같은 행의 `token_hash`만 교체하는 안은 재전송 무효와 없는 토큰을 구분할 수 없어 채택하지 않는다.

### Reason

조직 소속과 행사 접근을 분리하면서도 Event Owner 책임과 조직 내부 정보 경계를 지킨다.

### Consequence

상세 계약은 [Data Model](../architecture/data-model-v0.1.md), [Security / Privacy](../architecture/security-privacy-v0.1.md), [API Architecture](../architecture/api-architecture-v0.1.md)의 2026-10-01 절에 둔다. 아직 코드가 없으므로 `event_users.user_id` 직접 참조는 Flyway V1 초기 스키마에 반영한다. 초대 랜딩 화면 누락은 #27에서 다룬다.

### Evidence

[#11 기술 계약](https://github.com/BeomhyunPark/SCENE/issues/11#issuecomment-5922367345), [#11 결정 (10/1 현)](https://github.com/BeomhyunPark/SCENE/issues/11#issuecomment-5922384963), 2026-10-02 #27 보강(현 승인, 단톡방 5번 항목), [#27 화면 매핑](https://github.com/BeomhyunPark/SCENE/issues/27#issuecomment-5945556067).

---

## DEC-061 — 보존은 정책표로, 정리·삭제·Export는 미리보기와 별도 작업으로 처리한다

**Date:** 2026-10-01

**Status:** CONFIRMED — 기술 계약 (기간 값은 미정)

### Context

DEC-054~059와 [#12 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/12#issuecomment-5906461328)으로 행사 최종 삭제는 조직 Owner만 실행하고 Event Owner는 요청하며, 참가자 개인정보 정리는 Event Owner·조직 Owner가 실행하고, Export는 다운로드 시점에도 현재 권한을 확인하도록 정했다. 교회와 SCENE의 책임 구분, 백업 복원 시 재노출 방지도 검토 요청됐다.

### Decision

- 보존 기간은 상수가 아니라 데이터 종류별 정책표(목적·종료 시점·기간·근거·종료 처리)로 관리하고 구현은 정책 키로만 참조한다.
- 참가자 데이터는 교회(조직)가 개인정보처리자, SCENE은 수탁자다. 운영자 계정 데이터는 SCENE이 처리자다. 법률 검토 결과에 따라 이 항목만 다시 열 수 있다.
- 개인정보 정리는 미리보기와 비동기 실행 작업으로 나누고 도메인 단계별 멱등 재시도를 보장한다. 범위는 식별값·개인정보 응답·자유서술·첨부·과거 revision이며 비식별 운영 기록은 유지한다.
- 행사 최종 삭제는 Event lifecycle 상태가 아니라 별도 삭제 요청·작업 레코드로 관리한다. 실행 시 재인증과 행사명 입력 확인을 받는다.
- Export는 생성 작업과 다운로드를 분리하고 다운로드마다 현재 권한·범위를 재검사한다. 민감 필드가 포함된 Export는 생성 시 재인증이 필요하다.
- 백업 복원 재노출은 삭제·익명화 대상 ID와 시각만 담은 삭제 원장을 운영 백업과 따로 보관하고 복원 후 서비스 재개 전에 다시 적용해 막는다.
- ARCHIVED에서도 개인정보 정리와 허용된 Export는 가능하다.

### Alternatives

삭제 유예를 Event 상태(DELETING 등)로 추가하는 안은 #12에서 금지했다. 백업에서 개별 레코드를 삭제하는 안은 실행·검증이 어려워 채택하지 않는다.

### Reason

기간이 정해지기 전에도 처리 구조를 고정해 구현을 시작할 수 있게 하고, DEC-059의 최종 삭제 비복구 원칙을 백업 복원에서도 지킨다.

### Consequence

데이터 종류별 보존기간, 삭제 유예기간, 백업 소멸기간, Export 파일 수명, 기기 임시 데이터 최대 보관기간과 미성년·보호자 처리 기준은 계속 미정이다. 구현 차단 범위는 실제 기간 상수와 자동 파기 스케줄러뿐이다. 상세 계약은 아키텍처 문서의 2026-10-01 절에 둔다.

### Evidence

[#12 기술 계약](https://github.com/BeomhyunPark/SCENE/issues/12#issuecomment-5922404543), [#12 사용자 답변](https://github.com/BeomhyunPark/SCENE/issues/12#issuecomment-5906461328).

---

## DEC-062 — 업무 체크는 항목별 SET으로 저장하고 완료·다시 진행은 별도 command로 처리한다

**Date:** 2026-10-02

**Status:** CONFIRMED — 기술 계약 (ARCHIVED 쓰기 차단 코드는 #30 결정 대기)

### Context

#14(D02) 화면은 완료 후 체크 읽기 전용, 명시적 '다시 진행'에서만 재개, 다시 진행 → 진행 중 2/2(체크 유지), 다시 진행 뒤 모든 항목 해제 가능(10/1 현 결정)으로 Present를 통과했지만 서버 저장은 미검증이었다. 기존 문서는 Task 상태 `TODO / DOING / DONE / CANCELLED`와 `PATCH {"status":"DONE"}` 허용만 있고 체크리스트·담당자 필드는 없었다. #31에서 업무·체크리스트 저장 계약을 정했다.

### Decision

- 체크는 `PUT /tasks/{taskId}/items/{itemId}` `{checked}`로 설정(SET)한다. 같은 값 재요청은 변경 없이 200이다. 완료는 `POST /tasks/{taskId}/complete`, 다시 진행은 `POST /tasks/{taskId}/reopen`이며 두 command는 요청 본문의 `version`을 검사한다.
- 담당자 본인은 `TASK_WRITE` 없이 자기 업무를 체크·완료·다시 진행할 수 있다. 그 밖의 운영자는 유효 `TASK_WRITE`가 필요하다. Event OWNER·MANAGER는 기본 `TASK_WRITE`를 갖고 STAFF는 갖지 않는다. 업무당 담당자는 1명이다.
- 완료는 모든 항목이 체크됐을 때만 가능하고 자동 완료는 없다. 첫 체크에서 TODO → DOING으로 바뀌고 TODO로 돌아가지 않는다. 다시 진행은 체크를 유지한 채 DOING으로 돌린다.
- PATCH로는 `status: DONE`을 설정할 수 없다. `CANCELLED`는 PATCH에 남긴다.
- 업무 409는 `TASK_VERSION_CONFLICT`, `INVALID_TASK_STATE`이며 업무에서는 공통 `CONCURRENT_MODIFICATION`을 쓰지 않는다. 다른 도메인은 그대로다.
- 지금은 행사 ARCHIVED만 업무 쓰기를 막는다. 차단 코드는 #30 결정 후 맞추며 제안값은 `EVENT_ARCHIVED`다.
- v1에는 일괄 체크(전체 체크) endpoint가 없다.
- 체크 항목은 새 테이블 `task_checklist_items`에 둔다(새 테이블 추가 금지 원칙의 예외로 승인). `tasks`에 담당자·`version`·완료자·완료 시각을 추가한다.

### Alternatives

뒤집기(toggle) API는 동시 체크 시 서로 상쇄돼 제외했다. 항목 설정에도 version을 요구하면 다른 항목 체크만으로 409가 잦아 채택하지 않았다. 체크를 `tasks` JSONB 컬럼에 두는 안은 JSONB 제한과 충돌하고 항목별 동시 갱신·audit가 어렵다. 2/2에서 자동 완료하면 #14의 '체크리스트 완료 → 업무 완료' 2단계와 어긋난다. 업무 유형 필드(`tasks.kind`)를 지금 추가하는 안은 #30 결정 전 추측이 돼 채택하지 않았다.

### Reason

현장에서 여러 사람이 같은 업무를 동시에 체크해도 충돌 없이 같은 결과로 끝나게 하고, 완료 조건·version·audit를 우회하는 두 번째 완료 경로를 없앤다. '내 업무' 흐름이 STAFF 담당자 중심이라 권한표를 사람마다 손대지 않아도 되게 한다.

### Consequence

상세 계약(endpoint·DTO·상태 전이·판정 순서·오류·회귀 테스트)은 [API Architecture](../architecture/api-architecture-v0.1.md) §8, 저장 구조는 [Data Model](../architecture/data-model-v0.1.md) §5, 권한은 [Security / Privacy](../architecture/security-privacy-v0.1.md) §1의 2026-10-02 절에 둔다. ARCHIVED 차단 코드(`EVENT_ARCHIVED`)와 접근 회수 코드(`NOT_A_MEMBER`)는 #30 현 결정 후 맞춘다. ENDED 행사의 동결 대상 업무 구분은 #30에서 정한다. 체크리스트 구조 편집은 #31 범위 밖이다. 서버 구현·검증은 후속이다.

### Evidence

[#31 계약 초안](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946042935), [#31 결정 기록 (10/2 현)](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946079736), [#30 정합 메모](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946074503).
