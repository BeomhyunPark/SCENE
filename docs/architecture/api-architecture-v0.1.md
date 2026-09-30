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
- 모든 table에 version을 넣지 않는다. 위험한 Assignment, Event configuration 일부, Operator-managed current state 일부에 선택 적용. 충돌은 `409 CONCURRENT_MODIFICATION`.
- Application 최초 제출, Payment 생성/Refund, Check-in 등 대화에 제시된 중복 위험 경계를 우선 기록한다. 모든 API에 의무화하지 않는다.
- Export와 외부 Integration도 Idempotency-Key 후보. Idempotency와 business uniqueness는 별개다.
- Key scope·TTL·동일 key/다른 payload·응답 재전달 세부는 OPEN.
- `X-Request-Id`는 요청 식별 개념, distributed tracing context는 분산 trace 전파 개념. 둘을 동일 개념으로 취급하지 않는다.
- 초기 `X-Request-Id`로 사용자 오류와 Backend log 연결. 분산 tracing 도입 시 `traceparent` / `tracestate`와 구분.
- 모든 Domain에 DELETE를 강제하지 않는다. Payment는 VOID/REFUND, Participant 익명화는 별도 command로 다룬다.

## 2. API 경로 읽는 법

아래 Domain 표의 `/...`는 별도 명시가 없으면 `/api/v1/operator/events/{eventId}` 뒤에 붙는다. 예: `GET /tasks`는 `GET /api/v1/operator/events/{eventId}/tasks`다.

Endpoint는 추가 참조 원문과 회수된 대화에 제시된 경로다. 메서드·payload·Role mapping을 관례로 추가하지 않는다. 후보·보류 상태는 각 절에 표시한다.

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
- 후보 Permission: `EVENT_READ`, `EVENT_UPDATE`, `EVENT_CLOSE`, `EVENT_USER_READ`, `EVENT_USER_MANAGE`.
- Event role: `OWNER / MANAGER / STAFF`.
- Event lifecycle에 언급된 `DRAFT → ACTIVE → ENDED → ARCHIVED`의 정확한 transition rule은 OPEN. 해당 이름만으로 모든 전이를 허용하지 않는다.
- Event OWNER cardinality / transfer, Space role과 Event role의 상세 Permission mapping은 OPEN 또는 원문 대조 필요.

```http
POST   /api/v1/operator/spaces/{spaceId}/events
GET    /api/v1/operator/spaces/{spaceId}/events
GET    /api/v1/operator/events/{eventId}
PATCH  /api/v1/operator/events/{eventId}
GET    /api/v1/operator/events/{eventId}/operators
POST   /api/v1/operator/events/{eventId}/operators
PATCH  /api/v1/operator/events/{eventId}/operators/{operatorId}
DELETE /api/v1/operator/events/{eventId}/operators/{operatorId}
```

Event 생성 + creator를 `event_users.OWNER`로 생성하는 작업은 하나의 transaction. API 이름은 DB `event_users` 대신 `operators`. 최초 기준의 memberId 기반 추가는 조직 Member 경로로 남길 수 있으나 DEC-039의 행사 전용 협력자 경로도 필요하다. 모든 운영자에게 user → member → event operator를 강제하지 않는다. 행사 전용 초대·사용자 참조·DTO 계약은 후속 설계에서 정한다.

Event 종료·Owner 이전은 중요한 command 후보지만 정확한 transition/transfer 정책·경로는 OPEN이다.

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

상태: `TODO / DOING / DONE / CANCELLED`. `{"status":"DONE"}` 같은 PATCH 허용. 별도 complete/cancel command와 모든 Task의 optimistic version을 강제하지 않는다. Project Management 제품으로 확장하지 않는다.

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

다른 Participant의 Group을 임의 조회하지 않는다. 사람의 배정 판단을 지원하며 자동 편성을 확정하지 않는다.

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
EVENT_CLOSE
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

초기에는 Java enum + Role → Permission Set mapping. DB `permissions / role_permissions` 테이블을 만들지 않는다. 후보 목록을 승인된 모든 Role의 권한으로 해석하지 않는다.

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

1. Organization 최초 가입 / Space 생성 / Invitation 제품 흐름은 DEC-036~039로 확정. 상세 계약과 정확한 초대 TTL·재전송·행사 전용 협력자 경로는 후속 설계.
2. Space OWNER와 Event OWNER cardinality / transfer policy.
3. Event lifecycle transition rule. `DRAFT → ACTIVE → ENDED → ARCHIVED`의 허용 조건·전이는 미정.
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
- 2026-09-30 [DEC-028~030](../product/PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다): 조직 관리자의 행사 조회·수정 분리, 운영자별 업무 권한, 조직 관리자의 행사 전체 조회와 리더의 자기 그룹원 전체 조회를 반영해야 한다. 연락처·신청 답변과 조직 관리자의 정산 상세 조회를 포함한다. 화면과 서버의 권한 판단은 DEC-031에 따라 일치시킨다. 개별 권한 저장·판정 방식과 조직·그룹 조회의 endpoint/DTO 경계는 OPEN. 고정 Role mapping만으로 개별 권한 요구가 해결됐다고 해석하지 않는다.
- QR credential, Notice targeting, idempotency key scope/TTL/response replay와 raw Access Key 1회 전달의 결합.
- Field별 보존기간·익명화 범위, Export 파일·비동기 job 계약.
- logs/history의 Domain별 cursor 채택과 request/tracing context의 상세 연결.
- `APPLICATION_CLOSED`와 `FORM_CLOSED`의 의미·매핑·통합 여부.

이 항목은 이번 문서 작업에서 새 의사결정을 내리지 않았음을 표시한다. API map이 있다는 사실만으로 Gate Review 완료·구현 준비 완료를 주장하지 않는다.


## 2026-09-30 Owner·책임 이전 후속 정책

[DEC-032~035](../product/PRODUCT_DECISIONS.md#dec-032--조직행사-owner는-복수-가능하며-같은-사람이-두-역할을-맡을-수-있다)에 따라 조직·행사 Owner는 복수 가능하고 같은 사람이 두 역할을 맡을 수 있다. 수락 T0에 새 Owner가 즉시 권한을 받고, 넘긴 사람의 해당 Owner·인수인계 권한만 T0+14일에 종료한다. 다른 조직·행사 역할과 별도 권한은 유지한다.

업무 상태 PENDING에서는 요청자 취소·수신자 거절, HANDOVER에서는 양쪽 취소, COMPLETED에서는 취소 불가·새 위임 시작으로 처리한다. 취소는 위임·인수인계와 해당 권한·책임 이전 상태만 복구하고 실제 행사 작업 데이터는 유지한다. 위임과 Membership 종료는 별도다.

마지막 Owner 이탈은 후임 수락 전 차단하고 탈퇴·제거 전 남은 행사 책임·준비 업무의 인수자 수락을 검사한다. 조직 Owner는 행사 책임구조 복구를 시작하고 새 담당자를 지정해 수락을 받는다. 긴급 상황에서는 기존 담당자 접근을 먼저 차단하고 책임자 지정 필요 상태를 표시할 수 있다. 조직 Owner를 모든 행사의 상시 Owner로 자동 지정하지 않는다.

기존 OWNER cardinality·transfer 전체가 미정이라는 설명은 위 제품 정책에 한해 갱신한다. 상세 관계·권한 저장·만료·동시성·세션·endpoint/DTO와 책임자 지정 상태의 저장 방식은 기술 설계에서 정한다. 업무 상태명을 DB enum으로 자동 확정하거나 행사 lifecycle에 새 상태를 임의 추가하지 않는다. 모든 조직 Owner의 접근 불가 상황은 별도 Account/Organization Recovery 정책으로 남긴다. [검토 결과](../product/owner-handover-review.md)에 적용 범위와 후속 #5·#8·#9·#10을 기록한다.


## 2026-09-30 조직 가입·행사 전용 협력자 후속 정책

[DEC-036~039](../product/PRODUCT_DECISIONS.md#dec-036--검증된-조직-생성자가-최초-owner가-된다)와 [검토 결과](../product/organization-entry-review.md)를 적용한다. 검증된 생성자가 최초 Owner가 되고, 조직 검색 가입 요청은 조직 Owner 승인, 대상자 조직 초대는 수락만으로 MEMBER가 된다. 대기 사용자는 조직 내부 정보를 보지 못한다. 초대는 대상 계정·범위·만료·1회 소비를 검증한다. 7일은 제안값이며 정확한 TTL은 상세 계약에서 정한다.

조직 Membership과 행사 접근은 별개다. 조직 소속 없이 해당 행사만 운영하는 협력자는 운영계정 ↔ Event 운영자 관계와 Permission으로 접근을 판정하고 조직 내부·다른 행사 접근을 자동 허용하지 않는다. 모든 행사 운영자에게 memberId와 Membership을 요구하던 최초 기준은 갱신한다. DB 관계·FK·DTO·endpoint·초대 재전송·동시성·소속 제거 시 독립 행사 접근 처리의 상세 계약은 후속 기술 검토에서 정한다.
