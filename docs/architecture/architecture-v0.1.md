# SCENE Architecture v0.1

- 정리일: 2026-09-30
- 현재 단계: Technical Design / implementation 전
- 성격: 기존 기술 결정의 문서 baseline. 새 Product Decision 또는 구현 착수 승인 아님.

## 1. 소스와 상태 해석

소스 우선순위:

1. 현재 문서화 요청, 사용자가 추가 제공한 「SCENE — 추가 참조 원문」 §1–48, [API 아키텍처 공통 규칙 대화](https://chatgpt.com/c/6abbe706-c888-83ee-bbee-9e09b10ca0c8)의 최신 결과
2. [PRODUCT_DECISIONS](../product/PRODUCT_DECISIONS.md)의 CONFIRMED 결정
3. [PRODUCT_DEFINITION](../product/PRODUCT_DEFINITION.md)의 CONFIRMED / RESEARCHED / HYPOTHESIS / OPEN QUESTION 구분
4. [PROJECT_CONTEXT](../product/PROJECT_CONTEXT.md), [RESEARCH](../product/RESEARCH.md), Research Artifact

이 문서와 다른 Architecture 문서의 확정 기준은 현재 요청에 명시된 내용과 회수된 대화 범위에 한한다. Research의 RESEARCHED/HYPOTHESIS를 CONFIRMED로 승격하지 않는다. 기술적 경계를 문서화했다는 이유로 MVP·제품 범위·사용자 IA가 확정된 것으로 해석하지 않는다.

### 소스 범위

「SCENE — 추가 참조 원문」 §1–13은 Data Model·권한·tenant 기준, §14–31은 API 공통 계약과 Auth/Space/Event/Participant, §32–46은 나머지 Domain API, §47–48은 OPEN과 Architecture Guardrail의 소스다. 참조 대화의 마지막 API 정리는 transaction·Permission·각 Domain Caveat를 보완한다.

공통 규칙·기술 스택·Security·Data Model은 사용자가 명시한 기준을 우선 기록한다. 추가 원문에 없는 상세 DDL, 관계 cardinality, endpoint payload 등을 새로 정하지 않는다. 실제 미결 정책과 명시되지 않은 상세 계약은 OPEN으로 남긴다.

## 2. 제품과 기술 경계

- SCENE: Church Event Operations Platform. 상시 CMS 범위로 확장하지 않는다.
- Modular Monolith + REST + 단일 PostgreSQL.
- Small Core + 명확한 업무별 Domain. Domain 경계는 실제 user job과 transaction boundary를 기준으로 정리한다.
- Event Type에 Feature Set·Workflow를 하드코딩하지 않는다.
- Platform Core + Optional Capability 방향은 기술 Plugin Architecture 또는 사용자 Module 선택 UI의 확정을 의미하지 않는다.
- 초기부터 Microservice, Workflow Engine, 만능 Entity-Attribute 구조를 만들지 않는다.
- 현재 작업은 문서화. Backend/Frontend scaffold, Entity, DB migration, API 구현을 포함하지 않는다.

## 3. 기술 스택 기준선

| 영역 | 현재 기준 |
|---|---|
| Backend | Java 25, Spring Boot 4.x, Spring MVC, Spring Security, MyBatis, Gradle |
| Database | PostgreSQL, Flyway |
| Test | JUnit 5, Testcontainers |
| Frontend | React, TypeScript, Vite, TanStack Query, React Hook Form, Zod, Tailwind CSS |

요청된 기술 선택을 기록한 표다. 세부 patch version, 의존성 조합, 배포 topology·인프라를 추가 확정하지 않는다.

## 4. 문서별 책임

| 문서 | 책임 |
|---|---|
| [Data Model](data-model-v0.1.md) | Domain map, identity와 state 경계, tenant 관계 원칙 |
| [Security / Privacy](security-privacy-v0.1.md) | 인증·권한·책임 구분, tenant isolation, 정보 분류·보존 |
| [API Architecture](api-architecture-v0.1.md) | 공통 계약, API 영역, 업무 API map, Permission 후보, OPEN |
| [Product Definition](../product/PRODUCT_DEFINITION.md) | 제품 정의와 Research 승격 한계 |
| [Product Decisions](../product/PRODUCT_DECISIONS.md) | 기존 DEC 이력과 CONFIRMED 결정 |
| [Research](../product/RESEARCH.md) | Evidence·가설·연구 Artifact 진입점 |
| [Figma Governance](../design/figma-workspace-governance.md) | Figma 작업공간과 Artifact lifecycle 규칙 |

## 5. 용어 기준

- `users`: Operator identity. `participants`: Event의 운영 대상. 동일 개념으로 합치지 않는다.
- Application: submitted source information. Participant: operational subject.
- Space: tenant 맥락. Event: Event API의 tenant anchor. Figma Workspace나 Product Research의 Operational Workspace와 동일시하지 않는다.
- Space role, Event role, Permission, Operational Responsibility는 별도 개념이다.
- Finance, Assignment, Check-in의 현재 상태는 Participant 기본정보와 별도로 소유한다.
- Schedule: Current State. Notice: Broadcast / 변경 안내.
- Research의 Readiness·Presence는 구현 확정 Feature가 아니다.

## 6. 원문 배치 및 보존

Product 4개 문서는 각각 Context / Definition / Decision Log / Research Repository 역할을 유지한다. Research 상세를 각 Product 문서에 다시 복제하지 않는다.

| 첨부 원문 | 저장소 경로 |
|---|---|
| Retreat-v0.9-Product-Audit-Source-backed-Second-Pass.md | [retreat-v0.9-product-audit.md](../research/retreat-v0.9-product-audit.md) |
| 13-year-cross-event-experience-analysis-v0.1.md | [13-year-cross-event-experience-analysis.md](../research/13-year-cross-event-experience-analysis.md) |
| problem-cluster-synthesis-v0.1.md | [problem-cluster-synthesis.md](../research/problem-cluster-synthesis.md) |
| event-operational-complexity-dimensions-v0.2.md | [event-operational-complexity-dimensions-v0.2.md](../research/event-operational-complexity-dimensions-v0.2.md) |
| figma-workspace-governance-v0.1.md | [figma-workspace-governance.md](../design/figma-workspace-governance.md) |

Research Artifact와 Figma 규칙의 본문·버전·상태·Caveat·source register는 유지한다. Product 문서에는 최신 기준을 찾는 안내를 추가하고 기존 본문은 보존한다. 원문에서 언급하는 과거 파일명은 이 표로 대응한다.

Complexity v0.1 및 First-pass Audit는 현재 기준선으로 중복 배치하지 않는다. 원문의 과거 단계 언급은 이력이다. 원문에서 언급하는 PROJECT_INSTRUCTIONS.md와 AI 모델 사용 규칙은 이번 저장소 목표 구조 밖의 프로젝트 첨부 자료이며 이 저장소에 포함되지 않는다.

## 7. 문서 충돌 / 검토 필요 — OPEN

| 항목 | 기존 자료 | 최신 기준 / 처리 |
|---|---|---|
| 단계 | DEC-024 Discovery, DEC-027 초기 Product Definition / Technical Design 미진입 | 현재 요청은 Technical Design / implementation 전. 최신 단계 표시, DEC 원문·상태 보존. 공식 Decision Log 정합화는 검토 필요 |
| 제품명 | PRODUCT_DECISIONS §17 Product Name OPEN | 최신 요청의 SCENE 사용. 기존 OPEN은 당시 이력임을 안내. 새 DEC 생성 안 함 |
| 기술·계정·권한 | Product Definition §10 및 DEC-027에서 Domain/DB/API/Architecture, Participant Account Model 등이 미정 | 최신 요청 범위의 기술 기준만 기록. 전체 Product OPEN을 일괄 해결한 것으로 처리하지 않음 |
| Evidence 용어 | DEC-007 Evidence Types에 HYPOTHESIS 포함, RESEARCH §3은 Evidence Type이 아닌 Research State로 구분 | 양쪽 원문 보존. HYPOTHESIS를 확정 근거로 승격하지 않음. 분류 용어 정합화 OPEN |
| Event Owner | Product의 Event Owner/Leadership, 기술의 Event role OWNER | 동일 cardinality·권한·이전 정책으로 자동 치환하지 않음 |
| Error code | 공통 오류 예시는 APPLICATION_CLOSED, Form 상세는 FORM_CLOSED | 두 이름 모두 원문에 존재. 의미·매핑·통합 여부 OPEN. 임의 rename 안 함 |
| Pagination | 마지막 대화는 privacy/audit 로그를 cursor라고 표기 | 최신 요청·추가 원문 §43은 cursor 후보. 후보 상태 보존 |
| 권한 모델 | [Security](security-privacy-v0.1.md) §1·[API](api-architecture-v0.1.md#permissions) §18은 "Java enum + Role → Permission Set, DB `permissions / role_permissions` 테이블 없음"으로 Role만으로 권한을 정하는 기준. DEC-029는 사람별 권한을 요구하고 저장 구조를 OPEN으로 남김 | 2026-10-02 현 결정으로 해소: role 기본 집합(enum mapping) + 사람별 `event_user_permissions` GRANT/REVOKE. 테이블 금지는 role mapping 테이블에만 계속 적용. [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합) |

이 표는 충돌 기록이며 새 합의가 아니다(권한 모델 행은 2026-10-02 현 결정으로 해소한 기록). 구현 전 필요한 Gate Review와 실제 Request/Response/OpenAPI 상세 계약의 완료를 주장하지 않는다.

## 8. OPEN

업무·보안·계약의 통합 OPEN 목록은 [API Architecture 마지막 절](api-architecture-v0.1.md#open-items)에 둔다. 세부 dependency version, session store, 인프라와 제공 범위 밖의 상세 DDL도 미결 상태다.

## 2026-10-02 개인별 권한 (현 결정, DEC-029 정합)

2026-10-02 현 결정(SCENE 개발 리드 전달)으로 [DEC-029](../product/PRODUCT_DECISIONS.md#dec-029--행사-운영진의-업무-권한을-사람별로-달리-부여한다)와 enum 전용 Role 모델의 충돌을 정리한다.

- Event 권한 = Event role 기본 Permission Set(Java enum mapping, DB 테이블 없음) + 사람별 GRANT − 사람별 REVOKE. 사람별 차이는 `event_user_permissions`에 저장하고 Flyway V1 초기 스키마에 포함한다(SCENE Backend Lead).
- 부여·회수는 Event Owner만 한다. 운영자 추가·제거·role 변경도 Event Owner만 한다(현 결정 10/2). OWNER 권한은 override하지 않고 OWNER 전용 권한은 다른 운영자에게 부여하지 않는다. role 변경·운영자 제거 시 override는 사라진다. Owner 위임 수락 시 override는 위임 기록에 저장 후 지우고 취소 시 되살린다(현 결정 10/2).
- MANAGER/STAFF 기본 집합은 Backend Lead 초안, 현 승인으로 정한다. 미확정, 백엔드 리드 초안 대기(현 결정 10/2).
- 서버는 모든 요청에서 effective 집합으로 판정하고 변경마다 audit을 남긴다.
- 상세: [Data Model](data-model-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합), [API Architecture](api-architecture-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)(endpoint·오류 코드·키 목록 초안·회귀 표), [Security / Privacy](security-privacy-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합).
