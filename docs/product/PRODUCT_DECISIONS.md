# Church Event Operations Platform — Product Decisions

> **2026-09-30 baseline:** DEC-001~027의 기존 본문·Status 보존. 최초 정리 당시에는 새 DEC를 만들지 않았고, 이후 검토에서 DEC-028~059를 추가했다. 2026-10-01 #11·#12 기술 계약으로 DEC-060~061을, 2026-10-02 #31 업무·체크리스트 저장 계약으로 DEC-062를, #30 행사 lifecycle command 계약으로 DEC-063을, 2026-10-06 MVP 참여자 인증 결정으로 DEC-064를, 같은 날 업무 오류 판정 순서·Override 사유 저장 보강으로 DEC-065를, 2026-10-15 AI 기능 포함과 첫 AI 범위(C1·C7) 결정으로 DEC-066을, 2026-10-21 개발용 로그인 profile gate·세션 쿠키 결정으로 DEC-067을, 2026-11-16 신청서 질문 유형·조건부 표시·편집 잠금 결정으로 DEC-068을, 같은 날 운영자 Google 로그인·초대 기반 가입·첫 관리자 지정 결정으로 DEC-069를, 신청서 설정·자동 질문·기본항목(이름·전화·또래) 결정으로 DEC-070을, 2026-11-17 체크인·조 편성·신청 집계·부분 참석·운영 메모 결정으로 DEC-071~075를, 2026-11-18 조직 역할·조직 초대 결정으로 DEC-076을, 2026-11-19 행사 생성 권한(조직 OWNER·ADMIN만) 결정으로 DEC-077을, 같은 날 역할 기본 권한 표와 운영자별 권한 화면 결정으로 DEC-079를, 참가자 홈·일정표·공지·조장조원 결정으로 DEC-080~083을 추가했다, 같은 날 참가자 이름·전화번호·숫자 6자리 들어오기와 신청 revision 결정으로 DEC-078을. 최신 요청의 제품명 SCENE 및 Technical Design / implementation 전 상태가 현재 기준이다. DEC-024/027의 단계와 §17 Product Name OPEN은 이전 이력이며 기술 기준은 [Architecture](../architecture/architecture-v0.1.md)를 따른다. 공식 Decision Log 정합화는 검토 필요.
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
- ~~AI 기능 포함 여부~~ → 2026-10-15 포함으로 확정. [DEC-066](#dec-066--scene은-ai-기능을-포함하고-첫-ai-범위는-c1과-c7이다) 참고(공급자·재위탁 등 세부는 DEC-066의 OPEN)

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
- (2026-10-02 보강, 현 결정 10/2) 운영자 추가·제거·role 변경과 개인별 권한 변경은 Event Owner만 한다. 개인별 권한 조회는 Event Owner·본인·Space OWNER(조회만)만 하고 Space ADMIN은 할 수 없다. 행사 전용 협력자의 연락처 숨김(DEC-060)은 어떤 GRANT로도 풀리지 않는다. Owner 위임 수락 시 받는 사람의 override는 위임 기록에 저장 후 지우고 취소 시 되살린다. ENDED에서는 권한 변경을 허용하고 ARCHIVED에서는 줄이는 변경만 허용한다(#30 L5).
- (2026-11-19 → [DEC-079](#dec-079--역할-기본-권한은-manager가-일정공지-쓰기까지-staff는-체크인까지이고-나머지는-행사-owner가-운영-멤버-화면에서-사람별로-준다)) MANAGER·STAFF 기본 집합과 권한 설정 화면을 정했다.
- (2026-11-20 → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)) MANAGER는 OWNER 전용 키(`EVENT_LIFECYCLE`·`EVENT_USER_MANAGE`)만 빼고 모든 키를 기본으로 갖는다. 사람별 권한은 STAFF에게 더하거나 MANAGER에게서 빼는 예외 처리로 남는다.
- (2026-10-02 보강) 위 OPEN 중 저장 구조·부여자·회수 방식은 해소했다. MANAGER/STAFF 기본 집합은 Backend Lead가 초안을 쓰고 현이 승인한다(현 결정 10/2). 미확정, 백엔드 리드 초안 대기. 예외로 `TASK_WRITE` 기본값은 DEC-062에서 확정한다. OWNER·MANAGER 포함, STAFF 미포함. 업무별 정확한 허용 집합(Permission 키 목록 초안)도 계속 확인이 필요하다. 테이블은 Flyway V1 초기 스키마에 포함하며(SCENE Backend Lead) 상세 계약은 아키텍처 문서의 2026-10-02 절에 둔다.

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



### Follow-up (2026-11-17): 참가 현황 표는 조회이고, 연락처 열은 연락처 권한에만 (#308)

사용자 위임(2026-11-17), 추천안 채택. 질문·선택지·이유는 [#308](https://github.com/BeomhyunPark/SCENE/issues/308)에 있다.

- 신청자 목록(#220)은 "이름만"이었다. 이제 참가 현황 표(`GET …/applications/table`)가 신청자 전원의 답을 한 화면에 보인다. 권한은 목록·상세와 같은 `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 같은 사람이 상세에서 이미 한 건씩 모든 답을 보고, 표는 파일을 만들지 않으므로 이 DEC의 반출이 아니다. CSV는 그대로 `DATA_EXPORT`다. #220의 "목록에는 이름만"은 이 표로 대체한다.
- 전화 질문(SYSTEM `PHONE`, `format: PHONE`)은 effective `PARTICIPANT_CONTACT_READ`가 있을 때만 열로 보낸다(security-privacy §5, DEC-060의 연락처 경계). 없으면 서버가 열과 값을 빼고, 화면은 연락처 열을 숨긴다. 행사 OWNER는 기본으로 갖고, 다른 운영자는 개인별 GRANT로 받는다.
- `CONTACT_VIEW` privacy log는 아직 없다. 그동안 전화 열을 보낸 응답마다 audit `APPLICANT_CONTACTS_VIEWED`(`{count}`만)를 남긴다. privacy log가 생기면 그쪽으로 옮긴다.
- 조 열은 작업본이라 DEC-072 §7대로 `GROUP_WRITE` 또는 공간 `OWNER`·`ADMIN`에게만 보낸다. 체크인 여부는 명단 조회와 같은 권한이다(DEC-071).
- 버린 안: 표를 `DATA_EXPORT`에만(MANAGER·STAFF가 명단을 거를 수 없어 시트를 대신하지 못한다), 끝 4자리만 모두에게(사용자 디자인 P03-01이 연락처 열을 둔다), 전체 번호를 기록 없이 `EVENT_READ`에(연락처 경계가 빈 껍데기가 된다).
- ~~남은 차이: 신청 상세(`GET …/applications/{id}`)는 지금도 `EVENT_READ`로 전체 전화번호를 보인다. 표와 맞출지는 따로 정한다.~~ → 아래 Follow-up으로 맞췄다.

### Follow-up (2026-11-17): 신청 상세의 전화도 연락처 권한에만 (#332)

사용자 결정(2026-11-17): 표와 맞춘다.

- 신청 상세는 전화 질문(SYSTEM `PHONE`, `format: PHONE`)의 답을 effective `PARTICIPANT_CONTACT_READ`가 있을 때만 값과 함께 보낸다. 없으면 답 항목은 남기되 `value: null`·`contact: true`로 보내고, 화면은 "연락처 권한이 있는 운영자만 볼 수 있어요"를 보인다. 표와 같이 공간 `OWNER`·`ADMIN`이라는 것만으로는 보이지 않는다.
- 값을 보낸 응답마다 표와 같은 audit `APPLICANT_CONTACTS_VIEWED`를 남긴다. detail은 `{count: 1, applicationId}`다. 한 건 조회라 대상 신청을 남기고, 번호·이름은 남기지 않는다(security-privacy §6). privacy log `CONTACT_VIEW`가 생기면 표와 함께 옮긴다.
- 다른 읽기 경로를 훑었다. 신청 목록(이름만), 집계의 카풀·이동 지원 목록(이름·또래·동네), 조 편성판·공개 스냅샷·참가자 조 조회(전화 없음)에는 전화가 없다. 체크인 명단의 끝 4자리(DEC-071, `CHECKIN_WRITE`)와 CSV(`DATA_EXPORT`)는 바꾸지 않는다.

### Follow-up (2026-11-20): MANAGER는 기본으로 명단을 내려받고 연락처를 본다 (I2)

사용자 결정(2026-11-20, [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)). `DATA_EXPORT`와 `PARTICIPANT_CONTACT_READ`가 MANAGER 기본값에 들어간다. 위 두 Follow-up의 "행사 OWNER는 기본으로 갖고, 다른 운영자는 개인별 GRANT로 받는다"는 이제 "행사 OWNER와 MANAGER는 기본으로 갖고, STAFF는 개인별 GRANT로 받는다"로 읽는다. 반출 권한이 조회와 별개라는 원칙, 내려받을 때마다 남기는 audit, 연락처를 보낸 응답마다 남기는 `APPLICANT_CONTACTS_VIEWED`는 그대로다. 특정 MANAGER에게서 빼려면 OWNER가 개별 `REVOKE`를 건다. STAFF 기본값에는 넣지 않는다.

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
- Event 권한은 `event_users` role과 개인별 업무 권한에서만 나온다. (2026-10-02: 개인별 업무 권한은 `event_user_permissions`, DEC-029 보강) 조직 설정·구성원 목록·다른 행사 등 Space 범위 API는 활성 Membership이 필요하다. 행사 전용 협력자에게 다른 운영자는 이름·역할만 보이고 연락처는 숨긴다. (2026-10-02 현 결정: 이 숨김은 개인별 GRANT보다 앞선다.)
- 외부 협력자는 MANAGER/STAFF와 리더만 맡는다. OWNER 지정·위임 시 활성 Membership을 서비스에서 검사한다.
- 자진 조직 탈퇴 시 행사별 접근 유지/회수를 묻고 유지하면 행사 전용 협력자로 전환한다. 관리자 제거 시 기본값은 해당 Space 행사 접근 전체 회수이며 유지할 행사만 명시 선택하고 남는 접근권을 표시한다. Event Owner는 #4 인수인계 완료 전 탈퇴·제거를 차단한다.
- 기존 멤버는 userId로 바로 추가한다. 비멤버는 `event_invitations`로 초대한다. 저장 상태는 `PENDING / ACCEPTED / REVOKED / SUPERSEDED`이며 만료는 `expires_at`으로 계산하고 저장하지 않는다. 같은 행사·이메일의 PENDING은 하나만 허용한다. 재전송은 새 행을 만들고 이전 행을 SUPERSEDED로 남긴다. 초대 TTL은 7일 서버 상수다.
- 수락은 대상 이메일로 로그인한 사용자만 가능하며 결과를 성공과 6가지 오류 코드(토큰 없음·이메일 불일치·만료·회수·재전송 무효·타인 수락)로 구분한다. 로그인 전에는 서버를 호출하지 않고 단일 안내 화면을 보여 토큰 존재 여부를 드러내지 않는다.
- (2026-10-02 보강, #27) 로그인 후 수락 전에 조회 전용 미리보기(`POST /api/v1/operator/invitations/preview`)로 행사명·역할을 보여 준다. 미리보기는 수락과 같은 판정 순서·같은 오류 코드를 쓰고 상태를 바꾸지 않으며, 수락은 미리보기 결과와 무관하게 다시 판정한다. 같은 사용자의 재수락은 200 `outcome: ALREADY_ACCEPTED`로 구분한다.
- (2026-10-02 보강, #27) 이메일 불일치 화면에서 '계정 바꾸기'는 로그아웃해도 저장된 토큰을 최초 저장 시각 기준 30분 안에서만 유지하고 시간을 연장하지 않는다. '돌아가기'는 토큰을 지우고 S00으로 간다. 그 밖의 로그아웃은 토큰을 지운다. 미리보기·수락이 종결 결과(토큰 없음·만료·회수·재전송 무효·타인 수락·본인 재수락)를 돌려주면 토큰을 즉시 지운다. 토큰은 128비트 이상 난수이고 해시만 저장하며, 미리보기·수락에 계정·IP별 rate limit(429)을 둔다. (2026-11-19 Follow-up(#391)에서 rate limit을 없앴다.)
- 행사 전용 협력자도 조회 권한만으로 Export하지 않는다(DEC-054, DEC-061). Space OWNER는 행사 운영자가 아니어도 자기 Space 행사의 협력자를 조회·회수할 수 있다.

### Alternatives

비멤버를 '게스트 Membership'으로 `members`에 넣는 안은 Space 범위 접근이 새기 쉽고 DEC-039와 어긋나 채택하지 않는다. memberId를 userId로 단순 치환하는 안은 #11에서 금지했다. 재전송 시 같은 행의 `token_hash`만 교체하는 안은 재전송 무효와 없는 토큰을 구분할 수 없어 채택하지 않는다.

### Reason

조직 소속과 행사 접근을 분리하면서도 Event Owner 책임과 조직 내부 정보 경계를 지킨다.

### Consequence

상세 계약은 [Data Model](../architecture/data-model-v0.1.md), [Security / Privacy](../architecture/security-privacy-v0.1.md), [API Architecture](../architecture/api-architecture-v0.1.md)의 2026-10-01 절에 둔다. 아직 코드가 없으므로 `event_users.user_id` 직접 참조는 Flyway V1 초기 스키마에 반영한다. 초대 랜딩 화면 누락은 #27에서 다룬다.

### Evidence

[#11 기술 계약](https://github.com/BeomhyunPark/SCENE/issues/11#issuecomment-5922367345), [#11 결정 (10/1 현)](https://github.com/BeomhyunPark/SCENE/issues/11#issuecomment-5922384963), 2026-10-02 #27 보강(현 승인, 단톡방 5번 항목), [#27 화면 매핑](https://github.com/BeomhyunPark/SCENE/issues/27#issuecomment-5945556067).

### Follow-up (2026-11-16): 메일 발송 전 링크 전달과 대기 초대 목록 (#222)

- SMTP가 없는 동안 생성·재전송 응답이 초대 링크(`/operator/invitations#<token>`)를 **한 번만** 돌려준다. 행사 OWNER가 복사해 전달한다. 서버는 여전히 해시만 저장하며 링크를 DB·audit·로그에 남기지 않는다. 같은 링크를 다시 볼 방법은 없고, 잃어버리면 재전송한다. 메일 포트 호출은 그대로 둔다.
- 수락 조건은 바뀌지 않는다. 세션의 검증된 이메일이 초대 이메일과 같아야 하므로 링크를 본 OWNER가 대신 수락할 수 없다.
- 행사 OWNER는 `GET /api/v1/operator/events/{eventId}/invitations`로 대기(`PENDING`) 초대를 본다. 항목은 id·이메일·역할·상태·만료 시각이고 토큰과 해시는 없다. 권한은 초대 command와 같다.
- 화면은 사이드바 "운영 멤버"(`/events/{eventId}/operators`)에서 운영자 목록과 함께 둔다. 링크는 생성 직후 한 번 보여 주고 브라우저 저장소에 쓰지 않는다.
- 버린 안: 응답은 그대로 두고 `local`·`test` 전용 경로로 캡처 링크 읽기(운영 환경에서는 전달할 길이 없다), SMTP 먼저 붙이기(발송 방식·도메인 결정이 먼저 필요하다), 이번 화면에서 만든 초대만 기억하기(새로고침하면 다시 보내기·취소 대상을 잃는다).

현 결정 2026-11-16.

### Follow-up (2026-11-19): 협력자의 행사 목록과 초대 링크 처리 (#387)

- **행사 목록은 조직 멤버십과 따로 본다.** `GET /api/v1/operator/events`가 호출자의 `event_users` 행으로 모든 조직의 행사를 돌려준다(조직 이름, 내 행사 역할, 그 조직의 멤버인지). 조직 멤버가 아니면 행사 목록이 "협력 중인 행사"만 보이고, 멤버는 자기 조직 행사 아래에 다른 조직 행사를 "협력 중인 행사"로 본다. 접근이 취소된 사람은 행이 없어 나오지 않는다. 공간 OWNER·ADMIN의 '모든 행사 보기'는 조직 행사 목록에만 남는다. 다른 운영자·조직 멤버·연락처는 이 목록에 없다.
- **행사 상세는 그 행사의 조직(`spaceId`·`spaceName`)을 담는다.** 행사 안 화면은 첫 번째 조직이 아니라 행사의 조직 이름을 보이고, 운영 멤버 화면의 조직 멤버 추가도 행사의 조직 멤버를 고른다.
- **이미 그 행사의 운영자인 사람에게도 초대를 만들 수 있다.** 서버는 초대 이메일과 계정을 미리 이어 볼 수 없고, 만들기에서 막으면 이메일로 운영자 여부를 알아내는 길이 생긴다. 수락은 초대를 `ACCEPTED`로 소비하되 **역할은 바꾸지 않는다**(조직에서 나가며 접근을 유지한 사람 포함). 역할 변경은 Owner의 명시적 변경(`PATCH /operators/{userId}`)으로만 한다. 수락 응답이 실제 역할을 돌려주고 화면이 "이미 이 행사에서 ○○로 운영하고 있어서 역할은 그대로예요"를 안내한다.
- **링크에 든 토큰이 언제나 이긴다.** 초대 화면이 열려 있는 탭에서 새 링크를 열면 주소의 `#` 뒤만 바뀌어 화면이 다시 마운트되지 않는다. 이때도 새 토큰을 다시 읽고 화면 상태를 새로 시작한다. 미리보기 캐시는 토큰마다 따로 둔다. 사이드바 로그아웃은 저장된 토큰을 지운다(위 2026-10-02 보강의 "그 밖의 로그아웃").
- **"이미 수락" 화면은 어떤 초대인지 이름을 댄다.** 조직 초대는 "○○ 조직 초대는 이미 수락했어요", 행사 초대는 "○○ 초대는 이미 수락했어요"이고, 행사 초대는 "행사 열기"를 함께 둔다. 수락 화면도 "행사 열기"로 바로 들어간다.
- 버린 안: 이미 운영자면 초대 만들기를 막기(이메일로 운영자 여부가 드러난다), 수락이 초대 역할로 바꾸기(링크 하나로 역할이 조용히 오르내린다), 조직을 나간 사람에게 행사 초대 대신 조직 재가입 요구(DEC-039와 어긋난다).

현 결정 2026-11-19 (#387). 이미 운영자인 사람의 수락은 역할을 유지한다는 안을 사용자가 승인했다. 운영 서버 확인은 #387에 남긴다.

### Follow-up (2026-11-19): 초대 미리보기·수락에 시도 한도를 두지 않는다 (#391)

- **행사·조직 초대의 미리보기·수락에는 계정별·주소별 시도 한도가 없다.** 위 2026-10-02 보강의 rate limit과 잠정 숫자(계정·주소마다 한 시간 5회)를 없애고, 오류 코드 `RATE_LIMITED`(429)도 지운다.
- 이유: 토큰은 256비트 난수라 한도가 있어도 없어도 추측으로 맞힐 수 없다. 두 경로 모두 Google 로그인과 CSRF 검사를 먼저 받는다. 반면 같은 회선(교회 와이파이 등)의 운영진은 공인 주소 하나를 같이 써서 서로 막힐 수 있고, 로컬에서는 모든 요청이 127.0.0.1이라 #387 재현 중 "초대를 확인하지 못했어요"가 계속 났다.
- 확인한 사실: 운영 서버는 이미 실제 접속 주소를 본다(`SERVER_FORWARD_HEADERS_STRATEGY=framework`, nginx가 `CF-Connecting-IP`를 `X-Forwarded-For`로 넘김, #277). 이번 결정은 주소 처리 오류 때문이 아니다.
- 화면은 그대로다. 프록시나 Cloudflare가 돌려주는 429는 다른 응답과 같이 "초대를 확인하지 못했어요"와 다시 시도를 보이고 토큰을 유지한다.
- 버린 안: 주소 한도를 실제 주소로 유지하고 설정만 보강(같은 회선의 운영진 문제가 남는다), 주소 한도만 크게 올리기(숫자 근거가 없고 효과도 작다), 계정 한도 5회만 남기기(토큰 추측을 막는 효과가 없고 재확인을 막는다).

현 결정 2026-11-19 (사용자).

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

**Status:** CONFIRMED — 기술 계약 (ARCHIVED 쓰기 차단 코드 `EVENT_ARCHIVED`는 DEC-063)

### Context

#14(D02) 화면은 완료 후 체크 읽기 전용, 명시적 '다시 진행'에서만 재개, 다시 진행 → 진행 중 2/2(체크 유지), 다시 진행 뒤 모든 항목 해제 가능(10/1 현 결정)으로 Present를 통과했지만 서버 저장은 미검증이었다. 기존 문서는 Task 상태 `TODO / DOING / DONE / CANCELLED`와 `PATCH {"status":"DONE"}` 허용만 있고 체크리스트·담당자 필드는 없었다. #31에서 업무·체크리스트 저장 계약을 정했다.

### Decision

- 체크는 `PUT /tasks/{taskId}/items/{itemId}` `{checked}`로 설정(SET)한다. 같은 값 재요청은 변경 없이 200이다. 완료는 `POST /tasks/{taskId}/complete`, 다시 진행은 `POST /tasks/{taskId}/reopen`이며 두 command는 요청 본문의 `version`을 검사한다.
- 담당자 본인은 `TASK_WRITE` 없이 자기 업무를 체크·완료·다시 진행할 수 있다. 그 밖의 운영자는 유효 `TASK_WRITE`가 필요하다. Event OWNER·MANAGER는 기본 `TASK_WRITE`를 갖고 STAFF는 갖지 않는다. 업무당 담당자는 1명이다.
- 완료는 모든 항목이 체크됐을 때만 가능하고 자동 완료는 없다. 첫 체크에서 TODO → DOING으로 바뀌고 TODO로 돌아가지 않는다. 다시 진행은 체크를 유지한 채 DOING으로 돌린다.
- PATCH로는 DONE·DOING 전환을 할 수 없다(400). DOING은 첫 체크로만, 완료·다시 진행은 command로만 한다. `CANCELLED`와 status가 아닌 필드는 PATCH에 남긴다(10/2 현, 초안 D3 추천 A 승인).
- 운영자는 #39와 같이 `event_users.user_id`로 참조한다(`assignee_user_id`, `checked_by_user_id`, `completed_by_user_id`). 운영자 제거 시 같은 transaction에서 그 사람의 담당 업무를 미배정으로 바꾸고 audit을 남기며 업무는 삭제하지 않는다. 체크·완료 기록은 `users` 기록 참조라 남는다.
- 업무 409는 `TASK_VERSION_CONFLICT`, `INVALID_TASK_STATE`이며 업무에서는 공통 `CONCURRENT_MODIFICATION`을 쓰지 않는다. 다른 도메인은 그대로다.
- 지금은 행사 ARCHIVED만 업무 쓰기를 막는다. 차단 코드는 `EVENT_ARCHIVED`다(DEC-063).
- v1에는 일괄 체크(전체 체크) endpoint가 없다.
- 체크 항목은 새 테이블 `task_checklist_items`에 둔다(새 테이블 추가 금지 원칙의 예외로 승인). `tasks`에 담당자·`version`·완료자·완료 시각을 추가한다.

### Alternatives

뒤집기(toggle) API는 동시 체크 시 서로 상쇄돼 제외했다. 항목 설정에도 version을 요구하면 다른 항목 체크만으로 409가 잦아 채택하지 않았다. 체크를 `tasks` JSONB 컬럼에 두는 안은 JSONB 제한과 충돌하고 항목별 동시 갱신·audit가 어렵다. 2/2에서 자동 완료하면 #14의 '체크리스트 완료 → 업무 완료' 2단계와 어긋난다. 업무 유형 필드(`tasks.kind`)를 지금 추가하는 안은 #30 결정 전 추측이 돼 채택하지 않았다.

### Reason

현장에서 여러 사람이 같은 업무를 동시에 체크해도 충돌 없이 같은 결과로 끝나게 하고, 완료 조건·version·audit를 우회하는 두 번째 완료 경로를 없앤다. '내 업무' 흐름이 STAFF 담당자 중심이라 권한표를 사람마다 손대지 않아도 되게 한다.

### Consequence

상세 계약(endpoint·DTO·상태 전이·판정 순서·오류·회귀 테스트)은 [API Architecture](../architecture/api-architecture-v0.1.md#2026-10-02-업무-체크리스트-저장-계약-31-dec-062) §8, 저장 구조는 [Data Model](../architecture/data-model-v0.1.md#2026-10-02-업무-체크리스트-31-dec-062) §5, 권한은 [Security / Privacy](../architecture/security-privacy-v0.1.md#2026-10-02-업무-처리-권한-31-dec-062) §1의 2026-10-02 절에 둔다. 유효 `TASK_WRITE`는 DEC-029 보강의 role 기본값 + 사람별 GRANT − REVOKE로 판정한다. ARCHIVED 차단 코드는 `EVENT_ARCHIVED`, 접근 회수 코드는 `NOT_A_MEMBER`다(DEC-063). ENDED는 업무 쓰기를 막지 않는다. 체크리스트 구조 편집은 #31 범위 밖이다. 서버 구현·검증은 후속이다.

### Evidence

[#31 계약 초안](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946042935), [#31 결정 기록 (10/2 현)](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946079736), [#30 정합 메모](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946074503).

---

## DEC-063 — 행사 lifecycle command는 다섯 전이만 쓰고 보관 중 접근 추가는 막는다

**Date:** 2026-10-02

**Status:** CONFIRMED — 기술 계약 (QA·현 수락 전. 서버 구현은 #2 게이트 뒤)

### Context

종료·재개·보관의 제품 전이는 DEC-049~053에 있고, endpoint·동시성·Owner 이전·본인 이탈은 #30에 남아 있었다. L1~L9가 추천안대로 확정됐다.

### Decision

- 활성화·종료·재개·보관·보관 해제는 Event OWNER만 실행한다. `EVENT_LIFECYCLE`은 개인별 GRANT 대상이 아니다. Space OWNER는 사유·audit·Event OWNER 알림 기록이 있으면 활성화·종료·재개를 대신 실행할 수 있다. 보관과 보관 해제는 Event OWNER 또는 Space OWNER가 한다.
- 종료 확인은 `acknowledgeWarnings: true`다. 경고 건수는 실행 시점 스냅샷으로 남고, 종료를 막지 않는다.
- ARCHIVED에서는 접근을 줄이는 변경과 Owner 이전·이탈을 허용하고, 접근을 늘리는 변경은 409 `EVENT_ARCHIVED`다. 보관은 대기 초대를 회수한다. 업무 쓰기도 이 코드로 막는다.
- 수락된 인수인계 14일 중에도 넘긴 사람은 떠날 수 있고, 떠나는 순간 인수인계 권한은 끝난다. 공동 Owner가 있어도 이전 없이 떠나면 409 `OWNER_ROLE_HELD`다.
- 방치된 DRAFT는 새 전이를 만들지 않고 DEC-061 삭제 요청으로 정리한다. ENDED 이후 재제출은 409 `EVENT_ENDED`다. 참가 취소·재참가는 별도 이슈다.

### Alternatives

동시 종료의 늦은 요청에 409를 주는 안, 종료 확인을 미리보기 건수와 묶는 안, ACTIVE에서 바로 보관하는 안, DRAFT→ENDED 전이를 추가하는 안은 채택하지 않았다.

### Reason

종료는 신청 차단처럼 영향이 크고, 보관된 행사 때문에 Owner가 조직을 떠나지 못하는 상태를 막아야 한다. 서버는 조직 Owner의 "부재"를 판별할 수 없으므로 사유와 기록으로 대행을 구분한다.

### Consequence

상세 계약은 [API Architecture](../architecture/api-architecture-v0.1.md#2026-10-02-행사-lifecycle-command-30-dec-063), 저장은 [Data Model](../architecture/data-model-v0.1.md#2026-10-02-행사-lifecycle-30-dec-063), 권한은 [Security / Privacy](../architecture/security-privacy-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 DEC-063 항을 따른다. QA와 현이 이 계약과 DEC-062를 수락하기 전에는 lifecycle·업무 서버 코드를 시작하지 않는다. 알림 전달 채널은 OPEN이다.

### Evidence

[#30 결정 기록 (10/2 현)](https://github.com/BeomhyunPark/SCENE/issues/30#issuecomment-5946089035), [#30 계약 초안](https://github.com/BeomhyunPark/SCENE/issues/30#issuecomment-5946067458).

---

## DEC-064 — MVP 참여자 인증은 링크 접근 키 하나로 한다

**Date:** 2026-10-06

**Status:** SUPERSEDED by DEC-078 (2026-11-19) — 참가자는 이름·전화번호·숫자 6자리로 들어온다. 아래는 2026-10-06 결정 기록이다

### Context

참여자는 SCENE 운영계정이 없고 행사별 링크로 들어온다. 기존 문서는 Participant Access를 128비트 이상 난수·`key_hash` 저장·POST body 검증으로 두었지만 "raw key URL 전달 금지"라고만 써서 링크로 키를 어떻게 건네는지가 비어 있었고, 키 재발급은 OPEN이었다. 프로토타입에는 인증번호(SMS) 화면이 있으나 서버 계약은 없었다.

### Decision

- MVP 참여자 인증은 링크에 담은 접근 키 하나다. 전화번호 OTP와 SMS vendor는 MVP에 없다.
- 키는 CSPRNG 128비트 난수다. DB에는 hash(`key_hash`)만 저장하고 raw key는 저장하지 않는다.
- 키는 링크의 fragment(`#…`)에 넣는다. fragment는 서버로 전송되지 않아 서버 로그·프록시·Referer에 남지 않는다. 클라이언트가 키를 읽어 `POST /api/v1/public/events/{eventId}/participant-sessions`의 body로 보내고, 서버는 hash를 검증한 뒤 Participant session cookie를 발급한다. 클라이언트는 키를 읽은 즉시 `history.replaceState`로 fragment를 지우며, analytics·오류 리포팅 초기화와 third-party script의 `location.hash` 접근은 그 뒤에만 가능하다(QA 조건 (#55)).
- 키는 URL path·query string, 서버·액세스 로그, analytics에 넣지 않고 응답으로 되돌려 주지 않는다. 틀린·없는·폐기된 키는 같은 401로 응답해 키 존재를 드러내지 않는다.
- 운영자는 키를 재발급할 수 있다. 재발급은 같은 transaction에서 이전 키와 그 키로 연 Participant session을 모두 즉시 폐기하고 audit에 남긴다.
- 단계: 세션 발급은 Phase 3에서 구현한다. P0-08은 participant 인증 체인을 모든 요청에 401을 돌려주는 stub으로만 둔다.

### 범위 밖

- 전화번호 OTP, SMS vendor 연동. 프로토타입의 인증번호 화면은 MVP 서버 계약이 아니다.
- 키 TTL, 세션 TTL, 키 복구, rate limit 숫자, 재발급 endpoint 경로와 Permission은 OPEN이다.

### Follow-up (2026-10-21): 참여자 세션을 MVP로 앞당김

- 위 "단계"의 Phase 3 문장을 고친다. 참여자 세션 발급(`POST /api/v1/public/events/{eventId}/participant-sessions`), `GET /api/v1/participant/me`, `POST /api/v1/participant/auth/logout`는 Phase 3보다 앞서 MVP에 넣었다(#194 화면, 서버 경로는 이미 열려 있음).
- 키·fragment·hash·401 규칙은 그대로다. 세션 쿠키 이름과 속성은 DEC-067을 따른다.
- 키 TTL, 세션 TTL, 키 복구, rate limit, 재발급 endpoint는 여전히 OPEN이다.

현 결정 2026-10-21.

### Consequence

상세 계약과 회귀 표는 [API Architecture](../architecture/api-architecture-v0.1.md#2026-10-06-mvp-참여자-인증-dec-064)(§3 포함), 보안 기준은 [Security / Privacy](../architecture/security-privacy-v0.1.md#3-participant-access) §3, 저장은 [Data Model](../architecture/data-model-v0.1.md#6-security-data) §6을 따른다. 서버 구현은 QA·현 확인 뒤다.

### Evidence

현 결정 2026-10-06 (SCENE 개발 리드 전달).

---

## DEC-065 — 업무 command 오류는 목표 상태 → version → 업무 상태 순으로 판정하고 Override 사유는 audit에 남긴다

**Date:** 2026-10-06

**Status:** CONFIRMED (현 결정 2026-10-06) — DEC-062·DEC-063 기술 계약 보강

### Context

- #31(DEC-062) 업무 계약의 판정 순서 문장 "409 업무 상태 → 409 version"이 같은 절의 회귀 #12(다른 사람이 항목을 해제한 뒤 이전 version으로 complete → 409 `TASK_VERSION_CONFLICT`)와 모순됐다. 문장대로라면 `INVALID_TASK_STATE`(`CHECKLIST_INCOMPLETE`)가 먼저 나온다.
- #30(DEC-063) `event_lifecycle_transitions.reason`은 "재개 사유 또는 Override 사유" 한 칸이라 Space OWNER가 재개를 대신 실행하면 두 사유 중 하나를 잃는다. `override.reason`을 audit 어디에 남기는지도 정해지지 않았다.

### Decision

- 업무 complete·reopen·항목 설정의 판정 순서는 404(없음) → 403(권한) → 이미 목표 상태면 200 → 409 `TASK_VERSION_CONFLICT` → 409 `INVALID_TASK_STATE`다.
  - 목표 상태 200은 `ALREADY_DONE`(DONE 업무에 complete), `ALREADY_OPEN`(TODO/DOING 업무에 reopen)이며 요청 version과 무관하고 version은 바뀌지 않는다. 항목 설정의 같은 값은 `NO_CHANGE`다.
  - 요청 version이 오래됐으면 업무 상태와 무관하게 `TASK_VERSION_CONFLICT`다(complete·reopen만. 항목 설정은 version을 받지 않는다).
  - version이 맞을 때만 `INVALID_TASK_STATE`(`reason: TASK_CANCELLED | TASK_DONE | CHECKLIST_INCOMPLETE`)를 판정한다.
  - 400 요청 값과 409 `EVENT_ARCHIVED`는 지금 문서 위치(403 뒤, 목표 상태 200 앞)를 유지한다. 보관된 행사의 재전송은 409 `EVENT_ARCHIVED`다(DEC-063).
- Space OWNER가 재개를 대신 실행하면 재개 사유는 전이 행 `reason`에, `override.reason`은 audit 항목 details(`actedAs`와 함께 `overrideReason`)에 저장한다. 모든 Override command에서 `override.reason`은 audit details에 남긴다.
- `override.reason`은 받는 모든 command에서 1~500자로 검사하고 어기면 400 `VALIDATION_FAILED`다. 재개에서만 검사하는 것이 아니다.

### Alternatives

기존 문장(업무 상태 → version)은 회귀 #12와 모순되고, 오래된 화면에서 온 요청에 현재와 다른 원인의 오류를 줄 수 있어 채택하지 않았다. 전이 행 `reason` 한 칸에 두 사유 중 하나만 남기는 안은 필수 정당화나 재개 사유 중 하나를 잃어 채택하지 않았다.

### Reason

lifecycle command(DEC-063)의 `ALREADY_IN_STATE` → `CONCURRENT_MODIFICATION` → `INVALID_STATE_TRANSITION`과 같은 방식으로 맞춰 재시도·늦은 요청을 한 가지 규칙으로 처리한다. 오래된 version이면 클라이언트는 409 본문 `task`로 현재 상태를 다시 그린다. Override 사유는 대행의 필수 정당화라 잃지 않게 한다.

### Consequence

업무 판정 순서·오류표·회귀(#12·#14·#15 수정, #40·#41 추가)는 [API Architecture](../architecture/api-architecture-v0.1.md#2026-10-02-업무-체크리스트-저장-계약-31-dec-062) §8, Override 사유 저장·검증과 회귀(#17~#19)는 [API Architecture](../architecture/api-architecture-v0.1.md#2026-10-02-행사-lifecycle-command-30-dec-063), 전이 행 `reason`은 [Data Model](../architecture/data-model-v0.1.md#2026-10-02-행사-lifecycle-30-dec-063), 권한은 [Security / Privacy](../architecture/security-privacy-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 DEC-063 항을 따른다. 문서만 바꿨으며 서버 코드 정합은 후속이다.

### Evidence

현 결정 2026-10-06. [#31](https://github.com/BeomhyunPark/SCENE/issues/31), [#30](https://github.com/BeomhyunPark/SCENE/issues/30).

---

## DEC-066 — SCENE은 AI 기능을 포함하고 첫 AI 범위는 C1과 C7이다

**Date:** 2026-10-15

**Status:** CONFIRMED (현 결정 2026-10-15) — §17 OPEN "AI 기능 포함 여부" 해소

### Context

§17과 [Product Definition](PRODUCT_DEFINITION.md) §10은 "AI 기능 포함 여부"를 OPEN으로 두었다. SCENE Product가 `main` @ `94be076` 기준으로 [AI 기능 제안](ai-feature-proposal.md)(후보 C1~C8, 비교, 추천 범위, 현 결정 항목)을 작성했다. 제약은 §5.5(사람의 운영 판단을 빼앗지 않고 조 편성에 Algorithmic Assignment를 전제하지 않음), DEC-025(Not Used ≠ Incomplete), DEC-060(협력자 연락처 비공개), DEC-061(참가자 데이터는 교회가 개인정보처리자, SCENE은 수탁자), DEC-064(접근 키 비노출)다.

### Decision

- SCENE은 AI 기능을 포함한다.
- 첫 AI 범위(MVP+AI)는 다음 두 기능이다.
  - **C1** 행사 작성 시 시작 업무·체크리스트 추천(운영자).
  - **C7** 신청서 빌더의 개인정보 가드레일: 신청 질문이 민감정보를 묻으면 경고한다(차단하지 않음).
- **Hard rule (C1·C7):** 참가자 개인정보(PII)를 AI 공급자에게 보내지 않는다. C1은 행사 메타데이터(유형, 코드에서 계산한 기간 구간 등)만, C7은 필드 라벨만 보낸다.
- AI는 제안하고 사람이 확정한다. AI 출력이 스스로 상태를 쓰지 않으며, 실패·지연 시 현재의 수동 화면으로 돌아간다. C1 추천은 선택 사항이며 "미완료"로 표시하지 않는다(DEC-025).
- 모델 방향: TypeSafe **Jev 우선**. 생성이 아니라 분류·typed decision(Choice/Score/Noul)으로 쓰고, 버전이 고정된 model ID(예: `jev-1.13.0`)를 쓴다. 움직이는 alias(`jev-latest`)는 쓰지 않는다.
- C2~C6, C8은 backlog다. C3(조 편성 균형 힌트)는 AI 없이 코드로만 한다(§5.5, Algorithmic Assignment 없음).

### OPEN (이 DEC에서 정하지 않음)

- 최종 공급자 선택(Jev 단독 또는 LLM과의 hybrid).
- 미국 공급자에 대한 재위탁 동의와 처리위탁 계약 변경. TypeSafe DPA에는 PIPA 조항이 없어 법률 검토가 필요하다.
- 행사·조직별 비용 상한.
- 기능별 전송 필드 allowlist와 redaction 정책.
- 조직별 AI on/off(제안: 기본 off).
- 한국어 평가 기준. Jev 문서가 영어 외 품질이 낮을 수 있다고 하므로 도입 확정 전에 한국어 test set이 필요하다.
- 의존성: C1은 체크 항목 추가 HTTP route가 필요하며 아직 API에 없다(설계는 후속).

### Follow-up (2026-10-20): Laya 나중에 검토

- 나중에 검토할 후보 모델은 [Laya](https://laya.convaiinnovations.com/)다(Apache 2.0, 자체 호스팅, [모델](https://huggingface.co/convaiinnovations/laya)). 주 대상은 C7이다.
- 지금은 C1을 고정 템플릿으로, C7을 로컬 규칙으로 출시한다. 교체 지점은 `suggestTasks` / `checkFieldPrivacy` 인터페이스다.
- 나중 검토의 전제: 한국어 gold set(라벨 약 200개), 파인튜닝, 규칙 대비 PoC.
- 제안 기준: 규칙 대비 재현율 +10%p 이상, 오탐률 ≤10%, 높은 신뢰도 오답 ≤3%, p95 ≤300ms, CPU 전용 호스트에서 RAM ≤3GB.
- 붙인다면 Spring만 호출하는 sidecar로 두고, provider adapter 뒤에 둔다.

### Alternatives

AI 없이 출시하는 안은 시장 기대에 맞지 않아 채택하지 않았다. 제안서의 3순위 C8(참가자 질문 라우터)은 참가자 데이터가 공급자로 가 재위탁 결정이 먼저 필요해 backlog로 두었다. C3의 AI 편성은 §5.5와 충돌해 채택하지 않았다.

### Reason

시장이 AI 기능을 기대하며, AI가 없으면 사용자가 도입하지 않는다(현). C1·C7은 참가자 PII 없이 기존 API 위에서 첫날 가치("AI가 시작을 돕는다")와 교회 관리자의 신뢰를 함께 만든다.

### Consequence

후보·비교·근거는 [AI 기능 제안](ai-feature-proposal.md)에 둔다. 위 OPEN과 C1의 체크 항목 추가 route는 후속 결정·설계다. 문서만 바꿨으며 코드는 없다.

### Evidence

현 결정 2026-10-15. [AI 기능 제안](ai-feature-proposal.md)(SCENE Product, `main` @ `94be076`).

---

## DEC-067 — 개발용 로그인은 Spring profile로만 열고 세션 쿠키 이름을 `SCENE_SESSION`·`SCENE_PSESSION`으로 정한다

**Date:** 2026-10-21

**Status:** CONFIRMED (현 결정 2026-10-21)

### Context

2026-10-21 구현 리뷰(`main` @ `db67aba`)가 다음을 찾았다.

- `POST /api/v1/operator/auth/login`은 아무 `userId`나 받아 그 사용자로 로그인시키고, `permitAll`이며 profile·flag 제한이 없다. 모든 profile에서 UUID만 알면 그 계정이 된다.
- 같은 요청의 `email`을 세션에 두고 초대 수락이 이 값과 초대 이메일을 비교한다. 토큰을 가진 사람이 초대받은 이메일을 보내면 초대를 수락할 수 있다.
- 로그인을 수동으로 처리해 session id가 바뀌지 않는다(session fixation).
- 프론트엔드는 `VITE_DEV_LOGIN=1`이면 어떤 build에서도 개발용 로그인을 켜고, 개발용 패널이 seed fixture를 import해 production bundle에 seed 사용자와 UUID가 들어간다.
- 세션 쿠키 이름이 `placeholder-operator-session`·`placeholder-participant-session`이고 prod가 덮어쓰지 않는다.
- 회고 GET/PUT은 서버에 없고 MSW mock(`unverified`)뿐이다.

### Decision

- **개발용 로그인은 Spring profile로만 연다.** `local`·`test` profile에서만 개발용 로그인 경로가 존재한다. 다른 모든 profile(stg, prod 등)에서는 경로 자체가 없어 404다. 켜는 환경 변수나 property flag는 두지 않는다.
  - 로그인 body의 `email`도 개발용 로그인과 함께 `local`·`test`에서만 의미가 있다. 다른 profile에서는 클라이언트가 보낸 이메일을 믿지 않으며, 검증된 이메일이 없으면 초대 수락은 `EMAIL_NOT_VERIFIED`다.
  - 프론트엔드는 `VITE_DEV_LOGIN` production 경로를 없애고 `import.meta.env.DEV`일 때만 개발용 패널을 켠다. 개발용 패널과 seed 데이터는 dev build에서만 lazy-load해 production bundle에 들어가지 않는다.
  - 실제 인증(비밀번호 로그인 등)과 검증된 이메일은 외부 사용자에게 열기 직전에 넣는다. 그 전까지 서버는 공개 노출하지 않는다.
- **세션 쿠키:** 운영자 세션은 `SCENE_SESSION`, 참여자 세션은 `SCENE_PSESSION`이다. 둘 다 `SameSite=Lax`, `Secure`, `HttpOnly`다. 로그인 성공 시 `request.changeSessionId()`로 session id를 바꾼다.
- **회고:** 지금은 draft 전용(mock, `unverified` 표시)으로 둔다. 회고 저장 API는 아직 만들지 않는다.
- **다음 slice 순서:** (a) 개발용 로그인 gate와 세션 수정 → (b) 신청 목록 → (c) 초대 생성 → (d) 회고 API(나중).

### 범위 밖

- 문구 정리(초대, 나가기, 종료, 회고, 신청, 개인정보 경고)는 진행 중인 UI/UX 리뷰 뒤에 한다. 이 DEC에 넣지 않는다.
- 비밀번호 로그인·이메일 검증의 방식은 OPEN이다. 운영자 세션 만료는 아래 Follow-up (2026-11-02)에서 정했다.

### Alternatives

`scene.dev-login.enabled` 같은 property flag로 켜는 안은 stg·prod 설정 실수 하나로 사칭이 열리므로 채택하지 않았다. `__Host-` 접두 이름은 참여자 쿠키 경로가 `/api/v1/participant`라 `Path=/` 조건과 맞지 않아 쓰지 않았다.

### Reason

실제 인증이 들어오기 전까지 사칭 경로가 운영 환경에 존재하지 않게 하는 가장 단순한 방법이 profile gate다. 쿠키 이름·속성을 지금 정해 자리표시자가 운영에 남지 않게 한다.

### Consequence

서버 구현(profile gate, 404 IT, 이메일 spoof 차단 테스트, 쿠키 이름, `changeSessionId`)과 프론트엔드 정리는 slice (a) PR에서 한다. 그 전까지 [backend/docs/api.md](../../backend/docs/api.md)는 "결정 문서와 다른 점"에 차이를 적는다. 참여자 세션의 단계 변경은 DEC-064 Follow-up (2026-10-21)에 있다. 문서만 바꿨으며 코드는 없다.

### Follow-up (2026-11-02): 운영자 세션 만료 60분

- 운영자 세션(`SCENE_SESSION`)은 마지막 요청 뒤 60분 동안 요청이 없으면 만료된다. `spring.session.timeout: 60m`이다.
- 참여자 세션(`SCENE_PSESSION`) TTL, 접근 키 TTL은 DEC-064대로 여전히 OPEN이다.

현 결정 2026-11-02.

### Follow-up (2026-11-16): 회고 저장 API (#237)

slice (d)를 연다. 위 Decision의 "회고는 draft 전용, 저장 API는 아직 만들지 않는다"는 이 Follow-up으로 대체한다.

- 행사당 회고 글 하나를 서버에 저장한다. `GET`·`PUT /api/v1/operator/events/{eventId}/retrospective`. 응답은 `{ text, version, updatedAt, updatedByDisplayName }`다.
- 쓰기는 effective `EVENT_UPDATE`(행사 OWNER 기본, 개인별 GRANT 가능)다. (2026-11-20 → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2): MANAGER도 기본으로 쓴다.) 읽기는 effective `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 회고 전용 권한 키는 만들지 않는다.
- 쓰기는 `ENDED`에서만 한다(DEC-051). `ARCHIVED`는 `409 EVENT_ARCHIVED`, `DRAFT`·`ACTIVE`는 `409 INVALID_STATE_TRANSITION`이다. 읽기는 모든 상태에서 된다.
- `PUT`은 `{ text, expectedVersion }`를 받고 저장된 version과 다르면 `409 CONCURRENT_MODIFICATION`이다. `text`는 0~10,000자(잠정)다.
- 아직 없는 회고는 `200 { text: "", version: 0, updatedAt: null, updatedByDisplayName: null }`이다.
- 저장마다 audit `EVENT_RETROSPECTIVE_UPDATED`를 남기고 details에는 새 version만 둔다. 본문은 audit·로그·오류 응답에 넣지 않는다.
- 버린 안: OWNER만 쓰기(GRANT로 넓힐 수 없음), MANAGER 기본 쓰기(RoleDefaults 변경 — 2026-11-20 [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)에서 채택), `ACTIVE`에서도 쓰기(DEC-051 범위 확대), 운영자별 여러 글·섹션 구조, 없는 회고 `404`, audit 없음.

현 결정 2026-11-16.

### Evidence

현 결정 2026-10-21. SCENE 구현 리뷰 2026-10-21(S1~S6, S8).

---

## DEC-068 — 신청서 질문은 유형 9종과 조건부 표시를 갖고 신청 접수 후 유형 변경·보기 삭제·표시 조건 변경을 잠근다

**Date:** 2026-11-16

**Status:** CONFIRMED (현 결정 2026-11-16)

### Context

2027년 1월 하순 수련회를 SCENE으로 운영하고 12월 15일쯤 신청을 연다([#230](https://github.com/BeomhyunPark/SCENE/issues/230)). 지금 신청서는 SYSTEM 이름·전화와 CUSTOM 자유 텍스트 질문 1개뿐이다. `V3__forms.sql`의 `fields_one_custom`이 CUSTOM을 1개로 막고, 답은 `answers.value` jsonb에 `{"text": "…"}`로 저장된다.

참고한 실제 수련회 신청서는 질문 약 35개 중 7개만 모두에게 보이고, 나머지는 참석 방식 → 교통편 → 동승 순서로 앞 답에 따라 열린다. 교통편 보기도 참석 방식에 따라 바뀐다([#223 댓글](https://github.com/BeomhyunPark/SCENE/issues/223#issuecomment-6905714860)). 처음에는 조건부 질문을 다음 단계로 미뤘지만, 이 분석을 보고 사용자가 1차 범위로 옮겼다([#223 댓글](https://github.com/BeomhyunPark/SCENE/issues/223#issuecomment-6905749109), [#229](https://github.com/BeomhyunPark/SCENE/issues/229)). [#224](https://github.com/BeomhyunPark/SCENE/issues/224) 본문의 "조건부 질문 보류"는 이 결정 전 내용이라 따르지 않는다.

### Decision

- **질문 유형은 9종이다.** 단답형, 서술형, 단수선택, 복수선택, 드롭다운, 날짜, 기간, 숫자, 예/아니오. 신청서당 CUSTOM 1개 제한을 없앤다.
- **참고 사례에서 나온 요구는 새 유형 없이 설정으로 처리한다.** 도착·출발 시각은 `includeTime`, 개인정보 동의는 예/아니오의 `style: CONSENT`, 일자별 프로그램·식사는 보기 `group`, 전화·숫자만 입력은 단답형 `format`, 보기 2~3개 버튼 표시는 `display: BUTTONS`.
- **보기는 서버가 준 고정 `optionId`(`opt_…`)를 갖고 답은 id로 저장한다.** 보기 문구를 고쳐도 받은 답이 유지된다.
- **조건부 표시를 1차에 넣는다.** 질문과 보기 모두 `showWhen`을 가질 수 있다. 서버가 제출된 답으로 조건을 다시 계산하고, 숨겨진 질문은 검증하지 않으며 그 답은 거절하지 않고 저장하지 않는다.
- **잠금 기준은 그 신청서에 `SUBMITTED` 신청이 1건 이상 있는지다.** 잠기면 유형 변경, 있던 보기 삭제, 질문·보기의 `showWhen` 변경, 질문 삭제를 `409 FIELD_LOCKED`로 거부한다. 질문 삭제 대신 숨기기를 쓴다. 제목·설명·필수·순서, 보기 추가·문구 수정·숨기기는 허용한다.
- **C7 개인정보 경고(DEC-066)는 질문 제목·설명과 보기 문구에 적용한다.** 경고만 하고 저장을 막지 않는다. 확인에는 운영자가 쓴 문구만 보내고 행사·참가자 답은 보내지 않는다.

#### 1. 유형별 config와 답 값

모든 질문 공통: `label`(1–200자, 앞뒤 공백 제거), `description`(0–500자, 빈 값은 `null`), `required`(기본 `false`), `position`, `hidden`(기본 `false`), `showWhen`(기본 `null`).

| `answerType` | 이름 | `config` 키 (기본값) | 답 `value` |
|---|---|---|---|
| `SHORT_TEXT` | 단답형 | `maxLength` 1–200 (200), `format` `NONE`·`PHONE`·`DIGITS` (`NONE`), `placeholder` ≤100자 (`null`) | `{"text"}` |
| `LONG_TEXT` | 서술형 | `maxLength` 1–2000 (1000), `placeholder` | `{"text"}` |
| `SINGLE_CHOICE` | 단수선택 | `options`, `allowOther` (`false`), `display` `LIST`·`BUTTONS` (`LIST`) | `{"optionId"}` 또는 `{"other"}` |
| `MULTI_CHOICE` | 복수선택 | `options`, `allowOther` (`false`), `minSelect` 0–보기 수 (0), `maxSelect` (`null` = 제한 없음, `minSelect` 이상) | `{"optionIds": [...], "other"?}` |
| `DROPDOWN` | 드롭다운 | `options` | `{"optionId"}` |
| `DATE` | 날짜 | `includeTime` (`false`), `min`·`max` (`null`, `min ≤ max`) | `{"date"}` 또는 `includeTime`이면 `{"dateTime"}` |
| `DATE_RANGE` | 기간 | `includeTime` (`false`), `min`·`max` (`null`) | `{"start", "end"}`, `start ≤ end` |
| `NUMBER` | 숫자 | `min`·`max` (`null`, 절댓값 ≤ 10억), `unit` ≤10자 (`null`) | `{"number"}` 정수만 |
| `YES_NO` | 예/아니오 | `style` `YES_NO`·`CONSENT` (`YES_NO`), `yesLabel`·`noLabel` ≤20자 (`null`) | `{"value": true/false}` |

- 보기: `{ "optionId", "label"(1–100자), "group"(≤50자, `null`), "hidden"(`false`), "showWhen"(`null`) }`, 질문당 1–50개. 새 보기는 `optionId` 없이 보내면 서버가 발급한다. 모르는 `optionId`는 `400`이다.
- `allowOther`의 직접 입력 글은 1–200자다.
- 날짜·시간은 행사 현지 시각(Asia/Seoul)이다. `date`는 `YYYY-MM-DD`, `dateTime`은 `YYYY-MM-DDTHH:mm`이고 offset이 없다.
- 날짜 범위 기본값 = 행사 기간: 서버는 `min`·`max`를 채우지 않는다. 운영자 빌더(#226)가 질문을 만들 때 행사 기간을 기본값으로 넣는다.
- 숫자는 정수만 받는다. 소수 설정은 두지 않는다.
- `config`에 유형과 맞지 않는 키가 있으면 `400`이다. 유형을 바꾸면(잠기기 전) config는 새 유형 기본값으로 다시 만든다.
- 한도: 신청서당 질문 최대 100개(SYSTEM 포함).

**기존 답과 SYSTEM 질문:** 기존 CUSTOM 질문은 `SHORT_TEXT`, `required=false`로 옮기고 답 값은 바꾸지 않는다. SYSTEM 이름은 `SHORT_TEXT`(`maxLength` 200, `format NONE`), 전화는 `SHORT_TEXT`(`maxLength` 50, `format PHONE`, 숫자 4개 이상)이고 둘 다 늘 `required`다. 둘 다 `{"text"}` 그대로라 신청 목록의 `name`(`value.text`)과 한 건 조회가 바뀌지 않는다. SYSTEM은 제목만 고칠 수 있고 유형·필수·조건·숨김·삭제는 안 된다(→ [DEC-070](#dec-070--운영자는-신청서-설정으로-질문을-자동으로-만들고-기본항목은-이름전화또래다)이 설명·안내 문구 수정과 순서 변경, 또래 항목을 더했다). 제출 요청은 예전 `{fieldId, text}`도 계속 받는다.

#### 2. 필수·설명·순서

- 필수와 설명은 언제든 바꿀 수 있다. 바뀐 필수는 새 제출부터 적용하고, 받은 답은 다시 검사하지 않는다. 글자 수·선택 수·범위를 좁혀도 같다.
- 순서는 SYSTEM 이름·전화를 맨 앞에 두고 CUSTOM끼리 바꾼다(→ DEC-070: 기본항목도 순서를 바꾼다). 순서를 바꾼 뒤에도 모든 조건은 앞 질문을 가리켜야 하며, 아니면 `400`이다.

#### 3. 조건부 표시

```json
"showWhen": { "fieldId": "…", "optionIds": ["opt_partial", "opt_worship"] }
"showWhen": { "fieldId": "…", "equals": true }
```

- 조건을 걸 수 있는 대상: `SINGLE_CHOICE`·`MULTI_CHOICE`·`DROPDOWN`·`YES_NO`. 텍스트·날짜·숫자 답에는 걸 수 없다.
- 형태: "질문 X의 답이 보기 A 중 하나"(보기 OR 한 단계) 또는 예/아니오 `equals`. 조건은 하나만이고 AND는 두지 않는다. 참고 사례는 조건을 이어 붙여(참석 방식 → 교통편 → 동승) 만들 수 있다.
- 복수선택 대상은 고른 보기 중 하나라도 `optionIds`에 있으면 참이다. 기타(직접 입력)는 조건에 쓰지 않는다.
- 대상은 순서상 앞 질문만 고를 수 있어서 순환이 생기지 않는다. 대상이 숨겨지거나 답이 없으면 조건은 거짓이다(연쇄로 숨김).
- **보기 단위 조건을 둔다.** 참석 방식별로 교통편 보기가 바뀌는 경우에 같은 질문 하나로 만든다. 질문을 나눠 만들면 명단·CSV의 교통편 열이 셋으로 갈라진다.
- 서버는 position 순서로 조건을 다시 계산하고 화면이 보낸 표시 여부를 믿지 않는다. 숨겨진 질문(숨김이거나 조건이 거짓)은 필수·범위 검사를 하지 않고 그 답을 버린다. 숨겨진 보기를 고른 답은 그 보기를 빼고 본다. 참가자 화면은 앞 답이 바뀌면 숨겨진 입력을 비운다.
- 다른 질문·보기의 `showWhen`이 가리키는 질문은 삭제할 수 없다(`409 CONFLICT`).

#### 4. 제출 검증 순서

1. 모르는 `fieldId`, 겹친 `fieldId`, 유형과 다른 값 모양 → 거절
2. 조건을 계산해 보이는 질문만 남긴다
3. 보이는 필수 질문에 답이 없으면 → 거절 (빈 글은 답 없음)
4. 유형별 범위: 글자 수, `format`, 보기 존재·숨김, 선택 수, 날짜·숫자 범위, `start ≤ end`, 필수 동의 체크

실패는 지금처럼 `400 APPLICATION_VALIDATION_FAILED`이고 `errors`는 없다. 질문별 오류 위치는 참가자 화면(#227)이 같은 규칙으로 먼저 보여 준다.

#### 5. 신청 접수 후 편집 (잠금 표)

잠금 = 그 신청서에 `SUBMITTED` 신청이 1건 이상. 운영자 신청서 상세는 `locked`로 알려 주고, 빌더(#226)는 잠긴 동작을 끄고 이유를 보여 준다.

| 동작 | 잠기기 전 | 잠긴 뒤 |
|---|---|---|
| 질문 제목·설명 수정 | 허용 | 허용 |
| 필수 여부 변경 | 허용 | 허용 (새 제출부터) |
| 질문 추가, 순서 변경 | 허용 | 허용 (조건은 앞 질문 유지) |
| 질문 숨기기·다시 보이기 | 허용 | 허용 |
| 보기 추가, 보기 문구 수정 | 허용 | 허용 |
| 보기 숨기기·다시 보이기 | 허용 | 허용 |
| 글자 수·선택 수·범위 변경 | 허용 | 허용 (받은 답은 다시 검사 안 함) |
| 질문 유형 변경 | 허용 | **`409 FIELD_LOCKED`** |
| 있던 보기 삭제 | 허용 | **`409 FIELD_LOCKED`** (숨기기 안내) |
| 질문·보기의 `showWhen` 변경 | 허용 | **`409 FIELD_LOCKED`** |
| CUSTOM 질문 삭제 | 허용 (실제 삭제) | **`409 FIELD_LOCKED`** (숨기기 안내) |
| SYSTEM 질문 삭제·유형 변경 | `409 CONFLICT` | `409 CONFLICT` |

ErrorCode는 `FIELD_LOCKED`(409) 하나다(#225가 추가한다). 동작별 코드는 두지 않는다.

#### 6. 숨긴 질문·보기와 받은 답

- 접수 후에는 질문을 지울 수 없으므로 받은 답이 없어지지 않는다. 잠기기 전에는 받은 답이 없어 실제로 지운다.
- 숨긴 질문은 공개 신청서에서 빠지고 새 답을 받지 않는다. 신청 원본 조회(#228)와 CSV(#233)에는 계속 열로 나오고 제목 뒤에 "(숨김)"을 붙인다.
- 숨긴 보기는 새 참가자에게 보이지 않는다. 이미 그 보기를 고른 답은 원본 조회·CSV에서 보기 문구 뒤에 "(숨김)"을 붙여 보인다.
- 원본 조회·CSV는 `optionId`를 현재 보기 문구로 바꿔 보여 준다. 날짜·기간은 읽기 좋은 형식으로 보인다.

### 범위 밖

- AND·NOT 조건, 텍스트·날짜·숫자 답에 거는 조건, 페이지 나누기·건너뛰기
- 파일 첨부, 서명, 표(그리드) 질문, 소수 숫자
- 답에 따른 자동 계산(참가비 등). 이번 수련회 참가비는 SCENE 밖에서 한다(#230).
- 제출 실패 응답에 질문별 `errors[].fieldId`를 넣는 것

### Alternatives

- 기본 4종(단답·서술·단수·복수) 또는 6종: 날짜·숫자를 자유 텍스트로 받아 명단 정리가 어렵다.
- 시각·동의 체크·일자 묶음 복수선택을 별도 유형으로 추가: 빌더와 검증 코드가 함께 커진다. 9종의 설정으로 충분하다.
- 조건부 질문 보류: 참고 사례 신청서를 만들 수 없다.
- 보기 단위 조건 없이 질문을 나눠 만들기: 같은 질문을 참석 방식별로 세 번 만들고 CSV 열이 갈라진다.
- 숨겨진 질문에 온 답을 거절: 참가자가 앞 답을 바꾼 뒤 남은 값만으로 제출이 실패한다.
- 접수 후 모든 편집 허용 + 경고: 받은 답이 새 질문과 맞지 않는다. 접수 후 모든 편집 잠금: 오타도 못 고친다.
- 선택 3종 모두 `{"optionIds": [...]}`, 예/아니오 `{"bool"}`, 날짜 하나의 키로 통일: 조건·CSV 처리는 단순해지지만 이미 구현·테스트된 서버(`AnswerEvaluator`)와 화면(`answerModel`)을 다시 고쳐야 해서 12/10 일정에 맞지 않는다.
- 숨긴 질문을 CSV에서 빼고 원본 조회에만: 받은 답이 CSV에서 사라진다.
- 동작별 ErrorCode(`FIELD_TYPE_LOCKED` 등 3개): 화면이 잠긴 동작을 미리 끄므로 코드 하나로 충분하다.

### Reason

운영자가 수련회마다 필요한 질문과 분기를 직접 구성해야 SCENE이 실제 신청 접수를 대신할 수 있다. 이미 받은 답의 뜻을 바꾸는 동작만 잠가 운영 중 오타·안내 수정의 자유를 남긴다.

### Consequence

구현은 [#225](https://github.com/BeomhyunPark/SCENE/issues/225)(백엔드, 마이그레이션 **V9** — V8은 회고 저장이 썼다), [#226](https://github.com/BeomhyunPark/SCENE/issues/226)(운영자 빌더), [#227](https://github.com/BeomhyunPark/SCENE/issues/227)(참가자 입력), [#229](https://github.com/BeomhyunPark/SCENE/issues/229)(조건부), [#228](https://github.com/BeomhyunPark/SCENE/issues/228)(원본 조회·실제 클릭), [#233](https://github.com/BeomhyunPark/SCENE/issues/233)(CSV)에서 한다. 저장 구조는 `fields`에 `answer_type`, `required`, `description`, `config jsonb`, `show_when jsonb`, `hidden`을 더하고 `fields_one_custom`을 지운다. 보기는 `config.options`에 둔다. API 계약은 #225가 [backend/docs/api.md](../../backend/docs/api.md)에 반영한다. 이 DEC는 문서만 바꿨으며 코드는 없다.

### Evidence

현 결정 2026-11-16. 사용자 결정: 1차 유형 9종·조건부 질문 1차 포함·접수 후 편집 정책([#223](https://github.com/BeomhyunPark/SCENE/issues/223), [#229](https://github.com/BeomhyunPark/SCENE/issues/229)), 참고 사례 요구는 설정으로·보기 단위 조건·숨겨진 답은 버림·접수 후 질문 삭제는 숨기기·조건 변경 잠금, 이미 구현된 답 값 모양 유지, 숨긴 질문은 CSV에 "(숨김)" 열로 유지, ErrorCode `FIELD_LOCKED` 하나(2026-11-16 #224 확인). 참고 사례 분석([#223 댓글](https://github.com/BeomhyunPark/SCENE/issues/223#issuecomment-6905714860)).

---

## DEC-069 — 운영자는 Google로 로그인하고, 가입은 초대 기반이며, 첫 관리자는 서버 설정으로 정한다

**Date:** 2026-11-16

**Status:** CONFIRMED (현 결정 2026-11-16)

### Context

2027년 1월 수련회를 운영 서버(홈서버, [home-server.md](../devops/home-server.md))에서 연다([#230](https://github.com/BeomhyunPark/SCENE/issues/230)). DEC-067에 따라 개발용 로그인은 `local`·`test`에만 있어서, 운영 서버에서는 운영자가 로그인할 방법이 없다. 서버에는 사용자 계정을 만드는 기능과 조직을 만드는 API도 없다.

### Decision

- **운영자 로그인은 Google(OIDC)이다.** 이메일·비밀번호 로그인은 이번에 만들지 않는다.
- **Google 계정이면 누구나 로그인할 수 있다.** 첫 로그인 때 사용자를 만든다. 무엇을 볼 수 있는지는 지금처럼 조직 멤버십과 행사 초대로만 정해진다.
- **Google이 확인한 이메일(`email_verified`)만 받는다.** 그 이메일을 세션의 초대 확인용 이메일로 쓴다(DEC-067의 `EMAIL_NOT_VERIFIED` 규칙을 그대로 따른다).
- **첫 관리자는 서버 설정으로 정한다.** `SCENE_BOOTSTRAP_OWNER_EMAIL`의 계정이 로그인할 때 조직이 하나도 없으면 `SCENE_BOOTSTRAP_SPACE_NAME` 조직을 만들고 OWNER로 넣는다. 한 번만 일어난다.
- Google의 access·refresh token은 저장하지 않는다. 확인된 신원만 쓴다.

### 범위 밖

- 이메일·비밀번호 로그인, 비밀번호 재설정 메일
- 누구나 조직을 만드는 공개 가입·조직 생성 API와 화면
- 한 사용자에 여러 로그인 수단을 연결하는 기능

### Alternatives

- 허용 목록 로그인: 서버 설정에 적은 이메일만 로그인한다. 운영진이 바뀔 때마다 서버 설정을 고쳐야 해서 채택하지 않았다.
- 공개 가입과 조직 생성: 조직 생성 API와 화면이 함께 필요해 1월 일정에 무겁다.

### Reason

Google 로그인은 비밀번호 보관과 재설정 메일이 필요 없고, 이메일 확인을 Google이 해 준다. 접근 권한은 이미 있는 멤버십·초대 규칙이 지키므로, 로그인 자체는 열어 두고 첫 조직만 서버 설정으로 만든다.

### Consequence

서버는 `identity/GoogleLoginSecurity`, `GoogleAccountService`, `GoogleSignInHandler`, Flyway V10 `user_google_identities`이고, 계약은 [backend/docs/api.md](../../backend/docs/api.md) "Google 로그인"에 있다. 로그인 화면의 Google 버튼은 실제 로그인으로 바뀌고, 이메일 로그인은 준비 중 안내를 유지한다. 구현은 [#232](https://github.com/BeomhyunPark/SCENE/issues/232)다.

### Evidence

현 결정 2026-11-16. 사용자 답변(가입 방식: 초대 기반 + 첫 관리자 지정).

> 2026-11-18: DEC-076으로 초대 기반 조직 가입(조직 OWNER·ADMIN이 보내는 조직 초대)이 범위 안에 들어왔다. 공개 가입·공개 조직 생성·조직 가입 요청은 계속 범위 밖이다.

---

## DEC-070 — 운영자는 신청서 설정으로 질문을 자동으로 만들고, 기본항목은 이름·전화·또래다

**Date:** 2026-11-16

**Status:** CONFIRMED (현 결정 2026-11-16)

### Context

DEC-068로 운영자가 질문 9종과 조건을 직접 구성할 수 있게 됐다. 그런데 수련회 신청서는 질문 약 35개에 조건이 여러 겹이라, 처음 맡은 사람이 하나씩 만들기 어렵다. 참고한 수련회 운영 앱은 이름 → 성별 → 또래 → 전화 → 참석 방식(전체·부분·집회만) → 분기 → 이동 → 동의의 흐름이 코드에 고정돼 있고, 시간표에서 고른 식사·집회만 자동으로 체크 목록이 된다. 같은 규칙이 신청·본인 수정·서버 세 곳에 중복돼 있기도 했다. 신청 답은 뒤에 조 배정(성별·또래·참석 방식), 식수 집계, 차량 준비의 입력이 되므로 자유 문장이 아니라 찾을 수 있는 값이어야 한다.

SYSTEM 이름·전화는 제목만 고칠 수 있었고 늘 맨 앞에 고정이었다. 이 공동체는 참가자를 "94 또래"처럼 출생연도 두 자리로 나눈다.

### Decision

- **기본항목(SYSTEM)은 이름·전화·또래 세 개다.** 셋 다 삭제할 수 없다. 질문 문구(`label`), 설명(`description`), 안내 문구(`config.placeholder`)를 고치거나 비울 수 있고, 다른 질문과 같이 순서를 바꿀 수 있다. 유형·형식·길이·필수·조건은 고정이다.
- **또래(`COHORT`)는 출생연도 뒤 두 자리다.** 정확히 숫자 두 자리(00–99)만 받고 나이 범위는 검사하지 않는다. 행사마다 켜고 끌 수 있고(`hidden`), 켜져 있으면 필수다. 이름·전화는 끌 수 없다. 답은 `{"text": "94"}`로 저장하고 참가자 정보에는 넣지 않는다. 이미 있는 신청서에도 전화 다음 자리에 켜진 상태로 넣는다.
- **운영자는 신청서 설정(setup)에 답하고, 서버가 질문·보기·조건을 만든다.** 설정 항목은 받을 기본정보(성별·중그룹·셀), 참석 방식(부분 참석 받기·집회만 받기), 일차별 식사·집회 표, 운영하는 이동 수단(단체 차량·집회 차량·자차·대중교통·이동 지원)이다. 개인정보 동의는 항상 들어간다. 만든 질문은 DEC-068의 9종 유형·보기·`showWhen`만 쓴다. 규칙은 서버 한 곳에만 둔다.
- **일차는 행사 기간에서 계산한다.** 숙박 보기는 N박만큼, 집회 차량 회차는 집회가 있는 날만큼 생긴다. 행사에 날짜가 없거나 기간이 10일을 넘으면 설정을 저장할 수 없다.
- **자동 질문은 고정 키(`presetKey`)를, 보기는 뜻에서 계산한 고정 `optionId`를 갖는다.** 운영자가 문구를 바꿔도 집계와 조 배정이 답을 찾는다.
- **자동 질문은 문구만 고친다.** 제목·설명·안내 문구·보기 문구·필수 여부를 바꾸고 끄고 켤 수 있다. 유형·조건·보기 구성 변경과 삭제는 `409 CONFLICT`다. 구성은 설정에서 바꾼다.
- **성별은 기본항목이 아니라 기본으로 켜진 자동 질문(`GENDER`)이다.**
- **가는 길이 자차면 오는 길을 묻지 않는다.** 오는 길 보기에 자차가 없다.
- **차량의 출발 장소·시간은 설정에서 받지 않는다.** 운영자가 만들어진 질문의 설명에 쓴다.
- **직접 질문 만들기(DEC-068)는 그대로 두고 화면 아래 "직접 질문 추가"로 접는다.**

#### 1. 자동 질문

질문 순서는 아래 표 순서다. 조건의 `opt_…`는 그 질문의 보기 id다.

| `presetKey` | 유형 | 생기는 조건 | 표시 조건 |
|---|---|---|---|
| `GENDER` | 단수선택(버튼) `opt_female`·`opt_male`, 필수 | 성별 켬 | — |
| `MIDDLE_GROUP`, `CELL` | 단답형, 선택 | 각각 켬 | — |
| `NEWCOMER` (Follow-up 2026-11-17) | 예/아니오, 필수 | 새가족 켬 | — |
| `ATTENDANCE` | 단수선택(버튼) `opt_full`·`opt_partial`·`opt_worship`, 필수 | 부분 또는 집회만 켬 | — |
| `ARRIVAL_AT`, `DEPARTURE_AT` | 날짜+시간(행사 기간 안), 필수 | 부분 켬 | 참석 방식 = 부분 |
| `LODGING` | 복수선택 `opt_n1`…(N박), 선택 | 부분 켬, 2일 이상 | 참석 방식 = 부분 |
| `MEALS` | 복수선택 `opt_d{일차}_{breakfast\|lunch\|dinner\|worship}`, 날짜 `group`, 필수 | 참석 방식 질문이 있고 체크한 칸이 있음 | 참석 방식 = 부분·집회만 |
| `PARTIAL_NOTE` | 서술형, 선택 | 부분 켬 | 참석 방식 = 부분 |
| `TRANSPORT_IN` | 단수선택 `opt_group`·`opt_shuttle`·`opt_car`·`opt_public`·`opt_support`, 필수 | 이동 수단 하나 이상 | — |
| `SHUTTLE_IN` | 복수선택 `opt_d{일차}`(집회 전), 필수 | 집회 차량이 보기에 있음 | 가는 길 = 집회 차량 |
| `CARPOOL_OFFER` | 예/아니오, 필수 | 자차 켬 | 가는 길 = 자차 |
| `CARPOOL_SEATS`(1–10명)·`CARPOOL_AREA`·`CARPOOL_NOTE` | 숫자·단답형(필수), 서술형(선택) | 자차 켬 | 동승 = 예 |
| `MOBILITY_IN` | 단답형, 필수. 매칭이 보장되지 않는다는 안내 | 이동 지원 켬 | 가는 길 = 이동 지원 |
| `TRANSPORT_OUT` | 단수선택, 자차 없는 네 보기, 필수 | 자차 외 수단 하나 이상 | 가는 길 ≠ 자차 |
| `SHUTTLE_OUT` | 복수선택 `opt_d{일차}`(집회 후), 필수 | 집회 차량이 보기에 있음 | 오는 길 = 집회 차량 |
| `MOBILITY_OUT` | 단답형, 필수 | 이동 지원 켬 | 오는 길 = 이동 지원 |
| `CONSENT` | 예/아니오 `CONSENT`, 필수 | 항상 | — |

- 이동 보기는 참석 방식에 따라 다르다(보기 단위 `showWhen`). 단체 차량은 전체·부분, 집회 차량은 부분·집회만, 나머지는 모두에게 보인다. 참석 방식 질문이 없으면 모두 전체 참석이라 단체 차량에 조건이 없고 집회 차량은 숨긴다.
- **참석 방식과 이동 질문은 보기를 늘 전부 갖고, 꺼진 보기는 숨긴다.** 이 질문을 가리키는 조건이 설정과 상관없이 같아서, 신청 접수 후에도 "집회만 받기" 같은 스위치를 켜고 끌 수 있다.
- 참고 앱이 두 번 묻던 카풀 경유 지역·메모는 `CARPOOL_NOTE` 하나로 합쳤다. 집회 차량 회차는 여러 날 탈 수 있어 복수선택이다.
- 중그룹·셀은 1차에 자유 입력이다. 목록에서 고르게 하는 것은 조 배정(#234) 때 정한다.

#### 2. 설정을 바꿀 때(재생성)

- 새로 필요한 질문은 추가한다. 자리는 표 순서에서 바로 앞에 있는 자동 질문의 뒤다. 운영자가 바꾼 순서는 유지한다.
- 더는 필요 없는 질문은, 신청이 없고 운영자가 손대지 않았고 다른 질문이 가리키지 않으면 삭제한다. 아니면 숨기고 꺼진 상태(`presetActive: false`)로 둔다. 다시 켜면 같은 질문이 운영자 문구 그대로 돌아온다.
- 문구는 "지난번에 만든 문구와 같으면 새 문구로, 다르면 운영자 문구 유지"다. 제목·설명·안내 문구·보기 문구·필수 여부에 적용한다.
- 운영자가 끈 자동 질문은 설정을 다시 저장해도 꺼진 채다. 설정이 끈 질문은 설정으로만 켠다.
- **DEC-068 잠금은 그대로다.** 신청 접수 후에는 없어진 보기를 삭제하지 않고 숨긴다. 이미 있는 질문·보기의 `showWhen`이 바뀌는 설정은 `409 FIELD_LOCKED`로 거부하고 아무것도 저장하지 않는다. 지금 구조에서는 참석 방식 질문이 통째로 생기거나 없어지는 변경(둘 다 끔 ↔ 하나 이상 켬)이 단체 차량이 있을 때 여기에 해당한다.
- 직접 만든 질문이 이 설정으로 없어지는 질문·보기를 가리키면 `409 CONFLICT`다.

#### 3. 집계할 때의 해석

숨겨진 질문의 답은 저장하지 않으므로(DEC-068), 답이 없는 경우를 다음과 같이 센다. 집계 기능(#251)과 조 배정(#234)이 이 규칙을 따른다.

- **전체 참석자는 `MEALS`·`LODGING` 답이 없다. 모든 식사·집회 참석, 모든 밤 숙박으로 센다.** 참석 방식 질문이 없는 신청서는 모두 전체 참석이다.
- 집회만 참석자는 `LODGING` 답이 없다. 숙박하지 않는 것으로 센다.
- **가는 길이 자차면 `TRANSPORT_OUT` 답이 없다. 오는 길도 자차로 센다.**

### 범위 밖

- 참가자 화면을 한 번에 한 질문씩 보여 주기([#250](https://github.com/BeomhyunPark/SCENE/issues/250))
- 식수·숙박·차량 회차 집계 화면, 카풀 매칭([#251](https://github.com/BeomhyunPark/SCENE/issues/251)). 2026-11-17 집계는 1차 범위로 옮겼다(DEC-073). 카풀 자동 매칭은 여전히 범위 밖이다.
- 신청 원본 조회가 유형별 답을 읽기 좋게 보여 주기([#228](https://github.com/BeomhyunPark/SCENE/issues/228)). 1차 직후 순서다.
- 행사를 만든 뒤 기간 고치기. 지금은 행사를 만들 때만 날짜를 정할 수 있어, 날짜 없는 행사는 설정을 쓸 수 없다([#252](https://github.com/BeomhyunPark/SCENE/issues/252)).
- 시간표와 설정 표의 연결, 차량 출발 장소·시간의 구조화된 입력

### Alternatives

- 추천 신청서로 자동 시작한 뒤 켜고 끄기만: 사용자가 "더 스마트하고 유연하게"를 요청했다. N박·집회 날짜처럼 행사마다 다른 값을 반영하지 못한다.
- 참고 앱처럼 흐름을 코드에 고정: 수련회가 아닌 행사에 쓸 수 없고 운영자가 문구를 고칠 수 없다.
- 성별을 기본항목으로: 성별을 받지 않는 행사를 위해 끄는 스위치가 따로 필요하다. 조 배정은 `GENDER` 키로 찾으면 된다.
- 또래를 켜지 않은 채 기존 신청서에 넣기: 아직 배포된 신청서가 없어 켠 상태로 넣어도 영향이 없다.
- 오는 길을 늘 따로 묻기: 자차 참가자가 같은 답을 두 번 고르고, "갈 때 자차·올 때 단체 차량" 같은 모순된 답이 들어온다.
- 차량 출발 장소·시간을 설정에서 받기: 입력 칸이 늘고, 운영자가 고친 문구를 유지하는 규칙과 겹친다. 설명란은 신청 접수 후에도 고칠 수 있다.
- 꺼진 보기를 삭제하고 조건도 그에 맞게 줄이기: 신청 접수 후 스위치를 다시 켤 때 조건이 바뀌어 잠금에 걸린다.
- 또래 두 자리 검사를 단답형의 새 설정(`minLength`)으로: 모든 단답형의 설정 모양과 화면이 함께 바뀐다. 또래 전용 검사로 충분하다.
- 답을 자동으로 채우는 기능(전체 참석 = 모두 참석을 저장): 새 저장 규칙이 필요하다. 집계 해석으로 정한다.

### Reason

운영자는 자기 행사에 대해 아는 것(며칠인지, 어떤 식사와 차량이 있는지)만 답하고, 질문과 분기는 서버가 일관되게 만든다. 고정 키가 있어야 문구를 자유롭게 고치게 하면서도 뒤 기능이 답을 찾을 수 있다.

### Consequence

서버는 Flyway V11(`forms.setup`, `fields.preset_key`·`preset_state`, `system_key`에 `COHORT`, `fields_system_shape` 완화), `event/form/FormSetup`·`FormPreset`·`FormSetupPlan`, `PUT …/forms/{formId}/setup`이고 계약은 [backend/docs/api.md](../../backend/docs/api.md) "신청서"에 있다. 운영자 화면은 `EventRegistrationSetup`의 설정 카드·질문 목록·참가자 화면 미리보기다. 상위 이슈는 [#244](https://github.com/BeomhyunPark/SCENE/issues/244)이고 [#245](https://github.com/BeomhyunPark/SCENE/issues/245)(이 문서), [#246](https://github.com/BeomhyunPark/SCENE/issues/246)·[#247](https://github.com/BeomhyunPark/SCENE/issues/247)(백엔드), [#248](https://github.com/BeomhyunPark/SCENE/issues/248)(화면), [#249](https://github.com/BeomhyunPark/SCENE/issues/249)(실제 클릭)로 나눴다.

### Evidence

현 결정 2026-11-16. 사용자 결정: 기본항목 이름·전화·또래와 수정 범위, 또래 규칙, "설정 카드 → 자동 생성 → 미리보기 → 살짝 수정" 방향, 직접 질문 추가 유지([#244](https://github.com/BeomhyunPark/SCENE/issues/244)). 같은 날 확인 4건 모두 추천안: 또래를 기존 신청서에 켠 상태로 넣기, 성별은 자동 질문, 가는 길 자차면 오는 길 숨김, 차량 안내는 질문 설명란. 참고 앱 분석은 #244에 있다.

### Follow-up 2026-11-17 — 새가족 질문(`NEWCOMER`)

**Status:** CONFIRMED (사용자 위임 2026-11-17, 추천안 채택). 질문·선택지·추천안은 [#311](https://github.com/BeomhyunPark/SCENE/issues/311)에 있다.

사용자가 조를 짤 때 새가족 여부가 필요하다고 했다. 참고 앱은 새가족을 신청서에서 묻지 않고 운영자가 참가자 관리 화면에서 표시했고(기본 아니오), 조 편성 화면은 "새가족만"으로 걸렀다. SCENE에는 운영자가 참가자 정보를 고치는 화면이 없어 1차는 참가자 자기 응답으로 받는다.

- 설정 카드의 기본정보에 **새가족** 스위치(`newcomer`)를 더한다. 새 설정 카드에서는 켜져 있다. 이미 저장된 설정에는 키가 없고 `false`로 읽는다(요청에서도 선택 키). 다시 저장해도 질문이 몰래 생기지 않는다.
- 질문은 `NEWCOMER`, 예/아니오(`YES_NO`, style `YES_NO`), 필수, 조건 없음이다. 자리는 `CELL` 다음·`ATTENDANCE` 앞이다. 답은 `{"value": true|false}`다.
- 문구(초안): 제목 "새가족이신가요?", 설명 "교회에 처음 오셨거나 새가족 과정을 듣고 있다면 '예'를 골라주세요. 조 편성에서 더 잘 챙겨 드리려고 여쭤봐요." 새가족 기준은 교회마다 달라 운영자가 설명을 고친다.
- 신청 접수 뒤에도 켜고 끌 수 있다. 조건이 없는 새 질문이라 DEC-068 잠금에 걸리지 않는다. 켜기 전 신청자는 답이 없다(편성판 `null`, "응답 없음"). 끄면 숨기고 답은 남긴다. 필수라서 켠 뒤 다시 제출하는 신청자는 답해야 한다.
- 보는 사람은 다른 자동 질문 답과 같다(신청 읽기, 신청자 CSV, 편성판). 돌봄 관련 정보라 **참가자 쪽(내 조, 조장의 조원 명단)과 운영자 공개본 조회에는 넣지 않는다.** DEC-072 §3의 필터용 답에 `newcomer`(`true`·`false`·`null`)를 더한다.
- 범위 밖: 운영자가 참가자별로 새가족 표시를 고치기(참고 앱 방식), 돌봄 대상 표시, 새가족 공지·일정 대상.

### Follow-up 2026-11-17 — 새가족은 중그룹·셀 보기 "새가족 (등반X)"로 받는다(`NEWCOMER` 질문 대체)

**Status:** CONFIRMED. 방향은 사용자 결정(2026-11-17, 직접), 세부는 사용자 위임(2026-11-17), 추천안 채택. 질문·선택지·추천안은 [#333](https://github.com/BeomhyunPark/SCENE/issues/333)에 있다. 위 "새가족 질문(`NEWCOMER`)" Follow-up을 대체한다.

사용자: "새가족 같은 경우는 중그룹과 셀이 배정되어 있지 않음. 따라서 새가족인 경우는 중그룹이나 셀 선택하는 곳에 '새가족 (등반X)'을 선택하게 하고, 그걸 선택했으면 새가족으로 분류해 표시하면 됨."

- **중그룹·셀은 설정 카드의 이름 목록(`middleGroups`·`cells`)이 있으면 고르는 질문이다.** `DROPDOWN`·필수, 보기는 목록 순서, 보기 id는 이름에서 계산(`opt_mg_…`, `opt_cell_…`). 목록이 없으면 지금처럼 자유 입력(§1 "중그룹·셀은 1차에 자유 입력"을 이것으로 바꾼다). 셀이 중그룹에 딸린 2단 목록은 범위 밖이다.
- **첫 번째 목록 질문(중그룹, 없으면 셀)의 마지막 보기가 `opt_newcomer` "새가족 (등반X)"이다.** 문구는 고칠 수 있고 판정은 id로 한다. 끄는 스위치는 없다. 중그룹이 목록이면 셀은 목록 중그룹을 고른 사람에게만 보인다.
- **판정은 서버 한곳(`FormPreset.newcomer`)이다.** 그 보기를 골랐으면 `true`, 다른 보기면 `false`, 답이 없거나 그런 질문이 없으면 `null`. DEC-072 §3의 `newcomer` 값이 이 규칙을 따르고, 편성판의 중그룹·셀 값은 자유 입력이면 글자, 목록이면 고른 보기 문구다. 참가자 쪽에는 여전히 나가지 않는다.
- `newcomer` 스위치와 `NEWCOMER` 질문은 더 만들지 않는다. 저장된 `newcomer` 키는 읽고 무시하며 다음 저장 때 빠진다. 저장된 `NEWCOMER` 질문은 §2대로 없어지거나 숨는다. 마이그레이션·새 오류 코드는 없다.
- **접수 뒤:** 목록에 이름을 더하고 빼고 문구를 고칠 수 있다(뺀 보기는 숨김). 셀 조건은 이전 보기 id를 남긴 채 넓어지기만 한다(DEC-068 잠금의 예외, `CELL`에 한함). **뒤집기 어렵다:** 자유 입력 ↔ 목록 전환과 중그룹 스위치 켜고 끄기는 `409 FIELD_LOCKED`다. 목록은 접수 전에 정한다.
- 1차 범위 밖: 신청 집계에 새가족 수, 운영자가 참가자별로 새가족 표시 고치기.

> **2026-11-19 메모:** 위 두 Follow-up의 "참가자 쪽(내 조, 조장의 조원 명단)에는 넣지 않는다"는 DEC-083이 바꿨다. 조장은 조원 상세의 신청 답으로 새가족 보기를 고른 답을 본다. 일반 조원의 명단과 운영자 공개본 조회에는 여전히 없다. 별도 `newcomer` 값을 참가자 응답에 더하지는 않는다.

### Follow-up 2026-11-17 — 참석 방식과 도착·출발 시점에 따른 이동 수단 보기

**Status:** CONFIRMED (사용자 위임 2026-11-17, 추천안 채택). 이미 되던 것/부족한 것 표와 질문·선택지·추천안은 [#324 결정 댓글](https://github.com/BeomhyunPark/SCENE/issues/324#issuecomment-6939298692)에 있다. 관련 #322·#323, 상위 #244.

사용자의 지인(서비스디자인 전공)이 "교회 차량도 필요하다. 전체 참석자 > 교회 차량 / 자차(운전 or 합승), 부분 참석자 > 집회 in인지 중간 in인지에 따라 교회 차 / 자차 or 대중교통"이라고 제안했고 "수련회는 변수가 너무 많다"고 했다. 사용자는 교회마다 운영자가 껐다 켰다 할 수 있어야 한다고 했다. 교회 차량(`opt_group`)·집회 차량(`opt_shuttle`)·대중교통과 각 스위치, 가는 길 자차면 오는 길 숨김은 이미 있었다. 없던 것은 합승 보기와, 부분 참석자의 도착·출발 시점에 따른 분기다.

- **합승 보기 `opt_ride`**("자차 합승 (다른 사람 차를 타요)")를 `opt_car` 다음에 더한다. `opt_car` 문구는 "자차 (직접 운전)"다. 둘 다 `transport.car`로 켜고 끈다. 합승은 동승 질문을 묻지 않고, 오는 길도 묻지 않고 같은 합승으로 센다(§3 자차와 같다). 누구 차인지는 묻지 않는다.
- **새 스위치 `transport.partialByTime`**: 켜면 부분 참석자는 교회 차량과 같이 오갈 때만 그 차량 보기를 본다. 없으면 저장된 값, 저장된 값이 없으면 `false`라서 기존 설정과 기존 화면의 동작이 바뀌지 않는다. 새 설정 카드에서 켤지는 화면이 정한다(추천: 켬).
  - `RANGE`: 단체 차량 = 전체 참석 또는 도착 칸이 행사 첫 칸. 집회 차량 = 집회만 참석 또는 도착 칸이 집회 칸("집회 in"). 오는 길은 출발 칸과 마지막 칸·집회 칸으로 대칭이다. 중간에 오는 사람에게는 자차·합승·대중교통·이동 지원만 보인다. 이동 지원은 도움이 필요한 사람을 위한 것이라 남긴다.
  - `SLOTS`: 단체 차량만 바뀐다. `MEALS`에 첫 칸(오는 길은 마지막 칸)이 있으면 보인다. "고른 첫 칸이 집회"는 조건으로 표현할 수 없어 집회 차량은 그대로 부분·집회만에게 보인다. 집회만 참석자가 첫 칸(집회)을 고르면 단체 차량도 보이는데, 같이 가는 차라 그대로 둔다.
- **DEC-068 조건 확장: `showWhen`에 `{"anyOf": [조건, …]}`(2–5개, 한 단계 OR, 중첩·AND 없음)**를 더한다. "전체 참석 또는 첫 칸 도착"은 서로 다른 두 질문에 걸친 OR이라 질문 하나만 가리키는 기존 조건으로 표현할 수 없다(도착 질문은 부분 참석자에게만 보인다). 같은 뜻의 보기 두 개는 집계가 합쳐야 하고, 부정 조건은 집회만 참석자를 거르려면 AND가 필요해 둘 다 더 크다. 새 질문 유형은 없다. 직접 질문 편집기는 `anyOf`를 만들지 않는다. 참가자 화면·미리보기는 `anyOf`를 읽어야 한다(화면 후속 이슈).
- **접수 뒤 변경은 DEC-068 잠금 그대로다.** 차량 보기 조건이 바뀌는 저장(`partialByTime` 켜고 끄기, 켠 상태에서 부분 참석 켜고 끄기, 첫·마지막·집회 칸이 바뀌는 일정 변경)은 `409 FIELD_LOCKED`다. 합승 보기 추가, 문구 변경, 보기 켜고 끄기는 된다. **뒤집기 어렵다: 접수가 시작되면 이 분기를 켜거나 끌 수 없고 첫·마지막·집회 칸도 바꿀 수 없다.** 1월 수련회는 접수 전에 정한다.
- 집계(DEC-073)는 저장된 답을 그대로 센다. 숨겨진 보기는 제출 때 거부되고 숨겨진 질문의 답은 저장되지 않으므로 교회 차량 인원은 조건을 따른 답만 들어 있다. 오는 길 행에서 `opt_ride`는 `opt_car`처럼 자기 자신으로 센다. 마이그레이션·새 오류 코드는 없다(`forms.setup` jsonb).
- 문구는 모두 초안이다.
- 1차 범위 밖: 운영자가 칸마다 운행 차량을 지정, 합승 상대 입력·카풀 매칭, `SLOTS`의 집회 차량 도착 시점 분기, 여러 구간 참석, 조건식 직접 편집(AND·중첩), 직접 질문 편집기에서 `anyOf` 만들기.

### Follow-up 2026-11-19 — 신청 완료 안내 문구

**Status:** CONFIRMED (사용자 로드맵 승인 2026-11-19, A8 추천안 채택). 작업과 검증은 [#406](https://github.com/BeomhyunPark/SCENE/issues/406)(상위 [#378](https://github.com/BeomhyunPark/SCENE/issues/378))에 있다.

참가비를 SCENE 밖에서 받으므로(#230) 신청을 마친 사람에게 계좌·문의처·다음 할 일을 알려 줄 자리가 필요하다.

- 신청서마다 **완료 안내** 한 개(`forms.completion_notice`, 없으면 `null`)를 둔다. 운영자가 신청서 화면에서 `FORM_WRITE`로 쓰고 고친다. 미리보기의 "신청을 마친 화면"에 저장 전 문구가 보인다.
- **글자 그대로의 텍스트다.** 줄바꿈은 지키고, HTML·마크다운은 해석하지 않으며 링크도 글자로 보인다. 앞뒤 공백을 자른 뒤 1000자까지다. 비우면 안내 없음이다.
- **잠그지 않는다.** 신청이 들어온 뒤에도, 신청을 닫은 뒤에도 고칠 수 있다(DEC-068 잠금은 답의 모양을 지키려는 것이고 안내는 답과 무관하다).
- 참가자에게는 **신청 완료 응답**에 싣고 공개 신청서 조회에는 싣지 않는다. 참가자 홈(B2)은 세션으로 지금 문구를 읽는다. 제출 뒤 운영자가 고치면 참가자 홈은 새 문구를, 이미 띄운 완료 화면은 제출 때 문구를 보인다.
- 1차 범위 밖: 서식(굵게·링크 누르기), 안내 변경 알림, 행사별이 아닌 조직 공통 안내, 신청 기간(A13).

## DEC-071 — 체크인은 참가자의 행사당 한 번 도착이고, QR은 서명한 고정 값이며, STAFF도 기본으로 체크인한다

**Date:** 2026-11-17

**Status:** CONFIRMED (사용자 위임 2026-11-17, 추천안 채택)

### Context

2027년 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 현장 도착 체크인까지 SCENE으로 운영한다([#235](https://github.com/BeomhyunPark/SCENE/issues/235)). 지난 수련회에서는 접수가 한 사람에게 몰리고 예외 한 건이 줄 전체를 멈췄다(RES-006). 이미 권한 키 `CHECKIN_WRITE`(OWNER만 기본), 참가자 접근 링크와 참가자 세션, `participants.phone_last4`, API 초안 §14(`checkins` 현재 상태 + `checkin_logs` 이력, `Idempotency-Key`)가 있다. ENDED·ARCHIVED에서 새 체크인과 취소를 막는다는 기준은 [event-lifecycle-review](event-lifecycle-review.md)에 있다. QR 값의 구조, 대상, 기본 권한, 중복 처리, 수동 검색에 보일 정보는 정해지지 않았다.

질문·선택지·추천안은 [#235 결정 대기 댓글](https://github.com/BeomhyunPark/SCENE/issues/235#issuecomment-6934891087)에 있다. 사용자가 이 결정을 맡겨서 추천안을 그대로 채택했다. 뒤집을 때는 아래 Alternatives와 Consequence를 본다.

### Decision

1. **QR에는 서버가 서명한 참가자별 고정 값만 담는다.** 형식은 `SCENE-CI1.` + base64url(참가자 id 16바이트 ‖ HMAC-SHA256(서버 비밀값, 행사 id·참가자 id·세대 0) 앞 16바이트)이다. 이름·전화 등 개인정보와 접근 키는 넣지 않는다. 값은 저장하지 않고 요청 때마다 같은 값을 다시 계산한다. URL이 아니라서 기본 카메라 앱이 링크로 열지 않는다.
   - 유효 기간은 따로 없다. 체크인은 행사가 `ACTIVE`인 동안만 된다.
   - 화면 캡처로 다른 사람이 대신 쓰는 경우는 막지 않는다. 스캔 결과에 이름·또래를 크게 보여 운영자가 눈으로 확인하고, 이미 체크인된 값이면 "이미 체크인됨"이 드러난다. 잘못된 체크인은 취소로 되돌린다.
   - 재발급은 1차 범위 밖이다. 서명 입력의 세대 값(지금 0)으로 나중에 재발급을 더한다.
2. **체크인 대상은 참가자(participant)이고 행사당 한 번(도착)이다.** 그 행사에 `SUBMITTED` 신청이 있는 참가자만 대상이다. 신청을 철회한 참가자는 막고 화면에 이유를 보여 준다. 일차별 출석(식사·집회)은 범위 밖이다.
3. **권한.** 현황·명단 조회는 `EVENT_READ`(또는 활성 공간 `OWNER`·`ADMIN`, 신청 읽기와 같음), 체크인·취소·한 사람의 이력은 `CHECKIN_WRITE`다. 취소용 키는 따로 만들지 않는다. **OWNER·MANAGER·STAFF 모두 기본으로 `CHECKIN_WRITE`를 갖는다.** OWNER는 개별 설정으로 뺄 수 있다.
4. **취소는 현재 상태만 바꾸고 이력은 쌓는다.** `checkins`는 참가자당 한 행으로 `CHECKED_IN` 또는 `CANCELLED`다. `checkin_logs`에 `CHECKED_IN`/`CANCELLED`, 처리자, 시각, 방식(`QR`/`MANUAL`), 취소 사유(선택, 200자)를 남기고 `audit_logs`도 같은 transaction에 남긴다. 취소한 뒤 다시 체크인할 수 있다.
   - **같은 사람을 다시 스캔하면 오류가 아니다.** `200`, `result: ALREADY_CHECKED_IN`과 처음 체크인 시각·처리자 이름을 돌려준다. 이력·audit는 더하지 않는다. 이미 취소된 체크인을 다시 취소해도 `200 ALREADY_CANCELLED`다.
   - 체크인·취소는 `Idempotency-Key`가 필수다. 같은 키 재전송은 같은 결과를 돌려준다.
5. **수동 검색**은 이름 일부 또는 전화 끝 4자리로 찾는다. 명단에는 이름·또래·체크인 상태를 보여 주고, **전화 끝 4자리는 `CHECKIN_WRITE`가 있을 때만** 동명이인 구분용으로 보여 준다. 끝 4자리는 연락처 조회가 아니라서 `CONTACT_VIEW`를 남기지 않는다. 전체 전화번호는 체크인 화면에 없고 기존 연락처 경로(`PARTICIPANT_CONTACT_READ`)로만 본다.
6. **행사 상태별 동작.**

| 상태 | 현황·명단·이력 | 체크인·취소 | 참가자 QR 화면 |
|---|---|---|---|
| DRAFT | 조회 | `409 INVALID_STATE_TRANSITION` | "행사가 시작되면 열립니다" (값 없음) |
| ACTIVE | 조회 | 가능 | QR 표시 |
| ENDED | 조회 | `409 EVENT_ENDED` | "행사가 끝났습니다" (값 없음) |
| ARCHIVED | 읽기 전용 조회 | `409 EVENT_ARCHIVED` | "행사가 끝났습니다" (값 없음) |

- 리허설은 별도 리허설 행사를 활성화해서 하고, 신청을 열기 전에 지운다.
- 새 ErrorCode는 만들지 않는다. 없는·틀린 QR은 `404 RESOURCE_NOT_FOUND`, 신청 철회는 `409 INVALID_STATE_TRANSITION`과 `reason`이다. `EVENT_ENDED`의 `detail` 문장은 신청 전용("이 신청을 받을 수 없습니다")이라 일반 문장으로 바꾼다.
- ENDED에서의 기록 정정은 event-lifecycle-review대로 별도 정정 경계로 남긴다.

### 범위 밖

- 일차별 출석, 식사·집회 체크
- QR 재발급, 참가자 사진 대조
- 완전 오프라인 체크인 대기열. 1월에는 같은 `Idempotency-Key`로 짧게 재시도한다([#287](https://github.com/BeomhyunPark/SCENE/issues/287)).
- ENDED 기록 정정

### Alternatives

- 접근 키를 QR에 그대로: 캡처한 사람이 참가자 세션까지 열 수 있다.
- 30–60초마다 바뀌는 QR: 캡처 재사용은 막지만 현장에서 참가자 폰이 온라인이어야 하고 시계 오차가 생긴다. 수련회 규모에서 대리 체크인의 피해(도착 표시 1건)는 작고 취소로 되돌릴 수 있다.
- 무작위 값을 만들어 해시로 저장: 다시 보여 주려면 원문을 따로 보관해야 한다. 서명 방식은 저장 없이 같은 값을 다시 만든다.
- 신청(application) 기준: 다시 제출하면 `SUPERSEDED`가 되어 체크인이 옛 신청에 남는다. 도착하는 사람은 참가자다.
- 일차별 출석: 1월 범위는 도착 확인이고, 부분 참석자도 한 번 도착한다. 표와 화면이 커진다.
- STAFF 제외: 현장 접수는 보통 STAFF 봉사자가 맡는다. 한 사람에게 몰린 접수가 RES-006의 병목이었다.
- 중복 스캔을 `409`로: 현장에서 빨간 오류로 보이지만 실제로는 정상 상황이다. 업무 체크의 `NO_CHANGE`와 같게 둔다.
- 끝 4자리를 `PARTICIPANT_CONTACT_READ`에 묶기: 현장 봉사자에게 연락처 권한까지 줘야 동명이인을 구분할 수 있다.
- DRAFT에서 체크인 허용: 준비 중 행사에 기록이 쌓이고, 활성화 전 데이터와 섞인다.

### Reason

현장에서는 빨리, 여러 사람이 동시에, 네트워크가 약해도 처리돼야 한다. 고정 서명 값은 한 번 받은 QR을 오프라인으로 보여 줄 수 있고 저장할 비밀이 없다. 중복·재시도를 오류가 아닌 결과로 돌려줘 예외 한 건이 줄을 멈추지 않게 한다. 개인정보는 동명이인 구분에 필요한 끝 4자리까지만 현장 권한자에게 보인다.

### Consequence

- 계약은 [backend/docs/api.md](../../backend/docs/api.md) "체크인"에 있다. 서버 구현은 [#282](https://github.com/BeomhyunPark/SCENE/issues/282)이고 `checkins`·`checkin_logs` Flyway, `RoleDefaults`의 MANAGER·STAFF `CHECKIN_WRITE`, `EVENT_ENDED` 문장 변경, 서명용 서버 비밀값 설정을 포함한다. MANAGER·STAFF 기본값 중 `CHECKIN_WRITE`가 `TASK_WRITE` 다음으로 승인된 항목이다. 기본값은 저장하지 않고 계산하므로 배포 즉시 기존 행사의 STAFF에게도 적용된다.
- 서버 비밀값이 바뀌면 이미 보여 준 QR이 모두 무효가 된다. 행사 기간에 바꾸지 않는다.
- 하위 이슈: [#283](https://github.com/BeomhyunPark/SCENE/issues/283) QR 값 발급, [#284](https://github.com/BeomhyunPark/SCENE/issues/284) 참가자 QR 화면, [#285](https://github.com/BeomhyunPark/SCENE/issues/285) 운영자 현황·수동 체크인, [#286](https://github.com/BeomhyunPark/SCENE/issues/286) 카메라 스캔, [#287](https://github.com/BeomhyunPark/SCENE/issues/287) 재시도, [#288](https://github.com/BeomhyunPark/SCENE/issues/288) 조별 보기(#234 뒤), [#289](https://github.com/BeomhyunPark/SCENE/issues/289) 실제 휴대폰 확인.

### Evidence

사용자 위임 2026-11-17: #235 질문에 답하는 일을 "알아서" 맡겼고, 6개 질문 모두 추천안을 채택했다. 근거 자료는 RES-006, event-lifecycle-review "종료 후 허용 행동", API Architecture §14, DEC-060(연락처 숨김), DEC-062(업무 체크 `NO_CHANGE`)다.

## DEC-072 — 조 편성은 작업본과 공개 스냅샷으로 나누고, 조장은 참가자이며, 참가자는 조 이름과 조장 이름만 본다

**Date:** 2026-11-17

**Status:** CONFIRMED (사용자 위임 2026-11-17, 추천안 채택)

### Context

2027년 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 조 편성과 공개까지 SCENE으로 한다([#234](https://github.com/BeomhyunPark/SCENE/issues/234), 마감 1/15). 제품 정책은 DEC-040~048에서 정했다: 저장과 공개 분리, 부분 배정 공개와 미배정 경고, 공개본만 참가자에게, 준비 중 편성은 `GROUP_WRITE`, 철회자 즉시 제외, 오래된 저장의 덮어쓰기 금지, 재시도 중복 금지, 변경 기록. 그런데 저장 구조, 버전 단위, 조장의 신원, 필터에 쓰는 답, 공개 API, 참가자에게 보이는 정보, 기본 권한, 행사 상태별 동작은 정해지지 않았다. API 초안 §11과 데이터 모델 초안(`groups`·`group_members`·`group_leaders`)은 조장 identity와 공개 endpoint를 OPEN으로 둔다. 지금 서버에는 신청을 철회하는 경로가 없다(`WITHDRAWN`은 값만 있다).

질문·선택지·추천안은 [#234 결정 대기 댓글](https://github.com/BeomhyunPark/SCENE/issues/234#issuecomment-6936684799)에 있다. 사용자가 이 결정을 맡겨서 추천안을 그대로 채택했다. 🔒는 나중에 뒤집기 어려운 결정이다. 뒤집을 때는 아래 Alternatives와 Consequence를 본다.

> **2026-11-19 메모:** §6(참가자에게 보이는 범위)과 범위 밖의 "조장 화면의 조원 연락처"는 DEC-083([#403](https://github.com/BeomhyunPark/SCENE/issues/403))이 사용자 결정으로 바꿨다. 조원은 같은 조의 이름·또래·성별을 보고(행사별 스위치, 기본 켬), 조장은 조원의 신청 답·전화번호·도착 여부·참석 구간·방을 보며 전화번호 열람은 `privacy_logs`에 남는다. 공개본만 본다(§1)와 취소자 제외(§5)는 그대로다. 아래 본문은 바꾸지 않았다.

### Decision

1. 🔒 **작업본은 테이블, 공개본은 스냅샷이다.** `groups`(조)와 `group_assignments`(참가자당 한 행, `group_id`, `leader`)가 작업본이다. 공개하면 `group_publications`에 그 순간의 조 이름·순서·조원·조장을 **참가자 id만** 담은 JSON 한 행을 더한다. 참가자 조회는 가장 최근 공개 행만 읽는다. 이름·또래는 읽을 때 지금 값으로 붙인다.
   - 버전은 행사당 하나인 `boardVersion`(작업본이 실제로 바뀔 때마다 +1, 공개는 올리지 않음)과 조마다 `version`(이름·삭제·조장)이다.
   - 변경 기록은 1차부터 `group_assignment_logs`에 남긴다(참가자, 이전·새 조, 조장 전후, 처리자, 시각). 공개는 `audit_logs`에 남긴다.
2. 🔒 **조장은 그 행사의 참가자이고, 배정 행의 표시다.** 조장은 그 조의 조원이어야 하고, 다른 조로 옮기거나 미배정이 되면 표시가 풀린다. 조당 0–3명(잠정) → 조당 최대 1명(Follow-up 2026-11-17, #343). 조장은 자기 참가자 링크로 들어온다. 같은 사람이 운영자이기도 하면 두 신원은 연결하지 않는다.
3. **필터는 자동 질문의 고정 키로 찾는다.** `GENDER`(보기 id와 지금 문구), `COHORT`, `ATTENDANCE`(`FULL`·`PARTIAL`·`WORSHIP_ONLY`), `MIDDLE_GROUP`·`CELL`(자유 입력은 그대로, 목록이면 고른 보기 문구), `newcomer`(중그룹·셀의 `opt_newcomer` 보기, DEC-070 Follow-up 2026-11-17 "새가족 (등반X)")이다. 답이 없거나 질문이 꺼져 있으면 `null`이고 화면은 "응답 없음"으로 묶는다. 참석 방식은 DEC-070 §3대로 질문이 없거나 꺼졌으면 `FULL`이다. 필터는 화면에서 하고, 서버는 편성판에 `SUBMITTED` 신청자 전원과 이 값을 준다. 중그룹·셀은 1차에 자유 입력을 같은 글자끼리 묶는다(목록화는 하지 않는다).
4. **동시 수정.** 배정 변경은 사람마다 `fromGroupId`(내가 본 지금 조)를 보낸다. 하나라도 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`과 `conflicts[]`를 돌려준다. 지금 값이 이미 목적지면 반영된 것으로 본다. 서로 다른 사람을 옮기는 두 운영자는 충돌하지 않는다(DEC-046의 비충돌 병합). 조 이름·삭제·조장은 조의 `expectedVersion`, 공개는 `expectedBoardVersion`이다. 공개 버전이 다르면 최신 내용을 다시 확인하게 한다.
   - `Idempotency-Key`는 쓰지 않는다. 배정은 "이미 목적지면 성공", 공개는 "직전 공개본과 같으면 `ALREADY_PUBLISHED`"라서 같은 요청을 다시 보내도 두 번 반영되지 않는다(DEC-047).
   - 미배정 활성 참가자가 있으면 공개에 `confirmUnassigned: true`가 필요하다. 없으면 `409 CONFIRMATION_REQUIRED`와 `unassignedCount`(DEC-041).
5. **철회자는 읽을 때 뺀다.** `SUBMITTED` 신청이 없는 참가자는 편성판의 활성 명단·미배정 수, 공개본 조회, 조장 명단에서 빠진다(DEC-044). 편성판은 "철회됨 · 이전 조"를 참고로 따로 보여 준다. 신청 철회 경로를 열 때는 그 transaction에서 배정을 지우고 이력에 남겨, 복귀할 때 옛 조가 자동으로 돌아오지 않게 한다.
6. 🔒 **참가자에게 보이는 범위.** 일반 참가자는 내 조 이름, 조장 이름, 공개 시각만 본다. 조원 명단은 보지 않는다. 조장은 여기에 자기 조원의 이름·또래를 더 본다. 조장의 조원 연락처(DEC-030)는 1차에 보여 주지 않는다. 참가자 상태는 `NOT_PUBLISHED`(준비 중)·`UNASSIGNED`(공개됐지만 미배정)·`ASSIGNED`·`NOT_ELIGIBLE`(신청 없음)이다.
7. 🔒 **편성과 공개 모두 `GROUP_WRITE`이고, 기본값은 OWNER만이다.** 공개 전용 키는 만들지 않는다. MANAGER·STAFF 기본값에 `GROUP_WRITE`를 넣지 않고, OWNER가 편성 담당에게 개별로 GRANT한다. 작업본 조회는 `GROUP_WRITE` 또는 활성 공간 `OWNER`·`ADMIN`이다. 공개본 조회(운영자)는 `EVENT_READ`다.
   - (2026-11-20 → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)) 기본값이 OWNER·MANAGER로 바뀌었다(사용자 결정). STAFF는 그대로 개별 GRANT로 받고, MANAGER에게서 막으려면 개별 `REVOKE`한다. 키 하나로 편성·공개를 함께 여는 규칙은 그대로다.
8. **행사 상태별 동작.**

| 상태 | 편성판·공개본 조회 | 편집·공개 | 참가자 내 조 |
|---|---|---|---|
| DRAFT | 조회 | 가능 | 공개본 |
| ACTIVE | 조회 | 가능 | 공개본 |
| ENDED | 조회 | `409 EVENT_ENDED` | 마지막 공개본 |
| ARCHIVED | 읽기 전용 조회 | `409 EVENT_ARCHIVED` | 마지막 공개본 |

- 새 ErrorCode는 만들지 않는다. 계약은 [backend/docs/api.md](../../backend/docs/api.md) "조 편성"이다.

### 범위 밖

- 자동 배정, 조 사이 균형 추천. 화면은 조별 인원·성별·또래 분포만 보여 준다.
- 방·차량 배정과 조 이동의 의존 안내(DEC-045)
- 공개 알림 전달(DEC-042). 공개 때 영향받은 참가자 수만 센다. 참가자는 자기 링크에서 확인한다.
- 조장 화면의 조원 연락처, 조장과 운영자 신원 연결
- 되돌리기 화면과 이력 조회 화면(DEC-048). 이력 저장은 1차에 한다.
- 신청 정보가 바뀐 참가자의 "배정 검토 필요" 표시(DEC-044). 편성판이 늘 지금 답을 보여 준다.
- 공개 취소, 조 안내문·집합 장소, 직접 만든 질문으로 거르기, 중그룹·셀 목록화

### Alternatives

- 작업본·공개본 테이블 두 벌: 공개 때 행을 복사하고 조 삭제·이름 변경이 공개본 FK와 얽힌다. 스냅샷은 공개 기록(DEC-048)을 따로 만들 필요가 없다.
- 스냅샷에 이름까지 넣기: 철회자 제외와 보존 정리(DEC-056)를 지난 공개 행마다 고쳐야 한다.
- 별도 `group_leaders` 테이블(초안): 조원이 아닌 조장, 다른 조로 간 조장이 생길 수 있다. 1차는 "조장은 그 조의 조원"이면 충분하다.
- 조장을 운영자로: 조장마다 Google 계정과 초대가 필요하고, 운영자 권한 모델에 조 단위 범위를 새로 넣어야 한다.
- 편성판 전체에 `expectedBoardVersion` 하나: 두 운영자가 서로 다른 사람을 옮겨도 매번 충돌한다.
- 배정마다 `Idempotency-Key`: 체크인처럼 키 저장이 필요하다. 목적지 비교로 같은 효과가 난다.
- 서버에서 필터: 수련회 규모(수백 명)에서는 한 번에 받아 화면에서 거르는 게 빠르고 API가 작다.
- 일반 참가자에게 조원 이름 공개: DEC-043은 다른 사람 정보를 자동으로 주지 않는다. 범위는 나중에 넓히기 쉽고 줄이기 어렵다.
- 조장에게 조원 연락처(DEC-030 그대로): 참가자 링크가 새면 조원 연락처가 같이 새고, 참가자 세션의 연락처 조회 기록이 아직 없다. 연락처는 운영자가 전달한다([#233](https://github.com/BeomhyunPark/SCENE/issues/233)).
- 공개 전용 키(`GROUP_PUBLISH`): 편성하는 사람이 보통 공개한다. 확인 창과 미배정 경고가 안전장치다. 나중에 키를 나눌 수 있다.
- ~~MANAGER 기본 `GROUP_WRITE`: 편성은 보통 1–2명이 맡는다. 체크인(STAFF 전원)과 달리 넓게 줄 이유가 없다.~~ → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)에서 채택했다(운영팀이 서로 아는 몇 명이라 사람마다 켜는 일이 번거롭다).
- DRAFT에서 편성 막기: 신청을 행사 시작 전에 받으므로 행사 전에 편성·공개해야 한다.

### Reason

1월에 꼭 필요한 것은 "운영자 몇 명이 동시에 사람을 조에 넣고, 확인하고 공개하면, 참가자가 자기 링크에서 내 조와 조장을 본다"이다. 작업본 + 스냅샷은 DEC-040의 "한 번에 반영"과 DEC-048의 기록을 테이블 하나로 해결한다. 사람 단위 비교는 여러 운영자의 동시 작업을 막지 않으면서 덮어쓰기를 막는다. 참가자에게는 찾아갈 사람(조장)까지만 보여 주고, 개인정보 범위를 넓히는 일은 실제 사용 뒤로 미룬다.

### Consequence

- 서버: Flyway로 `groups`·`group_assignments`·`group_boards`(행사당 `version`)·`group_assignment_logs`·`group_publications`. 쓰기는 행사 행을 잠그고 처리한다. audit `GROUPS_PUBLISHED`. `RoleDefaults`는 바꾸지 않는다.
- 조장 신원이 참가자라는 점은 [데이터 모델 초안](../architecture/data-model-v0.1.md)의 OPEN(Group Leader identity)을 닫는다. 조장 겸 운영자가 조장 화면을 운영자 계정으로 보려면 나중에 신원 연결이 필요하다.
- 조장 연락처를 열 때는 참가자 세션 actor의 연락처 조회 기록과 링크 유출 대응을 먼저 정한다.
- 신청 철회 경로를 여는 이슈는 배정 정리(5번)를 완료 조건에 넣는다.
- [#288](https://github.com/BeomhyunPark/SCENE/issues/288) 조별 체크인 현황은 공개본(`GET …/groups/published`)을 기준으로 한다. 조장이 자기 조 미도착자를 참가자 링크에서 보는 것은 #288에서 이 범위(이름·또래) 안에서 정한다.
- 하위 이슈(순서대로): [#299](https://github.com/BeomhyunPark/SCENE/issues/299) 서버 조·배정 저장, [#300](https://github.com/BeomhyunPark/SCENE/issues/300) 서버 공개와 참가자 조회, [#301](https://github.com/BeomhyunPark/SCENE/issues/301) 운영자 편성 화면, [#302](https://github.com/BeomhyunPark/SCENE/issues/302) 운영자 공개 흐름, [#303](https://github.com/BeomhyunPark/SCENE/issues/303) 참가자 내 조 화면, [#304](https://github.com/BeomhyunPark/SCENE/issues/304) 실제 명단 확인. #288은 #300 뒤다.

### Evidence

사용자 위임 2026-11-17: #234 질문에 답하는 일을 "알아서" 맡겼고, 9개 질문 모두 추천안을 채택했다. 근거 자료는 DEC-030·040~048, DEC-070 §3, DEC-071, [group-publication-review](group-publication-review.md), [group-change-recovery-review](group-change-recovery-review.md), event-lifecycle-review "종료 후 허용 행동", API Architecture §11.

### Follow-up (2026-11-17): 편성판 참석 칸 (#315)

사용자는 2026-11-17 Figma 조 편성 디자인의 오전/오후/저녁 막대를 보고 "부분 참석 저 부분은 틀렸다"고 했고, 예전에 준 retreat 소스(church-retreat-ops `AdminRetreatGroupsPage.tsx`, [retreat-v0.9-product-audit](../research/retreat-v0.9-product-audit.md) §3.5·FINDING-03)를 기준으로 짚었다. 그 소스는 행사에 설정된 참여 칸(날짜별 프로그램·식사)과 사람마다 고른 칸으로 연속 구간 막대를 그리고 조마다 칸별 인원을 센다. 코드는 옮기지 않고 기준만 따른다.

- 칸은 시간대(오전/오후/저녁)가 아니라 **신청서 설정의 일차별 식사·집회 칸**(DEC-070, 자동 질문 `MEALS`)이다. 신청 집계(DEC-073)의 식수 칸과 같은 칸·id·규칙이고, 서버는 같은 코드로 읽는다.
- 편성판(`GET …/group-board`)에 칸 정의 `slots`와 참가자별 `slotIds`를 더한다. 전체 참석은 모든 칸, 부분·집회만 참석은 고른 칸, 답이 없으면 `null`("모름")이다. 설정이 없거나 칸이 하나도 없으면 `slots`가 `null`이다.
- 조별 칸 인원은 화면이 `groupId`와 `slotIds`로 센다. 서버가 따로 주지 않는다.
- 참가자용 내 조 응답(§6)에는 넣지 않는다. 운영자 편성판 권한(`GROUP_WRITE`) 안에서만 보이고, 같은 답은 신청 원본 조회에서 이미 보이므로 새로 열리는 정보가 없다.
- 응답 모양은 [api.md "조 편성"](../../backend/docs/api.md)에 있다. 기존 필드는 그대로이고 더하기만 했다.

### Follow-up (2026-11-17): 조장 1명, 조원 순서 (#343)

사용자는 2026-11-17 "조원 순서도 바꿀 수 있게 해 줄래? 그거 중요해.", "조장은 1명입니다. 무조건요."라고 했다. 예전 앱(church-retreat-ops `AdminRetreatGroupsPage.tsx`)의 끌어 놓기·♥ 조장 토글도 근거로 짚었다. 조장 1명과 조원 순서 자체는 사용자 결정이고, 아래 세부는 [#343](https://github.com/BeomhyunPark/SCENE/issues/343)에 질문·선택지·추천안을 적고 추천안을 채택했다(사용자 위임 2026-11-17, 추천안 채택).

- **§2의 "조당 0–3명(잠정)"을 "조당 최대 1명"으로 바꾼다.** 지정 전에는 0명일 수 있다. `PUT …/leaders`는 0–1명만 받고, 다른 사람 한 명을 보내면 기존 조장이 같은 요청에서 풀린다. 응답의 `leaders[]`·`leaderIds` 배열 모양은 그대로 둔다(0–1개). 편성판·공개본·참가자 내 조·참가 현황 표·체크인 조별 보기가 그대로 동작하고 지난 공개본도 읽힌다.
- 이미 2명 이상 저장된 조는 마이그레이션(`V16`)에서 활성 조장 먼저, 이름, 참가자 id 순으로 첫 사람만 남긴다. 처리자가 없어 이력은 남기지 않는다. 그 뒤 DB 색인이 조당 1명을 지킨다.
- **조원 순서는 운영자가 정하고 저장한다**(`group_assignments.position`). 기존 행은 그때 보이던 순서(조장 먼저, 이름)로 채운다. 새로 들어온 사람은 맨 뒤, 또는 배정 요청의 `beforeParticipantId` 앞이다. 조 안 순서만 바꾸는 `PUT …/groups/{groupId}/members/order`를 더한다. 충돌은 §4처럼 사람 단위로 보고, 하나라도 다르면 아무것도 저장하지 않는다. 새 ErrorCode는 없다.
- **순서가 쓰이는 곳:** 편성판, 공개 스냅샷, 운영자 공개본 조회, 조장의 조원 명단, 체크인 조별 보기 모두 운영자 순서다(조장 먼저로 다시 정렬하지 않는다).
- **공개 비교에 순서를 넣는다.** 순서만 바꿔도 그 조가 `groupChanges`에 들어가 "미공개 변경"이다. 넣지 않으면 순서만 바꾼 뒤 공개가 `ALREADY_PUBLISHED`가 되어 바뀐 순서를 공개할 수 없다.
- 계약은 [api.md "조 편성"](../../backend/docs/api.md)이다.

## DEC-073 — 신청 집계는 신청 읽기 권한으로 보고, 지금 신청서 설정을 기준으로 읽을 때마다 센다

**Date:** 2026-11-17

**Status:** CONFIRMED (사용자 위임 2026-11-17, 추천안 채택)

### Context

사용자는 2026-11-17 신청자 CSV(#233)를 직접 써 본 뒤 "매번 받아서 시트에 넣는 건 의미가 없다"고 했다. 구글 시트 자동 연동은 "흩어진 정보를 한곳에 모은다"는 SCENE의 장점을 없애므로 하지 않는다. 그래서 운영자가 시트를 열 이유가 없도록 SCENE 안에서 집계를 보여 준다. 이에 따라 [#251](https://github.com/BeomhyunPark/SCENE/issues/251)을 1차 범위로 옮겼다. 상위 이슈는 [#244](https://github.com/BeomhyunPark/SCENE/issues/244)와 [#230](https://github.com/BeomhyunPark/SCENE/issues/230)이다.

집계 규칙 자체는 이미 정해져 있다. 답은 자동 질문의 고정 키와 보기 id로 찾는다(DEC-070). 답이 없는 경우의 해석은 DEC-070 §3을 따르고, 꺼진 질문은 DEC-072 §3처럼 답이 없는 것으로 본다. 정해지지 않은 것은 다음 다섯 가지였다.

- 누가 보는가
- 설정 없이 만든 신청서와 꺼진 묶음을 어떻게 처리하는가
- 어떤 신청을 세는가
- 행사 상태에 따라 조회가 달라지는가
- 응답을 어떤 모양으로 내는가

질문·선택지·추천안은 [#251 결정 댓글](https://github.com/BeomhyunPark/SCENE/issues/251#issuecomment-6937659333)에 있다. 사용자가 이 결정을 맡겨서 추천안을 그대로 채택했다.

### Decision

1. **보는 사람은 신청 읽기와 같다.** 행사의 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다.
   - 숫자 집계와 카풀·이동 지원 목록 모두 이 권한으로 본다.
   - 카풀 목록에 나오는 이름·또래·좌석·동네·메모는 같은 권한으로 신청 원본 조회에서 이미 볼 수 있다. 그래서 새로 열리는 정보가 없다.
2. **전화번호와 접근 키는 집계 응답에 넣지 않는다.**
   - 여러 사람의 전화를 한 화면에 모으는 일은 반출(DEC-054, `DATA_EXPORT`)에 가깝다.
   - `PARTICIPANT_CONTACT_READ`는 아직 어떤 경로에서도 확인하지 않는다. 이 키를 집계에서 처음 쓰기 시작하면 권한 설계가 넓어진다.
   - 연락이 필요하면 목록의 `applicationId`로 신청 원본을 연다.
   - DEC-060은 협력자(운영자) 연락처를 다루며, 이 결정과 겹치지 않는다.
3. **`SUBMITTED` 신청만 센다.** CSV(#233), 조 편성판(DEC-072), 체크인(DEC-071)과 같다.
4. **행사 상태로 조회를 막지 않는다.** `ARCHIVED`도 읽는다. 읽기 전용이라 audit를 남기지 않는다(신청 읽기·체크인 현황과 같다).
5. **집계는 저장하지 않고 요청마다 센다.** 마이그레이션은 없다.
   - 일차·식사 칸·밤의 구성은 저장된 신청서 설정(`forms.setup`의 `schedule`·`generatedFor`)에서 만든다. 문구는 질문의 현재 보기 문구를 쓴다.
   - 그래서 참석 방식 질문이 없어 식사 질문이 만들어지지 않은 신청서도 식수를 센다. 이때는 모두 전체 참석이다.
6. **꺼진 질문은 묻지 않은 것으로 본다.** `hidden`인 질문은 운영자가 껐든 설정이 껐든 같다. 그 질문의 영역은 `null`이고, 그 질문에 저장된 답은 세지 않는다.
   - 참석 방식이 꺼지면 모두 전체 참석이다(DEC-072와 같다).
   - 식사가 꺼지면 부분·집회만 참석자를 `unanswered`로 따로 센다.
   - 부분 참석인데 숙박 질문이 보이지 않으면 그 사람들을 `unanswered`로 센다.
   - 질문은 살아 있고 **보기만 꺼진 경우**(예: 집회 차량을 끈 뒤의 이동 수단 보기)는 그 보기를 `hidden: true`로 그대로 두고 이미 고른 사람을 센다. 화면은 숫자가 0이 아닌 꺼진 보기만 "(꺼짐)"으로 보여 준다.
7. **설정 없이 만든 신청서**(`fromSetup: false`)는 총 신청 수·또래·참석 방식(모두 전체 참석)만 낸다. 나머지 영역은 `null`이다. 신청서가 없으면 `formId: null`이고 숫자는 0이다.
8. **기본 분포를 같이 낸다.**
   - 총 신청 수
   - 성별: 보기별 인원과 무응답
   - 또래: 두 자리 글자 오름차순. `00`이 `94`보다 앞이다. 세기(1900년대·2000년대)를 추측하지 않는다.
   - 참석 방식: 전체·부분·집회만
9. **카풀과 이동 지원은 나란히 보여 주고 맞추지 않는다.**
   - 카풀: 동승을 "예"라고 답한 운전자의 이름·또래·좌석·동네·메모와 좌석 합계
   - 이동 지원: 가는 길·오는 길 요청자의 이름·또래·동네
   - 자동 매칭은 하지 않는다.
10. **오는 길 자차.** 가는 길이 자차면 오는 길 행에서도 자차로 센다(DEC-070 §3). 오는 길 행은 가는 길 보기 순서를 따른다.

뒤집기 어려운 결정은 없다. 읽기 전용이고 저장하는 값이 없기 때문이다. 다만 응답 모양(아래 Consequence의 계약)은 화면이 의존하므로, 바꾸면 화면도 같이 바꾼다.

### 범위 밖

- 카풀 자동 매칭, 운전자와 요청자의 연결 저장
- 집계 화면 안의 전화번호 표시(필요하면 `PARTICIPANT_CONTACT_READ` 설계와 함께 따로 정한다)
- 숫자를 눌러 해당 신청자 목록 보기(화면 세션에서 필요하면 같은 권한 안에서 정한다)
- 중그룹·셀 분포

### Alternatives

- **카풀 목록을 `PARTICIPANT_READ`나 `GROUP_WRITE` 같은 새 키로만 열기:** 같은 정보가 `EVENT_READ`로 신청 원본에서 이미 보인다. 막아도 보호되는 것이 없고, MANAGER·STAFF가 차량을 준비하지 못한다.
- **카풀 목록에 전화번호 넣기:** 연락이 바로 된다. 하지만 전화 일괄 조회가 반출 권한 밖에서 열린다.
- **식사 칸을 식사 질문의 보기에서 만들기:** 참석 방식 질문이 없는 신청서는 식사 질문이 없어 식수를 셀 수 없다.
- **꺼진 질문의 저장된 답도 세기:** 조 편성판(DEC-072)과 숫자가 달라지고, 운영자가 끈 이유와 어긋난다.
- **설정 없는 신청서는 `404`나 빈 응답:** 화면이 분기를 두 번 만들어야 한다. 같은 모양에 `null` 영역이 더 단순하다.
- **집계 결과 저장·캐시:** 수련회 규모(수백 건)에서는 요청마다 세도 충분하다. 저장하면 신청·설정 변경 때마다 다시 계산해야 한다.

### Reason

운영자가 시트에서 세던 숫자를 같은 신청 읽기 권한 안에서 한 번의 요청으로 보여 주고, 새로 열리는 개인정보는 없게 한다. 해석 규칙은 DEC-070 §3과 DEC-072에 이미 있는 것만 써서, 조 편성판과 집계의 숫자가 어긋나지 않게 한다.

### Consequence

- 서버는 `GET /api/v1/operator/events/{eventId}/applications/summary`다. 위치는 `event/application/ApplicationSummaryService`·`ApplicationSummary`다.
- 계약은 [backend/docs/api.md](../../backend/docs/api.md) "신청 집계"에 있다.
- 새 오류 코드와 마이그레이션은 없다.
- 화면은 다음 작업에서 만든다.

### Evidence

사용자 위임 2026-11-17: #251의 결정을 "알아서" 맡겼고, 추천안을 채택했다. 근거 자료는 DEC-054, DEC-060, DEC-068 §6, DEC-070 §1·§3, DEC-071, DEC-072 §3, 신청자 CSV(#233) 사용 피드백(2026-11-17)이다.

## DEC-074 — 부분 참석은 기본으로 도착 칸과 출발 칸만 받고, 그 사이 모든 식사·집회에 참석한 것으로 센다

**Date:** 2026-11-17

**Status:** CONFIRMED (원칙·기본값·전환 가능 여부는 사용자 결정 2026-11-17, 세부는 사용자 위임 2026-11-17, 추천안 채택)

### Context

DEC-070은 부분·집회만 참석자가 `MEALS`에서 식사·집회 칸을 하나씩 고르게 했다. 사용자의 지인(서비스디자인 전공)이 "도착부터 출발까지는 모든 식사와 프로그램에 참석한다"는 원칙으로 도착·출발만 받자고 제안했고, 사용자가 이를 기본으로 삼되 교회마다 룰이 달라 설정 카드에서 지금 방식으로 돌아갈 수 있게 하라고 정했다. 질문·선택지·추천안은 [#322](https://github.com/BeomhyunPark/SCENE/issues/322)에 있다. 상위는 #244, 관련은 #230. 화면은 #323, 같은 제안의 이동 수단 분기는 #324다.

### Decision

1. **원칙.** 수련회장 도착부터 출발까지의 모든 식사와 프로그램에 참석한다. 누구는 먹고 누구는 안 먹는 식으로 세지 않는다.
2. **방식은 설정 카드의 `attendance.mode`다.** `RANGE`(도착~출발만 받기)와 `SLOTS`(칸마다 고르기, DEC-070 그대로).
   - 새 설정 카드의 기본은 `RANGE`다. PUT에서 키를 빼면 저장된 방식을 유지하고, 처음 저장이면 `RANGE`다.
   - 키가 없는 기존 설정은 `SLOTS`로 읽는다. 지금 동작이 바뀌지 않는다. 저장 위치는 `forms.setup` jsonb라 마이그레이션이 없다.
3. **`RANGE`의 질문.** `ARRIVAL_SLOT`("수련회장에 언제 도착하나요?")·`DEPARTURE_SLOT`("수련회장에서 언제 출발하나요?"). 둘 다 `SINGLE_CHOICE`, 필수, 부분 참석일 때만 보인다. 보기는 일정표의 칸을 칸 순서로 펼친 것이고 보기 id는 칸 id(`opt_d<일차>_<칸>`)다. 문구는 `1월 22일 (금) 저녁부터`/`…까지`다. 새 질문 유형은 만들지 않는다.
   - 도착 칸부터 출발 칸까지 모두 참석이다. 같은 칸이면 그 칸 하나다. 출발이 도착보다 앞이면 제출이 `400 APPLICATION_VALIDATION_FAILED`다.
   - `ARRIVAL_AT`·`DEPARTURE_AT`(날짜·시각)과 `LODGING`, 부분 참석용 `MEALS`는 만들지 않는다. 일차별 식사·집회 표는 칸 정의로 계속 쓴다.
4. **집회만 참석은 지금처럼 집회를 고른다.** 띄엄띄엄 오는 경우가 많아 구간으로 표현할 수 없다. `RANGE`에서 `MEALS`는 "참석할 집회를 선택해주세요"이고 집회만 참석일 때만 보이며, 식사 보기는 숨기고 집회 보기만 보인다. 보기 id가 같아 두 방식의 집계 코드가 같다.
5. **숙박은 구간에서 계산한다.** 도착 칸의 일차가 N 이하, 출발 칸의 일차가 N+1 이상이면 N번째 밤에 잔다. 숙박 질문은 따로 두지 않는다. 통근(구간 안이지만 자지 않음)은 있을 수 있으나 드물어 `PARTIAL_NOTE`에 적게 하고 운영자가 챙긴다.
6. **방식 전환.** 제출 신청이 없으면 자유롭다. 제출 신청이 1건이라도 있으면 다른 방식으로 바꾸는 저장은 `409 FIELD_LOCKED`다(DEC-068 잠금과 같은 코드). **뒤집기 어렵다: 접수가 시작되면 방식을 바꿀 수 없다.**
7. **참석 칸 계산은 한곳이다.** `MealSlots.attended`가 두 방식 모두 "참석 칸 id 목록, 모름은 `null`"을 내고, 집계(DEC-073)·조 편성판(DEC-072)·참가 현황 표·CSV가 같은 값을 쓴다. 참가 현황 표에 `slots`·`rows[].slotIds`를 더하고, CSV는 `RANGE`일 때 마지막에 `참석 일정` 열을 더한다. 편성판 응답 모양은 바꾸지 않는다.
8. **`SLOTS`의 `MEALS` 설명 기본 문구**는 "참석하는 일정에 포함되는 식사와 프로그램을 모두 선택해 주세요. ※ 식사는 실제 식사 여부와 관계없이 참석 일정에 포함된 경우 신청 인원에 반영됩니다."다. 문구는 모두 초안이다.

### 나중에 고칠 것

- 중간에 나갔다가 다시 오는 참석(구간 여러 개)은 지금 표현하지 않는다. 운영자가 `PARTIAL_NOTE`를 보고 챙긴다.
- 구간 안의 통근 참석자는 숙박 수에 들어간다.

### Follow-up 2026-11-17 — 통근자 "수련회장에서 숙박하지 않아요"(`NO_LODGING`)

**Status:** CONFIRMED. 넣는 것은 사용자 결정(2026-11-17), 세부는 사용자 위임(2026-11-17), 추천안 채택. 질문·선택지·추천안은 [#341](https://github.com/BeomhyunPark/SCENE/issues/341)에 있다.

`RANGE`는 숙박을 구간에서 계산하므로(§5), 구간 안에 있지만 집에서 자는 통근자가 숙박 인원에 들어갔다.

- **설정 카드 `attendance.noLodging`(기본: 새 설정 카드에서 켬).** 요청에서 없으면 저장된 값, 저장된 값이 없으면 `false`라서 이미 있는 신청서는 바뀌지 않는다.
- **질문 `NO_LODGING`**: 복수선택 보기 하나 `opt_no_lodging` "수련회장에서 숙박하지 않아요", 선택, 제목 "숙박", 설명 "집에서 오가며 참석한다면 체크해 주세요."(초안). 행사가 이틀 이상이고 `RANGE`이거나 참석 방식 질문이 없을 때 생긴다. 참석 방식 질문이 있으면 `ATTENDANCE ∈ {전체, 부분}`일 때 보인다. **전체 참석자에게도 보인다**(전체 참석 통근자가 있다). 집회만 참석자는 이미 숙박하지 않는다. 구간이 밤을 포함할 때만 보이게 하는 조건은 표현할 수 없어 부분 참석자 모두에게 보인다. 밤마다 고르기는 범위 밖이다(필요하면 `SLOTS`). `SLOTS`에서는 부분 참석자가 `LODGING`으로 밤을 고르므로 생기지 않는다(회귀 없음).
- **체크한 사람은 모든 밤 숙박에서 빠진다.** 집계(DEC-073) `lodging`이 반영하고, 부분 참석자는 구간을 몰라도 `unanswered`로 세지 않는다. 식사·집회 칸은 그대로 구간을 따른다. CSV·참가 현황 표에는 질문 열로 나온다.
- 접수 뒤에도 켜고 끌 수 있다. 조건이 바뀌지 않는 새 질문이고 끄면 숨기고 답은 남긴다(숨긴 질문의 답은 세지 않는다). 부분·집회만 스위치 변경으로 조건이 생기거나 없어지면 DEC-068 잠금(`409 FIELD_LOCKED`)이다. 새 오류 코드·마이그레이션은 없다.
---

## DEC-075 — 운영자는 신청마다 운영 정보를 따로 저장하고, 1차는 운영 메모 하나이며, 원본 응답은 바꾸지 않는다

**Date:** 2026-11-17

**Status:** CONFIRMED (만든다는 것은 사용자 결정 2026-11-17, 범위·권한·모양은 사용자 위임 2026-11-17, 추천안 채택)

### Context

사용자는 스프레드시트에서 하던 메모·직접 고치기를 SCENE 안에서 하길 원한다(시트 연동은 하지 않는다). DEC-074의 도착~출발 방식은 중간 이탈·통근 같은 예외를 운영자가 챙기게 했는데 챙긴 결과를 적을 곳이 없다. 참가 현황 표(#308)에 "운영자 메모 열"이 제안으로만 있었다. 디자인은 Figma `RreFdEVMiwgHrV7teaCEOm` 1325:5517(서랍 1325:5552, 확인 창 1325:5581)이다. 질문·선택지·추천안·영향은 [#335](https://github.com/BeomhyunPark/SCENE/issues/335)에 있다. 상위는 #230, 관련은 #308. 화면은 #337이다.

### Decision

1. **원본은 바꾸지 않는다.** 참가자가 낸 답(`answers`)은 그대로 두고, 운영 값은 새 테이블 `application_operations`(신청당 한 행, `space_id`·`event_id` 테넌트 키, `version`, `updated_by`·`updated_at`)에 따로 저장한다. 읽는 쪽은 "운영 값이 있으면 운영 값, 없으면 원본"을 쓴다. **뒤집기 어렵다: 데이터 모양.**
2. **1차는 운영 메모 하나다.** 신청마다 글 하나, 0~2,000자(잠정), `expectedVersion`으로 동시 수정을 막는다(회고 저장 DEC-067 Follow-up과 같은 방식). `PUT …/applications/{applicationId}/operation`. 신청 상세와 참가 현황 표가 `operation`으로 함께 준다. 표의 열·거르기는 화면이 한다.
3. **권한.** 쓰기는 effective `PARTICIPANT_WRITE`(행사 OWNER 기본, 다른 운영자는 개인별 GRANT). **역할 기본값(RoleDefaults)은 바꾸지 않는다** — 바꾸면 배포 즉시 모든 기존 행사에 적용된다. (2026-11-20 → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2): 사용자가 이 경고를 알고 MANAGER 기본값에 `PARTICIPANT_WRITE`를 넣었다. STAFF는 그대로 개별 GRANT다.) 읽기는 신청 상세·표를 읽을 수 있는 사람(`EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`)이다. 현장 STAFF도 예외 메모를 봐야 해서 연락처 권한으로 좁히지 않는다. 참가자 경로와 CSV에는 나가지 않는다.
4. **행사 상태.** `DRAFT`·`ACTIVE`·`ENDED`에서 쓴다(ENDED는 기록 정정, DEC-051). `ARCHIVED`는 `409 EVENT_ARCHIVED`. `SUBMITTED`가 아닌 신청은 `409 INVALID_STATE_TRANSITION`.
5. **이력.** 저장마다 audit `APPLICATION_OPERATION_UPDATED`(`applicationId`·`version`·`fields`)를 남긴다. 메모에는 개인정보가 들어갈 수 있어 본문은 audit·로그·오류 응답에 넣지 않는다.
6. **조 배정**은 서버에 새 쓰기를 만들지 않는다. 서랍은 기존 `POST …/group-assignments`(DEC-072)를 부른다. 이를 위해 참가 현황 표 행에 `participantId`를 더한다.
7. 새 ErrorCode는 없다.

### 1차 범위 밖

- **참석 범위·참석 칸의 운영 수정**(중간 이탈, 실제 도착 변경, 통근 숙박 안 함): 식수·숙박 집계, 편성판 참석 막대, CSV, 표가 모두 읽어 영향이 크고, 같은 시각 다른 작업이 숙박 계산·`event/form`을 고치고 있다. 1차에서는 메모로 적고 숫자는 원본 답 기준이다. 넣을 때는 이 테이블에 열을 더하고 `AttendedSlots`·`MealSlots` 한곳에서 운영 값을 먼저 읽는다. **계산에 영향**을 주므로 따로 결정한다(#339).
- **현재 참가 상태(운영자 취소)**: 디자인의 상태 대부분은 없는 기능(회비·변경 요청)에 딸려 있다. 운영자 취소는 필요하지만 집계·편성판(DEC-072: 같은 transaction에서 조 배정 삭제)·체크인·공개 스냅샷·참가자 링크를 함께 정해야 한다. 신청 접수(12월 중순) 전까지 #338에서 다룬다. 그때까지 서랍은 상태를 읽기 전용으로 보인다.
- CSV에 메모 열: 반출 범위(DEC-054)를 넓히므로 넣지 않는다.

### Alternatives

메모 여러 개(스레드), MANAGER 기본 쓰기(RoleDefaults 변경 — 2026-11-20 [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2)에서 채택), 메모 전용 권한 키, 메모 읽기를 연락처 권한으로 제한, 원본 답을 직접 고치기, 1차에 참석 범위까지 넣기를 버렸다.

---

## DEC-076 — 조직 역할은 OWNER·ADMIN·MEMBER이고, 조직 초대는 행사 초대와 같은 계약으로 MEMBER를 만든다

**Date:** 2026-11-18

**Status:** CONFIRMED (현 결정 2026-11-18)

### Context

2027년 1월 수련회 운영진이 조직 멤버로 들어와 행사를 만들고 Event Owner를 맡아야 한다([#358](https://github.com/BeomhyunPark/SCENE/issues/358)). 운영 서버에서 조직에 들어가는 길은 첫 관리자 지정(DEC-069) 하나뿐이다. 행사 생성과 Event Owner는 활성 조직 멤버만 할 수 있어서(DEC-060) 첫 관리자 한 명이 모든 행사를 만들고 Owner를 맡아야 하며, Owner를 넘겨줄 사람도 없다. `members.role`에는 `ADMIN`이 있지만 부여 방법도 결정 문서의 정의도 없고, 서버 여러 서비스에 "공간 OWNER 또는 ADMIN이면 모든 행사 조회" 판정이 있다. 운영 멤버 화면은 초대 링크 만들기만 있고, 기존 멤버를 바로 추가하는 API(`POST /api/v1/operator/events/{eventId}/operators`)는 화면에서 부르지 않는다.

> **2026-11-19 메모:** 위 Context의 "조직 멤버가 행사를 만들고 Event Owner를 맡는다" 전제는 DEC-077([#370](https://github.com/BeomhyunPark/SCENE/issues/370))이 좁혔다. 행사는 활성 조직 `OWNER`·`ADMIN`만 만들고, `MEMBER`는 운영자로 추가돼 행사에 들어온다. 아래 본문은 바꾸지 않았다.

### Decision

- **조직 역할은 `OWNER` / `ADMIN` / `MEMBER` 세 가지다.** `ADMIN`은 수련회 이후 확장을 위해 지금 정의하지만, 1월에는 아무에게도 부여하지 않는다.
- **`ADMIN`은 공간의 모든 행사를 조회하고, 조직 초대를 `MEMBER`로 보낼 수 있다.** 조회는 현재 코드의 "OWNER 또는 ADMIN이면 모든 행사 조회" 동작을 그대로 정의로 삼는다. 멤버 역할 변경과 멤버 제거는 `OWNER`만 하며 이번 범위 밖이다.
- **`ADMIN`으로 초대하는 것은 `OWNER`만 한다.** `ADMIN`이 `ADMIN`을 늘리지 못하게 한다. 1월 화면에는 역할 선택지가 없고 `MEMBER`로만 초대한다.
- **초대로 `OWNER`를 만들지 않는다.** Owner 추가는 기존 위임·인수인계 흐름(DEC-032, DEC-033)을 따른다.
- **조직 초대 계약은 행사 초대(DEC-060과 2026-11-16 Follow-up)와 같다.**
  - 1회용 토큰은 해시만 저장한다. 수락은 세션의 검증된 이메일이 초대 이메일과 같을 때만 된다.
  - TTL은 7일 서버 상수다. 재전송은 새 행을 만들고 이전 행을 `SUPERSEDED`로 남긴다.
  - 저장 상태는 `PENDING / ACCEPTED / REVOKED / SUPERSEDED`이고, 같은 공간·이메일의 `PENDING`은 하나만 허용한다.
  - SMTP가 없는 동안 생성·재전송 응답이 링크(`/operator/invitations#<token>`)를 한 번만 돌려준다.
- **이미 활성 멤버인 사람이 수락하면 성공으로 보고 `outcome: ALREADY_MEMBER`를 돌려준다.** 행사 초대의 `ALREADY_ACCEPTED`와 같은 방식이다.
- **탈퇴(`LEFT`)한 사람이 수락하면 같은 Membership을 다시 `ACTIVE`로 바꾼다.** 재가입을 허용한다(DEC-037).
- **행사 전용 협력자가 조직에 들어와도 기존 `event_users` 행은 그대로 둔다**(DEC-039).
- **멤버 목록은 활성 멤버 모두가 이름·역할을 본다. 이메일은 `OWNER`·`ADMIN`만 본다.** DEC-060의 연락처 숨김과 맞춘다.
- **행사에 조직 멤버를 넣을 때는 Event Owner가 멤버 목록에서 골라 바로 추가한다**(기존 `POST /api/v1/operator/events/{eventId}/operators`). 외부인은 계속 행사 초대로 들어온다. 행사 초대는 Event Owner만 보낸다(DEC-060 그대로).
- DEC-037의 "초기 승인권은 조직 Owner에게만"은 가입 요청 승인에 대한 규칙으로 남는다. 조직 초대를 보내는 권한만 `ADMIN`까지 넓힌다.

### 범위 밖

- 멤버 역할 변경, 멤버 제거, `ADMIN` 부여 화면
- 공개 가입, 누구나 조직을 만드는 공개 조직 생성, 조직 가입 요청(DEC-069 범위 밖 유지)
- 초대 메일 발송(SMTP)

### Alternatives

- `ADMIN`을 지금 만들지 않고 `OWNER`·`MEMBER`만 두기: 코드에 이미 `ADMIN` 판정이 퍼져 있어 정의 없이 남게 된다. 수련회 이후 다시 정해야 해서 채택하지 않았다.
- `ADMIN`도 `ADMIN`으로 초대하기: 관리자가 통제 없이 늘어나 채택하지 않았다.
- 초대로 `OWNER` 만들기: 위임·인수인계(DEC-033)를 건너뛰게 돼 채택하지 않았다.
- 조직 초대만의 새 토큰·상태 규칙: 검증된 행사 초대 흐름을 다시 만들 이유가 없어 채택하지 않았다.
- 조직 멤버도 행사 초대 링크로 넣기: 이미 신원이 확인된 멤버에게 링크 전달을 요구해 번거롭다.

### Reason

조직 멤버를 늘릴 길이 생겨야 1월 운영진이 행사를 만들고 Owner를 나눠 맡을 수 있다. 역할은 코드에 이미 있는 세 가지로 정의하고, 초대는 검증된 행사 초대 계약을 그대로 써서 새 위험을 줄인다. 조직 멤버는 바로 추가하고 외부인만 초대해 조직 소속과 행사 접근의 두 층(DEC-039, DEC-060)을 유지한다.

### Consequence

서버는 조직 역할 판정을 한 곳으로 모은 뒤(동작 변화 없음) 조직 초대 생성·재전송·취소·목록·미리보기·수락을 만든다. 화면은 조직 설정의 멤버 목록·초대, 조직 초대도 처리하는 초대 수락 화면, 운영 멤버 화면의 조직 멤버 바로 추가를 만든다. 하위 작업은 [#358](https://github.com/BeomhyunPark/SCENE/issues/358)에 있다. 이 결정은 DEC-069의 "범위 밖" 중 초대 기반 조직 가입을 범위 안으로 가져온다. [organization-entry-review](organization-entry-review.md) "현재 범위 (2026-11-18)"에 적었다.

### Evidence

현 결정 2026-11-18. [#358](https://github.com/BeomhyunPark/SCENE/issues/358) 사용자 결정, [#359](https://github.com/BeomhyunPark/SCENE/issues/359) 추천 기본값 모두 확인. 근거 결정은 DEC-032, DEC-033, DEC-037, DEC-039, DEC-060, DEC-069이다.

---

## DEC-077 — 행사는 활성 조직 OWNER·ADMIN만 만들고, MEMBER는 운영자로 추가돼 행사에 들어온다

**Date:** 2026-11-19

**Status:** CONFIRMED (현 결정 2026-11-19)

### Context

지금은 활성 조직 멤버라면 누구나 행사를 만들 수 있고, 만든 사람이 그 행사의 Event Owner가 된다(`OperatorEventCommandService#create`, DEC-060). 이 규칙은 결정 문서에 명시된 적이 없고, DEC-076은 "멤버가 행사를 만든다"를 전제로만 썼다. 조직 초대(DEC-076, [#358](https://github.com/BeomhyunPark/SCENE/issues/358))로 `MEMBER`가 생기면서 초대받은 누구나 조직 이름으로 행사를 만들 수 있게 됐다([#370](https://github.com/BeomhyunPark/SCENE/issues/370)).

### Decision

- **행사 생성은 활성 조직 `OWNER`·`ADMIN`만 한다.** 활성 `MEMBER`의 생성 요청은 `403 FORBIDDEN`이고 행사를 만들지 않는다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`, 탈퇴(`LEFT`)면 `403 NOT_A_MEMBER`인 기존 순서는 그대로 두고, 역할 판정은 그 뒤, 본문 검사보다 앞에 둔다.
- **`MEMBER`는 관리자가 만든 행사에 운영자로 추가돼서 들어온다.** Event Owner가 운영 멤버 화면에서 조직 멤버를 골라 바로 추가한다(DEC-076, `POST /api/v1/operator/events/{eventId}/operators`).
- **만든 사람이 그 행사의 Event Owner가 되는 규칙은 그대로다.** `ADMIN`이 만든 행사의 Owner도 그 `ADMIN`이다.
- **화면은 `MEMBER`에게 행사 만들기 진입점을 보이지 않는다.** "새 행사" 버튼과 빈 목록의 행사 만들기 안내를 숨기고, "관리자가 만든 행사에 운영자로 추가되면 여기에 보여요"를 안내한다. `/events/new`로 직접 들어와도 양식 대신 안내를 보인다. 서버 판정이 기준이고 화면은 그와 맞춘다(DEC-031).
- `EVENT_CREATE` 권한 키는 여전히 없다. 판정은 조직 역할(`SpaceMembership#mayCreateEvents`) 하나다.

### 범위 밖

- `MEMBER`가 행사 생성을 요청하고 관리자가 승인하는 흐름
- 행사별 생성 권한 위임, `ADMIN` 부여 화면(DEC-076 범위 밖 유지)

### Alternatives

- 지금처럼 활성 멤버 누구나 만들기: 초대받은 운영진 누구나 조직 이름으로 행사를 열 수 있어 채택하지 않았다.
- `OWNER`만 만들기: 수련회 이후 `ADMIN`에게 맡길 일을 다시 막게 되고, `ADMIN`이 이미 모든 행사를 보는 정의(DEC-076)와 어긋나 채택하지 않았다.
- 화면에서만 숨기기: 서버와 화면 판정이 달라져(DEC-031) 채택하지 않았다.

### Reason

조직 이름으로 행사를 여는 일은 조직을 관리하는 사람이 정한다. 운영진은 관리자가 만든 행사에 운영자로 들어와 일하면 충분하고, 그 길(조직 멤버 바로 추가)은 DEC-076에서 이미 만들었다.

### Consequence

서버는 `SpaceMembership`에 `mayCreateEvents()`(활성 `OWNER`·`ADMIN`)를 두고 행사 생성에서 검사한다. [backend/docs/api.md](../../backend/docs/api.md)의 행사 생성 계약을 갱신한다. 화면은 조직 역할을 보고 `MEMBER`에게 행사 만들기 진입점을 숨긴다. #358의 완료 조건 "그 MEMBER가 행사를 만들 수 있고 Event Owner를 맡을 수 있다"와 #364의 확인 흐름 "조직 초대 → 수락 → 행사 생성 → 운영자 추가"는 "OWNER가 행사를 만들고 그 MEMBER를 운영자로 추가한다"로 바뀐다.

### Evidence

현 결정 2026-11-19. [#370](https://github.com/BeomhyunPark/SCENE/issues/370) 사용자 결정. 근거 결정은 DEC-031, DEC-060, DEC-076이다.

---

## DEC-078 — 참가자는 이름·전화번호·본인이 정한 숫자 6자리로 들어오고, 신청 수정은 revision으로 저장한다

**Date:** 2026-11-19

**Status:** CONFIRMED (들어오는 방식·재신청·직접 수정·6자리 안은 사용자 결정 2026-11-19, 함께 정할 (a)~(e)는 추천안 채택) — DEC-064를 잇는다

### Context

DEC-064는 참가자가 신청 완료 화면에 한 번 나오는 링크(fragment 접근 키)로만 다시 들어오게 했다. 2027년 1월 수련회는 12월 중순에 신청을 받고 1월에 다시 열어 보는 구조라 링크를 잃는 사람이 반드시 생긴다. 같은 전화로 다시 신청하면 참가자가 하나 더 생기고, 참가자는 낸 신청을 보거나 고칠 수 없다. 사용자는 링크에 기대지 않고 이름과 전화번호로 들어오게 하되, 교회 안에서는 이름과 전화번호를 서로 알기 때문에 본인만 아는 숫자 6자리를 함께 검증하기로 했다(로드맵 `retreat-2027-roadmap.md` 6.3절, [#378](https://github.com/BeomhyunPark/SCENE/issues/378) 댓글). 작업 단위는 [#397](https://github.com/BeomhyunPark/SCENE/issues/397)(이 결정), #399·#401·#402·#404·#405다.

### Decision

**1. 신원.** 행사 안에서 전화번호 하나가 참가자 한 명이다. 전화번호의 숫자만 모은 값의 해시(`participants.phone_key`)에 행사별 유일 제약을 둔다. **뒤집기 어렵다: 데이터 모양.** 이 제약이 들어가기 전에 같은 전화로 여러 번 신청한 기록(리허설 데이터)은 가장 최근 참가자만 키를 갖고, 나머지는 키가 비어 들어오지 못한다(리허설 데이터는 신청을 열기 전에 지운다).

**2. 숫자 6자리(PIN).**

| 항목 | 규칙 |
|---|---|
| 정하는 때 | 신청서 끝에서 두 번 넣는다(화면이 두 값을 비교하고 서버는 한 값을 받는다). 첫 신청에 필수다 |
| 받지 않는 번호 | 숫자 6개가 아닌 값, 같은 숫자 반복(`000000`), 1씩 오르거나 내리는 숫자(`123456`, `654321`), 자기 전화번호 숫자에 들어 있는 6자리. `400 PARTICIPANT_PIN_WEAK` |
| 저장 | bcrypt 해시(`participants.pin_hash`)만 저장한다. 요청 본문·응답·로그·audit·CSV·운영자 화면 어디에도 나오지 않는다 |
| 틀렸을 때 | 이름·전화번호·6자리 중 무엇이 틀렸는지, 그 전화의 신청이 있는지 구분하지 않고 같은 `401 PARTICIPANT_LOGIN_FAILED`다 |
| 잠금 | **추측 방지의 주된 수단이다.** 전화번호별로 연속 5번 틀리면 잠근다(`429 PARTICIPANT_LOGIN_LOCKED`, `retryAfterSeconds`). 24시간 안에서 첫 잠금은 5분, 두 번째는 30분, 세 번째부터는 24시간이다. 신청이 없는 전화번호도 똑같이 센다(잠금으로 신청 여부가 드러나지 않게). 맞히거나 운영자가 6자리를 초기화하면 실패 횟수와 단계가 처음으로 돌아간다. 세 번째 단계에 들어간 번호와 IP 한도 초과는 서버 로그에 경고 한 줄(행사 id와 건수만)을 남긴다. 운영자 알림(I3)은 이 지점에 붙인다 |
| IP 제한 | **넉넉한 남용 방지선일 뿐이다.** 같은 IP의 들어오기 실패가 10분에 300번, 공개 신청이 10분에 1,000번을 넘으면 `429 RATE_LIMITED`. 들어오기 성공은 세지 않는다 |
| 잊었을 때 | 운영자가 참가 현황에서 초기화하면(`PARTICIPANT_WRITE`, audit `PARTICIPANT_PIN_RESET`) 서버가 만든 임시 번호가 응답에 한 번 나온다. 그 참가자의 세션은 모두 끊기고 잠금도 풀린다. 임시 번호로 들어온 세션은 새 번호를 정하기 전에는 `GET /participant/me`·번호 정하기·로그아웃만 된다(`403 PARTICIPANT_PIN_CHANGE_REQUIRED`) |
| 도착 체크인 | 6자리와 상관없다(DEC-071 그대로) |

숫자의 근거(2026-11-19, 상위 세션 검토 반영 — #393에서 같은 회선의 운영진이 IP 한도에 서로 막힌 일):
- 수련회장에서는 최대 200명이 같은 와이파이(같은 공인 IP)로 들어오고, 신청 기간에도 교회 와이파이에서 여럿이 같이 신청한다. 200명이 몇 분 안에 한두 번씩 잘못 넣어도(실패 수백 번 미만), 같은 사람이 신청을 두세 번 다시 보내도(1,000번 미만) IP 한도에 걸리지 않게 잡았다.
- 추측 방지는 전화번호별 잠금이 맡는다. 잠금을 5분 하나로만 두면 번호 하나에 하루 1,440번이고, 이름·전화번호 명단을 가진 사람이 200명을 돌리면 하루 약 4%, 60일이면 누군가는 뚫린다. 그래서 단계적으로 늘린다(5분 → 30분 → 24시간): 번호 하나에 하루 약 15번, 200명 전체로도 하루 0.3% 수준이다. IP 한도 300번/10분은 여러 번호를 한꺼번에 노리는 시도를 하루 약 4만 번으로 묶는 남용 방지선이다.
- **잠금은 남을 괴롭히는 수단이 될 수 있다**(남의 전화번호로 일부러 틀리기). 첫 잠금은 5분이라 잊어버린 정상 사용자는 잠깐만 기다리면 되고, 더 길어진 잠금은 운영자 초기화로 바로 풀린다. 쿠키가 세션 끝까지 남으므로(§3) 잠금은 새로 들어오는 시도만 막고, 이미 들어와 있는 사람은 영향이 없다. 반복해서 잠그는 사람이 있으면 운영자가 초기화로 풀고, 서버 로그(IP)와 Cloudflare 이벤트로 찾는다.

한계: 시도 횟수·잠금·단계는 서버 메모리에만 있어 배포·재시작 때 사라진다. 남길 것이 없어진 항목(잠금이 끝나고 마지막 잠금·실패가 24시간 지난 번호, 창이 지난 IP)은 재시작 없이도 지운다(아래 Follow-up, #418). 숫자는 설정 `scene.participant.*`(`lock-durations`, `lock-escalation-window` 포함)이고 홈서버 `.env`의 `SCENE_PARTICIPANT_*`로 바꾼다. 수련회 당일은 코드 배포를 동결하므로, 와이파이에서 정상 사용자가 `429`를 보면 설정만 올리고 백엔드를 다시 띄운다(카운터·잠금도 풀린다).

시도 횟수와 잠금은 프로세스 메모리에 둔다(`common/ratelimit`, #393에서 초대용으로는 지운 제한기를 이 용도로 다시 둔다). 서버가 다시 뜨면 0부터 센다. 숫자는 잠정이며 설정으로 바꾼다.

**3. 참가자 세션.** `POST /api/v1/public/events/{eventId}/participant-sessions`가 `{ name, phone, pin }`을 받는다. 이름은 앞뒤 공백을 자르고 가운데 공백을 하나로 모아 비교한다. 첫 신청이 성공하면 같은 응답에서 세션 쿠키가 바로 나온다(신청 직후 들어간 상태). 세션은 로그아웃하거나, 6자리가 초기화되거나, **행사 끝 날짜 다음 날부터 7일이 지나면(끝 날짜+8일 0시, Asia/Seoul)** 끝난다. 끝 날짜가 없는 행사는 로그아웃까지다(잠정 (c)). 쿠키에는 그 시각까지의 `Max-Age`를 준다(끝 날짜가 없으면 180일). 휴대폰 브라우저는 앱을 닫거나 정리하면 `Max-Age` 없는 세션 쿠키를 버리므로, 12월에 신청한 휴대폰이 1월에 다시 열어도 들어가 있게 하려는 것이다. 끝났는지는 늘 서버가 판정하고, 로그아웃은 `Max-Age=0`으로 쿠키를 지운다.

**4. 신청 수정은 revision이다 (a).** 고친 답은 새 `applications` 행(`SUBMITTED`, `revision` +1, `previous_application_id`)으로 저장하고 이전 행은 `SUPERSEDED`로 남긴다. 참가자당 `SUBMITTED`는 하나다(부분 유일 제약). revision은 고친 사람(`revised_by`: `PARTICIPANT` 또는 `OPERATOR`, 운영자면 `revised_by_user_id`)과 바뀐 질문 목록(`changes`: 질문 id와 그때의 질문 제목, 이름이 바뀌었으면 `NAME`)을 가진다. 답 값은 `changes`에 넣지 않는다(변경 전후는 두 revision의 답에서 읽는다).
- 조 배정·체크인·조장 표시는 참가자에 붙어 있어 그대로다. 운영 메모(`application_operations`, DEC-075)는 새 revision으로 옮긴다. 운영 메모는 revision과 따로 둔다.
- 집계·편성판·CSV·참가 현황 표·체크인 명단은 이미 `SUBMITTED`만 읽으므로 새 답을 쓴다.
- 운영자가 숨긴 질문(`hidden`)의 이전 답은 참가자가 볼 수도 고칠 수도 없으므로 새 revision으로 그대로 옮긴다. 조건이 거짓이 된 질문의 답은 첫 신청처럼 버린다(DEC-068).
- 전화번호는 수정으로 바꾸지 않는다(신원이므로). 바꾸려면 운영자가 처리한다(A12).
- 바뀐 것이 없으면 revision을 만들지 않고 지금 신청을 돌려준다.
- **#339(운영자의 참석 범위 수정)도 이 revision으로 푼다(추천안).** 운영자가 고치면 `revised_by: OPERATOR`. 참가자가 다시 고치면 마지막 revision이 이긴다. 구현은 A12에서 한다. DEC-075의 "운영 값 열을 더한다"는 안은 참석 범위에 쓰지 않는다.

**5. 같은 전화의 재신청 (b).** 공개 신청 POST에 이미 그 행사에 있는 전화번호가 오면, 6자리가 맞을 때만 수정(새 revision)으로 처리하고 `200`을 돌려준다(첫 신청은 `201`). 이름이 달라도 수정으로 처리하고 `changes`에 `NAME`을 남긴다. 6자리가 틀리면 `409 APPLICATION_ALREADY_EXISTS`("이미 신청이 있어요")만 돌려주고 이전 답은 넣지 않는다. 이 실패도 그 전화의 잠금 횟수에 들어간다.

**6. "신청 수정 받기" 스위치 (d).** 신청서에 `acceptingEdits`를 신청 받기(`acceptingApplications`)와 따로 둔다. 기본은 켜짐이다. 수정(참가자 세션의 수정, 같은 전화의 재신청)은 행사가 `ACTIVE`이고 `acceptingEdits`일 때만 된다. 아니면 `409 EDITS_CLOSED`. 행사가 끝나면(`ENDED`·`ARCHIVED`) 스위치와 상관없이 닫힌다(DEC-063). 신청을 닫은 뒤에도 수정은 받을 수 있다. 끄면 참가자는 읽기만 한다.

**7. 접근 키와 링크 (e).** 첫 신청 응답에 `accessKey`가 없다. 화면의 일회용 링크·fragment 처리는 뺀다. 서버의 접근 키 세션 경로(`{ accessKey }` 본문)도 지운다: 실제 신청 전이고 키를 가진 사람은 리허설 참가자뿐이며, 두 입구를 두면 잠금·시도 제한을 두 번 지켜야 한다. `participant_access` 테이블은 기록으로 두고 새 행을 만들지 않는다(세션의 `participant_access_id`는 비울 수 있게 한다). 키로 들어오던 참가자는 운영자가 6자리를 초기화해 준다.

**8. 참가자 주소.** 행사마다 하나인 `/participate/{eventId}`다. 운영자는 참가 현황에서 이 주소와 QR을 복사해 단체 대화방에 올린다. 신청 주소(`/apply/{eventId}/{formId}`)는 그대로다.

**9. 본인 확인 방식은 갈아 끼울 수 있게 둔다.** 세션 발급 본문을 방식별로 나눌 수 있게 두고, 나중에 문자 인증이나 참가자 계정으로 바꿔도 세션·revision 계약은 그대로다.

### 바뀌는 점 (DEC-064 대비)

- 링크 접근 키 하나 → 이름·전화번호·6자리. security-privacy §3의 "6자리 숫자·전화번호·PIN을 credential로 쓰지 않는다"를 고친다.
- DEC-064에서 OPEN이던 세션 TTL·rate limit 숫자·키 복구는 위 2·3절로 정한다. 키 재발급은 6자리 초기화로 바뀐다.
- 쿠키 이름·속성(DEC-067), 세션 토큰 해시 저장, 운영자 세션과의 분리는 그대로다.

### 범위 밖

- 참가자 "내 정보" 화면의 수정(A5, 트랙 B의 참가자 홈 뒤), 운영자 알림 화면(A6·I3: `changes`를 읽는다), 신청 취소(A7, #338), 운영자 대리 수정·직접 추가(A12, #339).
- 문자 인증, 참가자 계정.

### Alternatives

- 이름·전화번호만: 아는 사람이 남의 신청을 볼 수 있어 사용자가 버렸다(결정 10).
- 숫자 4자리: 경우의 수가 1만이라 잠금이 있어도 약하다.
- 수정을 같은 행 덮어쓰기: 이전 답이 사라져 되돌릴 수 없고 운영자 알림이 무엇이 바뀌었는지 보일 수 없다.
- #339를 `application_operations` 열로: 참가자가 다시 고쳤을 때 어느 값이 이기는지 헷갈린다.
- 빡빡한 IP 한도(처음 안: 실패 10분 30번, 신청 10분 100번): 수련회장·교회 와이파이에서 정상 사용자가 서로 막힌다(#393과 같은 문제).
- 처음부터 긴 잠금(15분 이상): 잊어버린 정상 사용자가 오래 기다린다. 5분 하나로만 두기: 번호당 하루 1,440번이라 명단을 가진 사람이 60일 동안 돌리면 누군가는 뚫린다.
- 잠금을 DB에 두기: 신청이 없는 전화번호에는 행이 없어 잠금으로 신청 여부가 드러난다. 집 서버 한 대라 메모리로 충분하다.
- 접근 키 경로 유지: 입구가 둘이 되어 시도 제한을 두 번 지켜야 한다.

### Consequence

계약은 [backend/docs/api.md](../../backend/docs/api.md)의 공개 신청서·참가자 세션·참가자 신청 절, 보안 기준은 [Security / Privacy](../architecture/security-privacy-v0.1.md#3-participant-access) §3을 따른다. 남는 위험: 6자리를 남에게 알려 준 경우는 막지 못하고, 수정 이력(`changes`)과 운영자 알림(A6)으로 되돌린다.

### Evidence

사용자 결정 2026-11-19(로드맵 6.1절 결정 2·6·9·10, 6.3절). [#378](https://github.com/BeomhyunPark/SCENE/issues/378), [#397](https://github.com/BeomhyunPark/SCENE/issues/397).

### Follow-up (2026-11-20, #418)

잠금·시도 기록은 남길 것이 없어지면 메모리에서 지운다. 재시작하면 사라진다는 성질과 잠금 규칙(연속 5번, 24시간 안 5분·30분·24시간, 맞히거나 초기화하면 처음으로)은 그대로다.

- 전화번호 항목은 잠금이 끝났고, 마지막 잠금이 24시간(`lock-escalation-window`)보다 오래됐고, 마지막 실패도 24시간보다 오래됐을 때 지운다. 잠금 중이거나 단계 기록이 남은 항목은 지우지 않으므로 단계가 처음으로 돌아가지 않는다.
- 하나 달라지는 점: 잠금까지 가지 않은 실패(1~4번)는 24시간 동안 실패가 없으면 세지 않는다. 그 사이 시도는 4번 이하라 단계 잠금이 허용하는 하루 약 15번보다 적고, 추측 방지는 약해지지 않는다.
- IP 항목(들어오기 실패, 공개 신청)도 마지막 기록이 창(10분)을 지나면 지운다. 그때는 이미 0으로 세므로 한도는 달라지지 않는다.
- 지우기는 실패·IP 기록 요청 안에서 1분에 한 번 맵을 훑는다(20만 항목에 수 ms). 항목 수 상한은 두지 않는다. 상한을 넘을 때 오래된 항목을 밀어내면 남의 번호를 공격자가 밀어내 잠금 단계를 되돌릴 수 있고, 새 항목을 거절하면 정상 사용자가 막힌다. IP 한도 때문에 한 IP가 남기는 항목은 하루 4만 남짓(약 13 MB)이고 24시간 뒤 지워지므로 메모리는 늘어나기만 하지 않는다.

---

## DEC-079 — 역할 기본 권한은 MANAGER가 일정·공지 쓰기까지, STAFF는 체크인까지이고, 나머지는 행사 OWNER가 운영 멤버 화면에서 사람별로 준다

**Date:** 2026-11-19

**Status:** CONFIRMED (기본값은 사용자 결정 2026-11-19 로드맵 결정 7, 권한 화면의 묶음·문구는 추천안으로 진행 [#395](https://github.com/BeomhyunPark/SCENE/issues/395))

### Context

DEC-029는 운영자마다 권한을 달리 준다고 정했고, 2026-10-02 보강으로 계산 방식(역할 기본값 + 사람별 `GRANT`·`REVOKE`)과 서버 경로(`PUT …/operators/{userId}/permissions`)를 만들었다. MANAGER·STAFF 기본값은 그 뒤 `TASK_WRITE`(DEC-062)와 `CHECKIN_WRITE`(DEC-071)만 승인됐고, 권한 설정 화면은 정하지 않았다. 그래서 2027년 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))에 필요한 조 편성(`GROUP_WRITE`, DEC-072), 운영 메모(`PARTICIPANT_WRITE`, DEC-075), 연락처 보기(`PARTICIPANT_CONTACT_READ`), 명단 CSV(`DATA_EXPORT`, DEC-054)를 행사 OWNER 한 사람만 할 수 있었다. 로드맵 트랙 I([#385](https://github.com/BeomhyunPark/SCENE/issues/385)) I1·I2다.

### Decision

1. **역할 기본 권한 표.** `RoleDefaults`가 이 표를 따른다.

   | 행사 역할 | 기본 권한 |
   | --- | --- |
   | `OWNER` | 등록된 행사 키 전부(바뀌지 않음) |
   | `MANAGER` | ~~`EVENT_READ`, `TASK_WRITE`(DEC-062), `CHECKIN_WRITE`(DEC-071), **`SCHEDULE_WRITE`, `NOTICE_WRITE`**(이번에 더함)~~ → 등록된 행사 키 전부에서 OWNER 전용 키(`EVENT_LIFECYCLE`·`EVENT_USER_MANAGE`)만 뺀 것(아래 Follow-up 2026-11-20) |
   | `STAFF` | `EVENT_READ`, `CHECKIN_WRITE`(DEC-071) |

   ~~그 밖의 키(조 편성, 참가자 정보 수정, 연락처 보기, 명단 내려받기, 숙소 배정, 신청서·행사 정보 고치기 등)는 기본으로 주지 않는다. 행사 OWNER가 사람별 `GRANT`로 준다.~~ → Follow-up 2026-11-20: 그 밖의 키는 MANAGER가 기본으로 갖고, STAFF에게는 행사 OWNER가 사람별 `GRANT`로 준다.
2. **바로 적용된다.** 기본값은 저장하지 않고 요청마다 계산한다(DEC-075가 경고한 성질). 배포하는 순간 **모든 행사의 기존 MANAGER**가 `SCHEDULE_WRITE`·`NOTICE_WRITE`를 갖는다. 일정·공지 API는 아직 없으므로(로드맵 트랙 C·D) 지금 열리는 쓰기 경로는 없다. 그 API가 열리면 기존 MANAGER가 바로 쓴다. 이 둘을 이미 개별 `GRANT`로 받은 MANAGER의 행은 그대로 남지만 결과는 같다. 다음 저장 때 서버가 기본값과 겹치는 `GRANT`를 정리한다(`normalize`). 특정 MANAGER에게 막으려면 OWNER가 개별로 뺀다(`REVOKE`).
3. **권한 화면.** 행사 OWNER는 운영 멤버 화면의 운영자 행에서 "권한"을 눌러 그 사람의 권한을 켜고 끈다. 수련회에 쓰는 키만 사람이 읽는 말로 묶어 보인다.

   | 묶음 | 항목 | 키 |
   | --- | --- | --- |
   | 참가자 | 연락처 보기 | `PARTICIPANT_CONTACT_READ` |
   | | 참가자 정보 수정 | `PARTICIPANT_WRITE` |
   | | 명단 내려받기 | `DATA_EXPORT` |
   | 현장 운영 | 조 편성 | `GROUP_WRITE` |
   | | 숙소 배정 | `ROOM_WRITE` |
   | | 체크인 | `CHECKIN_WRITE` |
   | | 준비 업무 | `TASK_WRITE` |
   | 안내 | 일정 쓰기 | `SCHEDULE_WRITE` |
   | | 공지 쓰기 | `NOTICE_WRITE` |
   | 행사 설정 | 신청서 고치기 | `FORM_WRITE` |
   | | 행사 정보 고치기 | `EVENT_UPDATE` |

   - 항목마다 "역할 기본", "개별로 더함", "개별로 뺌"을 구분해 보인다. 운영자 행에는 개별로 더하거나 뺀 수를 보인다.
   - 저장은 지금 overrides를 바탕으로 보이는 항목만 바꿔 `PUT`한다. 화면에 없는 키의 기존 override는 그대로 보낸다.
   - OWNER 행에는 권한 편집이 없다(OWNER는 override하지 않는다). OWNER 전용 키(`EVENT_LIFECYCLE`·`EVENT_USER_MANAGE`)와 뺄 수 없는 `EVENT_READ`는 목록에 넣지 않고 "항상 켜짐/행사 OWNER만"으로 안내한다. 서버 판정(`422`)이 기준이고 화면은 그와 맞춘다(DEC-031).
   - 보관된 행사에서는 켜기(넓히기)를 막고 끄기만 둔다(서버 `409 EVENT_ARCHIVED`와 같은 규칙, DEC-063).
   - 역할을 바꾸면 개별 권한이 초기화된다는 기존 확인 문구는 그대로다.
4. 새 권한 키, 새 ErrorCode, DB 변경은 없다.

### 범위 밖

- 여러 사람에게 한 번에 권한 주기, 권한 묶음(프리셋) 저장
- 운영자 본인이 자기 권한을 보는 화면(서버 경로는 있다)
- 회비·차량·반·미션·보호자 키의 화면 노출(그 기능이 생길 때 같은 표에 더한다)

### Alternatives

- STAFF에도 조 편성 기본: 조 편성은 작업본을 바꾸는 일이라 담당만 하도록 개인별로 둔다.
- ~~MANAGER에 연락처·CSV 기본: 반출·개인정보 범위가 모든 기존 행사에서 바로 넓어져(DEC-054, DEC-075 경고) 채택하지 않았다.~~ → 아래 Follow-up 2026-11-20에서 사용자가 이 영향을 알고 채택했다.
- 권한 키를 모두 보이기: 아직 기능이 없는 키(회비·차량 등)가 섞여 판단이 어렵다. 쓰는 키만 보이고 나머지는 보존한다.

### Reason

수련회 운영진은 사람마다 맡은 일이 다르다(DEC-029). 모두에게 필요한 체크인과, 진행자가 쓰는 일정·공지만 역할로 주고, 개인정보와 작업본을 바꾸는 일은 OWNER가 담당자에게만 준다.

### Consequence

서버 `RoleDefaults`의 MANAGER에 `SCHEDULE_WRITE`·`NOTICE_WRITE`를 더한다. [backend/docs/api.md](../../backend/docs/api.md) "운영자"와 [source-guide](../../backend/docs/source-guide.md#접근과-권한)의 권한 표를 맞춘다. 화면은 `EventOperators`에 권한 편집을 더한다. 확인은 #394(I2), #395(I1).

### Evidence

사용자 결정 2026-11-19(로드맵 결정 7, [#385](https://github.com/BeomhyunPark/SCENE/issues/385)). 근거 결정은 DEC-029, DEC-031, DEC-054, DEC-062, DEC-071, DEC-072, DEC-075다.

### Follow-up (2026-11-20): MANAGER는 OWNER 전용 둘만 빼고 전부를 기본으로 갖는다 (I2)

사용자 결정(2026-11-20): "운영자가 모든 권한을 가져야 편하다. MANAGER에게 전부 준다." 로드맵 트랙 I([#385](https://github.com/BeomhyunPark/SCENE/issues/385)) I2의 Follow-up이다. 위 Decision §1의 표와 "그 밖의 키는 기본으로 주지 않는다", Alternatives의 "MANAGER에 연락처·CSV 기본: 채택하지 않았다"를 바꾼다.

| 행사 역할 | 기본 권한 |
| --- | --- |
| `OWNER` | 등록된 행사 키 전부(바뀌지 않음) |
| `MANAGER` | **등록된 행사 키 전부에서 OWNER 전용 키(`EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`)만 뺀 것** |
| `STAFF` | `EVENT_READ`, `CHECKIN_WRITE`(바뀌지 않음) |

- **이유.** 지금은 조 편성·참가자 수정·취소·연락처 보기·명단 내려받기를 OWNER 한 사람만 할 수 있고, 맡기려면 사람마다 권한 창에서 하나씩 켜야 한다. 교회 운영팀은 서로 아는 몇 명이라 이 구분이 번거롭기만 하다. 믿고 맡길 사람은 MANAGER로 넣으면 끝난다.
- **MANAGER가 못 하는 것.** 행사 시작·종료(`EVENT_LIFECYCLE`)와 운영 멤버 추가·역할 변경·제거·권한 편집(`EVENT_USER_MANAGE`)이다. OWNER 전용 키는 `GRANT`해도 MANAGER에게 적용되지 않는다는 기존 규칙(`422 PERMISSION_OWNER_ONLY`)은 그대로다. Owner 넘기기도 그대로 OWNER만이다.
- **STAFF**는 당일 접수 봉사자처럼 체크인만 하는 사람용으로 그대로 둔다. 사람별 권한 창(§3, #395)은 예외 처리용으로 남는다(예: STAFF 한 명에게 조 편성만 켜기, 특정 MANAGER에게서 명단 내려받기 빼기).
- **계산값이다.** `RoleDefaults`는 MANAGER를 "전체 키 − OWNER 전용 키"로 계산한다. 기본값은 저장하지 않으므로 **배포 즉시 모든 행사의 기존 MANAGER에게 적용된다**(DEC-075가 경고한 성질을 알고 정했다). 앞으로 새 권한 키를 더하면 MANAGER가 자동으로 갖는다. OWNER 전용으로 둘 키라면 `Permission.ownerOnly()`에 함께 더한다.
- **기존 override.** 개별 `REVOKE`가 걸려 있던 MANAGER는 그 `REVOKE`가 그대로 유지된다(그 키는 계속 못 한다). 개별 `GRANT`로 받아 둔 키는 이제 기본값과 겹친다. 행은 남지만 결과는 같고, 다음 저장 때 서버가 정리한다(`normalize`).
- **바뀌는 다른 결정.** DEC-054(`DATA_EXPORT`·`PARTICIPANT_CONTACT_READ`가 MANAGER 기본, #308·#332의 연락처 열람 포함), DEC-072 §7(`GROUP_WRITE`), DEC-075 §3(`PARTICIPANT_WRITE`), DEC-080 결정 대기 1번(신청 변경 알림을 `PARTICIPANT_READ` 보유자가 받으므로 MANAGER도 기본으로 받는다). 각 자리에 메모를 달았다.
- 새 권한 키, 새 ErrorCode, DB 변경은 없다. 확인은 [#385](https://github.com/BeomhyunPark/SCENE/issues/385)의 I2 하위 이슈다.

---

## DEC-080 — 참가자 홈은 다섯 탭과 카드이고, 화면은 가벼운 `updates`로 30초마다 바뀐 카드만 다시 읽으며, 알림은 참가자·운영자가 같은 받는 사람별 목록을 쓴다

**Date:** 2026-11-19

**Status:** CONFIRMED (방향은 사용자 결정 2026-11-19 — 로드맵 6.1 결정 5·9, 시간표 실시간 공개. 세부는 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다. 결정 대기는 아래에 따로 적었다)

### Context

참가자 화면은 이름, 도착 QR, 내 조, 로그아웃뿐이다(`ParticipantEnter`). 2027년 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 일정표(#278)·공지(#380)·조원 명단(#382)·숙소(#383)·식사 순서(#384)를 참가자에게 보여야 하고, 운영자가 고치고 공개하면 참가자 화면이 곧 바뀌어야 한다(사용자 2026-11-19 "시간표 실시간 수정, 배포 가능해야 함"). 지금 갱신은 창을 다시 볼 때 새로 읽기뿐이고 SSE·WebSocket이 없다. 운영자 알림은 `operator_notices` 테이블만 있고 읽는 경로가 없어, 참가자가 신청을 고쳐도 운영자가 알 길이 없다(#385 I3). 홈서버 한 대로 참가자 200명을 받는다.

로드맵(`docs/product/retreat-2027-roadmap.md`, 아직 main에 없음) 3절의 공통 구조 5(카드 단위 조회와 갱신 확인)·6(받는 사람별 알림)·8(기능 영역)을 이 결정이 계약으로 만든다. 2주차(11/26~)에 여러 세션이 이 계약으로 서버(B2)·화면(B3·B4)·운영자 알림(I3)을 동시에 만든다. 하위 이슈는 [#396](https://github.com/BeomhyunPark/SCENE/issues/396)이다.

### Decision

1. **하단 탭은 홈·일정·공지·내 조·내 정보 다섯 개다.** 홈 카드는 행사 머리(이름·기간·장소·완료 안내), 지금·다음 일정, 최신 공지, 도착 QR, 내 조, 숙소, 다음 식사 순이다. 알림함은 탭이 아니라 위쪽 버튼이다.
2. **행사가 켠 영역만 탭·카드로 보인다.** 영역은 `schedule`·`notices`·`groups`·`rooms`·`mealOrder`다. 도착 QR과 내 정보는 늘 있다. 켬 여부는 서버가 정한다: 운영자가 저장한 값(I5) → 없으면 행사 유형 기본값(`RETREAT`·`CAMP`는 모두, 나머지는 일정·공지) → 공개본이 있는 영역은 늘 켬. 켰지만 공개된 것이 없으면 빈 상태 문구를 보인다.
3. **카드마다 조회 경로가 따로 있다.** `GET /participant/home`은 행사 정보·`features`·처음 `updates` 값만 주고 카드 내용은 각 경로(`schedule`, `notices`, `check-in`, `group`, 숙소·식사 순서는 G1·H1)가 준다.
4. **`GET /participant/updates`는 카드별 값만 준다.** 행사 범위 값(`home`·`schedule`·`notices`·`group`·`rooms`·`mealOrder`)은 행사당 한 행인 `participant_feed_versions`에서, 참가자 범위 값(`checkIn`·`application`·알림 최신 `seq`·읽지 않은 수)은 색인 한 번씩으로 읽는다. 공개본이나 목록을 읽지 않는다. 각 공개 경로는 같은 트랜잭션에서 해당 값을 올린다. 화면은 값이 **다르면** 그 카드만 다시 읽는다.
5. **갱신은 화면이 보일 때만, 30초 안팎이다.** 서버가 `pollAfterSeconds`(시작 30, 설정으로 10–300)를 주고 화면은 ±20% 무작위로 부른다. 숨겨지면 멈추고 다시 보이면 바로 부른다. 실패하면 간격을 두 배로(최대 300초) 늘리고 마지막 갱신 시각을 보인다. `401`이면 들어오기 화면으로 간다.
6. **알림은 받는 사람별 목록이고 참가자·운영자가 한 테이블(`notifications`)·한 모양(종류, 가리키는 대상, 제목·짧은 본문, 시각, 읽음, 합친 수)을 쓴다.** 받는 사람은 만드는 순간 정하고, 만든 사람 자신은 빼고, 같은 종류·대상의 읽지 않은 알림은 한 줄로 합친다. 알림 문구에는 받는 사람이 그 화면에서 볼 수 있는 정보만 넣는다(참가자 알림에 다른 참가자의 이름·전화·답이 없다. 운영자 알림은 이름과 바뀐 질문 제목까지).
7. **`operator_notices`는 `notifications`로 옮기고 지운다.** 기존 행은 읽은 상태로 옮긴다. I3가 신청 수정·재신청·취소 알림을 같은 테이블에 쌓는다.
8. **대상(audience)은 `[{type, ids?}]` 목록이다.** 1월에는 한 항목에 `ALL`·`LEADERS`·`STAFF`만 쓴다. 조장 판정은 가장 최근 조 편성 공개본으로 읽을 때마다 한다. 공지(DEC-082)와 일정 항목(DEC-081)이 같은 모양과 같은 판정 함수를 쓴다.
9. 1차에는 SSE·WebSocket·웹 푸시·`ETag`를 쓰지 않는다. 새 ErrorCode는 없다.

경로·응답 예시·테이블 초안·시험 조건은 [참가자 홈·갱신 확인·알림 계약 초안](../architecture/participant-home-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 신청 수정·재신청·취소 알림을 누가 받나 | 유효한 `PARTICIPANT_READ` 보유자 / 행사 운영자 전원 / 행사 OWNER만 | `PARTICIPANT_READ` 보유자(#385 추천안). 1월 기본값으로는 OWNER이고 개인별 GRANT로 넓힌다 | 기본값만으로는 OWNER만 받는다. MANAGER도 받게 하려면 I2에서 MANAGER 기본값에 `PARTICIPANT_READ`를 넣거나 개별 GRANT한다. (2026-11-20 → [DEC-079 Follow-up 2026-11-20](#follow-up-2026-11-20-manager는-owner-전용-둘만-빼고-전부를-기본으로-갖는다-i2): MANAGER 기본값에 `PARTICIPANT_READ`가 들어가 OWNER와 MANAGER가 기본으로 받는다. STAFF는 개별 GRANT로 받고, MANAGER도 개별 `REVOKE`하면 받지 않는다) |
| 2 | 행사 유형 기본 영역 | 유형별 기본값 / 모든 행사에 다섯 영역 / 운영자가 켤 때까지 모두 끔 | 유형별 기본값(`RETREAT`·`CAMP`는 모두) | 수련회 행사는 공개 전에도 탭과 빈 카드가 보인다 |

### 범위 밖

- SSE·WebSocket·웹 푸시(D7, P2)·알림톡·문자. 전달 기록 테이블은 만들지 않는다.
- 오프라인 보기와 홈 화면 추가(B6, P1)
- 여러 행사를 모은 운영자 알림 목록, 공간 단위 알림(초대 수락·Owner 넘기기, #279)
- 알림 설정(종류별로 끄기)

### Alternatives

- **홈 한 경로가 모든 카드 내용을 준다:** 한 카드만 바뀌어도 전부 다시 읽고, 카드가 늘 때마다 홈 응답이 커진다. 카드별 경로는 이미 `check-in`·`group`이 쓰는 방식이다.
- **SSE·WebSocket:** 홈서버·Cloudflare Tunnel에서 연결 200개를 오래 붙잡고, 휴대폰이 잠들면 끊긴다. 30초 확인으로 사용자 요구("30초 안")를 채운다. `updates` 계약이 바뀐 카드를 알려 주는 신호이므로 나중에 SSE로 바꿔도 카드 계약은 그대로다.
- **`updates`가 공개본·목록의 최신 시각을 매번 계산:** 테이블마다 집계해 요청이 비싸진다. 공개할 때 한 행을 올리는 편이 읽기 비용이 상수다.
- **대상별로 나눈 공지 값(조장 공지는 조장에게만 오름):** 요청마다 조장 여부를 공개본에서 읽어야 한다. 모두에게 올라도 새 항목이 없을 뿐이라 드러나는 정보가 없다.
- **알림을 행사 단위 한 줄 + 사람별 읽음 표:** 조 공개처럼 일부 사람에게만 가는 알림을 표현하기 어렵다. 200명 × 수십 건은 받는 사람별 행으로 충분히 작다.
- **운영자 알림과 참가자 알림을 다른 테이블로:** 모양이 같은데 코드와 전달 채널을 두 번 만든다.
- **화면을 매 30초 전체 새로 읽기:** 카드 6개 × 200명 = 초당 40건이고, 공개본 조회가 매번 일어난다.

### Reason

"운영자가 공개하면 30초 안에 참가자 화면이 바뀐다"를 가장 싼 요청 하나와 기존 카드 경로로 채운다. 신호(`updates`)와 내용(카드 경로)을 나눠서, 나중에 신호만 SSE·웹 푸시로 바꿀 수 있다. 알림은 받는 사람별 목록 하나로 두어 참가자 알림함(B5)과 운영자 알림(I3)을 같은 코드로 만들고, 전달 채널은 그 행에 붙인다.

### Consequence

- 서버(B2): `GET /participant/home`, `GET /participant/updates`, `participant_feed_versions`, `ParticipantAudience`. 조 편성 공개(`GroupPublicationService`)가 같은 트랜잭션에서 `groups` 값을 올리고, 공개로 조·조장이 바뀐 참가자에게 `GROUP_PUBLISHED` 알림을 만든다(B5에서). 체크인은 `checkin_logs.seq`를 그대로 쓰므로 바뀌지 않는다.
- 서버(I3): `notifications` 테이블과 `operator_notices` 이전, 운영자 알림 목록·읽음·`GET …/events/{eventId}/updates`. 신청 수정(A4)·취소(A7) 경로가 알림을 만든다.
- 화면(B3·B4): 하단 탭과 카드, 보일 때만 도는 확인 주기. 화면은 `features`와 `updates`만 보고 탭·카드를 정한다.
- DEC-072 범위 밖의 "공개 알림 전달(DEC-042)"은 이 결정으로 화면 안 알림까지 범위에 들어온다. 문자·알림톡은 여전히 밖이다.
- 부하 확인(J6)은 `updates`를 초당 7건 이상으로 걸어 응답 시간과 `pollAfterSeconds`를 정한다.
- **확장 지점:** (1) `updates`의 값을 SSE 이벤트나 웹 푸시의 "다시 읽어라" 신호로 보낸다. 카드 경로와 값의 뜻은 바뀌지 않는다. (2) 전달 채널은 `notification_deliveries(notification_id, channel, status, attempts, sent_at)`를 알림 행에 붙여 더한다. 공지·일정 쪽은 바꾸지 않는다. (3) 새 카드는 `features`와 `updates`에 키 하나씩, 새 알림은 `kind` 하나씩 더한다. 화면은 모르는 키·종류를 무시한다. (4) 대상에 `GROUP`·`ROOM`·`ROLE`을 `ids`와 함께 더한다. 모르는 `type`은 "보이지 않음"이다. (5) 행사 유형 기본값은 I5의 `event_features`가 덮어쓴다. 다른 유형의 행사도 필요한 영역만 켠다. (6) 행사 시간대 열이 생기면 `event.timeZone`이 그 값을 낸다.

### Evidence

사용자 결정 2026-11-19(로드맵 6.1 결정 5 "참가자가 화면 안에서 알림을 본다", 결정 9 "고치면 운영자에게 알림", 시간표 실시간 공개). 근거 자료는 로드맵(`docs/product/retreat-2027-roadmap.md`) 3절·트랙 B·I, #379, #385, DEC-011(참가자 경험), DEC-042·043, DEC-071(참가자 QR), DEC-072(공개본), api.md "체크인"·"조 편성"·"`operator_notices`", 마이그레이션 V1(`operator_notices`)·V12·V14.


### Follow-up (2026-11-20, #423)

B2 서버를 만들며 계약 초안과 다르게 정하거나 초안이 열어 둔 것을 정했다. 계약은 [api.md "참가자 홈·갱신 확인·알림"](../../backend/docs/api.md#참가자-홈갱신-확인알림)으로 옮겼다.

1. **완료 안내는 `completionNotice` 문자열(또는 `null`)이다.** 초안 §3의 `completionMessage: { text, updatedAt }`가 아니다. `forms.completion_notice`는 `text` 열 하나이고 수정 시각 열이 없으며, 행사당 신청서는 하나다(`forms_one_per_event`). 이미 구현·화면에서 쓰는 #413(A8) 모양을 따른다. 바뀌면 `updates.home`이 오른다.
2. **`applicationStatus: NONE`은 지금 `SUBMITTED` 신청이 없다는 뜻이다.** 신청 취소(A7)가 세션을 끊으면 `401`이 먼저다. 끊지 않아도 취소된 사람은 활성 참가자가 아니므로 `ALL`·`LEADERS` 대상 항목을 보지 못하고 받는 사람에서도 빠진다(`ParticipantAudience`는 `ALL`도 활성 참가자로 판정한다). 활성의 기준은 조 편성·체크인 명단과 같은 "`SUBMITTED` 신청이 있음"이라, A7이 상태를 `WITHDRAWN`으로 바꾸면 저절로 빠진다.
3. **`features` 3번(공개본이 있으면 켬)은 `participant_feed_versions`의 값이 0보다 큰지로 본다.** 테이블마다 공개본을 세지 않는다. 일정·공지·숙소·식사가 값을 올리기만 하면 저절로 켜지고, `home` 요청이 영역 수만큼 늘지 않는다. 그래서 V20은 이미 조 편성 공개본이 있는 행사의 `groups`를 공개본 수로 채운다. 한계: 공지는 발행 뒤 보관해도 값이 0으로 돌아가지 않으므로 영역이 켜진 채로 남는다(초안의 "공개한 내용이 사라지지 않게"와 같은 방향).
4. **`home`이 오르는 때는 지금 서버에서 이름 변경·상태 전이·완료 안내 저장이다.** 행사 기간·장소를 고치는 경로가 아직 없다(`PATCH`는 이름만). 그 경로를 만들 때 같은 `bump(…, HOME)`를 부른다. 같은 이름으로 다시 저장해도 오른다(화면이 한 번 더 읽을 뿐이다). `ALREADY_IN_STATE`는 오르지 않는다.
5. **`updates` 한 요청은 SQL 네 문장이다**(세션 확인, `participant_feed_versions` 기본 키, 알림 요약 한 문장, 내 체크인 최대 `seq`·최대 신청 `revision` 한 문장). `application` 값은 그 참가자의 최대 `revision`이다.
6. **`scene.participant.poll-after-seconds`가 10–300 밖이면 가까운 끝으로 맞춘다.** 배포 동결 중 `.env` 오타로 서버가 뜨지 못하는 것보다 낫다고 봤다.
7. **읽음 처리 본문에 키가 없거나 둘 이상이면 필드 `body`다.** 다른 키나 잘못된 값은 그 키가 필드다.
8. **알림 문구 길이:** 서버가 만드는 문구라 `title` 80자·`body` 200자를 넘으면 오류 대신 잘라 넣는다(긴 공지 제목이 발행을 실패시키지 않게). 같은 받는 사람·종류·대상에 두 공개가 같은 순간 겹치면 읽지 않은 행이 둘 남을 수 있다. 공개 경로는 행사 행을 잠그므로 실제로는 일어나지 않는다.
9. **알림·갱신 값은 모두 DB에 있다.** 서버 메모리에 두는 상태가 없어 재시작으로 사라지는 것이 없다. 참가자 조회 경로에는 IP 제한을 두지 않았다(서버·nginx·Cloudflare 규칙 모두 참가자 GET을 세지 않는다).


### Follow-up (2026-11-20, 식사 순서 보류)

사용자가 식사 순서를 2027년 1월 범위에서 뺐다(DEC-086 Follow-up, 로드맵 6.1 결정 14). 이 절에서 바뀌는 것만 적는다.

1. **홈 카드에 "다음 식사"를 만들지 않는다**(Decision 1). 1월 홈 카드는 행사 머리, 지금·다음 일정, 최신 공지, 도착 QR, 내 조, 숙소다.
2. **`features.mealOrder`는 행사 유형 기본값으로 켜지지 않는다**(Decision 2). `RETREAT`·`CAMP`의 기본값은 `groups`·`rooms`까지다. "값이 0보다 크면 켬"(Follow-up #423의 3번)은 남지만 1월에는 올리는 경로가 없어 늘 `false`다. 서버 `ParticipantFeatures.of`를 이렇게 고쳤다.
3. **응답 키는 그대로다.** `features.mealOrder`·`updates.mealOrder`와 `participant_feed_versions.meal_order` 열을 지우지 않는다(추가만 하는 원칙, 화면 호환). 화면은 1월에 이 키를 쓰지 않는다.
---

## DEC-081 — 일정표는 조 편성과 같은 작업본·공개본 계약을 쓰고, 운영자는 항목 하나를 "저장하고 바로 공개"하며, 참가자는 24시간 동안 "변경됨"을 본다

**Date:** 2026-11-19

**Status:** CONFIRMED (실시간 수정·공개는 사용자 결정 2026-11-19. 세부는 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다)

### Context

메뉴 "일정"은 "준비 중"이고 서버에 일정 테이블·API가 없다. 권한 키 `SCHEDULE_WRITE`와 Figma P06 프레임, API 초안 §9(`/schedules` + publish/cancel, 상태 `DRAFT/PUBLISHED/CANCELLED`)만 있다. #269는 행사 일정표를 1차 범위 밖으로 뒀지만, 사용자가 2026-11-19 수련회에서 중요한 일로 "시간표(실시간 수정, 배포 가능해야 함)"를 꼽아 범위에 들어왔다([#278](https://github.com/BeomhyunPark/SCENE/issues/278) 2026-11-19 댓글). 로드맵은 "실시간"을 "운영자가 휴대폰에서 고쳐 '저장하고 바로 공개'하면 참가자 화면이 30초 안에 바뀐다"로 잡았다(DEC-080 `updates`). 현장에서는 시각·장소가 자주 바뀌고, 여러 운영자가 같은 일정표를 만진다. 하위 이슈는 [#398](https://github.com/BeomhyunPark/SCENE/issues/398)이다.

### Decision

1. 🔒 **항목 단위 작업본과 행사 단위 공개 스냅샷이다(DEC-072와 같은 계약 모양).** 작업본은 `schedule_items`(항목 행)이고, 공개하면 `schedule_publications`에 작업본 전체를 JSON 한 행으로 찍는다. 참가자는 가장 최근 공개본만 본다. API 초안 §9의 항목별 publish/cancel과 항목 상태는 쓰지 않는다. 지우기는 작업본에서 지우고 다음 공개에 반영한다.
2. **항목 필드:** 일차(`day`, 1부터, 저장 기준), 시작 시각(필수)·끝 시각(선택, 시작보다 이르면 다음 날 끝남), 제목, 장소, 설명(일반 글), 분류(`WORSHIP`·`MEAL`·`PROGRAM`·`GROUP`·`FREE`·`MOVE`·`OTHER`), 대상(DEC-080 공통 모양, `ALL`·`LEADERS`·`STAFF`), 칸 id(`opt_d{일차}_{breakfast|lunch|dinner|worship}`, 일차·분류가 맞아야 하고 한 일정표에 한 항목). 순서는 일차 → 시작 시각 → 같은 시각 안의 `sortOrder`다.
3. **시간대는 Asia/Seoul이다.** 시각은 `HH:mm` 현지 값으로 저장하고, 응답에 `+09:00` 시각(`startsAt`·`endsAt`)을 함께 준다(DEC-068 날짜·시간과 같다). 행사에 기간이 없으면 일정을 만들 수 없다.
4. **버전.** 행사당 `boardVersion`(작업본이 바뀔 때 +1, 공개는 올리지 않음)과 항목 `version`. 고치기·지우기는 `expectedVersion`, 공개는 `expectedBoardVersion`이고 다르면 `409 CONCURRENT_MODIFICATION`과 지금 값이다. 서로 다른 항목은 충돌하지 않는다. 같은 공개를 다시 보내면 `ALREADY_PUBLISHED`이고 `Idempotency-Key`는 쓰지 않는다(DEC-046·047).
5. **저장하고 바로 공개.** 항목 만들기·고치기·지우기에 `publish: true`를 붙이면 저장과 공개를 한 트랜잭션에서 한다. 이 저장을 뺀 다른 미공개 변경이 있으면 `409 CONFIRMATION_REQUIRED`와 그 목록을 돌려주고, 운영자가 확인(`confirmOtherChanges: true`)해야 함께 공개한다. 항목 하나만 공개하는 길은 두지 않는다.
6. **공개 결과에 바뀐 항목 요약**(추가·변경(바뀐 필드)·삭제)을 담는다. 공개 때 항목마다 `change`(종류, 공개 시각, 바뀐 필드, 일차·시각·장소의 이전 값)를 스냅샷에 저장한다. **참가자 화면은 `changedAt`이 24시간 안인 항목에 "변경됨"과 이전 값을, 24시간 안에 지워진 항목을 "취소됨"으로 보인다.** 첫 공개는 표시하지 않는다.
7. **알림.** 첫 공개는 참가자 전원에게 "일정표가 올라왔어요". 그 뒤 공개는 기본으로 바뀐 항목을 볼 수 있는 참가자에게 `SCHEDULE_CHANGED` 한 줄(합침)을 만들고, 운영자가 공개할 때 `notify: false`로 끌 수 있다(오타 수정 등). 알림을 꺼도 화면은 30초 안에 바뀌고 "변경됨"도 붙는다.
8. **권한.** 쓰기·공개는 `SCHEDULE_WRITE`(OWNER 기본, I2가 MANAGER에 더한다). 작업본·공개본 조회는 `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 작업본에 개인정보가 없어 조 편성처럼 업무 권한으로 좁히지 않는다. 새 권한 키는 없다.
9. **행사 상태.** `DRAFT`·`ACTIVE`에서 쓰고 공개한다. `ENDED`는 `409 EVENT_ENDED`(DEC-051 현장 일정 운영 차단), `ARCHIVED`는 `409 EVENT_ARCHIVED`. 참가자는 어느 상태에서나 마지막 공개본을 본다.
10. **기록.** 공개마다 audit `SCHEDULE_PUBLISHED`(개수만). 항목 편집은 audit·이력을 남기지 않고 공개 스냅샷이 기록이다. 새 ErrorCode는 없다.

경로·요청·응답·오류·테이블 초안·시험 조건은 [일정표 계약 초안](../architecture/schedule-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 일정 변경 공개 때 참가자 알림 기본값 | 켬(끌 수 있음) / 끔(켤 수 있음) / 늘 켬 | 켬, 공개할 때 끌 수 있음 | 시간 변경이 알림함에 남는다. 잦은 공개는 읽지 않은 한 줄로 합쳐진다 |
| 2 | "변경됨" 표시 기간 | 24시간 / 다음 공개까지 / 참가자가 볼 때까지 | 24시간 | 서버가 사람별 읽음을 저장하지 않아도 된다. 하루 지난 변경은 표시가 사라진다 |

### 범위 밖

- 신청서 설정의 칸으로 초안 채우기(C6, P1), 공개 때 공지 초안 만들기(C7, P2), 운영진 전용 항목의 담당자·준비물 칸(C8, P2. 대상 `STAFF`는 지금 받는다)
- 조직 달력(여러 행사), 반복 일정, 일정 첨부 파일
- 항목 하나만 공개하기, 예약 공개, 공개 취소
- 작업본 편집 이력과 되돌리기 화면

### Alternatives

- **항목마다 publish/cancel(API 초안 §9):** 여러 항목을 바꾸는 동안 중간 상태가 참가자에게 보이고(DEC-040과 어긋난다), 공개 기록과 "바뀐 것 요약"을 항목마다 따로 모아야 한다.
- **저장이 곧 공개:** 가장 빠르지만 여러 줄을 정리하는 동안 반쯤 고친 일정이 나간다. 저장하고 바로 공개로 같은 속도를 얻고 큰 정리는 작업본에서 한다.
- **저장하고 바로 공개가 다른 사람의 미공개 변경을 조용히 함께 공개:** 다른 운영자의 정리 중인 변경이 모르게 나간다. 확인을 받는다.
- **날짜(`date`)를 저장 기준으로:** 행사 기간을 옮기면 항목이 기간 밖으로 밀린다. 칸 id(`opt_d{일차}`)도 일차 기준이라 맞춘다.
- **변경 표시를 사람별 "읽음"으로:** 정확하지만 참가자별 저장이 필요하고 1월 규모에서 24시간 규칙으로 충분하다.
- **작업본 조회를 `SCHEDULE_WRITE`로 제한:** 일정에는 개인정보가 없고, 현장 STAFF가 곧 바뀔 일정을 미리 봐야 한다.

### Reason

현장에서 "휴대폰으로 고쳐 바로 내보내기"와 "여러 사람이 정리하는 동안 참가자에게 중간 상태를 보이지 않기"를 함께 채운다. 조 편성과 같은 계약 모양이라 서버·화면 코드와 운영자의 이해를 다시 쓸 수 있다. 칸 id로 신청서·식수·식사 순서와 잇는다.

### Consequence

- 서버(C2·C3): Flyway `schedule_boards`·`schedule_items`·`schedule_publications`, `ScheduleController`·`ParticipantScheduleController`. 공개는 같은 트랜잭션에서 DEC-080 `participant_feed_versions.schedule`을 올리고 알림을 만든다. 칸 정의는 편성판의 `MealSlots`를 쓴다.
- 화면(C4·C5): 운영자 일차별 편집과 휴대폰 "저장하고 바로 공개"(다른 미공개 변경 확인 창 포함), 참가자 일차 탭·지금·다음·변경됨·취소됨·마지막 갱신. 홈의 "지금·다음 일정"은 DEC-080 §6대로 화면이 계산한다.
- API 초안 §9의 Schedule 부분은 이 결정으로 대신한다(상태 `DRAFT/PUBLISHED/CANCELLED`, 항목별 publish/cancel을 쓰지 않는다).
- #269와 [operator-sidebar-menus-review](operator-sidebar-menus-review.md)의 "일정은 1차 범위 밖"은 이 결정으로 바뀐다. 메뉴 연결은 I5다.
- **확장 지점:** (1) 조직 달력은 여러 행사의 공개본을 읽는 다른 화면이다. 항목 모양은 그대로다. (2) 칸 id로 식수 현황(E3)·식사 순서(H1, 다음 식사 카드)·나중의 끼니별 체크(구조 7)가 항목의 시각·장소를 찾는다. 선택 강의 같은 새 칸은 칸 id 규칙만 늘린다. (3) 대상에 `GROUP`·`ROOM`(조별 모임 장소 등)을 더한다. (4) 공개 때 공지 초안(C7)과 웹 푸시는 공개 결과의 `changes`를 그대로 쓴다. (5) 행사 시간대 열이 생기면 `Asia/Seoul` 자리에 그 값을 쓴다. (6) 담당자·준비물(C8)은 항목에 운영진 전용 열을 더하고 참가자 응답에는 넣지 않는다.

### Evidence

사용자 결정 2026-11-19([#278 댓글](https://github.com/BeomhyunPark/SCENE/issues/278#issuecomment-7000830891), 로드맵 트랙 C). 근거 자료는 DEC-040·043·046·047·048·051, DEC-068(날짜·시간), DEC-070·073·074(칸 id), DEC-072(작업본·공개본 계약), DEC-080, API 초안 §9, api.md "조 편성", 마이그레이션 V13·V14.


### Follow-up (2026-11-20, #435)

C2·C3 서버를 만들며 계약 초안과 다르게 정하거나 초안이 열어 둔 것을 정했다. 경로·응답은 [api.md "일정표"](../../backend/docs/api.md#일정표)로 옮겼고, [계약 초안](../architecture/schedule-contract.md)에는 화면 규칙만 남겼다. 새 ErrorCode·권한 키는 없다. 마이그레이션은 `V23__schedule.sql`(추가만, 병합 때 번호를 맞춘다).

1. **신청이 없는(취소된) 참가자는 일정을 보지 않는다.** 초안 §8의 "신청 상태는 보지 않는다"를 바꾼다. `ParticipantAudience`는 `ALL`도 활성 참가자(`SUBMITTED` 신청이 있음)로 판정하고(DEC-080 Follow-up 2번), 사용자 기준도 "취소된 사람은 새 기능에서 빠진다"다. DEC-084 §4로 취소된 사람의 세션은 조회에서 끊겨 `401`이 먼저다. 그래도 신청을 먼저 보는 안전장치로 `status: NOT_ELIGIBLE`, `items: []`를 두었다(내 조 `GET /participant/group`의 `NOT_ELIGIBLE`과 같은 모양). 알림 받는 사람에서도 빠진다.
2. **알림의 `target`은 `{ "type": "SCHEDULE", "id": null }`이다.** 일정은 행사에 하나라 id가 없다. 합치기는 `target_id IS NOT DISTINCT FROM`이라 그대로 된다. 대상으로 읽음 처리하도록 `POST …/notifications/read`의 `target.id`에 명시적 `null`을 받게 했다(공용 코드 `NotificationReadRequest`·`NotificationMapper.markRead`의 작은 변경. `id` 키가 빠지면 지금처럼 `400`).
3. **받는 사람.** 첫 공개(`SCHEDULE_PUBLISHED`)는 초안의 "활성 참가자 전원"이 아니라 **항목을 하나라도 볼 수 있는** 활성 참가자다(`ALL` 항목이 있으면 전원, `LEADERS` 항목만 있으면 조장, `STAFF`만 있으면 없음). 그 뒤 공개(`SCHEDULE_CHANGED`)는 추가·변경·삭제된 항목을 **바뀌기 전이나 뒤에** 볼 수 있던 활성 참가자다(대상이 `ALL`→`STAFF`로 바뀐 항목도 참가자에게는 사라진 것이라 알린다).
4. **`notify: false`는 첫 공개의 알림도 끈다.** 초안은 첫 공개 알림을 `notify`와 상관없이 적었다. 운영자가 "알리지 않음"을 고르면 그대로 따른다(결정 대기 1).
5. **문구.** 제목 "일정표가 올라왔어요"(본문 없음) / "일정이 바뀌었어요", 본문은 바뀐 항목 제목 최대 셋을 쉼표로 잇고 넘치면 " 외 N건"(예: "오전 집회, 레크리에이션, 산책 외 2건"). 일정 제목만 넣는다. 조장의 본문에는 `LEADERS` 항목 제목도 들어가므로 공개 한 번에 알림 문장이 많아야 두 개(조장, 나머지)다. 200명도 문장 두 개다.
6. **변경 표시를 24시간 안에서 합친다.** 초안은 "직전 공개본과 비교해 저장"만 적었다. 그러면 10분 간격 두 번의 공개에서 첫 변경(시각)이 사라진다. 그래서 24시간 안의 표시가 있으면 `fields`를 합치고 `previous`는 처음 값을 지키며, 처음 값으로 되돌아간 `day`·`startTime`·`endTime`·`place`는 빠진다(모두 빠지면 표시 없음). `ADDED` 항목은 24시간 안에 고쳐도 `ADDED`이고 `changedAt`이 새 공개 시각이 된다. `ADDED`의 `fields`는 `[]`, `previous`는 `null`이다.
7. **24시간 판정은 서버가 한다.** 참가자·운영자 공개본 응답은 24시간이 지난 `change`를 `null`로, 지난 `removedItems`를 빼고 준다. 화면은 받은 대로 보이면 된다. 응답에 `serverTime`을 더했다.
8. **응답에 더한 키.** 운영자 작업본: `startDate`·`endDate`·`timeZone`, 항목 `leadersOnly`, `slots[]`의 `date`·`dayLabel`·`sortOrder`(편성판 `slots`와 같은 모양에 `linkedItemId`). 공개본 조회: `status`·`publishedByDisplayName`·`boardVersion`·`serverTime`, 항목 `leadersOnly`·`change`, `removedItems[].audience`·`date`. 참가자: `serverTime`, `removedItems[].date`, 항목 `sortOrder`.
9. **작은 규칙.** 공개한 적이 없으면 `hasUnpublishedChanges: true`다(첫 공개는 항목이 없어도 된다). `PATCH`로 일차·시작 시각을 바꾸고 `sortOrder`를 보내지 않으면 새 시각의 맨 뒤로 간다. 행사 기간이 없어도 `PATCH`(일차를 보내지 않을 때)·`DELETE`는 된다. 공개의 기간 확인은 `ALREADY_PUBLISHED` 다음이다. 일차 범위처럼 행사를 봐야 아는 `400`은 행사 상태 `409` 뒤에 나온다. `DELETE`의 `publish`·`confirmOtherChanges`·`notify` 쿼리는 `true`·`false`만 받는다.
10. **한계.** 대상이 `ALL`→`STAFF`로 바뀐 항목은 참가자 목록에서 그냥 사라지고 "취소됨"으로 보이지 않는다(알림은 간다, 3번).
11. **비용.** 참가자 `GET /participant/schedule` 한 요청은 SQL 세 문장(세션, 활성·조장 판정, 행사 기간과 최근 공개 한 행)이고 작업본을 읽지 않는다. 200명 × 60항목에서 공개는 수십 ms, 200명이 한꺼번에 읽어도 1초 안이었다(`ParticipantScheduleCostIT`, 로컬 Testcontainers). 상태는 모두 DB에 있고 서버 메모리에 두는 것이 없다. 참가자 조회 경로에는 IP 제한이 없다.

#### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 첫 공개에서 `notify: false`를 따르나 | 따른다 / 첫 공개는 늘 알린다 | 따른다 | 운영자가 끄면 "일정표가 올라왔어요"도 없다. 참가자 화면은 그래도 30초 안에 바뀐다 |
| 2 | 24시간 안의 연속 변경 표시 | 합친다 / 마지막 공개만 | 합친다 | "09:00 → 10:00"처럼 처음 값이 남는다. 되돌리면 표시가 사라진다 |

---

## DEC-082 — 공지는 DRAFT·PUBLISHED·ARCHIVED이고, 대상은 전체·조장·운영진이며, 참가자는 화면 안 알림으로 받고 전달 채널은 알림 행에 나중에 붙인다

**Date:** 2026-11-19

**Status:** CONFIRMED (화면 안 알림·대상 셋·문자 범위 밖·웹 푸시 P2는 사용자 결정 2026-11-19. 세부는 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다)

### Context

공지는 권한 키 `NOTICE_WRITE`만 있고 테이블·API·화면이 없다. 메뉴 "안내"·"알림"은 "준비 중"이다(#270, #271). API 초안 §9는 Notice 상태를 `DRAFT / PUBLISHED / ARCHIVED`로 적었지만 대상 모델(Role/Group)은 "선행 설계하지 않는다"고 남겼고, DEC-030은 "공지 대상의 접근 경계"를 따로 검토한다고 했다. 사용자는 2026-11-19 "행사 운영자 공지"를 수련회의 중요한 일로 꼽았고, 전달은 참가자가 화면 안에서 알림을 보는 것으로 정했다([#380 댓글](https://github.com/BeomhyunPark/SCENE/issues/380#issuecomment-7002382622)). 대상은 전체·조장·운영진이고 문자·알림톡은 범위 밖, 웹 푸시는 P2다. 하위 이슈는 [#400](https://github.com/BeomhyunPark/SCENE/issues/400)이다.

### Decision

1. **필드는 제목(1–100자), 본문(1–5,000자 일반 글), 중요, 고정, 대상이다.** 본문은 HTML·마크다운을 해석하지 않는다.
2. **상태는 `DRAFT`·`PUBLISHED`·`ARCHIVED`이고 명령은 발행·보관·보관 해제다.** `DRAFT`만 지운다. 보관 해제는 한 번이라도 발행했으면 `PUBLISHED`, 아니면 `DRAFT`로 돌아간다. 같은 상태로 가는 명령은 `200 ALREADY_…`다. 동시 수정은 공지 `expectedVersion`이다.
3. **발행 뒤에도 고친다.** 내용을 고치면 `editedAt`이 남고 참가자에게 "수정됨"이 보인다. 순서 기준(`publishedAt`)은 그대로다. 다시 알림은 운영자가 고를 때만(`notify: true`) 보낸다. 이전 본문은 저장하지 않는다.
4. **대상은 DEC-080의 공통 모양(`[{type, ids?}]`, `jsonb`)이다.** 1월에는 `ALL`·`LEADERS`·`STAFF` 중 하나다. 참가자 쪽 판정은 읽을 때마다 조 편성 공개본으로 한다. 보이지 않는 공지의 상세는 모두 `404`다.
5. **운영진 공지는 운영자 화면에서 본다.** 운영자 행사 홈의 "운영진 공지" 카드(대상 `STAFF`인 발행 공지 3건)와 운영자 알림 `STAFF_NOTICE_PUBLISHED`(작성자 뺀 활성 운영자)다. 참가자 경로에는 어떤 방식으로도 나오지 않는다.
6. **참가자 조회는 `GET /participant/notices`(목록, 고정 먼저)와 상세다.** 목록의 "새 공지"는 그 공지를 가리키는 내 알림이 읽지 않은 상태인지로 정한다. 상세를 열면 화면이 그 대상의 알림을 읽음으로 한다.
7. **갱신과 알림.** 참가자에게 보이는 공지가 발행·수정·보관·고정 변경되면 같은 트랜잭션에서 `participant_feed_versions.notices`를 올리고, 발행이면 대상의 활성 참가자에게 `NOTICE_PUBLISHED`를 만든다. 받는 사람은 발행 순간에 정한다.
8. **고정 공지는 행사당 3개까지**(잠정)이고 넘으면 `409 CONFLICT PIN_LIMIT`이다. 보관하면 고정이 풀린다.
9. **전달 기록은 공지가 아니라 알림 행에 붙인다.** 1월의 기록은 `notifications` 행 자체다. 웹 푸시·알림톡·문자는 DEC-080의 `notification_deliveries`로 더한다. 공지에는 전달 열을 두지 않는다.
10. **권한.** 쓰기는 `NOTICE_WRITE`(OWNER 기본, I2가 MANAGER에 더한다), 운영자 조회는 `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 새 키는 없다.
11. **행사 상태.** `DRAFT`·`ACTIVE`·`ENDED`에서 쓴다(ENDED의 후속 공지, DEC-051). `ARCHIVED`는 `409 EVENT_ARCHIVED`. 참가자는 어느 상태에서나 발행본을 본다.
12. **기록.** audit `NOTICE_PUBLISHED`·`NOTICE_UPDATED`(발행된 공지 수정)·`NOTICE_ARCHIVED`·`NOTICE_UNARCHIVED`. 제목·본문은 audit·로그에 넣지 않는다. 새 ErrorCode는 없다.

경로·요청·응답·오류·테이블 초안·시험 조건은 [공지 계약 초안](../architecture/notice-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 발행된 공지를 고칠 때 다시 알림 | 운영자가 고를 때만 / 늘 / 안 함 | 운영자가 고를 때만(기본 끔) | 오타 수정이 알림을 만들지 않는다. 중요한 정정은 다시 알린다 |
| 2 | 고정 공지 수 | 3개 / 1개 / 제한 없음 | 3개(잠정) | 홈 카드와 목록 위쪽이 고정 공지로 가득 차지 않는다 |

### 범위 밖

- 참가자별 읽음 수(D6, P2. 알림 행의 `read_at`을 세면 된다), 웹 푸시(D7, P2), 알림톡·문자
- 특정 조·방·역할 대상, 예약 발행, 첨부 파일·이미지, 댓글·반응
- 공지 수정 이력(이전 본문)
- 참가자 행사 안내 페이지(#270의 "안내 페이지 편집")

### Alternatives

- **대상을 열 여러 개(`for_leaders` 같은 불리언)로:** 특정 조·방을 더할 때마다 열과 판정이 늘어난다. 종류+참조 id 목록은 같은 열에서 늘린다.
- **대상을 연결 테이블(`notice_audiences`)로:** 1월에는 한 항목이라 과하다. 조·방 대상이 늘어 조회 조건이 필요해지면 그때 옮긴다.
- **발행 뒤 수정 금지(보관하고 새로 쓰기):** 현장에서 시간 하나 고치려고 공지를 둘로 만들고, 알림도 두 번 간다.
- **발행 뒤 수정마다 다시 알림:** 오타 수정이 200명에게 알림을 만든다.
- **공지에 전달 기록 열:** 일정 변경·조 공개 같은 다른 알림의 전달을 따로 만들어야 한다. 알림 행에 붙이면 한 곳이다.
- **운영진 공지를 별도 기능(운영자 게시판)으로:** 같은 작성 화면과 상태를 두 번 만든다. 대상 하나로 충분하다.

### Reason

현장에서 휴대폰으로 빨리 쓰고, 틀리면 고치고, 끝나면 치우는 세 가지가 공지의 일이다. 상태 셋과 발행 뒤 수정으로 그 흐름을 채우고, 대상과 전달은 DEC-080의 공통 구조에 맡겨 일정·조 공개와 같은 방식으로 늘린다.

### Consequence

- 서버(D2): Flyway `notices`, `NoticeController`·`ParticipantNoticeController`, audit 네 가지. 발행 경로가 DEC-080 `participant_feed_versions.notices`와 `notifications`를 같은 트랜잭션에서 쓴다.
- 화면(D3·D4): 운영자 휴대폰 작성(만들며 발행, 세 번 안쪽), 고정·보관, 운영자 행사 홈의 운영진 공지 카드. 참가자 공지 탭·홈 최신 공지 카드·새 공지 표시·중요 강조·"수정됨".
- API 초안 §9의 Notice 부분은 이 결정으로 대신한다. DEC-030 Consequence의 "Notice targeting 기술 방식은 별도 검토"는 이 결정과 DEC-080 §8로 닫는다.
- #270의 "안내" 메뉴는 공지 목록으로 연결한다(I5). 안내 페이지 편집은 여전히 범위 밖이다.
- **확장 지점:** (1) 대상에 `GROUP`·`ROOM`·`ROLE`을 `ids`와 함께 더한다. 저장 모양과 판정 함수(`ParticipantAudience`)는 그대로다. (2) 웹 푸시·알림톡·문자는 알림 행의 `notification_deliveries`로 붙이고, 발행 요청에 `channels`를 더한다. (3) 참가자별 읽음 수(D6)는 그 공지를 가리키는 알림의 `read_at`을 센다. (4) 예약 발행은 `publishAt` 열과 예약 작업을 더한다. 상태는 늘리지 않는다. (5) 일정 공개의 변경 공지 초안(C7)은 이 경로의 `DRAFT` 만들기를 쓴다.

### Evidence

사용자 결정 2026-11-19([#380 댓글](https://github.com/BeomhyunPark/SCENE/issues/380#issuecomment-7002382622), 로드맵 6.1 결정 5). 근거 자료는 DEC-030(공지 대상 경계), DEC-042(공개와 안내 전달 구분), DEC-051(종료 후 후속 공지), DEC-080, API 초안 §9, operator-sidebar-menus-review(#270·#271).

### Follow-up (2026-11-20, #434)

D2 서버를 만들며 [계약 초안](../architecture/notice-contract.md)과 다르게 정하거나 초안이 열어 둔 것을 정했다. 경로는 [api.md "공지"](../../backend/docs/api.md#공지)로 옮겼다.

1. **운영자 범위 값은 `notice_boards.version`이다.** 행사당 한 행이고 대상·상태와 상관없이 공지 쓰기(만들기, 실제로 바뀐 고치기, `DRAFT` 지우기, 발행·보관·보관 해제)마다 같은 트랜잭션에서 1 오른다. 읽는 곳은 `NoticeBoardVersions.read` 하나다. 운영자 `GET …/events/{eventId}/updates`(I3)의 `notices`가 이 값을 쓰고, 그 경로를 먼저 만들지 않았으므로 나중에 병합되는 쪽이 잇는다.
2. **신청이 취소된 참가자는 `ALL` 공지도 보지 못한다.** 초안 §5는 "`ALL`은 모두"였다. 지금은 두 겹으로 빠진다: DEC-084(A7) 뒤로 취소된 사람의 남은 쿠키는 참가자 경로 전체에서 `401 AUTHENTICATION_REQUIRED`이고, 세션이 있더라도 `ParticipantAudience`가 `ALL`도 활성 참가자(`SUBMITTED` 신청이 있음)로 판정한다(DEC-080 Follow-up 2번). 발행 알림의 받는 사람에서도 빠진다. 다시 신청해 들어오면 다음 읽기부터 보인다(그 사이 발행된 공지의 알림은 없다).
3. **상태 명령은 "이미 그 상태"를 버전보다 먼저 본다.** 초안 §3 순서(버전 → 상태)대로면 발행을 두 번 누른 두 번째 요청이 `409 CONCURRENT_MODIFICATION`이 된다. 그래서 `publish`·`archive`는 이미 `PUBLISHED`·`ARCHIVED`면 버전과 상관없이 `200 ALREADY_…`이고 아무것도 쓰지 않는다. 그 밖의 판정은 초안 순서다. `unarchive`는 같은 상태 결과가 없어 보관되지 않은 공지는 `409 INVALID_STATE_TRANSITION`이다.
4. **`409 CONCURRENT_MODIFICATION`의 `notice`는 요약이다**(`noticeId`·`status`·`version`·`updatedAt`·`updatedByDisplayName`). 초안 §8은 "지금 값"이었지만 §9의 "제목·본문은 오류 응답에 넣지 않는다"를 따랐다. 화면은 상세를 다시 읽는다.
5. **다시 알림(`notify: true`)은 발행된 공지의 내용(제목·본문·중요·대상)이 바뀔 때만 만든다.** 고정만 바꾸면 알리지 않고 audit도 남기지 않는다(초안 §9). 대상이 `STAFF`인 공지를 다시 알리면 운영자 알림 종류는 `STAFF_NOTICE_UPDATED`다(초안 §6 "같은 종류"를 새 종류로 정했다. 결정 대기 1).
6. **알림 문구.** 참가자: 발행 "새 공지"/"중요 공지", 다시 알림 "공지 수정"/"중요 공지 수정". 운영자: 발행 "운영진 공지"/"중요 운영진 공지", 다시 알림 "공지 수정"/"중요 공지 수정". `body`는 공지 제목이다.
7. **활성 운영자**(운영진 공지 알림 받는 사람)는 그 행사의 `event_users` 행이 있는 사람에서 인수인계로 소유 권한이 끝난 OWNER(개별 `EVENT_READ` GRANT가 없는)를 뺀 사람이다. 운영자 제거·공간 탈퇴가 행을 지우므로 빠지고, 탈퇴에서 유지한 행사의 운영자는 남는다(`EventAccessGate`와 같은 기준). 작성자는 뺀다.
8. **목록 페이지.** `before`·`nextBefore`는 해석하지 않는 문자열(순서 키)이다. 순서의 마지막 기준은 `noticeId` 내림차순이다. 참가자 목록은 대상으로 거른 **뒤에** 잘라 페이지가 모자라지 않는다. 운영자 목록에서 발행한 적 없는 보관 공지는 `updatedAt`으로 줄 선다. `pinnedCount`는 거르기와 상관없는 행사 전체 값이다.
9. **`DRAFT` 보관도 `NOTICE_ARCHIVED`를 남긴다**(초안 §9 "보관이 실제로 일어날 때"). 참가자 갱신 값은 발행됐던 공지일 때만 오른다.
10. **본문 앞뒤 공백은 자른다.** `bodyPreview`는 줄바꿈(앞뒤 공백 포함)을 공백 하나로 바꾼 앞 80자이고 잘렸으면 `…`를 붙인다. 요청의 모르는 키는 무시한다(나중의 `channels`).
11. **읽기 비용.** 참가자 목록·상세 한 요청은 SQL 네 문장이다(세션, 대상 판정, 공지, `unread`). 참가자 목록은 본문 앞 81자만 읽는다. 200명이 발행 직후 한 번씩 읽어도 요청마다 네 문장이다(`NoticeCostIT`). 공지·갱신 값·알림은 모두 DB에 있고 서버 메모리에 두는 상태는 없다.

결정 대기 (추천안으로 진행, PR 검토에서 확인):

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 운영진 공지를 다시 알릴 때 운영자 알림 종류 | `STAFF_NOTICE_UPDATED` / `STAFF_NOTICE_PUBLISHED`로 합치기 / 운영자에게는 다시 알림 없음 | `STAFF_NOTICE_UPDATED` | I3 운영자 알림 화면이 이 종류를 알아야 누를 수 있다(모르는 종류는 제목·본문만 보이고 누를 수 없다) |
| 2 | 운영자 공지 목록의 페이지 | 지금처럼 `before`·`limit`(기본 30) / 페이지 없이 전체 | `before`·`limit` | 행사당 공지가 수십 건이라 화면은 첫 페이지면 충분하다. 보관 공지가 쌓여도 응답이 커지지 않는다 |

---

## DEC-083 — 조원은 같은 조의 이름·또래·성별을 보고, 조장은 조원의 신청 답·전화번호·도착·참석 구간·방을 보며, 조장의 전화번호 열람은 `privacy_logs`에 남는다

**Date:** 2026-11-19

**Status:** CONFIRMED (보는 범위는 사용자 결정 2026-11-19 — 로드맵 6.1 결정 3·11. 스위치·응답 모양·기록 방식은 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다)

### Context

DEC-072 §6은 일반 참가자에게 조원 명단을 주지 않고 조장에게 자기 조원의 이름·또래만 줬다. 조장의 조원 연락처는 "참가자 링크가 새면 함께 새고 참가자 세션의 연락처 조회 기록이 없다"는 이유로 미뤘다(DEC-072 Alternatives·Consequence). DEC-030은 처음부터 조장이 자기 조원의 연락처·신청 정보를 본다고 정했다. DEC-070 Follow-up은 새가족 답을 참가자 쪽에 넣지 않았다.

사용자는 2026-11-19 이렇게 정했다(로드맵 6.1 결정 3·11, [#382 댓글](https://github.com/BeomhyunPark/SCENE/issues/382#issuecomment-7002472651)). 조원은 같은 조의 이름·또래·성별처럼 마주치면 알 수 있는 정보만 보고 연락처는 보지 않는다. 조장은 조원의 모든 정보(운영자가 고친 값 포함한 신청 답, 전화번호, 도착 여부, 참석 구간, 방)를 보고, 운영자끼리 적는 운영 메모는 보지 않는다. 조장의 전화번호 열람은 기록을 남긴다. 참가자는 이름·전화번호·숫자 6자리로 들어오므로(DEC-078) 링크 유출로 세션이 열리는 위험은 줄었다. 하위 이슈는 [#403](https://github.com/BeomhyunPark/SCENE/issues/403)이다.

### Decision

1. **조원이 보는 것:** 같은 조 활성 조원의 이름·또래·성별·조장 표시와 "나" 표시. 참가자 id·연락처·신청 답·도착·참석 칸·방은 없다.
2. **조원 명단은 행사별 스위치 `groupRosterVisibleToMembers`(기본 켬)로 둔다.** 끄면 일반 조원은 DEC-072 §6처럼 조 이름·조장 이름만 본다. 조장은 스위치와 상관없이 본다. 스위치는 `event_participant_settings`에 두고 `EVENT_UPDATE`로 바꾸며, 바꾸면 `updates.group`이 오른다. 숙소 방 배정표 공개 스위치(G1)도 같은 곳에 둔다.
3. **조장이 보는 것은 두 단계다.** 내 조 응답의 `leaderView`(조원별 도착 여부·시각, 참석 방식·구간·칸·숙박 밤, 방, 최근 수정 시각, 조 도착 수)와 조원 상세 `GET /participant/group/members/{participantId}`(전화번호, 보이는 질문의 신청 답 전부와 읽기용 글자, 운영자가 고친 값 표시). 운영 메모·숨긴 질문의 답·동의 답·숫자 6자리는 어디에도 없다. 운영자가 고친 값(A12, #339)이 있으면 그 값이 먼저다(DEC-075 §1).
4. **전화번호는 조원 상세에서만 나오고, 나올 때마다 `privacy_logs`에 `CONTACT_VIEW` 한 줄을 같은 트랜잭션에서 남긴다**(누가, 누구의, 어떤 필드, 어느 공개본. 번호·이름은 넣지 않는다). 전화 형식(`format: PHONE`) 답도 같이 센다. `audit_logs`는 운영자 행위자만 받으므로 별도 테이블이다. 기록이 실패하면 응답도 실패한다.
5. **새가족:** 조장은 조원 상세의 중그룹·셀 답으로 새가족 보기를 본다. 일반 조원 명단에는 없다. DEC-070 Follow-up의 "참가자 쪽에 넣지 않는다"를 이렇게 바꾼다.
6. **유지하는 것:** 가장 최근 공개본만 본다(DEC-043, DEC-072 §1). 취소한 사람은 다음 요청부터 빠진다(DEC-044, DEC-072 §5). 조장은 공개본에서 그 조의 조장이고 활성 참가자인 사람이다(조당 최대 1명). 조장과 운영자 신원은 연결하지 않는다.
7. **성별 질문이 꺼진 행사**(질문 없음, 꺼짐, 답 없음, 보기 꺼짐)는 `gender: null`이고 화면은 빈칸으로 둔다. 명단은 이름·또래만 보인다.
8. **응답은 더하기만 한다.** 지금 `GET /participant/group`의 키와 뜻은 그대로다. 일반 조원에게도 `members`가 생기고(스위치 켬), 항목에 `gender`·`me`가 더해지고, `rosterVisible`·`leaderView`가 새로 생긴다.
9. **다른 조 사람에게는 어떤 경로로도 나가지 않는다.** 조원 상세의 실패는 모두 `404`로 구분하지 않고, 일반 조원은 다른 사람의 id를 받지 않는다. 계약 초안 §6의 열두 가지 시험 조건을 F2 서버 PR의 통합 테스트로 둔다.
10. 새 ErrorCode와 새 권한 키는 없다. 조회는 audit을 남기지 않는다(전화 열람은 `privacy_logs`).

응답 예시·판정·테이블 초안·시험 조건은 [내 조 계약 초안](../architecture/participant-group-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 조원 명단 스위치 기본값 | 켬 / 끔 | 켬(사용자 결정 3이 "조원은 본다") | 이미 있는 행사도 배포하면 일반 조원에게 명단이 보인다. 원하지 않는 행사는 운영자가 끈다 |
| 2 | 조장이 받는 전화번호의 범위 | 신청 전화와 전화 형식 답 모두 / 신청 전화만 | 모두(사용자 결정 "모든 정보") | 보호자 연락처 같은 직접 만든 전화 질문도 조장에게 보인다. 둘 다 열람 기록에 남는다 |

### 범위 밖

- 조장 화면 자체(F3)와 조장 화면의 숙소·식사 순서(F4, G1·H1 뒤. 식사 순서는 1월 범위 밖으로 보류, DEC-086 Follow-up 2026-11-20)
- 조장이 조원 정보를 고치기, 조장의 내려받기
- `privacy_logs`를 보는 운영자 화면, 운영자 연락처 열람 기록의 이전
- 조원끼리 연락처 보기, 다른 조 명단
- 조장 겸 운영자의 신원 연결

### Alternatives

- **조장 응답 하나에 전화번호까지 넣기:** 조장 화면을 열 때마다(그리고 갱신 때마다) 조원 전원의 전화가 나가고 열람 기록이 의미를 잃는다. 누를 때 한 사람씩 여는 편이 기록이 실제 열람과 맞는다.
- **조원 명단을 늘 공개(스위치 없음):** 사용자 결정의 기본 동작이지만, 범위는 넓히기 쉽고 줄이기 어렵다(DEC-072). 행사마다 끌 수 있게 둔다(로드맵 구조 10).
- **열람 기록을 `audit_logs`에 넣기:** `actor_user_id`가 운영자만 받는다. 참가자 행위자를 넣으려고 audit 모양을 바꾸면 모든 audit 경로가 흔들린다. 데이터 모델 초안의 `privacy_logs`(`CONTACT_VIEW`)를 이 기회에 만든다.
- **열람 기록을 합치기(같은 사람·하루 한 번):** 행 수는 줄지만 "언제 몇 번 봤는지"가 사라진다. 조원 수가 적어 행이 많지 않다.
- **새가족을 별도 `newcomer` 값으로 조장에게:** 신청 답에 이미 있는 정보를 다른 이름으로 한 번 더 내는 것이다. 답 그대로 보이면 충분하다.
- **조원 상세 실패를 `403`으로:** 다른 조 사람의 존재가 드러난다.

### Reason

조장이 조원을 챙기는 데 필요한 것을 모두 주되, 가장 민감한 전화번호는 한 사람씩 열고 그때마다 남긴다. 조원끼리는 현장에서 이미 마주치는 정보까지만 열어 "아는 얼굴" 이상을 주지 않는다. 공개본·취소자 규칙은 DEC-072 그대로라 운영자가 공개하기 전에는 아무것도 바뀌지 않는다.

### Consequence

- 서버(F2): `ParticipantGroupService` 확장(`members` 일반 조원 공개, `gender`·`me`, `leaderView`), 조원 상세 경로, `privacy_logs`·`event_participant_settings` Flyway, 운영자 `participant-settings` 경로와 audit `EVENT_PARTICIPANT_SETTINGS_UPDATED`. 참석 칸·숙박 계산은 `MealSlots`·집계와 같은 코드를 쓴다. 스위치 변경은 DEC-080 `participant_feed_versions.groups`를 올린다.
- 화면(F3): 참가자 "내 조"의 조원 명단, 조장 "조원 현황"(도착·미도착, 오늘 오는·가는 사람, 끼니별 인원은 `slots`·`slotIds`로 화면이 센다), 조원 상세.
- DEC-072 §6·범위 밖과 DEC-070 새가족 Follow-up에 갱신 메모를 붙였다. DEC-030의 "자기 그룹원의 연락처·신청 정보를 포함한 전체 조회"가 이 결정으로 처음 구현된다.
- security-privacy §5의 `CONTACT_VIEW` privacy log가 참가자 행위자부터 생긴다.
- **확장 지점:** (1) `event_participant_settings`에 방 배정표 공개(G1)·조원 연락처 범위 같은 스위치를 더한다. (2) `privacy_logs`에 운영자 연락처 열람(`APPLICANT_CONTACTS_VIEWED`의 이전)과 `SENSITIVE_VIEW`·`EXPORT`를 더하고 `PRIVACY_LOG_READ`로 보는 화면을 만든다. (3) `leaderView.members[]`에 식사 순서(H1, 1월 범위 밖으로 보류)·차량(`RIDE_WRITE`)을 키 하나씩 더한다. (4) 조장 외에 "부조장"·"조 담당 운영자" 같은 범위는 같은 판정 함수에 역할을 더해 넓힌다. (5) 같은 범위 규칙을 숙소의 "같은 방 사람"(G1)이 쓴다.

### Evidence

사용자 결정 2026-11-19(로드맵 6.1 결정 3·11, [#382 댓글](https://github.com/BeomhyunPark/SCENE/issues/382#issuecomment-7002472651)). 근거 자료는 DEC-030, DEC-043, DEC-044, DEC-070 Follow-up(새가족), DEC-072 §1·§5·§6과 Alternatives·Consequence, DEC-073 §6(숨긴 보기), DEC-075(운영 메모), api.md "조 편성"(`GET /participant/group`), security-privacy §5, 데이터 모델 초안(privacy action), 마이그레이션 V1(`audit_logs`)·V5·V14.

---

## DEC-084 — 운영자는 신청을 취소하고 되돌리며, 취소하면 같은 트랜잭션에서 조 배정과 참가자 세션이 빠지고, 취소된 사람은 6자리가 맞으면 다시 신청해 돌아온다

**Date:** 2026-11-19

**Status:** CONFIRMED (로드맵 A7 하위 세션의 추천안. 아래 "결정 대기" 다섯 가지는 추천안으로 진행했고 PR 검토에서 사용자 확인을 받는다) — DEC-044·DEC-072 §5·DEC-078을 잇는다

### Context

`applications.status`에는 처음부터 `WITHDRAWN`이 있지만 그 상태로 가는 경로가 없다. 운영자는 못 오게 된 사람, 잘못 낸 신청, 장난 신청을 명단에서 뺄 수 없다. DEC-044는 취소자를 재공개를 기다리지 않고 활성 편성·공개 명단·조장 조회에서 바로 빼고, 복귀 때 옛 조를 자동으로 되살리지 않고 참고로 보여 주라고 했다. DEC-072 §5는 "철회 경로를 열 때 같은 transaction에서 배정을 지우고 이력에 남긴다"고 미리 정했다. DEC-078은 전화번호 하나가 참가자 한 명이고(부분 유일 색인 `applications_one_submitted_per_participant`), 같은 전화의 재신청은 6자리가 맞을 때만 수정이 된다고 정했다. 집계(DEC-073)·편성판·체크인(DEC-071)·CSV·참가 현황 표·참가자 들어오기는 `SUBMITTED` 신청만 읽는다. 질문은 [#338](https://github.com/BeomhyunPark/SCENE/issues/338)의 "함께 정할 것", 작업 단위는 [#419](https://github.com/BeomhyunPark/SCENE/issues/419)(이 결정)·[#420](https://github.com/BeomhyunPark/SCENE/issues/420)(서버)·[#421](https://github.com/BeomhyunPark/SCENE/issues/421)(화면)이다.

### Decision

**1. 취소는 지금 revision의 상태만 바꾼다.** 참가자의 지금(`SUBMITTED`) 신청 행을 `WITHDRAWN`으로 바꾼다. 새 revision을 만들지 않는다(답이 바뀌지 않았으므로). 그 참가자에게는 `SUBMITTED`가 없어지므로 `SUBMITTED`만 읽는 모든 곳에서 바로 빠진다. 신청 행·답·이전 revision·운영 메모(DEC-075)·체크인 기록은 지우지 않는다.

**2. 사유·처리자·시각은 새 기록 테이블에 쌓는다.** `application_status_logs`(추가만 하는 이력: 참가자, 신청, `WITHDRAWN`/`RESTORED`, 사유, 처리자 종류 `OPERATOR`/`PARTICIPANT`와 운영자 id, "다시 신청 막기", 시각)다. 사유는 **선택**이고 200자까지다(체크인 취소 사유와 같다). 사유는 운영 메모처럼 운영자 화면에만 보이고 audit·로그·오류 본문·CSV·참가자 경로에 넣지 않는다. 이 테이블이 운영자 알림(I3)이 읽을 "누가, 누구를, 언제"다(아래 7).

**3. 되돌리기는 같은 행을 다시 `SUBMITTED`로 바꾼다.**
- 되돌릴 수 있는 것은 그 참가자의 **마지막 revision이 `WITHDRAWN`일 때**뿐이다. 그 사이 다른 `SUBMITTED`가 생길 수는 없다: 전화번호 하나가 참가자 한 명이라 같은 전화의 새 신청은 같은 참가자에게 가고(5), 운영자 직접 추가(A12)도 같은 전화면 같은 참가자를 쓴다. DB의 부분 유일 색인이 마지막 방어선이다(어기면 `409 CONFLICT`).
- **조 배정은 돌아오지 않는다**(취소 때 지웠으므로, DEC-044). 되돌린 사람은 미배정이고, 응답과 화면이 "이전 조"를 참고로 보여 준다(그 조가 지워졌으면 없다). 조장 표시도 돌아오지 않는다.
- **공개본에서도 돌아오지 않는다.** 공개 스냅샷에는 취소 전의 조·조장 표시가 그대로 남아 있으므로, 공개본을 읽을 때 "그 공개 뒤에 취소로 배정이 지워진 사람"(`group_assignment_logs` cause `WITHDRAWN`, 공개 시각 이후)을 스냅샷에서 뺀다. 되돌린 사람은 다음 공개 전까지 공개본에서 미배정이고, 참가자 내 조도 `UNASSIGNED`다. 저장된 스냅샷 행은 바꾸지 않는다. (2026-11-20 실제 클릭에서 찾음: 이 규칙이 없으면 되돌린 조장이 공개본에서 예전 조의 조장으로 다시 보였다.)
- 체크인 기록은 지우지 않았으므로 도착 체크인한 사람을 되돌리면 도착이 다시 보인다.
- 세션은 돌아오지 않는다. 참가자는 이름·전화번호·6자리로 다시 들어온다. "다시 신청 막기"로 취소했으면 6자리가 무효라 운영자가 6자리를 초기화해 줘야 들어온다(응답 `reapplyBlocked`).

**4. 취소의 부수 효과는 한 트랜잭션이다.** 행사 행을 잠그고(조 편성 쓰기와 같은 잠금), 참가자 행을 잠근 뒤(신청 수정과 같은 잠금):
- **조 배정**: 작업본 배정 행을 지우고 `group_assignment_logs`에 cause `WITHDRAWN`(이전 조, 조장 전후, 처리자, 시각)을 남긴다. `boardVersion`이 오르고, 조장이었으면 그 조의 `version`도 오른다(조장 표시가 바뀌었으므로). 그 조는 조장이 없는 조가 된다. 그 사람이 가장 최근 공개본에 있었으면 참가자 갱신 값 `GROUPS`(DEC-080 §4)도 올려 다른 조원 화면이 조를 다시 읽게 한다. 화면은 확인 창에서 "○조 조장 표시가 풀려요"를 보여 준다.
- **공개본**: 공개된 스냅샷은 그대로 둔다(DEC-072 §1). 참가자 내 조·조장 이름·조원 명단·운영자 공개본 조회는 읽을 때 `SUBMITTED`가 없는 사람을 이미 빼므로(DEC-072 §5, DEC-044) 재공개 없이 바로 빠진다. 다음 공개 비교에는 "빠짐"으로 들어간다.
- **편성판의 "철회됨 · 이전 조"**: 배정 행을 지우므로 이전 조는 `group_assignment_logs`의 마지막 `WITHDRAWN` 기록에서 읽는다.
- **참가자 세션**: 그 참가자의 세션을 모두 지운다. 그리고 세션 조회 자체가 "그 참가자에게 `SUBMITTED` 신청이 있다"를 함께 본다. 참가자 경로가 쓰는 판정(`ParticipantSessionCookie.require()`)이 한곳에서 읽으므로, 다른 경로(B2·I3)가 따로 확인하지 않아도 취소된 사람의 남은 쿠키는 `401 AUTHENTICATION_REQUIRED`다.
- **6자리·잠금**: 6자리 해시와 그 전화의 잠금 상태는 그대로 둔다(5의 재신청에 쓴다). "다시 신청 막기"를 고르면 6자리를 아무도 모르는 값으로 바꾼다(운영자에게도 보이지 않는다).
- **체크인**: 이미 도착 체크인한 사람도 취소할 수 있다. 체크인 행·이력은 그대로이고 현황 숫자·명단·QR·수동 체크인에서는 빠진다(DEC-071 §2: `SUBMITTED`가 없으면 대상이 아니다). 확인 창이 "도착 체크인 기록은 남고 현황에서 빠져요"를 보여 준다.
- **신청서 잠금(DEC-068)**: "신청이 들어온 신청서"는 `SUBMITTED`와 `WITHDRAWN`을 함께 센다. 모두 취소돼도 되돌릴 답이 남아 있으므로 질문 유형을 바꿀 수 없다.

**5. 취소된 사람의 재신청 (결정 대기 1).** 같은 전화로 공개 신청서에 다시 내면:
- 6자리가 맞으면 **다시 신청한 것으로 돌아온다.** 답이 바뀌었으면 새 revision(`SUBMITTED`, `revised_by: PARTICIPANT`)을 만들고 취소된 행은 `SUPERSEDED`가 된다. 답이 같으면 취소된 행을 다시 `SUBMITTED`로 바꾼다. 기록 테이블에 `RESTORED`(처리자 `PARTICIPANT`)를 남기고 운영자 알림(I3) 대상이다. 응답은 `200`, `revised: true`, `restored: true`이고 세션이 열린다. 신청서가 닫혀 있으면(`acceptingApplications: false`) 첫 신청처럼 `409 FORM_CLOSED`다(신청 수정 스위치가 아니라 신청 받기 스위치를 본다: 다시 신청하는 것이므로). 조 배정은 돌아오지 않는다.
- 6자리가 틀리면 지금처럼 `409 APPLICATION_ALREADY_EXISTS`이고 잠금 횟수에 들어간다. 취소 여부는 드러나지 않는다.
- **장난 신청**은 운영자가 취소할 때 **"다시 신청 막기"**(`blockReapply`)를 고른다. 6자리가 무효가 되어 낸 사람이 다시 살릴 수 없다. 남의 전화번호로 장난 신청이 들어와 진짜 주인이 신청하지 못하면, 운영자가 6자리를 초기화해 임시 번호를 주고 주인이 그 번호로 신청서를 다시 낸다(위 첫 항목대로 주인의 답으로 돌아오고, 들어오면 새 번호를 정한다).
- 운영 부담: 못 오게 됐다가 다시 오게 된 사람은 운영자를 거치지 않고 돌아온다. 운영자는 알림(I3)으로 안다.

**6. 들어오기.** 취소된 사람의 이름·전화번호·6자리 들어오기는 다른 실패와 같은 `401 PARTICIPANT_LOGIN_FAILED`다(신청이 없는 전화와 구분하지 않는다, DEC-078 §2). 화면 문구 "이름, 전화번호, 숫자 6자리를 다시 확인해 주세요"에 "신청이 취소되었으면 운영진에게 문의해 주세요"를 덧붙인다(결정 대기 4).

**7. 운영자 알림이 붙을 자리 (I3).** `notifications`는 아직 없다(DEC-080, 2주차 I3). 취소·되돌리기·재신청 복귀는 모두 `ApplicationStatusChanges.record(...)` 한 곳을 지나고, 그곳이 `application_status_logs` 한 행과 Spring 이벤트 `ApplicationStatusChanged`(행사, 참가자, 신청, 동작, 처리자 종류·id, 시각)를 같은 트랜잭션에서 낸다. I3는 이 이벤트를 받아(`@TransactionalEventListener`가 아니라 같은 트랜잭션의 리스너로) `APPLICATION_CANCELLED`·`APPLICATION_RESTORED` 알림 행을 만든다. 알림 본문은 이름까지이고 사유는 넣지 않는다(사유는 신청 상세에서 본다). 처리한 운영자 본인에게는 만들지 않는다(DEC-080 §6). 참가자 `updates`(B2)도 없다. 취소는 세션을 끊으므로 참가자 화면은 다음 요청에서 `401`로 끝난다.

**8. 권한·행사 상태·audit·동시 수정.**
- 권한은 effective `PARTICIPANT_WRITE`다(운영 메모·6자리 초기화와 같다. 행사 OWNER 기본, 다른 사람은 개별 GRANT). 조 배정을 지우지만 `GROUP_WRITE`는 보지 않는다: 취소는 참가 자격의 일이고 배정 정리는 그 결과다(DEC-044).
- 행사 상태: `DRAFT`·`ACTIVE`에서 된다. `ENDED`는 `409 EVENT_ENDED`, `ARCHIVED`는 `409 EVENT_ARCHIVED`다. 끝난 행사의 참가 기록 정정은 event-lifecycle-review의 별도 정정 경계로 남긴다(조 편성·체크인과 같다).
- 판정 순서: 404(행사·신청) → 403 → 400 → 409 행사 상태 → 409 신청 상태.
- audit: `APPLICATION_WITHDRAWN`(detail `{ applicationId, participantId, groupRemoved, reasonGiven, blockReapply }`)·`APPLICATION_RESTORED`(`{ applicationId, participantId }`). **사유 본문은 audit에 넣지 않는다**(운영 메모와 같은 이유: 건강·가정 사정 같은 민감한 글이 들어갈 수 있다). 참가자의 재신청 복귀는 공개 신청처럼 audit를 쓰지 않고 기록 테이블에만 남는다.
- 동시 수정: 경로의 `applicationId`가 곧 기대값이다(revision마다 id가 다르다). 이미 그 상태면 `200`과 `result: ALREADY_WITHDRAWN`/`ALREADY_SUBMITTED`이고 기록·audit를 더하지 않는다(체크인 취소의 `ALREADY_CANCELLED`와 같다). 그 사이 참가자가 고쳐 그 행이 `SUPERSEDED`면 `409 CONCURRENT_MODIFICATION`이고 확장 필드로 지금 `applicationId`·`status`·`revision`을 준다. `Idempotency-Key`는 쓰지 않는다(같은 요청을 다시 보내도 "이미 그 상태"라 두 번 반영되지 않는다, DEC-047).

**9. 운영자가 취소된 신청을 보는 곳.**
- 참가 현황 표는 지금처럼 `SUBMITTED`만 `rows`에 두고, 취소된 사람은 따로 `withdrawn[]`(이름, 취소 시각·처리자·사유, 다시 신청 막기, 이전 조, 도착 시각)에 준다. 화면은 기본으로 숨기고 "취소 N" 칩을 누르면 목록과 되돌리기 버튼이 열린다. 표의 숫자(전체·도착·미배정·세기)에는 들어가지 않는다.
- 신청 상세는 `status`와 `withdrawal`(취소 시각·처리자·사유·다시 신청 막기)을 준다. 화면은 맨 위에 "취소된 신청"을 표시한다.
- CSV는 지금처럼 `SUBMITTED`만이다. 취소된 사람을 CSV에 넣는 "취소 포함" 선택은 실제 요구가 생기면 더한다.

**10. 참가자 스스로의 취소는 이번 범위 밖이다 (결정 대기 2).** 사용자 결정은 "참가자가 신청을 직접 고친다"까지다. 1월에는 참가자가 운영진에게 연락하고 운영자가 취소한다. 나중에 열면 같은 기록 테이블(처리자 `PARTICIPANT`)과 같은 부수 효과 함수를 쓴다.

### 결정 대기 (추천안으로 진행함)

| # | 질문 | 선택지 | 추천안(적용) | 영향 |
|---|---|---|---|---|
| 1 | 취소된 사람이 같은 전화로 다시 신청하면 | 6자리가 맞으면 돌아온다 / 운영자 되돌리기만 | 6자리가 맞으면 돌아오고 운영자가 알림으로 안다. 장난 신청은 취소 때 "다시 신청 막기" | 운영자 되돌리기만이면 다시 오게 된 사람마다 운영자에게 연락해야 하고, 남의 번호로 들어온 장난 신청의 진짜 주인이 신청할 길이 없다 |
| 2 | 참가자 스스로의 취소 | 지금 연다 / 운영자에게 요청 | 운영자에게 요청(범위 밖) | 참가자 화면에 취소 버튼이 없다. 운영진 연락처는 신청 완료 안내(A8)에 적는다 |
| 3 | 도착 체크인한 사람의 취소 | 허용하고 기록은 남김 / 막음 / 체크인도 함께 취소 | 허용하고 체크인 기록은 남김(현황에서는 빠짐, 되돌리면 도착이 돌아온다) | 중간에 떠난 사람도 뺄 수 있다. 체크인 이력은 정확하다 |
| 4 | 취소된 사람이 들어오기를 시도할 때 | 같은 실패 응답 / "취소된 신청" 안내 | 같은 실패 응답 + 실패 문구에 "취소되었으면 운영진에게 문의" | 신청 여부가 드러나지 않는다. 대신 본인도 이유를 화면에서 바로 모른다 |
| 5 | 취소 사유 | 선택 / 필수 | 선택(200자) | 현장에서 빨리 뺄 수 있다. 사유가 없는 취소는 상세에 "사유 없음" |

### 범위 밖

- 참가자 스스로의 취소(10), 운영자 대리 수정·직접 추가(A12, #339), 알림 화면·알림 행(I3), 참가자 `updates`(B2), 숙소 배정과의 관계(G 트랙이 생긴 뒤: 취소 때 방 배정도 같은 함수에서 정리한다).
- CSV "취소 포함", 취소된 사람의 일괄 정리(보존 정책 DEC-056의 일).

### Alternatives

- **취소를 새 revision으로:** 답이 같은 행이 하나 더 생기고, `changes`가 빈 revision이 "수정"처럼 보인다. 상태만 바꾸면 revision은 답의 이력으로 남는다.
- **사유·처리자를 `applications` 열로:** 되돌린 뒤 다시 취소하면 이전 기록을 덮어쓴다. 알림(I3)이 읽을 "언제 무엇이 일어났나"가 남지 않는다.
- **배정 행을 남기고 읽을 때만 빼기(지금 편성판 방식):** 되돌리면 옛 조가 저절로 돌아온다(DEC-044·DEC-072 §5가 막은 일). 조장 표시가 남아 조당 조장 1명 색인과 얽힌다.
- **취소 때 공개본을 다시 만들기:** 공개는 운영자가 확인하고 하는 일이다(DEC-040). 읽을 때 빼면 같은 효과가 재공개 없이 난다.
- **취소 때 세션만 지우고 세션 조회는 그대로:** 지우는 것을 빠뜨린 경로(나중의 대리 취소, 참가자 스스로의 취소)가 생기면 취소된 사람이 계속 들어와 있다. 조회에서 함께 보면 한곳에서 지켜진다.
- **6자리를 취소 때 늘 무효로:** 다시 오게 된 사람이 늘 운영자를 거쳐야 한다. 장난 신청에만 고르게 했다.
- **새 ErrorCode(`APPLICATION_WITHDRAWN`):** 같은 전화의 재신청·들어오기에서 취소 여부를 드러낸다. 운영자 경로는 기존 코드(`INVALID_STATE_TRANSITION`, `CONCURRENT_MODIFICATION`)와 `result`로 충분하다.

### Consequence

- 서버: Flyway `V21`이 `application_status_logs`를 만들고 `group_assignment_logs.cause`에 `WITHDRAWN`을 더한다(추가만 하는 모양이라 옛 코드로 되돌려도 동작한다). 경로 `POST …/applications/{applicationId}/withdraw`·`…/restore`, 참가 현황 표의 `withdrawn[]`, 신청 상세의 `withdrawal`, 공개 신청 응답의 `restored`. 계약은 [backend/docs/api.md](../../backend/docs/api.md) "신청 취소와 되돌리기"다.
- 집계·편성판(작업본·공개본·조장)·체크인(현황·명단·QR·수동)·CSV·참가 현황 표·참가자 들어오기가 같은 결과를 내는지는 통합 테스트 하나(`ApplicationWithdrawalHttpIT`)가 함께 묶는다. 새 읽기 경로를 만들 때 "`SUBMITTED`만 읽는다"를 지키고 이 테스트에 한 줄을 더한다.
- 참가자 판정 "`SUBMITTED` 신청이 있는 참가자"는 세션 조회(`ParticipantSessionQueryMapper.findByTokenHash`)에도 들어간다. 2주차 참가자 경로는 `ParticipantSessionCookie.require()`만 쓰면 된다.
- 숙소(DEC-085, G2)는 `ApplicationWithdrawalService.withdraw`의 같은 트랜잭션에서 방 배정 행을 지우고 `room_assignment_logs`에 `WITHDRAWN`을 남긴다(조 배정의 `GroupService.removeWithdrawn`과 같은 모양). 방 공개본을 읽을 때도 §3의 공개본 규칙(공개 뒤 취소로 지워진 사람은 스냅샷에서 뺀다)을 따른다.
- 운영자 알림(I3)은 `ApplicationStatusChanged` 이벤트를 받는다. [참가자 홈 계약](../architecture/participant-home-contract.md) §7.2 운영자 알림 표에 `APPLICATION_RESTORED`를 더한다.

### Evidence

로드맵 A7(`docs/product/retreat-2027-roadmap.md` 4절, 3절 구조 1·6), [#338](https://github.com/BeomhyunPark/SCENE/issues/338), [#378](https://github.com/BeomhyunPark/SCENE/issues/378). 근거 자료는 DEC-044, DEC-047, DEC-063, DEC-068, DEC-071 §2·§4, DEC-072 §1·§5, DEC-073, DEC-075, DEC-078 §1·§2·§4·§5, DEC-080 §6과 참가자 홈 계약 §7.2, 마이그레이션 V4·V13·V15·V19.

---

## DEC-085 — 숙소는 조 편성과 같은 작업본·공개본 계약으로 사람마다 방 하나를 배정하고, 정원·성별은 막지 않고 경고하며, 참가자는 기본으로 같은 방 사람과 전체 방 배정표를 본다

**Date:** 2026-11-20

**Status:** CONFIRMED (SCENE에서 방 배정·정원·성별 경고, 같은 방 사람과 전체 방 배정표 공개, 참가자끼리 보는 범위, 조와 도메인 분리, "다시 볼 것", 자동 편성 없음은 사용자 결정 2026-11-19 — 로드맵 6.1 결정 4, 구조 2·10. 숙박하지 않는 사람은 방에 넣지 않는다는 사용자 결정 2026-11-20 — 결정 대기 3, Follow-up. 세부는 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다. 결정 대기는 아래에 따로 적었다)

### Context

숙소는 신청 집계(DEC-073)가 밤별 숙박 인원만 센다. 방과 배정이 없고 권한 키 `ROOM_WRITE`와 API 초안 §12(`rooms`, `room_members`, `GET /participant/room`)만 있다. 사용자는 2026-11-19 "SCENE에서 방을 배정한다(방·정원·성별 경고). 같은 방 사람과 다른 방 배정까지 참가자가 봐도 된다"고 정했다(로드맵 결정 4, [#383](https://github.com/BeomhyunPark/SCENE/issues/383)). 지켜야 하는 것은 조 편성과 도메인을 합치지 않기(`participants.room_id` 없음), 신청·조가 바뀌어도 자동으로 바꾸지 않고 "다시 볼 것"으로 표시하기(DEC-045, A11), 자동 편성 안 하기, 참가자끼리는 이름·또래·성별·조·방까지(구조 10)다. 3주차(12/3~)에 서버(G2)·운영자 화면(G3)·참가자 화면(G4)·표·CSV·현장 명단(G5)을 다른 세션이 문서만 보고 만든다. 하위 이슈는 [#424](https://github.com/BeomhyunPark/SCENE/issues/424)다.

### Decision

1. 🔒 **작업본은 테이블, 공개본은 스냅샷이다(DEC-072와 같은 계약 모양).** 작업본은 `rooms`(방)와 `room_assignments`(배정된 참가자당 한 행), 공개하면 `room_publications`에 방 목록(이름·위치·정원·성별·순서)과 방마다 **활성 참가자 id만** 담은 JSON 한 행을 더한다. 참가자·조장·참가 현황 표·현장 명단은 가장 최근 공개본만 본다. 테이블은 조 편성과 따로 둔다.
2. **방 필드:** 이름(1–50자, 행사 안에서 유일), 위치 메모(0–100자, 참가자에게 보임), 정원(1–50 또는 없음), 성별 구분(`GENDER` 질문의 보기 id 또는 구분 없음), 순서. 방은 행사당 200개(잠정). 방을 지우면 배정된 사람이 미배정이 되고 이력이 남으며, 다시 공개하기 전까지 참가자는 지난 공개본을 본다.
3. 🔒 **배정은 1월에 행사 전체에 참가자당 방 하나다.** 배정 행에 `night` 열(0 = 행사 전체)을 1월부터 두어 밤별 배정(G6)을 열만 쓰면 더하게 한다. 방 안 순서는 저장하지 않는다(이름 순).
4. **버전과 동시 수정은 조 편성과 같다.** 행사당 `boardVersion`과 방 `version`(`expectedVersion`). 배정은 사람마다 `fromRoomId`를 보내 하나라도 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`과 `conflicts[]`, 이미 목적지면 반영된 것으로 본다. 공개는 `expectedBoardVersion`, 같으면 `ALREADY_PUBLISHED`, 미배정 대상이 있으면 `confirmUnassigned`(DEC-041). `Idempotency-Key`는 쓰지 않는다. 배정·이동은 한 트랜잭션이다.
5. **걸러서 보내기·끌어 놓기·조 단위 일괄 배정은 모두 `POST …/room-assignments`의 `changes[]` 하나다.** 조 단위 일괄 배정은 화면이 그 조의 활성 참가자로 `changes`를 만드는 동작이고, 서버에는 조를 받는 경로가 없다. 조가 바뀌어도 방은 그대로다. 배정판의 조는 **조 편성 공개본**의 조이고, 요청한 운영자에게 `GROUP_WRITE`가 있을 때만 작업본 조 id(`draftGroupId`)를 더 준다.
6. **배정 대상은 활성 참가자(`SUBMITTED`)이고 숙박 상태를 함께 준다.** 숙박 계산은 신청 집계와 같은 코드다(사람별 판정을 한 함수로 꺼내 집계·DEC-083 `lodgingNights`·숙소가 같이 쓴다). `LODGING`·`UNKNOWN`(판단 불가, 숙박 질문이 없는 행사 포함)은 미배정 수에 들고, `NOT_LODGING`(집회만, 통근 체크, 같은 날 오가기)은 들지 않고 **방에 넣을 수 없다**(사용자 결정 2026-11-20. 넣으려 하면 아무것도 저장하지 않고 `409 INVALID_STATE_TRANSITION`, `reason: NOT_LODGING`, `participantIds`. 미배정으로 빼는 것은 된다). `UNKNOWN`은 막지 않는다. 취소자는 읽을 때 빠지고, 신청 취소 트랜잭션(A7, DEC-084)이 배정 행을 지우고 이력에 남긴다.
7. **정원 초과·성별 불일치·성별 답 없음은 막지 않고 경고한다.** 배정판의 방마다, 그리고 배정 응답에서 이번에 사람이 드나든 방마다 `warnings[{code}]`(`OVER_CAPACITY`, `GENDER_MISMATCH`, `GENDER_UNKNOWN`, `NOT_LODGING`)를 준다. `NOT_LODGING` 경고는 새로 넣을 때는 생기지 않고(거절된다), 배정한 뒤 신청을 고쳐 숙박을 뺀 사람이 방에 남았을 때만 생긴다. 성별은 보기 id로 비교한다. 공개는 정원·성별 경고로 막거나 확인받지 않는다. 방에 남은 숙박하지 않는 사람이 있으면 미배정처럼 공개할 때 확인을 받는다(`confirmNotLodging`, 결정 대기 7).
8. **"다시 볼 것"(A11).** 배정할 때 판단 근거(성별 보기 id, 자는 밤, 참석 칸)를 배정 행에 찍고, 배정판을 읽을 때 지금 값과 달라진 사람에게 `review.reasons`(`NOT_LODGING`, `LODGING_CHANGED`, `ATTENDANCE_CHANGED`, `GENDER_CHANGED`)를 붙인다. 방은 자동으로 바꾸지 않는다(숙박을 뺀 사람도 방에 남는다. 다른 방으로 옮길 수는 없고 미배정으로 뺄 수 있다). 옮기거나 "확인"하면 근거를 다시 찍는다(확인은 `boardVersion`을 올리지 않는다).
9. **참가자 경로는 `GET /api/v1/participant/rooms` 하나다.** 상태는 `NOT_ELIGIBLE`·`NOT_PUBLISHED`·`UNASSIGNED`·`ASSIGNED`이고 숙박하지 않는 본인은 `notLodging`으로 안다. 공개 범위는 DEC-083의 `event_participant_settings`에 둔 `roomRosterScope`다: `ALL`(**기본**. 내 방 이름·위치 + 같은 방 사람의 이름·또래·성별 + 전체 방 배정표의 방별 이름·또래), `ROOMMATES`(전체 표 없음), `MY_ROOM`(내 방 이름·위치만). 참가자 id·연락처·신청 답·숙박 밤·참석 칸·정원·운영 메모·미배정 명단은 어떤 범위에서도 없다. 범위를 바꾸면 `updates.rooms`가 오른다.
10. **조장은 범위와 상관없이 조원의 방 `{name, locationNote}`를 숙소 공개본에서 본다**(DEC-083 `leaderView.members[].room`과 조원 상세). 참가 현황 표·CSV(`방` 열)·현장 체크인 명단도 **공개본** 기준으로 방을 보인다(G5). 작업본의 방은 배정판에서만 보인다.
11. **갱신과 알림.** 공개(`PUBLISHED`)와 범위 변경이 같은 트랜잭션에서 DEC-080 `participant_feed_versions.rooms`를 올린다. `ROOM_PUBLISHED`는 첫 공개면 배정된 활성 참가자 전원, 그 뒤에는 내 방이 바뀐 사람(새 배정·이동·빠짐)과 내 방의 이름·위치가 바뀐 사람이 받는다. 같은 방 사람이 바뀐 것만으로는 만들지 않는다. 문구는 내 방 이름·위치까지이고 다른 참가자 이름을 넣지 않는다. 운영자가 공개할 때 `notify: false`로 끌 수 있다.
12. **권한.** 쓰기·공개는 `ROOM_WRITE`. 배정판 조회는 이름·성별·숙박이 있어 조 편성판과 같은 규칙(`ROOM_WRITE` 또는 활성 공간 `OWNER`·`ADMIN`)이다. 운영자 공개본 조회는 `EVENT_READ`. `ROOM_WRITE`는 OWNER 기본이고, MANAGER는 DEC-079 Follow-up이 기본값을 넓히면 갖는다. 새 권한 키는 없다.
13. **행사 상태.** `DRAFT`·`ACTIVE`에서 쓰고 공개한다. `ENDED`는 `409 EVENT_ENDED`, `ARCHIVED`는 `409 EVENT_ARCHIVED`. 참가자는 어느 상태에서나 마지막 공개본을 본다. 판정 순서는 조 편성과 같다.
14. **기록.** 공개마다 audit `ROOMS_PUBLISHED`(개수만). 배정 변경은 `room_assignment_logs`(`MOVE`·`ROOM_DELETED`·`WITHDRAWN`). 이름·전화·답은 audit·이력·로그에 없다. 새 ErrorCode는 없다.

경로·요청·응답·오류·테이블 초안·시험 조건과 DEC-080·083·084 계약에 더하는 것은 [숙소 계약 초안](../architecture/room-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 방 배정표 공개 범위의 기본값 | `ALL`(전체 표까지) / `ROOMMATES` / `MY_ROOM` | `ALL`(사용자 결정 4) | 공개하면 참가자 전원이 모든 방의 이름·또래를 본다. 원하지 않는 행사는 운영자가 줄인다 |
| 2 | 두 번째 이후 공개의 `ROOM_PUBLISHED` 받는 사람 | 내 방이 바뀐 사람(+방 이름·위치 변경) / 같은 방 사람 구성이 바뀐 사람까지 / 공개할 때마다 배정된 전원 | 내 방이 바뀐 사람과 방 이름·위치가 바뀐 사람 | 룸메이트가 바뀐 사람은 알림 없이 화면에서만 본다. 알림이 200명에게 반복되지 않는다 |
| 3 | 숙박하지 않는 사람(집회만, 통근)을 방에 넣을 수 있나 | 경고와 함께 허용 / 막음 | **사용자 결정 2026-11-20: 허용하지 않는다**("아니 그냥 허용하지 마라"). 처음 추천안은 "허용, `NOT_LODGING` 경고"였다 | 넣으려 하면 요청 전체가 `409 INVALID_STATE_TRANSITION`(`reason: NOT_LODGING`). 낮에 쉴 방이 필요한 사람은 운영자가 숙박 값을 고친 뒤(A12) 넣는다. 미배정 수에는 들지 않는다 |
| 4 | 배정판의 "조"는 어느 편성인가 | 조 편성 공개본(+`GROUP_WRITE`면 작업본 id) / 늘 작업본 | 공개본 + `GROUP_WRITE`가 있을 때만 작업본 | 조를 공개하기 전에는 숙소 담당이 조로 거르지 못한다(`GROUP_WRITE`를 같이 받으면 된다) |
| 5 | 참가 현황 표·CSV·현장 명단의 방 기준 | 공개본 / 작업본 | 공개본 | 접수대 안내와 참가자 화면이 같다. 공개 전 배정은 표에 보이지 않는다 |
| 6 | 정원·성별 경고가 있을 때 공개를 확인받나 | 받지 않음(응답에 수만) / 확인을 받음 | 받지 않음. 미배정만 확인 | 경고를 알고도 그대로 쓰는 방(가족방 등)을 매번 확인하지 않는다. 배정판에 경고가 늘 보인다 |
| 7 | 배정한 뒤 신청을 고쳐 숙박을 뺀 사람이 방에 남았을 때(결정 대기 3에서 따라 나옴, 2026-11-20 추가) | 공개를 막음 / 확인을 받음 / 그대로 공개. 공개본 방 명단에 그 사람을 보임 / 숨김 | 자동으로 빼지 않고(DEC-045) 배정판에 "다시 볼 것"(`NOT_LODGING`)과 방 경고로 보인다. 공개는 미배정과 같은 방식으로 **확인을 받는다**(`409 CONFIRMATION_REQUIRED`에 `notLodgingAssignedCount`, 다시 보낼 때 `confirmNotLodging: true`). 확인하고 공개하면 공개본에 그대로 담겨 참가자·조장·현장 명단의 방 명단에 다른 사람과 똑같이 보인다 | 운영자가 모르는 사이 숙박하지 않는 사람이 방에 남은 채 공개되지 않는다. 막으면 신청 마감 뒤 한 명의 수정이 재공개 전체를 막는다. 숨기면 공개본과 운영자가 본 배정판이 달라진다 |

### 범위 밖

- 밤마다 다른 배정(G6, P2. 열은 1월부터 있다), 방 안 순서·침대 자리, 방장·열쇠
- 자동 배정, 조 단위로 방을 묶어 추천, 성별·정원에 맞춘 자동 채우기
- 참가자가 방을 고르거나 바꿔 달라고 요청하기
- 방 대상 공지(`ROOM` 대상, DEC-080 확장 지점), 방별 인쇄물 화면(J11은 공개본 조회로 대신한다)
- 차량 배정(`RIDE_WRITE`. 같은 계약 모양으로 나중에 만든다)

### Alternatives

- **조 편성 테이블에 방을 함께 저장(조 = 방):** 조와 방은 사람 묶음이 다르고(성별·숙박), 조가 바뀌면 방이 같이 움직인다. 사용자가 금지한 도메인 합치기다.
- **범용 배정 테이블(`assignments(kind, target_id)`):** data-model 원칙("각 업무가 배정 상태 직접 소유")과 어긋나고, 방의 정원·성별·밤과 조의 조장·순서처럼 업무마다 다른 열을 한 테이블에 섞는다. 공통 부품은 서버 코드에서 나눈다.
- **`participants.room_id`:** 공개본과 작업본을 나눌 수 없고 밤별 배정을 표현하지 못한다.
- **정원·성별 불일치를 막기:** 가족·부부·봉사자 방처럼 운영자가 일부러 섞는 경우가 있다. 막으면 정원을 거짓으로 늘리게 된다.
- **신청이 바뀌면 배정을 자동으로 풀기:** DEC-045와 어긋나고, 운영자가 모르는 사이 공개본과 작업본이 달라진다.
- **"다시 볼 것"을 신청 수정 시각으로만 판단:** 숙박과 상관없는 답(셀 이름 등)을 고쳐도 표시가 붙는다. 근거 값을 비교하면 숙소에 영향이 있는 변경만 남는다.
- **참가자에게 전체 표를 늘 공개(스위치 없음):** 사용자 결정의 기본이지만 범위는 넓히기 쉽고 줄이기 어렵다(DEC-072). 행사별로 줄일 수 있게 둔다(구조 10).
- **참가 현황 표·현장 명단을 작업본 기준으로:** 공개 전에 접수대가 참가자 화면과 다른 방을 안내할 수 있다.

### Reason

1월에 필요한 것은 "숙소 담당 몇 명이 200명을 방에 넣고 경고를 보며 고치고, 확인하고 공개하면, 참가자가 내 방·같은 방 사람·전체 표를 보고 접수대가 같은 방을 안내한다"이다. 조 편성에서 검증한 작업본·스냅샷·사람 단위 충돌 비교를 그대로 써 서버·화면 부품(편성판의 걸러서 보내기·끌어 놓기)을 다시 쓰고, 방만의 규칙(정원·성별·숙박)은 경고로만 둔다. 신청이 바뀌는 일은 근거 비교로 표시하고 사람이 판단한다.

### Consequence

- 서버(G2): Flyway `room_boards`·`rooms`·`room_assignments`·`room_assignment_logs`·`room_publications`와 `event_participant_settings.room_roster_scope`, 운영자 `RoomController`(가칭)·참가자 `ParticipantRoomController`(가칭). 공개는 같은 트랜잭션에서 `participant_feed_versions.rooms`와 `ROOM_PUBLISHED` 알림을 쓴다. 숙박 사람별 판정을 `ApplicationSummaryService`에서 꺼내 같이 쓴다. audit `ROOMS_PUBLISHED`를 더한다. 신청 취소(A7) 트랜잭션이 배정 행을 지운다.
- 화면(G3): 배정판(조 편성판의 걸러서 보내기·끌어 놓기 부품), 방 목록·정원·성별·경고, 조 단위 일괄 배정, 다시 볼 것 표시와 확인, 공개 확인 창. (G4) 홈 숙소 카드와 전체 방 배정표. (G5) 참가 현황 표·CSV·현장 명단의 방.
- DEC-080 계약의 숙소 카드·`updates.rooms`·`ROOM_PUBLISHED` 받는 사람, DEC-083 계약의 `room`·`roomRosterScope`는 숙소 계약 초안 §10에 적었고 G2·G4 PR이 그 문서로 옮긴다. API 초안 §12(`room_members`, `/room-moves`, `GET /participant/room`)는 이 결정으로 대신한다.
- DEC-072 범위 밖의 "방·차량 배정과 조 이동의 의존 안내(DEC-045)"는 방 쪽만 이 결정의 "다시 볼 것"으로 들어온다(조 이동은 방에 영향을 주지 않으므로 표시하지 않는다).
- **확장 지점:** (1) 밤별 배정(G6)은 `night` 열과 요청·응답의 `nights[]`로 더하고 1월 키는 그대로다. (2) 차량 배정(`RIDE_WRITE`)은 같은 계약 모양의 `ride_*` 테이블과 공통 서버 부품으로 만들고, `night` 자리에 `leg`(가는 길·오는 길)를 둔다. (3) 공지·일정 대상에 `ROOM`을 더한다. (4) 방 안 순서·방장은 배정 행의 열로 더한다. (5) 공개 범위 스위치는 같은 설정 행에 값을 늘린다.

### Follow-up (2026-11-20)

- **바뀐 것:** 결정 대기 3을 사용자가 뒤집었다. 원문 "085-3 숙박하지 않는 사람을 방에 넣을 수 있나 → 아니 그냥 허용하지 마라". 숙박하지 않는 사람(`NOT_LODGING`)은 방에 넣지 못한다. 배정 요청에 한 명이라도 있으면 아무것도 저장하지 않고 `409 INVALID_STATE_TRANSITION`, `reason: NOT_LODGING`, `participantIds`다(활성 참가자가 아닌 사람을 넣을 때와 같은 모양, 새 ErrorCode 없음). 미배정으로 빼는 것은 된다. 조 단위 일괄 배정에서도 숙박하지 않는 사람은 포함할 수 없다. `UNKNOWN`(숙박 질문이 없는 행사 포함)은 지금처럼 배정한다.
- **따라 나온 세부(결정 대기 7, 추천안):** 배정한 뒤 신청을 고쳐 숙박을 뺀 사람은 자동으로 빼지 않는다(DEC-045 유지). 배정판에 "다시 볼 것"과 방 `NOT_LODGING` 경고로 보이고, 공개할 때 미배정처럼 확인을 받는다(`notLodgingAssignedCount`, `confirmNotLodging`). 확인하고 공개하면 공개본 방 명단에 그대로 보인다.
- **그대로인 것:** 결정 대기 1·2·4·5·6은 추천안대로다.
- **고친 곳:** 이 절의 Decision 6·7·8과 결정 대기 3·7, [숙소 계약 초안](../architecture/room-contract.md) §3·§4·§5·§7.1·§7.6·§7.8·§8.2·§13·§15, 로드맵 6.1 결정 13. 구현(G2~G5)은 아직 시작하지 않았다. 기록: [#424](https://github.com/BeomhyunPark/SCENE/issues/424), [#383](https://github.com/BeomhyunPark/SCENE/issues/383).

### Evidence

사용자 결정 2026-11-19(로드맵 6.1 결정 4, 구조 2·10, [#383](https://github.com/BeomhyunPark/SCENE/issues/383) 본문). 근거 자료는 DEC-041·043·044·045·046·047, DEC-070·073·074(숙박 밤·칸 계산), DEC-072(작업본·공개본·편성판), DEC-075(운영 값 먼저), DEC-079(권한), DEC-080(`updates`·알림), DEC-083(`event_participant_settings`·`leaderView`), api.md "조 편성"·"신청 집계"·"체크인", 데이터 모델 초안 §2·§4, API 초안 §12, `MealSlots`·`ApplicationSummaryService`, 마이그레이션 V13·V14·V16.

---

## DEC-086 — 식사 순서는 끼니(칸 id) × 조마다 차례 번호와 선택 시각을 두고, 순환 자동 채우기와 손 고치기로 만들며, 일정표와 따로 공개한다

**Date:** 2026-11-20

**Status:** 보류 — 2027년 1월 범위 밖(사용자 결정 2026-11-20, 아래 Follow-up). 구현하지 않는다. 아래 내용은 지우지 않고 다시 할 때의 출발점으로 둔다. (보류 전 상태: CONFIRMED (조원이 식사 순서를 파악한다는 범위, 끼니마다 QR을 찍지 않는다는 원칙, 칸 id 공통 키, 작업본·공개본 계약은 사용자 결정·로드맵 구조 2·3, 2026-11-19. 순서의 단위·권한·공개 방식은 #384 추천안과 로드맵 하위 세션의 추천안이고 PR 검토에서 확인받는다. 결정 대기는 아래에 따로 적었다))

### Context

식사 순서(조별 배식 차례)는 문서와 코드 어디에도 없다. 사용자는 2026-11-19 수련회의 중요한 일 일곱째로 "조원의 조 현황·숙소·식사 순서 파악"을 꼽았다(로드맵 1절, [#384](https://github.com/BeomhyunPark/SCENE/issues/384)). 식수는 끼니마다 QR을 찍지 않으므로(로드맵 결정 1) 식사 순서는 체크가 아니라 안내다. 끼니는 신청서 설정의 칸 id `opt_d{일차}_{breakfast|lunch|dinner}`로 가리키고(구조 3), 이 id는 식수 집계(DEC-073)·편성판(DEC-072 Follow-up)·일정 항목 `slotId`(DEC-081)가 이미 쓴다. #384는 "조마다 차례 번호와 선택 입력 시각"과 `SCHEDULE_WRITE` 재사용을 추천했고, 일정표 공개와 같이 할지 따로 할지를 H1에 남겼다. H2의 완료 조건은 "조를 지우거나 더하면 순서가 맞춰진다"이다. 3주차(12/3~)에 서버(H2)·운영자 화면(H3)·참가자 화면(H4)을 다른 세션이 문서만 보고 만든다. 하위 이슈는 [#426](https://github.com/BeomhyunPark/SCENE/issues/426)이다.

### Decision

1. **표는 끼니 × 조 → 차례 번호(1부터)·선택 시각(`HH:mm`)이다.** 같은 차례를 여러 조가 가질 수 있다(1차·2차 배식 묶음). 차례 없음(`null`)은 그 끼니에 그 조의 차례가 없다는 뜻이고, 줄이 없는 끼니는 "순서 없음"이다. 차례 번호는 끼니마다 빈틈 없이 1부터 다시 매긴다.
2. **끼니는 신청서 설정의 식사 칸이다.** `MealSlots`(편성판·집계와 같은 코드)에서 아침·점심·저녁 칸만 쓴다. 집회 칸은 쓰지 않는다. 설정이 없거나 식사 칸이 없는 행사는 표가 비고 쓰기가 `409 CONFLICT NO_MEAL_SLOTS`다. 일정표 작업본에 같은 `slotId`의 식사 항목이 있으면 그 시각·장소를 표에 함께 보인다.
3. **표의 줄은 조 편성 작업본의 조이고, 참가자에게 보이는 조는 조 편성 공개본에 맞춘다.** 참가자의 조와 조 이름은 가장 최근 조 편성 공개본에서 읽는다. 작업본의 조 목록이 조 편성 공개본과 다르면 식사 순서 공개가 확인(`GROUPS_NOT_PUBLISHED`)을 받는다.
4. **조를 지우거나 더하면 읽을 때 맞춘다(실효 표).** 지운 조의 줄은 DB에서 함께 지워지고(FK `ON DELETE CASCADE`, 조 편성 코드는 바꾸지 않는다) 남은 차례가 당겨진다. 새 조는 순서가 있는 끼니마다 맨 뒤 차례에 시각 없이 붙는다. 운영자 표·공개·비교·참가자 응답이 모두 이 실효 표를 쓰므로, 조 추가·삭제만으로도 "미공개 변경"이 된다.
5. **순환 자동 채우기**는 첫 끼니 조 순서(`firstOrder`, 기본 조 순서)를 끼니마다 `shift`(기본 1)칸씩 왼쪽으로 돌려 채운다. `groupsPerTurn`(기본 1)으로 묶고, `intervalMinutes`를 주면 그 끼니의 일정 항목 시작 시각부터 차례마다 시각을 넣는다. 고른 끼니는 통째로 덮어쓴다. 알고리즘 배정이 아니다.
6. **손으로 고치기는 끼니 하나를 통째로 바꾸는 `PUT …/meal-order/slots/{slotId}`다.** 작업본의 모든 조를 정확히 한 번씩 보내고(아니면 `409 CONFLICT GROUPS_CHANGED`), `entries: []`는 순서 없음이다.
7. **버전.** 행사당 `boardVersion`과 끼니 `version`. 끼니 저장은 `expectedVersion`, 채우기·공개는 `expectedBoardVersion`이고 다르면 `409 CONCURRENT_MODIFICATION`. 서로 다른 끼니는 충돌하지 않는다. 같은 공개는 `ALREADY_PUBLISHED`이고 `Idempotency-Key`는 쓰지 않는다(DEC-046·047).
8. 🔒 **일정표와 따로 공개하고, "저장하고 바로 공개"를 둔다.** 공개는 `POST …/meal-order/publish`이고 스냅샷은 순서가 있는 끼니의 조 id·차례·시각만 담는다. 끼니 저장·채우기에 `publish: true`를 붙이면 같은 트랜잭션에서 공개하고, 다른 미공개 변경이 있으면 `confirmOtherChanges`를 받는다(DEC-081 §5와 같은 규칙).
9. **참가자 경로는 `GET /api/v1/participant/meal-order`다.** 상태는 `NOT_ELIGIBLE`·`NOT_PUBLISHED`·`PUBLISHED`이고, `groupStatus`(`ASSIGNED`·`UNASSIGNED`·`NOT_PUBLISHED`)와 끼니마다 우리 조 차례(`mine`), 내가 그 끼니에 있는지(`attending`, 참석 칸 계산과 같은 코드), 전체 표(`turns`, 조 이름·차례·시각)를 준다. 사람 이름·id·전화·답은 없다. 조가 없거나 조를 공개하지 않은 행사의 참가자는 `mine`이 없고 전체 표는 본다.
10. **홈 "다음 식사" 카드와 일정표 식사 항목은 화면이 `slotId`로 붙여 계산한다**(DEC-080 §6과 같은 방식). 서버는 "다음 식사"를 따로 주지 않는다. 화면은 `updates.mealOrder` 또는 `updates.group`이 바뀌면 다시 읽는다.
11. **조장(F4)은 같은 경로로 우리 조 차례를 보고, 끼니별 조원 수는 `leaderView.members[].attendance.slotIds`로 센다.** 식사 순서가 조 단위라 `leaderView.members[]`에 키를 더하지 않는다.
12. **식수 현황(E3)과는 칸 id만 같다.** 식사 순서는 식수 숫자를 만들지 않는다.
13. **갱신과 알림.** 공개(`PUBLISHED`)만 같은 트랜잭션에서 `participant_feed_versions.meal_order`를 올린다. `MEAL_ORDER_PUBLISHED`는 첫 공개면 조가 있고 그 조가 차례를 가진 활성 참가자 전원, 그 뒤에는 차례·시각이 바뀐 조의 활성 참가자가 받는다. 문구는 내 조 이름과 끼니 이름까지다. 공개할 때 `notify: false`로 끌 수 있다.
14. **권한과 행사 상태.** 쓰기·공개는 `SCHEDULE_WRITE`(OWNER·MANAGER 기본, DEC-079). 표 조회는 `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`(개인정보 없음). `DRAFT`·`ACTIVE`에서 쓰고, `ENDED`는 `409 EVENT_ENDED`, `ARCHIVED`는 `409 EVENT_ARCHIVED`. 참가자는 어느 상태에서나 마지막 공개본을 본다. 새 권한 키·ErrorCode는 없다.
15. **기록.** 공개마다 audit `MEAL_ORDER_PUBLISHED`(개수만). 끼니 저장·채우기는 audit을 남기지 않는다(공개 스냅샷이 기록).
16. **테이블은 `kind`를 가진 `group_turn_*`이다**(1월은 `MEAL`만). 같은 표를 나중에 청소·설거지 같은 조별 당번(`DUTY`)이 쓴다.

경로·요청·응답·오류·테이블 초안·시험 조건과 DEC-080·083 계약에 더하는 것은 [식사 순서 계약 초안](../architecture/meal-order-contract.md)에 있다.

### 결정 대기 (추천안으로 진행, PR 검토에서 확인)

| # | 질문 | 선택지 | 추천안 | 영향 |
|---|---|---|---|---|
| 1 | 공개를 일정표와 같이 하나 따로 하나(#384 H1) | 따로(저장하고 바로 공개 포함) / 일정표 공개에 묶음 | 따로 | 일정 한 줄 공개가 식사 순서 정리 상태에 묶이지 않는다. 운영자는 두 공개 버튼을 본다(화면이 일정 식사 항목 옆에 이어 준다) |
| 2 | 순서의 단위(#384) | 차례 번호 + 선택 시각 / 조를 묶은 1차·2차 시각만 | 차례 번호 + 선택 시각(같은 차례 여러 조 허용) | 시각을 정하지 않은 현장도 "2번째"로 안내하고, 묶음 배식도 표현한다 |
| 3 | 참가자에게 다른 조의 순서(전체 표)를 보이나 | 보임 / 우리 조만 | 보임(조 이름·차례·시각만) | 앞 차례 조가 누구인지 알고 움직인다. 사람 정보는 없다 |
| 4 | 테이블 이름 | `group_turn_*`(`kind`로 당번 확장) / `meal_order_*`(당번은 따로 만든다) | `group_turn_*` | 당번을 더할 때 테이블·코드를 다시 만들지 않는다. 1월에는 `kind = 'MEAL'`만 받는다 |
| 5 | 순환 자동 채우기의 기본 회전 | 끼니마다 1칸 / 하루마다 1칸 / 회전 없음 | 끼니마다 1칸(`shift` 1, 바꿀 수 있음) | 첫 끼니에 먼저 먹은 조가 다음 끼니에 맨 뒤로 간다 |

### 범위 밖

- 끼니별 체크·식수 숫자(로드맵 결정 1, 트랙 E가 따로 한다)
- 조 대신 방·또래 단위 순서, 사람 단위 순서
- 일정 항목 시각이 바뀌면 순서 시각을 자동으로 고치기(표시만 확장 지점)
- 조별 당번(청소·설거지) 화면과 경로(테이블은 열어 둔다)
- 공개 취소, 예약 공개

### Alternatives

- **일정 항목에 순서를 넣기(항목 안의 조별 시각):** 일정표 스냅샷이 조 id를 갖게 되고, 조 편성이 바뀔 때마다 일정표를 다시 공개해야 한다. 식사 순서를 정리하는 동안 일정 공개가 막힌다.
- **일정표 공개에 묶기:** 위와 같은 이유로 공개 단위가 커지고 알림 대상이 섞인다. `slotId`로 화면에서 붙이면 충분하다.
- **조별 시각만(차례 번호 없음):** 시각을 정하지 않는 현장(줄 서는 순서만 정함)을 표현하지 못한다.
- **조 편성 공개본의 조만 줄로:** 조를 공개하기 전에 순서를 준비할 수 없다. 작업본의 조로 만들고 공개 때 확인받는다.
- **조 추가·삭제를 조 편성 경로에서 식사 순서에 반영:** 두 도메인이 서로의 코드를 고친다. 읽을 때 맞추면 조 편성 코드는 그대로다.
- **새 권한 키(`MEAL_ORDER_WRITE`):** 일정·시각을 맡는 사람이 같고, MANAGER가 이미 `SCHEDULE_WRITE`를 갖는다(DEC-079). 새 키는 꼭 필요할 때만 만든다(구조 9).
- **서버가 "다음 식사"를 계산:** 일정·순서·참석 칸·현재 시각을 서버가 매 요청 합쳐야 하고, 홈의 다른 계산(DEC-080 §6)과 방식이 갈린다.

### Reason

현장에서 필요한 것은 "끼니마다 어느 조가 몇 번째로, 대략 몇 시에 먹는지"를 한 번에 만들고, 바뀌면 휴대폰에서 고쳐 바로 알리는 것이다. 칸 id로 신청서·일정·식수와 잇고, 조 편성·일정표와 같은 작업본·공개본 계약을 써 서버·화면 코드와 운영자의 이해를 다시 쓴다. 조 변경은 읽을 때 맞춰 도메인을 섞지 않는다.

### Consequence

- 서버(H2): Flyway `group_turn_boards`·`group_turn_slots`·`group_turn_entries`·`group_turn_publications`, `MealOrderController`(가칭)·`ParticipantMealOrderController`(가칭), 실효 표 계산과 순환 채우기, audit `MEAL_ORDER_PUBLISHED`. 공개는 같은 트랜잭션에서 `participant_feed_versions.meal_order`와 알림을 쓴다. 끼니 정의는 `MealSlots`, 참석 칸은 `MealSlots.attended`를 쓴다.
- 화면(H3): 끼니 × 조 표, 자동 채우기 창, 손 고치기(차례 끌어 놓기·묶기·시각), "조 편성을 먼저 공개" 안내, 공개와 저장하고 바로 공개. (H4) 홈 "다음 식사" 카드와 일정 식사 항목의 우리 조 순서. (F4) 조장 화면의 우리 조 차례와 끼니별 조원 수.
- DEC-080 계약의 다음 식사 카드·`updates.mealOrder`·`MEAL_ORDER_PUBLISHED` 받는 사람, DEC-083 확장 지점 (3)(식사 순서)은 식사 순서 계약 초안 §10에 적었고 H2·H4 PR이 그 문서로 옮긴다.
- **확장 지점:** (1) 조별 당번은 `kind = 'DUTY'`와 운영자가 만드는 칸 정의, `/duties` 경로, `features.duties`·`updates.duties`로 더한다. (2) 끼니별 체크(구조 7)가 같은 칸 id로 "우리 조 차례에 왔는지"를 센다. (3) 차례별 인원(조 공개본 × 참석 칸)을 운영자 표나 E3에 화면이 계산해 보인다. (4) 일정 시각이 바뀌면 다시 채우기를 권하는 표시. (5) 조 대신 방·또래 묶음은 줄에 `target_type`을 더한다.

### Evidence

사용자 결정 2026-11-19(로드맵 1절 일곱째·결정 1, 구조 2·3, [#384](https://github.com/BeomhyunPark/SCENE/issues/384) 본문의 구조와 결정 대기). 근거 자료는 DEC-043·045·046·047, DEC-070·073·074(칸 id·참석 칸), DEC-072와 Follow-up(조·공개본·`slots`), DEC-079(MANAGER `SCHEDULE_WRITE`), DEC-080(`updates`·알림·홈 계산), DEC-081(일정 `slotId`·저장하고 바로 공개), DEC-083(`leaderView`), api.md "조 편성"·"신청 집계", `MealSlots`, 마이그레이션 V13·V14·V16.

### Follow-up (2026-11-20)

- **사용자 결정 원문:** "식사 순서는 일단 전부 빼자. 현장에서 관리 가능하다. 일단 중요한 거 아님."
- **바뀐 것:** 식사 순서(로드맵 트랙 H의 H1~H4)는 2027년 1월 범위에서 빠진다(로드맵 6.1 결정 14). H2(서버)·H3(운영자 화면)·H4(참가자 화면)는 하지 않는다. 이 절의 Decision·결정 대기는 확정하지 않은 채로 남는다.
- **남는 것:** 이 절과 [식사 순서 계약 초안](../architecture/meal-order-contract.md)은 main에 그대로 둔다. 참가자 홈의 `features.mealOrder`·`updates.mealOrder` 키와 `participant_feed_versions.meal_order` 열(V20)도 그대로 둔다(추가만 하는 원칙, 화면 호환). `ParticipantFeatures`는 행사 유형 기본값으로 `mealOrder`를 켜지 않는다. 올리는 경로가 없어 1월에는 늘 `false`·`0`이다(DEC-080 Follow-up 2026-11-20, 식사 순서 보류).
- **함께 빠진 것:** 홈 "다음 식사" 카드(B3·H4), 조장 화면의 식사 순서(F4, DEC-083 확장 지점 3), 행사 메뉴의 "식사"(I5), 알림 `MEAL_ORDER_PUBLISHED`.
- **다시 시작할 때:** 사용자에게 다시 할지 묻는다 → 이 절의 결정 대기를 확인받는다 → H2(서버)부터 계약 초안대로 만들고, `ParticipantFeatures`의 유형 기본값에 `mealOrder`를 다시 넣을지 정한다. 기록: [#384](https://github.com/BeomhyunPark/SCENE/issues/384), [#426](https://github.com/BeomhyunPark/SCENE/issues/426).
