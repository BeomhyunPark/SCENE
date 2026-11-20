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
| `PARTICIPANT_LOGIN_FAILED` | 401 | 참가자의 이름·전화번호·숫자 6자리가 맞지 않는다. 무엇이 틀렸는지 구분하지 않는다 (DEC-078) |
| `PARTICIPANT_LOGIN_LOCKED` | 429 | 그 전화번호로 연속 5번 틀려 잠겼다. `retryAfterSeconds` |
| `PARTICIPANT_PIN_WEAK` | 400 | 숫자 6자리가 아니거나 받지 않는 번호다 |
| `PARTICIPANT_PIN_CHANGE_REQUIRED` | 403 | 임시 번호로 들어온 세션이 새 번호를 정하기 전에 다른 참가자 경로를 불렀다 |
| `APPLICATION_ALREADY_EXISTS` | 409 | 같은 전화번호의 신청이 이미 있고 숫자 6자리가 맞지 않는다 |
| `EDITS_CLOSED` | 409 | 신청 수정을 받지 않는다(스위치가 꺼졌거나 행사가 `ACTIVE`가 아니다) |
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
| `CONFIRMATION_REQUIRED` | 409 | 종료나 보관 전, 미배정자가 있는 조 공개 전, 다른 미공개 변경이 있는 일정 저장하고 바로 공개 전에 경고 확인이 필요하다 |
| `EVENT_ARCHIVED` | 409 | 보관된 행사에서는 그 변경을 할 수 없다 |
| `INVITATION_ALREADY_ACCEPTED` | 409 | 다른 사용자가 이미 초대를 수락했다 |
| `TASK_VERSION_CONFLICT` | 409 | 완료·다시 열기에서 `version`이 현재와 다르다 |
| `INVALID_TASK_STATE` | 409 | 업무 상태 때문에 체크, 완료, 다시 열기를 할 수 없다 |
| `PERMISSION_OWNER_NOT_OVERRIDABLE` | 422 | 소유자의 권한은 개별 설정할 수 없다 |
| `PERMISSION_OWNER_ONLY` | 422 | `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`는 소유자만 가진다 |
| `PERMISSION_NOT_OVERRIDABLE` | 422 | `EVENT_READ`는 개별 설정으로 뺄 수 없다 |
| `RATE_LIMITED` | 429 | 공개 신청, 참가자 들어오기 실패가 IP별 한도를 넘었다 (DEC-078) |
| `HANDOVER_NOT_ACCEPTED` | 409 | 수락되지 않은 인수인계가 있어 공간 탈퇴가 막힌다 |
| `LAST_OWNER` | 409 | 마지막 소유자라 공간 탈퇴가 막힌다 |
| `OWNER_ROLE_HELD` | 409 | 소유 역할을 가진 채 공간 탈퇴가 막히거나, 운영자 역할 변경·빼기의 대상이 행사 `OWNER`다 |
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

활성 공간 `OWNER`·`ADMIN`이 행사를 만든다(DEC-077, #370). 만든 사람은 그 행사의 `OWNER`가 된다. `EVENT_CREATE` 권한 키는 없다. `Idempotency-Key`는 읽지 않는다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`다. 멤버십이 `ACTIVE`가 아니면 `403 NOT_A_MEMBER`다. 활성 `MEMBER`는 `403 FORBIDDEN`이고 행사를 만들지 않는다. 이 판정은 본문 검사보다 먼저다. `MEMBER`는 Event Owner가 운영 멤버로 추가해서 행사에 들어온다(`POST /api/v1/operator/events/{eventId}/operators`).

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
  "eventType": "RETREAT",
  "spaceId": "…",
  "spaceName": "Local space"
}
```

없는 기간·장소·유형은 `null`이다. `spaceId`·`spaceName`은 그 행사를 운영하는 조직이다(#387). 조직 멤버가 아닌 협력자도 어느 조직 행사인지 알 수 있게 둔다. 멤버·다른 행사·연락처는 없다(DEC-060). 감사 로그와 권한 override는 만들지 않는다.

### `GET /api/v1/operator/spaces/{spaceId}/events`

그 공간의 행사 목록이다. 활성 멤버만 연다. 공간 `OWNER`와 `ADMIN`은 공간의 행사를 모두 본다. 그 외는 자신이 `event_users`에 있는 행사만 본다. `sort` 허용 필드는 없다. 순서는 이름, 그다음 `eventId`다.

항목은 `{ "eventId", "name", "lifecycleStatus", "startDate", "endDate", "place", "eventType" }`다. `lifecycleVersion`은 없다.

### `GET /api/v1/operator/events`

내가 운영자로 있는 행사 목록이다(#387). 공간 멤버십과 관계없이 호출자의 `event_users` 행으로 고른다. 조직 멤버십 없이 행사만 운영하는 협력자(DEC-039, DEC-060), 조직에서 나가며 행사 접근을 유지한 사람, 다른 조직 행사에 협력자로 들어간 멤버가 자기 행사를 여기서 본다. 세션이 없으면 `401 AUTHENTICATION_REQUIRED`다. 행사가 없으면 `200`이고 `items`는 `[]`다.

- 접근이 취소된 사람(탈퇴할 때 끊긴 행사, 운영자 빼기)은 `event_users` 행이 없으므로 나오지 않는다.
- 공간 `OWNER`·`ADMIN`이 운영자 행 없이 읽을 수 있는 행사는 여기 나오지 않는다. 그 목록은 `GET /spaces/{spaceId}/events`다.
- `sort` 허용 필드는 없다. 순서는 행사 이름, 그다음 `eventId`다. `page`는 0부터, `size`는 기본 50, 최대 100이다.

`200`

```json
{
  "items": [
    {
      "eventId": "…",
      "name": "2027 겨울 수련회",
      "lifecycleStatus": "DRAFT",
      "startDate": null,
      "endDate": null,
      "place": null,
      "eventType": null,
      "spaceId": "…",
      "spaceName": "Local space",
      "eventRole": "STAFF",
      "spaceMember": false
    }
  ],
  "page": { "number": 0, "size": 50, "totalItems": 1, "totalPages": 1 }
}
```

`eventRole`은 그 행사에서 호출자의 역할(`OWNER`, `MANAGER`, `STAFF`)이다. `spaceMember`는 호출자가 그 공간의 활성 멤버인지다. `false`면 행사 전용 협력자다. 다른 운영자, 조직 멤버, 연락처는 없다(DEC-060).

### `GET /api/v1/operator/events/{eventId}`

행사 상세다. 읽기는 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`이다. 공간 소유자·관리자는 이 읽기 때문에 `event_users` 행이 생기지 않는다.

`200` 필드는 만들기 응답과 같다(`spaceId`·`spaceName` 포함). 행사 운영자 행이 있으면 공간 멤버십이 끝났어도 열린다. 행사가 없으면 `404 RESOURCE_NOT_FOUND`다. 접근이 제거되었거나 공간 멤버십이 끝났으면 `403 NOT_A_MEMBER`다. 보여 주지만 읽기 권한이 없으면 `403 FORBIDDEN`이다.

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
  "eventId": "…",
  "eventName": "Local event",
  "role": "STAFF",
  "inviterName": "Local owner",
  "expiresAt": "2026-10-14T00:00:00Z",
  "outcome": "PENDING"
}
```

수락 `200`은 `{ "outcome": "ACCEPTED", "eventId": "…", "role": "STAFF" }`다. 같은 사람이 다시 수락하면 `outcome`이 `ALREADY_ACCEPTED`다. 수락은 그 사용자를 초대의 `role`로 `event_users`에 넣는다. 공간 멤버십은 보지 않는다. 조직에서 나간 사람도 일반 수락이다(#387).

이미 그 행사의 운영자면(예: 조직에서 나가며 이 행사 접근을 유지한 사람) 초대는 `ACCEPTED`로 소비되지만 역할은 바꾸지 않는다. 응답 `role`은 수락 뒤 실제 역할이라 초대의 `role`과 다를 수 있다. 역할 변경은 행사 `OWNER`가 `PATCH /operators/{userId}`로 한다. 다시 수락할 때 그 사이 운영자에서 빠졌으면 `role`은 `null`이다. 미리보기의 `eventId`는 이메일이 맞을 때만 나온다. 수락한 뒤 화면이 그 행사를 바로 열 때 쓴다.

미리보기는 행을 바꾸지 않는다. 미리보기·수락에는 시도 한도가 없다([조직 초대](#조직-초대)도 같다). 토큰이 256비트 난수라 추측으로 맞힐 수 없고, 두 경로 모두 로그인과 CSRF 검사를 먼저 받는다. 같은 회선을 쓰는 운영진이 서로 막히지 않게 하려고 한도를 뺐다(DEC-060 Follow-up 2026-11-19, #391).

토큰이 없으면 `404 INVITATION_NOT_FOUND`다. 이 코드는 초대가 있는지 알려 주지 않는다. 세션에 검증된 이메일이 없으면 `403 EMAIL_NOT_VERIFIED`다. 있고 다르면 `403 INVITATION_EMAIL_MISMATCH`다. 다른 사람이 이미 수락했으면 `409 INVITATION_ALREADY_ACCEPTED`다. 취소는 `410 INVITATION_REVOKED`, 만료는 `410 INVITATION_EXPIRED`, 다시 보낸 이전 토큰은 `410 INVITATION_SUPERSEDED`다. 행사가 보관되었으면 `409 EVENT_ARCHIVED`다.

## 조직 초대

조직(공간) 초대다(DEC-076, #361). 계약은 [행사 초대](#초대)와 같다. 토큰 해시만 저장하고, 유효 시간은 7일이며, 같은 공간·이메일의 `PENDING`은 하나다. 새 초대나 다시 보내기는 이전 `PENDING`을 `SUPERSEDED`로 둔다. 생성과 다시 보내기의 `200` 본문만 `link`를 **한 번** 준다. 링크·토큰은 DB·audit·로그에 남지 않는다. 메일 포트는 부르지 않는다(SMTP는 범위 밖). 클래스는 `space/invitation/SpaceInvitationController`다.

**링크 구분.** 수락 화면은 행사 초대와 같은 `/operator/invitations#<token>`이다. 조직 초대 토큰은 `s.`로 시작한다(`/operator/invitations#s.…`). `.`은 base64url 문자가 아니라서 접두어 없는 행사 토큰과 겹치지 않는다. 화면은 토큰이 `s.`로 시작하면 아래 `space-invitations` 경로를, 아니면 기존 `invitations` 경로를 부른다. 기존 행사 초대 링크는 그대로다. 해시는 접두어를 포함한 토큰 전체의 SHA-256이다. `s.`로 시작하지 않는 토큰을 조직 경로에 보내거나 조직 토큰을 행사 경로에 보내면 `404 INVITATION_NOT_FOUND`다.

**권한.** 판정 순서는 공간 경로와 같다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`, `LEFT`면 `403 NOT_A_MEMBER`, 활성 멤버인데 `OWNER`·`ADMIN`이 아니면 `403 FORBIDDEN`이다(`SpaceMembership.mayInviteMembers()`). 필드 검증은 그다음이다. `ADMIN`으로 초대하는 것과 `ADMIN` 초대를 다시 보내거나 취소하는 것은 공간 `OWNER`만 한다(`mayInviteAsAdmin()`). 아니면 `403 FORBIDDEN`이다. 목록 권한은 초대 변경과 같다.

**audit.** 행사 초대와 달리 명령마다 `audit_logs` 행을 남긴다. `space_id`가 있고 `event_id`는 없다. 액션은 `SPACE_INVITATION_CREATED`·`SPACE_INVITATION_RESENT`·`SPACE_INVITATION_REVOKED`·`SPACE_INVITATION_ACCEPTED`다. 상세는 `invitationId`, `role`이고, 다시 보내기는 `previousInvitationId`, 수락은 `outcome`(`ACCEPTED`·`ALREADY_MEMBER`)과 `membership`(`CREATED`·`REACTIVATED`·`UNCHANGED`)을 더한다. 이메일·토큰·해시·링크는 없다. 이미 취소된 초대를 다시 취소하거나 `ALREADY_ACCEPTED`일 때는 남기지 않는다.

### `GET /api/v1/operator/spaces/{spaceId}/invitations`

대기(`PENDING`) 조직 초대 목록이다. `page`·`size`·순서는 행사 초대 목록과 같다(최신 순, `sort` 없음). 만료가 지난 `PENDING`도 나온다. 항목은 `{ "id", "email", "role", "status", "expiresAt" }`다. 토큰, 해시, 링크는 없다.

### `POST /api/v1/operator/spaces/{spaceId}/invitations`

```json
{ "email": "Person@Example.com", "role": "MEMBER" }
```

`email` 규칙은 행사 초대와 같다. `role`은 `MEMBER` 또는 `ADMIN`이고, 없거나 `null`이면 `MEMBER`다(1월 화면에는 역할 선택이 없다). 그 밖의 값(`OWNER`, 소문자 포함)은 `400 VALIDATION_FAILED`이고 필드는 `role`이다. 초대로 `OWNER`를 만들지 않는다.

`200`

```json
{
  "id": "…",
  "role": "MEMBER",
  "status": "PENDING",
  "expiresAt": "2026-11-26T00:00:00Z",
  "link": "/operator/invitations#s.…"
}
```

### `POST /api/v1/operator/spaces/{spaceId}/invitations/{invitationId}/resend`

본문이 없다. 행사 초대와 같다. 그 `PENDING`을 `SUPERSEDED`로 두고 같은 이메일·역할로 새 `PENDING`과 새 `link`를 준다. 초대가 그 공간에 없으면 `404 RESOURCE_NOT_FOUND`, `PENDING`이 아니면 `400 VALIDATION_FAILED`(필드 `invitationId`)다.

### `DELETE /api/v1/operator/spaces/{spaceId}/invitations/{invitationId}`

행사 초대와 같다. `PENDING`을 `REVOKED`로 바꾸고 `{ "id", "role", "status", "expiresAt" }`를 준다. 이미 `REVOKED`이면 같은 본문으로 `200`, `ACCEPTED`·`SUPERSEDED`는 `400 VALIDATION_FAILED`다.

### `POST /api/v1/operator/space-invitations/preview`

### `POST /api/v1/operator/space-invitations/accept`

본문은 `{ "token": "s.…" }`다. 세션의 검증된 이메일과 비교하는 것, 오류 코드, 판정 순서는 [행사 초대](#post-apiv1operatorinvitationsaccept)와 같다. 시도 한도는 없다. 판정 순서: 토큰 없음 `404 INVITATION_NOT_FOUND` → 세션 이메일 없음 `403 EMAIL_NOT_VERIFIED` → 이메일 다름 `403 INVITATION_EMAIL_MISMATCH` → 다른 사람이 수락함 `409 INVITATION_ALREADY_ACCEPTED`(같은 사람이면 `ALREADY_ACCEPTED`) → 취소 `410 INVITATION_REVOKED` → 다시 보냄 `410 INVITATION_SUPERSEDED` → 만료 `410 INVITATION_EXPIRED`. 행사 보관 단계는 없다.

미리보기 `200`. 행을 바꾸지 않는다.

```json
{
  "spaceName": "Local space",
  "role": "MEMBER",
  "inviterName": "Local owner",
  "expiresAt": "2026-11-26T00:00:00Z",
  "outcome": "PENDING"
}
```

`outcome`은 `PENDING`, `ALREADY_ACCEPTED`(이 사람이 이미 수락), `ALREADY_MEMBER`(대기 중인데 이미 활성 멤버)다.

수락 `200`은 `{ "outcome": "ACCEPTED", "spaceId": "…" }`다. `spaceId`는 화면이 들어간 공간을 열 수 있게 행사 초대와 달리 더 준다.

- 멤버 행이 없으면 초대의 `role`로 `ACTIVE` 행을 만든다.
- `LEFT` 행이면 같은 행을 `ACTIVE`로 바꾸고 역할을 초대의 `role`로 둔다(재가입, DEC-037).
- 이미 `ACTIVE`이면 `outcome`이 `ALREADY_MEMBER`이고 역할을 바꾸지 않는다. 초대는 `ACCEPTED`로 소비된다(역할 변경은 범위 밖).
- 같은 사람이 다시 수락하면 `ALREADY_ACCEPTED`이고 아무것도 바꾸지 않는다.
- 기존 `event_users` 행은 건드리지 않는다(DEC-039).

수락한 사람은 바로 [행사 생성](#post-apiv1operatorspacesspaceidevents)을 할 수 있고 그 행사의 `OWNER`가 된다.

## 조직 멤버

### `GET /api/v1/operator/spaces/{spaceId}/members`

활성(`ACTIVE`) 멤버 목록이다(DEC-076). 활성 멤버면 누구나 읽는다. 멤버 행이 없으면 `404 RESOURCE_NOT_FOUND`, `LEFT`면 `403 NOT_A_MEMBER`다. `page`·`size`는 공통 목록 규칙이고 `sort`는 받지 않는다. 순서는 `OWNER`·`ADMIN`·`MEMBER`, 그다음 이름(코드 포인트), 그다음 id다.

항목은 `{ "userId", "displayName", "role" }`다. 보는 사람이 활성 `OWNER`·`ADMIN`이면 `email`을 더한다. 값은 그 멤버의 마지막 Google 로그인에서 받은 검증된 이메일이다. Google 로그인이 없는 계정은 `email` 키가 없다. `MEMBER`가 보면 어떤 항목에도 `email` 키가 없다(`SpaceMembership.maySeeMemberEmails()`).

## 운영자

목록과 한 명 조회는 행사 `EVENT_READ` 또는 활성 공간 `OWNER`다. 추가, 역할 변경, 제거, 권한 교체는 행사 `OWNER`의 `EVENT_USER_MANAGE`다. 공간 역할만으로는 운영자를 바꾸지 못한다. 공간 `OWNER`는 권한 행을 읽을 수 있고, 공간 `ADMIN`은 읽지 못한다.

역할은 `OWNER`, `MANAGER`, `STAFF`다. 기본 권한은 [소스 안내의 권한 표](source-guide.md#접근과-권한)와 같다. 컨트롤러는 `event/operator/EventOperatorController`다.

등록된 권한 키는 이 이름뿐이다. 여기 없는 문자열은 `UNKNOWN_PERMISSION`이다.

`EVENT_UPDATE`, `EVENT_USER_READ`, `PARTICIPANT_READ`, `PARTICIPANT_CONTACT_READ`, `PARTICIPANT_WRITE`, `FORM_WRITE`, `APPLICATION_READ`, `APPLICATION_MANAGE`, `TASK_WRITE`, `SCHEDULE_WRITE`, `NOTICE_WRITE`, `FINANCE_READ`, `FINANCE_WRITE`, `GROUP_WRITE`, `ROOM_WRITE`, `RIDE_WRITE`, `CLASS_WRITE`, `CHECKIN_WRITE`, `MISSION_WRITE`, `GUARDIAN_WRITE`, `GUARDIAN_CONTACT_READ`, `PRIVACY_LOG_READ`, `AUDIT_LOG_READ`, `DATA_EXPORT`, `EVENT_READ`, `EVENT_LIFECYCLE`, `EVENT_USER_MANAGE`.

`OWNER`는 이 키를 모두 기본으로 가진다. `MANAGER`의 기본은 이 키 전부에서 OWNER 전용 키 `EVENT_LIFECYCLE`·`EVENT_USER_MANAGE`만 뺀 것이다(조 편성, 참가자 정보 수정, 연락처 보기, 명단 내려받기, 신청서·행사 정보 고치기 포함). 키가 새로 생기면 MANAGER도 기본으로 갖는다. `STAFF`의 기본은 `EVENT_READ`, `CHECKIN_WRITE`다(DEC-071, DEC-079 Follow-up 2026-11-20). STAFF의 그 밖의 키는 행사 `OWNER`가 사람별 `GRANT`로 주고, 특정 MANAGER에게서 빼려면 `REVOKE`한다. 기본값은 계산값이라 바뀌면 모든 행사의 기존 운영자에게 바로 적용된다. 저장된 `REVOKE`는 그대로 남는다. 일정·공지 API는 아직 없어서 `SCHEDULE_WRITE`·`NOTICE_WRITE`로 열리는 경로는 지금 없다. 키가 있다고 그 업무의 API가 열려 있는 것은 아니다. 지금 HTTP가 `PermissionEvaluator`로 보는 키는 `EVENT_READ`, `EVENT_UPDATE`, `FORM_WRITE`, `TASK_WRITE`, `CHECKIN_WRITE`, `DATA_EXPORT`, `EVENT_USER_MANAGE`다. 신청자 CSV는 `DATA_EXPORT`다. 행사 이름 변경은 `EVENT_UPDATE`다. 신청서 쓰기는 `FORM_WRITE`다. 신청 읽기는 `APPLICATION_READ`가 아니라 `EVENT_READ`다. 행사 상태 변경은 그 키 대신 행사 역할 `OWNER`와 공간 역할 `OWNER`를 본다. `EVENT_LIFECYCLE`은 소유자 전용이라 다른 역할에 `GRANT`되지 않는다.

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

`role`은 `MANAGER` 또는 `STAFF`만이다. 이 경로로 `OWNER`를 부여하지 않는다. 요청한 역할이 지금과 같아도 그 사람의 개별 권한 행은 지워지고 역할은 다시 써진다. 대상이 행사 `OWNER`면 자기 자신이어도 `409 OWNER_ROLE_HELD`이고 아무것도 바꾸지 않는다. Owner 변경은 위임·인수인계(DEC-033)로만 한다. 보관된 행사는 `409 EVENT_ARCHIVED`다. `200`은 한 명 조회와 같다.

검사 순서는 `FORBIDDEN`, 없는 운영자 `404`, `role` 검증 `400`, 행 잠금 뒤 대상 역할로 `409 OWNER_ROLE_HELD`, `409 EVENT_ARCHIVED`다. Owner 판정은 보관 여부와 관계없는 규칙이라 보관 검사보다 앞에 둔다.

### `DELETE /api/v1/operator/events/{eventId}/operators/{userId}`

운영자 행을 제거한다. 성공은 `200`이고 본문이 없다. 그 사람이 담당인 업무의 `assigneeUserId`는 비워지고 업무 `version`이 1 증가한다. 없는 운영자는 `404`다. 대상이 행사 `OWNER`면 자기 자신이어도 `409 OWNER_ROLE_HELD`이고 행·업무·감사 기록을 바꾸지 않는다. 판정은 행 잠금 뒤 역할로 한다. Owner가 빠지는 길은 위임·인수인계(DEC-033)와 수락된 인수인계 뒤의 공간 탈퇴뿐이다.

### `GET /api/v1/operator/events/{eventId}/operators/{userId}/permissions`

행사 `OWNER`, 활성 공간 `OWNER`, 또는 자기 자신만 읽는다.

`200`

```json
{
  "userId": "…",
  "role": "MANAGER",
  "roleDefaults": ["CHECKIN_WRITE", "EVENT_READ", "NOTICE_WRITE", "SCHEDULE_WRITE", "TASK_WRITE"],
  "overrides": { "grants": [], "revokes": [] },
  "effective": ["CHECKIN_WRITE", "EVENT_READ", "NOTICE_WRITE", "SCHEDULE_WRITE", "TASK_WRITE"]
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

`grants`와 `revokes`는 둘 다 필수 배열이다. 빈 배열도 된다. 역할 기본값에 이미 있는 키의 `GRANT`와 기본값에 없는 키의 `REVOKE`는 저장하지 않는다. 화면(운영 멤버의 "권한", DEC-079)은 지금 `overrides`를 바탕으로 보이는 키만 바꿔 보낸다. 모르는 키는 `UNKNOWN_PERMISSION`, 같은 요청 안의 중복은 `DUPLICATE_PERMISSION`이다. 이 둘은 `errors[]`의 `code`다.

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
  "setup": null,
  "completionNotice": null
}
```

`completionNotice`는 신청을 마친 사람에게 보이는 완료 안내다(참가비 계좌, 문의처, 다음에 할 일). 없으면 `null`이다. 아래 `PUT …/completion-notice`로 쓴다.

`setup`은 마지막으로 저장한 신청서 설정이다(아래 `PUT …/setup`의 본문 모양에 `generatedFor`가 붙는다). 저장한 적이 없으면 `null`이다.

`locked`는 그 신청서에 `SUBMITTED` 신청이 하나라도 있으면 `true`다. 이때 아래 잠금 규칙이 적용된다. 공개 신청서에는 이 키가 없다.

그 행사의 신청서가 아니면, 권한보다 먼저 `404 RESOURCE_NOT_FOUND`다.

### `PATCH /api/v1/operator/events/{eventId}/forms/{formId}`

```json
{ "acceptingApplications": true, "acceptingEdits": true }
```

두 boolean 중 하나 이상을 받는다. 다른 키는 `400`이다. `acceptingApplications`는 신청 받기, `acceptingEdits`는 "신청 수정 받기"다([DEC-078](../../docs/product/PRODUCT_DECISIONS.md) §6, 기본 켜짐). `true`는 행사가 `ACTIVE`일 때만 된다. 아니면 `409 INVALID_STATE_TRANSITION`이다. `false`는 상태와 상관없이 된다. `200`은 상세다. 상세와 목록에도 `acceptingEdits`가 있다. 수정은 행사가 `ACTIVE`이고 `acceptingEdits`일 때만 받는다. 행사가 끝나면 스위치와 상관없이 닫힌다.

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

### `PUT /api/v1/operator/events/{eventId}/forms/{formId}/completion-notice`

완료 안내를 쓰거나 지운다([#406](https://github.com/BeomhyunPark/SCENE/issues/406), DEC-070 Follow-up 2026-11-19). 유효한 `FORM_WRITE`가 필요하다. 그 행사의 신청서가 아니면, 권한보다 먼저 `404 RESOURCE_NOT_FOUND`다.

```json
{ "completionNotice": "참가비 3만원은 12월 31일까지 보내 주세요.\n신한 110-000-000000 (예금주 홍길동)\n문의: 010-0000-0000" }
```

- `completionNotice`만 받는다. 키가 꼭 있어야 하고 값은 문자열이나 `null`이다. 다른 키, 빠진 키, 다른 타입은 `400 VALIDATION_FAILED`(`errors[0].field`가 그 키)다.
- **글자 그대로의 텍스트다.** CRLF와 CR은 LF로 바꾸고, 앞뒤 공백·빈 줄은 자른다. 안의 줄바꿈·탭·HTML 태그·링크는 그대로 저장하고 그대로 돌려준다. 서버는 HTML을 해석하거나 지우지 않고, 화면도 HTML로 그리지 않는다(링크도 누르는 링크로 바꾸지 않는다).
- 자른 뒤 1000자(유니코드 코드 포인트)까지다. 넘거나, 줄바꿈·탭이 아닌 제어 문자가 있으면 `400 VALIDATION_FAILED`(`completionNotice`)다. 자른 뒤 비면 `null`로 저장한다(안내 없음).
- **잠기지 않는다.** `SUBMITTED` 신청이 있어도(`locked`가 `true`여도) 고칠 수 있다. 행사 상태와 신청 받기 여부와도 상관없다. 이미 신청한 사람은 다음에 읽을 때 새 문구를 본다(아래 참가자 홈).
- `200`은 신청서 상세다. `Idempotency-Key`는 읽지 않는다. audit은 남기지 않는다.

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
- `attendance.noLodging`(통근자 숙박 제외, DEC-074 Follow-up 2026-11-17)은 **없어도 된다**: 저장된 값을 쓰고, 없으면 `false`다. 응답의 `setup.attendance.noLodging`에는 늘 있다. `true`이고 행사가 이틀 이상이며 `RANGE`이거나 참석 방식 질문이 없으면 `NO_LODGING`(`MULTI_CHOICE`, 보기 `opt_no_lodging` "수련회장에서 숙박하지 않아요" 하나, 선택, `minSelect` 0)이 `LODGING` 자리(도착·출발 뒤, `MEALS` 앞)에 생긴다. 참석 방식 질문이 있으면 `ATTENDANCE ∈ {opt_full, opt_partial}`일 때만 보인다. 답은 `{ "optionIds": ["opt_no_lodging"] }`이다. 신청이 들어온 뒤에도 켜고 끌 수 있다.
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

`operation`은 운영 정보다(#335, DEC-075). 참가 현황 표의 `rows[].operation`과 같다. `answers`는 바뀌지 않는 원본이다.

`answers`는 필드 position 순이다. 받은 답만 있고, 답이 없는 질문은 빠진다. `answerType`·`hidden`·`config`는 그 질문의 **현재** 값이다(운영자 신청서 상세의 필드와 같은 모양). 화면은 이것으로 선택형 답의 `optionId`를 지금 보기 문구로 바꾸고, 숨긴 질문(`hidden: true`)과 숨긴 보기(`config.options[].hidden: true`)에 "(숨김)"을 붙인다(DEC-068 §6). `value` 모양은 DEC-068 §1을 따른다.

한 건 조회와 참가 현황 표의 행에는 `revision`(1부터)과 `participantId`가 있다. `SUPERSEDED` 신청도 한 건 조회로 읽는다(변경 전 답).

한 건 조회의 `withdrawal`은 그 신청이 참가자의 마지막 revision이고 `WITHDRAWN`일 때 `{ "withdrawnAt", "withdrawnByDisplayName", "reason", "reapplyBlocked" }`이고, 아니면 `null`이다([신청 취소와 되돌리기](#신청-취소와-되돌리기)). `reason`은 운영자 화면에만 보인다.

### `GET /api/v1/operator/events/{eventId}/applications/{applicationId}/revisions`

그 신청의 참가자가 낸 모든 revision이다. 권한은 한 건 조회와 같다. 최신이 먼저다. 신청자 알림(I3)과 변경 전후 화면이 읽는다.

```json
{
  "items": [
    {
      "applicationId": "…",
      "revision": 2,
      "status": "SUBMITTED",
      "submittedAt": "2026-12-17T00:00:00Z",
      "revisedBy": "PARTICIPANT",
      "revisedByUserId": null,
      "changes": [
        { "key": "NAME", "fieldId": "…", "label": "이름" },
        { "key": "FIELD", "fieldId": "…", "label": "참석 일정" }
      ]
    },
    { "applicationId": "…", "revision": 1, "status": "SUPERSEDED", "submittedAt": "…", "revisedBy": null, "revisedByUserId": null, "changes": [] }
  ]
}
```

`revisedBy`는 첫 신청이면 `null`, 참가자가 고쳤으면 `PARTICIPANT`, 운영자가 고쳤으면 `OPERATOR`(A12, 아직 없음)다. `changes`는 바뀐 질문을 그 revision을 저장할 때의 질문 제목으로 담는다. 이름이 바뀌었으면 `key: NAME`이다. 답 값은 없다. 변경 전후 값은 각 `applicationId`의 한 건 조회로 읽는다(연락처 규칙도 그대로).

### `POST /api/v1/operator/events/{eventId}/participants/{participantId}/pin-reset`

참가자의 숫자 6자리를 초기화한다([DEC-078](../../docs/product/PRODUCT_DECISIONS.md) §2). 본문은 없다(`{}`도 된다). CSRF가 필요하다. effective `PARTICIPANT_WRITE`가 필요하다. 판정은 404(행사·참가자) → 403 → 409 `EVENT_ARCHIVED`다.

`200`, `Cache-Control: no-store`

```json
{ "temporaryPin": "583920" }
```

임시 번호는 이 응답에서 한 번만 나온다. 서버는 해시만 저장한다. 같은 transaction에서 그 참가자의 세션을 모두 지우고, 그 전화의 잠금을 푼다. audit `PARTICIPANT_PIN_RESET`(detail `{ "participantId" }`)을 남긴다. 번호는 audit·로그에 없다. 참가자는 이름·전화번호·임시 번호로 들어와 새 번호를 정한다(`pinChangeRequired`).

### `PUT /api/v1/operator/events/{eventId}/applications/{applicationId}/operation`

운영 정보 저장(#335, DEC-075). 1차는 운영 메모 하나다. **참가자가 낸 답(`answers`)은 바꾸지 않는다.** CSRF가 필요하고 `Idempotency-Key`는 읽지 않는다.

```json
{ "memo": "토요일 저녁 잠시 외출 후 복귀", "expectedVersion": 0 }
```

- 순서는 404 → 403 → 400 → 409 상태 → 409 version이다.
- 행사·신청이 없으면 `404 RESOURCE_NOT_FOUND`.
- 쓰기는 effective `PARTICIPANT_WRITE`다(행사 OWNER·MANAGER 기본, STAFF는 개인별 GRANT). 공간 `OWNER`·`ADMIN`이라는 것만으로는 못 쓴다. 아니면 `403 FORBIDDEN`.
- `memo`는 문자열, 0~2,000자(잠정)다. 빈 글은 메모를 지운다. 없거나 길면 `400 VALIDATION_FAILED`(필드 `memo`). `expectedVersion`은 0 이상의 정수다(필드 `expectedVersion`). 처음 저장은 `0`이다.
- `ARCHIVED` 행사는 `409 EVENT_ARCHIVED`다. `DRAFT`·`ACTIVE`·`ENDED`에서 쓴다(ENDED는 기록 정정, DEC-051). 신청이 `SUBMITTED`가 아니면 `409 INVALID_STATE_TRANSITION`이고 확장 필드 `applicationStatus`가 붙는다.
- 저장된 version이 다르면 `409 CONCURRENT_MODIFICATION`이고 확장 필드 `version`이 지금 version이다.

`200`

```json
{ "memo": "토요일 저녁 잠시 외출 후 복귀", "version": 1, "updatedAt": "2026-12-20T03:00:00Z", "updatedByDisplayName": "김운영" }
```

저장마다 audit `APPLICATION_OPERATION_UPDATED` 한 줄을 남기고 details는 `{ "applicationId", "version", "fields": ["memo"] }`다. 메모 본문은 audit·로그·오류 응답에 넣지 않는다. 누가 언제 고쳤는지는 응답의 `updatedAt`·`updatedByDisplayName`과 audit 행으로 남는다. 참가자 경로(`/api/v1/participant/**`)와 CSV에는 운영 정보가 없다.

### 신청 취소와 되돌리기

운영자가 신청을 취소(`WITHDRAWN`)하고 되돌린다([DEC-084](../../docs/product/PRODUCT_DECISIONS.md)). 컨트롤러는 `ApplicationWithdrawalController`, 서비스는 `ApplicationWithdrawalService`다. 둘 다 CSRF가 필요하고 `Idempotency-Key`는 읽지 않는다(다시 보내도 `ALREADY_…`로 끝난다).

- 권한은 effective `PARTICIPANT_WRITE`다(운영 메모·6자리 초기화와 같다). 조 배정을 지우지만 `GROUP_WRITE`는 보지 않는다.
- 판정 순서는 404(행사·신청) → 403 → 400 → 409 행사 상태 → 409 신청 상태다.
- 행사가 `DRAFT`·`ACTIVE`일 때만 된다. `ENDED`는 `409 EVENT_ENDED`, `ARCHIVED`는 `409 EVENT_ARCHIVED`다.
- 경로의 `applicationId`가 기대값이다. 그 사이 참가자가 고쳐 그 행이 `SUPERSEDED`가 됐으면 `409 CONCURRENT_MODIFICATION`이고 확장 필드 `applicationId`·`status`·`revision`이 그 참가자의 지금(마지막) revision이다.

#### `POST /api/v1/operator/events/{eventId}/applications/{applicationId}/withdraw`

```json
{ "reason": "가족 사정으로 못 와요", "blockReapply": false }
```

본문은 없어도 된다. `reason`은 선택이고 앞뒤 공백을 자른 뒤 200자까지다(빈 글은 없음). 문자열이 아니거나 길면 `400 VALIDATION_FAILED`(필드 `reason`). `blockReapply`는 선택 불리언이다(기본 `false`, 필드 `blockReapply`).

같은 transaction에서:

1. 참가자의 지금 `SUBMITTED` 행을 `WITHDRAWN`으로 바꾼다. 새 revision은 없다. 답·이전 revision·운영 메모·체크인 기록은 그대로다.
2. 작업본 조 배정 행을 지우고 `group_assignment_logs`에 cause `WITHDRAWN`을 남긴다. `boardVersion`이 오르고, 조장이었으면 그 조의 `version`도 오른다. 공개본은 그대로이고 읽을 때 빠진다. 그 사람이 가장 최근 공개본에 있었으면 참가자 갱신 값 `updates.group`(DEC-080 §4)이 오른다(다른 조원의 조장 이름·명단이 바뀌므로).
3. 그 참가자의 세션을 모두 지운다.
4. `blockReapply: true`면 6자리를 아무도 모르는 값으로 바꾼다(같은 전화의 재신청이 6자리로 돌아오지 못한다).
5. `application_status_logs`에 `WITHDRAWN`(사유, 처리자, 시각, `block_reapply`)을 남긴다.
6. audit `APPLICATION_WITHDRAWN`, detail `{ "applicationId", "participantId", "groupRemoved", "reasonGiven", "blockReapply" }`. **사유 본문은 audit·로그·오류 본문에 없다.**

`200`

```json
{
  "result": "WITHDRAWN",
  "applicationId": "…",
  "participantId": "…",
  "withdrawal": { "withdrawnAt": "…", "withdrawnByDisplayName": "김운영", "reason": "가족 사정으로 못 와요", "reapplyBlocked": false },
  "removedGroup": { "groupId": "…", "name": "1조", "leader": true },
  "checkedInAt": "2027-01-22T09:10:00Z"
}
```

- 이미 취소된 행이면 `result: ALREADY_WITHDRAWN`이고 아무것도 더하지 않는다(`removedGroup`은 `null`, `withdrawal`은 그때의 기록).
- `removedGroup`은 이 요청이 지운 배정이다. 미배정이었으면 `null`이다.
- `checkedInAt`은 남겨 둔 도착 체크인 시각이다(없으면 `null`). 현황·명단·QR·수동 체크인에서는 이미 빠졌다.

취소된 사람은 `SUBMITTED`만 읽는 모든 곳에서 바로 빠진다: 신청 집계(식수·숙박·이동), 조 편성판의 활성 명단·미배정 수(편성판 `withdrawn[]`에 "이전 조"와 함께 나온다), 공개본 조회·참가자 내 조·조장 이름, 체크인 현황·명단·QR·수동 체크인(`409 INVALID_STATE_TRANSITION`, `reason: APPLICATION_NOT_SUBMITTED`), CSV, 참가 현황 표의 `rows`(따로 `withdrawn[]`), 참가자 들어오기(`401 PARTICIPANT_LOGIN_FAILED`), 남은 참가자 쿠키(`401 AUTHENTICATION_REQUIRED`). 이 일치는 `ApplicationWithdrawalHttpIT`가 묶는다.

#### `POST /api/v1/operator/events/{eventId}/applications/{applicationId}/restore`

본문은 없다. 그 참가자의 **마지막 revision이 `WITHDRAWN`인 행**만 되돌린다. 같은 행을 `SUBMITTED`로 바꾸고 `application_status_logs`에 `RESTORED`, audit `APPLICATION_RESTORED`(`{ "applicationId", "participantId" }`)를 남긴다. 부분 유일 색인에 걸리면(같은 참가자의 다른 `SUBMITTED`) `409 CONFLICT`다.

`200`

```json
{
  "result": "RESTORED",
  "applicationId": "…",
  "participantId": "…",
  "previousGroup": { "groupId": "…", "name": "1조" },
  "reapplyBlocked": false,
  "checkedInAt": null
}
```

- 이미 `SUBMITTED`면 `result: ALREADY_SUBMITTED`이고 다른 값은 `null`·`false`다.
- **조 배정은 돌아오지 않는다**(DEC-044). 되돌린 사람은 미배정이다. `previousGroup`은 마지막 취소 때의 조이고, 그 조가 지워졌으면 `null`이다. 참고로만 보여 준다.
- 공개본도 마찬가지다. 공개본을 읽는 모든 곳(운영자 공개본, 참가자 내 조·조장 이름·조원, 편성판의 공개 비교)은 그 공개 뒤에 취소로 배정이 지워진 사람을 스냅샷에서 뺀다. 되돌린 사람은 다음 공개 전까지 공개본의 `unassigned`이고 내 조는 `UNASSIGNED`다.
- 체크인 기록은 지우지 않았으므로 도착 체크인한 사람은 도착이 다시 센다.
- 세션은 돌아오지 않는다. 참가자는 이름·전화번호·6자리로 다시 들어온다. `reapplyBlocked`가 `true`면 6자리가 무효이므로 [6자리 초기화](#post-apiv1operatoreventseventidparticipantsparticipantidpin-reset)를 해 줘야 들어온다.

#### 운영자 알림이 붙을 자리 (I3)

취소·되돌리기·재신청 복귀는 모두 `ApplicationStatusChanges.record(...)`를 지난다. 이곳이 `application_status_logs` 한 행과 Spring 이벤트 `ApplicationStatusChanged`(`spaceId`, `eventId`, `participantId`, `applicationId`, `action` `WITHDRAWN`/`RESTORED`, `actorKind` `OPERATOR`/`PARTICIPANT`, `actorUserId`, `at`)를 같은 transaction에서 낸다. 아직 받는 곳은 없다. I3는 이 이벤트로 `APPLICATION_CANCELLED`·`APPLICATION_RESTORED` 알림 행을 만든다(사유는 넣지 않는다, 처리한 운영자 본인은 빼고).

### `POST /api/v1/operator/events/{eventId}/applications/export`

신청자 명단 CSV를 내려받는다(#233). 본문은 없다. CSRF가 필요하다. `Idempotency-Key`는 읽지 않는다. 컨트롤러는 같은 `OperatorApplicationController`이고 서비스는 `ApplicationExportService`다.

권한은 그 행사의 effective `DATA_EXPORT`다(DEC-054). 행사 `OWNER`·`MANAGER`는 기본으로 갖고(DEC-079 Follow-up 2026-11-20), `STAFF`는 개인별 `GRANT`로 받는다. 개별 `REVOKE`된 MANAGER, `EVENT_READ`만 있는 운영자, 행사 역할 없는 공간 `OWNER`·`ADMIN`은 `403 FORBIDDEN`이다. 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`)이다. 다른 공간의 행사는 `404 RESOURCE_NOT_FOUND`다. 행사 상태로 막지 않는다(`ARCHIVED` 포함, DEC-061). 실패는 다른 경로와 같은 problem JSON이다.

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
  - 보이는 `NO_LODGING`에서 `opt_no_lodging`을 체크한 전체·부분 참석자는 어느 밤에도 세지 않고 `unanswered`에도 넣지 않는다(DEC-074 Follow-up 2026-11-17).
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
      "participantId": "…",
      "submittedAt": "2026-12-15T03:00:00Z",
      "answers": { "<fieldId>": { "text": "김하나" } },
      "group": { "groupId": "…", "name": "2조", "leader": false },
      "checkedInAt": null,
      "slotIds": ["opt_d1_dinner", "opt_d1_worship"],
      "operation": { "memo": "토 저녁 잠시 외출", "version": 1, "updatedAt": "…", "updatedByDisplayName": "김운영" }
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
- `participantId`는 조 편성판·`group-assignments`가 쓰는 참가자 id다. 서랍에서 조를 바꿀 때 쓴다(#335).
- `operation`은 운영 정보다(#335, DEC-075). 모양은 [운영 정보 저장](#put-apiv1operatoreventseventidapplicationsapplicationidoperation)의 응답과 같고, 저장된 것이 없으면 `{ "memo": "", "version": 0, "updatedAt": null, "updatedByDisplayName": null }`이다. 표를 읽을 수 있으면 모두 본다. `answers`는 언제나 참가자가 낸 원본이다.
- `withdrawn`은 취소된 신청자다(DEC-084 §9). `rows`와 따로 있어 표의 어떤 숫자에도 들어가지 않는다. 최근 취소가 먼저다. 화면은 기본으로 숨기고 "취소 N"으로 연다.

```json
"withdrawn": [
  {
    "applicationId": "…",
    "participantId": "…",
    "name": "나래",
    "submittedAt": "…",
    "withdrawal": { "withdrawnAt": "…", "withdrawnByDisplayName": "김운영", "reason": "가족 사정", "reapplyBlocked": false },
    "previousGroup": { "groupId": "…", "name": "1조" },
    "checkedInAt": null
  }
]
```

  `previousGroup`은 취소가 지운 조이고, 조가 지워졌거나 `groupVisible`이 `false`면 `null`이다. 전화·답은 없다. 사유는 운영 메모처럼 표를 읽는 운영자 모두 본다.

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

`answers`와 `pin`만 받는다(아래). 각 항목은 `fieldId`와 `text` 또는 `value` 중 하나다. `text`는 글 질문의 줄임으로 `value: { "text" }`와 같다. 유형별 `value`는 다음과 같고, 저장되는 답 값(`answers.value`)도 같은 모양이다.

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

`pin`은 참가자가 정한 숫자 6자리다([DEC-078](../../docs/product/PRODUCT_DECISIONS.md)). 화면이 두 번 받아 비교하고 서버에는 한 값을 보낸다. 숫자 6개가 아니거나, 같은 숫자 반복(`000000`), 1씩 오르거나 내리는 숫자(`123456`, `654321`), 이 신청의 전화번호 숫자에 들어 있는 6자리면 `400 PARTICIPANT_PIN_WEAK`다. 답 검사가 먼저이고, 답이 맞을 때 번호를 본다. 서버는 bcrypt 해시만 저장한다. `pin`은 응답·로그·오류 본문에 다시 나오지 않는다.

```json
{ "answers": [ … ], "pin": "730914" }
```

**처음 신청**이면 `201`이다. `Location` 헤더는 없다.

```json
{ "applicationId": "…", "participantId": "…", "revision": 1, "revised": false, "completionNotice": "참가비 3만원은 …", "restored": false }
```

`completionNotice`는 제출한 순간의 완료 안내다(없으면 `null`). 신청 완료 화면이 글자 그대로 보인다. **공개 신청서 `GET`에는 싣지 않는다.** 신청을 마친 사람만 보게 하려는 것이다(#406). 재신청(수정) 응답에도 같은 값이 있다.

**같은 전화번호의 신청이 이미 있으면**(전화번호의 숫자만 비교한다) 번호가 맞을 때만 그 신청의 수정이 된다(새 revision, [참가자 신청](#참가자-신청)과 같은 저장). `200`이고 `revised: true`다. 이름이 달라도 수정이다. 수정이 닫혀 있으면 `409 EDITS_CLOSED`다. 번호가 틀리면 `409 APPLICATION_ALREADY_EXISTS`이고 이전 답은 본문에 없다. 이 실패는 그 전화의 [잠금](#post-apiv1publiceventseventidparticipant-sessions) 횟수에 들어가고, 잠겨 있으면 `429 PARTICIPANT_LOGIN_LOCKED`다. 바뀐 답이 없으면 revision을 만들지 않고 지금 신청을 돌려준다.

**그 전화의 신청이 취소돼 있으면**([DEC-084](../../docs/product/PRODUCT_DECISIONS.md) §5) 번호가 맞을 때 다시 신청한 것으로 돌아온다. `200`이고 `revised: true`, `restored: true`다. 답이 바뀌었으면 새 revision을 만들고 취소된 행은 `SUPERSEDED`가 된다. 답이 같으면 취소된 행이 다시 `SUBMITTED`가 된다. 신청 받기(`acceptingApplications`)만 보고 신청 수정 스위치는 보지 않는다. 조 배정은 돌아오지 않는다. `application_status_logs`에 `RESTORED`(처리자 `PARTICIPANT`)가 남고 audit는 없다. 번호가 틀리면(운영자가 "다시 신청 막기"로 취소한 경우 포함) 위와 같은 `409 APPLICATION_ALREADY_EXISTS`다. 응답의 `restored`는 그 밖에는 `false`다.

두 경우 모두 `Set-Cookie`로 참가자 세션(`SCENE_PSESSION`)이 열린다. 신청 직후 화면은 바로 들어간 상태다. 접근 키는 더 만들지 않는다.

**요청 제한(#401).** 같은 IP의 신청 POST가 10분에 1,000번을 넘으면 `429 RATE_LIMITED`다. 성공·실패를 모두 센다. 한 IP 뒤에 200명이 있어도 걸리지 않는 남용 방지선이다. IP는 nginx가 넘기는 `X-Forwarded-For`(Cloudflare의 `CF-Connecting-IP`)다. 숫자는 `scene.participant.*` 설정이다. 숫자는 홈서버 `.env`의 `SCENE_PARTICIPANT_*`로 배포 없이 바꾼다([홈서버 운영](../../docs/devops/home-server.md)).

## 참가자 세션

### `POST /api/v1/public/events/{eventId}/participant-sessions`

CSRF가 필요하다.

```json
{ "name": "김하늘", "phone": "010-1234-5678", "pin": "730914" }
```

세 키만 받는다. 다른 키나 문자열이 아닌 값은 `400 VALIDATION_FAILED`다. 이름은 앞뒤 공백을 자르고 가운데 공백을 하나로 모아 지금 이름(마지막 revision의 이름)과 비교한다. 전화번호는 숫자만 비교한다. 행사가 없으면 `404 RESOURCE_NOT_FOUND`다.

| 경우 | 응답 |
| --- | --- |
| 세 값이 맞고 그 참가자에게 `SUBMITTED` 신청이 있다 | `204`. `Set-Cookie` `SCENE_PSESSION` |
| 이름·전화번호·번호 중 하나라도 틀리거나, 그 전화의 신청이 없다 | `401 PARTICIPANT_LOGIN_FAILED`. 무엇이 틀렸는지 구분하지 않는다 |
| 그 전화번호로 연속 5번 틀렸다(신청이 없는 번호도 똑같이 센다) | 잠금 동안 `429 PARTICIPANT_LOGIN_LOCKED`. 본문 `retryAfterSeconds`. 24시간 안의 첫 잠금 5분, 두 번째 30분, 세 번째부터 24시간. 맞히거나 운영자가 6자리를 초기화하면 처음으로 돌아간다. 맞히면 0으로 돌아간다 |
| 같은 IP의 실패가 10분에 300번을 넘었다 | `429 RATE_LIMITED` |

쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax`, 경로 `/api/v1/participant`이고 `Max-Age`가 있다(브라우저를 닫아도 남는다). `Max-Age`는 아래 세션 끝 시각까지이고, 행사 끝 날짜가 없으면 180일이다(`scene.participant.cookie-max-age-without-end`). 실제로 세션이 끝났는지는 서버가 판정한다. 첫 신청·재신청 응답의 쿠키도 같다. 값은 세션 토큰이고 서버는 해시만 저장한다. 세션은 로그아웃, 6자리 초기화, 또는 **행사 끝 날짜+8일 0시(Asia/Seoul)**에 끝난다. 끝 날짜가 없는 행사는 로그아웃까지다. 끝난 세션은 `401 AUTHENTICATION_REQUIRED`다. **세션은 그 참가자에게 `SUBMITTED` 신청이 있는 동안만 유효하다**(DEC-084 §4). 신청이 취소되면 세션 행도 지우지만, 조회 자체가 이것을 함께 보므로 모든 참가자 경로(`ParticipantSessionCookie.require()`·`requireAny()`)가 한곳에서 `401`로 끝난다.

시도 횟수와 잠금은 서버 메모리에 있다. 서버가 다시 뜨면 0부터 센다. 예전 `{ "accessKey" }` 본문은 받지 않는다(`400 VALIDATION_FAILED`, DEC-078 §7).

### `GET /api/v1/participant/me`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다.

`200`

```json
{ "participantId": "…", "eventId": "…", "spaceId": "…", "name": "김", "pinChangeRequired": false }
```

`pinChangeRequired`가 `true`면 운영자가 초기화한 임시 번호로 들어온 세션이다. 이때는 이 경로, [번호 정하기](#put-apiv1participantpin), 로그아웃만 되고 다른 참가자 경로는 `403 PARTICIPANT_PIN_CHANGE_REQUIRED`다.

쿠키가 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`다. 운영자 세션 쿠키로는 열리지 않는다. 전화와 번호는 없다.

### `PUT /api/v1/participant/pin`

CSRF가 필요하다. 새 번호를 정한다.

```json
{ "currentPin": "730914", "newPin": "481207" }
```

임시 번호로 들어온 세션(`pinChangeRequired: true`)은 `currentPin`을 생략한다. 그 밖에는 필수이고, 틀리면 `401 PARTICIPANT_LOGIN_FAILED`이며 잠금 횟수에 들어간다. `newPin`은 신청 때와 같은 규칙이다(`400 PARTICIPANT_PIN_WEAK`). 성공은 `204`다. 그 참가자의 다른 세션은 끊고 이 세션은 남긴다.

### 참가자 세션으로 완료 안내 읽기

[`GET /api/v1/participant/home`](#get-apiv1participanthome)의 `completionNotice`가 세션 행사의 신청서에 있는 **지금** 완료 안내다(제출 때 받은 값이 아니다). 아래 [참가자 홈·갱신 확인·알림](#참가자-홈갱신-확인알림)을 본다.

### `POST /api/v1/participant/auth/logout`

CSRF가 필요하다. 그 쿠키의 세션 행만 지우고, 같은 속성에 `Max-Age=0`인 `Set-Cookie`로 쿠키를 지운다. `204`이고 본문이 없다. 쿠키가 없거나 모르는 값이면 지울 행이 없고 역시 `204`다. 다른 참가자의 세션은 남는다.

## 참가자 신청

참가자 세션으로 자기 신청을 읽고 고친다([DEC-078](../../docs/product/PRODUCT_DECISIONS.md) §4). 화면(A5)은 아직 없다.

### `GET /api/v1/participant/application`

`200`

```json
{
  "applicationId": "…",
  "formId": "…",
  "revision": 2,
  "submittedAt": "2026-12-16T00:00:00Z",
  "acceptingEdits": true,
  "fields": [ … ],
  "answers": [{ "fieldId": "…", "value": { "text": "김하늘" } }]
}
```

`fields`는 [공개 신청서](#get-apiv1publiceventseventidformsformid)와 같은 모양이다(숨긴 질문·보기는 빠진다). `answers`는 지금(`SUBMITTED`) revision의 답 가운데 숨기지 않은 질문의 답이고, 모양은 저장 값(`answers.value`)과 같다. `acceptingEdits`는 행사가 `ACTIVE`이고 신청서의 `acceptingEdits`가 켜져 있을 때 `true`다. 신청이 없으면(취소 등) `404 RESOURCE_NOT_FOUND`다.

### `PUT /api/v1/participant/application`

CSRF가 필요하다.

```json
{ "expectedRevision": 2, "answers": [ … ] }
```

`answers`는 공개 신청 POST와 같은 규칙으로 검사한다. 전화번호는 숫자가 지금과 같아야 한다(다르면 `400 APPLICATION_VALIDATION_FAILED`). 숨긴 질문의 이전 답은 그대로 옮긴다. 수정이 닫혀 있으면 `409 EDITS_CLOSED`다. `expectedRevision`이 지금과 다르면 `409 CONCURRENT_MODIFICATION`이고 본문 `revision`이 지금 값이다. 성공은 `200`이고 본문은 `GET`과 같다. 바뀐 답이 없으면 revision을 만들지 않는다.

저장: 새 `applications` 행(`SUBMITTED`, `revision` +1, `previous_application_id`, `revised_by: PARTICIPANT`, `changes`)을 만들고 이전 행을 `SUPERSEDED`로 바꾼다. 운영 메모는 새 행으로 옮긴다. 조 배정·체크인은 참가자에 붙어 있어 그대로다. 집계·편성판·CSV·참가 현황 표·체크인 명단은 `SUBMITTED`만 읽어 새 답을 쓴다. 이름이 바뀌면 `participants.name`도 바뀐다.

## 참가자 홈·갱신 확인·알림

참가자 화면의 홈 머리, 주기 확인, 화면 안 알림이다([DEC-080](../../docs/product/PRODUCT_DECISIONS.md), [#423](https://github.com/BeomhyunPark/SCENE/issues/423)). 화면 규칙(탭·카드·확인 주기·지금·다음 일정 계산)은 [계약 초안](../../docs/architecture/participant-home-contract.md) §1·§2·§5·§6에 있다.

네 경로 모두 참가자 세션 쿠키가 필요하다. 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`, 임시 번호 세션은 `403 PARTICIPANT_PIN_CHANGE_REQUIRED`다. 대상은 세션의 행사·참가자뿐이다. 응답은 `Cache-Control: no-store`이고 audit을 남기지 않는다. 행사 상태로 막지 않는다. 컨트롤러는 `event/home/ParticipantHomeController`, `event/notification/ParticipantNotificationController`다.

### `GET /api/v1/participant/home`

`200`

```json
{
  "event": {
    "eventId": "…",
    "name": "2027 청년부 겨울수련회",
    "status": "ACTIVE",
    "startDate": "2027-01-22",
    "endDate": "2027-01-24",
    "place": "양평 ○○수양관",
    "timeZone": "Asia/Seoul"
  },
  "participant": { "name": "김", "applicationStatus": "SUBMITTED" },
  "completionNotice": "참가비 계좌: …\n문의: …",
  "features": { "schedule": true, "notices": true, "groups": true, "rooms": true, "mealOrder": false },
  "updates": { "…": "아래 updates와 같은 객체" }
}
```

- `event.status`는 `DRAFT`·`ACTIVE`·`ENDED`·`ARCHIVED`다. `startDate`·`endDate`·`place`는 없으면 `null`이다. `timeZone`은 설정 `scene.participant.zone`(기본 `Asia/Seoul`)이다.
- `participant.name`은 지금 이름이다. `applicationStatus`는 `SUBMITTED` 또는 `NONE`(지금 `SUBMITTED` 신청이 없음)이다. 실제로는 `SUBMITTED` 신청이 없으면 세션 조회가 먼저 `401`이므로(DEC-084 §4) `NONE`은 나오지 않는다.
- `completionNotice`는 신청서(행사당 하나)의 **지금** 완료 안내 문자열이고 없으면 `null`이다. 모양은 [`PUT …/completion-notice`](#put-apiv1operatoreventseventidformsformidcompletion-notice)와 같고 글자 그대로 그린다.
- `features`: 행사 유형이 `RETREAT`·`CAMP`면 `schedule`·`notices`·`groups`·`rooms`, 그 밖과 유형 없음은 `schedule`·`notices`만 켠다. `mealOrder`는 유형 기본값으로 켜지 않는다: 식사 순서는 1월 범위 밖이라(DEC-086 보류, 2026-11-20) **1월에는 쓰지 않는다. 키는 응답에 남는다**(늘 `false`). 그와 상관없이 그 영역의 갱신 값(아래 `participant_feed_versions`)이 0보다 크면(무엇이든 공개된 적이 있으면) 켠다. 운영자가 저장하는 값(I5)은 아직 없다.
- 전화·숫자 6자리·접근 키·다른 참가자 정보는 없다.

### `GET /api/v1/participant/updates`

화면이 주기적으로 불러 바뀐 카드만 다시 읽는다. 200명이 30초마다 부르므로 한 요청이 SQL 네 문장(세션 확인, `participant_feed_versions` 한 행, 알림 요약, 내 체크인·신청 revision)만 읽는다. 공개본·공지·일정 테이블은 읽지 않는다.

`200`

```json
{
  "home": 3, "schedule": 12, "notices": 7, "group": 2, "rooms": 0, "mealOrder": 0,
  "checkIn": 1, "application": 2,
  "notifications": { "latestSeq": 5821, "unreadCount": 2 },
  "pollAfterSeconds": 30,
  "serverTime": "2027-01-22T05:30:12Z"
}
```

| 키 | 범위 | 오르는 때(지금 서버) |
| --- | --- | --- |
| `home` | 행사 | 행사 이름 변경(`PATCH …/events/{eventId}`), 상태 전이(`ALREADY_IN_STATE` 제외), 완료 안내 저장 |
| `group` | 행사 | 조 편성 공개가 `PUBLISHED`일 때만(`ALREADY_PUBLISHED`·작업본 저장은 아님) |
| `schedule` | 행사 | 일정표 공개가 `PUBLISHED`일 때만(저장하고 바로 공개 포함. `ALREADY_PUBLISHED`·작업본 저장은 아님, [일정표](#일정표)) |
| `notices` | 행사 | 참가자에게 보이는 공지의 발행·수정·고정·보관·보관 해제([공지](#공지)의 갱신 값 표). `DRAFT` 저장과 대상이 `STAFF`뿐인 공지는 오르지 않는다 |
| `rooms`·`mealOrder` | 행사 | 아직 오르는 경로가 없다(숙소가 만든다). `mealOrder`는 1월에는 쓰지 않는다(식사 순서 보류). 키는 남고 늘 0이다 |
| `checkIn` | 참가자 | 내 `checkin_logs`의 최대 `seq`(체크인·취소). 없으면 0 |
| `application` | 참가자 | 내 신청의 최대 `revision`. 없으면 0 |
| `notifications.latestSeq` | 참가자 | 내 알림의 최대 `seq`. 없으면 0 |
| `notifications.unreadCount` | 참가자 | 읽지 않은 내 알림 수. 100에서 멈춘다 |

- 값은 같은지만 비교한다. 행사 범위 값은 같은 행사의 모든 참가자에게 같다.
- 값은 각 변경과 **같은 트랜잭션**에서 오른다. 변경이 실패하면 값도 오르지 않는다.
- `pollAfterSeconds`는 설정 `scene.participant.poll-after-seconds`(기본 30, 10–300 밖은 가까운 끝으로 맞춘다. 홈서버 `.env`의 `SCENE_PARTICIPANT_POLLAFTERSECONDS`)다.
- 요청 로그는 경로·상태·시간만 남긴다(`RequestIdFilter`). 참가자 조회 경로에는 IP 제한이 없다.

### `GET /api/v1/participant/notifications?before={seq}&limit=30`

`200`

```json
{
  "items": [
    {
      "notificationId": "…",
      "seq": 5821,
      "kind": "NOTICE_PUBLISHED",
      "target": { "type": "NOTICE", "id": "…" },
      "title": "새 공지",
      "body": "내일 아침 집회 장소가 바뀌었어요",
      "important": true,
      "count": 1,
      "createdAt": "2027-01-22T05:30:00Z",
      "readAt": null
    }
  ],
  "unreadCount": 2,
  "nextBefore": 5790
}
```

- `seq` 내림차순이다. `before`(양의 정수)가 있으면 그보다 작은 `seq`만 준다. `limit`은 1–50, 기본 30. 벗어나거나 숫자가 아니면 `400 VALIDATION_FAILED`(필드 `before`·`limit`).
- `nextBefore`는 더 있으면 다음 요청의 `before`, 없으면 `null`이다. `unreadCount`는 100에서 멈춘다. 조회만으로 읽음 처리하지 않는다.
- `kind`·`target.type`의 값은 [계약 초안 §7.2](../../docs/architecture/participant-home-contract.md)다. 지금 서버에서 참가자 알림을 만드는 경로는 공지(`NOTICE_PUBLISHED`·`NOTICE_UPDATED`, [공지](#공지))와 일정표 공개(`SCHEDULE_PUBLISHED`·`SCHEDULE_CHANGED`, [일정표](#일정표))다(조 공개 알림은 B5가 만든다). 화면은 모르는 `kind`를 받으면 `title`·`body`만 보이고 누를 수 없게 한다.
- `count`는 합쳐진 수다. 같은 받는 사람에게 같은 `kind`·같은 `target`의 읽지 않은 알림이 있으면 그 행을 지우고 새 행(`seq` 새로, `count` = 이전 + 1)을 넣는다. 읽은 알림은 합치지 않는다.

### `POST /api/v1/participant/notifications/read`

CSRF가 필요하다. 본문은 셋 중 정확히 하나다.

```json
{ "notificationIds": ["…"] }
{ "target": { "type": "NOTICE", "id": "…" } }
{ "upToSeq": 5821 }
```

- `notificationIds`: 1–50개 UUID. 내 알림이 아닌 id는 조용히 건너뛴다(응답이 같다).
- `target`: `type`(1–32자)과 `id`(UUID, 또는 일정 `SCHEDULE`처럼 id가 없는 대상이면 `null`. `id` 키는 빠질 수 없다). 그 대상을 가리키는 내 알림을 모두 읽음으로 한다.
- `upToSeq`: 1 이상의 정수. 그 `seq` 이하의 내 알림을 모두 읽음으로 한다.
- 키가 없거나 둘 이상이면 `400 VALIDATION_FAILED`(필드 `body`). 다른 키나 잘못된 값은 그 키가 필드다. 본문이 객체가 아니면 필드 `body`.
- 이미 읽은 알림은 `readAt`을 바꾸지 않는다. `200` 본문은 `{ "unreadCount": 0 }`이다.

### 저장

`V20__participant_feed_and_notifications.sql`.

- `participant_feed_versions`: 행사당 한 행(`space_id`, `event_id` 기본 키), 열 `home`·`schedule`·`notices`·`groups`·`rooms`·`meal_order`·`updated_at`. 처음 오를 때 만든다. 행이 없으면 모두 0이다. 마이그레이션 때 이미 조 편성 공개본이 있는 행사는 `groups`를 공개본 수로 채웠다(`features.groups`가 꺼지지 않게).
- `notifications`: 참가자·운영자 알림 한 테이블. `recipient_kind`가 `PARTICIPANT`면 `recipient_participant_id`, `OPERATOR`면 `recipient_user_id`만 있다. `title` 80자, `body` 200자, `count` ≥ 1, `seq`는 전체에서 늘어나는 번호. 색인은 참가자 목록·참가자 미읽음(부분 색인)·운영자 목록·대상(`event_id`, `target_type`, `target_id`). 보존은 행사 데이터와 같다.
- 둘 다 DB에만 있다. 서버 메모리에 두는 값은 없다.
- 운영자 알림 경로(`GET·POST /operator/events/{eventId}/notifications…`, `GET …/updates`)와 `operator_notices` 이전은 아직 없다(I3, 계약 초안 §7.5·§7.6).

## 공지

운영자가 쓰는 공지와 참가자가 보는 공지 목록이다([DEC-082](../../docs/product/PRODUCT_DECISIONS.md)와 그 Follow-up 2026-11-20, [#434](https://github.com/BeomhyunPark/SCENE/issues/434)). 화면 규칙(작성 흐름, "수정됨" 표시, 운영진 공지 카드, 공유 문구)은 [계약 초안](../../docs/architecture/notice-contract.md)에 남아 있다. 컨트롤러는 `event/notice/NoticeController`(운영자)와 `ParticipantNoticeController`(참가자)다.

### 공지 객체 (운영자)

```json
{
  "noticeId": "6f1c…",
  "title": "내일 아침 집회 장소 변경",
  "body": "소강당이 아니라 대강당입니다.\n7시 50분까지 모여 주세요.",
  "important": true,
  "pinned": false,
  "audience": [{ "type": "ALL" }],
  "status": "PUBLISHED",
  "version": 4,
  "firstPublishedAt": "2027-01-22T12:00:00Z",
  "publishedAt": "2027-01-22T12:00:00Z",
  "editedAt": "2027-01-22T12:20:00Z",
  "archivedAt": null,
  "createdByDisplayName": "김OO",
  "updatedByDisplayName": "이OO",
  "updatedAt": "2027-01-22T12:20:00Z"
}
```

| 필드 | 규칙 |
| --- | --- |
| `title` | 필수. 앞뒤 공백을 자르고 1–100자 |
| `body` | 필수. 앞뒤 공백을 자르고 1–5,000자. 일반 글이다. 줄바꿈은 그대로 두고 HTML·마크다운을 해석하지 않는다 |
| `important` | 불리언, 기본 `false` |
| `pinned` | 불리언, 기본 `false`. 행사당 `PUBLISHED`이면서 고정인 공지는 3개까지. `DRAFT`의 값은 발행할 때 적용할 값이다. 보관하면 `false`가 된다 |
| `audience` | 필수. 정확히 한 항목 `[{ "type": "ALL" }]`이고 `type`은 `ALL`·`LEADERS`·`STAFF` 중 하나. 다른 키(`ids` 등)는 받지 않는다 |
| `status` | `DRAFT`·`PUBLISHED`·`ARCHIVED` |
| `version` | 실제로 바뀔 때마다 1 오른다. 처음은 1. 같은 값 저장과 `ALREADY_…`는 그대로다 |
| `firstPublishedAt` | 처음 발행한 시각. 다시 바뀌지 않는다. 발행한 적이 없으면 `null` |
| `publishedAt` | 목록 순서의 기준 시각. 처음 발행 때 정하고 수정·보관·보관 해제로 바뀌지 않는다 |
| `editedAt` | **발행된 뒤** 제목·본문·중요·대상을 고친 마지막 시각. 발행 전 수정·고정·보관은 바꾸지 않는다. 없으면 `null` |
| `archivedAt` | 보관한 시각. 보관 해제하면 `null` |
| `createdByDisplayName`, `updatedByDisplayName`, `updatedAt` | 처음 쓴 사람, 마지막으로 바꾼 사람과 그 시각(상태 명령 포함) |

### 권한과 판정 순서

| 동작 | 권한 |
| --- | --- |
| 목록·상세(모든 상태·대상) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN`. 기본 역할로는 OWNER·MANAGER·STAFF 모두 |
| 만들기·고치기·지우기·발행·보관·보관 해제 | 유효한 `NOTICE_WRITE`. 기본 역할로는 OWNER·MANAGER. 개별 `REVOKE`하면 막힌다 |

행사 상태: `DRAFT`·`ACTIVE`·`ENDED`에서 쓴다(`ENDED`의 후속 공지, DEC-051). `ARCHIVED` 행사의 쓰기는 `409 EVENT_ARCHIVED`(`eventStatus`)다. 읽기는 행사 상태로 막지 않는다.

쓰기의 판정 순서: 행사 없음 `404`·접근 끊김 `403 NOT_A_MEMBER` → 권한 `403 FORBIDDEN` → 본문 `400` → 행사 상태 `409` → 공지 없음 `404` → (상태 명령만) 이미 그 상태면 `200 ALREADY_…` → 버전 `409 CONCURRENT_MODIFICATION` → 상태·고정 규칙 `409` → 결과. 쓰기는 행사 행을 잠근다. 같은 행사의 공지 쓰기는 하나씩 커밋된다.

### 오류

| 경우 | 응답 |
| --- | --- |
| 필드 형식·길이, `audience` 모양, 쿼리 값 | `400 VALIDATION_FAILED`, `errors[0].field`(`title`·`body`·`important`·`pinned`·`audience`·`publish`·`notify`·`expectedVersion`·`status`·`limit`·`before`). 본문이 JSON 객체가 아니면 필드 `body` |
| 그 행사의 공지가 아님 | `404 RESOURCE_NOT_FOUND` |
| `expectedVersion`이 지금과 다름 | `409 CONCURRENT_MODIFICATION`, 확장 필드 `notice`: `{ "noticeId", "status", "version", "updatedAt", "updatedByDisplayName" }`. 제목·본문은 오류 본문에 넣지 않는다. 화면은 상세를 다시 읽는다 |
| 보관된 공지 고치기·발행, `DRAFT`가 아닌 공지 지우기, 보관되지 않은 공지 보관 해제 | `409 INVALID_STATE_TRANSITION`, `noticeStatus` |
| 고정 4개째 | `409 CONFLICT`, `reason: "PIN_LIMIT"`, `pinnedNoticeIds`(지금 고정된 발행 공지 id, 최근 발행 순) |
| `ARCHIVED` 행사의 쓰기 | `409 EVENT_ARCHIVED` |

```json
{
  "type": "urn:scene:problem:conflict",
  "status": 409,
  "code": "CONFLICT",
  "reason": "PIN_LIMIT",
  "pinnedNoticeIds": ["…", "…", "…"],
  "traceId": "…"
}
```

### `GET /api/v1/operator/events/{eventId}/notices?status=&audience=&before=&limit=`

- `status`: `DRAFT`·`PUBLISHED`·`ARCHIVED`를 쉼표로 여럿. 생략하면 `DRAFT,PUBLISHED`.
- `audience`: `ALL`·`LEADERS`·`STAFF`를 쉼표로 여럿. 생략하면 모두.
- 순서: 고정된 `PUBLISHED`(최근 발행 먼저) → `DRAFT`(`updatedAt` 내림차순) → 나머지(`publishedAt` 내림차순, 발행한 적 없는 보관 공지는 `updatedAt`). 같은 시각이면 `noticeId` 내림차순.
- `limit`: 1–50, 기본 30. `before`: 직전 응답의 `nextBefore`를 그대로 보낸다(형식을 해석하지 않는 문자열). 깨진 값은 `400`(필드 `before`).

`200`

```json
{
  "items": [ { "noticeId": "…", "title": "…", "status": "PUBLISHED", "…": "공지 객체" } ],
  "pinnedCount": 1,
  "nextBefore": null
}
```

`pinnedCount`는 거르기와 상관없이 그 행사의 고정된 `PUBLISHED` 공지 수다(3이면 고정 단추를 막는다). 운영자 행사 홈의 "운영진 공지" 카드는 `?status=PUBLISHED&audience=STAFF&limit=3`을 부른다.

### `GET /api/v1/operator/events/{eventId}/notices/{noticeId}`

`200` 본문은 공지 객체다. 다른 행사의 공지는 `404`.

### `POST /api/v1/operator/events/{eventId}/notices`

CSRF가 필요하다.

```json
{
  "title": "내일 아침 집회 장소 변경",
  "body": "소강당이 아니라 대강당입니다.",
  "important": false,
  "pinned": false,
  "audience": [{ "type": "ALL" }],
  "publish": true
}
```

`publish: true`면 만들면서 발행한다. 생략하거나 `false`면 `DRAFT`다. 모르는 키는 무시한다. `201`

```json
{ "notice": { "…": "공지 객체" }, "notifiedCount": 187 }
```

`notifiedCount`는 이 요청이 만든 알림 행 수다(참가자 + 운영자). `DRAFT`면 0이다.

### `PATCH /api/v1/operator/events/{eventId}/notices/{noticeId}`

```json
{ "expectedVersion": 4, "title": "집회 장소 변경 (정정)", "notify": true }
```

- 바꿀 키만 보낸다: `title`·`body`·`important`·`pinned`·`audience`. `expectedVersion`은 필수. 키를 보내며 `null`을 주면 `400`.
- `notify`(기본 `false`)는 `PUBLISHED` 공지의 **내용**(제목·본문·중요·대상)이 바뀔 때만 읽는다. `true`면 지금 대상에게 `NOTICE_UPDATED`(대상이 `STAFF`면 운영자에게 `STAFF_NOTICE_UPDATED`)를 만든다. 고정만 바꾸면 알리지 않는다.
- 값이 모두 그대로면 아무것도 바꾸지 않고 `200`(`version` 그대로, `notifiedCount` 0)이다.
- `PUBLISHED` 공지의 내용이 바뀌면 `editedAt`이 그 시각이 된다. 대상을 바꾸면 바로 반영된다(넓히면 새로 보이고, 좁히면 사라진다).
- `ARCHIVED`면 `409 INVALID_STATE_TRANSITION`. `PUBLISHED` 공지를 고정하면 고정 개수를 센다.

`200` 본문은 `{ "notice", "notifiedCount" }`다.

### `DELETE /api/v1/operator/events/{eventId}/notices/{noticeId}?expectedVersion=1`

`DRAFT`만 지운다(행 삭제). 다른 상태는 `409 INVALID_STATE_TRANSITION`(`noticeStatus`). `204`, 본문 없음.

### 상태 명령

모두 본문 `{ "expectedVersion": n }`(필수)이고 CSRF가 필요하다.

| 경로 | 바뀜 | 이미 그 상태 | 그 밖 |
| --- | --- | --- | --- |
| `POST …/notices/{noticeId}/publish` | `DRAFT` → `PUBLISHED`. `firstPublishedAt`·`publishedAt` = 지금 | `PUBLISHED`면 `ALREADY_PUBLISHED`(버전을 보지 않는다) | `ARCHIVED`는 `409 INVALID_STATE_TRANSITION`(보관 해제를 쓴다). 고정된 `DRAFT`는 고정 개수를 센다 |
| `POST …/notices/{noticeId}/archive` | `DRAFT`·`PUBLISHED` → `ARCHIVED`. `pinned` = `false` | `ARCHIVED`면 `ALREADY_ARCHIVED` | |
| `POST …/notices/{noticeId}/unarchive` | `ARCHIVED` → 발행한 적이 있으면 `PUBLISHED`(`publishedAt` 그대로, 알림 없음), 없으면 `DRAFT`. 고정은 풀린 채 | 없음 | `DRAFT`·`PUBLISHED`는 `409 INVALID_STATE_TRANSITION` |

`200`

```json
{ "result": "PUBLISHED", "notice": { "…": "공지 객체" }, "notifiedCount": 187 }
```

`result`는 `PUBLISHED`·`ALREADY_PUBLISHED`·`ARCHIVED`·`ALREADY_ARCHIVED`·`UNARCHIVED`다. `ALREADY_…`는 아무것도 쓰지 않는다(`version`·갱신 값·알림·audit 그대로).

### 갱신 값과 알림

| 일 | 참가자 `updates.notices` | 알림 | 운영자 범위 값 |
| --- | --- | --- | --- |
| `DRAFT` 만들기·고치기·지우기 | 그대로 | 없음 | +1 |
| 발행(만들며 발행 포함) | 대상이 `ALL`·`LEADERS`면 +1 | 대상의 활성 참가자에게 `NOTICE_PUBLISHED`. 대상이 `STAFF`면 작성자를 뺀 활성 운영자에게 `STAFF_NOTICE_PUBLISHED` | +1 |
| `PUBLISHED` 공지 고치기·고정 바꾸기 | 바뀌기 전이나 뒤의 대상이 참가자를 포함하면 +1 | 내용이 바뀌고 `notify: true`일 때만 `NOTICE_UPDATED`(운영자는 `STAFF_NOTICE_UPDATED`) | +1 |
| 보관 | 발행된 공지였고 대상이 참가자를 포함하면 +1 | 그 공지를 가리키는 모든 사람의 읽지 않은 알림을 읽음으로 | +1 |
| 보관 해제 | `PUBLISHED`로 돌아가고 대상이 참가자를 포함하면 +1 | 없음 | +1 |
| `ALREADY_…`, 같은 값 저장, 오류 | 그대로 | 없음 | 그대로 |

- 값·알림·audit은 변경과 **같은 트랜잭션**에서 쓴다. 변경이 실패하면 아무것도 남지 않는다.
- 받는 사람은 그 순간 정한다. "활성 참가자"는 지금 `SUBMITTED` 신청이 있는 사람이고(취소된 사람은 빠진다), `LEADERS`는 가장 최근 조 편성 공개본의 조장이다. "활성 운영자"는 그 행사에 운영자 행(`event_users`)이 있는 사람 중, 인수인계로 소유 권한이 끝난 OWNER(개별 `EVENT_READ` GRANT가 없는)를 뺀 사람이다. 운영자 제거와 공간 탈퇴는 그 행을 지우므로 빠지고, 탈퇴에서 유지한 행사의 운영자는 남는다.
- 알림 문구: `title`은 `NOTICE_PUBLISHED` "새 공지"(중요면 "중요 공지"), `STAFF_NOTICE_PUBLISHED` "운영진 공지"(중요면 "중요 운영진 공지"), `…_UPDATED` "공지 수정"(중요면 "중요 공지 수정"). `body`는 공지 제목(200자 넘으면 자른다), `important`는 공지 값, `target`은 `{ "type": "NOTICE", "id": noticeId }`. 같은 사람에게 같은 종류·같은 공지의 읽지 않은 알림이 있으면 합친다(`count` + 1).
- **운영자 범위 값**은 `notice_boards.version`이다. 대상·상태와 상관없이 실제 쓰기마다 오른다. 읽는 곳은 `NoticeBoardVersions.read(spaceId, eventId)` 하나다(기본 키 한 문장, 행이 없으면 0). 운영자 `GET …/events/{eventId}/updates`(I3)의 `notices`가 이 값을 쓴다. 그 경로는 아직 없다.

### `GET /api/v1/participant/notices?before=&limit=`

참가자 세션 쿠키가 필요하다. 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`(운영자 쿠키로는 열리지 않는다), 임시 번호 세션은 `403 PARTICIPANT_PIN_CHANGE_REQUIRED`다. 응답은 `Cache-Control: no-store`, audit 없음, 행사 상태로 막지 않는다.

`PUBLISHED`이고 내가 대상에 드는 공지만 준다: `ALL`은 활성 참가자, `LEADERS`는 가장 최근 조 편성 공개본의 활성 조장, `STAFF`는 아무도 아니다. 판정은 읽을 때마다 한다. 신청이 취소된 사람의 남은 쿠키는 [DEC-084](#참가자-세션)대로 `401`이고, 세션이 있더라도 대상 판정에서 빠진다.

`200`

```json
{
  "items": [
    {
      "noticeId": "…",
      "title": "내일 아침 집회 장소 변경",
      "bodyPreview": "소강당이 아니라 대강당입니다. 7시 50분까지 모여 주세요.",
      "important": true,
      "pinned": true,
      "leadersOnly": false,
      "publishedAt": "2027-01-22T12:00:00Z",
      "editedAt": "2027-01-22T12:20:00Z",
      "unread": true
    }
  ],
  "nextBefore": "MToxNzk…"
}
```

- 순서: 고정 → `publishedAt` 내림차순 → `noticeId` 내림차순. `limit` 1–50, 기본 20. `before`는 직전 응답의 `nextBefore`(형식을 해석하지 않는 문자열, 깨지면 `400` 필드 `before`). 대상으로 거른 **뒤에** 자르므로 마지막이 아닌 페이지는 늘 `limit`개다. 고정은 3개까지라 기본 `limit`이면 첫 페이지에 모두 나온다.
- `bodyPreview`: 본문 앞 80자. 줄바꿈(앞뒤 공백 포함)은 공백 하나로 바꾸고, 잘랐으면 끝에 `…`를 붙인다.
- `leadersOnly`: 대상이 `LEADERS`면 `true`. `audience` 원본은 없다.
- `editedAt`: 발행 뒤 내용을 고쳤으면 그 시각. 화면은 "수정됨 HH:mm"을 붙인다.
- `unread`: 이 공지를 가리키는 내 알림 중 읽지 않은 것이 있으면 `true`. 알림이 없는 공지(나중에 조장이 된 사람 등)는 `false`.
- 작성자 이름·다른 참가자 정보는 없다.

### `GET /api/v1/participant/notices/{noticeId}`

`200` 본문은 목록 항목에 `body`(전체)를 더한 것이다.

```json
{
  "noticeId": "…",
  "title": "내일 아침 집회 장소 변경",
  "bodyPreview": "소강당이 아니라 대강당입니다. 7시 50분까지 모여 주세요.",
  "body": "소강당이 아니라 대강당입니다.\n7시 50분까지 모여 주세요.",
  "important": true,
  "pinned": true,
  "leadersOnly": false,
  "publishedAt": "2027-01-22T12:00:00Z",
  "editedAt": null,
  "unread": true
}
```

보이지 않는 공지(없음, 다른 행사, `DRAFT`, `ARCHIVED`, 대상 밖)는 모두 `404 RESOURCE_NOT_FOUND`이고 서로 구분하지 않는다. 조회로 읽음 처리하지 않는다. 화면은 상세를 열 때 [`POST /participant/notifications/read`](#post-apiv1participantnotificationsread) `{ "target": { "type": "NOTICE", "id": "…" } }`를 부른다.

### 읽기 비용

참가자 목록 한 요청은 SQL 네 문장이다(세션 확인, 대상 판정 한 문장, 그 행사의 `PUBLISHED` 공지 한 문장 — 본문은 앞 81자만, 그 페이지의 `unread` 한 문장). 상세도 네 문장이다. `NoticeCostIT`가 참가자 200명이 발행 직후 한 번씩 다시 읽을 때 요청마다 세어 확인한다. 공지 수·참가자 수와 상관없이 문장 수가 같다.

### 저장

`V22__notices.sql`(번호는 병합 때 맞춘다).

- `notices`: 공지 한 건이 한 행. `audience`는 `jsonb`(위 모양 그대로), 상태 `CHECK`, `PUBLISHED`면 `published_at`이 있고 `ARCHIVED`면 고정이 아니다. 색인 `(space_id, event_id, status, published_at DESC)`. 고정 3개는 색인이 아니라 행사 행 잠금 아래에서 센다. 전달 기록 열은 없다(알림 행이 기록이다).
- `notice_boards`: 행사당 한 행(`space_id`, `event_id`, `version`, `updated_at`). 운영자 범위 값이다. 첫 쓰기 때 만든다.
- 모두 DB에만 있다. 서버 메모리에 두는 상태는 없다. 이전 본문(수정 이력)은 저장하지 않는다.

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
  "name": "김",
  "cohort": "94",
  "phoneLast4": "1234",
  "checkIn": { "checkInId": "…", "status": "CHECKED_IN", "method": "MANUAL", "checkedInAt": "…", "checkedInByDisplayName": "김OO" }
}
```

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

기본 역할 중 `GROUP_WRITE`는 `OWNER`와 `MANAGER`가 갖는다(DEC-079 Follow-up 2026-11-20). STAFF 편성 담당에게는 [권한 개별 설정](#put-apiv1operatoreventseventidoperatorsuseridpermissions)으로 GRANT하고, 특정 MANAGER에게서 막으려면 REVOKE한다. 공간 역할만으로는 쓰지 못한다.

쓰기의 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → 버전·충돌(`409`) → 참가 자격·규칙(`409`) → 결과(`200`)다. 읽기는 행사 상태로 막지 않는다. 쓰기는 행사 행을 잠그고 처리해 같은 행사의 쓰기가 차례로 커밋된다.

| 행사 상태 | 편집·공개 |
|---|---|
| `DRAFT`, `ACTIVE` | 가능 |
| `ENDED` | `409 EVENT_ENDED` |
| `ARCHIVED` | `409 EVENT_ARCHIVED` |

`Idempotency-Key`는 읽지 않는다. 배정은 [이미 목적지면 성공](#post-apiv1operatoreventseventidgroup-assignments), 공개는 [같으면 `ALREADY_PUBLISHED`](#post-apiv1operatoreventseventidgroupspublish)라서 같은 요청을 다시 보내도 두 번 반영되지 않는다. 결과를 모르면 편성판을 다시 읽어 확인한다(DEC-047).

### 버전

- `boardVersion`: 행사당 하나. 작업본이 실제로 바뀔 때마다(조 추가·이름·삭제·순서, 배정, 조원 순서, 조장) 1 오른다. 공개는 올리지 않는다. 처음은 0이다.
- 조 `version`: 조마다. 이름 변경과 조장 변경에 1 오른다. 배정과 조원 순서는 조 `version`을 올리지 않는다.

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
      "name": "김",
      "cohort": "94",
      "gender": { "optionId": "opt_female", "label": "여" },
      "attendance": "FULL",
      "middleGroup": "청년1부",
      "cell": "다윗셀",
      "newcomer": true,
      "groupId": "…",
      "leader": false,
      "position": 2,
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

- `participants`는 활성 참가자 전원이고 순서는 이름, 그다음 참가자 id다. 페이지는 없다. 전화·접근 키는 없다.
- `cohort`는 `SUBMITTED` 신청의 `COHORT` 답 `value.text`(앞뒤 공백 자름)다. `middleGroup`·`cell`은 `MIDDLE_GROUP`·`CELL` 답이 자유 입력이면 `value.text`(앞뒤 공백 자름), 목록 보기면 고른 보기의 지금 문구다(새가족이면 `"새가족 (등반X)"` 또는 운영자가 고친 문구). `gender`는 `GENDER` 답의 보기 id와 지금 보기 문구다. 답이 없거나 질문이 없거나 꺼져 있으면 `null`이다.
- `newcomer`는 새가족 보기(`opt_newcomer`)를 가진 보이는 질문(중그룹이 가지면 중그룹, 아니면 셀)의 답으로 정한다: 그 보기를 골랐으면 `true`, 다른 보기면 `false`, 답이 없거나 그런 질문이 없으면 `null`이고 화면은 "응답 없음"으로 묶는다. 예전 `NEWCOMER` 예/아니오 답은 읽지 않는다. 돌봄 관련 정보라 편성판에만 있다. 참가자의 내 조(`GET /participant/group`, 조장의 조원 명단 포함)와 운영자 공개본 조회에는 없다.
- `attendance`는 `ATTENDANCE` 답의 `opt_full`·`opt_partial`·`opt_worship`을 `FULL`·`PARTIAL`·`WORSHIP_ONLY`로 바꾼 값이다. 질문이 없거나 꺼져 있으면 `FULL`이다(DEC-070 §3). 질문이 켜진 뒤 들어온 신청이 아니라서 답이 없을 때도 `FULL`이다. `null`이 아니다.
- `groupId`가 `null`이면 미배정이다. `position`([#343](https://github.com/BeomhyunPark/SCENE/issues/343))은 조 안 순서로, 작은 값이 앞이고 같으면 참가자 id 순이다. 값이 0부터 이어진다는 보장은 없다(빠진 번호가 있을 수 있다). 미배정이면 `null`이다. 화면은 조원을 이 순서로 그린다. `publishedGroupId`·`publishedLeader`는 가장 최근 공개본의 값이고, 공개한 적이 없거나 그 공개본에 없으면 `null`·`false`다.
- `withdrawn`은 `SUBMITTED` 신청이 없는(취소된) 사람 가운데 이전 조가 있는 사람이다. 이전 조는 남은 배정 행(DEC-084 전에 SQL로 철회된 기록)이거나, 취소가 배정을 지우며 남긴 `group_assignment_logs`의 마지막 `WITHDRAWN` 기록이다. `groupId`는 참고값이고 조가 지워졌을 수 있다. 조별 인원·미배정 수에 넣지 않는다.
- `publication`: 공개한 적이 없으면 `lastPublished…`가 `null`이다. `lastPublishedBoardVersion`은 그 공개 때의 `boardVersion`이다. `changedParticipantCount`는 활성 참가자 중 작업본과 최근 공개본의 조 또는 조장 표시가 다른 사람 수다(처음 공개 전에는 배정된 사람 수). `groupChanges`는 작업본과 최근 공개본 사이에 추가·삭제됐거나 이름 또는 `sortOrder` 값이 다른 조, 또는 양쪽에 다 있는 조원끼리의 순서가 다른 조의 수다(처음 공개 전에는 조 수). 순서만 바꿔도 미공개 변경이다(#343). 비교는 내용으로 한다. 옮겼다가 되돌려 내용이 같으면 `boardVersion`이 올라도 변경이 없다. 되돌린 사람은 조의 맨 뒤로 가므로, 원래 맨 뒤가 아니었다면 순서 변경으로 센다. `hasUnpublishedChanges`는 둘 중 하나라도 0이 아니면 `true`다. 화면은 이 값으로 "미공개 변경 있음"을 보여 준다(DEC-040).
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

- 선택 키 `beforeParticipantId`(#343): 목적 조에서 이 사람 **앞에** 넣는다. 없거나 `null`이거나 그 사람이 지금 목적 조에 없으면 맨 뒤다. 같은 조로 가는 사람이 여럿이면 `changes` 순서대로 들어간다(같은 `beforeParticipantId`면 그 앞에 차례로). `toGroupId`가 `null`이면 읽지 않는다. 형식이 틀리면 `400`(필드 `changes`). 이미 반영된 사람(지금 = `toGroupId`)은 자리를 바꾸지 않는다. 조 안 순서만 바꿀 때는 [조원 순서](#put-apiv1operatoreventseventidgroupsgroupidmembersorder)를 쓴다.
- `changes`는 1–200개이고 같은 `participantId`가 두 번 나오면 `400 VALIDATION_FAILED`(필드 `changes`)다. `fromGroupId`는 화면이 본 지금 조, `null`은 미배정이다. 둘 다 키가 있어야 한다.
- 그 행사의 참가자나 `toGroupId`의 조가 아니면 `404 RESOURCE_NOT_FOUND`다. `fromGroupId`는 지금 조와 비교만 하므로, 지워진 조나 모르는 id면 충돌이다.
- 사람마다 지금 조를 본다.
  - 지금 = `toGroupId`: 이미 반영됐다. 바꾸지 않는다.
  - 지금 = `fromGroupId`: 옮긴다.
  - 그 밖: 충돌이다.
- 충돌이 하나라도 있으면 **아무것도 저장하지 않고** `409 CONCURRENT_MODIFICATION`이다. 확장 필드는 `conflicts: [{ "participantId", "currentGroupId" }]`와 `boardVersion`이다. 화면은 최신 상태와 내 변경을 비교해 보여 준다(DEC-046).
- 옮기는(이미 반영 아닌) 사람이 활성 참가자가 아니면 `409 INVALID_STATE_TRANSITION`이고 확장 필드 `reason`은 `APPLICATION_NOT_SUBMITTED`, `participantIds`가 그 사람들이다. 철회자를 미배정으로 빼는 것(`toGroupId: null`)은 된다.
- 옮긴 사람은 조장 표시가 풀린다. 떠난 조의 다른 조원 순서는 그대로다.

`200`

```json
{ "changed": 2, "alreadyApplied": 0, "boardVersion": 45 }
```

바뀐 사람이 없으면 `boardVersion`을 올리지 않는다. 바뀐 사람마다 `group_assignment_logs`에 한 줄 남긴다.

### `PUT /api/v1/operator/events/{eventId}/groups/{groupId}/leaders`

본문은 `{ "participantIds": ["…"], "expectedVersion": 3 }`다. 그 조의 조장 전체를 이 목록으로 바꾼다. **조장은 조당 최대 1명이다**(사용자 결정 2026-11-17, #343). 목록은 0–1명이고 2명 이상이면 `400 VALIDATION_FAILED`(필드 `participantIds`)다. 다른 사람 한 명을 보내면 기존 조장은 같은 요청에서 풀린다(화면의 ♥를 다른 사람에게 누르는 동작이 요청 하나다). DB에도 조당 조장 1명 색인이 있다. 버전 처리는 조 `PATCH`와 같다. 지금 그 조의 활성 조원이 아닌 사람이 있으면 `409 CONFLICT`이고 확장 필드 `reason`은 `LEADER_NOT_MEMBER`, `participantIds`가 그 사람들이다. 목록이 그대로면 아무것도 바꾸지 않는다.

`200` 본문은 `{ "group", "leaderIds": ["…"], "boardVersion" }`다. `leaderIds`는 0–1개 배열이다. 조장 표시가 바뀐 사람마다 이력을 남긴다(교체면 풀린 사람, 지정된 사람 순).

### `PUT /api/v1/operator/events/{eventId}/groups/{groupId}/members/order`

조 안 순서만 바꾼다(#343). 본문은 `{ "participantIds": ["…", "…"] }`다. 그 조의 **활성 조원 전체**를 정확히 한 번씩, 원하는 순서로 담는다.

- 배열이 아니거나 id 형식이 틀리거나 겹치면 `400 VALIDATION_FAILED`(필드 `participantIds`). 그 행사의 조가 아니면 `404`.
- 지금 조원과 다르면(그새 다른 운영자가 넣거나 뺐다) **아무것도 저장하지 않고** `409 CONCURRENT_MODIFICATION`, 확장 필드는 배정과 같은 `conflicts: [{ "participantId", "currentGroupId" }]`와 `boardVersion`이다. 목록에 있는데 그 조가 아닌 사람은 지금 조(미배정이면 `null`), 그 조인데 목록에 없는 사람은 이 조 id다.
- 철회자 배정 행은 활성 조원 뒤로 간다(편성판에 보이지 않는다).
- 순서가 그대로면 `boardVersion`을 올리지 않는다. 조 `version`은 올리지 않는다. 순서만 바뀐 것은 `group_assignment_logs`에 남기지 않는다.

`200` 본문은 `{ "boardVersion" }`다.

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

`ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 가장 최근 공개 값이고 `changedParticipantCount`는 0이다. `assignedCount`·`unassignedCount`는 지금 활성 참가자 기준이다. `PUBLISHED`의 `changedParticipantCount`는 직전 공개본과 비교한 값이다. `confirmUnassigned`가 불리언이 아니면 `400`(필드 `confirmUnassigned`), `expectedBoardVersion`이 0 이상 정수가 아니면 `400`(필드 `expectedBoardVersion`)이다. 공개는 `group_publications`에 한 행을 더한다. 내용은 조 id·이름·순서와 조마다 조원·조장의 참가자 id다(활성 참가자만). 조원은 작업본의 조 안 순서대로 담는다(#343). 이름·전화는 넣지 않는다. 같은 transaction에 audit `GROUPS_PUBLISHED`를 남긴다. 알림은 보내지 않는다(DEC-072 범위 밖). 조가 하나도 없어도 공개할 수 있고, 그러면 모두 미배정으로 보인다.

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

공개한 적이 없으면 `{ "publishedAt": null, "groups": [], "unassigned": [] }`다. `404`가 아니다. 철회자는 빠진다. 공개 뒤 새로 신청한 활성 참가자는 `unassigned`에 들어간다. 조 안의 순서는 공개본에 담긴 운영자 순서다(#343. 그 전 공개본은 참가자 id 순으로 담겨 있다). `leaders`는 0–1개다. 체크인 조별 보기도 이 순서를 쓴다.

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
- `group.leaders`는 이름만이고 0–1개다(조장 1명, #343). 철회한 조장은 빠진다. 배열 모양은 그대로 둔다.
- `leader`는 공개본에서 내가 그 조의 조장인지다. `members`는 `leader`가 `true`일 때만 있고, 그 조의 활성 조원(나 포함)의 이름·또래·조장 표시를 공개본의 운영자 순서로 담는다. 그 밖에는 `null`이다. 전화·연락처는 없다.
- 일반 참가자는 다른 조원의 이름을 받지 않는다.
- 조회는 audit을 남기지 않는다.

### 이력과 감사 로그

`group_assignment_logs`: 참가자, 이전 조, 새 조, 조장 전후, 처리자 `users.id`, 시각, 원인(`MOVE`·`LEADER`·`GROUP_DELETED`). 1차에 읽는 URL은 없다.

audit `GROUPS_PUBLISHED`: detail은 `publicationId`, `boardVersion`, `assignedCount`, `unassignedCount`, `changedParticipantCount`다. `ALREADY_PUBLISHED`는 남기지 않는다. 조·배정 편집은 audit 대신 위 이력에 남긴다.

## 일정표

> [#435](https://github.com/BeomhyunPark/SCENE/issues/435)(로드맵 C2·C3)에서 서버에 열었다. 컨트롤러 `event/schedule/ScheduleController`·`ParticipantScheduleController`, 스키마 `V23__schedule.sql`. 정책은 [DEC-081](../../docs/product/PRODUCT_DECISIONS.md)과 그 Follow-up(2026-11-20, #435)이다. 화면 규칙(운영자 편집·참가자 일정 탭)은 [일정표 계약 초안](../../docs/architecture/schedule-contract.md)에 남아 있다.

조 편성과 같은 모양이다. 운영자가 고치는 **작업본**(항목들)과, 공개할 때 작업본 전체를 찍는 **공개본**(스냅샷)이 따로 있다. 작업본 저장은 참가자에게 보이지 않는다. 참가자는 가장 최근 공개본만 본다. 항목 `POST`·`PATCH`·`DELETE`에 `publish: true`를 붙이면 저장과 공개를 한 트랜잭션에서 한다("저장하고 바로 공개").

| 동작 | 권한 |
|---|---|
| 작업본·공개본 조회(운영자) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 항목 만들기·고치기·지우기, 공개, 저장하고 바로 공개 | 유효한 `SCHEDULE_WRITE` |

기본 역할 중 `SCHEDULE_WRITE`는 `OWNER`와 `MANAGER`가 갖는다(DEC-079 Follow-up 2026-11-20). STAFF는 작업본·공개본을 읽기만 한다. 공간 역할만으로는 쓰지 못한다.

쓰기의 판정 순서는 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문 모양(`400`) → 행사 상태(`409`) → 행사 기간(`409 EVENT_PERIOD_REQUIRED`, 만들기·공개) → 대상 찾기(`404`) → 버전(`409 CONCURRENT_MODIFICATION`) → 일차 범위·시각·칸 규칙(`400`) → 충돌·한도(`409 CONFLICT`) → 다른 미공개 변경 확인(`409 CONFIRMATION_REQUIRED`) → 결과다. 일차 범위처럼 행사를 봐야 아는 `400`은 행사 상태 뒤에 나온다. 읽기는 행사 상태로 막지 않는다. 쓰기는 행사 행을 잠그고 처리해 같은 행사의 쓰기가 차례로 커밋된다.

| 행사 상태 | 운영자 조회 | 쓰기·공개 | 참가자 일정 |
|---|---|---|---|
| `DRAFT`, `ACTIVE` | 조회 | 가능 | 가장 최근 공개본 |
| `ENDED` | 조회 | `409 EVENT_ENDED` | 마지막 공개본 |
| `ARCHIVED` | 조회 | `409 EVENT_ARCHIVED` | 마지막 공개본 |

`Idempotency-Key`는 읽지 않는다. 같은 고치기를 다시 보내면 `version`이 달라 `409`이고, 화면은 `item`(지금 값)이 내가 보낸 값과 같으면 성공으로 본다. 같은 공개를 다시 보내면 `ALREADY_PUBLISHED`다(DEC-047).

### 항목

운영자 응답의 항목(작업본)이다.

```json
{
  "itemId": "…",
  "day": 2,
  "date": "2027-01-23",
  "startTime": "09:30",
  "endTime": "11:00",
  "endsNextDay": false,
  "startsAt": "2027-01-23T09:30:00+09:00",
  "endsAt": "2027-01-23T11:00:00+09:00",
  "title": "오전 집회",
  "place": "대강당",
  "description": "성경책을 챙겨 주세요",
  "category": "WORSHIP",
  "audience": [{ "type": "ALL" }],
  "leadersOnly": false,
  "slotId": "opt_d2_worship",
  "sortOrder": 0,
  "version": 3,
  "updatedAt": "2027-01-22T12:00:00Z",
  "updatedByDisplayName": "김OO",
  "publishState": "CHANGED",
  "outOfPeriod": false
}
```

| 필드 | 규칙 (쓰기) |
|---|---|
| `day` | 정수. 1 ≤ `day` ≤ 행사 일수(시작일이 1일차, 끝나는 날 포함). 저장 기준은 `day`이고 `date`·`startsAt`·`endsAt`은 읽을 때 행사 시작일로 계산한다 |
| `startTime` | 필수. `HH:mm`(두 자리, `00:00`–`23:59`). 행사 현지 시각 |
| `endTime` | 선택. `HH:mm` 또는 `null`. `startTime`과 같으면 `400`. 더 이르면 다음 날 끝나고 `endsNextDay: true`, `endsAt`이 다음 날이다(예: `22:00`–`00:30`) |
| `title` | 필수. 앞뒤 공백을 자르고 1–100자 |
| `place` | 선택. 자른 뒤 0–100자. 빈 문자열은 `null`로 저장 |
| `description` | 선택. 자른 뒤 0–2,000자. 빈 문자열은 `null`. 일반 글이다(줄바꿈만 살린다) |
| `category` | 필수. `WORSHIP`·`MEAL`·`PROGRAM`·`GROUP`·`FREE`·`MOVE`·`OTHER` |
| `audience` | 필수. `[{ "type": "ALL" }]`처럼 정확히 한 항목, `type`은 `ALL`·`LEADERS`·`STAFF`. 다른 키·`ids`가 있으면 `400`(필드 `audience`) |
| `slotId` | 선택. `opt_d{일차}_{breakfast\|lunch\|dinner\|worship}` 또는 `null`. 앞의 일차가 `day`와 같아야 하고, `breakfast`·`lunch`·`dinner`는 `category: MEAL`, `worship`은 `category: WORSHIP`일 때만 받는다. 한 일정표에 같은 `slotId`는 한 항목뿐이다(`409 SLOT_ALREADY_LINKED`). 신청서 설정에 없는 칸이어도 저장된다 |
| `sortOrder` | 같은 일차·같은 시작 시각 안의 순서(작은 값이 앞). 만들 때는 받지 않고 그 시각의 맨 뒤다. `PATCH`로 0–100,000을 준다. `PATCH`로 일차나 시작 시각을 바꾸고 `sortOrder`를 안 보내면 새 시각의 맨 뒤로 간다 |

읽기 전용: `date`(시작일이 없으면 `null`), `startsAt`·`endsAt`(`+09:00` 시각, `endTime`이 없거나 시작일이 없으면 `null`), `leadersOnly`(대상이 `LEADERS`), `version`(만들면 1, 내용이 바뀔 때 +1), `updatedAt`·`updatedByDisplayName`, `publishState`, `outOfPeriod`.

- `publishState`: 가장 최근 공개본과 내용으로 비교한다. `UNCHANGED`, `ADDED`(공개본에 없음. 공개한 적이 없으면 모두), `CHANGED`. 비교하는 필드는 `day`·`startTime`·`endTime`·`title`·`place`·`description`·`category`·`audience`·`slotId`·`sortOrder`다. 고쳤다가 되돌리면 `UNCHANGED`다.
- `outOfPeriod`: 행사 기간이 줄어 `day`가 기간 밖이거나 기간이 없다. 이런 항목이 있으면 공개할 수 없다(아래 공개 3번). `PATCH`로 `day`를 보내 옮기거나 지운다(`day`를 보내지 않는 `PATCH`는 일차 범위를 보지 않는다).
- **순서:** `day` → `startTime` → `sortOrder` → `itemId`. 순서 바꾸기 경로는 따로 없다.
- 항목은 행사당 300개까지다(`409 CONFLICT`, `reason: ITEM_LIMIT`).

### 버전

- `boardVersion`: 행사당 하나. 작업본이 실제로 바뀔 때마다(만들기·내용이 바뀐 고치기·지우기) 1 오른다. 공개는 올리지 않는다. 처음은 0이다.
- 항목 `version`: 고치기·지우기는 `expectedVersion`이 필요하다. 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`, 확장 필드 `item`(지금 항목 객체 전체)이다. 서로 다른 항목을 고치는 두 운영자는 충돌하지 않는다.
- 공개는 `expectedBoardVersion`이 필요하다. 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.

### `GET /api/v1/operator/events/{eventId}/schedule`

작업본이다.

`200`

```json
{
  "eventStatus": "ACTIVE",
  "boardVersion": 31,
  "startDate": "2027-01-22",
  "endDate": "2027-01-24",
  "timeZone": "Asia/Seoul",
  "days": [
    { "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)" },
    { "day": 2, "date": "2027-01-23", "dayLabel": "1월 23일 (토)" },
    { "day": 3, "date": "2027-01-24", "dayLabel": "1월 24일 (일)" }
  ],
  "items": [{ "…": "위 항목" }],
  "publication": {
    "lastPublishedAt": "2027-01-22T11:00:00Z",
    "lastPublishedByDisplayName": "김OO",
    "lastPublishedBoardVersion": 29,
    "hasUnpublishedChanges": true,
    "pendingChanges": { "added": 0, "changed": 1, "removed": 1 }
  },
  "slots": [
    {
      "slotId": "opt_d1_dinner", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)",
      "meal": "DINNER", "label": "저녁", "sortOrder": 0, "linkedItemId": "…"
    }
  ]
}
```

- `items`는 위 순서이고 페이지가 없다.
- `days`는 행사 기간의 모든 날이다. 기간이 없으면 `[]`다. 끝나는 날이 없으면 시작일 하루다.
- `publication`: 공개한 적이 없으면 `last…`가 `null`이고 `hasUnpublishedChanges`는 `true`(첫 공개는 항목이 없어도 된다), `pendingChanges.added`는 항목 수다. 그 뒤에는 작업본이 가장 최근 공개본과 다를 때만 `true`다. `removed`는 공개본에만 있고 작업본에서 지운 항목 수다.
- `slots`는 신청서 설정의 식사·집회 칸이다. 편성판 `slots`와 같은 코드(`MealSlots`)라 id·순서·이름이 같다. `linkedItemId`는 그 칸 id를 가진 항목이고 없으면 `null`이다. 설정이 없으면 `slots: null`이다. 항목의 `slotId`가 이 목록에 없으면 화면은 "신청서에 없는 칸"으로 보인다.

### `POST /api/v1/operator/events/{eventId}/schedule/items`

```json
{
  "day": 2, "startTime": "09:30", "endTime": "11:00",
  "title": "오전 집회", "place": "대강당", "description": null,
  "category": "WORSHIP", "audience": [{ "type": "ALL" }], "slotId": "opt_d2_worship",
  "publish": false, "confirmOtherChanges": false, "notify": true
}
```

`day`·`startTime`·`title`·`category`·`audience`는 필수다. 나머지는 생략할 수 있다. `sortOrder`·모르는 키는 무시한다. `publish`·`confirmOtherChanges`(생략하면 `false`)·`notify`(생략하면 `true`)는 [저장하고 바로 공개](#저장하고-바로-공개)다. 불리언이 아니면 `400`(그 키). 행사 기간이 없으면 `409 CONFLICT`, `reason: EVENT_PERIOD_REQUIRED`.

`201`

```json
{ "item": { "…": "만든 항목" }, "boardVersion": 32, "publication": null }
```

`publish: true`였으면 `publication`이 [공개 응답](#post-apiv1operatoreventseventidschedulepublish)이고, `item.publishState`는 공개 뒤 값(`UNCHANGED`)이다.

### `PATCH /api/v1/operator/events/{eventId}/schedule/items/{itemId}`

```json
{ "expectedVersion": 3, "startTime": "10:00", "place": null, "publish": true }
```

`expectedVersion`(1 이상 정수)은 필수다. 보낸 필드만 바꾼다. `endTime`·`place`·`description`·`slotId`는 `null`을 보내면 지운다. `day`·`startTime`·`title`·`category`·`audience`는 `null`이면 `400`이다. 합친 결과로 시각·칸 규칙을 다시 본다(예: `day`만 바꾸면 기존 `slotId`의 일차와 달라 `400 slotId`). 값이 그대로면 아무것도 바꾸지 않고 `200`이며 `version`·`boardVersion`이 그대로다. 그 행사의 항목이 아니면 `404 RESOURCE_NOT_FOUND`.

`200` 본문은 `POST`와 같다.

### `DELETE /api/v1/operator/events/{eventId}/schedule/items/{itemId}?expectedVersion=3`

작업본에서 지운다. 지난 공개본은 그대로라 다시 공개하기 전까지 참가자는 그 항목을 계속 본다. 쿼리 `publish=true`(와 `confirmOtherChanges=true`, `notify=false`)로 저장하고 바로 공개한다. 값은 `true`·`false`만 받는다(그 밖은 `400`, 그 키). `expectedVersion`이 없거나 1 이상 정수가 아니면 `400`(필드 `expectedVersion`).

`200`

```json
{ "boardVersion": 33, "publication": null }
```

### `POST /api/v1/operator/events/{eventId}/schedule/publish`

```json
{ "expectedBoardVersion": 33, "notify": true }
```

`expectedBoardVersion`(0 이상 정수)은 필수다(`400`, 필드 `expectedBoardVersion`). `notify`는 생략하면 `true`, 불리언이 아니면 `400`. 판정은 행사 상태 다음에 이 순서다.

1. `boardVersion`이 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`. 화면은 최신 작업본과 바뀐 항목 요약을 다시 보여 주고 확인받는다.
2. 공개한 적이 있고 작업본이 가장 최근 공개본과 같으면 `200`, `result: ALREADY_PUBLISHED`. 아무것도 남기지 않는다(공개 행·갱신 값·알림·audit 모두 없음). 공개한 적이 없으면 이 단계를 건너뛴다(항목이 없어도 첫 공개가 된다).
3. 행사 기간이 없으면 `409 CONFLICT`, `reason: EVENT_PERIOD_REQUIRED`.
4. `outOfPeriod` 항목이 있으면 `409 CONFLICT`, 확장 필드 `reason: ITEMS_OUT_OF_PERIOD`, `itemIds`(항목 id 목록).
5. 공개한다.

`200`

```json
{
  "result": "PUBLISHED",
  "publicationId": "…",
  "publishedAt": "2027-01-22T12:05:00Z",
  "boardVersion": 33,
  "changes": {
    "added": [{ "itemId": "…", "title": "레크리에이션" }],
    "changed": [{ "itemId": "…", "title": "오전 집회", "fields": ["startTime", "place"] }],
    "removed": [{ "itemId": "…", "title": "산책" }]
  },
  "notifiedCount": 187
}
```

- `changes`는 직전 공개본과 비교한 것이다. 첫 공개는 모든 항목이 `added`다. `fields`는 위 비교 필드 순서다.
- `ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 가장 최근 공개 값이고 `changes`의 세 목록은 비어 있으며 `notifiedCount`는 0이다.
- `notifiedCount`는 이번 공개로 만든 참가자 알림 행 수다(합쳐진 행 포함).
- 공개는 `schedule_publications`에 한 행을 더하고, **같은 트랜잭션**에서 `participant_feed_versions.schedule`을 정확히 1 올리고([`updates.schedule`](#get-apiv1participantupdates)), 알림을 만들고(아래), audit `SCHEDULE_PUBLISHED`를 남긴다. 어느 하나가 실패하면 모두 되돌린다.
- `notify: false`면 알림을 만들지 않는다(첫 공개도 같다). 그래도 참가자 화면은 다음 `updates` 확인에서 바뀌고 "변경됨" 표시도 붙는다.

**알림**(`target`은 `{ "type": "SCHEDULE", "id": null }`, `important: false`):

| 때 | `kind` | 받는 사람 | `title` / `body` |
|---|---|---|---|
| 첫 공개 | `SCHEDULE_PUBLISHED` | 공개본의 항목을 하나라도 볼 수 있는 활성 참가자(`ALL` 항목이 있으면 전원, `LEADERS`만 있으면 조장). `STAFF` 항목만 있으면 없음 | "일정표가 올라왔어요" / `null` |
| 그 뒤 공개 | `SCHEDULE_CHANGED` | 추가·변경·삭제된 항목을 바뀌기 전이나 뒤에 볼 수 있던 활성 참가자. `STAFF` 항목만 바뀌었으면 없음 | "일정이 바뀌었어요" / 바뀐 항목 제목 최대 셋과 "외 N건"(예: "오전 집회, 레크리에이션, 산책 외 2건"). 조장의 본문에는 `LEADERS` 항목 제목도 들어간다 |

- 받는 사람은 공개하는 순간 [`ParticipantAudience`](#참가자-홈갱신-확인알림)로 정한다. 신청이 없는(취소된) 참가자는 빠진다. 운영자 알림은 만들지 않는다.
- 같은 참가자에게 읽지 않은 같은 `kind`의 일정 알림이 있으면 한 줄로 합친다(`count` + 1, 문구는 새 값). 알림 문구에는 일정 제목만 넣는다.
- 참가자가 일정 탭을 열 때 `POST /participant/notifications/read`에 `{ "target": { "type": "SCHEDULE", "id": null } }`로 일정 알림을 읽음으로 할 수 있다.

### 저장하고 바로 공개

항목 `POST`·`PATCH`·`DELETE`에 `publish: true`(`DELETE`는 쿼리)를 붙이면 그 저장과 공개를 **한 트랜잭션**에서 한다. 휴대폰 화면의 "저장하고 바로 공개" 버튼이 이 요청 하나다.

- 저장 판정(버전·규칙·충돌)이 먼저다. 저장이 실패하면 공개도 하지 않는다.
- **다른 미공개 변경이 있으면 확인을 받는다.** 이 항목을 뺀 작업본이 가장 최근 공개본과 다르면(공개한 적이 없으면 다른 항목이 하나라도 있으면) `confirmOtherChanges: true`가 없을 때 `409 CONFIRMATION_REQUIRED`이고 아무것도 저장하지 않는다.

```json
{
  "type": "urn:scene:problem:confirmation-required",
  "status": 409,
  "code": "CONFIRMATION_REQUIRED",
  "otherChanges": {
    "added": [{ "itemId": "…", "title": "레크리에이션" }],
    "changed": [{ "itemId": "…", "title": "점심", "fields": ["place"] }],
    "removed": []
  }
}
```

  화면은 "다른 미공개 변경 N건도 함께 공개돼요"를 보이고, 운영자가 확인하면 같은 요청에 `confirmOtherChanges: true`를 붙여 다시 보낸다. 항목 하나만 공개하는 길은 없다.
- 공개의 `expectedBoardVersion`은 서버가 이 저장 직후 값으로 채운다. 같은 트랜잭션이라 다른 쓰기가 끼어들지 않는다.
- 공개 단계가 실패하면(예: 다른 항목이 기간 밖이라 `409 ITEMS_OUT_OF_PERIOD`) 저장도 되돌린다. 갱신 값·알림도 남지 않는다.
- 응답의 `publication`이 위 공개 응답이다. 저장 결과 작업본이 공개본과 같아지면(되돌리기) `ALREADY_PUBLISHED`다.

### `GET /api/v1/operator/events/{eventId}/schedule/published`

가장 최근 공개본을 대상 필터 없이 모두 준다.

`200`

```json
{
  "status": "PUBLISHED",
  "publishedAt": "2027-01-22T12:05:00Z",
  "publishedByDisplayName": "김OO",
  "boardVersion": 33,
  "timeZone": "Asia/Seoul",
  "serverTime": "2027-01-22T12:06:00Z",
  "days": [{ "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)" }],
  "items": [{ "…": "참가자 항목과 같고 audience가 더 있다" }],
  "removedItems": [{ "…": "참가자 removedItems와 같고 audience가 더 있다" }]
}
```

공개한 적이 없으면 `status: NOT_PUBLISHED`, `publishedAt`·`publishedByDisplayName`·`boardVersion`이 `null`, `items`·`removedItems`가 `[]`다. `404`가 아니다.

### `GET /api/v1/participant/schedule`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 쿠키가 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`, 임시 번호 세션은 `403 PARTICIPANT_PIN_CHANGE_REQUIRED`다. 운영자 세션 쿠키로는 열리지 않는다(`401`). 대상은 세션의 행사·참가자뿐이고 가장 최근 공개본 하나만 읽는다. 행사 상태와 상관없이 같다. 응답은 `Cache-Control: no-store`이고 audit을 남기지 않는다. IP 제한이 없다.

200명이 공개 직후 한꺼번에 부르므로 한 요청이 SQL 세 문장(세션 확인, 활성·조장 판정, 행사 기간과 가장 최근 공개본 한 행)만 읽는다. 작업본 테이블은 읽지 않는다(`ParticipantScheduleCostIT`).

`200`

```json
{
  "status": "PUBLISHED",
  "publishedAt": "2027-01-22T12:05:00Z",
  "timeZone": "Asia/Seoul",
  "serverTime": "2027-01-22T12:06:00Z",
  "days": [{ "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)" }],
  "items": [
    {
      "itemId": "…",
      "day": 2,
      "date": "2027-01-23",
      "startTime": "09:30",
      "endTime": "11:00",
      "endsNextDay": false,
      "startsAt": "2027-01-23T09:30:00+09:00",
      "endsAt": "2027-01-23T11:00:00+09:00",
      "title": "오전 집회",
      "place": "대강당",
      "description": "성경책을 챙겨 주세요",
      "category": "WORSHIP",
      "slotId": "opt_d2_worship",
      "sortOrder": 0,
      "leadersOnly": false,
      "change": {
        "kind": "CHANGED",
        "changedAt": "2027-01-22T12:05:00Z",
        "fields": ["startTime", "place"],
        "previous": { "startTime": "09:00", "place": "소강당" }
      }
    }
  ],
  "removedItems": [
    {
      "itemId": "…", "day": 2, "date": "2027-01-23", "title": "산책", "startTime": "15:00",
      "removedAt": "2027-01-22T12:05:00Z"
    }
  ]
}
```

| `status` | 경우 | `items` |
|---|---|---|
| `NOT_ELIGIBLE` | 지금 `SUBMITTED` 신청이 없다. 신청이 취소되면 세션 자체가 끊겨 `401`이 먼저이므로(DEC-084 §4) 보통은 나오지 않는 안전장치다 | `[]` |
| `NOT_PUBLISHED` | 공개한 적이 없다 | `[]` |
| `PUBLISHED` | 공개본이 있다 | 볼 수 있는 항목 |

- 신청을 먼저 본다. `NOT_ELIGIBLE`·`NOT_PUBLISHED`도 `days`·`timeZone`·`serverTime`은 있고 `publishedAt`은 `null`이다.
- `items`는 일정 순서(`day` → `startTime` → `sortOrder` → `itemId`)다.
- **대상 필터:** `ALL`은 활성 참가자 모두, `LEADERS`는 가장 최근 조 편성 공개본의 활성 조장에게만 보인다(조장이 풀린 조 공개 뒤 다음 읽기에서 사라진다). `STAFF`는 아무 참가자에게도 보이지 않는다. 조장에게 보이는 `LEADERS` 항목은 `leadersOnly: true`다. 응답에 `audience` 원본은 없다.
- **`change`:** 공개 때 직전 공개본과 비교해 항목마다 저장한 표시다. 첫 공개의 항목, 바뀌지 않은 항목, 24시간이 지난 표시는 `null`이다.
  - `kind`는 `ADDED`(새로 생김, `fields: []`, `previous: null`) 또는 `CHANGED`.
  - `changedAt`은 그 변경이 공개된 시각이다. 다음 공개에서 바뀌지 않으면 그대로 이어진다.
  - `fields`는 바뀐 필드 이름(비교 필드 순서)이다. `previous`는 그중 `day`·`startTime`·`endTime`·`place`의 이전 값만 담는다(값이 없었으면 `null`). 제목·설명의 이전 값은 없다.
  - 24시간 안에 다시 바뀌면 합친다. `fields`는 합집합이고 `previous`는 처음 값을 지킨다("09:00 → 10:00"). 처음 값으로 되돌아간 필드는 빠지고, 남는 것이 없으면 `null`이다. `ADDED` 항목을 24시간 안에 고치면 `ADDED`로 남고 `changedAt`이 새 공개 시각이 된다.
  - **화면 규칙:** `change`가 있으면 `kind`에 따라 "변경됨"·"새 일정"과 `previous`("09:00 → 09:30")를 보인다. 서버가 24시간이 지난 표시를 빼므로 화면은 따로 계산하지 않아도 된다(계산한다면 기준은 `serverTime`).
- **`removedItems`:** 최근 공개들에서 지워진 항목 중 지워진 지 24시간 안인 것이다. 대상 필터는 `items`와 같다. 화면은 그날 목록에 "취소됨"으로 줄을 그어 보인다.
- `slotId`는 식사 순서(H4)가 "우리 조 순서"를 붙일 자리다.
- 갱신: 화면은 [`updates.schedule`](#get-apiv1participantupdates)이 바뀌면 이 경로를 다시 읽는다.

### 기록과 저장

- audit `SCHEDULE_PUBLISHED`: detail은 `publicationId`, `boardVersion`, `added`·`changed`·`removed`(개수), `notify`, `notifiedCount`다. 제목·장소는 넣지 않는다. `ALREADY_PUBLISHED`는 남기지 않는다. 항목 만들기·고치기·지우기는 audit·이력을 남기지 않는다. 공개본 스냅샷이 공개 기록이다.
- `V23__schedule.sql`: `schedule_boards`(행사당 `version`), `schedule_items`(작업본. `day`·`start_time`·`end_time time`·`audience jsonb`·`slot_id`는 `(space_id, event_id, slot_id)` 유일), `schedule_publications`(공개마다 한 행. `snapshot`에 항목 내용 전체·항목별 `change`·`removedItems`(대상 포함), `changes`에 공개 요약). 개인정보는 없다. 모두 DB에만 있고 서버 메모리에 두는 값은 없다.
- 운영자 화면의 주기 확인(`GET …/events/{eventId}/updates`의 `schedule`, I3)은 `ScheduleBoards.boardVersion`(작업본 `boardVersion`)을 쓴다.

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

쓰기는 effective `EVENT_UPDATE`다(행사 OWNER·MANAGER 기본, STAFF는 개인별 GRANT 가능). `text`는 문자열이고 0~10,000자(잠정)다. 없거나 길면 `400 VALIDATION_FAILED`이고 필드는 `text`다. `expectedVersion`은 0 이상의 정수다. 없으면 필드는 `expectedVersion`이다.

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
| `SCHEDULE_PUBLISHED` | 일정표를 공개할 때(저장하고 바로 공개 포함). `ALREADY_PUBLISHED`는 남기지 않는다. detail은 [일정표 기록과 저장](#기록과-저장) |
| `APPLICATIONS_EXPORTED` | 신청자 CSV를 내려받을 때마다. detail은 `count`뿐이다([신청자 CSV](#post-apiv1operatoreventseventidapplicationsexport)) |
| `OWNER_TRANSFER_ACCEPTED` | 소유권 이전을 처음 수락할 때. 다시 수락하면 더 쓰지 않는다 |
| `EVENT_ACCESS_REVOKED` | 운영자 제거 또는 공간 탈퇴로 그 행사 접근이 끊길 때. 탈퇴에서 유지한 행사는 끊지 않는다 |
| `TASK_ASSIGNEE_CLEARED` | 그 제거 또는 탈퇴가 업무 담당을 비울 때. `DONE`과 `CANCELLED`를 포함해 담당인 업무마다 한 줄 |
| `TASK_ITEM_CHECKED`, `TASK_ITEM_UNCHECKED` | 체크 값이 바뀔 때 |
| `TASK_COMPLETED` | 업무가 `DONE`이 될 때 |
| `APPLICATION_OPERATION_UPDATED` | 신청의 운영 정보(운영 메모)를 저장할 때마다. details는 `applicationId`·`version`·`fields`뿐이고 메모 본문은 없다(#335) |
| `TASK_REOPENED` | `DONE` 업무가 다시 열릴 때 |
| `PARTICIPANT_PIN_RESET` | 운영자가 참가자의 숫자 6자리를 초기화할 때마다. detail은 `participantId`뿐이다(DEC-078) |
| `APPLICATION_WITHDRAWN` | 운영자가 신청을 취소할 때. detail은 `applicationId`·`participantId`·`groupRemoved`·`reasonGiven`·`blockReapply`이고 사유 본문은 없다(DEC-084) |
| `APPLICATION_RESTORED` | 운영자가 취소한 신청을 되돌릴 때. detail은 `applicationId`·`participantId`(DEC-084). 참가자의 재신청 복귀는 audit 없이 `application_status_logs`에만 남는다 |
| `NOTICE_PUBLISHED` | 공지를 발행할 때(만들며 발행 포함, `ALREADY_PUBLISHED` 제외). detail은 `noticeId`·`version`·`audienceTypes`·`important`·`notifiedCount` |
| `NOTICE_UPDATED` | **발행된** 공지의 제목·본문·중요·대상을 고칠 때. detail은 `noticeId`·`version`·`fields`(바뀐 필드 이름, 고정을 같이 바꿨으면 `pinned` 포함)·`notify`·`notifiedCount` |
| `NOTICE_ARCHIVED`, `NOTICE_UNARCHIVED` | 보관·보관 해제가 실제로 일어날 때. detail은 `noticeId`·`version` |

이름 상수는 `common/audit/AuditActions`에 있다. 업무 진행의 네 이름은 그 클래스 밖에 있고, `TaskProgressService`가 문자열로 넣는다. `OWNER_TRANSFER_ACCEPTED`도 그 클래스 밖에 있고, `OwnerTransferService`가 문자열로 넣는다. detail은 `transferId`, `toUserId`, `recipientPriorRole`, `deletedOverrides`다. actor는 받는 사람이다.

남기지 않는 명령: 공지 `DRAFT` 만들기·고치기·지우기와 고정만 바꾸기(공지 제목·본문은 어느 detail에도 없다), 로그인과 로그아웃, 초대 생성·재발송·취소·미리보기·수락, 업무 생성·수정·삭제, 탈퇴 미리보기, 막힌 탈퇴, 소유권 이전의 요청·거절·취소와 다시 수락. 업무 수정으로 `CANCELLED`가 되거나 담당이 바뀌어도 감사 로그는 없다.

담당이 비워지며 로그가 남는 경우는 운영자 제거와 공간 탈퇴다. `TASK_ASSIGNEE_CLEARED`의 detail은 `taskId`, `previousAssigneeUserId`, `reason`, `version`이다. `version`은 비운 뒤의 값이다. `reason`은 제거면 `운영자 제거`, 탈퇴면 `이탈`이다. `EVENT_ACCESS_REVOKED`의 detail은 대상 `userId`와 지워진 override인 `deletedOverrides`다. 탈퇴의 actor는 떠나는 사람이고, 운영자 제거의 actor는 그 제거를 호출한 사람이다. 유지한 행사에는 두 `action`이 없다.

### `operator_notices`

공간 소유자가 활성화, 종료, 다시 열기를 대신해서 `actedAs`가 `SPACE_OWNER_OVERRIDE`일 때만 행이 생긴다. `kind`는 `LIFECYCLE_OVERRIDE`다. 받는 사람은 그 행사의 `OWNER` 중 인수인계로 권한이 끝나지 않은 사람이다. 보관과 보관 해제는 공간 소유자의 자신의 권한이라 이 행을 만들지 않는다. 읽는 URL은 없다.

## 아직 없는 경로

다음을 이 서버에서 호출하면 제품 동작이 없다.

- 비밀번호 로그인
- SMTP. 초대 링크는 생성·다시 보내기 응답에 한 번 나오고, 메일 포트는 프로세스 메모리에만 담는다
- 체크 항목 추가
- 참가자 조회(`GET /api/v1/participant/me`·`application`·`check-in`·`group`·`home`·`updates`·`notifications`·`notices`·`schedule` 밖)
- 운영자의 신청 대리 수정·직접 추가(A12), 신청 취소(#338)
- 회비, 방, 차량
- 신청자 CSV([신청자 CSV](#post-apiv1operatoreventseventidapplicationsexport)) 밖의 Export, 공간 설정
- 행사 기간·장소·유형을 바꾸는 `PATCH`. 이름만 바꾼다
- 공간 소유권 이전의 전용 URL

`Permission` enum에 키가 있는 것은 그 업무의 API가 열렸다는 뜻이 아니다.

## 계약 초안 (아직 서버에 없다)

아래 경로는 **아직 서버에 없다.** 이 문서는 지금 서버가 받는 계약만 적으므로, 2주차(11/26~) 이후에 만들 경로의 계약 초안은 `docs/architecture`에 따로 둔다. 서버가 경로를 열면 그 절을 이 문서로 옮기고 초안에서 지운다. 그 전까지 이 문서의 다른 절과 초안이 다르면 이 문서(지금 서버)를 따른다.

| 영역 | 정책 | 계약 초안 | 경로 |
|---|---|---|---|
| 운영자 알림·운영자 갱신 확인 | DEC-080 | [participant-home-contract](../../docs/architecture/participant-home-contract.md) §7.5 | `GET·POST /operator/events/{eventId}/notifications…`, `GET /operator/events/{eventId}/updates` (참가자 홈·`updates`·알림은 위 [참가자 홈·갱신 확인·알림](#참가자-홈갱신-확인알림)으로 옮겼다) |
| 내 조(조원·조장이 보는 범위) | DEC-083 | [participant-group-contract](../../docs/architecture/participant-group-contract.md) | `GET /participant/group`의 새 응답(지금 응답은 위 [조 편성](#get-apiv1participantgroup)), `GET /participant/group/members/{participantId}`, `GET·PUT /operator/events/{eventId}/participant-settings` |

## 결정 문서와 다른 점

- [DEC-078](../../docs/product/PRODUCT_DECISIONS.md)이 DEC-064의 링크 접근 키를 이름·전화번호·숫자 6자리로 바꿨다. 이 서버와 맞는다. [API Architecture](../../docs/architecture/api-architecture-v0.1.md)의 DEC-064 절은 옛 계약이다.
- [DEC-064](../../docs/product/PRODUCT_DECISIONS.md) Follow-up (2026-10-21)은 참가자 세션 발급, `GET /api/v1/participant/me`, `POST /api/v1/participant/auth/logout`를 Phase 3보다 앞서 MVP에 넣었다. 이 서버와 맞는다. [API Architecture](../../docs/architecture/api-architecture-v0.1.md)와 [Security](../../docs/architecture/security-privacy-v0.1.md)는 아직 Phase 3로 적는다.
- [DEC-068](../../docs/product/PRODUCT_DECISIONS.md)의 질문 유형 9종, 질문·보기 표시 조건, 신청 접수 후 잠금, 숨겨진 답 버리기는 이 서버와 맞는다(#225). 운영자 빌더(#226)와 참가자 입력 화면(#227)도 이 계약을 쓴다. 서버는 예전 `{label}`·`{fieldId, text}` 요청도 그대로 받는다.
- [DEC-067](../../docs/product/PRODUCT_DECISIONS.md)의 개발용 로그인 profile gate, 로그인 body `email`, `SCENE_SESSION`·`SCENE_PSESSION`, 로그인 시 `changeSessionId()`는 이 서버와 맞는다. `local`·`test` 밖에서는 로그인 경로가 404다. 세션에 검증된 이메일이 없으면 초대 미리보기·수락은 `403 EMAIL_NOT_VERIFIED`다.
- DEC-064는 public 세션 POST의 CSRF를 구현 때 정할 메모로 둔다. 이 서버의 public 체인은 다른 변경 요청과 같이 CSRF 쿠키 `XSRF-TOKEN`과 헤더 `X-XSRF-TOKEN`을 요구한다.
