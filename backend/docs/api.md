# Operator API

지금 서버가 받는 HTTP 계약이다. 설계 초안은 저장소 루트의 [API Architecture](../../docs/architecture/api-architecture-v0.1.md)에 있고, 파일을 찾는 순서는 [소스 안내](source-guide.md)에 있다. 이 문서와 코드가 다르면 코드를 따른다.

관련 이슈: [#89](https://github.com/BeomhyunPark/SCENE/issues/89), [#93](https://github.com/BeomhyunPark/SCENE/issues/93), [#97](https://github.com/BeomhyunPark/SCENE/issues/97).

참가자 API와 공개 API는 아직 없다. `/api/v1/participant/**`와 `/api/v1/public/**`는 필터 체인만 있고 제품 컨트롤러가 없다. 아래 경로는 모두 `/api/v1/operator`다.

로컬 기준 주소는 `http://localhost:8080`이다. 시드 사용자 id는 [README](../README.md)에 있다.

## 공통

| 항목 | 값 |
| --- | --- |
| JSON 이름 | `camelCase` |
| 식별자 | UUID 문자열 |
| 시각 | ISO-8601. 예: `2026-10-07T00:00:00Z` |
| 성공 본문 | `application/json`. 값이 없는 필드는 `null` |
| 오류 본문 | `application/problem+json` |
| 요청 id | 헤더 `X-Request-Id`. 형식은 1–128자의 `A-Za-z0-9._-`. 없거나 형식이 다르면 서버가 UUID를 만든다. 응답 헤더와 오류 본문 `traceId`가 같은 값이다. 분산 trace id가 아니다 |

`Idempotency-Key`는 읽지 않는다.

### CSRF

변경 요청은 쿠키 `XSRF-TOKEN`과 헤더 `X-XSRF-TOKEN`에 같은 문자열을 넣는다. 토큰을 발급하는 주소는 없다. 클라이언트가 정한 값이면 된다. 두 값이 없거나 다르면 `403 FORBIDDEN`이다. 로그인도 이 검사를 받는다. 조회 `GET`은 CSRF가 필요 없다.

쿠키는 `HttpOnly`가 아니고 `Secure`이며 경로는 `/`다. 자바스크립트가 읽을 수 있다.

### 세션 쿠키

로그인 성공의 `Set-Cookie` 이름은 `placeholder-operator-session`이다. 값은 Spring Session의 세션 id이고, Base64가 아니다. `HttpOnly`, `Secure`, 경로 `/`, `SameSite=Lax`다. 자리표시자 이름과 `Lax`는 `application.yml`의 `scene.security.session`에 있다. 제품의 쿠키 이름과 세션 만료는 아직 결정이 아니다. `spring.session.timeout` 30분은 라이브러리 기본값이다.

서버는 이 쿠키를 Spring Session JDBC(`spring_session`)에 저장한다. 로그인 이후의 operator 경로는 이 쿠키가 필요하다. 없거나 만료되면 `401 AUTHENTICATION_REQUIRED`다.

두 쿠키 모두 `Secure`다. Chromium 계열 브라우저는 `http://localhost`를 안전한 출처로 보아 이 쿠키를 보관한다. `curl`은 `http` 응답에 붙은 `Secure` 쿠키를 다음 `http` 요청에 스스로 돌려보내지 않는다. 아래 예시는 쿠키 값을 직접 넣는다.

### 목록

쿼리 `page`는 0부터다. 생략하면 0이다. `size`를 생략하면 50이고, 100을 넘기면 `400 PAGE_SIZE_EXCEEDED`다. 서버가 100으로 줄이지 않는다. `page`가 음수이거나 `size`가 1보다 작으면 `400 VALIDATION_FAILED`이고 `errors[0].field`는 `page` 또는 `size`다.

```json
{
  "items": [],
  "page": { "number": 0, "size": 50, "totalItems": 0, "totalPages": 0 }
}
```

`sort`는 반복 쿼리다. 한 값의 형식은 `필드,asc` 또는 `필드,desc`다. 허용 필드는 각 API에 적혀 있다. 형식이 다르거나 허용되지 않은 필드는 `400 VALIDATION_FAILED`이고 필드는 `sort`다.

### 오류

클라이언트가 분기하는 값은 `code`다. `detail` 문장으로 분기하지 않는다.

```json
{
  "type": "urn:scene:problem:validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "요청 값이 올바르지 않습니다.",
  "code": "VALIDATION_FAILED",
  "traceId": "req-1",
  "errors": [{ "field": "title" }]
}
```

`errors`와 그 밖의 추가 필드는 해당 오류에만 있다. 필드 검증이 스프링 검증에서 나면 `errors[]`에 `field`, `code`, `message`가 있다. `userId`가 빠지면 `code`는 `REQUIRED`다. 경로의 UUID 형식이 틀리면 `400 VALIDATION_FAILED`이고 `errors`는 없다.

예상하지 못한 예외는 `500`이다. `code`는 없고 `type`은 `urn:scene:problem:unexpected`다. 예외 메시지는 본문에 넣지 않는다.

등록된 코드의 상태와 문장은 `common/error/ErrorCode.java`가 정본이다. 아래 표는 이 문서의 API가 돌려주는 코드다.

| code | 상태 | 언제 |
| --- | --- | --- |
| `AUTHENTICATION_REQUIRED` | 401 | 세션이 없거나, 로그인 id가 `users`에 없다 |
| `FORBIDDEN` | 403 | 대상은 보이는데 그 작업 권한이 없다. CSRF 불일치는 이 코드로 나간다 |
| `NOT_A_MEMBER` | 403 | 멤버십이 끝났거나 행사 접근이 제거되었다 |
| `OVERRIDE_REQUIRED` | 403 | 공간 소유자가 대신 실행하는데 `override.reason`이 없다 |
| `INVITATION_EMAIL_MISMATCH` | 403 | 세션 이메일과 초대 이메일이 다르다 |
| `VALIDATION_FAILED` | 400 | 본문, 쿼리, 경로 형식이 계약과 다르다 |
| `PAGE_SIZE_EXCEEDED` | 400 | `size`가 100을 넘는다 |
| `RESOURCE_NOT_FOUND` | 404 | 행사가 없거나, 테넌트 밖에 있거나, 그 사람에게 존재를 보여 주지 않는다 |
| `INVITATION_NOT_FOUND` | 404 | 토큰에 해당하는 초대가 없다 |
| `INVITATION_REVOKED` | 410 | 초대가 취소되었다 |
| `INVITATION_EXPIRED` | 410 | 초대 시각이 지났다 |
| `INVITATION_SUPERSEDED` | 410 | 다시 보낸 초대로 이전 토큰은 쓸 수 없다 |
| `CONCURRENT_MODIFICATION` | 409 | `expectedLifecycleVersion`이 현재와 다르다 |
| `INVALID_STATE_TRANSITION` | 409 | 현재 행사 상태에서 그 전이를 할 수 없다 |
| `CONFIRMATION_REQUIRED` | 409 | 종료나 보관 전에 경고 확인이 필요하다 |
| `EVENT_ARCHIVED` | 409 | 보관된 행사에서는 그 변경을 할 수 없다 |
| `INVITATION_ALREADY_ACCEPTED` | 409 | 다른 사용자가 이미 초대를 수락했다 |
| `TASK_VERSION_CONFLICT` | 409 | 완료·다시 열기에서 `version`이 현재와 다르다 |
| `INVALID_TASK_STATE` | 409 | 업무 상태 때문에 체크, 완료, 다시 열기를 할 수 없다 |
| `PERMISSION_OWNER_NOT_OVERRIDABLE` | 422 | 소유자의 권한은 개별 설정할 수 없다 |
| `PERMISSION_OWNER_ONLY` | 422 | `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`는 소유자만 가진다 |
| `PERMISSION_NOT_OVERRIDABLE` | 422 | `EVENT_READ`는 개별 설정으로 뺄 수 없다 |
| `RATE_LIMITED` | 429 | 초대 미리보기·수락이 한도를 넘었다 |

`LAST_OWNER`, `TRANSFER_NOT_PENDING` 같은 나머지 코드는 enum에 있으나 이 문서의 HTTP는 쓰지 않는다. 탈퇴와 소유권 이전은 전용 URL이 없다.

접근은 경로마다 입구가 다르다. 없는 대상은 404, 제거된 접근은 `NOT_A_MEMBER`, 권한 부족은 `FORBIDDEN`이다. 한 경로의 규칙을 다른 경로에 그대로 적용하지 않는다.

## 로컬에서 한 번 호출

서버를 띄우는 명령과 시드 id는 [README](../README.md)에 있다. 아래는 그 시드의 소유자다. `POST`는 CSRF 쿠키와 헤더를 같이 보낸다. 응답의 `Set-Cookie`에서 세션 값만 골라 다음 요청에 넣는다.

```bash
CSRF=dev-csrf
curl -sS -D - \
  -H 'Content-Type: application/json' \
  -H "X-XSRF-TOKEN: $CSRF" \
  -H "Cookie: XSRF-TOKEN=$CSRF" \
  -d '{"userId":"00000000-0000-4000-8000-000000000001","email":"local-invite@example.com"}' \
  http://localhost:8080/api/v1/operator/auth/login

curl -sS \
  -H 'Cookie: placeholder-operator-session=여기에-Set-Cookie-값' \
  http://localhost:8080/api/v1/operator/me
```

로그인 `200`은 `userId`와 `displayName`이다. `email`은 응답에 없고 세션에만 있다. 초대를 수락할 때 그 값과 초대 이메일을 비교하므로, 시드 초대 `local-invite@example.com`을 보려면 로그인 본문에 그 이메일을 넣는다. 시드 행의 id `…0030`은 토큰이 아니다. 미리보기와 수락은 그 id로 호출하지 않는다.

같은 호출 순서는 `src/test/java/app/scene/event/ServerContractRegressionIT.java`의 `login`이 서버에 대해 검증한 방식이다. 이 문서의 예시는 그 테스트를 로컬 서버에 옮겨 적은 것이고, 이 작성에서 서버를 띄워 다시 호출하지는 않았다.

## 준비 확인

`GET /actuator/health`

세 필터 체인 밖이다. 세션과 CSRF가 필요 없다. 정상이면 `{"status":"UP"}`다.

## 세션

### `POST /api/v1/operator/auth/login`

세션 없이 호출한다. CSRF는 필요하다.

```json
{ "userId": "00000000-0000-4000-8000-000000000001", "email": "Local@Example.com" }
```

| 필드 | 규칙 |
| --- | --- |
| `userId` | 필수. `users.id`. 비밀번호가 아니다 |
| `email` | 생략 가능. 앞뒤 공백을 자르고 소문자로 세션에만 둔다. 응답에는 없다. 초대 수락이 이 값과 초대 이메일을 비교한다. `users`에 이메일 컬럼은 없다 |

`200` 본문은 `{ "userId", "displayName" }`다. 없는 id는 `401 AUTHENTICATION_REQUIRED`이고 세션을 만들지 않는다. `userId`가 없으면 `400 VALIDATION_FAILED`다.

### `GET /api/v1/operator/me`

세션의 사용자. `200` 본문은 로그인과 같다. 역할은 여기 없다.

### `POST /api/v1/operator/auth/logout`

세션을 버린다. `204`이고 본문이 없다. 세션이 없어도 `204`다.

## 공간과 행사 이름

### `GET /api/v1/operator/spaces/{spaceId}`

활성 멤버가 공간 이름을 본다.

`200`

```json
{ "spaceId": "…", "name": "Local space" }
```

멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`다. 상태가 `ACTIVE`가 아니면 `403 NOT_A_MEMBER`다. 행사 운영자 행만 있고 공간 멤버십이 끝난 경우는 공간을 보지 못한다.

### `GET /api/v1/operator/spaces/{spaceId}/events/{eventId}`

그 행사의 운영자가 이름을 본다. `EVENT_READ`가 필요하다.

`200`

```json
{ "eventId": "…", "spaceId": "…", "name": "Local event" }
```

행사 운영자가 아니며 접근 취소 기록도 없으면 `404`다. 접근이 제거된 운영자는 `403 NOT_A_MEMBER`다. 운영자인데 `EVENT_READ`가 없으면 `403 FORBIDDEN`이다. 공간 소유자라는 이유만으로 이 경로는 열리지 않는다.

## 행사 상태

상태 값은 `DRAFT`, `ACTIVE`, `ENDED`, `ARCHIVED`다.

읽기는 행사 운영자의 `EVENT_READ`, 또는 활성 공간 `OWNER`다. 공간 `ADMIN`은 이 읽기에 포함되지 않는다. 변경은 행사 `OWNER`의 `EVENT_LIFECYCLE`이다. 공간 `OWNER`는 보관과 보관 해제를 자신의 권한으로 하고, 활성화·종료·다시 열기는 `override.reason`이 있을 때 `SPACE_OWNER_OVERRIDE`로 한다. 그 외는 `403 FORBIDDEN`이다. 공간 소유자인데 사유가 없으면 `403 OVERRIDE_REQUIRED`다.

### `GET /api/v1/operator/events/{eventId}/lifecycle`

`200`

```json
{
  "lifecycleStatus": "DRAFT",
  "lifecycleVersion": 0,
  "lastTransition": {
    "command": "ACTIVATE",
    "fromStatus": "DRAFT",
    "toStatus": "ACTIVE",
    "actedAs": "EVENT_OWNER",
    "occurredAt": "2026-10-07T00:00:00Z"
  }
}
```

전이가 한 번도 없으면 `lastTransition` 키는 없다.

### `GET /api/v1/operator/events/{eventId}/lifecycle/transitions`

목록이다. `sort`를 생략하면 최신이 앞이다. 허용 필드는 `occurredAt` 하나다. 정렬을 여러 개 주면 `400`이다.

항목 필드: `command`, `fromStatus`, `toStatus`, `actedAs`, `actorUserId`, `reason`, `occurredAt`, `warnings`.

`warnings`는 그 전이를 실행할 때 저장한 개수다. 키는 `openTasks`, `unsettledFees`, `unassignedParticipants`, `unsentNotices`다. 뒤의 셋은 이 서버에서 0이다.

### 상태 변경

| 메서드와 경로 | 현재 | 다음 |
| --- | --- | --- |
| `POST …/events/{eventId}/activate` | `DRAFT` | `ACTIVE` |
| `POST …/events/{eventId}/end` | `ACTIVE` | `ENDED` |
| `POST …/events/{eventId}/reopen` | `ENDED` | `ACTIVE` |
| `POST …/events/{eventId}/archive` | `ENDED` | `ARCHIVED` |
| `POST …/events/{eventId}/unarchive` | `ARCHIVED` | `ENDED` |

본문:

```json
{
  "expectedLifecycleVersion": 0,
  "acknowledgeWarnings": true,
  "reason": "일정을 다시 연다",
  "override": { "reason": "행사 소유자 대신 종료한다" }
}
```

| 필드 | 규칙 |
| --- | --- |
| `expectedLifecycleVersion` | 필수 정수. 현재 `lifecycleVersion`과 같아야 한다 |
| `acknowledgeWarnings` | `end`와 `archive`에서 열린 업무가 1건 이상이면 `true`여야 한다 |
| `reason` | `reopen`에서 필수. 공백만인 값은 거절한다. 500자를 넘기면 거절한다 |
| `override.reason` | 공간 소유자가 활성화·종료·다시 열기를 대신할 때 필수. 1–500자 |

이미 목표 상태이면 버전을 비교하기 전에 `200`을 돌려주고, 버전은 그대로다. `expectedLifecycleVersion` 필드는 이때도 있어야 한다.

```json
{
  "outcome": "ALREADY_IN_STATE",
  "lifecycleStatus": "ACTIVE",
  "lifecycleVersion": 1,
  "actedAs": "EVENT_OWNER"
}
```

전이가 되면 `outcome`은 `TRANSITIONED`이고 `lifecycleVersion`은 1 증가한다. `actedAs`는 `EVENT_OWNER`, `SPACE_OWNER`, `SPACE_OWNER_OVERRIDE` 중 하나다.

`archive`는 그 행사의 `PENDING` 초대를 `REVOKED`로 바꾼다.

오류:

| 조건 | 코드 | 추가 필드 |
| --- | --- | --- |
| 버전이 다르다 | `409 CONCURRENT_MODIFICATION` | `lifecycleVersion`, `currentStatus`, `lastTransition` |
| 현재 상태에서 그 명령이 아니다 | `409 INVALID_STATE_TRANSITION` | `currentStatus`, `command` |
| 종료·보관인데 열린 업무가 있고 확인이 없다 | `409 CONFIRMATION_REQUIRED` | `warnings` |
| 필드 형식, 빠진 버전, 너무 긴 사유 | `400 VALIDATION_FAILED` | `errors[].field` |

권한 검사를 통과한 뒤에 필드 형식을 본다. 권한이 없으면 본문이 잘못되어도 `403`이다.

## 초대

초대 변경은 행사 `OWNER`만 한다. `EVENT_USER_MANAGE`다. 클래스는 `event/invitation/EventInvitationController`다. 보관된 행사에서는 만들거나 다시 보내지 못한다.

응답에는 토큰이 없다. 서버는 토큰 해시만 저장한다. 원문 토큰은 `CapturingInvitationMailer`가 프로세스 메모리에 담는 링크의 fragment에만 있다. 링크 모양은 `/operator/invitations#` 뒤에 토큰이다. SMTP 구현은 없다. 로그에 토큰을 남기지 않는다. 프로세스가 끝나면 그 링크도 없다. 유효 시간은 7일이다.

같은 행사·이메일의 기존 `PENDING`은 새 초대를 만들 때 `SUPERSEDED`가 된다.

### `POST /api/v1/operator/events/{eventId}/invitations`

```json
{ "email": "Person@Example.com", "role": "STAFF" }
```

`email`은 앞뒤 공백을 자르고 소문자로 둔다. `@`가 하나 있고, 320자 이하이며, 공백이 없어야 한다. `role`은 `MANAGER` 또는 `STAFF`다. `OWNER`는 초대 역할이 아니다.

`200`

```json
{
  "id": "…",
  "role": "STAFF",
  "status": "PENDING",
  "expiresAt": "2026-10-14T00:00:00Z"
}
```

보관된 행사는 `409 EVENT_ARCHIVED`다.

### `POST /api/v1/operator/events/{eventId}/invitations/{invitationId}/resend`

본문이 없다. 그 `PENDING` 초대를 `SUPERSEDED`로 두고 같은 이메일·역할로 새 `PENDING`을 만든다. `200` 본문은 생성과 같다. 새 id다.

초대가 그 행사에 없으면 `404 RESOURCE_NOT_FOUND`다. `PENDING`이 아니면 `400 VALIDATION_FAILED`이고 필드는 `invitationId`다.

### `DELETE /api/v1/operator/events/{eventId}/invitations/{invitationId}`

`PENDING`을 `REVOKED`로 바꾼다. 이미 `REVOKED`이면 같은 본문으로 `200`이다. `ACCEPTED`나 `SUPERSEDED`는 `400 VALIDATION_FAILED`다. 본문 없는 204가 아니다.

### `POST /api/v1/operator/invitations/preview`

### `POST /api/v1/operator/invitations/accept`

로그인한 운영자가 호출한다. 본문은 `{ "token": "…" }`다. 비교하는 이메일은 본문이 아니라 로그인할 때 세션에 넣은 `email`이다.

미리보기 `200`

```json
{
  "eventName": "Local event",
  "role": "STAFF",
  "inviterName": "Local owner",
  "expiresAt": "2026-10-14T00:00:00Z",
  "outcome": "PENDING"
}
```

수락 `200`은 `{ "outcome": "ACCEPTED" }`다. 같은 사람이 다시 수락하면 `{ "outcome": "ALREADY_ACCEPTED" }`다. 수락은 그 사용자를 초대의 `role`로 `event_users`에 넣는다. 이미 운영자면 역할을 바꾸지 않는다.

미리보기는 행을 바꾸지 않는다. 수락과 미리보기는 계정마다, 그리고 요청 주소마다 한 시간에 5회다. 두 경로가 한 한도를 같이 쓴다. 한도는 이 프로세스 메모리에만 있다. 넘으면 `429 RATE_LIMITED`다. 한도 숫자는 잠정값이다.

토큰이 없으면 `404 INVITATION_NOT_FOUND`다. 이 코드는 초대가 있는지 알려 주지 않는다. 이메일이 다르면 `403 INVITATION_EMAIL_MISMATCH`다. 다른 사람이 이미 수락했으면 `409 INVITATION_ALREADY_ACCEPTED`다. 취소는 `410 INVITATION_REVOKED`, 만료는 `410 INVITATION_EXPIRED`, 다시 보낸 이전 토큰은 `410 INVITATION_SUPERSEDED`다. 행사가 보관되었으면 `409 EVENT_ARCHIVED`다.

## 운영자

목록과 한 명 조회는 행사 `EVENT_READ` 또는 활성 공간 `OWNER`다. 추가, 역할 변경, 제거, 권한 교체는 행사 `OWNER`의 `EVENT_USER_MANAGE`다. 공간 역할만으로는 운영자를 바꾸지 못한다. 공간 `OWNER`는 권한 행을 읽을 수 있고, 공간 `ADMIN`은 읽지 못한다.

역할은 `OWNER`, `MANAGER`, `STAFF`다. 기본 권한은 [소스 안내의 권한 표](source-guide.md#접근과-권한)와 같다. 컨트롤러는 `event/operator/EventOperatorController`다.

등록된 권한 키는 이 이름뿐이다. 여기 없는 문자열은 `UNKNOWN_PERMISSION`이다.

`EVENT_UPDATE`, `EVENT_USER_READ`, `PARTICIPANT_READ`, `PARTICIPANT_CONTACT_READ`, `PARTICIPANT_WRITE`, `FORM_WRITE`, `APPLICATION_READ`, `APPLICATION_MANAGE`, `TASK_WRITE`, `SCHEDULE_WRITE`, `NOTICE_WRITE`, `FINANCE_READ`, `FINANCE_WRITE`, `GROUP_WRITE`, `ROOM_WRITE`, `RIDE_WRITE`, `CLASS_WRITE`, `CHECKIN_WRITE`, `MISSION_WRITE`, `GUARDIAN_WRITE`, `GUARDIAN_CONTACT_READ`, `PRIVACY_LOG_READ`, `AUDIT_LOG_READ`, `DATA_EXPORT`, `EVENT_READ`, `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`.

`OWNER`는 이 키를 모두 기본으로 가진다. `MANAGER`의 기본은 `EVENT_READ`와 `TASK_WRITE`다. `STAFF`의 기본은 `EVENT_READ`다. 키가 있다고 그 업무의 API가 열려 있는 것은 아니다. 지금 HTTP가 `PermissionEvaluator`로 보는 키는 `EVENT_READ`, `TASK_WRITE`, `EVENT_USER_MANAGE`다. 행사 상태 변경은 그 키 대신 행사 역할 `OWNER`와 공간 역할 `OWNER`를 본다. `EVENT_LIFECYCLE`은 소유자 전용이라 다른 역할에 `GRANT`되지 않는다.

### `GET /api/v1/operator/events/{eventId}/operators`

목록이다. `sort` 허용 필드는 `displayName`, `role`이다. 생략하면 표시 이름, 그다음 `userId`다.

`include`를 생략하면 항목은 `{ "userId", "displayName", "role" }`다. `include=permissions`는 행사 `OWNER`만 호출한다. 항목에 `effectivePermissions` 문자열 배열이 추가된다. 다른 `include` 값은 `400`이고 필드는 `include`다. 소유자가 아닌 사람이 `include=permissions`를 주면 `403 FORBIDDEN`이다.

### `GET /api/v1/operator/events/{eventId}/operators/{userId}`

`200`은 `{ "userId", "displayName", "role" }`다. 그 행사 운영자가 아니면 `404 RESOURCE_NOT_FOUND`다. 연락처, 토큰, 세션은 이 본문에 없다.

### `POST /api/v1/operator/events/{eventId}/operators`

```json
{ "userId": "…", "role": "STAFF" }
```

`role`은 `OWNER`, `MANAGER`, `STAFF`다. 대상은 그 공간의 활성 멤버여야 한다. 멤버가 아니면 `404 RESOURCE_NOT_FOUND`이고 행을 만들지 않는다. 이미 운영자면 `400 VALIDATION_FAILED`이고 필드는 `userId`다. 보관된 행사는 `409 EVENT_ARCHIVED`다.

`200`은 한 명 조회와 같은 모양이다. 개별 권한 행은 만들지 않는다.

### `PATCH /api/v1/operator/events/{eventId}/operators/{userId}`

```json
{ "role": "MANAGER" }
```

`role`은 `MANAGER` 또는 `STAFF`만이다. 이 경로로 `OWNER`를 부여하지 않는다. 요청한 역할이 지금과 같아도 그 사람의 개별 권한 행은 지워지고 역할은 다시 써진다. 보관된 행사는 `409 EVENT_ARCHIVED`다. `200`은 한 명 조회와 같다.

### `DELETE /api/v1/operator/events/{eventId}/operators/{userId}`

운영자 행을 제거한다. 성공은 `200`이고 본문이 없다. 그 사람이 담당인 업무의 `assigneeUserId`는 비워지고 업무 `version`이 1 증가한다. 없는 운영자는 `404`다.

### `GET /api/v1/operator/events/{eventId}/operators/{userId}/permissions`

행사 `OWNER`, 활성 공간 `OWNER`, 또는 자기 자신만 읽는다.

`200`

```json
{
  "userId": "…",
  "role": "MANAGER",
  "roleDefaults": ["EVENT_READ", "TASK_WRITE"],
  "overrides": { "grants": [], "revokes": [] },
  "effective": ["EVENT_READ", "TASK_WRITE"]
}
```

배열은 이름순이다. `effective`는 역할 기본값에 `GRANT`를 더하고 `REVOKE`를 뺀 결과다. 세션에 저장하지 않는다.

### `PUT /api/v1/operator/events/{eventId}/operators/{userId}/permissions`

보낸 목록이 그 사람의 개별 권한 전부다. 본문에 없는 기존 override는 지워진다.

```json
{
  "grants": ["NOTICE_WRITE"],
  "revokes": ["TASK_WRITE"]
}
```

`grants`와 `revokes`는 둘 다 필수 배열이다. 빈 배열도 된다. 모르는 키는 `UNKNOWN_PERMISSION`, 같은 요청 안의 중복은 `DUPLICATE_PERMISSION`이다. 이 둘은 `errors[]`의 `code`다.

소유자에게 override를 주면 `422 PERMISSION_OWNER_NOT_OVERRIDABLE`이다. 소유자 전용 키를 `GRANT`하면 `422 PERMISSION_OWNER_ONLY`다. `EVENT_READ`를 `REVOKE`하면 `422 PERMISSION_NOT_OVERRIDABLE`다. 보관된 행사에서 권한이 넓어지면 `409 EVENT_ARCHIVED`다. 같은 내용이면 저장하지 않고 현재 본문을 `200`으로 돌려준다.

## 업무

상태 값은 `TODO`, `DOING`, `DONE`, `CANCELLED`다.

목록과 상세를 읽는 사람은 행사 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다. 만들기, 수정, 삭제는 `TASK_WRITE`다. 담당자라는 이유만으로 만들기·수정·삭제는 되지 않는다.

체크, 완료, 다시 열기는 `TASK_WRITE` 또는 그 업무의 `assigneeUserId`다.

체크 항목을 추가하는 HTTP는 없다. 항목 행이 없으면 `checklist.total`은 0이고, 0건은 완료 조건의 "모두 체크됨"을 만족한다.

업무 목록의 `sort`는 받지 않는다. `sort`를 주면 `400`이다. 순서는 `taskId` 오름차순이다. `assignee`와 `status` 필터는 적용하지 않는다.

### `GET /api/v1/operator/events/{eventId}/tasks`

항목:

```json
{
  "taskId": "…",
  "title": "안내문",
  "status": "TODO",
  "assigneeUserId": null,
  "assigneeDisplayName": null,
  "checklist": { "done": 0, "total": 0 },
  "version": 0
}
```

### `POST /api/v1/operator/events/{eventId}/tasks`

```json
{ "title": "안내문", "assigneeUserId": null }
```

`title`은 필수다. 앞뒤 공백은 잘리고, 빈 문자열과 200자를 넘는 값은 `400`이다. `assigneeUserId`를 생략하거나 `null`이면 담당자가 없다. 넣으면 그 행사 운영자의 UUID여야 한다. 아니면 `400`이고 필드는 `assigneeUserId`다.

`201` 본문은 상세와 같다. `outcome`은 `null`이다. 새 업무 상태는 `TODO`, `version`은 0이다.

보관된 행사는 `409 EVENT_ARCHIVED`다. 행이 생기기 전이면 본문에 `eventStatus`가 있고 `task`는 없다.

### `GET /api/v1/operator/events/{eventId}/tasks/{taskId}`

`200`은 아래 상세다. 그 행사에 업무가 없으면, 권한을 보기 전에 `404 RESOURCE_NOT_FOUND`다.

```json
{
  "taskId": "…",
  "title": "안내문",
  "status": "TODO",
  "version": 0,
  "checklist": {
    "done": 0,
    "total": 0,
    "items": [
      {
        "itemId": "…",
        "label": "출력",
        "position": 0,
        "checked": false,
        "checkedByUserId": null,
        "checkedByDisplayName": null,
        "checkedAt": null
      }
    ]
  },
  "assigneeUserId": null,
  "assigneeDisplayName": null,
  "completedByUserId": null,
  "completedByDisplayName": null,
  "completedAt": null,
  "actions": {
    "canCheck": true,
    "canComplete": true,
    "canReopen": false,
    "blockedReason": null
  },
  "outcome": null
}
```

`actions`는 이 호출자에게 지금 가능한 진행 동작이다. `blockedReason`은 `FORBIDDEN`, `EVENT_ARCHIVED`, `TASK_CANCELLED`, `TASK_DONE`, `CHECKLIST_INCOMPLETE` 중 하나이거나 `null`이다. 쓸 수 없는 사람이 상세를 열면 본문은 `200`이고 `blockedReason`이 `FORBIDDEN`이다. 쓰기 요청 자체는 `403`이다.

### `PATCH /api/v1/operator/events/{eventId}/tasks/{taskId}`

보낸 필드만 바꾼다. `version`은 읽지 않는다.

| 필드 | 규칙 |
| --- | --- |
| `title` | 생성과 같은 길이 규칙 |
| `assigneeUserId` | UUID면 담당을 바꾼다. `null`이면 담당을 지운다. 생략하면 그대로다 |
| `status` | 문자열 `CANCELLED`만 받는다. 다른 상태로 바꾸는 값은 `400`이다 |

제목만 바뀌면 `version`은 그대로다. 담당을 바꾸거나 실제로 `CANCELLED`로 바뀌면 `version`이 1 증가한다. 이미 취소된 업무에 다시 `CANCELLED`를 주면 상태 변화로 세지 않는다. 바뀌는 값이 없으면 저장하지 않고 현재 상세를 `200`으로 돌려준다.

보관된 행사는 `409 EVENT_ARCHIVED`다. 이 409에는 `eventStatus`와 `task`가 있다. `task`는 상세에서 `title`과 `outcome`을 뺀 모양이다.

### `DELETE /api/v1/operator/events/{eventId}/tasks/{taskId}`

업무와 그 체크 항목을 지운다. `204`이고 본문이 없다. 보관된 행사는 `409 EVENT_ARCHIVED`다.

### `PUT /api/v1/operator/events/{eventId}/tasks/{taskId}/items/{itemId}`

```json
{ "checked": true }
```

`checked`는 필수 boolean이다. 항목이 없으면 `404 RESOURCE_NOT_FOUND`다.

`200`은 진행 본문이다. 상세와 같고 `title`은 없다. `outcome`은 `UPDATED` 또는 `NO_CHANGE`다. 값이 원래와 같으면 `NO_CHANGE`이고 `version`은 그대로다. 체크가 바뀌면 `version`이 1 증가한다. `TODO`에서 하나를 체크하면 상태가 `DOING`이 된다. 이미 `DOING`이면 상태는 그대로다. 체크를 해제해도 `DOING`을 `TODO`로 되돌리지는 않는다.

`DONE`이면 `409 INVALID_TASK_STATE`이고 `reason`은 `TASK_DONE`이다. `CANCELLED`이면 `reason`은 `TASK_CANCELLED`다.

### `POST /api/v1/operator/events/{eventId}/tasks/{taskId}/complete`

```json
{ "version": 1 }
```

`version`은 필수다. 현재 `version`과 같아야 한다. 체크가 모두 끝나 있어야 한다. 항목이 0건이면 그 조건을 만족한다.

`200`의 `outcome`은 `COMPLETED` 또는 `ALREADY_DONE`이다. 완료되면 상태가 `DONE`이고 `version`이 1 증가하며 `completedByUserId`와 `completedAt`이 채워진다. 이미 `DONE`이면 `ALREADY_DONE`이고 버전은 그대로다.

| 조건 | 코드 | 추가 |
| --- | --- | --- |
| `version`이 다르다 | `409 TASK_VERSION_CONFLICT` | `task` |
| 체크가 남아 있다 | `409 INVALID_TASK_STATE` | `reason` `CHECKLIST_INCOMPLETE`, `task` |
| 취소된 업무 | `409 INVALID_TASK_STATE` | `reason` `TASK_CANCELLED`, `task` |
| 보관된 행사 | `409 EVENT_ARCHIVED` | `eventStatus`, `task` |

### `POST /api/v1/operator/events/{eventId}/tasks/{taskId}/reopen`

```json
{ "version": 2, "reason": "항목을 다시 본다" }
```

`version`은 필수다. `reason`은 생략할 수 있고, 있으면 500자 이하다. `DONE`을 연다. 체크 항목의 체크 값은 지우지 않는다.

`200`의 `outcome`은 `REOPENED` 또는 `ALREADY_OPEN`이다. `TODO`나 `DOING`이면 `ALREADY_OPEN`이다. 다시 열리면 상태는 `DOING`, `version`은 1 증가, 완료자와 완료 시각은 비운다. `CANCELLED`는 `409 INVALID_TASK_STATE`이고 `reason`은 `TASK_CANCELLED`다. 버전 불일치는 `409 TASK_VERSION_CONFLICT`다.

## 응답에 안 나오는 기록

일부 성공은 응답 밖에 행을 남긴다. 그 행을 읽는 URL은 없다.

### `audit_logs`

값이 실제로 바뀔 때만 남긴다. 저장하지 않은 같은 값, `NO_CHANGE`, `ALREADY_IN_STATE`, `ALREADY_DONE`, `ALREADY_OPEN`, `ALREADY_ACCEPTED`는 남기지 않는다. 권한 override가 요청과 같으면 남기지 않는다. 운영자 역할 변경은 역할이 같아도 override를 지우고 한 줄 남긴다.

| `action` | 언제 |
| --- | --- |
| `EVENT_ACTIVATE`, `EVENT_END`, `EVENT_REOPEN`, `EVENT_ARCHIVE`, `EVENT_UNARCHIVE` | 행사 상태가 실제로 옮겨질 때 |
| `EVENT_USER_ROLE_CHANGED` | 운영자 역할을 다시 쓸 때 |
| `EVENT_USER_PERMISSIONS_REPLACED` | 권한 override 내용이 바뀔 때 |
| `EVENT_ACCESS_REVOKED` | 운영자 제거로 행사 접근이 끊길 때 |
| `TASK_ASSIGNEE_CLEARED` | 그 제거가 업무 담당을 비울 때. `DONE`과 `CANCELLED`를 포함해 담당인 업무마다 한 줄 |
| `TASK_ITEM_CHECKED`, `TASK_ITEM_UNCHECKED` | 체크 값이 바뀔 때 |
| `TASK_COMPLETED` | 업무가 `DONE`이 될 때 |
| `TASK_REOPENED` | `DONE` 업무가 다시 열릴 때 |

이름 상수는 `common/audit/AuditActions`에 있다. 업무 진행의 네 이름은 그 클래스 밖에 있고, `TaskProgressService`가 문자열로 넣는다.

남기지 않는 명령: 로그인과 로그아웃, 초대 생성·재발송·취소·미리보기·수락, 업무 생성·수정·삭제. 업무 수정으로 `CANCELLED`가 되거나 담당이 바뀌어도 감사 로그는 없다. 담당이 비워지며 로그가 남는 경우는 운영자 제거뿐이다.

### `operator_notices`

공간 소유자가 활성화, 종료, 다시 열기를 대신해서 `actedAs`가 `SPACE_OWNER_OVERRIDE`일 때만 행이 생긴다. `kind`는 `LIFECYCLE_OVERRIDE`다. 받는 사람은 그 행사의 `OWNER` 중 인수인계로 권한이 끝나지 않은 사람이다. 보관과 보관 해제는 공간 소유자의 자신의 권한이라 이 행을 만들지 않는다. 읽는 URL은 없다.

## 아직 없는 경로

다음을 이 서버에서 호출하면 제품 동작이 없다.

- `/api/v1/participant/**`, `/api/v1/public/**`의 신청, 조회, 로그인
- 비밀번호 로그인
- SMTP. 초대 링크는 프로세스 메모리에만 남는다
- 행사 생성·수정, 공간 설정
- 체크 항목 추가
- 참가자, 신청, 회비, 조, 방, 차량, 체크인
- 공간 탈퇴, 소유권 이전의 전용 URL

`Permission` enum에 키가 있는 것은 그 업무의 API가 열렸다는 뜻이 아니다.
