# SCENE API Architecture v0.1

- 현재 단계: Technical Design / implementation 전
- 기준: 현재 문서화 요청, 사용자가 제공한 「SCENE — 추가 참조 원문」 §1–48, [API 아키텍처 공통 규칙](https://chatgpt.com/c/6abbe706-c888-83ee-bbee-9e09b10ca0c8)의 마지막 API 정리
- 상태: API 경계·원칙 baseline. 완성된 OpenAPI 또는 구현 계약 아님.
- [소스 우선순위·문서 충돌](architecture-v0.1.md), [Data Model](data-model-v0.1.md), [Security / Privacy](security-privacy-v0.1.md) 함께 적용.

## 1. 공통 계약

### Version / Scope

- Major version: `/api/v1`.
- `/api/v1/operator/**`, `/api/v1/public/**`, `/api/v1/participant/**` 인증·접근 경계 분리.
- Event-scoped API는 `eventId`를 tenant anchor로 사용. 서버가 `spaceId` resolve 후 tenant·업무 권한 검증.
- Space collection은 `/spaces/{spaceId}/...` 사용. Event 업무 경로에 Space와 Event를 중복 중첩하지 않는다.
- API는 Figma Screen 또는 DB table과 1:1 대응하지 않는다. user job / transaction boundary를 기준으로 설계한다.
- 판단 순서: User Job → Transaction Boundary → Authorization Boundary → Domain/Aggregate → API. Event Type 조건으로 API·Group/Room/Check-in Feature Set을 하드코딩하지 않는다.
- Participant/Application/Finance/Assignment/Check-in 상태 분리 유지.

### 표현과 DTO

- JSON: `camelCase`. DB: `snake_case`.
- URL: lowercase / kebab-case / 복수 명사. 아래 명시된 command와 자기 정보 경계는 그대로 유지.
- 외부 식별자: UUID. UUID가 권한 검사를 대신하지 않는다.
- API timestamp: ISO-8601 UTC canonical. UI는 local formatter로 사람이 읽기 좋게 표시한다.
- Timestamp 전달 형식과 Event/Schedule/Flight timezone model은 별도 문제다. 후자는 OPEN.
- List/Detail DTO 분리. Sensitive DTO 최소화.
- Entity/Mapper 객체를 직접 노출하지 않고 명시적 Request/Response DTO 사용. 예: `CreateEventRequest`, `UpdateEventRequest`, `EventSummaryResponse`, `EventDetailResponse`, `ParticipantListItemResponse`, `ParticipantDetailResponse`.
- 같은 endpoint가 Permission에 따라 몰래 다른 의미의 response를 반환하지 않도록 한다.
- Entity나 raw answers 전체를 편의상 모든 목록에 노출하지 않는다.

### Error Contract

- RFC 9457 Problem Details 기반.
- stable `code`, `traceId`, `errors` extension 사용.
- Frontend는 사람이 읽는 error message 문자열을 parsing하여 분기하지 않는다.
- 추가 원문의 예시 계약:

```json
{
  "type": "urn:scene:problem:validation-failed",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "요청 값이 올바르지 않습니다.",
  "traceId": "...",
  "errors": [
    {
      "field": "name",
      "code": "REQUIRED",
      "message": "이름은 필수입니다."
    }
  ]
}
```

대표 code:

```text
VALIDATION_FAILED
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
TOKEN_EXPIRED
FORBIDDEN
RESOURCE_NOT_FOUND
CONFLICT
INVALID_STATE_TRANSITION
CONCURRENT_MODIFICATION
TASK_VERSION_CONFLICT
INVALID_TASK_STATE
DUPLICATE_APPLICATION
APPLICATION_CLOSED
PARTICIPANT_ACCESS_INVALID
PARTICIPANT_ACCESS_EXPIRED
PARTICIPANT_SESSION_EXPIRED
PAYMENT_CONFLICT
ASSIGNMENT_CONFLICT
IDEMPOTENCY_CONFLICT
```

Form 상세의 `FORM_CLOSED`와 공통 예시의 `APPLICATION_CLOSED`는 둘 다 소스에 있다. 의미·매핑·통합 여부는 검토 필요. 이름을 임의 통합하지 않는다.

`TASK_VERSION_CONFLICT`·`INVALID_TASK_STATE`는 2026-10-02 #31 업무 전용 409 코드다(§8, DEC-062). 업무에서는 `CONCURRENT_MODIFICATION`·`INVALID_STATE_TRANSITION` 대신 이 두 코드를 쓴다.

### HTTP Status

| Status | 의미 |
|---|---|
| 200 | 조회 / 일반 성공 |
| 201 | 생성 |
| 204 | 성공 + body 없음 |
| 400 | Validation |
| 401 | Authentication |
| 403 | Authorization |
| 404 | Resource / Tenant boundary |
| 409 | Domain / State / Concurrency Conflict |
| 413 | Payload too large |
| 415 | Unsupported media |
| 422 | 형식은 맞지만 권한 규칙상 허용되지 않는 요청 (2026-10-02 개인별 권한 계약에서 추가, [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)) |
| 429 | Rate limit |
| 500 | Unexpected server error |

Tenant 밖 Resource의 존재를 숨겨야 하면 `404`. Resource를 볼 수 있지만 Action 권한이 없으면 `403`.

### List / Search

- 기본 offset pagination: `items + page`.
- 최대 `size`를 계약에 명시하며 초과 요청은 `400`. 자동으로 상한에 맞춰 줄이는 동작으로 바꾸지 않는다.
- `page`는 0부터 시작. `default size = 50`, `max size = 100`. 초과는 `400 PAGE_SIZE_EXCEEDED`.
- 요청 예: `?page=0&size=50`. 응답 예:

```json
{
  "items": [],
  "page": {
    "number": 0,
    "size": 50,
    "totalItems": 328,
    "totalPages": 7
  }
}
```
- logs/history는 cursor pagination 후보. 마지막 대화의 privacy/audit cursor 표현보다 최신 요청의 후보 상태를 우선한다.
- `q` / filter / sort는 allow-list. 임의 필드명·정렬식을 그대로 실행하지 않는다.
- 검색은 `?q=`, filter 예시는 `?status=...&groupId=...`. 다중값은 repeated query parameter 우선. 정렬 예: `?sort=createdAt,desc&sort=name,asc`.
- Domain별 허용 필드·정렬·안정적인 페이지 계약은 확인된 내용만 기록한다.

### 변경 / 중복 / 동시성

- Important state transition은 Command endpoint.
- 저위험 상태는 PATCH 가능. 모든 상태 변경마다 command를 만들지 않는다.
- `Idempotency-Key`는 선택적으로 적용. DB constraints, transaction, 선택적 optimistic locking을 함께 사용한다.
- 모든 table에 version을 넣지 않는다. 위험한 Assignment, Event configuration 일부, Operator-managed current state 일부에 선택 적용. 충돌은 `409 CONCURRENT_MODIFICATION`. (2026-10-02 #31, DEC-062) Group의 `GROUP_MOVE_CONFLICT`처럼 도메인 전용 409 코드를 허용한다. 업무(Task)는 `tasks.version`을 두고 complete·reopen에서만 검사하며, version 충돌은 `409 TASK_VERSION_CONFLICT`, 업무 상태 위반은 `409 INVALID_TASK_STATE`를 쓴다. 다른 도메인의 `CONCURRENT_MODIFICATION` 사용은 그대로다.
- Application 최초 제출, Payment 생성/Refund, Check-in 등 대화에 제시된 중복 위험 경계를 우선 기록한다. 모든 API에 의무화하지 않는다.
- Export와 외부 Integration도 Idempotency-Key 후보. Idempotency와 business uniqueness는 별개다.
- Key scope·TTL·동일 key/다른 payload·응답 재전달 세부는 OPEN.
- #7 후속 정책: Group 저장·공개는 오래된 덮어쓰기와 동일 작업 재시도의 중복 반영을 방지한다. 결과 불명 시 서버 반영 여부를 확인한다. 이 제품 요구를 충족할 구체적인 key·version·request 계약은 후속 설계한다.
- `X-Request-Id`는 요청 식별 개념, distributed tracing context는 분산 trace 전파 개념. 둘을 동일 개념으로 취급하지 않는다.
- 초기 `X-Request-Id`로 사용자 오류와 Backend log 연결. 분산 tracing 도입 시 `traceparent` / `tracestate`와 구분.
- 모든 Domain에 DELETE를 강제하지 않는다. Payment는 VOID/REFUND, Participant 익명화는 별도 command로 다룬다.

## 2. API 경로 읽는 법

아래 Domain 표의 `/...`는 별도 명시가 없으면 `/api/v1/operator/events/{eventId}` 뒤에 붙는다. 예: `GET /tasks`는 `GET /api/v1/operator/events/{eventId}/tasks`다.

Endpoint는 추가 참조 원문과 회수된 대화에 제시된 경로다. 메서드·payload·Role mapping을 관례로 추가하지 않는다(Role 기본 mapping은 계속 OPEN이다. 예외: `TASK_WRITE` 기본값은 2026-10-02 DEC-062로 확정, 사람별 GRANT/REVOKE는 2026-10-02 #39 [개인별 권한](#2026-10-02-개인별-권한-현-결정-dec-029-정합)). 후보·보류 상태는 각 절에 표시한다.

## 3. Operator / Public / Participant Auth & Session

| 영역 | 확인된 경계 | 기준 / 미결 |
|---|---|---|
| Operator | `POST /api/v1/operator/auth/login`, `GET /api/v1/operator/me`, `POST /api/v1/operator/auth/logout` | 운영계정 Session 인증, 자기 정보, logout |
| Public | `POST /api/v1/public/events/{eventId}/participant-sessions` | raw Access Key를 POST body로 검증하고 Participant session으로 연결 |
| Participant | `GET /api/v1/participant/me`, `POST /api/v1/participant/auth/logout` | Session scope의 자기 정보와 logout |

- Operator와 Participant 인증체계 분리.
- Operator `/me`에 모든 Space/Event role을 몰아넣지 않는다. Membership/Event Access는 각각 해당 API에서 다룬다.
- server-revocable session + `HttpOnly` / `Secure` / `SameSite` cookie + CSRF 보호 + Production SCENE Frontend CORS allowlist. 두 Session 독립 관리.
- Participant Access: cryptographically secure random, 최소 128-bit entropy 수준. DB에는 `key_hash`만 저장. raw key URL 전달 금지. 이름·전화번호 뒤 4자리·6자리 숫자·생년월일·사용자 PIN을 secret으로 쓰지 않는다.
- Brute-force 방어, server-side revocation 가능.
- 정확한 session store, TTL, recovery는 OPEN.
- Participant scope는 인증된 Event/Participant에서 도출. 다른 Participant의 정보를 임의 조회하는 경계를 만들지 않는다.
- Participant Session은 `participant_id / event_id / space_id`에 고정. Participant API에서 다른 Participant ID를 URL로 선택하게 하지 않는다.

## 4. Space / Member

- 확인된 collection 경계: `/api/v1/operator/spaces`.
- Space 하위 경계: `/api/v1/operator/spaces/{spaceId}/members`, `/api/v1/operator/spaces/{spaceId}/events`.
- 후보 Permission: `SPACE_READ`, `SPACE_UPDATE`, `MEMBER_READ`, `MEMBER_MANAGE`, `EVENT_CREATE`.
- Space role: `OWNER / ADMIN / MEMBER`.
- Organization 생성자 Owner, 가입 요청의 조직 Owner 승인, 대상자 초대 수락 흐름은 DEC-036~037로 확정했다. 초대·대기·취소·만료의 상세 계약은 후속 설계에서 정한다.
- Space OWNER cardinality / transfer policy는 OPEN.
- Member role 변경은 좁은 PATCH DTO. Membership 제거 전 Owner, Event responsibility, 기타 dependency 검사.

```http
GET    /api/v1/operator/spaces
GET    /api/v1/operator/spaces/{spaceId}
PATCH  /api/v1/operator/spaces/{spaceId}
GET    /api/v1/operator/spaces/{spaceId}/members
GET    /api/v1/operator/spaces/{spaceId}/members/{memberId}
PATCH  /api/v1/operator/spaces/{spaceId}/members/{memberId}
DELETE /api/v1/operator/spaces/{spaceId}/members/{memberId}
```

## 5. Event / Event Operator

- Event 업무 anchor: `/api/v1/operator/events/{eventId}`.
- Event Operator 경계: `/api/v1/operator/events/{eventId}/operators`.
- 후보 Permission: `EVENT_READ`, `EVENT_UPDATE`, `EVENT_LIFECYCLE`, `EVENT_USER_READ`, `EVENT_USER_MANAGE`.
- Event role: `OWNER / MANAGER / STAFF`.
- Event lifecycle 제품 전이는 #8/DEC-049~053을 따른다. 활성화·종료·ENDED 재개·ENDED 보관·ARCHIVED 해제를 구분한다. ACTIVE 직접 보관과 ARCHIVED 직접 재개는 허용하지 않는다. command·Owner 이전·본인 이탈 계약은 [2026-10-02 절](#2026-10-02-행사-lifecycle-command-30-dec-063)을 따른다.
- Event OWNER cardinality / transfer, Space role과 Event role의 상세 Permission mapping은 OPEN 또는 원문 대조 필요. (2026-10-02 현 결정: Event 권한은 role 기본 집합 + 사람별 `event_user_permissions` GRANT/REVOKE. MANAGER/STAFF 기본 집합은 미확정, 백엔드 리드 초안 대기(현 결정 10/2: Backend Lead 초안, 현 승인). 예외: `TASK_WRITE` 기본값은 2026-10-02 DEC-062로 확정([§8](#2026-10-02-업무-체크리스트-저장-계약-31-dec-062)). [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합))

```http
POST   /api/v1/operator/spaces/{spaceId}/events
GET    /api/v1/operator/spaces/{spaceId}/events
GET    /api/v1/operator/events/{eventId}
PATCH  /api/v1/operator/events/{eventId}
GET    /api/v1/operator/events/{eventId}/operators
POST   /api/v1/operator/events/{eventId}/operators
PATCH  /api/v1/operator/events/{eventId}/operators/{userId}          # {userId} = 대상 운영자 user_id (2026-10-02 현 결정)
DELETE /api/v1/operator/events/{eventId}/operators/{userId}
GET    /api/v1/operator/events/{eventId}/operators/{userId}/permissions   # 2026-10-02 개인별 권한
PUT    /api/v1/operator/events/{eventId}/operators/{userId}/permissions   # 2026-10-02 개인별 권한, Event OWNER만
```

운영자 컬렉션의 경로 변수는 `{userId}` = 대상 운영자의 `event_users.user_id`다(2026-10-02 현 결정). 예전 표기 `{operatorId}`는 정의가 없었고 같은 값으로 맞췄다. 운영자 추가·제거·role 변경과 개인별 권한 변경은 Event OWNER만 한다(2026-10-02 현 결정, [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)).

Event 생성 + creator를 `event_users.OWNER`로 생성하는 작업은 하나의 transaction. API 이름은 DB `event_users` 대신 `operators`. 최초 기준의 memberId 기반 추가는 조직 Member 경로로 남길 수 있으나 DEC-039의 행사 전용 협력자 경로도 필요하다. 모든 운영자에게 user → member → event operator를 강제하지 않는다. 행사 전용 초대·사용자 참조 계약은 2026-10-01 DEC-060으로 확정했다(아래 절).

Event 종료·재개·보관/해제·Owner 이전은 중요한 command 경계다. 제품 정책은 #4·#8에 확정했고 endpoint/DTO·세부 판정·동시성 계약은 후속이다.

## 6. Participant

- Operator 업무 경계: `/api/v1/operator/events/{eventId}/participants`.
- 후보 Permission: `PARTICIPANT_READ`, `PARTICIPANT_CONTACT_READ`, `PARTICIPANT_WRITE`.
- Participant는 운영 주체. Application 제출 원본·납부·배정·Check-in 상태를 한 객체에 몰아넣지 않는다.
- List/Detail와 연락처 접근 구분.
- 확정 endpoint:

| Method | 경로 | Permission |
|---|---|---|
| GET | `/participants` | `PARTICIPANT_READ` |
| GET | `/participants/{participantId}` | `PARTICIPANT_READ` |
| GET | `/participants/{participantId}/contact` | `PARTICIPANT_CONTACT_READ` |

Contact 조회는 `privacy_logs / CONTACT_VIEW` 대상. Participant List는 향후 Participant + Finance + Assignment + Check-in을 조합하는 Operational Read Model이 될 수 있으나 Participant Entity에 상태를 넣는 것은 아니다.

- `POST / PATCH / DELETE Participant`는 보류 상태. 확정 CRUD로 추가하지 않는다.
- Operator 수동 Participant 생성은 consent / Access 발급 정책과 함께 OPEN.
- 익명화 command는 아래 Privacy 절 참조. 일반 Participant DELETE로 대체하지 않는다.

## 7. Form / Application

| Method | 경로 | Permission | 목적 |
|---|---|---|---|
| GET | `/forms` | `EVENT_READ` | Form 목록 |
| POST | `/forms` | `FORM_WRITE` | Form 생성 |
| GET | `/forms/{formId}` | `EVENT_READ` | Form + Field 조회 |
| PATCH | `/forms/{formId}` | `FORM_WRITE` | 기본정보 수정 |
| POST | `/forms/{formId}/fields` | `FORM_WRITE` | Field 추가 |
| PATCH | `/forms/{formId}/fields/{fieldId}` | `FORM_WRITE` | Field 수정 |
| DELETE | `/forms/{formId}/fields/{fieldId}` | `FORM_WRITE` | 미사용 Field 제거 |
| GET | `/applications` | `APPLICATION_READ` | 제출 목록 |
| GET | `/applications/{applicationId}` | `APPLICATION_READ` | 제출 당시 답변 |

Field: `SYSTEM / NAME`, `SYSTEM / PHONE`, `CUSTOM / ...`. SYSTEM 의미를 Custom Field로 대체하지 않는다.

### Public 최초 제출

```http
GET /api/v1/public/events/{eventId}/forms/{formId}
POST /api/v1/public/events/{eventId}/forms/{formId}/applications
Idempotency-Key: ...
```

하나의 transaction:

```text
Form/Event 유효성 확인 → Field Validation → Application(SUBMITTED)
→ Answers → Participant 생성/연결 → participant_access 생성 → Audit → Commit
```

새 Participant Access가 생성되면 성공 응답에서 raw Access Key를 1회 전달한다. retry 시 키 전달과 응답 재현의 세부 방식은 원문에 없으므로 OPEN.

### Participant 재제출

```http
POST /api/v1/participant/application/revisions
```

현재 SUBMITTED Application 확인 → 새 Application / Answers 생성 → 이전 Application SUPERSEDED → 새 Application SUBMITTED를 transaction으로 처리한다. 기존 answers UPDATE 금지.

주요 오류: `FORM_CLOSED`, `FORM_NOT_FOUND`, `APPLICATION_VALIDATION_FAILED`, `DUPLICATE_APPLICATION`, `APPLICATION_CONFLICT`.

Form OPEN/CLOSE의 실제 schema는 OPEN. 오류 경계가 있다는 이유로 상태 컬럼·open/close API를 추가하지 않는다. `APPLICATION_MANAGE`는 Permission 후보이며 소스에 없는 mutation 계약을 새로 만들지 않는다.

## 8. Task

| Method | 경로 | Permission |
|---|---|---|
| GET | `/tasks` | `EVENT_READ` |
| POST | `/tasks` | `TASK_WRITE` |
| GET | `/tasks/{taskId}` | `EVENT_READ` |
| PATCH | `/tasks/{taskId}` | `TASK_WRITE` |
| DELETE | `/tasks/{taskId}` | `TASK_WRITE` |
| PUT | `/tasks/{taskId}/items/{itemId}` | 담당자 본인 또는 `TASK_WRITE` (2026-10-02 #31) |
| POST | `/tasks/{taskId}/complete` | 담당자 본인 또는 `TASK_WRITE` (2026-10-02 #31) |
| POST | `/tasks/{taskId}/reopen` | 담당자 본인 또는 `TASK_WRITE` (2026-10-02 #31) |

상태: `TODO / DOING / DONE / CANCELLED`. (2026-10-02 #31, DEC-062) PATCH로는 `status: DONE`과 `status: DOING`을 설정할 수 없다(둘 다 400 `VALIDATION_FAILED`). 완료는 `POST /tasks/{taskId}/complete`로만, DOING은 첫 체크(D8)로만, 다시 진행은 `POST /tasks/{taskId}/reopen`으로만 한다. `status`로 PATCH에서 보낼 수 있는 값은 `CANCELLED`뿐이며 별도 cancel command는 두지 않는다. `status: TODO` 지정과 CANCELLED에서 다른 상태로 되돌리기(취소 복구)도 PATCH로 하지 않는다 **(제안)**: 400 `VALIDATION_FAILED`, 취소 복구는 범위 밖. 제목·담당자 등 status가 아닌 필드는 계속 PATCH로 바꾼다. `tasks.version`은 모든 업무에 두지만 complete·reopen에서만 검사한다. Project Management 제품으로 확장하지 않는다.

### 2026-10-02 업무 체크리스트 저장 계약 (#31, DEC-062)

[#31 계약 초안](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946042935), [#31 현 결정 기록 (10/2)](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946079736), [#30 정합 메모](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946074503)를 반영한다. #14(D02) 화면 규칙(완료 후 체크 읽기 전용, 명시적 '다시 진행'에서만 재개, 다시 진행 → 진행 중 2/2 체크 유지, 다시 진행 뒤 모든 항목 해제 가능)의 서버 저장 계약이다. 저장 구조는 [Data Model](data-model-v0.1.md#2026-10-02-업무-체크리스트-31-dec-062) §5, 권한 규칙은 [Security / Privacy](security-privacy-v0.1.md#2026-10-02-업무-처리-권한-31-dec-062) §1의 같은 날짜 절을 따른다. 초안에서 문서에 없던 이름·필드·규칙 중 현 결정에 포함되지 않은 것은 **(제안)**으로 남긴다.

현 결정 (10/2)

- D1: 담당자 본인은 `TASK_WRITE` 없이 자기 업무를 체크·완료·다시 진행할 수 있다.
- D2: 완료는 모든 항목이 체크됐을 때만 가능하다. 자동 완료는 없다(2/2는 '체크리스트 완료'일 뿐 DONE이 아니다).
- D3 (초안 추천 A 승인): PATCH로는 DONE·DOING 전환을 할 수 없다(400 `VALIDATION_FAILED`). 완료는 `complete`, 다시 진행은 `reopen` command로만 하고, DOING은 첫 체크(D8)로만 된다. `CANCELLED`와 status가 아닌 필드는 PATCH에 남긴다.
- D4: 업무 409는 `TASK_VERSION_CONFLICT`, `INVALID_TASK_STATE`다. 업무에서는 공통 `CONCURRENT_MODIFICATION`을 쓰지 않는다. 다른 도메인의 `CONCURRENT_MODIFICATION` 사용은 그대로다.
- D5: version은 요청 본문(`version`)에 담는다. `If-Match` 헤더·`ETag`는 쓰지 않는다.
- D6: 지금은 행사 ARCHIVED만 업무 쓰기를 막는다. DRAFT·ACTIVE·ENDED는 제한 없음. 차단 코드는 `EVENT_ARCHIVED` (2026-10-02 #30 L5, DEC-063).
- D7: v1에는 일괄 체크(전체 체크) endpoint가 없다. 항목별 PUT만 쓴다.
- D8: 첫 체크에서 TODO → DOING으로 바뀌고, 이후 모든 항목을 해제해도 TODO로 돌아가지 않는다.
- 함께 확정: OWNER·MANAGER는 기본 `TASK_WRITE`를 갖고 STAFF는 갖지 않는다. 업무당 담당자는 1명이다. 새 테이블 `task_checklist_items`는 예외로 승인했다.

Endpoint (`/api/v1/operator/events/{eventId}` 뒤에 붙음)

| Method | 경로 | Permission | 비고 |
|---|---|---|---|
| GET | `/tasks` | `EVENT_READ` | 기존. 목록 DTO에 체크 요약 추가 |
| GET | `/tasks/{taskId}` | `EVENT_READ` | 기존. 상세 = `TaskStateResponse` + 기존 필드 |
| PUT | `/tasks/{taskId}/items/{itemId}` | 담당자 본인 또는 유효 `TASK_WRITE` | 신규. 체크 항목 설정 |
| POST | `/tasks/{taskId}/complete` | 담당자 본인 또는 유효 `TASK_WRITE` | 신규. 업무 완료 |
| POST | `/tasks/{taskId}/reopen` | 담당자 본인 또는 유효 `TASK_WRITE` | 신규. 다시 진행 |

- 체크는 뒤집기(toggle)가 아니라 SET이다. 두 사람이 같은 항목을 같은 값으로 설정해도 같은 상태로 끝나고 충돌이 없다. 같은 값 재요청은 변경 없이 200(멱등).
- 항목 설정은 version을 받지 않는다(SET이라 안전). 완료·다시 진행은 `version`을 받는다. version은 업무 상태가 바뀌는 모든 쓰기(항목 설정 포함)마다 +1.
- 목록 filter **(제안)**: `?assignee=me`(내 업무), `?status=TODO&status=DOING`(repeated). 정렬·pagination은 §1 공통 규칙(`items + page`, default 50, max 100, 초과 `400 PAGE_SIZE_EXCEEDED`).
- 일괄 설정 `PUT /tasks/{taskId}/items`는 두지 않는다(D7).
- 체크 항목 추가·삭제·이름 변경(체크리스트 구조 편집)은 #31 범위 밖이다. 하는 경우 기존 `PATCH /tasks/{taskId}` + `version` 필수로 묶는 것을 제안한다.
- 담당 지정·변경은 기존 `PATCH /tasks/{taskId}`(`TASK_WRITE`)로 한다.
- `Idempotency-Key`는 이 세 endpoint에 쓰지 않는다 **(제안)**. SET 의미와 목표 상태 멱등으로 재시도가 안전하다(§1 "선택 적용").

Request / Response

```http
PUT /api/v1/operator/events/{eventId}/tasks/{taskId}/items/{itemId}
{ "checked": true }

POST /api/v1/operator/events/{eventId}/tasks/{taskId}/complete
{ "version": 7 }

POST /api/v1/operator/events/{eventId}/tasks/{taskId}/reopen
{ "version": 8, "reason": "로비 표지 위치 변경" }   # reason은 선택 (제안, 최대 500자)
```

`TaskStateResponse` (쓰기 응답·상세·409 본문 공통)

```json
{
  "taskId": "uuid",
  "status": "DOING",
  "version": 8,
  "checklist": {
    "done": 2,
    "total": 2,
    "items": [
      {
        "itemId": "uuid",
        "label": "안내 문구 확인",
        "position": 1,
        "checked": true,
        "checkedByUserId": "uuid",
        "checkedByDisplayName": "김OO",
        "checkedAt": "2026-10-02T05:10:00Z"
      }
    ]
  },
  "assigneeUserId": "uuid",
  "assigneeDisplayName": "이OO",
  "completedByUserId": null,
  "completedByDisplayName": null,
  "completedAt": null,
  "actions": { "canCheck": true, "canComplete": true, "canReopen": false, "blockedReason": null },
  "outcome": "UPDATED"
}
```

- 모든 쓰기 응답과 409 본문에 같은 `TaskStateResponse`를 담는다. 클라이언트는 받은 상태를 그대로 그린다. 체크 수·상태 계산은 서버만 한다.
- `outcome`(쓰기 응답만): `UPDATED | NO_CHANGE`(항목), `COMPLETED | ALREADY_DONE`(complete), `REOPENED | ALREADY_OPEN`(reopen). #27의 `outcome: ALREADY_ACCEPTED`와 같은 방식이다.
- 운영자 참조는 #39와 같이 `event_users.user_id`(= `users.id`)로 한다: `assigneeUserId`(담당자), `checkedByUserId`(체크한 사람), `completedByUserId`(완료한 사람)와 각각의 `…DisplayName`만 담는다(DEC-060: 행사 전용 협력자에게 다른 운영자는 이름·역할만). 담당자가 없으면 `assigneeUserId`·`assigneeDisplayName` = null. 해제된 항목은 `checkedByUserId`·`checkedByDisplayName`·`checkedAt` = null이고 과거 기록은 audit에 남는다. `checkedByUserId`·`completedByUserId`는 기록 참조라 그 사람이 운영자에서 제거돼도 남는다.
- `actions`·`blockedReason`(`EVENT_ARCHIVED | TASK_DONE | TASK_CANCELLED | CHECKLIST_INCOMPLETE | FORBIDDEN | null`) **(제안)**: DEC-031 "실행 불가하면 이유와 함께 비활성화"를 화면이 서버 판정 그대로 그리게 한다. 버튼 표시용이며 서버는 쓰기 때마다 다시 판정한다. `EVENT_ARCHIVED` 값은 #30 결정에 맞춘다.
- `CHECKED`(#14 Figma 변수 ONE/CHECKED/DONE의 CHECKED)는 저장 상태가 아니라 `status != DONE && done == total`로 계산한다.
- 목록 `TaskListItemResponse`: `taskId, title, status, assigneeUserId, assigneeDisplayName, checklist {done, total}, version` (항목 상세 제외).
- 시각은 ISO-8601 UTC(§1 공통 규칙).

상태 전이 (서버 판정)

| 현재 | 동작 | 결과 |
|---|---|---|
| TODO | 첫 항목 체크 | DOING (D8) |
| DOING | 항목 체크/해제 | DOING 유지. 0/n이 돼도 TODO로 돌리지 않음 (D8) |
| DOING, 2/2에서 항목 해제 | 항목 해제 | '체크리스트 완료' 표시만 사라지고 DOING 그대로 |
| TODO·DOING, done == total | complete | DONE, `completedByUserId`·`completedAt` 기록 |
| TODO·DOING, done < total | complete | 409 `INVALID_TASK_STATE` `reason: CHECKLIST_INCOMPLETE` (D2) |
| 항목 0개 업무 | complete | DONE (체크리스트 없는 업무) |
| DONE | 항목 변경 | 409 `INVALID_TASK_STATE` `reason: TASK_DONE` (완료 후 체크는 읽기 전용) |
| DONE | reopen | DOING, 체크 유지, `completedByUserId`·`completedAt` = null |
| CANCELLED | 항목·complete·reopen | 409 `INVALID_TASK_STATE` `reason: TASK_CANCELLED` (취소 복구는 범위 밖) |

권한 판정

- 조회(목록·상세): 유효 `EVENT_READ`. 조직 관리자(Space OWNER/ADMIN)는 행사 운영자가 아니어도 조회할 수 있고 쓰기는 403이다(DEC-028: 조회 ≠ 수정).
- 항목 설정·완료·다시 진행: **업무 담당자 본인** 또는 **유효 `TASK_WRITE`** (D1). 담당 지정 자체가 그 업무 처리 권한이며, 빼려면 담당을 바꾼다.
- role 기본값: OWNER·MANAGER는 `TASK_WRITE` 포함, STAFF는 미포함(담당 업무만). 유효 권한 = role 기본값 + 사람별 GRANT − REVOKE([개인별 권한](#2026-10-02-개인별-권한-현-결정-dec-029-정합), 현 결정 10/2). 사람별 GRANT/REVOKE는 Event Owner만 한다.
- 그룹 리더 역할만으로는 업무를 쓸 수 없다(DEC-030: 수정 권한 자동 부여 안 함).
- 권한 회수·이탈 직후 기존 세션: 매 요청 현재 권한으로 다시 판정한다(DEC-031). 행사 접근이 회수되면 403 `NOT_A_MEMBER`(#30 코멘트 기준, 제안), 역할·권한 부족은 403 `FORBIDDEN`.

판정 순서와 오류

401 인증 → 404 tenant·업무·항목 → 403 권한 → 400 요청 값 → 409 행사 상태 → 변경 없음이면 200 → 409 업무 상태 → 409 version.

| 결과 | HTTP | code | 본문 |
|---|---|---|---|
| 성공 / 같은 값 재요청 | 200 | — | `TaskStateResponse` (`outcome`) |
| 로그인 안 됨 | 401 | `AUTHENTICATION_REQUIRED` | |
| 다른 행사·tenant 업무, 없는 업무 | 404 | `RESOURCE_NOT_FOUND` | 존재 숨김 |
| 이 업무에 없는 itemId (구조 편집으로 삭제 포함) | 404 | `RESOURCE_NOT_FOUND` | 업무 조회 가능하면 `task` 첨부 **(제안)** |
| 담당자 아님 + 유효 `TASK_WRITE` 없음 | 403 | `FORBIDDEN` | |
| 행사 접근 회수 | 403 | `NOT_A_MEMBER` (#30, 제안) | |
| `checked` 누락·boolean 아님, `version` 누락 | 400 | `VALIDATION_FAILED` | `errors[]` |
| 행사 ARCHIVED | 409 | `EVENT_ARCHIVED` (DEC-063) | `eventStatus`, `task` |
| DONE 업무 항목 변경 / 미완료 체크로 complete / CANCELLED | 409 | `INVALID_TASK_STATE` | `reason`, `task` |
| complete·reopen의 `version` ≠ 현재 | 409 | `TASK_VERSION_CONFLICT` | `task` |

409 본문 예 (RFC 9457 + 확장):

```json
{
  "type": "urn:scene:problem:task-version-conflict",
  "title": "Task version conflict",
  "status": 409,
  "code": "TASK_VERSION_CONFLICT",
  "detail": "다른 사람이 먼저 이 업무를 바꿨습니다.",
  "traceId": "...",
  "task": { "...": "TaskStateResponse" }
}
```

- ARCHIVED 업무 쓰기 차단 코드는 `EVENT_ARCHIVED`다(DEC-063). 업무 쓰기에는 `EVENT_ENDED`를 쓰지 않는다.
- ENDED 행사는 지금 업무 쓰기를 막지 않는다(D6). #30이 동결 대상 업무 구분을 정하면 서버의 행사 상태 판정 지점에서 추가한다. `tasks.kind` 같은 업무 유형 필드는 지금 만들지 않는다.
- 이미 목표 상태면 version과 무관하게 200: complete인데 이미 DONE → `ALREADY_DONE`, reopen인데 이미 TODO/DOING → `ALREADY_OPEN`. 재시도와 '다른 사람이 먼저 같은 일을 함'을 충돌로 보지 않는다.

동시성·멱등성 (구현 기준)

- 항목 설정·완료·다시 진행 모두 한 transaction에서 **업무 행을 먼저 잠근다**(`SELECT … FOR UPDATE`, `findById(spaceId, eventId, taskId)`). '마지막 항목 해제'와 'complete'가 동시에 와도 하나가 먼저 끝나고 나중 것은 바뀐 상태로 판정한다(체크 1/2인데 DONE이 되는 경우 없음).
- 항목 설정: 값이 같으면 아무것도 바꾸지 않는다(`checkedByUserId`·`checkedAt`·version 유지, audit 없음, `NO_CHANGE`). 다르면 항목 갱신 + 업무 상태 재계산 + version +1.
- 두 사람이 동시에 같은 항목 체크: 먼저 커밋한 사람이 `checkedByUserId`, 두 번째는 200 `NO_CHANGE`.
- 서로 다른 항목 동시 체크: 둘 다 성공(항목 PUT은 version 검사 없음). version은 차례로 +1.
- 완료·다시 진행: `UPDATE tasks … WHERE id = ? AND version = ? AND status IN (…)` 한 행 성공으로 판정하고, 0행이면 다시 읽어 `ALREADY_*` / `INVALID_TASK_STATE` / `TASK_VERSION_CONFLICT`로 분류한다.

클라이언트 재시도

- 낙관적 표시 후 서버 응답 상태로 덮어 그린다. 409면 본문 `task`로 되돌려 그리고 새로 고침 없이 안내한다.
- 오프라인 큐는 (taskId, itemId)별 마지막 값만 보낸다. 같은 값 재전송은 안전하다.
- 결과 불명(시간 초과): 같은 요청을 다시 보내거나 `GET /tasks/{taskId}`로 확인한다(DEC-047 '결과 불명은 반영 여부 확인 후 재시도'와 같은 원칙).
- complete/reopen 재전송이 409 `TASK_VERSION_CONFLICT`를 받으면 자동 재시도하지 않고 사용자에게 현재 상태를 보여 준다.

기록 (audit)

- 상태가 바뀐 쓰기만 `audit_logs`에 남긴다: 실행자, 시각, 업무·항목, 전후(`checked`, `status`, `version`), reopen `reason`. 변경 없음은 기록하지 않는다. action 이름 **(제안)**: `TASK_ITEM_CHECKED / TASK_ITEM_UNCHECKED / TASK_COMPLETED / TASK_REOPENED`.
- 화면용 최신 정보는 DTO의 `checkedByUserId`·`checkedAt`, `completedByUserId`·`completedAt`이다. 전체 이력은 기존 `GET /audit-logs`(`AUDIT_LOG_READ`)로 본다. 업무별 이력 API는 만들지 않는다.
- 업무·체크 기록은 보존 정책표의 '운영 기록' 키를 따른다(DEC-061).
- 운영자 제거(`DELETE /operators/{operatorId}`, DEC-060의 행사 접근 회수 포함): 같은 transaction에서 그 사람이 담당인 업무의 `assignee_user_id`를 NULL(미배정)로 바꾸고 업무마다 audit(전 담당자, 사유 = 운영자 제거)을 남긴다. 업무는 삭제하지 않는다(cascade 삭제 없음). 미완료(TODO·DOING) 업무는 목록에서 '담당자 없음'으로 보이고 유효 `TASK_WRITE`가 있는 운영자가 다시 지정한다. DONE·CANCELLED 업무도 assignee FK 때문에 함께 NULL이 된다 **(제안)**. 처리 기록은 `completed_by_user_id`와 audit로 남는다. `checked_by_user_id`·`completed_by_user_id`는 `users(id)` 기록 참조라 바뀌지 않는다.
- #30 연계 **(제안)**: 종료 경고(DEC-050)·이탈 책임 판정의 '미완료 업무'는 `TODO / DOING`이다.

회귀 테스트

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 담당자가 0/2에서 항목 1 체크 | 200 `UPDATED`, 1/2, status DOING, version +1, `checkedByUserId` = 본인 |
| 2 | 1번 직후 같은 요청 재전송 | 200 `NO_CHANGE`, version·`checkedAt` 그대로, audit 추가 없음 |
| 3 | A·B가 동시에 같은 항목 `checked: true` | 둘 다 200, 최종 checked, `checkedByUserId` = 먼저 커밋한 사람, 한쪽 `NO_CHANGE` |
| 4 | A·B가 동시에 다른 항목 체크 | 둘 다 200, 최종 2/2, version 2 증가 |
| 5 | 2/2(체크리스트 완료)에서 항목 해제 | 200, 1/2, status DOING, DONE 아님 |
| 6 | 2/2 상태로 complete, 최신 version | 200 `COMPLETED`, DONE, `completedByUserId`·`completedAt` 기록 |
| 7 | 1/2 상태로 complete | 409 `INVALID_TASK_STATE` `reason: CHECKLIST_INCOMPLETE`, 본문 1/2 |
| 8 | 항목 0개 업무 complete | 200 `COMPLETED` |
| 9 | DONE 업무 항목 해제 | 409 `INVALID_TASK_STATE` `reason: TASK_DONE`, 본문 DONE 2/2 |
| 10 | DONE 업무에 이미 체크된 항목 `checked: true` 재전송 | 200 `NO_CHANGE` |
| 11 | DONE에서 reopen | 200 `REOPENED`, DOING 2/2 (체크 유지) → 이후 항목 1·2 모두 해제 가능 (#14 10/1 결정) |
| 12 | 다른 사람이 항목 해제한 뒤 이전 version으로 complete | 409 `TASK_VERSION_CONFLICT`, 본문 1/2·새 version |
| 13 | 마지막 항목 해제와 complete가 동시에 도착 | 최종 상태가 'DONE + 1/2'인 경우 없음. complete는 200 또는 409 중 하나 |
| 14 | complete 응답 유실 후 같은 요청 재전송 | 200 `ALREADY_DONE` |
| 15 | 이미 DOING인 업무 reopen | 200 `ALREADY_OPEN`, version 그대로 |
| 16 | 담당자 아님, `TASK_WRITE` 없는 STAFF가 항목 체크 | 403 `FORBIDDEN`, 상태 불변 |
| 17 | Event Owner가 STAFF에게 `TASK_WRITE` GRANT → 남의 업무 체크 | 200 |
| 18 | MANAGER의 `TASK_WRITE`를 REVOKE → 남의 업무 complete / 자기 담당 업무 complete | 403 `FORBIDDEN` / 200 (담당자 규칙, D1) |
| 19 | 조직 관리자(행사 운영자 아님)가 조회 / 항목 체크 | 200 / 403 `FORBIDDEN` |
| 20 | 다른 행사의 taskId로 호출 | 404 `RESOURCE_NOT_FOUND` |
| 21 | ENDED 행사의 후속 업무 체크·완료·다시 진행 | 200 |
| 22 | ENDED 행사의 다른 유형 업무(현장 업무 등) 체크 | 200 (D6: 지금은 ENDED에서 차단하지 않음. #30이 동결 대상을 정하면 다시 정함) |
| 23 | ARCHIVED 행사 업무 체크·complete·reopen (같은 값 재전송 포함) | 409 `EVENT_ARCHIVED` (DEC-063), 상태 불변, 조회는 200 |
| 24 | 체크 화면을 연 뒤 행사 보관 → 체크 | 23과 같음 (요청 시점 재판정) |
| 25 | 이탈로 행사 접근 회수 후 같은 세션에서 체크 | 403 `NOT_A_MEMBER` (#30, 제안) |
| 26 | `checked` 누락 / complete에 `version` 누락 | 400 `VALIDATION_FAILED` |
| 27 | 구조 편집으로 지운 itemId에 체크 | 404 `RESOURCE_NOT_FOUND` |
| 28 | 행사 전용 협력자가 받은 체크한 사람 정보 | `checkedByUserId`, `checkedByDisplayName`만 (연락처 없음) |
| 29 | 상태가 바뀐 쓰기 1건 | audit 1건, 전후 값·실행자 포함. `NO_CHANGE`는 0건 |
| 30 | `PATCH /tasks/{taskId}` `{"status":"DONE"}` | 400 `VALIDATION_FAILED`, 상태 불변 (D3) |
| 31 | `PATCH /tasks/{taskId}` `{"status":"CANCELLED"}` (`TASK_WRITE`) | 200, CANCELLED. 이후 항목 체크는 409 `INVALID_TASK_STATE` `reason: TASK_CANCELLED` |
| 32 | TODO 업무에 `PATCH /tasks/{taskId}` `{"status":"DOING"}` | 400 `VALIDATION_FAILED`, 상태 TODO 그대로, version 불변 (D3) |
| 33 | DONE 업무에 `PATCH /tasks/{taskId}` `{"status":"DOING"}` | 400 `VALIDATION_FAILED`, 상태 DONE 그대로 (다시 진행은 reopen만, D3) |
| 34 | DOING 업무에 `PATCH` `{"status":"TODO"}` / CANCELLED 업무에 `PATCH` `{"status":"TODO"}` | 400 `VALIDATION_FAILED` (제안) |
| 35 | `PATCH /tasks/{taskId}` 제목만 변경 (`TASK_WRITE`) | 200, status 불변 |
| 36 | 담당 업무(TODO 1건·DOING 1건·DONE 1건)가 있는 운영자를 제거 | 같은 transaction에서 세 업무 모두 `assigneeUserId` = null(미배정), 업무별 audit 1건, 업무·체크 항목 삭제 없음 |
| 37 | 36 이후 그 업무들 조회 | 그 사람이 체크한 항목의 `checkedByUserId`·`checkedByDisplayName`·`checkedAt`, DONE 업무의 `completedByUserId`·`completedAt` 그대로 |
| 38 | 36 이후 미배정 업무를 `TASK_WRITE` 없는 STAFF가 체크 / `TASK_WRITE` 있는 MANAGER가 체크 | 403 `FORBIDDEN` / 200 |
| 39 | 제거된 사용자를 같은 행사에 다시 추가 | 이전 담당 업무가 자동으로 다시 배정되지 않음 (제안) |

## 9. Schedule / Notice

Schedule = Current State. Notice = Broadcast / 변경 안내.

| Method | Schedule 경로 | Permission |
|---|---|---|
| GET | `/schedules`, `/schedules/{scheduleId}` | `EVENT_READ` |
| POST | `/schedules` | `SCHEDULE_WRITE` |
| PATCH | `/schedules/{scheduleId}` | `SCHEDULE_WRITE` |
| POST | `/schedules/{scheduleId}/publish`, `/schedules/{scheduleId}/cancel` | `SCHEDULE_WRITE` |

참가자가 소비하는 상태 변경은 publish/cancel command. Schedule mode는 `DATE / TIME`, 상태는 `DRAFT / PUBLISHED / CANCELLED`. 상태 목록이 모든 전이 조건의 확정을 뜻하지 않는다.

| Method | Notice 경로 | Permission |
|---|---|---|
| GET | `/notices`, `/notices/{noticeId}` | `EVENT_READ` |
| POST | `/notices` | `NOTICE_WRITE` |
| PATCH | `/notices/{noticeId}` | `NOTICE_WRITE` |
| POST | `/notices/{noticeId}/publish`, `/notices/{noticeId}/archive` | `NOTICE_WRITE` |

```http
GET /api/v1/participant/schedules
GET /api/v1/participant/notices
```

현재 Event / Participant scope에 맞는 공개 정보를 반환한다. Notice targeting의 Role/Group 조건은 ERD에서 확인되지 않아 Target Model을 선행 설계하지 않는다.

Notice 상태: `DRAFT / PUBLISHED / ARCHIVED`.

## 10. Finance — Fee / Payment

Fee = 얼마를 내야 하는가. Payment = 실제 금전 흐름. Permission 후보 이름은 최신 요청의 `FINANCE_READ / FINANCE_WRITE`를 사용한다. 이전 `PAYMENT_READ / PAYMENT_WRITE`로 되돌리지 않는다.

| Method | 경로 | Permission |
|---|---|---|
| GET | `/fees`, `/fees/{feeId}` | `FINANCE_READ` |
| POST | `/fees` | `FINANCE_WRITE` |
| PATCH | `/fees/{feeId}` | `FINANCE_WRITE` |
| POST | `/fees/{feeId}/waive`, `/fees/{feeId}/cancel` | `FINANCE_WRITE` |
| GET | `/payments`, `/payments/{paymentId}` | `FINANCE_READ` |
| POST | `/payments` | `FINANCE_WRITE` |
| POST | `/payments/{paymentId}/void`, `/payments/{paymentId}/refund` | `FINANCE_WRITE` |

`WAIVED`, `CANCELLED`는 의미 있는 전이이므로 command 처리. Payment 오류는 VOID, 환불은 REFUND transaction 추가. Payment UPDATE/DELETE API는 제공하지 않는다.

Payment 생성·Refund는 `Idempotency-Key` 적용 권장 경계다. Payment permission별 상세 검증 조건·금액 schema는 새로 확정하지 않는다.

```http
GET /api/v1/participant/fees
```

자기 납부 상태만 제공. 내부 회계 메모·처리자 정보 제외.

## 11. Group

조회 `EVENT_READ`, 쓰기 `GROUP_WRITE`.

2026-09-30 후속 정책: 아래 편성 변경·이동은 운영 작업본을 변경한다. 저장만으로 참가자 공개본을 바꾸지 않는다. 일반 조장은 공개된 자기 조만 조회하며 준비 중 편성 접근은 별도 업무 권한으로 검사한다. 공개 권한·실행 endpoint와 DTO는 상세 계약에서 정한다.

```http
GET    /groups
POST   /groups
GET    /groups/{groupId}
PATCH  /groups/{groupId}
DELETE /groups/{groupId}
POST   /groups/{groupId}/members
DELETE /groups/{groupId}/members/{participantId}
POST   /group-moves
GET    /groups/{groupId}/leaders
POST   /groups/{groupId}/leaders
DELETE /groups/{groupId}/leaders/{leaderId}
```

이미 다른 Group에 배정된 Participant 이동은 `/group-moves` 사용. 개념 request:

```json
{
  "participantId": "...",
  "fromGroupId": "...",
  "toGroupId": "..."
}
```

현재 Assignment 확인 → source 제거 → target 추가 → constraint 검사 → audit를 하나의 transaction으로 처리. 중간 unassigned 상태를 외부에 노출하지 않는다.

오류: `GROUP_NOT_FOUND`, `GROUP_ASSIGNMENT_CONFLICT`, `GROUP_MOVE_CONFLICT`, `CONCURRENT_MODIFICATION`.

Leader endpoint 경계는 유지하되 `group_leaders`가 참조하는 identity / request target 타입은 OPEN.

```http
GET /api/v1/participant/group
```

자기 **공개본**만 반환하며 다른 Participant의 Group을 임의 조회하지 않는다. 공개 전 준비 중 / 공개됐지만 미배정 / 현재 배정을 구분하고 공개된 배정의 마지막 갱신 시각을 제공한다. 작업본 저장 직후에도 다시 공개하기 전까지 이전 공개본을 반환한다. 사람의 배정 판단을 지원하며 자동 편성을 확정하지 않는다.

## 12. Room / Accommodation

쓰기 `ROOM_WRITE`. 조회 Permission의 세부 매핑은 회수된 대화에 명시되지 않아 원문 대조 필요.

```http
GET    /rooms
POST   /rooms
GET    /rooms/{roomId}
PATCH  /rooms/{roomId}
DELETE /rooms/{roomId}
POST   /rooms/{roomId}/members
DELETE /rooms/{roomId}/members/{participantId}
POST   /room-moves
```

Group과 유사해도 Domain을 합치지 않는다. Room 이동의 source/target 변경은 하나의 transaction.

```http
GET /api/v1/participant/room
```

## 13. Transportation

쓰기 `RIDE_WRITE`. 조회 Permission 상세는 원문 대조 필요. 신청 당시 이동 희망과 실제 배정 분리.

```http
GET    /rides
POST   /rides
GET    /rides/{rideId}
PATCH  /rides/{rideId}
DELETE /rides/{rideId}
POST   /rides/{rideId}/members
DELETE /rides/{rideId}/members/{participantId}
POST   /ride-moves
```

Filter: `direction`, `mode`. 방향: `OUTBOUND / RETURN / LOCAL`. 방향이 다르면 동일 Participant의 복수 Ride Assignment 가능. 이동은 move command transaction.

```http
GET /api/v1/participant/rides
```

Participant에게 실제 자기 배정 결과 반환.

## 14. Check-in

`checkins` = current state, `checkin_logs` = history.

| Method | 경로 | Permission / 기준 |
|---|---|---|
| GET | `/check-in-roster` | `EVENT_READ`; 현장 처리를 위한 Read Model |
| POST | `/check-ins` | `CHECKIN_WRITE`; Idempotency-Key 제시 |
| POST | `/check-ins/{checkInId}/cancel` | Check-in 취소 업무; 세부 권한 계약 원문 대조 |
| GET | `/check-in-logs` | History; 조회 Permission 원문 대조 |

Roster 검색/필터 후보: `q`, `checkedIn`, `page`, `size`. DB table 1:1 조회가 아니다.

Check-in lookup은 MANUAL participantId 또는 QR credential 경로. QR token 구조는 Security 상세 OPEN.

```json
{
  "mode": "MANUAL",
  "participantId": "..."
}
```

Participant 확인 → 이미 체크인 여부 확인 → current checkin 생성/변경 → checkin_log → audit를 transaction으로 처리. 중복 retry에는 기존 결과를 안전하게 반환할 수 있어야 한다.

취소는 사유를 받을 수 있으며 current state 갱신과 cancellation log를 같은 transaction으로 처리. History는 cursor 후보. QR Fast Path / Manual Fast Path / Exception Path는 연구에서 구분한 현장 업무이며 QR 실사용 효과를 검증된 것으로 승격하지 않는다.

## 15. Mission / Vision Trip

v0.1 범위: `partners`, `flights`, `flight_members`. 쓰기 Permission 후보 `MISSION_WRITE`; 조회 세부 Permission은 원문 대조 필요.

```http
GET    /partners
POST   /partners
GET    /partners/{partnerId}
PATCH  /partners/{partnerId}
DELETE /partners/{partnerId}
GET    /flights
POST   /flights
GET    /flights/{flightId}
PATCH  /flights/{flightId}
DELETE /flights/{flightId}
POST   /flights/{flightId}/members
DELETE /flights/{flightId}/members/{participantId}
POST   /flight-moves
```

Partner를 SCENE User 또는 외부 계정으로 가정하지 않는다.

```http
GET /api/v1/participant/flights
```

Passport / Visa / Vaccinations / Health / Insurance / Readiness API는 만들지 않는다. 필요성 검증 전 민감 schema를 선행 생성하지 않는다. Readiness는 여러 Domain current state에서 계산되는 Projection 방향이며 범용 `/readiness` CRUD가 아니다.

## 16. Bible School / Child

현재 Domain: `guardians`, `guardian_links`, `classes`, `class_members`, `class_staff`. Guardian은 `users`가 아니다. Class와 Retreat Group을 합치지 않는다.

쓰기 후보: `GUARDIAN_WRITE`, `CLASS_WRITE`. Guardian 연락처 조회: `GUARDIAN_CONTACT_READ`. 그 외 조회 세부 mapping은 원문 대조 필요.

```http
GET    /guardians
POST   /guardians
GET    /guardians/{guardianId}
PATCH  /guardians/{guardianId}
POST   /guardians/{guardianId}/participants
DELETE /guardians/{guardianId}/participants/{participantId}
GET    /guardians/{guardianId}/contact
GET    /classes
POST   /classes
GET    /classes/{classId}
PATCH  /classes/{classId}
DELETE /classes/{classId}
POST   /classes/{classId}/members
DELETE /classes/{classId}/members/{participantId}
POST   /class-moves
GET    /classes/{classId}/staff
POST   /classes/{classId}/staff
DELETE /classes/{classId}/staff/{staffId}
```

Guardian contact 조회는 `CONTACT_VIEW` privacy log 기록. Class 이동은 move command transaction.

Class Staff identity가 `event_user`, `member` 중 무엇을 참조하는지는 OPEN. Child Presence는 연구 근거만 존재하고 상태 모델은 보류된 상태이므로 API를 만들지 않는다.

## 17. Privacy / Audit / Export / Anonymization

| Method | 경로 | Permission |
|---|---|---|
| GET | `/privacy-logs` | `PRIVACY_LOG_READ` |
| GET | `/audit-logs` | `AUDIT_LOG_READ` |
| POST | `/exports` | `DATA_EXPORT` |
| GET | `/exports/{exportId}` | `DATA_EXPORT` |
| POST | `/participants/{participantId}/anonymize` | `DATA_RETENTION_MANAGE` |

- `privacy_logs`: 개인정보를 누가 봤는가. `audit_logs`: 무엇이 변경됐는가. 합치지 않는다.
- Privacy log filter 후보: `action`, `actor`, `participant`, `from`, `to`.
- logs는 cursor 후보. Audit before/after JSON에 password, access key, session, raw sensitive field를 복사하지 않는다.
- Export: Authorization → export scope 기록 → privacy log `EXPORT` → audit → export 생성.
- 추가 원문 §44의 Export 생성·조회 경계를 반영한다. 큰 Export의 async resource 처리로 발전할 수 있으나 비동기 Job/File Storage 구현은 확정하지 않는다.
- File Storage / Signed URL / Job Infrastructure는 OPEN.
- Anonymization은 여러 Domain에 걸친 transaction/process. 일반 Participant DELETE로 처리하지 않는다.
- Event ENDED ≠ 즉시 DELETE. retention / anonymization / deletion 구분.
- 개인정보·민감정보·내부정보·보안/감사 기록은 보존 목적을 구분한다. 등급·목적에 따른 `delete / pseudonymize / anonymize / retain` 구분. 실제 보존기간과 익명화 필드는 OPEN.

<a id="permissions"></a>

## 18. Permission 후보

현재 후보 목록. Role별 최종 Permission Set과 모든 endpoint별 매핑이 확정됐다는 뜻은 아니다.

```text
SPACE_READ
SPACE_UPDATE
MEMBER_READ
MEMBER_MANAGE
EVENT_CREATE
EVENT_READ
EVENT_UPDATE
EVENT_LIFECYCLE
EVENT_USER_READ
EVENT_USER_MANAGE
PARTICIPANT_READ
PARTICIPANT_CONTACT_READ
PARTICIPANT_WRITE
FORM_WRITE
APPLICATION_READ
APPLICATION_MANAGE
TASK_WRITE
SCHEDULE_WRITE
NOTICE_WRITE
FINANCE_READ
FINANCE_WRITE
GROUP_WRITE
ROOM_WRITE
RIDE_WRITE
CLASS_WRITE
CHECKIN_WRITE
MISSION_WRITE
GUARDIAN_WRITE
GUARDIAN_CONTACT_READ
DATA_EXPORT
DATA_RETENTION_MANAGE
PRIVACY_LOG_READ
AUDIT_LOG_READ
```

초기에는 Java enum + Role → Permission Set mapping. DB `permissions / role_permissions` 테이블을 만들지 않는다. 후보 목록을 승인된 모든 Role의 권한으로 해석하지 않는다. (2026-10-02 현 결정: role 기본 집합은 그대로 enum mapping이지만 Role만으로 권한이 정해지지 않는다. 사람별 GRANT/REVOKE를 `event_user_permissions`에 저장하고 effective 집합으로 판정한다. 신규 키 후보와 OWNER 전용 구분은 [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 키 목록(초안)에 둔다.)

## 19. 전체 경계

```text
/api/v1
├─ operator
│  ├─ auth
│  ├─ me
│  ├─ spaces
│  │  └─ {spaceId}
│  │     ├─ members
│  │     └─ events
│  └─ events/{eventId}
│     ├─ operators
│     ├─ participants
│     ├─ forms / applications
│     ├─ tasks / schedules / notices
│     ├─ fees / payments
│     ├─ groups / group-moves
│     ├─ rooms / room-moves
│     ├─ rides / ride-moves
│     ├─ check-in-roster / check-ins / check-in-logs
│     ├─ partners / flights / flight-moves
│     ├─ guardians / classes / class-moves
│     └─ privacy-logs / audit-logs / exports
├─ public/events/{eventId}
│  ├─ forms/{formId}/applications
│  └─ participant-sessions
└─ participant
   ├─ me / auth/logout
   ├─ application / application/revisions
   ├─ schedules / notices / fees
   └─ group / room / rides / flights
```

슬래시로 나열한 같은 줄 항목은 형제 경계다. 메서드·상세 계약은 앞 절의 상태와 OPEN 표시를 따른다.

<a id="open-items"></a>

## 20. OPEN

### 기존 OPEN

1. Organization 최초 가입 / Space 생성 / Invitation 제품 흐름은 DEC-036~039로 확정. 행사 전용 협력자 경로·초대 TTL(7일)·재전송은 DEC-060으로 확정. 조직 초대의 endpoint 상세는 후속 설계.
2. Space OWNER와 Event OWNER cardinality / transfer policy.
3. Event lifecycle: #8에서 제품 전이·상태별 행동을 확정했다. 세부 Permission·Override·정정·request/DTO·동시성 계약은 OPEN.
4. Participant Access recovery 및 Session TTL. 정확한 session store도 OPEN.
5. Form OPEN/CLOSE 실제 data model.
6. Event/Schedule/Flight timezone model. API UTC canonical 표현과 구분.
7. Group Leader / Class Staff identity reference.
8. Operator 수동 Participant 생성 및 consent/access 발급 정책.
9. Sensitive Data 추가 시 Permission / field access.
10. Passport / Visa / Health / Insurance. 현재 범위 밖이며 미래 필수 요구사항으로 확정하지 않음.
11. Child Presence 상태 모델. 최초 요청의 10번 항목에 함께 있던 Presence를 추가 원문의 구분에 따라 별도 표기. API 없음.

### 상세 계약 검토 필요

- Endpoint별 request/response의 제공 범위 밖 세부와 상세 DDL.
- Role → Permission Set의 상세 mapping과 표에 미명시된 읽기/취소 Permission.
- 2026-09-30 [DEC-028~030](../product/PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다): 조직 관리자의 행사 조회·수정 분리, 운영자별 업무 권한, 조직 관리자의 행사 전체 조회와 리더의 자기 그룹원 전체 조회를 반영해야 한다. 연락처·신청 답변과 조직 관리자의 정산 상세 조회를 포함한다. 화면과 서버의 권한 판단은 DEC-031에 따라 일치시킨다. 개별 권한 저장·판정 방식과 조직·그룹 조회의 endpoint/DTO 경계는 OPEN. 고정 Role mapping만으로 개별 권한 요구가 해결됐다고 해석하지 않는다. (2026-10-02 현 결정으로 개별 권한 저장·판정 방식은 확정했다([아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)). MANAGER/STAFF 기본 집합은 미확정, 백엔드 리드 초안 대기(현 결정 10/2). 키 목록 확정, 조직·그룹 조회 endpoint/DTO는 계속 OPEN.)
- QR credential, Notice targeting, idempotency key scope/TTL/response replay와 raw Access Key 1회 전달의 결합.
- Field별 보존기간 값. 정리·삭제·Export 작업 구조는 DEC-061로 확정했고 기간 값만 OPEN.
- logs/history의 Domain별 cursor 채택과 request/tracing context의 상세 연결.
- `APPLICATION_CLOSED`와 `FORM_CLOSED`의 의미·매핑·통합 여부.

이 항목은 이번 문서 작업에서 새 의사결정을 내리지 않았음을 표시한다. API map이 있다는 사실만으로 Gate Review 완료·구현 준비 완료를 주장하지 않는다.


## 2026-09-30 Owner·책임 이전 후속 정책

[DEC-032~035](../product/PRODUCT_DECISIONS.md#dec-032--조직행사-owner는-복수-가능하며-같은-사람이-두-역할을-맡을-수-있다)에 따라 조직·행사 Owner는 복수 가능하고 같은 사람이 두 역할을 맡을 수 있다. 수락 T0에 새 Owner가 즉시 권한을 받고, 넘긴 사람의 해당 Owner·인수인계 권한만 T0+14일에 종료한다. 다른 조직·행사 역할과 별도 권한은 유지한다.

업무 상태 PENDING에서는 요청자 취소·수신자 거절, HANDOVER에서는 양쪽 취소, COMPLETED에서는 취소 불가·새 위임 시작으로 처리한다. 취소는 위임·인수인계와 해당 권한·책임 이전 상태만 복구하고 실제 행사 작업 데이터는 유지한다. 위임과 Membership 종료는 별도다.

마지막 Owner 이탈은 후임 수락 전 차단하고 탈퇴·제거 전 남은 행사 책임·준비 업무의 인수자 수락을 검사한다. 조직 Owner는 행사 책임구조 복구를 시작하고 새 담당자를 지정해 수락을 받는다. 긴급 상황에서는 기존 담당자 접근을 먼저 차단하고 책임자 지정 필요 상태를 표시할 수 있다. 조직 Owner를 모든 행사의 상시 Owner로 자동 지정하지 않는다.

기존 OWNER cardinality·transfer 전체가 미정이라는 설명은 위 제품 정책에 한해 갱신한다. 상세 관계·권한 저장·만료·동시성·세션·endpoint/DTO와 책임자 지정 상태의 저장 방식은 기술 설계에서 정한다. 업무 상태명을 DB enum으로 자동 확정하거나 행사 lifecycle에 새 상태를 임의 추가하지 않는다. 모든 조직 Owner의 접근 불가 상황은 별도 Account/Organization Recovery 정책으로 남긴다. [검토 결과](../product/owner-handover-review.md)에 적용 범위와 후속 #5·#8·#9·#10을 기록한다.


## 2026-09-30 조직 가입·행사 전용 협력자 후속 정책

[DEC-036~039](../product/PRODUCT_DECISIONS.md#dec-036--검증된-조직-생성자가-최초-owner가-된다)와 [검토 결과](../product/organization-entry-review.md)를 적용한다. 검증된 생성자가 최초 Owner가 되고, 조직 검색 가입 요청은 조직 Owner 승인, 대상자 조직 초대는 수락만으로 MEMBER가 된다. 대기 사용자는 조직 내부 정보를 보지 못한다. 초대는 대상 계정·범위·만료·1회 소비를 검증한다. 초대 TTL은 7일로 확정했다(2026-10-01 현, DEC-060).

조직 Membership과 행사 접근은 별개다. 조직 소속 없이 해당 행사만 운영하는 협력자는 운영계정 ↔ Event 운영자 관계와 Permission으로 접근을 판정하고 조직 내부·다른 행사 접근을 자동 허용하지 않는다. 모든 행사 운영자에게 memberId와 Membership을 요구하던 최초 기준은 갱신한다. DB 관계·FK·DTO·endpoint·초대 재전송·동시성·소속 제거 시 독립 행사 접근 처리의 상세 계약은 후속 기술 검토에서 정한다.


## 2026-09-30 조 편성 저장·공개 후속 정책

[검토 결과와 DEC-040~043](../product/group-publication-review.md)에 따라 작업본 저장과 참가자 공개를 분리한다. 공개 후 작업본을 수정해도 직전 공개본을 제공하며 별도 공개에서 한 번에 반영한다. 부분 배정 저장·공개를 허용하고 공개 전 활성 미배정자 수·영향 경고와 명시적 확인을 받는다. 취소 참가자는 완료 검사·공개 명단에서 제외하고 부분 참석자의 배정을 정상 공개한다.

일반 참가자는 자기 공개 배정, 일반 조장은 공개된 자기 조 명단과 #3에서 허용한 정보를 조회한다. 준비 중 편성 접근은 별도 업무 권한으로 검사한다. 조직 관리자 전체 조회 원칙은 유지하며 겸임 권한 판정 상세는 후속 설계한다. 저장은 참가자 안내를 발생시키지 않고 최초 공개 대상 참가자·조장, 변경 공개 영향 참가자·이전/신규 조장을 식별한다.

Working/Published는 논리적 상태이며 별도 테이블·DB enum·snapshot 형식을 이번 결정으로 확정하지 않는다. 기존 Group 이동 transaction은 작업본의 원자적 변경이고 공개본 갱신은 별도 경계다. #7에서 취소 즉시 제외·동시 수정 덮어쓰기 금지·실패 분리·재시도 중복 방지 제품 정책을 확정했다. 공개 endpoint·DTO·권한, 버전 형식·변경 건수 계산·안내 채널·실패/재시도 상세 기술 계약은 후속 설계한다. 실제 화면·접근 검토는 #10에 남긴다.


## 2026-09-30 조 편성 변경·복구 후속 정책

[DEC-044~048 및 검토 결과](../product/group-change-recovery-review.md)를 적용한다. 일반 정보 변경은 배정을 유지하고 판단에 영향을 주는 변경은 검토 필요로 표시한다. 취소자는 재공개를 기다리지 않고 활성 편성·공개 명단·조장 조회 대상에서 즉시 제외한다. 과거 배정은 기록으로 보존하되 조장 조회에 계속 제공하지 않는다. 복귀는 과거 배정을 참고하고 운영자가 확인하며 자동 복원하지 않는다.

배정 이동은 참가자·조장·조별 현황·안내 대상·실제 참조 운영정보에 대한 영향을 표시하고 숙소·차량을 무조건 자동 변경하지 않는다. 일반 이동은 작업본 저장과 공개를 구분하며 취소·현재 권한 회수는 공개 대기 없이 접근 범위에 반영한다.

오래된 저장의 조용한 덮어쓰기를 금지하고 충돌은 최신/내 변경 비교와 사용자 확인으로 해결한다. 공개 확인 후 버전이 바뀌면 재확인한다. 안전한 비충돌 병합은 가능하지만 판단하기 어려우면 저장을 거절한다. 전체 화면 독점 잠금은 사용하지 않는다.

확실한 저장 실패·결과 불명·공개 실패·공개 성공/알림 실패를 구분한다. 불명 결과는 서버 반영 여부 확인 후 재시도하고 동일 작업이 중복 반영되지 않게 한다. 공개 실패는 작업본과 이전 공개본을 유지하며 알림 실패는 공개본 유지·실패 알림만 재전송한다. 변경자·시간·대상·전후를 기록하고 Undo는 현재 상태의 역변경으로 새 저장·필요시 공개한다.

버전 단위·request/DTO·중복 방지 key/TTL·결과 확인·History schema·알림 추적·임시 보관 방식/기간/계정 범위·민감정보 처리·회수 후 복구는 후속 기술 계약이다. 새 endpoint·테이블·localStorage 사용을 자동 확정하지 않는다. 현재 권한·참가 자격 검사는 복구와 재시도에도 적용한다. #8에서 종료 후 정리/정정과 현장 운영 차단·보관 읽기 전용을 확정했다. 종료 후 취소/복귀·지연 알림 상세는 후속 계약, 기록·임시 보관 보존/삭제는 #9, 실제 클릭은 #10에서 검토한다.


## 2026-09-30 행사 종료·보관·재개 후속 정책

[DEC-049~053 및 상태별 행동](../product/event-lifecycle-review.md)을 적용한다. 활성화·종료·재개는 Event Owner, 조직 Owner는 부재·복구 등 조직 관리 Override를 담당한다. ENDED 보관은 Event Owner 또는 조직 Owner가 실행한다. 미완료 업무·정산·배정은 경고와 명시적 확인 후 종료/보관을 허용하며 일반 차단 조건으로 사용하지 않는다.

ENDED는 조회·정산·회고·후속 업무·후속 공지·감사 가능한 기록 정리를 허용한다. 참가 신청·새 체크인/현장 취소·새 조 편성/재공개·현장 일정 운영은 차단한다. 마지막 공개 편성은 기록으로 보존하고 오류 정정은 별도 이유·이력으로 처리한다. 현재 권한·취소자 조회 제외를 계속 검사한다. 일반 Undo나 저장으로 종료 상태를 우회하지 않는다.

재개 ENDED → ACTIVE는 실행자·시간·사유를 남기는 새 전이이며 종료 전 데이터 Rollback이 아니다. ARCHIVED는 읽기 전용·보관 목록/검색 재진입을 제공하고 삭제를 뜻하지 않는다. ACTIVE 직접 보관은 차단한다. 보관 해제는 ARCHIVED → ENDED이며 실제 재개를 별도로 실행한다.

전이 endpoint/DTO·Permission, 조직 Override/해제 권한·정정 대상/계약, 종료 후 참가 취소/복귀·지연 알림·신청 설정, 동시성·중복 실행·실패 복구의 상세는 후속 기술 설계다. 기존 상태 후보의 제품 전이를 갱신하며 새로운 DB enum·테이블·API 경로를 이번 답변으로 추가 확정하지 않는다. #9에서 보존/삭제/Export, #10에서 실제 클릭 경로를 검토한다.


## 2026-09-30 Export·보존·삭제·복구 후속 정책

[DEC-054~059 및 검토 결과](../product/data-retention-export-review.md)에 따라 조회와 Export 권한을 분리한다. Event Owner·관리/복구 목적의 조직 Owner·명시적 Export 권한 운영자에게 목적/대상/필드 범위로 허용한다. 일반 조장은 기본 Export 불가다. 민감정보 추가 확인, 개인정보/내부정보 반출의 실행자·시각·조직/행사·목적·범위·등급·건수·결과 기록, 생성/다운로드 구분을 적용하고 파일 내용을 로그에 복제하지 않는다.

개인정보·운영 기록·정산·Audit/Security는 별도 보존 목적/lifecycle을 가진다. ARCHIVED는 무기한 보존 근거가 아니며 과거 배정/History도 불필요한 개인 연결을 정리한다. Archive·Anonymize·Delete를 구분하고 soft delete를 최종 파기로 표시하지 않는다. 삭제 전 영향/유지 데이터와 의존 관계를 확인해 삭제·익명화·참조 제거·필요 보존을 처리한다. 최종 삭제/실질 익명화는 일반 복구를 제공하지 않는다.

구체적 보존/유예/백업 기간, 유예 도입 여부, 전체 행사 삭제의 조직 Owner 제한 제안·정리/익명화 실행권, 만료 다운로드/확인 수단·현재 권한 검사·파일 수명·파기 job/실패·FK/CASCADE·재식별 검증은 #12에서 근거와 계약을 정한다. Event 삭제가 Audit를 무조건 삭제하거나 보관 읽기 전용이 파기 정책을 면제하지 않는다. 새 수집 필드·DB enum·endpoint·기간 상수를 확정하지 않는다. 실제 클릭 검토는 #10이다.

## 2026-10-01 행사 전용 협력자·초대 기술 계약 (DEC-060)

```
POST   /api/v1/operator/events/{eventId}/operators                      # 기존 멤버 직접 추가 {userId, role}
POST   /api/v1/operator/events/{eventId}/invitations                    # 비멤버 초대 {email, role}
POST   /api/v1/operator/events/{eventId}/invitations/{invitationId}/resend
DELETE /api/v1/operator/events/{eventId}/invitations/{invitationId}     # 회수 → REVOKED
POST   /api/v1/operator/invitations/preview                             # {token}, 로그인 필수, 조회 전용 (2026-10-02 #27)
POST   /api/v1/operator/invitations/accept                              # {token}, 로그인 필수
```

- 초대 TTL 7일, 서버 상수 하나로 관리(조직별 설정 없음).
- 외부 협력자에게 부여 가능한 role은 `MANAGER / STAFF`와 리더. `OWNER` 지정·위임은 활성 Membership 검사 후 허용.

수락 결과

| 결과 | HTTP | code |
|---|---|---|
| 성공 | 200 | — (같은 사용자가 이미 수락한 경우도 200, 멱등) |
| 다른 이메일로 로그인됨 | 403 | `INVITATION_EMAIL_MISMATCH` |
| 만료 | 410 | `INVITATION_EXPIRED` |
| 회수됨 | 410 | `INVITATION_REVOKED` |
| 재전송으로 무효 | 410 | `INVITATION_SUPERSEDED` |
| 다른 사용자가 이미 수락 | 409 | `INVITATION_ALREADY_ACCEPTED` |
| 토큰 없음·위조 | 404 | `INVITATION_NOT_FOUND` |

판정 순서는 토큰 조회 → 이메일 일치 → 상태다. 이메일이 다르면 상태를 노출하지 않는다.

2026-10-02 보강 (#27, 현 승인)

- 수락 200 응답에 `outcome: ACCEPTED | ALREADY_ACCEPTED`를 둔다. 같은 사용자의 재수락은 상태를 바꾸지 않고 `ALREADY_ACCEPTED`를 돌려준다.
- 미리보기는 수락과 같은 판정 순서·같은 오류 코드를 쓴다. 성공 시 200 `{eventName, role, inviterName, expiresAt, outcome: PENDING | ALREADY_ACCEPTED}`. 상태를 바꾸지 않으며 반복 호출해도 결과가 같다. 수락은 미리보기 통과 여부와 무관하게 다시 판정한다.
- 미리보기·수락 모두 계정별·IP별 rate limit, 초과 시 429 `RATE_LIMITED`. 로그인 안 됨은 401이며 클라이언트는 토큰을 유지한다.
- 클라이언트 토큰 정리: 종결 결과(404, 410 3종, 409, 200 `outcome: ALREADY_ACCEPTED`)를 받으면 저장된 토큰을 즉시 지운다. 401·429·403 `INVITATION_EMAIL_MISMATCH`와 그 밖의 응답(5xx, 네트워크 오류·시간 초과, 목록에 없는 4xx)에서는 유지한다(계정 바꾸기는 최초 30분 안에서만). 수락 성공(200 `outcome: ACCEPTED`)이면 지운다.
- 화면 매핑: `INVITATION_EMAIL_MISMATCH` → 15, `INVITATION_EXPIRED` → 16, `INVITATION_NOT_FOUND` → 17, `INVITATION_REVOKED` → 35(취소 후 새 초대를 받은 사용자가 예전 링크로 들어온 경우 포함), `INVITATION_SUPERSEDED` → 36, `outcome: ALREADY_ACCEPTED` → 37, `INVITATION_ALREADY_ACCEPTED`(409, 다른 사용자가 이미 수락) → 17(누가 수락했는지 드러내지 않음), PENDING → 14.

회귀 테스트

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 다른 계정 로그인 → 15에서 계정 바꾸기 → 30분 안에 대상 계정 로그인 | 미리보기 PENDING → 수락 ACCEPTED |
| 2 | 1과 같지만 최초 보관 후 30분 경과 | 토큰 삭제, 일반 랜딩 화면 |
| 3 | 15에서 돌아가기 | S00 이동, 토큰 삭제 |
| 4 | 미리보기 2회 연속 호출 | 같은 응답, 초대 상태 불변 |
| 5 | 미리보기 통과 후 초대 회수 → 수락 | 410 `INVITATION_REVOKED` |
| 6 | 대상이 아닌 계정으로 미리보기·수락 | `INVITATION_NOT_FOUND` 또는 `INVITATION_EMAIL_MISMATCH`만, 이메일 마스킹 |
| 7 | 로그아웃 상태에서 미리보기 | 401, 토큰 유지 |
| 8 | 같은 사용자가 수락 후 다시 수락 | 200 `outcome: ALREADY_ACCEPTED` |
| 9 | 한도 초과 호출 | 429 `RATE_LIMITED` (한도 숫자 미정, 서버 미검증) |
| 10 | 재전송 후 예전 링크로 미리보기·수락 | 410 `INVITATION_SUPERSEDED` → 36 |
| 11 | 초대 취소 후 새 초대, 예전 링크로 미리보기·수락 | 410 `INVITATION_REVOKED` → 35 |
| 12 | `expiresAt` 경과 후 미리보기·수락 | 410 `INVITATION_EXPIRED` → 16 |
| 13 | 미리보기 성공 후 저장된 토큰 확인 | 토큰 유지(수락 성공 전까지) |
| 14 | 0분 보관 → 25분에 15에서 계정 바꾸기 → 35분에 대상 계정 로그인 | 토큰 삭제, 일반 랜딩 화면(보관 시각이 갱신되지 않음) |
| 15 | 다른 사용자가 이미 수락한 초대로 수락 | 409 `INVITATION_ALREADY_ACCEPTED` → 17 |
| 16 | 미리보기 → `INVITATION_REVOKED`(35) → 돌아가기 → 다시 로그인 | 토큰 삭제됨, 35가 아니라 일반 랜딩 화면 |
| 17 | 수락 → 200 `outcome: ALREADY_ACCEPTED`(37) 후 저장소 확인 | 토큰 삭제됨 |
| 18 | 미리보기 → 429 후 저장소 확인 | 토큰 유지 |
| 19 | 수락 → 409 `INVITATION_ALREADY_ACCEPTED`(17) 후 저장소 확인 | 토큰 삭제됨 |
| 20 | 미리보기 → 401 | 토큰 유지, 로그인으로 이동 |
| 21 | 미리보기 → 500 또는 네트워크 오류 | 토큰 유지 |

## 2026-10-01 보존·삭제·Export 처리 계약 (DEC-061)

```
POST /api/v1/operator/events/{eventId}/privacy-cleanups/preview         # 도메인별 영향 건수
POST /api/v1/operator/events/{eventId}/privacy-cleanups                 # 비동기 작업 생성
GET  /api/v1/operator/events/{eventId}/privacy-cleanups/{cleanupId}
POST /api/v1/operator/events/{eventId}/deletion-requests                # Event Owner 삭제 요청
POST /api/v1/operator/spaces/{spaceId}/events/{eventId}/deletion        # Space OWNER 실행, 재인증 + 행사명 확인
POST /api/v1/operator/events/{eventId}/exports                          # export job 생성
GET  /api/v1/operator/events/{eventId}/exports/{exportId}/download      # 매번 현재 권한 재검사, 단기 URL 발급
```

- 개인정보 정리 작업 상태: `PENDING / RUNNING / COMPLETED / PARTIAL_FAILED`, 도메인 단계별 멱등 재시도.
- 개인정보 정리 권한은 Event OWNER·Space OWNER. 일반 운영자·외부 협력자는 기본 불가.
- 민감 필드 포함 Export는 생성 시 재인증. Export 생성과 다운로드를 각각 privacy log로 남긴다.
- 정확한 request/response DTO 필드와 Permission 이름은 구현 단계에서 이 계약 안에서 정한다. 기간 값은 OPEN.

## 2026-10-02 개인별 권한 (현 결정, DEC-029 정합)

2026-10-02 현 결정(SCENE 개발 리드 전달)으로 DEC-029의 사람별 업무 권한과 §18의 "Java enum + Role → Permission Set" 기준의 충돌을 정리한다. Event 권한 = role 기본 집합 + 사람별 GRANT − 사람별 REVOKE. 부여·회수는 Event Owner만 한다. 저장은 [Data Model](data-model-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 `event_user_permissions`, 보안 규칙은 [Security / Privacy](security-privacy-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 같은 이름 절을 따른다.

2026-10-02 보강: 같은 날 현 결정(개발 리드 전달, 아래 "현 결정 10/2"), #30 L5, Backend Lead의 `space_id` 결정, QA 리뷰(변경 요청)를 반영했다. 아직 정하지 않은 것은 "미확정"·"보류(pending)"로 표시한다.

```
GET /api/v1/operator/events/{eventId}/operators/{userId}/permissions
PUT /api/v1/operator/events/{eventId}/operators/{userId}/permissions
```

- 경로 변수 (현 결정 10/2): `{userId}`는 대상 운영자의 `user_id`(`event_users.user_id`)다. 운영자 컬렉션의 `PATCH`·`DELETE /operators/{…}`도 같은 값이므로 §5 표기를 `{userId}`로 맞췄다. `event_users`가 `UNIQUE(event_id, user_id)`이고 운영자 추가 body가 `{userId, role}`이라 행사 안에서 한 사람을 한 값으로 가리킨다. 경로에 `spaceId`는 없다. 서버가 `eventId`로 `spaceId`를 resolve한다.
- GET 200 응답:

```json
{
  "userId": "...",
  "role": "STAFF",
  "roleDefaults": ["CHECKIN_WRITE", "EVENT_READ"],
  "overrides": { "grants": ["DATA_EXPORT"], "revokes": [] },
  "effective": ["CHECKIN_WRITE", "DATA_EXPORT", "EVENT_READ"]
}
```

- 위 `roleDefaults` 값은 형태 예시다. MANAGER/STAFF 기본 집합은 미확정이다(아래 키 목록).
- PUT body `{"grants": [...], "revokes": [...]}`는 해당 운영자의 override 전체를 대체한다(SET). 두 배열이 모두 비면 override를 모두 지운다. 응답은 200이며 GET과 같은 형태다. 같은 body를 반복하면 같은 결과·같은 응답이고, 바뀐 것이 없으면 행·`granted_at`을 갱신하지 않고 audit도 남기지 않는다. 바뀌지 않은 키는 기존 `granted_by`·`granted_at`을 유지한다.
- 정규화: role 기본값에 이미 있는 키의 GRANT와 기본값에 없는 키의 REVOKE는 효과가 없으므로 저장하지 않고 응답 `overrides`에서 빠진다(오류 아님). 배열은 키 이름순으로 돌려준다.
- role 기본 mapping 변경은 리뷰 대상 변경이다. 정규화 때문에 기본값과 같은 GRANT는 저장되지 않으므로, mapping에서 키를 빼면 그 키를 따로 받았던 운영자도 effective에서 조용히 잃고 키를 넣으면 조용히 얻는다. 그래서 mapping 변경은 별도 PR 리뷰를 거치고, 변경 전후 mapping과 영향받는 행사·운영자 수를 담은 자체 audit 기록과 release note를 함께 낸다.
- 호출 권한:
  - 운영자 관리 (현 결정 10/2): 운영자 추가(기존 멤버 직접 추가·DEC-060 초대)·제거·role 변경과 override 변경(PUT)은 해당 행사의 Event OWNER만 한다. `EVENT_USER_MANAGE`는 OWNER 전용이며 다른 운영자에게 GRANT할 수 없다. MANAGER·STAFF와 행사 운영자가 아닌 Space OWNER/ADMIN은 403 `FORBIDDEN`이다. 문서에 role 전용 403 code가 없어 공통 `FORBIDDEN`을 쓴다. Space OWNER의 조직 관리·복구 경로(DEC-035, #30)는 이 규칙과 별개다.
  - GET (현 결정 10/2): Event OWNER는 모든 운영자를 조회한다. 본인은 자기 행, Space OWNER는 행사 운영자가 아니어도 모든 운영자를 조회만 한다(DEC-028·DEC-060). Space ADMIN을 포함한 그 밖은 403 `FORBIDDEN`이다. Space ADMIN은 GET도 할 수 없다(현 결정 10/2). DEC-028의 조직 관리자 전체 조회에 운영자 권한 설정 조회는 들어가지 않는다.
  - 대상 사용자가 해당 행사 운영자가 아니면 GET·PUT 모두 404 `RESOURCE_NOT_FOUND`.
- 판정 순서 (QA 리뷰 반영). 앞 단계에서 걸리면 그 결과 하나만 돌려주고 뒤 단계는 보지 않는다. 같은 400 안의 위반은 `errors[]`에 모두 담는다.
  1. 미인증 → 401 `AUTHENTICATION_REQUIRED`
  2. 호출자 권한(위 운영자 관리·GET 규칙) → 403 `FORBIDDEN`. 행사 자체가 tenant 밖이라 보이지 않으면 §1 규칙대로 404 `RESOURCE_NOT_FOUND`다.
  3. 대상 사용자가 해당 행사 운영자가 아님 → 404 `RESOURCE_NOT_FOUND`
  4. PUT body 형식(배열 아님·필드 누락 등)·알 수 없는 키·중복 → 400 `VALIDATION_FAILED`
  5. ARCHIVED 행사에서 늘리는 변경 → 409 `EVENT_ARCHIVED`
  6. 422는 아래 표 순서대로: `PERMISSION_OWNER_NOT_OVERRIDABLE` → `PERMISSION_OWNER_ONLY` → `PERMISSION_NOT_OVERRIDABLE`
  - 2단계가 3단계보다 앞서므로 권한 없는 호출자는 대상이 운영자인지 알 수 없다.
- PUT 검증. 하나라도 어기면 전체 요청을 거절하고 아무것도 저장하지 않는다. 표 순서가 판정 순서다.

| 조건 | HTTP | code |
|---|---|---|
| body 형식 위반(`grants`·`revokes`가 배열이 아님, 필드 누락 등) | 400 | `VALIDATION_FAILED` |
| Event 범위 키 목록에 없는 키(Space 범위 키 포함) | 400 | `VALIDATION_FAILED` (`errors[].code = UNKNOWN_PERMISSION`) |
| 같은 키가 grants·revokes에 함께 있거나 중복 | 400 | `VALIDATION_FAILED` (`errors[].code = DUPLICATE_PERMISSION`) |
| ARCHIVED 행사에서 늘리는 변경(아래 행사 상태) | 409 | `EVENT_ARCHIVED` (DEC-063) |
| 대상 운영자가 OWNER (GRANT·REVOKE 모두) | 422 | `PERMISSION_OWNER_NOT_OVERRIDABLE` |
| OWNER 전용 키를 OWNER가 아닌 운영자에게 GRANT (행사 전용 협력자 포함) | 422 | `PERMISSION_OWNER_ONLY` |
| `EVENT_READ` REVOKE (행사 접근 자체의 회수는 운영자 제거로 한다) | 422 | `PERMISSION_NOT_OVERRIDABLE` |

- 서버 판정: 모든 Event API는 요청마다 effective 집합으로 Permission을 검사한다. REVOKE된 키가 필요한 API는 403 `FORBIDDEN`이고 화면도 같은 집합으로 숨김·읽기 전용을 정한다(DEC-031).
- DEC-060 연락처 숨김 우선 (현 결정 10/2): 행사 전용 협력자에게 다른 운영자의 연락처를 숨기는 DEC-060 규칙은 어떤 GRANT보다 앞선다. `EVENT_USER_READ`, `PARTICIPANT_CONTACT_READ` 등 어떤 GRANT로도 이 숨김을 풀 수 없다. 서버는 effective 집합과 관계없이 행사 전용 협력자에게 가는 운영자 응답에서 연락처를 빼고 화면도 같은 기준을 따른다(DEC-031).
- 목록: `GET /operators?include=permissions`는 각 항목에 `effectivePermissions`를 넣는다. Event OWNER만 쓸 수 있고 그 밖은 403 `FORBIDDEN`이다. 같은 endpoint가 권한에 따라 몰래 다른 응답을 주지 않도록(§1) 명시적 parameter로 둔다. 행사 전용 협력자에게 다른 운영자의 이름·역할만 보이는 DEC-060 규칙은 유지한다.
- role 변경(`PATCH /operators/{userId}`, Event OWNER만)은 같은 transaction에서 대상의 override를 모두 지우고 audit에 role 전후와 지운 override를 남긴다. 이후 effective는 새 role 기본값이다. MANAGER는 role 변경·제거·재추가를 할 수 없으므로 Owner의 REVOKE를 이 경로로 지울 수 없다.
- 운영자 제거(`DELETE /operators/{userId}`, Event OWNER만)는 CASCADE로 override를 지우고 제거 audit에 지운 override 목록을 남긴다.
- Owner 위임 (현 결정 10/2, DEC-033): override가 있는 운영자(예: MANAGER)가 위임을 수락해 OWNER가 되면 같은 transaction에서 그 override를 위임 기록에 저장하고 `event_user_permissions`에서 지운다. OWNER는 override를 갖지 않기 때문이다. 위임 기록의 테이블·컬럼은 #30 Owner 이전 계약(`owner_transfers`, `recipient_prior_role` 제안)을 따른다.
  - 위임이 취소되면(DEC-033) 받은 사람의 이전 role과 함께 저장한 override를 같은 transaction에서 되살린다. 취소는 이전 상태 복구이고 새 GRANT가 아니므로 ARCHIVED에서도 409 `EVENT_ARCHIVED` 대상이 아니다(#30 L5: Owner 이전은 ARCHIVED에서도 허용).
  - 넘긴 사람이 인수인계 종료 뒤 다른 role로 남으면 그 role의 기본값으로 시작하고 override는 없다. OWNER였으므로 되살릴 override도 없다.
  - 수락(저장·삭제), 취소(복원), 넘긴 사람의 role 전환을 각각 audit에 남기고 지우거나 되살린 override 목록을 함께 기록한다.
- 행사 상태 (현 결정 10/2, #30 L5): ENDED에서는 override 변경을 허용한다. ARCHIVED에서는 줄이는 변경(REVOKE 추가, 저장된 GRANT 제거)만 허용한다. 저장된 override와 비교해 grants에 새 키가 있거나 저장된 REVOKE를 revokes에서 빼면 늘리는 변경이며 409 `EVENT_ARCHIVED`로 거절하고 아무것도 저장하지 않는다. 판정은 정규화 전 요청 기준이다. `EVENT_ARCHIVED`는 DEC-063에서 확정한 코드다. ARCHIVED에서도 운영자 제거는 허용한다(#30 L5).
- Audit: PUT으로 실제 변경이 있을 때마다 `audit_logs`에 실행자·eventId·대상 userId·변경 전후 grants/revokes를 남긴다. action 이름(예: `EVENT_USER_PERMISSIONS_REPLACED`)은 구현에서 정한다.
- 동시성: PUT·role 변경·운영자 제거·Owner 위임 수락/취소는 대상 `event_users` 행을 잠그고(`SELECT … FOR UPDATE`) 처리해 서로 섞이지 않게 한다. 마지막 PUT이 전체 목록을 정한다.

Permission 키 목록 (초안)

서버 Permission enum의 Event 범위 키다. §18 후보를 바탕으로 하며 신규 키는 OWNER 전용 구분을 위해 추가한 후보다. 목록 전체가 초안이며 현·Backend Lead 확인 후 확정한다.

| 구분 | 키 | 근거 |
|---|---|---|
| GRANT/REVOKE 가능 | `EVENT_UPDATE`, `EVENT_USER_READ`, `PARTICIPANT_READ`, `PARTICIPANT_CONTACT_READ`, `PARTICIPANT_WRITE`, `FORM_WRITE`, `APPLICATION_READ`, `APPLICATION_MANAGE`, `TASK_WRITE`, `SCHEDULE_WRITE`, `NOTICE_WRITE`, `FINANCE_READ`, `FINANCE_WRITE`, `GROUP_WRITE`, `ROOM_WRITE`, `RIDE_WRITE`, `CLASS_WRITE`, `CHECKIN_WRITE`, `MISSION_WRITE`, `GUARDIAN_WRITE`, `GUARDIAN_CONTACT_READ`, `PRIVACY_LOG_READ`, `AUDIT_LOG_READ` | §18 후보. DEC-029(조 편성·정산 등 업무별 차등), access-policy-review(참가자 수정·조 편성·일정·공지·체크인·정산). 준비 중 편성 조회는 `GROUP_WRITE`에 포함(DEC-043). 행사 전용 협력자에게는 GRANT해도 DEC-060 연락처 숨김이 앞선다(현 결정 10/2) |
| GRANT/REVOKE 가능, MANAGER/STAFF 기본값에 넣지 않음 | `DATA_EXPORT` | DEC-054 "명시적 Export 권한을 받은 운영자" |
| 운영자 기본, REVOKE 불가 | `EVENT_READ` | 행사 접근 자체. 회수는 운영자 제거 |
| OWNER 전용 (GRANT 불가) | `EVENT_LIFECYCLE` | #30 L1: 활성화·종료·재개·보관·보관 해제는 Event OWNER (role) only |
| 보류 | `DATA_RETENTION_MANAGE` | 보류 (현 결정 D23 대기) |
| OWNER 전용 (GRANT 불가) | `EVENT_USER_MANAGE` | 운영자 추가·제거·role 변경. 현 결정 10/2: 운영자 관리는 Event Owner만, GRANT 불가 |
| 대상 아님 (Space 범위) | `SPACE_READ`, `SPACE_UPDATE`, `MEMBER_READ`, `MEMBER_MANAGE`, `EVENT_CREATE` | Membership·Space role로 판정. override 시 400 `UNKNOWN_PERMISSION` |

- OWNER 기본 집합은 Event 범위 키 전체다.
- MANAGER/STAFF 기본 집합 (현 결정 10/2): Backend Lead가 초안을 쓰고 현이 승인한다. `DATA_EXPORT`와 OWNER 전용 키는 넣지 않는다. **미확정, 백엔드 리드 초안 대기.** 예외로 `TASK_WRITE`만 2026-10-02 #31 DEC-062로 확정한다. OWNER·MANAGER 포함, STAFF 미포함([§8](#2026-10-02-업무-체크리스트-저장-계약-31-dec-062)). 그 외 기본 집합의 구체 키에 기대는 회귀 행은 아래 표에 보류(pending)로 표시했다.
- Space OWNER의 조직 관리·복구 권한(DEC-028·DEC-035·DEC-049·DEC-061)은 이 테이블과 별개이며 override 대상이 아니다.

회귀 테스트

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | Owner가 STAFF에게 PUT `{grants:[DATA_EXPORT], revokes:[]}` | 200, `effective`에 `DATA_EXPORT` 포함, 그 STAFF의 `POST /exports` 권한 검사 통과, audit 1건 |
| 2 | MANAGER가 다른 운영자에게 같은 PUT | 403 `FORBIDDEN`, override 불변, audit 없음 (현 결정 10/2) |
| 3 | Owner가 MANAGER의 role 기본 키 K를 REVOKE(예: K = `FINANCE_READ`가 기본값일 때) | **보류(pending)**: MANAGER 기본 집합 미확정. 확정 후 K와 확인 API를 정한다. 기대: 200, `effective`에서 K 제외. 그 MANAGER의 K 필요 API(`GET /fees`) 호출 → 403 `FORBIDDEN`, 화면에서도 숨김 |
| 4 | Owner가 MANAGER에게 `EVENT_LIFECYCLE` GRANT | 422 `PERMISSION_OWNER_ONLY`, 저장 없음 |
| 5 | Owner가 행사 전용 협력자(STAFF)에게 `EVENT_USER_MANAGE` GRANT | 422 `PERMISSION_OWNER_ONLY` |
| 6 | override가 있는 운영자 제거 → 같은 사용자 재추가 (Owner가 실행) | 제거 시 override 행 0건(CASCADE), 제거 audit에 지운 목록. 재추가 후 `effective` = role 기본값 |
| 7 | 같은 body로 PUT 2회 | 두 응답 동일, 두 번째는 행·`granted_at` 불변, audit 추가 없음 |
| 8 | override가 있는 MANAGER를 STAFF로 role 변경 (Owner가 실행) | 같은 transaction에서 override 전부 삭제, audit에 role 전후·지운 override. `effective` = STAFF 기본값 |
| 9 | OWNER 대상 PUT `{grants:[], revokes:[FINANCE_READ]}` | 422 `PERMISSION_OWNER_NOT_OVERRIDABLE`, OWNER `effective` 불변 |
| 10 | OWNER가 아닌 운영자의 `EVENT_READ` REVOKE | 422 `PERMISSION_NOT_OVERRIDABLE` |
| 11 | 없는 키 또는 `MEMBER_MANAGE` GRANT | 400 `VALIDATION_FAILED` (`UNKNOWN_PERMISSION`) |
| 12 | 같은 키를 grants·revokes에 함께 지정 | 400 `VALIDATION_FAILED` (`DUPLICATE_PERMISSION`) |
| 13 | role 기본값에 있는 키를 GRANT (예: `EVENT_READ`) | 200, `overrides`에 남지 않음(정규화), `effective` 불변 |
| 14 | REVOKE 직후 직접 URL로 해당 API 호출 | 403 `FORBIDDEN` (요청마다 effective 재계산) |
| 15 | 행사 운영자가 아닌 Space OWNER가 PUT / GET | PUT 403 `FORBIDDEN` / GET 200 조회만 (현 결정 10/2) |
| 16 | STAFF가 다른 운영자의 GET / 자기 GET | 403 `FORBIDDEN` / 200 (현 결정 10/2) |
| 17 | MANAGER가 `GET /operators?include=permissions` | 403 `FORBIDDEN` |
| 18 | 조직 자진 탈퇴 후 행사 접근 유지(행사 전용 협력자 전환) | `event_users` 유지, override 유지 |
| 19 | 관리자 제거로 행사 접근 회수(DEC-060) | `event_users` 삭제, override CASCADE 삭제 |
| 20 | `DATA_EXPORT` GRANT로 Export 생성 후 REVOKE → 다운로드 | 다운로드 403 `FORBIDDEN` (DEC-061 다운로드마다 재검사) |
| 21 | Owner가 STAFF S의 기본 키 K를 REVOKE한 뒤 MANAGER가 (a) S를 MANAGER로 바꿨다가 STAFF로 되돌리려 `PATCH /operators/{userId}` (b) S를 `DELETE` 후 `POST /operators`로 재추가 | **보류(pending)**: K는 STAFF 기본 집합 확정 후 정한다(기대값은 K와 무관). 기대: (a)(b) 모두 첫 호출부터 403 `FORBIDDEN`(운영자 관리는 Owner만, 현 결정 10/2), S의 REVOKE K 유지, `effective` 불변, audit 없음 |
| 22 | 판정 순서 401 > 403: 미인증으로 PUT | 401 `AUTHENTICATION_REQUIRED` |
| 23 | 판정 순서 403 > 400: MANAGER가 형식이 틀린 body(`grants`가 문자열)로 PUT | 403 `FORBIDDEN` (400 아님) |
| 24 | 판정 순서 403 > 404: STAFF가 행사 운영자가 아닌 사용자 GET | 403 `FORBIDDEN` (404 아님, 운영자 여부 노출 없음) |
| 25 | 판정 순서 404 > 400: Owner가 행사 운영자가 아닌 사용자에게 없는 키로 PUT | 404 `RESOURCE_NOT_FOUND` (400 아님) |
| 26 | 판정 순서 400 > 409: ARCHIVED 행사에서 Owner가 없는 키 GRANT | 400 `VALIDATION_FAILED` (`UNKNOWN_PERMISSION`) |
| 27 | 판정 순서 409 > 422: ARCHIVED 행사에서 Owner가 OWNER 대상에 `{grants:[FINANCE_READ]}` | 409 `EVENT_ARCHIVED` |
| 28 | 판정 순서 422 `PERMISSION_OWNER_NOT_OVERRIDABLE` > `PERMISSION_NOT_OVERRIDABLE`: OWNER 대상 `{grants:[], revokes:[EVENT_READ]}` | 422 `PERMISSION_OWNER_NOT_OVERRIDABLE` |
| 29 | 판정 순서 422 `PERMISSION_OWNER_NOT_OVERRIDABLE` > `PERMISSION_OWNER_ONLY`: OWNER 대상 `{grants:[EVENT_LIFECYCLE]}` | 422 `PERMISSION_OWNER_NOT_OVERRIDABLE` |
| 30 | 판정 순서 422 `PERMISSION_OWNER_ONLY` > `PERMISSION_NOT_OVERRIDABLE`: STAFF 대상 `{grants:[EVENT_USER_MANAGE], revokes:[EVENT_READ]}` | 422 `PERMISSION_OWNER_ONLY` |
| 31 | Owner가 행사 전용 협력자(STAFF)에게 `EVENT_USER_READ`·`PARTICIPANT_CONTACT_READ` GRANT 후 그 협력자가 `GET /operators` | GRANT 200. 다른 운영자는 이름·역할만, 연락처 없음(DEC-060 우선, 현 결정 10/2). 화면도 같음 |
| 32 | Owner가 행사 운영자가 아닌 사용자의 GET / PUT | 둘 다 404 `RESOURCE_NOT_FOUND`, 저장 없음 |
| 33 | Space ADMIN(행사 운영자 아님)이 GET | 403 `FORBIDDEN` (현 결정 10/2) |
| 34 | `{grants:[DATA_EXPORT]}`가 있는 MANAGER M이 Owner 위임 수락 | 같은 transaction에서 M의 override를 위임 기록에 저장하고 `event_user_permissions`에서 삭제. M `effective` = OWNER 전체, audit에 저장·삭제한 목록 (현 결정 10/2) |
| 35 | 34 뒤 인수인계 중 위임 취소 | 같은 transaction에서 M의 role MANAGER와 `{grants:[DATA_EXPORT]}` 복원, `effective` = MANAGER 기본 + `DATA_EXPORT`, audit에 복원 목록. ARCHIVED 행사에서도 같음 (현 결정 10/2) |
| 36 | 위임 완료(인수인계 종료) 뒤 넘긴 사람이 OWNER가 아닌 role로 남음 | override 0건, `effective` = 새 role 기본값, audit에 role 전환 (현 결정 10/2) |
| 37 | ENDED 행사에서 Owner가 STAFF에게 `{grants:[DATA_EXPORT]}` | 200, 저장 (현 결정 10/2) |
| 38 | ARCHIVED 행사에서 저장된 GRANT `DATA_EXPORT` 제거(`{grants:[], revokes:[]}`) | 200, 삭제, audit 1건 (현 결정 10/2, #30 L5) |
| 39 | ARCHIVED 행사에서 STAFF에게 `{grants:[DATA_EXPORT]}` | 409 `EVENT_ARCHIVED`, 저장 없음 (현 결정 10/2, #30 L5) |
| 40 | ARCHIVED 행사에서 STAFF의 기본 키 K REVOKE | **보류(pending)**: K는 STAFF 기본 집합 확정 후 정한다(기대값은 K와 무관). 기대: 200, `effective`에서 K 제외 (현 결정 10/2, #30 L5) |

## 2026-10-02 행사 lifecycle command (#30, DEC-063)

[#30 결정 기록](https://github.com/BeomhyunPark/SCENE/issues/30#issuecomment-5946089035)의 L1~L9를 서버 계약으로 둔다. 상태 값은 그대로 `DRAFT / ACTIVE / ENDED / ARCHIVED`다. 새 전이를 만들지 않는다. `lifecycleStatus`는 `PATCH /events/{eventId}`로 바꾸지 못한다(400 `VALIDATION_FAILED`).

```http
GET  /api/v1/operator/events/{eventId}/lifecycle
GET  /api/v1/operator/events/{eventId}/lifecycle/transitions
POST /api/v1/operator/events/{eventId}/activate
POST /api/v1/operator/events/{eventId}/end
POST /api/v1/operator/events/{eventId}/reopen
POST /api/v1/operator/events/{eventId}/archive
POST /api/v1/operator/events/{eventId}/unarchive
```

공통 본문 필드는 `expectedLifecycleVersion`(필수 정수), 종료·보관의 `acknowledgeWarnings`, 재개의 `reason`(1~500자, 필수), Space OWNER가 대신 실행할 때의 `override.reason`(1~500자, 필수)이다. 없는 필드는 무시하지 않고 400 `VALIDATION_FAILED`다.

- L1: 활성화·종료·재개·보관·보관 해제의 Event 경로 실행자는 Event OWNER다. `EVENT_LIFECYCLE`은 OWNER 기본값에만 있고 GRANT·REVOKE 대상이 아니다(422 `PERMISSION_OWNER_ONLY`).
- L2: Space OWNER는 `event_users` 행 없이도 활성화·종료·재개를 대신 실행할 수 있다. `override.reason`이 없으면 403 `OVERRIDE_REQUIRED`. 있으면 200, `actedAs: SPACE_OWNER_OVERRIDE`, audit, Event OWNER 전원에게 알림 기록. 전달 채널은 OPEN이다. Space ADMIN은 전이를 실행하지 못한다.
- L3: 보관과 보관 해제는 Event OWNER 또는 Space OWNER가 한다. Space OWNER의 보관·보관 해제는 Override가 아니므로 `override.reason`이 없어도 된다(`actedAs: SPACE_OWNER`).
- L4: 종료·보관의 확인은 `acknowledgeWarnings: true`만 본다. 경고가 1건 이상인데 이 값이 아니면 409 `CONFIRMATION_REQUIRED`와 실행 시점 경고 수를 돌려주고 저장하지 않는다. 경고가 0건이면 플래그 없이 실행한다. 건수가 미리보기와 달라도 다시 확인받지 않는다. 실행 시점 건수는 전이 행의 스냅샷으로 남는다. 경고는 미완료 업무(`TODO`/`DOING`), 미정산, 미배정, 미전송 안내이며 종료를 막는 조건이 아니다(DEC-050). 종료가 업무를 완료 처리하지 않는다.
- 전이는 `DRAFT→ACTIVE`, `ACTIVE→ENDED`, `ENDED→ACTIVE`, `ENDED→ARCHIVED`, `ARCHIVED→ENDED`만 된다. ACTIVE 직접 보관과 ARCHIVED 직접 재개는 409 `INVALID_STATE_TRANSITION`이다. 이미 목표 상태면 200 `outcome: ALREADY_IN_STATE`이고 이력·audit를 추가하지 않는다. 이 판정은 버전 비교보다 먼저다. 버전이 다르고 목표 상태도 아니면 409 `CONCURRENT_MODIFICATION`과 현재 `lifecycleVersion`, `lastTransition`을 돌려준다.
- 판정 순서: 401 `AUTHENTICATION_REQUIRED` → 404 `RESOURCE_NOT_FOUND`(다른 tenant) → 403 `NOT_A_MEMBER`(회수된 접근) → 403 `FORBIDDEN` 또는 `OVERRIDE_REQUIRED` → 400 `VALIDATION_FAILED` → 200 `ALREADY_IN_STATE` → 409 `CONCURRENT_MODIFICATION` → 409 `INVALID_STATE_TRANSITION` → 409 `CONFIRMATION_REQUIRED` → 200 `TRANSITIONED`.
- L5: 보관하는 transaction에서 그 행사의 PENDING 초대를 `REVOKED`로 바꾼다. 이후 예전 링크 수락은 410 `INVITATION_REVOKED`다. ARCHIVED에서 운영자 제거, 권한 회수, Owner 이전, 본인 이탈은 허용한다. 운영자 추가, 초대, GRANT, REVOKE 해제는 409 `EVENT_ARCHIVED`다.
- L8: DRAFT를 끝내는 전이는 없다. 방치된 DRAFT는 DEC-061 삭제 요청으로 정리한다.
- L9: ENDED·ARCHIVED에서 새 참가 신청과 재제출은 409 `EVENT_ENDED`다. 보관 여부를 이 코드로 드러내지 않는다. 종료 전에 연 신청 화면도 제출 시점에 다시 검사한다. 참가 취소·재참가는 이 계약 밖이다. ENDED에서 막는 다른 쓰기는 기존 문장(참가 신청·새 체크인·새 조 편성·현장 일정)을 따른다. 업무 쓰기는 ARCHIVED에서만 `EVENT_ARCHIVED`로 막는다(DEC-062).

Owner 이전은 행사 범위 `owner_transfers`에 둔다. 상태 `PENDING / HANDOVER / DECLINED / CANCELLED / COMPLETED`. 수락 시 받는 사람에게 OWNER를 주고 이전 role은 `recipient_prior_role`에 남긴다. `handoverEndsAt`은 수락 시각+14일을 서버만 계산한다. 같은 수락을 다시 해도 그 시각은 바뀌지 않는다(200 `ALREADY_ACCEPTED`). 취소·거절된 요청의 수락과 COMPLETED 뒤 취소는 409다. PENDING 동안 받는 사람은 Owner 권한이 없다. 행사 Owner 이전은 받는 사람이 그 Space의 활성 멤버일 때만 된다. Owner 수를 1명으로 검사하지 않는다.

```http
GET  /api/v1/operator/spaces/{spaceId}/me/leave-preview
POST /api/v1/operator/spaces/{spaceId}/me/leave
```

이탈 본문은 `{keepEventIds: [...]}`다. 빈 배열은 그 Space 행사 접근을 모두 회수한다. 목록에 없거나 다른 Space 행사가 있으면 400이다. 유지한 행사는 `event_users`와 override를 남기고 행사 전용 협력자로 둔다. 회수한 행사는 `event_users` 삭제로 override가 CASCADE된다. Membership 종료와 한 transaction이다. 이탈 뒤 회수한 행사와 Space API는 403 `NOT_A_MEMBER`다.

이탈 차단은 409 하나다. 순서: `HANDOVER_NOT_ACCEPTED`(본인이 보낸 PENDING) → `LAST_OWNER` → `OWNER_ROLE_HELD`(L7, 공동 Owner가 있어도 이전 없이 이탈) → `RESPONSIBILITY`(미수락 책임). 차단되면 어떤 권한도 바꾸지 않는다. L6: 수락된 HANDOVER 14일 중에도 넘긴 사람은 떠날 수 있고, 떠나는 순간 그 인수인계 권한은 끝난다. 그 행사는 `keepEventIds`에 넣을 수 없다. Event OWNER인 행사도 유지할 수 없다.

회귀는 위 판정과 같다. 대표 행만 둔다.

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | Event OWNER가 DRAFT를 활성화 | 200 `TRANSITIONED`, ACTIVE, version +1, 이력·audit 1건 |
| 2 | MANAGER가 종료 | 403 `FORBIDDEN`, 상태 불변 |
| 3 | Space OWNER가 `override.reason` 없이 종료 | 403 `OVERRIDE_REQUIRED` |
| 4 | Space OWNER가 사유를 넣어 종료 | 200 `SPACE_OWNER_OVERRIDE`, Event OWNER 전원 알림 기록 |
| 5 | Space OWNER가 사유 없이 보관 | 200 `SPACE_OWNER` |
| 6 | 미완료 업무가 있는데 `acknowledgeWarnings` 없이 종료 | 409 `CONFIRMATION_REQUIRED`, 상태 불변 |
| 7 | 6과 같고 플래그가 true | 200 ENDED. 업무는 TODO/DOING 그대로. 스냅샷에 실행 시점 건수 |
| 8 | 같은 버전으로 두 Owner가 종료 | 먼저 커밋한 쪽 `TRANSITIONED`, 늦은 쪽 `ALREADY_IN_STATE`. 이력 1건 |
| 9 | ACTIVE 보관, ARCHIVED 재개 | 둘 다 409 `INVALID_STATE_TRANSITION` |
| 10 | ENDED·ARCHIVED에서 신청 제출 | 409 `EVENT_ENDED` |
| 11 | 보관 | PENDING 초대 REVOKED. 예전 링크 수락 410 `INVITATION_REVOKED` |
| 12 | 취소된 이전을 수락 | 409, HANDOVER 없음 |
| 13 | 수락을 두 번 | 두 번째 200 `ALREADY_ACCEPTED`, `handoverEndsAt` 불변 |
| 14 | 공동 Owner가 있는 행사 Owner가 이전 없이 이탈 | 409 `OWNER_ROLE_HELD`, 권한 불변 |
| 15 | 수락된 HANDOVER 중 넘긴 사람이 이탈 | 200. 그 인수인계 권한은 즉시 종료. 그 행사는 유지 불가 |
| 16 | PENDING 이전과 마지막 Owner와 남은 책임이 같이 있는 이탈 | 409 `HANDOVER_NOT_ACCEPTED` 하나만 |
