# API

지금 서버가 받는 operator, public, participant HTTP 계약이다. 설계 초안은 저장소 루트의 [API Architecture](../../docs/architecture/api-architecture-v0.1.md)에 있고, 파일을 찾는 순서는 [소스 안내](source-guide.md)에 있다. 이 문서와 코드가 다르면 코드를 따른다.

관련 이슈: [#89](https://github.com/BeomhyunPark/SCENE/issues/89), [#93](https://github.com/BeomhyunPark/SCENE/issues/93), [#97](https://github.com/BeomhyunPark/SCENE/issues/97), [#99](https://github.com/BeomhyunPark/SCENE/issues/99), [#103](https://github.com/BeomhyunPark/SCENE/issues/103), [#176](https://github.com/BeomhyunPark/SCENE/issues/176).

operator 경로는 운영자 세션이 필요하다. public 경로는 세션을 만들지 않는다. participant 경로는 참가자 세션 쿠키가 필요하다. 로그인 없는 공개 온보딩과 비밀번호 로그인은 없다.

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

`Idempotency-Key`는 읽지 않는다. 예외는 [체크인](#체크인)의 체크인·취소다(#282).

### CSRF

변경 요청은 쿠키 `XSRF-TOKEN`과 헤더 `X-XSRF-TOKEN`에 같은 문자열을 넣는다. 토큰을 발급하는 주소는 없다. 클라이언트가 정한 값이면 된다. 두 값이 없거나 다르면 `403 FORBIDDEN`이다. 로그인도 이 검사를 받는다. 조회 `GET`은 CSRF가 필요 없다.

쿠키는 `HttpOnly`가 아니고 `Secure`이며 경로는 `/`다. 자바스크립트가 읽을 수 있다.

### 세션 쿠키

로그인 성공의 `Set-Cookie` 이름은 `SCENE_SESSION`이다. 값은 Spring Session의 세션 id이고, Base64가 아니다. `HttpOnly`, `Secure`, 경로 `/`, `SameSite=Lax`다. 참가자 쿠키 이름은 `SCENE_PSESSION`이고 경로는 `/api/v1/participant`다. 이름은 `application.yml`의 `scene.security.session`에 있다. 로그인 성공 시 서버는 `changeSessionId()`로 세션 id를 바꾼다. 운영자 세션은 마지막 요청 뒤 60분 동안 요청이 없으면 만료된다(`spring.session.timeout: 60m`, DEC-067 Follow-up 2026-11-02). 참가자 세션 TTL은 아직 결정이 아니다.

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

예상하지 못한 예외는 `500`이다. `code`는 없고 `type`은 `urn:scene:problem:unexpected`다. 예외 메시지는 본문에 넣지 않는다. 핸들러가 없는 경로는 `404`이고 `code`는 없다. 개발용 로그인이 없는 profile의 `POST /api/v1/operator/auth/login`이 이 경우다.

스프링이 요청 모양 때문에 거절한 4xx도 `code`가 없다. `title`은 HTTP 상태 문구이고 `detail`은 아래 고정 문장이다. 스프링 예외 문장은 본문에 넣지 않는다. `traceId`는 있다. 서버 오류가 아니므로 오류 로그를 남기지 않는다.

| 상태 | 경우 | `detail` |
| --- | --- | --- |
| 405 | 경로는 있지만 그 메서드를 받지 않는다. `Allow` 헤더에 받는 메서드가 있다 | 이 경로에서 허용하지 않는 메서드입니다. |
| 415 | 본문의 `Content-Type`을 읽지 못한다 | 지원하지 않는 Content-Type입니다. |
| 406 | `Accept`에 맞는 형식으로 응답하지 못한다 | 요청한 Accept 형식으로 응답할 수 없습니다. |

스프링이 상태를 정한 그 밖의 4xx도 그 상태 그대로이고 `detail`은 `요청을 처리할 수 없습니다.`다. 위에서 `400 VALIDATION_FAILED`로 적은 검증 오류와 `404`는 그대로다.

등록된 코드의 상태와 문장은 `common/error/ErrorCode.java`가 정본이다. 아래 표는 이 문서의 API가 돌려주는 코드다.

| code | 상태 | 언제 |
| --- | --- | --- |
| `AUTHENTICATION_REQUIRED` | 401 | 세션이 없거나, 로그인 id가 `users`에 없다 |
| `FORBIDDEN` | 403 | 대상은 보이는데 그 작업 권한이 없다. CSRF 불일치는 이 코드로 나간다 |
| `NOT_A_MEMBER` | 403 | 멤버십이 끝났거나 행사 접근이 제거되었다 |
| `OVERRIDE_REQUIRED` | 403 | 공간 소유자가 대신 실행하는데 `override.reason`이 없다 |
| `EMAIL_NOT_VERIFIED` | 403 | 세션에 검증된 이메일이 없다 |
| `INVITATION_EMAIL_MISMATCH` | 403 | 검증된 세션 이메일과 초대 이메일이 다르다 |
| `VALIDATION_FAILED` | 400 | 본문, 쿼리, 경로 형식이 계약과 다르다 |
| `APPLICATION_VALIDATION_FAILED` | 400 | 공개 신청 답변이 계약과 다르다 |
| `FIELD_LOCKED` | 409 | 신청이 들어온 신청서에서 질문 유형·보기 제거·표시 조건·질문 삭제를 막는다 (DEC-068) |
| `PARTICIPANT_ACCESS_INVALID` | 401 | 참가자 접근 키가 없거나, 틀리거나, 그 행사 것과 같지 않다 |
| `PAGE_SIZE_EXCEEDED` | 400 | `size`가 100을 넘는다 |
| `RESOURCE_NOT_FOUND` | 404 | 행사가 없거나, 테넌트 밖에 있거나, 그 사람에게 존재를 보여 주지 않는다 |
| `FORM_NOT_FOUND` | 404 | 그 행사의 신청서가 아니다 |
| `FORM_CLOSED` | 409 | 신청을 받지 않는 신청서다 |
| `CONFLICT` | 409 | 행사에 신청서가 이미 있거나, SYSTEM 필드를 지울 수 없다 |
| `INVITATION_NOT_FOUND` | 404 | 토큰에 해당하는 초대가 없다 |
| `INVITATION_REVOKED` | 410 | 초대가 취소되었다 |
| `INVITATION_EXPIRED` | 410 | 초대 시각이 지났다 |
| `INVITATION_SUPERSEDED` | 410 | 다시 보낸 초대로 이전 토큰은 쓸 수 없다 |
| `CONCURRENT_MODIFICATION` | 409 | `expectedLifecycleVersion`·`expectedVersion`이 현재와 다르거나, 조 배정의 `fromGroupId`가 지금 조와 다르다 |
| `INVALID_STATE_TRANSITION` | 409 | 현재 행사 상태에서 그 전이를 할 수 없다 |
| `CONFIRMATION_REQUIRED` | 409 | 종료나 보관 전, 미배정자가 있는 조 공개 전에 경고 확인이 필요하다 |
| `EVENT_ARCHIVED` | 409 | 보관된 행사에서는 그 변경을 할 수 없다 |
| `INVITATION_ALREADY_ACCEPTED` | 409 | 다른 사용자가 이미 초대를 수락했다 |
| `TASK_VERSION_CONFLICT` | 409 | 완료·다시 열기에서 `version`이 현재와 다르다 |
| `INVALID_TASK_STATE` | 409 | 업무 상태 때문에 체크, 완료, 다시 열기를 할 수 없다 |
| `PERMISSION_OWNER_NOT_OVERRIDABLE` | 422 | 소유자의 권한은 개별 설정할 수 없다 |
| `PERMISSION_OWNER_ONLY` | 422 | `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`는 소유자만 가진다 |
| `PERMISSION_NOT_OVERRIDABLE` | 422 | `EVENT_READ`는 개별 설정으로 뺄 수 없다 |
| `RATE_LIMITED` | 429 | 초대 미리보기·수락이 한도를 넘었다 |
| `HANDOVER_NOT_ACCEPTED` | 409 | 수락되지 않은 인수인계가 있어 공간 탈퇴가 막힌다 |
| `LAST_OWNER` | 409 | 마지막 소유자라 공간 탈퇴가 막힌다 |
| `OWNER_ROLE_HELD` | 409 | 소유 역할을 가진 채 공간 탈퇴가 막힌다 |
| `RESPONSIBILITY` | 409 | 열린 담당 업무가 있어 공간 탈퇴가 막힌다 |
| `TRANSFER_NOT_PENDING` | 409 | 그 이전을 이 명령으로 진행할 수 없거나, 같은 보내는 사람의 `PENDING`이 이미 있다 |
| `TRANSFER_COMPLETED` | 409 | 끝난 소유권 이전은 바꿀 수 없다 |

공간 소유권 이전은 전용 URL이 없다.

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
  -H 'Cookie: SCENE_SESSION=여기에-Set-Cookie-값' \
  http://localhost:8080/api/v1/operator/me
```

로그인 `200`은 `userId`와 `displayName`이다. `email`은 응답에 없고, `local`·`test`에서만 검증된 세션 이메일이 된다. 초대를 수락할 때 그 값과 초대 이메일을 비교하므로, 시드 초대 `local-invite@example.com`을 보려면 로그인 본문에 그 이메일을 넣는다. 시드 행의 id `…0030`은 토큰이 아니다. 미리보기와 수락은 그 id로 호출하지 않는다.

같은 호출 순서는 `src/test/java/app/scene/event/ServerContractRegressionIT.java`의 `login`이 서버에 대해 검증한 방식이다. 이 문서의 예시는 그 테스트를 로컬 서버에 옮겨 적은 것이고, 이 작성에서 서버를 띄워 다시 호출하지는 않았다.

## 준비 확인

`GET /actuator/health`

세 필터 체인 밖이다. 세션과 CSRF가 필요 없다. 정상이면 `{"status":"UP"}`다.

## 세션

### `POST /api/v1/operator/auth/login`

`local`과 `test` profile에서만 있다. 다른 profile에서는 핸들러가 없어 `404`다. 켜는 환경 변수나 property는 없다. 세션 없이 호출한다. CSRF는 필요하다. 개발용 로그인이다([DEC-067](../../docs/product/PRODUCT_DECISIONS.md)).

```json
{ "userId": "00000000-0000-4000-8000-000000000001", "email": "Local@Example.com" }
```

| 필드 | 규칙 |
| --- | --- |
| `userId` | 필수. `users.id`. 비밀번호가 아니다 |
| `email` | 생략 가능. 앞뒤 공백을 자르고 소문자로 검증된 세션 이메일에만 둔다. 응답에는 없다. 이 값을 넣는 코드는 `DevLoginController`뿐이다. `users`에 이메일 컬럼은 없다 |

`200` 본문은 `{ "userId", "displayName" }`다. `Set-Cookie` 이름은 `SCENE_SESSION`이다. 성공 전후의 세션 id는 다르다. 없는 id는 `401 AUTHENTICATION_REQUIRED`이고 세션을 만들지 않는다. `userId`가 없으면 `400 VALIDATION_FAILED`다.

### `GET /api/v1/operator/me`

세션의 사용자. `200` 본문은 로그인과 같다. 역할은 여기 없다.

### `POST /api/v1/operator/auth/logout`

세션을 버린다. `204`이고 본문이 없다. 세션이 없어도 `204`다.

## 공간과 행사

### `GET /api/v1/operator/spaces`

로그인한 운영자의 활성 멤버십이다. `members.status`가 `ACTIVE`인 행만 `spaces`와 조인한다. `LEFT`는 빠진다. 순서는 공간 이름, 그다음 `spaceId`다. `sort` 허용 필드는 없다. `sort`를 주면 `400 VALIDATION_FAILED`이고 필드는 `sort`다. 세션이 없으면 `401 AUTHENTICATION_REQUIRED`다. 공간이 없으면 `200`이고 `items`는 `[]`다.

`200`

```json
{
  "items": [{ "spaceId": "…", "name": "Local space", "role": "OWNER" }],
  "page": { "number": 0, "size": 50, "totalItems": 1, "totalPages": 1 }
}
```

`role`은 그 공간에서 호출자의 역할이다. `OWNER`, `ADMIN`, `MEMBER` 중 하나다.

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

### `POST /api/v1/operator/spaces/{spaceId}/events`

활성 공간 멤버가 행사를 만든다. 만든 사람은 그 행사의 `OWNER`가 된다. `EVENT_CREATE` 권한 키는 없다. `Idempotency-Key`는 읽지 않는다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`다. 멤버십이 `ACTIVE`가 아니면 `403 NOT_A_MEMBER`다.

```json
{
  "name": "2026 가을 수련회",
  "startDate": "2026-11-06",
  "endDate": "2026-11-08",
  "place": "양평 수양관",
  "eventType": "RETREAT"
}
```

| 필드 | 규칙 |
| --- | --- |
| `name` | 필수. 앞뒤 공백을 자르고 1–200자 |
| `startDate`, `endDate` | 생략하거나 `null`, 또는 `YYYY-MM-DD`. 형식이 틀리면 `400`이고 필드는 그 키다. 둘 다 있을 때 끝 날이 시작 날보다 앞이면 필드는 `endDate`다. 하나만 있어도 된다. 시각이 아니다 |
| `place` | 생략하거나 `null`, 또는 문자열. 앞뒤 공백을 자른 뒤 빈 값은 `null`이다. 200자를 넘으면 필드는 `place`다 |
| `eventType` | 생략하거나 `null`, 또는 아래 8개 코드. 대소문자가 다르거나, 빈 문자열, 한국어 라벨, 숫자는 필드는 `eventType`이다 |
| 그 밖의 키 | `400`이고 필드는 그 키다. `lifecycleStatus`도 그렇다 |

`eventType`은 선택이다. 없는 값은 `null`이다. 서버는 이 값으로 권한, 검증, 상태 전이를 바꾸지 않는다(DEC-003). 화면 라벨은 클라이언트가 매핑한다.

| 코드 | 화면 라벨 |
| --- | --- |
| `RETREAT` | 수련회 |
| `VISION_TRIP` | 비전트립 |
| `OUTREACH` | 아웃리치 |
| `SHORT_TERM_MISSION` | 단기선교 |
| `BIBLE_SCHOOL` | 성경학교 |
| `CAMP` | 캠프 |
| `WORKSHOP` | 워크숍 |
| `OTHER` | 기타 |

`201`. `Location` 헤더는 없다.

```json
{
  "eventId": "…",
  "name": "2026 가을 수련회",
  "lifecycleStatus": "DRAFT",
  "lifecycleVersion": 0,
  "startDate": "2026-11-06",
  "endDate": "2026-11-08",
  "place": "양평 수양관",
  "eventType": "RETREAT"
}
```

없는 기간·장소·유형은 `null`이다. 감사 로그와 권한 override는 만들지 않는다.

### `GET /api/v1/operator/spaces/{spaceId}/events`

그 공간의 행사 목록이다. 활성 멤버만 연다. 공간 `OWNER`와 `ADMIN`은 공간의 행사를 모두 본다. 그 외는 자신이 `event_users`에 있는 행사만 본다. `sort` 허용 필드는 없다. 순서는 이름, 그다음 `eventId`다.

항목은 `{ "eventId", "name", "lifecycleStatus", "startDate", "endDate", "place", "eventType" }`다. `lifecycleVersion`은 없다.

### `GET /api/v1/operator/events/{eventId}`

행사 상세다. 읽기는 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다. 공간 소유자·관리자는 이 읽기 때문에 `event_users` 행이 생기지 않는다.

`200` 필드는 만들기 응답과 같다. 행사가 없으면 `404 RESOURCE_NOT_FOUND`다. 접근이 제거되었거나 공간 멤버십이 끝났으면 `403 NOT_A_MEMBER`다. 보여 주지만 읽기 권한이 없으면 `403 FORBIDDEN`이다.

### `PATCH /api/v1/operator/events/{eventId}`

이름만 바꾼다. 유효한 `EVENT_UPDATE`가 필요하다. 공간 `OWNER`라는 이유만으로는 바꾸지 못한다.

```json
{ "name": "바뀐 이름" }
```

`name` 규칙은 만들기와 같다. `place`, `eventType`, `startDate`, `endDate`, `lifecycleStatus`를 포함한 다른 키는 `400`이고 필드는 그 키다. 성공 `200`은 상세와 같다. 기간, 장소, 유형, `lifecycleStatus`, `lifecycleVersion`은 그대로다. 감사 로그는 없다.

## 공간 탈퇴

활성 공간 멤버가 그 공간에서 나간다. 컨트롤러는 `space/OperatorLeaveController`다. 막는 순서와 유지·제거는 `MembershipLeaveService`가 한다. 행사만 나가는 URL은 없다.

호출자는 로그인한 본인이다. 경로에 대상 사용자 id는 없다. 멤버 행이 없으면 두 경로 모두 `404 RESOURCE_NOT_FOUND`다. 멤버십이 `ACTIVE`가 아니면 `403 NOT_A_MEMBER`다.

막는 조건은 하나다. 아래 순서에서 먼저 걸리는 코드만 돌려준다. 막히면 멤버십, 운영자 행, 담당, 인수인계, 감사 로그는 그대로다.

1. 그 사람이 보낸 `PENDING` 인수인계가 있으면 `409 HANDOVER_NOT_ACCEPTED`
2. 인수인계가 수락되지 않았고, 그 행사에 권한이 끝나지 않은 다른 소유자가 없으면 `409 LAST_OWNER`
3. 공간의 활성 소유자가 그 사람뿐이면 `409 LAST_OWNER`
4. 인수인계가 수락되지 않은 소유 행사가 있으면 `409 OWNER_ROLE_HELD`
5. 그 사람이 담당인 `TODO` 또는 `DOING` 업무가 있으면 `409 RESPONSIBILITY`

이 판단은 `keepEventIds`보다 먼저다. 열린 업무가 있는 행사를 유지 목록에 넣어도 `RESPONSIBILITY`다. `DONE`과 `CANCELLED`는 열린 업무가 아니다. 보관된 행사는 `EVENT_ARCHIVED`로 탈퇴를 막지 않는다. 미리보기와 탈퇴는 호출 시점마다 이 순서를 다시 계산한다.

### `GET /api/v1/operator/spaces/{spaceId}/me/leave-preview`

본문이 없다. 행을 바꾸지 않는다.

`200`

```json
{
  "leaveBlocked": true,
  "blockReason": "OWNER_ROLE_HELD",
  "events": [
    {
      "eventId": "…",
      "isOwner": true,
      "handoverAccepted": false,
      "openTasks": 0
    }
  ]
}
```

`leaveBlocked`가 false이면 `blockReason`은 `null`이다. `blockReason`은 위 코드 이름 하나다. `events`는 그 공간에서 호출자가 운영자인 행사만 담는다. `isOwner`는 역할이 `OWNER`인지다. `handoverAccepted`는 그 사람이 그 행사에서 보낸 인수인계가 `HANDOVER`인지다. `openTasks`는 그 사람 담당의 `TODO`와 `DOING` 수다. 행사 이름, 일정, 상태, 표시 그룹은 없다.

### `POST /api/v1/operator/spaces/{spaceId}/me/leave`

```json
{ "keepEventIds": ["…"] }
```

`keepEventIds`는 그 공간에서 자신이 운영하는 행사 id의 배열이다. 빈 배열은 운영 행사를 모두 끊는다. 이 배열에 없는 운영 행사는 끊긴다. 여기 넣은 행사는 운영자 행과 권한 override가 남는다.

막는 조건이 있으면, `keepEventIds`가 없거나 배열이 아니거나 항목이 UUID 문자열이 아니어도 그 `409`다. `errors`는 없다. 막는 조건이 없을 때 아래는 `400 VALIDATION_FAILED`이고 `errors[0].field`는 `keepEventIds`다.

- 본문이 없거나, 객체가 아니거나, `keepEventIds`가 없다
- `keepEventIds`가 배열이 아니거나, 항목이 UUID 문자열이 아니다
- 목록에 자신이 운영하지 않는 행사가 있다
- 목록에 자신의 소유 행사가 있거나, `handoverAccepted`가 true인 행사가 있다

성공은 본문이 없는 `200`이다.

- `members.status`는 `LEFT`가 된다. 이후 공간 조회와 탈퇴 미리보기는 `403 NOT_A_MEMBER`다. 남긴 행사가 있어도 공간 조회는 열리지 않는다.
- 남긴 행사의 `GET /spaces/{spaceId}/events/{eventId}`는 열린다. 그 행사에는 감사 로그가 없다.
- 끊긴 행사는 운영자 행과 권한 override가 지워진다. 그 사람 담당 업무는 `DONE`과 `CANCELLED`를 포함해 담당이 비워지고 `version`이 1 증가한다. 이후 그 행사 조회는 `403 NOT_A_MEMBER`다.
- `handoverAccepted`인 행사를 끊으면 그 인수인계 status는 `COMPLETED`가 된다.
- 운영 행사가 없으면 멤버십만 `LEFT`가 된다.

끊길 때 남는 감사 로그는 [기록 절](#응답에-안-나오는-기록)에 있다. 탈퇴 자체를 가리키는 `action`은 없다. `HANDOVER`로 만드는 수락은 [소유권 이전](#소유권-이전)이다.

## 소유권 이전

행사 소유권을 넘기는 요청이다. 컨트롤러는 `event/transfer/OwnerTransferController`다. 행을 바꾸는 규칙은 `OwnerTransferService`다. `scope`는 `EVENT`다. 공간 소유권 이전 URL은 없다. 목록 URL도 없다.

상태 값은 `PENDING`, `HANDOVER`, `DECLINED`, `CANCELLED`, `COMPLETED`다. 이 경로가 `COMPLETED`로 바꾸지는 않는다. 보내는 사람이 그 행사를 유지하지 않고 [공간을 탈퇴](#공간-탈퇴)하면 `COMPLETED`가 된다. `handoverEndsAt`이 지났다는 이유만으로 `COMPLETED`가 되지 않는다. 보관된 행사도 `EVENT_ARCHIVED`로 막지 않는다.

응답에 이메일, 토큰, 세션, `requestedAt`은 없다. `acceptedAt`과 `handoverEndsAt`은 값이 있을 때만 있다. `from`과 `to`는 `{ "userId", "displayName" }`다.

### `POST /api/v1/operator/events/{eventId}/owner-transfers`

행사 `OWNER`만 만든다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`다. 행사 운영자가 아닌데 멤버십이 끝났거나, 접근이 제거된 운영자면 `403 NOT_A_MEMBER`다. 행사 `OWNER`가 아니면, 권한이 끝난 소유자와 공간 `OWNER`를 포함해, `403 FORBIDDEN`이다. 그 다음에 `toUserId`를 본다.

```json
{ "toUserId": "…" }
```

`toUserId`는 그 공간의 활성 멤버다. 행사 운영자일 필요는 없다. 빠지거나 UUID 문자열이 아니면 `400 VALIDATION_FAILED`이고 `errors[0].field`는 `toUserId`다. 멤버가 아니거나 멤버십이 `ACTIVE`가 아니면 같은 400이고 행은 생기지 않는다.

`201`. `Location` 헤더는 없다.

```json
{
  "transferId": "…",
  "scope": "EVENT",
  "spaceId": "…",
  "spaceName": "Local space",
  "eventId": "…",
  "eventName": "Local event",
  "from": { "userId": "…", "displayName": "Local owner" },
  "to": { "userId": "…", "displayName": "Local staff" },
  "status": "PENDING",
  "outcome": "REQUESTED"
}
```

받는 사람의 역할과 권한 override는 그대로다. 감사 로그는 없다. 같은 보내는 사람이 그 행사에 `PENDING`을 하나 더 만들면 `409 TRANSFER_NOT_PENDING`이다. 다른 소유자의 `PENDING`은 따로 있을 수 있다.

### `GET /api/v1/operator/owner-transfers/{transferId}`

보내는 사람, 받는 사람, 그 행사의 `OWNER`가 본다. 그 외와 없는 id는 `404 RESOURCE_NOT_FOUND`다.

`200` 필드는 생성과 같다. `outcome`은 없다.

### `POST /api/v1/operator/owner-transfers/{transferId}/accept`

본문이 없다. 받는 사람만 호출한다. 보내는 사람을 포함한 그 외는 `404 RESOURCE_NOT_FOUND`다.

`PENDING`이면 `200`이고 `outcome`은 `ACCEPTED`, `status`는 `HANDOVER`다. `acceptedAt`은 수락 시각이고 `handoverEndsAt`은 그 시각에서 14일 뒤다. 받는 사람은 `OWNER`가 된다. 수락 전 역할은 그 이전 행에 남고, 권한 override는 지워진 뒤 스냅샷으로 남는다. 운영자 행이 없던 받는 사람은 `OWNER` 행이 생긴다. 보내는 사람의 역할 행은 이 경로가 바꾸지 않는다. 이 수락만으로 보내는 사람의 소유 권한이 바로 끝나지는 않는다. 권한이 끝나는 조건은 [소스 안내의 권한 절](source-guide.md#접근과-권한)과 같다.

같은 받는 사람이 `HANDOVER`를 다시 수락하면 `200`이고 `outcome`은 `ALREADY_ACCEPTED`다. `handoverEndsAt`은 처음 값이다.

`DECLINED`와 `CANCELLED`는 `409 TRANSFER_NOT_PENDING`이다. `COMPLETED`는 `409 TRANSFER_COMPLETED`다. 받는 사람의 멤버십이 `ACTIVE`가 아니면, `PENDING` 수락은 `403 NOT_A_MEMBER`다.

### `POST /api/v1/operator/owner-transfers/{transferId}/reject`

본문이 없다. 받는 사람만 호출한다. 그 외는 `404 RESOURCE_NOT_FOUND`다.

`PENDING`이면 `200`이고 `status`와 `outcome`은 `DECLINED`다. 역할은 바꾸지 않는다. `HANDOVER`, `DECLINED`, `CANCELLED`는 `409 TRANSFER_NOT_PENDING`이다. `COMPLETED`는 `409 TRANSFER_COMPLETED`다.

### `POST /api/v1/operator/owner-transfers/{transferId}/cancel`

본문이 없다.

`PENDING`은 보내는 사람만 취소한다. `200`의 `status`와 `outcome`은 `CANCELLED`다. 받는 사람은 `403 FORBIDDEN`이다. 당사자가 아닌 사람은 `404 RESOURCE_NOT_FOUND`다.

`HANDOVER`는 보내는 사람 또는 받는 사람이 취소한다. `200`의 `status`와 `outcome`은 `CANCELLED`다. 받는 사람의 역할과 권한 override는 수락 전으로 돌아간다. 수락이 만든 `OWNER` 행이고 이전 역할이 없으면 그 행은 지워진다. 업무의 상태, `version`, 담당은 그대로다. `handoverEndsAt`이 지난 `HANDOVER`도 이 취소가 된다.

`DECLINED`와 `CANCELLED`는 `409 TRANSFER_NOT_PENDING`이다. `COMPLETED`는 `409 TRANSFER_COMPLETED`다.

요청, 거절, 취소와 `ALREADY_ACCEPTED`는 감사 로그를 쓰지 않는다. 처음 수락만 [기록 절](#응답에-안-나오는-기록)의 `OWNER_TRANSFER_ACCEPTED`를 남긴다.

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

### `POST /api/v1/operator/events/{eventId}/activate`

`DRAFT`를 `ACTIVE`로 옮긴다. 권한, 본문, `200`, 오류는 [상태 변경](#상태-변경)과 같다. 이미 `ACTIVE`이면 `outcome`은 `ALREADY_IN_STATE`다.

### `POST /api/v1/operator/events/{eventId}/end`

`ACTIVE`를 `ENDED`로 옮긴다. 열린 업무가 있으면 `acknowledgeWarnings`가 `true`여야 한다. 나머지 계약은 [상태 변경](#상태-변경)과 같다.

### `POST /api/v1/operator/events/{eventId}/reopen`

`ENDED`를 `ACTIVE`로 옮긴다. `reason`이 필수다. 나머지 계약은 [상태 변경](#상태-변경)과 같다.

### `POST /api/v1/operator/events/{eventId}/archive`

`ENDED`를 `ARCHIVED`로 옮긴다. 그 행사의 `PENDING` 초대를 `REVOKED`로 바꾼다. 열린 업무가 있으면 `acknowledgeWarnings`가 `true`여야 한다. 나머지 계약은 [상태 변경](#상태-변경)과 같다.

### `POST /api/v1/operator/events/{eventId}/unarchive`

`ARCHIVED`를 `ENDED`로 옮긴다. 나머지 계약은 [상태 변경](#상태-변경)과 같다.

## 초대

초대 변경은 행사 `OWNER`만 한다. `EVENT_USER_MANAGE`다. 클래스는 `event/invitation/EventInvitationController`다. 보관된 행사에서는 만들거나 다시 보내지 못한다.

서버는 토큰 해시만 저장한다. 링크 모양은 `/operator/invitations#` 뒤에 토큰이다. SMTP 구현은 없다. 그래서 생성과 다시 보내기의 `200` 본문이 이 링크를 `link`로 **한 번만** 준다(DEC-060 Follow-up 2026-11-16). OWNER가 복사해 전달한다. 같은 링크는 다시 읽을 수 없다. 잃어버리면 다시 보낸다. 링크는 DB·audit·로그에 남지 않는다. 메일 포트(`CapturingInvitationMailer`가 프로세스 메모리에 담는다)도 그대로 부른다. 목록과 취소 본문에는 토큰이 없다. 유효 시간은 7일이다.

같은 행사·이메일의 기존 `PENDING`은 새 초대를 만들 때 `SUPERSEDED`가 된다.

### `GET /api/v1/operator/events/{eventId}/invitations`

대기(`PENDING`) 초대 목록이다. 권한은 초대 변경과 같다. 행사 `OWNER`가 아니면 `403 FORBIDDEN`이다. 보관된 행사에서도 읽는다(보관할 때 대기 초대는 `REVOKED`가 되므로 보통 비어 있다).

`page`는 0부터, `size`는 기본 50, 최대 100이다. `sort`는 받지 않는다. 순서는 만든 시각 최신 순, 그다음 id다. 만료가 지난 `PENDING`도 나온다. 화면이 `expiresAt`으로 만료를 표시한다.

항목은 `{ "id", "email", "role", "status", "expiresAt" }`다. `email`은 소문자로 정규화한 초대 이메일이다. 토큰, 해시, 링크는 없다.

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
  "expiresAt": "2026-10-14T00:00:00Z",
  "link": "/operator/invitations#…"
}
```

`link`는 상대 경로다. 화면이 자기 origin을 붙여 보여 준다. 이메일은 본문에 없다. 보관된 행사는 `409 EVENT_ARCHIVED`다.

### `POST /api/v1/operator/events/{eventId}/invitations/{invitationId}/resend`

본문이 없다. 그 `PENDING` 초대를 `SUPERSEDED`로 두고 같은 이메일·역할로 새 `PENDING`을 만든다. `200` 본문은 생성과 같다. 새 id와 새 `link`다. 이전 링크는 `410 INVITATION_SUPERSEDED`가 된다.

초대가 그 행사에 없으면 `404 RESOURCE_NOT_FOUND`다. `PENDING`이 아니면 `400 VALIDATION_FAILED`이고 필드는 `invitationId`다.

### `DELETE /api/v1/operator/events/{eventId}/invitations/{invitationId}`

`PENDING`을 `REVOKED`로 바꾼다. `200` 본문은 `{ "id", "role", "status", "expiresAt" }`이고 `link`가 없다. 이미 `REVOKED`이면 같은 본문으로 `200`이다. `ACCEPTED`나 `SUPERSEDED`는 `400 VALIDATION_FAILED`다. 본문 없는 204가 아니다.

### `POST /api/v1/operator/invitations/preview`

### `POST /api/v1/operator/invitations/accept`

로그인한 운영자가 호출한다. 본문은 `{ "token": "…" }`다. 비교하는 이메일은 본문이 아니라 세션의 검증된 `email`이다. 개발용 로그인이 그 값을 넣는다. 세션에 이메일이 없으면 `403 EMAIL_NOT_VERIFIED`다.

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

토큰이 없으면 `404 INVITATION_NOT_FOUND`다. 이 코드는 초대가 있는지 알려 주지 않는다. 세션에 검증된 이메일이 없으면 `403 EMAIL_NOT_VERIFIED`다. 있고 다르면 `403 INVITATION_EMAIL_MISMATCH`다. 다른 사람이 이미 수락했으면 `409 INVITATION_ALREADY_ACCEPTED`다. 취소는 `410 INVITATION_REVOKED`, 만료는 `410 INVITATION_EXPIRED`, 다시 보낸 이전 토큰은 `410 INVITATION_SUPERSEDED`다. 행사가 보관되었으면 `409 EVENT_ARCHIVED`다.

## 운영자

목록과 한 명 조회는 행사 `EVENT_READ` 또는 활성 공간 `OWNER`다. 추가, 역할 변경, 제거, 권한 교체는 행사 `OWNER`의 `EVENT_USER_MANAGE`다. 공간 역할만으로는 운영자를 바꾸지 못한다. 공간 `OWNER`는 권한 행을 읽을 수 있고, 공간 `ADMIN`은 읽지 못한다.

역할은 `OWNER`, `MANAGER`, `STAFF`다. 기본 권한은 [소스 안내의 권한 표](source-guide.md#접근과-권한)와 같다. 컨트롤러는 `event/operator/EventOperatorController`다.

등록된 권한 키는 이 이름뿐이다. 여기 없는 문자열은 `UNKNOWN_PERMISSION`이다.

`EVENT_UPDATE`, `EVENT_USER_READ`, `PARTICIPANT_READ`, `PARTICIPANT_CONTACT_READ`, `PARTICIPANT_WRITE`, `FORM_WRITE`, `APPLICATION_READ`, `APPLICATION_MANAGE`, `TASK_WRITE`, `SCHEDULE_WRITE`, `NOTICE_WRITE`, `FINANCE_READ`, `FINANCE_WRITE`, `GROUP_WRITE`, `ROOM_WRITE`, `RIDE_WRITE`, `CLASS_WRITE`, `CHECKIN_WRITE`, `MISSION_WRITE`, `GUARDIAN_WRITE`, `GUARDIAN_CONTACT_READ`, `PRIVACY_LOG_READ`, `AUDIT_LOG_READ`, `DATA_EXPORT`, `EVENT_READ`, `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`.

`OWNER`는 이 키를 모두 기본으로 가진다. `MANAGER`의 기본은 `EVENT_READ`, `TASK_WRITE`, `CHECKIN_WRITE`다. `STAFF`의 기본은 `EVENT_READ`, `CHECKIN_WRITE`다(DEC-071). 키가 있다고 그 업무의 API가 열려 있는 것은 아니다. 지금 HTTP가 `PermissionEvaluator`로 보는 키는 `EVENT_READ`, `EVENT_UPDATE`, `FORM_WRITE`, `TASK_WRITE`, `CHECKIN_WRITE`, `DATA_EXPORT`, `EVENT_USER_MANAGE`다. 신청자 CSV는 `DATA_EXPORT`다. 행사 이름 변경은 `EVENT_UPDATE`다. 신청서 쓰기는 `FORM_WRITE`다. 신청 읽기는 `APPLICATION_READ`가 아니라 `EVENT_READ`다. 행사 상태 변경은 그 키 대신 행사 역할 `OWNER`와 공간 역할 `OWNER`를 본다. `EVENT_LIFECYCLE`은 소유자 전용이라 다른 역할에 `GRANT`되지 않는다.

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
  "roleDefaults": ["CHECKIN_WRITE", "EVENT_READ", "TASK_WRITE"],
  "overrides": { "grants": [], "revokes": [] },
  "effective": ["CHECKIN_WRITE", "EVENT_READ", "TASK_WRITE"]
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

## Google 로그인

[DEC-069](../../docs/product/PRODUCT_DECISIONS.md). 브라우저가 페이지째 이동하는 경로라 JSON API가 아니다. 컨트롤러 대신 `identity/GoogleLoginSecurity`의 보안 체인이 처리한다. 운영자 세션 저장소(`SCENE_SESSION`)를 함께 쓴다.

- `GET /oauth2/authorization/google`: Google 동의 화면으로 `302` 이동한다. 범위는 `openid email profile`이다. `state`는 세션에 둔다.
- `GET /login/oauth2/code/google`: Google이 돌려보내는 주소다. 성공하면 세션 id를 바꾸고 `OperatorPrincipal`을 세션에 넣은 뒤 `302 /login/done`이다. 화면이 로그인 전 페이지(`next`)로 이어 간다.
  - Google 이메일이 확인되지 않았으면 `302 /login?error=google_unverified`다.
  - 그 밖의 실패(취소, state 불일치 등)는 `302 /login?error=google`이다. Google의 오류 내용은 화면과 로그에 남기지 않는다.
- 처음 로그인한 Google 계정(OIDC `sub`)은 새 사용자가 된다. 이름은 Google 이름이고, 없으면 이메일 `@` 앞부분이다. 이후 로그인은 같은 사용자이고 확인된 이메일만 갱신한다.
- 확인된 이메일은 세션의 초대 확인용 이메일이 된다(DEC-067 `EMAIL_NOT_VERIFIED`). `/me`에는 나오지 않는다.
- Google의 access·refresh token은 저장하지 않는다.
- 첫 관리자: `scene.bootstrap.owner-email`(`SCENE_BOOTSTRAP_OWNER_EMAIL`)과 같은 이메일이 로그인할 때 조직(`spaces`)이 하나도 없으면, `scene.bootstrap.space-name` 조직을 만들고 OWNER로 넣는다. 동시에 로그인해도 한 번만 만든다(advisory lock).
- 설정: `SCENE_GOOGLE_CLIENT_ID`, `SCENE_GOOGLE_CLIENT_SECRET`. 승인된 리디렉션 URI는 `https://<host>/login/oauth2/code/google`이다.

## 신청서

컨트롤러는 `event/form/OperatorFormController`다. 행사당 신청서는 하나다. 읽기는 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다. 쓰기는 유효한 `FORM_WRITE`다. 공간 역할만으로는 쓰지 못한다. `sort` 허용 필드는 없다. `Idempotency-Key`는 읽지 않는다. 감사 로그는 없다.

필드 `kind`는 `SYSTEM` 또는 `CUSTOM`이다. `systemKey`는 `NAME`, `PHONE`, `COHORT`, 또는 CUSTOM의 `null`이다. 질문 유형·설정·표시 조건과 신청 접수 후 잠금은 [DEC-068](../../docs/product/PRODUCT_DECISIONS.md)을, 기본항목·신청서 설정·자동 질문은 DEC-070을 따른다.

필드 항목의 키는 `fieldId`, `kind`, `systemKey`, `label`, `position`, `answerType`, `required`, `description`, `config`, `showWhen`, `hidden`, `presetKey`, `presetActive`다.

- `presetKey`: 신청서 설정이 만든 자동 질문의 고정 키다(예: `ATTENDANCE`, `MEALS`). 자동 질문도 `kind`는 `CUSTOM`이다. 다른 질문은 `null`이다. 키 목록과 보기 id는 DEC-070 §1에 있다.
- `presetActive`: 자동 질문이 설정에서 켜져 있으면 `true`, 설정이 껐으면 `false`(이때 `hidden: true`)다. 다른 질문은 `null`이다.

- `answerType`: `SHORT_TEXT`, `LONG_TEXT`, `SINGLE_CHOICE`, `MULTI_CHOICE`, `DROPDOWN`, `DATE`, `DATE_RANGE`, `NUMBER`, `YES_NO`. SYSTEM은 늘 `SHORT_TEXT`, `required: true`다. `COHORT`(또래)는 `maxLength` 2, `format` `DIGITS`이고 SYSTEM 가운데 혼자 `hidden`이 될 수 있다.
- `config`: 유형별 설정이다. 서버가 기본값을 채운 전체 객체를 돌려준다. 모르는 키는 `400`이고 필드는 `config`다.

| 유형 | `config` 키 (기본값) |
|---|---|
| `SHORT_TEXT` | `maxLength` 1–200 (200), `format` `NONE`·`PHONE`·`DIGITS` (`NONE`), `placeholder` ≤100 (`null`) |
| `LONG_TEXT` | `maxLength` 1–2000 (1000), `placeholder` |
| `SINGLE_CHOICE` | `options` (필수), `allowOther` (`false`), `display` `LIST`·`BUTTONS` (`LIST`) |
| `MULTI_CHOICE` | `options` (필수), `allowOther`, `minSelect` (0), `maxSelect` (`null` = 제한 없음) |
| `DROPDOWN` | `options` (필수) |
| `DATE`·`DATE_RANGE` | `includeTime` (`false`), `min`·`max` (`null`). `YYYY-MM-DD`, 시간 포함이면 `YYYY-MM-DDTHH:mm`(행사 현지 시각, offset 없음) |
| `NUMBER` | `min`·`max` 정수 (`null`), `unit` ≤10 |
| `YES_NO` | `style` `YES_NO`·`CONSENT` (`YES_NO`), `yesLabel`·`noLabel` ≤20 |

- `options` 항목은 `{ "optionId", "label", "group", "hidden", "showWhen" }`이고 1–50개다. 새 보기는 `optionId`를 빼고 보내면 서버가 `opt_` 접두 id를 준다. 있는 보기는 받은 `optionId`를 그대로 보낸다. 모르는 `optionId`는 `400`이다. `label` 1–100자, `group` ≤50자(예: 날짜 묶음).
- `showWhen`: `null`이면 늘 보인다. `{ "fieldId", "optionIds": [...] }`(선택형 대상, 보기 중 하나면 참) 또는 `{ "fieldId", "equals": true|false }`(`YES_NO` 대상), 또는 그런 조건 2–5개를 묶은 `{ "anyOf": [조건, …] }`(하나라도 참이면 참, 중첩 불가, `anyOf` 외 키 불가)이다. `anyOf`는 서로 다른 질문을 OR로 묶을 때 쓴다(자동 질문의 차량 보기, #324). AND는 없다. 대상은 같은 신청서에서 position이 더 앞인 CUSTOM 선택형·`YES_NO` 질문이다(자동 질문 포함). 보기의 `showWhen`도 같은 규칙이고, 보기를 가진 질문보다 앞을 가리킨다. `anyOf`면 모든 항목이 이 규칙을 지킨다. 어기면 `400`이고 필드는 `showWhen`(보기면 `config`)이다.
- `hidden`: 숨긴 질문은 공개 신청서에 나오지 않고 답을 받지 않는다. 숨긴 보기도 같다.
- 신청서당 필드는 최대 100개다. 넘으면 `400`이고 필드는 `fields`다.
- **잠금:** 신청서에 `SUBMITTED` 신청이 하나라도 있으면 질문 유형 변경, 있던 보기 제거, 질문·보기의 `showWhen` 변경, CUSTOM 필드 삭제는 `409 FIELD_LOCKED`다. 라벨·설명·필수·숨김, 보기 추가·문구 수정·숨김, 순서 변경은 된다.

### `GET /api/v1/operator/events/{eventId}/forms`

목록이다. 항목은 `{ "formId", "acceptingApplications" }`다.

### `POST /api/v1/operator/events/{eventId}/forms`

```json
{ "customLabel": "비고" }
```

본문을 생략하거나 `customLabel`을 생략·`null`로 두면 CUSTOM 필드 없이 만든다. `customLabel`이 있으면 앞뒤 공백을 자르고 1–200자다. 다른 키는 `400`이고 필드는 그 키다.

`201`은 상세다. `acceptingApplications`는 `false`, `setup`은 `null`이다. SYSTEM 필드 `NAME` 라벨 "이름"(position 0), `PHONE` 라벨 "전화"(position 1), `COHORT` 라벨 "또래"(position 2, 설명 "출생연도 뒤 두 자리를 적어주세요.", 안내 문구 "예: 94")가 생긴다. `customLabel`이 있으면 CUSTOM 필드(`SHORT_TEXT`, 필수 아님)가 position 3이다. 질문은 이후 필드 추가로 더 만든다. 두 번째 POST는 `409 CONFLICT`다. 데이터베이스 인덱스 `forms_one_per_event`도 같은 코드로 막는다.

### `GET /api/v1/operator/events/{eventId}/forms/{formId}`

`200`

```json
{
  "formId": "…",
  "acceptingApplications": false,
  "fields": [
    {
      "fieldId": "…",
      "kind": "SYSTEM",
      "systemKey": "NAME",
      "label": "이름",
      "position": 0,
      "answerType": "SHORT_TEXT",
      "required": true,
      "description": null,
      "config": { "maxLength": 200, "format": "NONE", "placeholder": null },
      "showWhen": null,
      "hidden": false,
      "presetKey": null,
      "presetActive": null
    }
  ],
  "locked": false,
  "setup": null
}
```

`setup`은 마지막으로 저장한 신청서 설정이다(아래 `PUT …/setup`의 본문 모양에 `generatedFor`가 붙는다). 저장한 적이 없으면 `null`이다.

`locked`는 그 신청서에 `SUBMITTED` 신청이 하나라도 있으면 `true`다. 이때 아래 잠금 규칙이 적용된다. 공개 신청서에는 이 키가 없다.

그 행사의 신청서가 아니면, 권한보다 먼저 `404 RESOURCE_NOT_FOUND`다.

### `PATCH /api/v1/operator/events/{eventId}/forms/{formId}`

```json
{ "acceptingApplications": true }
```

`acceptingApplications`만 받는 boolean이다. `true`는 행사가 `ACTIVE`일 때만 된다. 아니면 `409 INVALID_STATE_TRANSITION`이다. `false`는 상태와 상관없이 된다. `200`은 상세다.

### `POST /api/v1/operator/events/{eventId}/forms/{formId}/fields`

```json
{
  "label": "참석 방식",
  "answerType": "SINGLE_CHOICE",
  "required": true,
  "description": "부분 참석이면 일정을 더 묻습니다.",
  "config": { "options": [{ "label": "전체" }, { "label": "부분" }], "display": "BUTTONS" },
  "showWhen": null,
  "hidden": false
}
```

CUSTOM 필드를 맨 뒤에 추가한다. `label`만 필수이고 앞뒤 공백을 자르고 1–200자다. `answerType`을 빼면 `SHORT_TEXT`, `required`·`hidden`은 `false`다. `description`은 ≤500자이고 빈 값은 `null`이다. `kind`, `systemKey`, `position` 같은 다른 키는 `400`이고 필드는 그 키다. `201`은 신청서 상세다.

### `PATCH /api/v1/operator/events/{eventId}/forms/{formId}/fields/{fieldId}`

```json
{ "label": "참석 형태", "required": false }
```

보낸 키만 바꾼다. 키는 추가와 같고 빈 객체는 `400`이다.

- **SYSTEM 필드**는 `label`, `description`, `config`, `hidden`만 받는다. `config`에는 `placeholder`만 올 수 있고(다른 키는 `400`, 필드 `config`) 길이·형식은 그대로다. `hidden: true`는 `COHORT`만 되고 `NAME`·`PHONE`은 `409 CONFLICT`다. `required`·`answerType`·`showWhen`은 `400`이고 필드는 그 키다.
- **자동 질문**(`presetKey`가 있는 필드)은 문구만 바꾼다: `label`, `description`, `required`, `hidden`, 그리고 `config`의 `placeholder`와 보기 `label`. `config`를 보낼 때는 받은 설정 전체를 문구만 고쳐 보낸다. 유형, `showWhen`, 보기의 수·순서·`group`·`hidden`·`showWhen`이 달라지면 `409 CONFLICT`다. 설정이 끈 질문(`presetActive: false`)에 `hidden: false`를 보내도 `409 CONFLICT`다.
 `config`를 보내면 그 유형의 설정 전체를 바꾼다(보기 목록도 전체). `answerType`을 바꾸고 `config`를 빼면 새 유형의 기본값이 된다. 선택형으로 바꿀 때는 `options`가 있어야 한다. 바뀐 뒤 다른 질문의 `showWhen`이 맞지 않으면 `400`이다. 잠금은 위와 같다. `200`은 신청서 상세다. 필드가 없으면 `404 RESOURCE_NOT_FOUND`다.

### `PUT /api/v1/operator/events/{eventId}/forms/{formId}/fields/order`

```json
{ "fieldIds": ["…", "…"] }
```

신청서의 모든 필드 id를 한 번씩, 새 순서로 보낸다. SYSTEM 필드와 꺼진 자동 질문도 포함한다. SYSTEM 필드도 자리를 옮길 수 있다. position은 0부터 다시 매긴다. 빠지거나 겹치거나 모르는 id는 `400`이고 필드는 `fieldIds`다. 새 순서에서 `showWhen`이 뒤를 가리키면 `400`이다. 잠금과 상관없이 된다. `200`은 신청서 상세다.

### `DELETE /api/v1/operator/events/{eventId}/forms/{formId}/fields/{fieldId}`

운영자가 직접 만든 CUSTOM 필드를 지운다. `204`이고 본문이 없다. SYSTEM 필드와 자동 질문 삭제는 `409 CONFLICT`다. 자동 질문은 `hidden`으로 끄거나 설정에서 뺀다. 다른 질문이나 보기의 `showWhen`이 가리키는 필드도 `409 CONFLICT`다. 신청이 들어온 신청서는 `409 FIELD_LOCKED`이고, 대신 `hidden: true`로 숨긴다. 없는 필드는 `404 RESOURCE_NOT_FOUND`다.

### `PUT /api/v1/operator/events/{eventId}/forms/{formId}/setup`

신청서 설정을 저장하고 자동 질문을 그에 맞춘다(DEC-070). 유효한 `FORM_WRITE`가 필요하다.

```json
{
  "gender": true,
  "middleGroup": true,
  "cell": true,
  "middleGroups": ["1중그룹", "2중그룹"],
  "cells": [],
  "attendance": { "partial": true, "worshipOnly": false, "mode": "RANGE" },
  "schedule": [
    { "breakfast": false, "lunch": false, "dinner": true, "worship": true },
    { "breakfast": true, "lunch": true, "dinner": false, "worship": false }
  ],
  "transport": {
    "groupBus": true, "worshipShuttle": false, "car": true, "publicTransit": true, "support": false,
    "partialByTime": true
  }
}
```

- 모든 키가 필수이고 값은 boolean이다. 다만 `middleGroups`·`cells`(이름 목록)는 없어도 되고 없으면 빈 목록이다. `attendance.mode`와 `transport.partialByTime`도 없어도 된다(아래). 응답의 `setup`에는 늘 있다. 모르는 키나 다른 타입은 `400`이고 필드는 `setup`, `attendance`, `schedule`, `transport`, `middleGroups`, `cells` 중 해당 묶음이다. 응답의 `generatedFor`는 다시 보내도 무시한다. 예전 `newcomer` 스위치(같은 날 대체됨)는 보내도 무시하고 응답·저장에서 빠진다.
- 중그룹·셀과 새가족(DEC-070 Follow-up 2026-11-17 "새가족은 중그룹·셀 보기로", [#333](https://github.com/BeomhyunPark/SCENE/issues/333)).
  - `middleGroups`·`cells`는 문자열 배열이다. 앞뒤 공백을 자르고, 빈 항목은 빼고, 같은 이름은 한 번만 둔다. 이름은 50자, 목록은 49개까지이고 넘으면 `400`이다.
  - 스위치가 켜져 있고 목록이 있으면 그 질문은 `DROPDOWN`·필수이고 보기는 목록 순서다. 보기 id는 이름에서 계산한다(`opt_mg_<8자리>`, `opt_cell_<8자리>`). 같은 이름은 저장할 때마다 같은 id이고, 이름을 바꾸면 새 보기다. 목록이 없으면 지금까지처럼 `SHORT_TEXT`·선택(자유 입력)이다.
  - 첫 번째 목록 질문(중그룹, 중그룹 목록이 없으면 셀)의 마지막 보기로 `opt_newcomer`("새가족 (등반X)")가 생긴다. 운영자가 문구를 고칠 수 있고 판정은 id로 한다. 끄는 스위치는 없다.
  - 중그룹이 목록 질문이면 `CELL`은 `MIDDLE_GROUP ∈ {목록 보기 전부}`일 때만 보인다. 새가족은 셀을 묻지 않는다.
  - 신청이 들어온 신청서(`locked`)에서도 목록에 이름을 더하고 빼고 문구를 고칠 수 있다. 뺀 보기는 숨긴다. `CELL` 조건은 이전 보기 id를 그대로 두고 새 id만 더한다. 자유 입력 ↔ 목록 전환(목록을 처음 채우거나 다 비우기)과 중그룹 스위치를 켜고 끄는 것(셀 조건이 생기거나 없어짐)은 `409 FIELD_LOCKED`다. 목록은 접수 전에 정한다.
  - 중그룹·셀이 둘 다 꺼졌거나 둘 다 목록이 없으면 새가족을 알 수 없다(편성판 `newcomer`는 모두 `null`).
- `attendance.mode`는 부분 참석자가 참석 칸을 알리는 방식이다(DEC-074). `RANGE`(도착~출발만 받기)와 `SLOTS`(칸마다 고르기) 중 하나이고 다른 값은 `400`이고 필드는 `attendance`다. **없어도 된다**: 저장된 설정이 있으면 그 방식을 그대로 쓰고(DEC-074 전에 저장돼 키가 없는 설정은 `SLOTS`), 설정이 처음이면 `RANGE`다. 응답의 `setup.attendance.mode`에는 늘 있다.
  - `RANGE`: 부분 참석이 켜져 있고 일정표에 칸이 있으면 `ARRIVAL_SLOT`("수련회장에 언제 도착하나요?")·`DEPARTURE_SLOT`("수련회장에서 언제 출발하나요?")이 생긴다. 둘 다 `SINGLE_CHOICE`·`LIST`·필수이고 `ATTENDANCE = opt_partial`일 때만 보인다. 보기는 일정표의 칸을 칸 순서(일차, 아침 → 점심 → 저녁 → 집회)로 펼친 것이고, 보기 id는 칸 id(`opt_d<일차>_<칸>`, `MEALS` 보기 id와 같다), 문구는 `1월 22일 (금) 저녁부터` / `1월 22일 (금) 저녁까지` 꼴이다. 도착 칸부터 출발 칸까지(둘 다 포함) 모든 칸에 참석한 것으로 센다. `ARRIVAL_AT`·`DEPARTURE_AT`(날짜·시각)과 `LODGING`은 만들지 않는다. 숙박은 구간에서 계산한다. `MEALS`는 집회만 참석이 켜져 있고 집회 칸이 있을 때만 생기고, 제목 "참석할 집회를 선택해주세요", `ATTENDANCE = opt_worship`일 때만 보이며, 식사 보기는 숨긴(`hidden: true`) 채 집회 보기만 보인다. `PARTIAL_NOTE` 설명은 "중간에 나갔다가 다시 오거나 수련회장에서 자지 않는다면 적어 주세요."다.
  - `SLOTS`: 지금까지와 같다(`ARRIVAL_AT`·`DEPARTURE_AT`·`LODGING`·`MEALS`). `MEALS` 설명 기본 문구는 "참석하는 일정에 포함되는 식사와 프로그램을 모두 선택해 주세요. ※ 식사는 실제 식사 여부와 관계없이 참석 일정에 포함된 경우 신청 인원에 반영됩니다."다.
  - 신청이 들어온 신청서(`locked`)에서 저장된 방식과 다른 `mode`를 보내면 `409 FIELD_LOCKED`이고 아무것도 저장하지 않는다. 같은 방식이거나 키를 빼면 저장된다.
- `transport`의 이동 보기(#324, DEC-070 Follow-up 2026-11-17 이동 수단 분기). `TRANSPORT_IN` 보기는 `opt_group`(단체 이동 차량), `opt_shuttle`(집회 차량), `opt_car`(자차 (직접 운전)), `opt_ride`(자차 합승 (다른 사람 차를 타요)), `opt_public`, `opt_support` 순서다. `opt_car`·`opt_ride`는 `car`로 같이 켜고 끈다. 동승 질문(`CARPOOL_*`)은 `opt_car`일 때만 묻는다. `TRANSPORT_OUT`은 가는 길이 `opt_car`·`opt_ride`면 묻지 않는다(조건은 전과 같은 `opt_group`·`opt_shuttle`·`opt_public`·`opt_support`).
  - `partialByTime`(부분 참석자 차량을 도착·출발 시점에 맞춤)은 **없어도 된다**: 저장된 값을 쓰고, 저장된 값이 없으면(처음 저장, 또는 키가 생기기 전 설정) `false`다. 응답의 `setup.transport.partialByTime`에는 늘 있다.
  - `false`이거나 부분 참석이 꺼져 있거나 일정표에 칸이 없으면 지금까지와 같다: `opt_group`은 `ATTENDANCE ∈ {opt_full, opt_partial}`, `opt_shuttle`은 `ATTENDANCE ∈ {opt_partial, opt_worship}`(가는 길·오는 길 같음).
  - `true`이고 `RANGE`면: 가는 길 `opt_group` = `anyOf[ATTENDANCE ∈ {opt_full}, ARRIVAL_SLOT ∈ {첫 칸}]`, `opt_shuttle` = `anyOf[ATTENDANCE ∈ {opt_worship}, ARRIVAL_SLOT ∈ {집회 칸 전부}]`. 오는 길은 `DEPARTURE_SLOT`과 마지막 칸·집회 칸으로 같다. 그래서 중간에 오는 부분 참석자에게는 자차·합승·대중교통·이동 지원만 보인다.
  - `true`이고 `SLOTS`면: `opt_group`만 바뀐다. 가는 길 `anyOf[ATTENDANCE ∈ {opt_full}, MEALS ∈ {첫 칸}]`, 오는 길 `anyOf[ATTENDANCE ∈ {opt_full}, MEALS ∈ {마지막 칸}]`. `opt_shuttle`은 위의 기본 조건 그대로다.
  - 이 조건은 일정표의 첫·마지막·집회 칸에 따라 정해진다. 신청이 들어온 신청서에서 `partialByTime`을 바꾸거나, 켜진 상태에서 부분 참석을 켜고 끄거나, 첫·마지막·집회 칸이 바뀌는 일정 변경은 조건이 바뀌므로 `409 FIELD_LOCKED`다. 보기 켜고 끄기(`publicTransit` 등)는 보기를 숨길 뿐이라 된다.
- `schedule`은 행사 기간의 하루마다 한 항목이고 날짜순이다. 항목 수가 행사 일수와 다르면 `400`이고 필드는 `schedule`이다.
- 행사에 `startDate`·`endDate`가 없거나 기간이 10일을 넘으면 `400`이고 필드는 `eventPeriod`다.
- 서버는 이 설정과 행사 기간으로 질문을 만들어 저장된 질문과 맞춘다: 없는 질문은 추가하고, 더는 필요 없는 질문은 삭제하거나(신청이 없고, 운영자가 손대지 않았고, 다른 질문이 가리키지 않을 때) 숨기고 `presetActive: false`로 둔다. 운영자가 고친 문구와 순서는 유지한다.
- 신청이 들어온 신청서(`locked`)에서는 없어진 보기를 삭제하지 않고 숨긴다. 이미 있는 질문·보기의 `showWhen`이 바뀌는 설정은 `409 FIELD_LOCKED`이고 아무것도 저장하지 않는다.
- 직접 만든 질문의 조건이 이 설정으로 없어지는 질문·보기를 가리키면 `409 CONFLICT`다. 질문이 100개를 넘으면 `400`이고 필드는 `fields`다.

`200`은 신청서 상세다. `setup`에는 보낸 값과 `"generatedFor": { "startDate", "endDate" }`(질문을 만들 때 쓴 행사 기간)가 있다.

## 신청 읽기

컨트롤러는 `event/application/OperatorApplicationController`다(참가 현황 표는 `ApplicationTableController`). 읽기는 신청서와 같다. `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. [신청 집계](#get-apiv1operatoreventseventidapplicationssummary)도 같다. 신청자 CSV만 `DATA_EXPORT`다(아래). `APPLICATION_READ`는 보지 않는다. `sort` 허용 필드는 없다. 순서는 신청 id다.

`status` 쿼리는 `SUBMITTED`, `SUPERSEDED`, `WITHDRAWN`만 받는다. 다른 값은 `400`이고 필드는 `status`다. 아는 값이어도 목록을 거르지 않는다. 순서는 `submittedAt`, 그다음 신청 id다.

### `GET /api/v1/operator/events/{eventId}/applications`

항목은 `{ "applicationId", "formId", "status", "submittedAt", "name" }`다. `name`은 신청서 SYSTEM `NAME` 필드 답변의 `value.text`다. 그 답변이 없으면 `null`이다. 전화와 CUSTOM 답변은 목록에 없고 한 건 조회에서만 읽는다.

### `GET /api/v1/operator/events/{eventId}/applications/{applicationId}`

그 행사에 신청이 없으면, 권한보다 먼저 `404 RESOURCE_NOT_FOUND`다.

권한은 목록·표와 같다(`EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`). **전화 답은 참가 현황 표와 같은 기준**이다(#332, DEC-054 Follow-up).

- 전화 질문(SYSTEM `PHONE`, `format: PHONE`인 글 질문)의 답에는 `contact: true`가 붙는다.
- effective `PARTICIPANT_CONTACT_READ`가 없으면 그 답의 `value`는 `null`이고 최상위 `contactVisible`은 `false`다. 답 항목은 남기므로 화면은 그 자리에 "연락처 권한이 있는 운영자만 볼 수 있어요"를 보인다. 행사 역할 없는 공간 `OWNER`·`ADMIN`도 마찬가지다.
- 권한이 있고 전화 답이 하나라도 값과 함께 나가면 audit `APPLICANT_CONTACTS_VIEWED` 한 줄을 남긴다. detail은 `{ "count": 1, "applicationId" }`다. 번호·이름은 없다. 표와 같은 action이고, `CONTACT_VIEW` privacy log가 생기면 함께 옮긴다.
- 체크인 명단의 끝 4자리(DEC-071)와 CSV(`DATA_EXPORT`)는 이 규칙과 상관없다.

`200`

```json
{
  "applicationId": "…",
  "formId": "…",
  "status": "SUBMITTED",
  "submittedAt": "2026-10-15T00:00:00Z",
  "contactVisible": true,
  "answers": [
    {
      "fieldId": "…",
      "kind": "SYSTEM",
      "systemKey": "NAME",
      "label": "이름",
      "position": 0,
      "answerType": "SHORT_TEXT",
      "hidden": false,
      "config": { "maxLength": 200, "format": "NONE", "placeholder": null },
      "value": { "text": "김" },
      "contact": false
    }
  ]
}
```

`answers`는 필드 position 순이다. 받은 답만 있고, 답이 없는 질문은 빠진다. `answerType`·`hidden`·`config`는 그 질문의 **현재** 값이다(운영자 신청서 상세의 필드와 같은 모양). 화면은 이것으로 선택형 답의 `optionId`를 지금 보기 문구로 바꾸고, 숨긴 질문(`hidden: true`)과 숨긴 보기(`config.options[].hidden: true`)에 "(숨김)"을 붙인다(DEC-068 §6). `value` 모양은 DEC-068 §1을 따른다.

### `POST /api/v1/operator/events/{eventId}/applications/export`

신청자 명단 CSV를 내려받는다(#233). 본문은 없다. CSRF가 필요하다. `Idempotency-Key`는 읽지 않는다. 컨트롤러는 같은 `OperatorApplicationController`이고 서비스는 `ApplicationExportService`다.

권한은 그 행사의 effective `DATA_EXPORT`다(DEC-054). 행사 `OWNER`는 기본으로 갖고, 다른 운영자는 개인별 `GRANT`로 받는다. `EVENT_READ`만 있는 운영자, 행사 역할 없는 공간 `OWNER`·`ADMIN`은 `403 FORBIDDEN`이다. 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`)이다. 다른 공간의 행사는 `404 RESOURCE_NOT_FOUND`다. 행사 상태로 막지 않는다(`ARCHIVED` 포함, DEC-061). 실패는 다른 경로와 같은 problem JSON이다.

`200`은 파일이다.

- `Content-Type: text/csv;charset=UTF-8`, `Cache-Control: no-store`, `X-Export-Count`(명단 행 수).
- `Content-Disposition: attachment`이고 파일 이름은 `filename*=UTF-8''…`로 온다. 이름은 `{행사 이름}_신청자_{yyyyMMdd-HHmm}.csv`(서울 시각)이고, 행사 이름의 `\ / : * ? " < > |`와 제어 문자는 뺀다.
- 본문은 UTF-8 BOM(`EF BB BF`)으로 시작하고, 줄은 CRLF로 끝난다(RFC 4180). 쉼표·따옴표·CR·LF가 있는 칸은 큰따옴표로 감싸고 안의 따옴표는 두 번 쓴다.
- `=`, `+`, `-`, `@`, 탭, CR로 시작하는 칸은 앞에 `'`를 붙여 스프레드시트가 수식으로 실행하지 않게 한다. 머리글(질문 제목)도 같다. 그래서 음수 `-2`는 `'-2`로 보인다.

행은 `SUBMITTED` 신청만, 목록과 같은 순서(`submittedAt`, 그다음 신청 id)다. 첫 열은 `제출 시각`(`2026. 12. 15. 12:00`, 서울 시각)이고, 그 뒤로 신청서 질문마다 한 열이 position 순으로 온다. 질문 제목이 열 이름이다.

- 칸 값은 [신청 원본 조회](#get-apiv1operatoreventseventidapplicationsapplicationid) 화면과 같은 규칙으로 쓴다(`frontend/src/components/answerDisplay.ts`, 서버는 `AnswerText`). 선택형은 지금 보기 문구, 묶음이 있는 보기는 `1일차 저녁`, 여러 개는 `, `로 잇고, `other`는 `기타: …`, 모르는 보기 id는 `알 수 없는 보기`다. 날짜는 `2027. 1. 22.`·`2027. 1. 22. 14:30`, 기간은 `… ~ …`, 숫자는 단위를 붙이고, 예/아니오는 질문의 문구(없으면 `예`·`아니오`, 동의형은 `동의함`·`동의 안 함`)다.
- 설정이 `RANGE`(DEC-074)이고 칸이 있으면 마지막에 `참석 일정` 열이 하나 더 있다. 그 사람이 참석하는 칸을 `1월 22일 (금) 저녁, 1월 22일 (금) 집회` 꼴로 칸 순서대로 쉼표로 잇는다. 집계·편성판·참가 현황 표와 같은 규칙이고, 모름이면 빈칸이다. `SLOTS` 설정에서는 이 열이 없다(`MEALS` 열이 그 답이다).
- 숨긴 질문은 열로 남고 제목 뒤에 ` (숨김)`이 붙는다. 숨긴 보기를 고른 답도 보기 문구 뒤에 ` (숨김)`이 붙는다(DEC-068 §6).
- 답이 없으면 빈칸이다. 조건에 맞지 않아 보이지 않은 질문은 답을 저장하지 않으므로(DEC-068) 빈칸이다. 원본 조회 화면의 "답변 없음"은 쓰지 않는다.

신청이 0건이면 머리글 한 줄만 있는 파일이다. 신청서가 없으면 `제출 시각` 열만 있다.

파일은 요청 안에서 만들어 바로 보낸다. 그래서 권한은 내려받을 때마다 다시 본다. #12의 목적 선택, 재인증, 생성 작업과 만료 다운로드 링크는 없다. 내려받을 때마다 audit `APPLICATIONS_EXPORTED` 한 줄을 남긴다. 행사·실행자·시각은 그 행의 열이고, detail은 `{ "count" }`(행 수)뿐이다. 답·이름·전화는 audit·로그·오류 응답에 넣지 않는다. 권한이 없어 막힌 요청은 남기지 않는다.

### `GET /api/v1/operator/events/{eventId}/applications/summary`

신청 집계다. 운영자 화면 하나를 이 응답 하나로 그린다([#251](https://github.com/BeomhyunPark/SCENE/issues/251), [DEC-073](../../docs/product/PRODUCT_DECISIONS.md)). 서비스는 `ApplicationSummaryService`다.

**권한과 기본 동작**
- 권한은 위 신청 읽기와 같다. 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다.
- 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`)이다. 다른 공간의 행사는 `404 RESOURCE_NOT_FOUND`다.
- 행사 상태로 막지 않는다(`ARCHIVED` 포함). audit는 남기지 않는다.
- 세는 대상은 `SUBMITTED` 신청이다. 집계는 저장하지 않고 요청마다 센다.
- **전화·접근 키는 없다.** 연락이 필요하면 `applicationId`로 [신청 원본](#get-apiv1operatoreventseventidapplicationsapplicationid)을 연다.

`200`

```json
{
  "eventStatus": "ACTIVE",
  "formId": "…",
  "fromSetup": true,
  "total": 6,
  "attendance": { "asked": true, "full": 3, "partial": 2, "worshipOnly": 1 },
  "gender": {
    "options": [
      { "optionId": "opt_female", "label": "여성", "hidden": false, "count": 4 },
      { "optionId": "opt_male", "label": "남성", "hidden": false, "count": 2 }
    ],
    "noAnswer": 0
  },
  "cohorts": { "items": [{ "cohort": "00", "count": 1 }, { "cohort": "94", "count": 2 }], "noAnswer": 0 },
  "meals": {
    "days": [
      {
        "day": 1, "date": "2027-01-22", "label": "1월 22일 (금)",
        "slots": [
          { "optionId": "opt_d1_dinner", "meal": "DINNER", "label": "저녁", "count": 4 },
          { "optionId": "opt_d1_worship", "meal": "WORSHIP", "label": "집회", "count": 4 }
        ]
      }
    ],
    "unanswered": 0
  },
  "lodging": {
    "nights": [
      { "optionId": "opt_n1", "night": 1, "date": "2027-01-22", "label": "첫째 밤 (1월 22일 (금))", "count": 3 }
    ],
    "unanswered": 0
  },
  "transport": {
    "in":  { "options": [{ "optionId": "opt_group", "label": "단체 이동 차량", "hidden": false, "count": 1 }], "noAnswer": 0 },
    "out": { "options": [{ "optionId": "opt_car", "label": "자차 (직접 운전)", "hidden": false, "count": 2 }], "noAnswer": 0 }
  },
  "shuttle": {
    "in":  { "options": [{ "optionId": "opt_d1", "label": "1월 22일 (금) 집회 전", "hidden": false, "count": 1 }], "noAnswer": 0 },
    "out": { "options": [{ "optionId": "opt_d2", "label": "1월 23일 (토) 집회 후", "hidden": false, "count": 1 }], "noAnswer": 0 }
  },
  "carpool": {
    "offerCount": 1,
    "seatTotal": 3,
    "offers": [
      { "applicationId": "…", "name": "나래", "cohort": "95", "seats": 3, "area": "분당", "note": "판교 경유 가능" }
    ]
  },
  "mobility": {
    "in":  [{ "applicationId": "…", "name": "라온", "cohort": "00", "area": "수원" }],
    "out": [{ "applicationId": "…", "name": "라온", "cohort": "00", "area": "수원역" }]
  }
}
```

**영역별 규칙.** 답은 자동 질문의 `presetKey`와 보기 id로 찾는다(DEC-070). **꺼진 질문(`hidden`)은 묻지 않은 것으로 본다.** 그 질문의 영역은 `null`이고, 그 질문에 저장된 답은 세지 않는다(DEC-072와 같다).

- `fromSetup`: 신청서를 설정 카드로 만들었는지다. `false`이면 `total`·`cohorts`·`attendance`(모두 전체 참석)만 값이 있고, 나머지는 `null`이다. 신청서가 없으면 `formId: null`, `total: 0`이다.
- `attendance`: `ATTENDANCE`가 없거나 꺼졌으면 `asked: false`이고 모두 `full`이다. 답이 없거나 모르는 보기를 골랐을 때도 `full`이다. 조 편성판의 `attendance`와 같은 규칙이다.
- `gender`: `GENDER`의 보기 순서다. 모든 영역의 `options`는 꺼진 보기도 `hidden: true`로 포함한다. 화면은 `count`가 0인 꺼진 보기를 숨기고, 0이 아니면 "(꺼짐)"으로 보여 준다.
- `cohorts`: SYSTEM `COHORT` 답의 앞뒤 공백을 자른 글자별 인원이다. 글자 오름차순이므로 `00`이 `94`보다 앞이다. 또래가 꺼졌으면 `null`이다.
- `meals`: 조 편성판의 `slots`·`slotIds`와 같은 칸·같은 규칙이다. 일차와 칸은 저장된 설정(`setup.schedule`)의 순서다. 칸은 아침 → 점심 → 저녁 → 집회 순이고, 칸이 없는 날은 빠진다. `label`은 `MEALS` 보기의 지금 문구이고, 보기가 없으면 기본 문구를 쓴다. 칸이 하나도 없으면 `meals`는 `null`이다.
  - 전체 참석자는 모든 칸에 센다.
  - 부분·집회만 참석자는 고른 칸에만 센다. `RANGE` 설정(DEC-074)에서 부분 참석자는 `ARRIVAL_SLOT` 칸부터 `DEPARTURE_SLOT` 칸까지 모든 칸에 센다. 둘 중 하나라도 답이 없으면(꺼짐 포함) `unanswered`다. 집회만 참석자는 두 방식 모두 `MEALS`에서 고른 칸이다.
  - `MEALS` 답이 없는 부분·집회만 참석자(질문이 꺼졌거나 질문이 생기기 전에 낸 신청)는 칸에 넣지 않고 `unanswered`로 센다.
- `lodging`: 밤은 `setup.generatedFor` 기간의 N박이고, 하루짜리 행사면 `null`이다. `date`는 그 밤의 날짜다.
  - 전체 참석자는 모든 밤에 센다. 집회만 참석자는 어느 밤에도 세지 않는다.
  - 부분 참석자는 고른 밤에만 센다. 선택 질문이라 답이 없으면 숙박하지 않는 것이다.
  - `LODGING`이 보이지 않으면 부분 참석자를 `unanswered`로 센다.
  - `RANGE` 설정에서는 `LODGING`을 보지 않는다. 부분 참석자는 도착 칸의 일차가 N 이하이고 출발 칸의 일차가 N+1 이상이면 N번째 밤(N일 저녁)에 센다. 같은 날 도착·출발이면 숙박이 없다. 도착·출발 답이 없으면 `unanswered`로 센다.
- `transport`: `TRANSPORT_IN`이 없거나 꺼졌으면 `null`이다.
  - `in`은 가는 길 보기 순서다.
  - `out`도 같은 순서다. **가는 길이 자차(`opt_car`)·합승(`opt_ride`)이면 오는 길도 같은 보기로 센다**(DEC-070 §3). 이 두 행의 문구는 가는 길 질문의 것이고, 다른 행은 `TRANSPORT_OUT`의 것이다.
  - `noAnswer`는 답이 없는 신청 수다. 오는 길에서는 가는 길 답이 없는 사람과, 자차·합승이 아니면서 오는 길 답이 없는 사람을 센다.
- `shuttle`: `in`·`out`은 각각 `SHUTTLE_IN`·`SHUTTLE_OUT` 회차별 인원이다. 질문이 없거나 꺼졌으면 그쪽만 `null`이고, 둘 다 `null`이면 `shuttle`이 `null`이다. 한 사람이 여러 회차를 고를 수 있어 합이 인원보다 클 수 있다. `noAnswer`는 집회 차량을 골랐는데 회차 답이 없는 사람이다.
- `carpool`: `CARPOOL_OFFER`가 보일 때만 있다.
  - `offers`는 동승을 "예"라고 답한 사람을 이름순(같으면 `applicationId`순)으로 나열한다.
  - `seats`·`area`·`note`는 답이 없거나 질문이 꺼졌으면 `null`이다. `seatTotal`은 `seats`의 합이다.
- `mobility`: `in`·`out`은 `MOBILITY_IN`·`MOBILITY_OUT`에 동네를 적은 사람을 이름순으로 나열한다. 한쪽 질문만 꺼졌으면 그쪽만 `null`이고, 둘 다 없으면 `mobility`가 `null`이다.
- 카풀과 이동 지원은 나란히 보여 주기만 하고 서버가 짝을 맞추지 않는다.
- `name`·`cohort`는 SYSTEM `NAME`·`COHORT` 답이다. 또래가 꺼졌으면 `cohort`는 `null`이다.
- 숨김이거나 조건에 맞지 않아 보이지 않은 질문의 답은 저장되지 않으므로(DEC-068) 집계에도 없다.

### `GET /api/v1/operator/events/{eventId}/applications/table`

참가 현황 표(#308). 신청자 전원과 답을 한 번에 준다. 화면이 거르기·정렬·세기를 한다. 쪽 나누기·`sort`·검색 쿼리는 없다. 컨트롤러는 `ApplicationTableController`, 서비스는 `ApplicationTableService`다. CSRF와 `Idempotency-Key`는 필요 없다. `Cache-Control: no-store`.

권한은 목록·상세와 같다. `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 아니면 `403 FORBIDDEN`이다. 다른 공간의 행사·없는 행사는 `404 RESOURCE_NOT_FOUND`다. 파일을 만들지 않으므로 `DATA_EXPORT`는 보지 않는다(CSV는 여전히 `DATA_EXPORT`, DEC-054). 열·값은 읽는 사람의 권한에 따라 서버가 뺀다.

| 내용 | 보이는 조건 | 없을 때 |
|---|---|---|
| 전화 질문(SYSTEM `PHONE`, `format: PHONE`인 글 질문) | effective `PARTICIPANT_CONTACT_READ` | 열과 답을 보내지 않는다. `contactVisible: false` |
| 조(작업본, DEC-072 §7) | `GROUP_WRITE` 또는 활성 공간 `OWNER`·`ADMIN` | 모든 행의 `group`이 `null`, `groupVisible: false` |
| 체크인(DEC-071) | 표를 읽을 수 있으면 | — |

전화 열을 보낸 응답은 audit `APPLICANT_CONTACTS_VIEWED` 한 줄을 남긴다. detail은 `{ "count" }`(행 수)뿐이다. `CONTACT_VIEW` privacy log가 아직 없어서 대신 남기는 기록이다(security-privacy §5). 전화 열이 없거나 행이 0건이면 남기지 않는다.

`200`

```json
{
  "formId": "…",
  "contactVisible": true,
  "groupVisible": true,
  "columns": [
    {
      "fieldId": "…",
      "kind": "SYSTEM",
      "systemKey": "NAME",
      "presetKey": null,
      "label": "이름",
      "position": 0,
      "answerType": "SHORT_TEXT",
      "hidden": false,
      "config": { "maxLength": 200, "format": "NONE", "placeholder": null },
      "contact": false
    }
  ],
  "rows": [
    {
      "applicationId": "…",
      "submittedAt": "2026-12-15T03:00:00Z",
      "answers": { "<fieldId>": { "text": "김하나" } },
      "group": { "groupId": "…", "name": "2조", "leader": false },
      "checkedInAt": null,
      "slotIds": ["opt_d1_dinner", "opt_d1_worship"]
    }
  ],
  "slots": [
    {
      "slotId": "opt_d1_dinner",
      "day": 1,
      "date": "2027-01-22",
      "dayLabel": "1월 22일 (금)",
      "meal": "DINNER",
      "label": "저녁",
      "sortOrder": 0
    }
  ]
}
```

- `columns`는 신청서 질문을 position 순으로 준다. 모양은 상세의 답 항목에서 `value`를 뺀 것과 같다. `presetKey`는 자동 질문의 키(`ATTENDANCE`, `MIDDLE_GROUP`, `CELL` 등, DEC-070)이고 아니면 `null`이다. `contact`는 전화 질문이면 `true`다. 숨긴 질문도 열로 남는다(`hidden: true`, DEC-068 §6). 신청서가 없으면 `formId`는 `null`, `columns`는 빈 배열이다.
- `rows`는 `SUBMITTED` 신청만, CSV와 같은 순서(`submittedAt`, 그다음 신청 id)다. `answers`는 field id를 키로 저장된 값을 그대로 준다(DEC-068 §1). 답이 없는 질문(조건에 맞지 않아 보이지 않은 질문 포함)은 키가 없다. 화면은 이것을 "응답 없음"으로 센다.
- `group`은 작업본 배정이다. 미배정이면 `null`이다. 공개본이 아니다.
- `checkedInAt`은 도착 체크인 시각이다. 체크인이 없거나 취소됐으면 `null`이다.
- `slots`·`rows[].slotIds`(DEC-074)는 [조 편성판](#get-apiv1operatoreventseventidgroup-board)의 `slots`·`slotIds`와 같은 모양·같은 규칙이다. 신청서가 없거나 설정이 없거나 칸이 하나도 없으면 `slots`와 모든 `slotIds`가 `null`이다. `slotIds: null`은 "모름"이다. 전화 열을 볼 수 없어도 `slotIds`는 같은 값이다.
- 0건이면 `rows`가 빈 배열이고 `columns`는 그대로다.

## 공개 신청서

세션이 없다. 변경 요청은 CSRF가 필요하다. 조회 `GET`은 CSRF가 필요 없다.

### `GET /api/v1/public/events/{eventId}/forms/{formId}`

신청을 받는 신청서의 필드 목록이다. 행사가 없으면 `404 RESOURCE_NOT_FOUND`다. 그 행사의 신청서가 아니면 `404 FORM_NOT_FOUND`다. `acceptingApplications`가 false이면 `409 FORM_CLOSED`다.

`200`은 `{ "formId", "fields" }`다. `fields` 항목의 모양은 운영자 상세의 필드와 같다(`presetKey` 포함, `presetActive`는 자동 질문이면 `true`). 숨긴 질문은 빠지고, 남은 질문의 `config.options`에서도 숨긴 보기가 빠진다. `hidden`은 늘 `false`다. `showWhen`은 그대로 있어서 화면이 답에 따라 질문과 보기를 보이고 숨긴다. `acceptingApplications` 키는 없다.

### `POST /api/v1/public/events/{eventId}/forms/{formId}/applications`

CSRF가 필요하다. `Idempotency-Key`는 읽지 않는다.

```json
{
  "answers": [
    { "fieldId": "…", "text": "김" },
    { "fieldId": "…", "text": "010-1234-5678" },
    { "fieldId": "…", "value": { "optionId": "opt_1a2b3c4d" } },
    { "fieldId": "…", "value": { "value": true } }
  ]
}
```

`answers`만 받는다. 각 항목은 `fieldId`와 `text` 또는 `value` 중 하나다. `text`는 글 질문의 줄임으로 `value: { "text" }`와 같다. 유형별 `value`는 다음과 같고, 저장되는 답 값(`answers.value`)도 같은 모양이다.

| 유형 | `value` |
|---|---|
| `SHORT_TEXT`·`LONG_TEXT` | `{ "text" }` 앞뒤 공백을 자르고 `maxLength` 이하. `PHONE`은 숫자 4개 이상, `DIGITS`는 숫자만. SYSTEM `COHORT`(또래)는 정확히 숫자 두 자리 |
| `SINGLE_CHOICE`·`DROPDOWN` | `{ "optionId" }` 또는 `{ "other" }`(`allowOther`일 때, ≤200자) |
| `MULTI_CHOICE` | `{ "optionIds": [...], "other"? }` 겹치지 않고, 고른 수가 `minSelect`–`maxSelect` |
| `DATE` | `{ "date" }`, 시간 포함이면 `{ "dateTime" }`. `min`–`max` 안 |
| `DATE_RANGE` | `{ "start", "end" }` 같은 형식, `start ≤ end` |
| `NUMBER` | `{ "number" }` 정수, `min`–`max` 안 |
| `YES_NO` | `{ "value": true\|false }`. 필수 `CONSENT`는 `true`여야 한다 |

서버는 position 순서로 `showWhen`을 다시 계산한다. 화면이 보낸 표시 여부를 믿지 않는다. 숨겨진 질문(숨김이거나 조건이 거짓)은 필수 검사를 하지 않고, 그 답은 거절하지 않고 저장하지 않는다. 숨겨진 보기를 고른 답도 그 보기를 빼고 본다. 빈 글은 답이 없는 것으로 본다. 보이는 필수 질문에 답이 없거나, 모르는 `fieldId`, 겹친 `fieldId`, 유형과 다른 값, 범위 밖 값, 출발 칸(`DEPARTURE_SLOT`)이 도착 칸(`ARRIVAL_SLOT`)보다 앞인 답(같은 칸은 된다, DEC-074)은 `400 APPLICATION_VALIDATION_FAILED`다. `NAME`과 `PHONE`은 늘 필수다. `COHORT`는 켜져 있으면(`hidden`이 아니면) 필수다. `errors`는 없다. 닫힌 신청서는 `409 FORM_CLOSED`다. 없는 신청서는 `404 FORM_NOT_FOUND`다. 없는 행사는 `404 RESOURCE_NOT_FOUND`다.

`201`. `Location` 헤더는 없다.

```json
{
  "applicationId": "…",
  "participantId": "…",
  "accessKey": "…"
}
```

`accessKey`는 256비트 hex다. raw key는 이 응답에서 한 번만 나온다. 서버는 해시만 저장한다. 응답과 로그에 키를 다시 넣지 않는다.

## 참가자 세션

### `POST /api/v1/public/events/{eventId}/participant-sessions`

본문은 `{ "accessKey": "…" }`다. 앞뒤 공백은 자른다. CSRF가 필요하다. 행사가 없으면 `404 RESOURCE_NOT_FOUND`다. 키가 없거나, 그 행사에 맞는 접근이 하나가 아니면 `401 PARTICIPANT_ACCESS_INVALID`다. 맞는 키와 틀린 키를 본문으로 구분하지 않는다.

성공은 `204`다. 본문은 없다. `Set-Cookie` 이름은 `SCENE_PSESSION`이다. `HttpOnly`, `Secure`, `SameSite=Lax`, 경로 `/api/v1/participant`다. 값은 세션 토큰이고 응답 본문에는 없다. 서버는 토큰 해시만 저장한다.

키를 링크 fragment로 두고 읽은 뒤 지우는 규칙은 [DEC-064](../../docs/product/PRODUCT_DECISIONS.md)다. 이 경로의 구현 단계는 [결정 문서와 다른 점](#결정-문서와-다른-점)에 있다.

### `GET /api/v1/participant/me`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다.

`200`

```json
{ "participantId": "…", "eventId": "…", "spaceId": "…", "name": "김" }
```

쿠키가 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`다. 운영자 세션 쿠키로는 열리지 않는다. 전화와 접근 키는 없다.

### `POST /api/v1/participant/auth/logout`

CSRF가 필요하다. 그 쿠키의 세션 행만 지운다. `204`이고 본문이 없다. 쿠키가 없거나 모르는 값이면 지울 행이 없고 역시 `204`다. 다른 참가자의 세션은 남는다.

## 체크인

> 운영자 경로는 [#282](https://github.com/BeomhyunPark/SCENE/issues/282)에서 열렸다. 컨트롤러는 `event/checkin/CheckInController`다. 참가자 QR 경로(`GET /api/v1/participant/check-in`)는 [#283](https://github.com/BeomhyunPark/SCENE/issues/283)에서 열렸고 컨트롤러는 `event/checkin/ParticipantCheckInController`다. 정책은 [DEC-071](../../docs/product/PRODUCT_DECISIONS.md)이다.

참가자는 행사당 한 번 도착 체크인한다. 대상은 그 행사에 `SUBMITTED` 신청이 있는 참가자다. 읽기(현황·명단)는 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다. 쓰기(체크인·취소)와 이력은 유효한 `CHECKIN_WRITE`다. 공간 역할만으로는 쓰지 못한다. 기본 역할은 `OWNER`·`MANAGER`·`STAFF` 모두 `CHECKIN_WRITE`를 갖는다.

판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → `Idempotency-Key`·본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → [같은 키](#같은-idempotency-key) → 참가 자격(`409`) → 결과(`200`)다. 같은 키를 다시 보내도 행사 상태와 대상은 다시 본다. 그래서 종료된 행사에 같은 키를 보내면 `409 EVENT_ENDED`다. 읽기는 행사 상태로 막지 않는다.

체크인·취소는 행사 행을 잠그고 처리한다. 같은 행사의 쓰기는 차례로 커밋된다.

| 행사 상태 | 체크인·취소 |
|---|---|
| `DRAFT` | `409 INVALID_STATE_TRANSITION`, 확장 필드 `eventStatus` |
| `ACTIVE` | 가능 |
| `ENDED` | `409 EVENT_ENDED` |
| `ARCHIVED` | `409 EVENT_ARCHIVED` |

`EVENT_ENDED`의 `detail`은 "종료된 행사에서는 이 작업을 할 수 없습니다."다(#282에서 신청 전용 문장을 바꿨다). 클라이언트는 `code`로 분기한다.

### 체크인 객체

```json
{
  "checkInId": "…",
  "participantId": "…",
  "status": "CHECKED_IN",
  "method": "QR",
  "checkedInAt": "2027-01-15T01:42:00Z",
  "checkedInByUserId": "…",
  "checkedInByDisplayName": "김OO",
  "cancelledAt": null,
  "cancelledByUserId": null,
  "cancelledByDisplayName": null,
  "cancelReason": null
}
```

`status`는 `CHECKED_IN` 또는 `CANCELLED`다. 참가자당 한 행이고 처음 체크인할 때 생긴다. 취소 뒤 다시 체크인하면 같은 `checkInId`가 다시 `CHECKED_IN`이 되고 `checkedIn…`이 새 값, `cancelled…`·`cancelReason`은 `null`이 된다. 지난 값은 이력에 남는다. 처리자 참조는 업무와 같이 `users.id`와 이름만이다(DEC-060). 운영자에서 제거돼도 남는다.

### QR 값

`SCENE-CI1.` + base64url(패딩 없음, 참가자 id 16바이트 ‖ HMAC-SHA256(`scene.checkin.code-secret`, `checkin|1|{eventId}|{participantId}|0`) 앞 16바이트)이다. 서버는 값을 저장하지 않는다. 판정은 접두사 → base64url → 길이 32바이트 → 그 행사의 참가자 → 서명 비교(상수 시간) 순이다. 어느 단계에서 틀려도 `404 RESOURCE_NOT_FOUND`이고 어디서 틀렸는지 구분하지 않는다. 로그에 값을 남기지 않는다.

비밀값은 환경 변수 `SCENE_CHECKIN_CODE_SECRET`이다. 비어 있으면 어떤 값도 맞지 않아 QR 체크인은 모두 `404`다. 수동 체크인은 그대로 된다. 바꾸면 이미 보여 준 QR이 모두 무효가 되므로 행사 기간에 바꾸지 않는다.

### `GET /api/v1/participant/check-in`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 쿠키가 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`다. 운영자 세션 쿠키로는 열리지 않는다. 대상은 세션의 행사·참가자뿐이다.

`200`

```json
{ "status": "AVAILABLE", "code": "SCENE-CI1.…", "checkedIn": false, "checkedInAt": null }
```

| `status` | 경우 | `code` |
|---|---|---|
| `AVAILABLE` | 행사 `ACTIVE`, `SUBMITTED` 신청 있음 | 값 |
| `NOT_STARTED` | 행사 `DRAFT` | `null` |
| `ENDED` | 행사 `ENDED`·`ARCHIVED` | `null` |
| `NOT_ELIGIBLE` | `SUBMITTED` 신청 없음(철회) | `null` |

행사 상태를 먼저 본다. `DRAFT`·`ENDED`·`ARCHIVED`면 신청 상태와 상관없이 `NOT_STARTED`·`ENDED`다. `ACTIVE`일 때만 `SUBMITTED` 신청을 보고 `AVAILABLE`·`NOT_ELIGIBLE`을 가린다.

같은 참가자는 몇 번을 받아도, 세션을 새로 열어도 같은 `code`다. 값에는 이름·전화·접근 키·세션 토큰이 없다. `checkedIn`은 지금 체크인 행의 `status`가 `CHECKED_IN`인지이고, `checkedInAt`은 그때의 체크인 시각이다. 체크인한 적이 없거나 취소됐으면 `false`·`null`이다. 두 값은 `status`와 상관없이 채운다(끝난 행사에서도 도착 여부를 보여 준다).

조회는 audit을 남기지 않고 `code`를 로그에 남기지 않는다.

비밀값(`SCENE_CHECKIN_CODE_SECRET`)이 비어 있으면 `AVAILABLE`이어야 할 때 `404 RESOURCE_NOT_FOUND`다. 쓸 수 없는 값을 보여 주지 않으려는 것이고, 운영자 QR 체크인이 `404`인 것과 맞춘다. 새 ErrorCode는 만들지 않는다. `NOT_STARTED`·`ENDED`·`NOT_ELIGIBLE`은 값이 없으므로 그대로 `200`이다.

### `GET /api/v1/operator/events/{eventId}/check-ins/summary`

```json
{ "eventStatus": "ACTIVE", "total": 120, "checkedIn": 87, "notCheckedIn": 33 }
```

`total`은 `SUBMITTED` 신청이 있는 참가자 수다. `checkedIn`은 그중 `CHECKED_IN`인 수다. 취소는 미완료다.

### `GET /api/v1/operator/events/{eventId}/check-in-roster`

쿼리: `q`(선택), `checkedIn`(`true`·`false`, 선택), `page`, `size`([목록](#목록)과 같음). 대상은 `SUBMITTED` 신청이 있는 참가자다. 순서는 이름, 그다음 참가자 id다.

`q`는 앞뒤 공백을 자르고 1–50자다. 공백뿐이거나 길면 `400 VALIDATION_FAILED`이고 필드는 `q`다. `checkedIn`이 `true`·`false`가 아니면 필드는 `checkedIn`이다. `%`·`_`는 일반 글자로 찾는다. 숫자 정확히 4개면 전화 끝 4자리가 같거나 이름에 그 글자가 든 참가자, 그 밖에는 이름에 든 참가자다(대소문자 무시). 끝 4자리 검색은 `CHECKIN_WRITE`가 없으면 이름만 본다.

항목:

```json
{
  "participantId": "…",
  "applicationId": "…",
  "name": "김",
  "cohort": "94",
  "phoneLast4": "1234",
  "checkIn": { "checkInId": "…", "status": "CHECKED_IN", "method": "MANUAL", "checkedInAt": "…", "checkedInByDisplayName": "김OO" }
}
```

- `applicationId`는 그 참가자의 가장 최근 `SUBMITTED` 신청이다. 화면은 이 id로 [신청 원본](#get-apiv1operatoreventseventidapplicationsapplicationid)을 연다.
- `cohort`는 `SUBMITTED` 신청의 SYSTEM `COHORT` 답 `value.text`다. 없거나 꺼져 있으면 `null`이다.
- `phoneLast4`는 `CHECKIN_WRITE`가 있을 때만 값이 있고, 없으면 `null`이다. `CONTACT_VIEW`는 남기지 않는다. 전체 전화는 이 응답에 없다.
- `checkIn`은 한 번도 체크인하지 않았으면 `null`이다.

### `POST /api/v1/operator/events/{eventId}/check-ins`

CSRF와 `Idempotency-Key` 헤더(1–100자)가 필요하다. 헤더가 없거나 길이가 틀리면 `400 VALIDATION_FAILED`이고 필드는 `Idempotency-Key`다.

```json
{ "mode": "QR", "code": "SCENE-CI1.…" }
```

```json
{ "mode": "MANUAL", "participantId": "…" }
```

`mode`가 없거나 다른 값이거나, 그 `mode`의 필드가 없으면 `400 VALIDATION_FAILED`다. 필드는 `mode`, `code`, `participantId` 중 하나다. `participantId`가 UUID가 아니어도 `400`이다. 없는 참가자·틀린 QR은 `404 RESOURCE_NOT_FOUND`다. `SUBMITTED` 신청이 없으면 `409 INVALID_STATE_TRANSITION`이고 확장 필드 `reason`은 `APPLICATION_NOT_SUBMITTED`다.

`200`

```json
{
  "result": "CHECKED_IN",
  "participant": { "participantId": "…", "name": "김", "cohort": "94" },
  "checkIn": { "checkInId": "…", "status": "CHECKED_IN", "…": "체크인 객체" }
}
```

| `result` | 경우 | 기록 |
|---|---|---|
| `CHECKED_IN` | 체크인한 적 없거나 `CANCELLED`였다 | `checkins` 생성·갱신, `checkin_logs` `CHECKED_IN`, audit `CHECKIN_CREATED` |
| `ALREADY_CHECKED_IN` | 이미 `CHECKED_IN`이다 | 없음. `checkIn`은 처음 체크인 그대로 |

두 운영자가 같은 참가자를 동시에 체크인하면 먼저 커밋한 쪽이 `CHECKED_IN`, 다른 쪽이 `ALREADY_CHECKED_IN`이다.

### `POST /api/v1/operator/events/{eventId}/check-ins/{checkInId}/cancel`

CSRF와 `Idempotency-Key`가 필요하다. 본문은 `{ "reason": "…" }`이고 생략할 수 있다. `reason`은 앞뒤 공백을 자르고 200자 이하다. 넘으면 `400 VALIDATION_FAILED`이고 필드는 `reason`이다. 자른 뒤 비면 `null`로 저장한다. 철회된 신청이어도 취소는 된다. 그 행사의 체크인이 아니면 `404 RESOURCE_NOT_FOUND`다.

`200` 본문은 `{ "result", "checkIn" }`이다.

| `result` | 경우 | 기록 |
|---|---|---|
| `CANCELLED` | `CHECKED_IN`이었다 | `checkins` 갱신, `checkin_logs` `CANCELLED`, audit `CHECKIN_CANCELLED` |
| `ALREADY_CANCELLED` | 이미 `CANCELLED`다 | 없음 |

### 같은 `Idempotency-Key`

키는 행사 안에서 `checkin_logs`에 남긴다. 같은 키가 이미 기록을 만들었으면 다시 처리하지 않고 그 기록의 결과(`CHECKED_IN`·`CANCELLED`)와 지금 체크인 객체를 돌려준다. 그 키가 다른 참가자나 다른 동작에 쓰였으면 `409 CONFLICT`다. 기록을 만들지 않은 결과(`ALREADY_…`)는 키를 남기지 않고 상태로 다시 판정한다.

### `GET /api/v1/operator/events/{eventId}/check-in-logs?participantId=…`

`CHECKIN_WRITE`가 필요하다. `participantId`는 필수다. 없거나 UUID가 아니면 `400 VALIDATION_FAILED`(필드 `participantId`)다. 그 행사 참가자가 아니면 `404 RESOURCE_NOT_FOUND`다. 항목은 `{ "logId", "checkInId", "action", "method", "actorUserId", "actorDisplayName", "reason", "createdAt" }`이고 `action`은 `CHECKED_IN`·`CANCELLED`, 순서는 최신부터다. `page`·`size`는 [목록](#목록)과 같다. 전체 감사는 기존 `GET /audit-logs`(`AUDIT_LOG_READ`)다.

### 감사 로그

`CHECKIN_CREATED`, `CHECKIN_CANCELLED`. detail은 `checkInId`, `participantId`, `method`(취소는 `null`), `reason`(체크인은 `null`)이다. actor는 처리한 운영자다. `ALREADY_…` 결과는 남기지 않는다.

## 조 편성

> 작업본(편성판, 조, 배정, 조장)은 [#299](https://github.com/BeomhyunPark/SCENE/issues/299), 공개·공개본 조회·참가자 내 조는 [#300](https://github.com/BeomhyunPark/SCENE/issues/300)에서 서버에 열었다(컨트롤러 `event/group/GroupController`·`ParticipantGroupController`, 스키마 `V13__groups.sql`·`V14__group_publications.sql`). 정책은 [DEC-072](../../docs/product/PRODUCT_DECISIONS.md)와 DEC-040~048이다.

운영자가 조를 만들고 참가자를 넣는 **작업본**과, 공개할 때 한 번에 찍는 **공개본**(스냅샷)이 따로 있다. 작업본 저장은 참가자에게 보이지 않는다. 참가자와 조장은 가장 최근 공개본만 본다.

대상 참가자("활성 참가자")는 그 행사에 `SUBMITTED` 신청이 있는 참가자다. 신청이 없는 참가자는 작업본 활성 명단·미배정 수·공개본 조회·조장 명단에서 읽을 때마다 빠진다(DEC-044). 배정 행은 지우지 않는다. 신청 철회 경로가 생기면 그 경로가 배정을 지우고 이력에 남긴다.

| 동작 | 권한 |
|---|---|
| 편성판(작업본) 조회 | 유효한 `GROUP_WRITE`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 조 만들기·고치기·지우기·순서, 배정, 조장, 공개 | 유효한 `GROUP_WRITE` |
| 공개본 조회(운영자) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |

기본 역할 중 `GROUP_WRITE`는 `OWNER`만 갖는다. 편성 담당에게는 [권한 개별 설정](#put-apiv1operatoreventseventidoperatorsuseridpermissions)으로 GRANT한다. 공간 역할만으로는 쓰지 못한다.

쓰기의 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → 버전·충돌(`409`) → 참가 자격·규칙(`409`) → 결과(`200`)다. 읽기는 행사 상태로 막지 않는다. 쓰기는 행사 행을 잠그고 처리해 같은 행사의 쓰기가 차례로 커밋된다.

| 행사 상태 | 편집·공개 |
|---|---|
| `DRAFT`, `ACTIVE` | 가능 |
| `ENDED` | `409 EVENT_ENDED` |
| `ARCHIVED` | `409 EVENT_ARCHIVED` |

`Idempotency-Key`는 읽지 않는다. 배정은 [이미 목적지면 성공](#post-apiv1operatoreventseventidgroup-assignments), 공개는 [같으면 `ALREADY_PUBLISHED`](#post-apiv1operatoreventseventidgroupspublish)라서 같은 요청을 다시 보내도 두 번 반영되지 않는다. 결과를 모르면 편성판을 다시 읽어 확인한다(DEC-047).

### 버전

- `boardVersion`: 행사당 하나. 작업본이 실제로 바뀔 때마다(조 추가·이름·삭제·순서, 배정, 조장) 1 오른다. 공개는 올리지 않는다. 처음은 0이다.
- 조 `version`: 조마다. 이름 변경과 조장 변경에 1 오른다. 배정은 조 `version`을 올리지 않는다.

### `GET /api/v1/operator/events/{eventId}/group-board`

`200`

```json
{
  "eventStatus": "ACTIVE",
  "boardVersion": 42,
  "groups": [
    { "groupId": "…", "name": "1조", "sortOrder": 0, "version": 3 }
  ],
  "participants": [
    {
      "participantId": "…",
      "applicationId": "…",
      "name": "김",
      "cohort": "94",
      "gender": { "optionId": "opt_female", "label": "여" },
      "attendance": "FULL",
      "middleGroup": "청년1부",
      "cell": "다윗셀",
      "newcomer": true,
      "groupId": "…",
      "leader": false,
      "publishedGroupId": "…",
      "publishedLeader": false,
      "slotIds": ["opt_d1_dinner", "opt_d1_worship", "opt_d2_breakfast"]
    }
  ],
  "withdrawn": [
    { "participantId": "…", "name": "이", "groupId": "…" }
  ],
  "publication": {
    "lastPublishedAt": "2026-12-20T09:00:00Z",
    "lastPublishedByDisplayName": "김OO",
    "lastPublishedBoardVersion": 40,
    "activeCount": 120,
    "assignedCount": 116,
    "unassignedCount": 4,
    "changedParticipantCount": 3,
    "groupChanges": 1,
    "hasUnpublishedChanges": true
  },
  "slots": [
    { "slotId": "opt_d1_dinner", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)", "meal": "DINNER", "label": "저녁", "sortOrder": 0 },
    { "slotId": "opt_d1_worship", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)", "meal": "WORSHIP", "label": "집회", "sortOrder": 1 },
    { "slotId": "opt_d2_breakfast", "day": 2, "date": "2027-01-23", "dayLabel": "1월 23일 (토)", "meal": "BREAKFAST", "label": "아침", "sortOrder": 2 }
  ]
}
```

- `participants`는 활성 참가자 전원이고 순서는 이름, 그다음 참가자 id다. 페이지는 없다. 전화·접근 키는 없다. `applicationId`는 답을 읽은 가장 최근 `SUBMITTED` 신청이고, 화면은 이 id로 신청 원본을 연다.
- `cohort`는 `SUBMITTED` 신청의 `COHORT` 답 `value.text`(앞뒤 공백 자름)다. `middleGroup`·`cell`은 `MIDDLE_GROUP`·`CELL` 답이 자유 입력이면 `value.text`(앞뒤 공백 자름), 목록 보기면 고른 보기의 지금 문구다(새가족이면 `"새가족 (등반X)"` 또는 운영자가 고친 문구). `gender`는 `GENDER` 답의 보기 id와 지금 보기 문구다. 답이 없거나 질문이 없거나 꺼져 있으면 `null`이다.
- `newcomer`는 새가족 보기(`opt_newcomer`)를 가진 보이는 질문(중그룹이 가지면 중그룹, 아니면 셀)의 답으로 정한다: 그 보기를 골랐으면 `true`, 다른 보기면 `false`, 답이 없거나 그런 질문이 없으면 `null`이고 화면은 "응답 없음"으로 묶는다. 예전 `NEWCOMER` 예/아니오 답은 읽지 않는다. 돌봄 관련 정보라 편성판에만 있다. 참가자의 내 조(`GET /participant/group`, 조장의 조원 명단 포함)와 운영자 공개본 조회에는 없다.
- `attendance`는 `ATTENDANCE` 답의 `opt_full`·`opt_partial`·`opt_worship`을 `FULL`·`PARTIAL`·`WORSHIP_ONLY`로 바꾼 값이다. 질문이 없거나 꺼져 있으면 `FULL`이다(DEC-070 §3). 질문이 켜진 뒤 들어온 신청이 아니라서 답이 없을 때도 `FULL`이다. `null`이 아니다.
- `groupId`가 `null`이면 미배정이다. `publishedGroupId`·`publishedLeader`는 가장 최근 공개본의 값이고, 공개한 적이 없거나 그 공개본에 없으면 `null`·`false`다.
- `withdrawn`은 배정 행이 남아 있지만 활성 참가자가 아닌 사람이다. `groupId`는 참고값이다. 조별 인원·미배정 수에 넣지 않는다.
- `publication`: 공개한 적이 없으면 `lastPublished…`가 `null`이다. `lastPublishedBoardVersion`은 그 공개 때의 `boardVersion`이다. `changedParticipantCount`는 활성 참가자 중 작업본과 최근 공개본의 조 또는 조장 표시가 다른 사람 수다(처음 공개 전에는 배정된 사람 수). `groupChanges`는 작업본과 최근 공개본 사이에 추가·삭제됐거나 이름 또는 `sortOrder` 값이 다른 조 수다(처음 공개 전에는 조 수). 비교는 내용으로 한다. 옮겼다가 되돌려 내용이 같으면 `boardVersion`이 올라도 변경이 없다. `hasUnpublishedChanges`는 둘 중 하나라도 0이 아니면 `true`다. 화면은 이 값으로 "미공개 변경 있음"을 보여 준다(DEC-040).
- `slots`·`slotIds`([#315](https://github.com/BeomhyunPark/SCENE/issues/315))는 각 사람이 언제 있는지를 막대로 보여 주기 위한 **참석 칸**이다. 칸은 신청서 설정의 일차별 식사·집회 표(DEC-070, 자동 질문 `MEALS`)이고, [신청 집계](#get-apiv1operatoreventseventidapplicationssummary)의 `meals.days[].slots[]`와 같은 칸·같은 순서·같은 규칙이다(서버는 같은 코드 `MealSlots`로 읽는다).
  - `slots`는 칸 정의를 일차 순, 하루 안에서는 아침 → 점심 → 저녁 → 집회 순으로 펼친 목록이다. `slotId`는 집계의 `optionId`(`MEALS` 보기 id, `opt_d<일차>_<칸>`)와 같다. `meal`은 `BREAKFAST`·`LUNCH`·`DINNER`·`WORSHIP`, `label`은 `MEALS` 보기의 지금 문구(질문이 꺼져도 그 문구, 보기가 없으면 기본 문구), `dayLabel`은 `1월 22일 (금)` 꼴, `sortOrder`는 목록 안 0부터의 위치다. 칸이 없는 날은 빠진다.
  - **`slots`가 `null`인 경우:** 신청서가 없거나 설정 카드로 만들지 않은 신청서(`fromSetup: false`), 또는 설정의 일정표에 식사·집회 칸이 하나도 없을 때. 이때 모든 참가자의 `slotIds`도 `null`이다. 빈 배열은 내지 않는다.
  - 하루짜리 행사도 그날의 칸이 있으면 `slots`가 있다(집계의 `meals`와 같다). 숙박(`lodging`)은 하루짜리 행사에서 없지만 칸과는 별개다.
  - 참석 방식 질문이 없어 `MEALS`가 만들어지지 않은 설정(부분·집회만 참석을 끈 설정)도 `slots`가 있고, 모두 전체 참석이라 모든 칸이다.
  - `slotIds`는 그 사람이 있는 칸의 `slotId`를 `slots` 순서로 담는다. **`attendance`가 `FULL`이면 모든 칸**이다. `PARTIAL`·`WORSHIP_ONLY`이면 `MEALS`에서 고른 칸만이고, 칸이 아닌 id는 버린다. 설정이 `RANGE`(DEC-074)이면 `PARTIAL`은 `ARRIVAL_SLOT` 칸부터 `DEPARTURE_SLOT` 칸까지 모든 칸이다(둘 중 하나라도 답이 없으면 `null`). 응답 모양은 같다.
  - **`slotIds: null`은 "모름"이다.** `PARTIAL`·`WORSHIP_ONLY`인데 `MEALS` 답이 없을 때(질문이 꺼졌거나 질문이 생기기 전에 낸 신청)다. 빈 배열 `[]`은 "어느 칸에도 없음"으로 구분된다. 집계의 `meals.unanswered`가 이 사람 수와 같다.
  - **조별 칸 인원은 서버가 따로 주지 않는다.** 화면이 `groupId`와 `slotIds`로 센다. 활성 참가자 전원이 편성판에 있으므로 모든 조의 같은 칸을 더하면(미배정 포함) 집계의 그 칸 `count`와 같다. 200명 × 10칸에서도 사람마다 짧은 id 몇 개라 응답이 수십 KB 안이다.
  - 참가자용 [`GET /api/v1/participant/group`](#get-apiv1participantgroup)에는 칸 값을 넣지 않는다.

### `POST /api/v1/operator/events/{eventId}/groups`

본문은 `{ "name": "1조" }`다. `name`은 앞뒤 공백을 자르고 1–50자다. 아니면 `400 VALIDATION_FAILED`(필드 `name`). 같은 행사에 같은 이름의 조가 있으면 `409 CONFLICT`다. 조는 맨 뒤에 붙는다. 행사당 조는 100개까지(잠정)이고 넘으면 `409 CONFLICT`다.

`201` 본문은 `{ "group": { 조 객체 }, "boardVersion" }`다.

### `PATCH /api/v1/operator/events/{eventId}/groups/{groupId}`

본문은 `{ "name": "…", "expectedVersion": 3 }`다. `expectedVersion`이 없으면 `400`(필드 `expectedVersion`). 그 행사의 조가 아니면 `404 RESOURCE_NOT_FOUND`. 조 `version`이 다르면 `409 CONCURRENT_MODIFICATION`이고 확장 필드 `version`이 지금 값이다. 같은 이름이 다른 조에 있으면 `409 CONFLICT`. 이름이 그대로면 아무것도 바꾸지 않고 `200`이다.

`200` 본문은 `{ "group", "boardVersion" }`다.

### `DELETE /api/v1/operator/events/{eventId}/groups/{groupId}?expectedVersion=3`

조원(철회자 포함)은 미배정이 되고 조장 표시가 풀린다. 사람마다 이력을 남긴다. 버전·없음 처리는 `PATCH`와 같다.

`200` 본문은 `{ "unassignedCount": 9, "boardVersion": 44 }`다. `unassignedCount`는 이 삭제로 미배정이 된 사람 수(철회자 포함)다. 편성판 전체의 미배정 수가 아니다. `expectedVersion`이 없거나 0 이상 정수가 아니면 `400`(필드 `expectedVersion`)이다. 지난 공개본은 그대로라, 다시 공개하기 전까지 참가자는 이 조를 계속 본다.

### `PUT /api/v1/operator/events/{eventId}/groups/order`

본문은 `{ "groupIds": ["…", "…"] }`다. 그 행사의 조 전체를 정확히 한 번씩 담아야 한다. 빠지거나 더하거나 겹치면 `409 CONFLICT`이고, 화면은 편성판을 다시 읽는다. 순서가 그대로면 `boardVersion`을 올리지 않는다. `200` 본문은 `{ "boardVersion" }`다.

### `POST /api/v1/operator/events/{eventId}/group-assignments`

여러 사람을 한 번에 옮긴다. 미배정으로 빼는 것도 같은 경로다.

```json
{
  "changes": [
    { "participantId": "…", "fromGroupId": null, "toGroupId": "…" },
    { "participantId": "…", "fromGroupId": "…", "toGroupId": null }
  ]
}
```

- `changes`는 1–200개이고 같은 `participantId`가 두 번 나오면 `400 VALIDATION_FAILED`(필드 `changes`)다. `fromGroupId`는 화면이 본 지금 조, `null`은 미배정이다. 둘 다 키가 있어야 한다.
- 그 행사의 참가자나 `toGroupId`의 조가 아니면 `404 RESOURCE_NOT_FOUND`다. `fromGroupId`는 지금 조와 비교만 하므로, 지워진 조나 모르는 id면 충돌이다.
- 사람마다 지금 조를 본다.
  - 지금 = `toGroupId`: 이미 반영됐다. 바꾸지 않는다.
  - 지금 = `fromGroupId`: 옮긴다.
  - 그 밖: 충돌이다.
- 충돌이 하나라도 있으면 **아무것도 저장하지 않고** `409 CONCURRENT_MODIFICATION`이다. 확장 필드는 `conflicts: [{ "participantId", "currentGroupId" }]`와 `boardVersion`이다. 화면은 최신 상태와 내 변경을 비교해 보여 준다(DEC-046).
- 옮기는(이미 반영 아닌) 사람이 활성 참가자가 아니면 `409 INVALID_STATE_TRANSITION`이고 확장 필드 `reason`은 `APPLICATION_NOT_SUBMITTED`, `participantIds`가 그 사람들이다. 철회자를 미배정으로 빼는 것(`toGroupId: null`)은 된다.
- 옮긴 사람은 조장 표시가 풀린다.

`200`

```json
{ "changed": 2, "alreadyApplied": 0, "boardVersion": 45 }
```

바뀐 사람이 없으면 `boardVersion`을 올리지 않는다. 바뀐 사람마다 `group_assignment_logs`에 한 줄 남긴다.

### `PUT /api/v1/operator/events/{eventId}/groups/{groupId}/leaders`

본문은 `{ "participantIds": ["…"], "expectedVersion": 3 }`다. 그 조의 조장 전체를 이 목록으로 바꾼다. 0–3명(잠정)이고 겹치거나 넘으면 `400 VALIDATION_FAILED`(필드 `participantIds`)다. 버전 처리는 조 `PATCH`와 같다. 지금 그 조의 활성 조원이 아닌 사람이 있으면 `409 CONFLICT`이고 확장 필드 `reason`은 `LEADER_NOT_MEMBER`, `participantIds`가 그 사람들이다. 목록이 그대로면 아무것도 바꾸지 않는다.

`200` 본문은 `{ "group", "leaderIds": ["…"], "boardVersion" }`다. 조장 표시가 바뀐 사람마다 이력을 남긴다.

### `POST /api/v1/operator/events/{eventId}/groups/publish`

```json
{ "expectedBoardVersion": 45, "confirmUnassigned": true }
```

`expectedBoardVersion`이 없으면 `400`(필드 `expectedBoardVersion`). `confirmUnassigned`는 생략하면 `false`다. 판정은 행사 상태 다음에 이 순서다.

1. `boardVersion`이 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`. 화면은 최신 편성판을 보여 주고 다시 확인받는다(DEC-046).
2. 공개한 적이 있고 작업본이 가장 최근 공개본과 같으면(`hasUnpublishedChanges: false`) `200`, `result: ALREADY_PUBLISHED`. 아무것도 남기지 않는다. 같은 공개 요청을 다시 보낸 경우가 여기다. 공개한 적이 없으면 이 단계를 건너뛰어 조·배정이 없어도 첫 공개가 된다.
3. 미배정 활성 참가자가 있고 `confirmUnassigned`가 `false`면 `409 CONFIRMATION_REQUIRED`, 확장 필드 `unassignedCount`(DEC-041).
4. 공개한다.

`200`

```json
{
  "result": "PUBLISHED",
  "publicationId": "…",
  "publishedAt": "2026-12-20T09:00:00Z",
  "boardVersion": 45,
  "assignedCount": 116,
  "unassignedCount": 4,
  "changedParticipantCount": 3
}
```

`ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 가장 최근 공개 값이고 `changedParticipantCount`는 0이다. `assignedCount`·`unassignedCount`는 지금 활성 참가자 기준이다. `PUBLISHED`의 `changedParticipantCount`는 직전 공개본과 비교한 값이다. `confirmUnassigned`가 불리언이 아니면 `400`(필드 `confirmUnassigned`), `expectedBoardVersion`이 0 이상 정수가 아니면 `400`(필드 `expectedBoardVersion`)이다. 공개는 `group_publications`에 한 행을 더한다. 내용은 조 id·이름·순서와 조마다 조원·조장의 참가자 id다(활성 참가자만). 이름·전화는 넣지 않는다. 같은 transaction에 audit `GROUPS_PUBLISHED`를 남긴다. 알림은 보내지 않는다(DEC-072 범위 밖). 조가 하나도 없어도 공개할 수 있고, 그러면 모두 미배정으로 보인다.

### `GET /api/v1/operator/events/{eventId}/groups/published`

가장 최근 공개본이다. [#288](https://github.com/BeomhyunPark/SCENE/issues/288) 조별 체크인 현황이 쓴다.

`200`

```json
{
  "publishedAt": "2026-12-20T09:00:00Z",
  "groups": [
    {
      "groupId": "…",
      "name": "1조",
      "leaders": [{ "participantId": "…", "name": "박" }],
      "members": [{ "participantId": "…", "name": "김", "cohort": "94", "leader": false }]
    }
  ],
  "unassigned": [{ "participantId": "…", "name": "최", "cohort": "01" }]
}
```

공개한 적이 없으면 `{ "publishedAt": null, "groups": [], "unassigned": [] }`다. `404`가 아니다. 철회자는 빠진다. 공개 뒤 새로 신청한 활성 참가자는 `unassigned`에 들어간다. 조 안의 순서는 조장 먼저, 그다음 이름이다.

### `GET /api/v1/participant/group`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 쿠키가 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`다. 대상은 세션의 행사·참가자뿐이고 가장 최근 공개본만 읽는다. 행사 상태와 상관없이 같다.

`200`

```json
{
  "status": "ASSIGNED",
  "publishedAt": "2026-12-20T09:00:00Z",
  "group": { "name": "1조", "leaders": [{ "name": "박" }] },
  "leader": true,
  "members": [{ "name": "김", "cohort": "94", "leader": false }]
}
```

| `status` | 경우 | `group` |
|---|---|---|
| `NOT_PUBLISHED` | 공개한 적이 없다 | `null` |
| `UNASSIGNED` | 공개됐지만 공개본에 내 조가 없다 | `null` |
| `ASSIGNED` | 공개본에 내 조가 있다 | 값 |
| `NOT_ELIGIBLE` | `SUBMITTED` 신청이 없다 | `null` |

- 신청을 먼저 본다. 신청이 없으면 공개 여부와 상관없이 `NOT_ELIGIBLE`이다.
- `publishedAt`은 가장 최근 공개 시각이다(`NOT_PUBLISHED`·`NOT_ELIGIBLE`은 `null`). 화면은 "마지막 갱신"으로 보여 준다(DEC-043).
- `group.leaders`는 이름만이다. 철회한 조장은 빠진다.
- `leader`는 공개본에서 내가 그 조의 조장인지다. `members`는 `leader`가 `true`일 때만 있고, 그 조의 활성 조원(나 포함)의 이름·또래·조장 표시다. 그 밖에는 `null`이다. 전화·연락처는 없다.
- 일반 참가자는 다른 조원의 이름을 받지 않는다.
- 조회는 audit을 남기지 않는다.

### 이력과 감사 로그

`group_assignment_logs`: 참가자, 이전 조, 새 조, 조장 전후, 처리자 `users.id`, 시각, 원인(`MOVE`·`LEADER`·`GROUP_DELETED`). 1차에 읽는 URL은 없다.

audit `GROUPS_PUBLISHED`: detail은 `publicationId`, `boardVersion`, `assignedCount`, `unassignedCount`, `changedParticipantCount`다. `ALREADY_PUBLISHED`는 남기지 않는다. 조·배정 편집은 audit 대신 위 이력에 남긴다.

## 회고

컨트롤러는 `event/retrospective/RetrospectiveController`다. 행사당 글 하나다(DEC-067 Follow-up 2026-11-16). `Idempotency-Key`는 읽지 않는다.

판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → version(`409`)이다.

### `GET /api/v1/operator/events/{eventId}/retrospective`

읽기는 effective `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`이다. 모든 행사 상태에서 읽는다.

`200`

```json
{ "text": "…", "version": 2, "updatedAt": "2026-11-16T03:00:00Z", "updatedByDisplayName": "Local owner" }
```

아직 저장한 적이 없으면 `{ "text": "", "version": 0, "updatedAt": null, "updatedByDisplayName": null }`다. `404`가 아니다.

### `PUT /api/v1/operator/events/{eventId}/retrospective`

```json
{ "text": "…", "expectedVersion": 0 }
```

쓰기는 effective `EVENT_UPDATE`다(행사 OWNER 기본, 개인별 GRANT 가능). `text`는 문자열이고 0~10,000자(잠정)다. 없거나 길면 `400 VALIDATION_FAILED`이고 필드는 `text`다. `expectedVersion`은 0 이상의 정수다. 없으면 필드는 `expectedVersion`이다.

행사가 `ENDED`일 때만 저장한다. `ARCHIVED`는 `409 EVENT_ARCHIVED`, `DRAFT`·`ACTIVE`는 `409 INVALID_STATE_TRANSITION`(`eventStatus`)이다. 저장된 version이 `expectedVersion`과 다르면 `409 CONCURRENT_MODIFICATION`이고 확장 필드 `version`이 지금 version이다. 처음 저장은 `expectedVersion: 0`이다.

`200` 본문은 읽기와 같다. version이 1 오른다. 저장마다 audit `EVENT_RETROSPECTIVE_UPDATED` 한 줄을 남기고 details는 `{ "version" }`뿐이다. 본문은 audit·로그·오류 응답에 넣지 않는다.

## 응답에 안 나오는 기록

일부 성공은 응답 밖에 행을 남긴다. 그 행을 읽는 URL은 없다.

### `audit_logs`

값이 실제로 바뀔 때만 남긴다. 저장하지 않은 같은 값, `NO_CHANGE`, `ALREADY_IN_STATE`, `ALREADY_DONE`, `ALREADY_OPEN`, `ALREADY_ACCEPTED`는 남기지 않는다. 권한 override가 요청과 같으면 남기지 않는다. 운영자 역할 변경은 역할이 같아도 override를 지우고 한 줄 남긴다.

| `action` | 언제 |
| --- | --- |
| `EVENT_ACTIVATE`, `EVENT_END`, `EVENT_REOPEN`, `EVENT_ARCHIVE`, `EVENT_UNARCHIVE` | 행사 상태가 실제로 옮겨질 때 |
| `EVENT_USER_ROLE_CHANGED` | 운영자 역할을 다시 쓸 때 |
| `EVENT_USER_PERMISSIONS_REPLACED` | 권한 override 내용이 바뀔 때 |
| `CHECKIN_CREATED`, `CHECKIN_CANCELLED` | 체크인·취소가 기록을 만들 때. `ALREADY_…`와 같은 키 재전송은 남기지 않는다([체크인 감사 로그](#감사-로그)) |
| `GROUPS_PUBLISHED` | 조 편성을 공개할 때. `ALREADY_PUBLISHED`는 남기지 않는다. detail은 [이력과 감사 로그](#이력과-감사-로그) |
| `APPLICATIONS_EXPORTED` | 신청자 CSV를 내려받을 때마다. detail은 `count`뿐이다([신청자 CSV](#post-apiv1operatoreventseventidapplicationsexport)) |
| `OWNER_TRANSFER_ACCEPTED` | 소유권 이전을 처음 수락할 때. 다시 수락하면 더 쓰지 않는다 |
| `EVENT_ACCESS_REVOKED` | 운영자 제거 또는 공간 탈퇴로 그 행사 접근이 끊길 때. 탈퇴에서 유지한 행사는 끊지 않는다 |
| `TASK_ASSIGNEE_CLEARED` | 그 제거 또는 탈퇴가 업무 담당을 비울 때. `DONE`과 `CANCELLED`를 포함해 담당인 업무마다 한 줄 |
| `TASK_ITEM_CHECKED`, `TASK_ITEM_UNCHECKED` | 체크 값이 바뀔 때 |
| `TASK_COMPLETED` | 업무가 `DONE`이 될 때 |
| `TASK_REOPENED` | `DONE` 업무가 다시 열릴 때 |

이름 상수는 `common/audit/AuditActions`에 있다. 업무 진행의 네 이름은 그 클래스 밖에 있고, `TaskProgressService`가 문자열로 넣는다. `OWNER_TRANSFER_ACCEPTED`도 그 클래스 밖에 있고, `OwnerTransferService`가 문자열로 넣는다. detail은 `transferId`, `toUserId`, `recipientPriorRole`, `deletedOverrides`다. actor는 받는 사람이다.

남기지 않는 명령: 로그인과 로그아웃, 초대 생성·재발송·취소·미리보기·수락, 업무 생성·수정·삭제, 탈퇴 미리보기, 막힌 탈퇴, 소유권 이전의 요청·거절·취소와 다시 수락. 업무 수정으로 `CANCELLED`가 되거나 담당이 바뀌어도 감사 로그는 없다.

담당이 비워지며 로그가 남는 경우는 운영자 제거와 공간 탈퇴다. `TASK_ASSIGNEE_CLEARED`의 detail은 `taskId`, `previousAssigneeUserId`, `reason`, `version`이다. `version`은 비운 뒤의 값이다. `reason`은 제거면 `운영자 제거`, 탈퇴면 `이탈`이다. `EVENT_ACCESS_REVOKED`의 detail은 대상 `userId`와 지워진 override인 `deletedOverrides`다. 탈퇴의 actor는 떠나는 사람이고, 운영자 제거의 actor는 그 제거를 호출한 사람이다. 유지한 행사에는 두 `action`이 없다.

### `operator_notices`

공간 소유자가 활성화, 종료, 다시 열기를 대신해서 `actedAs`가 `SPACE_OWNER_OVERRIDE`일 때만 행이 생긴다. `kind`는 `LIFECYCLE_OVERRIDE`다. 받는 사람은 그 행사의 `OWNER` 중 인수인계로 권한이 끝나지 않은 사람이다. 보관과 보관 해제는 공간 소유자의 자신의 권한이라 이 행을 만들지 않는다. 읽는 URL은 없다.

## 아직 없는 경로

다음을 이 서버에서 호출하면 제품 동작이 없다.

- 비밀번호 로그인
- SMTP. 초대 링크는 생성·다시 보내기 응답에 한 번 나오고, 메일 포트는 프로세스 메모리에만 담는다
- 체크 항목 추가
- 참가자 조회(`GET /api/v1/participant/me`·`GET /api/v1/participant/check-in`·`GET /api/v1/participant/group` 밖)
- 회비, 방, 차량
- 신청자 CSV([신청자 CSV](#post-apiv1operatoreventseventidapplicationsexport)) 밖의 Export, 공간 설정
- 행사 기간·장소·유형을 바꾸는 `PATCH`. 이름만 바꾼다
- 공간 소유권 이전의 전용 URL

`Permission` enum에 키가 있는 것은 그 업무의 API가 열렸다는 뜻이 아니다.

## 결정 문서와 다른 점

- [DEC-064](../../docs/product/PRODUCT_DECISIONS.md) Follow-up (2026-10-21)은 참가자 세션 발급, `GET /api/v1/participant/me`, `POST /api/v1/participant/auth/logout`를 Phase 3보다 앞서 MVP에 넣었다. 이 서버와 맞는다. [API Architecture](../../docs/architecture/api-architecture-v0.1.md)와 [Security](../../docs/architecture/security-privacy-v0.1.md)는 아직 Phase 3로 적는다.
- [DEC-068](../../docs/product/PRODUCT_DECISIONS.md)의 질문 유형 9종, 질문·보기 표시 조건, 신청 접수 후 잠금, 숨겨진 답 버리기는 이 서버와 맞는다(#225). 운영자 빌더(#226)와 참가자 입력 화면(#227)도 이 계약을 쓴다. 서버는 예전 `{label}`·`{fieldId, text}` 요청도 그대로 받는다.
- [DEC-067](../../docs/product/PRODUCT_DECISIONS.md)의 개발용 로그인 profile gate, 로그인 body `email`, `SCENE_SESSION`·`SCENE_PSESSION`, 로그인 시 `changeSessionId()`는 이 서버와 맞는다. `local`·`test` 밖에서는 로그인 경로가 404다. 세션에 검증된 이메일이 없으면 초대 미리보기·수락은 `403 EMAIL_NOT_VERIFIED`다.
- DEC-064는 public 세션 POST의 CSRF를 구현 때 정할 메모로 둔다. 이 서버의 public 체인은 다른 변경 요청과 같이 CSRF 쿠키 `XSRF-TOKEN`과 헤더 `X-XSRF-TOKEN`을 요구한다.
