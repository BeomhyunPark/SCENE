# 백엔드 소스 안내

처음 이 디렉터리를 연 사람이 코드를 따라갈 수 있게 적은 지도다. 실행 방법과 로컬 시드 계정은 [README](../README.md)에 있다. 지금 서버가 받는 요청과 응답, 쿠키, 로컬 호출 순서는 [API](api.md)에 있다. 제품 결정의 근거는 저장소 루트의 `docs/architecture`와 `docs/product`에 있다. 이 문서는 그 결정을 다시 적지 않고, 지금 소스에서 어느 파일을 열면 되는지만 적는다.

코드와 이 문서의 경로가 다르면 코드를 따른다. 설계 문서 표지(`docs/README.md`)는 결정 baseline이고, 실행되는 서버는 `backend/`다. 각 설계 문서 안의 "implementation 전"은 그 문서를 적을 때의 상태다.

관련 이슈: [#87](https://github.com/BeomhyunPark/SCENE/issues/87), [#93](https://github.com/BeomhyunPark/SCENE/issues/93).

## 한 줄

하나의 Spring Boot 프로세스다. 모듈 경계는 패키지다. 데이터는 PostgreSQL 하나이고, SQL은 MyBatis XML이며, 스키마는 Flyway가 넣는다.

진입점은 `src/main/java/app/scene/SceneApplication.java`다. 기본 사용자 자동 설정은 빼 두었다. 로그인은 `OperatorSessionController`가 직접 세션을 만든다.

## 처음 여는 순서

1. [README](../README.md)로 서버를 띄우고, 시드 사용자 id로 `POST /api/v1/operator/auth/login`을 본다.
2. 이 문서의 패키지 지도와 요청 층을 본다.
3. `SceneApplication` 다음으로 `common/security/SecurityConfiguration.java`를 연다. URL이 어느 필터 체인으로 들어가는지가 여기 있다.
4. 업무 목록 한 줄을 끝까지 따라간다.
   `event/task/TaskCommandController`
   → `OperatorTaskCommandService`
   → `event/lifecycle/EventAccessGate`
   → `TaskCommandService`
   → `TaskRepository`
   → `event/task/mapper/TaskMapper.java`와 `src/main/resources/mapper/TaskMapper.xml`
5. 패키지 방향을 어기면 깨지는 규칙은 `src/test/java/app/scene/ArchitectureTest.java`다.

기능 하나를 읽을 때는 컨트롤러의 URL부터 연다. 패키지 전체를 위에서 내려다보지 않는다.

## 고칠 때 여는 파일

| 고치는 것 | 먼저 여는 파일 |
| --- | --- |
| URL, 상태 코드, 누가 호출했는지 | 해당 `*Controller` |
| 행사를 열 수 있는지 | `event/lifecycle/EventAccessGate` |
| 공간 경로의 멤버십, `GET /spaces/{spaceId}/events/{eventId}` | `common/tenant/OperatorAccess` |
| 역할 기본값과 GRANT/REVOKE | `common/permission/RoleDefaults`, `PermissionEvaluator` |
| 로그인 쿠키 | `identity/OperatorSessionController`, `common/security/SecurityConfiguration` |
| CSRF 쿠키 이름과 `Secure` | `SecurityConfiguration`의 `shared` |
| 초대 토큰이 어디로 가는지 | `event/invitation/CapturingInvitationMailer` |
| 업무 저장 | `event/task/TaskCommandService` 또는 `TaskProgressService` |
| SQL | `src/main/resources/mapper/`의 같은 이름 XML |

초대 메일은 SMTP로 나가지 않는다. `InvitationMailer`의 구현은 `CapturingInvitationMailer` 하나이고, 링크를 그 프로세스의 리스트에만 넣는다. 응답 JSON과 로그에는 토큰이 없다.

CSRF를 받는 주소는 없다. 변경 요청은 쿠키 `XSRF-TOKEN`과 헤더 `X-XSRF-TOKEN`에 같은 값을 넣는다. 세션 쿠키 값은 Base64가 아닌 세션 id다. 속성과 로컬 `curl`은 [API](api.md)의 공통 절과 로컬 호출 절에 있다.

## 패키지 지도

방향은 한쪽으로만 간다. `ArchitectureTest`가 컴파일된 클래스로 검사한다.

```text
common  ←  identity, space, event 가 써도 된다
identity, space  ←  event 가 써도 된다
event 를 identity, space, common 이 import 하면 안 된다
```

| 패키지 | 두는 것 | 대표 파일 |
| --- | --- | --- |
| `app.scene.common` | 오류, 보안 필터, 페이지, 권한 계산, 테넌트 조회, 감사 로그, 시계 | `error/ErrorCode`, `security/SecurityConfiguration`, `permission/PermissionEvaluator`, `tenant/OperatorAccess` |
| `app.scene.identity` | 운영자 계정과 세션 로그인 | `OperatorSessionController`, `OperatorPrincipal` |
| `app.scene.space` | 공간 멤버, 행사 운영자 행, 권한 override 행, 담당자 행 | `EventUserRepository`, `MembershipLeaveService`, `OperatorSpaceController` |
| `app.scene.event` | 행사 HTTP와 그 트랜잭션 | `lifecycle`, `invitation`, `task`, `operator`, `permission`, `transfer` |

`common` 안에 도메인 규칙을 넣지 않는다. 권한 키와 역할 기본값, 접근 행 조회는 여러 도메인이 같이 써서 `common`에 있다. 행사 상태 전이나 업무 저장은 `event`에 있다.

### 행사 운영자 코드가 `space`에 있는 이유

테이블 이름은 `event_users`다. Java 저장 코드는 `app.scene.space`에 있다. `event`가 `space`를 호출하고, `space`는 `event`를 import하지 않기 때문이다. 운영자 목록 HTTP는 `event/operator/EventOperatorController`에 있고, 그 컨트롤러가 `space`의 저장소를 쓴다.

담당자를 비우는 코드도 `space/TaskAssigneeRepository`에 있다. 이 저장소는 `tasks.assignee_user_id`만 지운다. 업무의 생성과 수정은 `event/task`다.

## 파일 이름

한 기능 폴더 안에서는 이름이 역할을 말한다.

| 이름 | 역할 |
| --- | --- |
| `*Controller` | URL, HTTP 상태, 로그인 사용자 id. 저장은 하지 않는다. |
| `Operator*Service` | 행사를 열고, 권한을 보고, JSON으로 바꿀 응답을 만든다. 업무 명령 쪽은 트랜잭션을 걸지 않는다. 409를 돌려준 뒤에도 롤백된 행을 다시 읽을 수 있게 하려고다. |
| `*Service` | 실제 변경. `@Transactional`이 여기 있다. |
| `*Repository` | MyBatis를 호출한다. 조회 키에 `spaceId`와 `eventId`를 같이 넘긴다. |
| `mapper/*Mapper` | INSERT, UPDATE, DELETE. |
| `mapper/*QueryMapper` | SELECT. |
| `param/*` | SQL에 넘기는 값 묶음. |
| `*Row` | DB에서 읽은 한 행. API로 그대로 나가지 않는다. |
| `*Response`, `*View`, `*Item` | JSON. |

XML은 Java 패키지와 따로 있다. 인터페이스는 `src/main/java/.../mapper/`에 있고, SQL은 `src/main/resources/mapper/*.xml`에 있다. 파일 이름이 같다. `application.yml`의 `map-underscore-to-camel-case`가 `space_id`를 `spaceId`로 맞춘다.

업무를 예로 들면 층이 둘이다.

- `OperatorTaskCommandService`가 HTTP 경계를 담당한다. 목록, 상세, 생성 응답의 모양은 여기 있다.
- `TaskCommandService`가 생성, 수정, 삭제의 트랜잭션을 담당한다. `TASK_WRITE`도 여기서 다시 본다.

진행(체크, 완료, 다시 열기)도 같다. `OperatorTaskProgressService`가 HTTP이고 `TaskProgressService`가 트랜잭션이다.

## 요청이 지나가는 길

운영자 업무 목록 `GET /api/v1/operator/events/{eventId}/tasks` 기준이다.

1. `SecurityConfiguration`의 operator 체인이 세션을 본다. 세션이 없으면 `AUTHENTICATION_REQUIRED`(401)다.
2. `TaskCommandController`가 `OperatorPrincipal`에서 사용자 id를 꺼낸다.
3. `EventAccessGate.open`이 행사와 멤버십을 연다. 없는 행사는 `RESOURCE_NOT_FOUND`(404)다. 접근이 끊긴 운영자는 `NOT_A_MEMBER`(403)다.
4. 읽기 권한이 없으면 `FORBIDDEN`(403)이다.
5. `TaskRepository`가 `spaceId`와 `eventId`로 목록을 읽는다.
6. 컨트롤러가 `ItemPage`를 반환한다. 모양은 `items`와 `page`다.

로그인 사용자는 스프링 시큐리티 컨텍스트의 `OperatorPrincipal`이다. 컨트롤러가 `SecurityContextHolder`에서 꺼낸다. 메서드 인자로 사용자 id가 들어오지 않는다.

## 로그인과 세 개의 필터 체인

`SecurityConfiguration`이 체인을 세 개 둔다. 순서는 order 값이다.

| 순서 | 경로 | 세션 | 지금 제품 컨트롤러 |
| --- | --- | --- | --- |
| 1 | `/api/v1/operator/**` | Spring Session JDBC. 쿠키 값은 세션 id다. | 있다. 아래 HTTP 표. |
| 2 | `/api/v1/participant/**` | 서버 메모리의 `ChainSessionRegistry` | 없다. 테스트의 probe만 있다. |
| 3 | `/api/v1/public/**` | 세션을 만들지 않는다. | 없다. 테스트의 probe만 있다. |

`POST /api/v1/operator/auth/login`만 로그인 없이 열린다. 나머지 operator 경로는 세션이 필요하다. 로그인 본문은 `users.id`다. 비밀번호 검사는 없다. 자격 증명 형식은 아직 정해지지 않았다. 없는 id는 세션을 만들지 않고 401이다.

쿠키 이름 `placeholder-operator-session`, `placeholder-participant-session`과 CORS origin `http://scene-frontend.placeholder.invalid`은 자리표시자다. `application.yml`이 그 값의 출처다. SameSite는 속성을 넣기 위한 `Lax`다. 제품 결정이 아니다.

CSRF 쿠키는 `XSRF-TOKEN`, 헤더는 `X-XSRF-TOKEN`이다. 변경 요청은 둘을 맞춘다.

`/actuator/health`는 세 체인 밖에 있다.

참가자 로그인, 공개 신청, 공개 조회를 찾을 때는 제품 컨트롤러가 아직 없다는 점을 먼저 본다. 필터 체인은 그 경로를 막아 두려고 있다.

## 접근과 권한

접근 검사는 두 입구다. 역할을 합쳐서 읽지 않는다.

`common/tenant/OperatorAccess`는 공간 경로와, 행사 한 건을 운영자 행으로 바로 여는 경로가 쓴다.

- 행사 행이 없거나, 운영자도 아니고 접근 취소 기록도 없으면 404다.
- 운영자가 아니면 `NOT_A_MEMBER`다.
- 운영자인데 `EVENT_READ`가 없으면 `FORBIDDEN`이다.
- 공간 조회는 멤버십 행이 없으면 404, 상태가 `ACTIVE`가 아니면 `NOT_A_MEMBER`다.

`event/lifecycle/EventAccessGate`는 라이프사이클과 업무 HTTP가 같이 쓴다. 모르는 사람은 404, 제거된 운영자는 `NOT_A_MEMBER`, 공간 멤버십이 끝난 사람도 `NOT_A_MEMBER`다. 활성 공간 멤버는 행사 운영자 행이 없어도 여기까지는 통과하고, 그 다음 권한 검사에서 갈린다. 공간 `OWNER`는 행사 행이 없어도 읽기가 된다.

권한 계산은 `PermissionEvaluator`다. 결과는 역할 기본값에 `GRANT`를 더하고 `REVOKE`를 뺀 집합이다. 세션에 저장하지 않는다. 요청마다 `event_user_permissions`를 읽는다.

역할 기본값은 `RoleDefaults`에만 있다.

| 행사 역할 | 지금 코드가 주는 키 |
| --- | --- |
| `OWNER` | `Permission`에 등록된 전부 |
| `MANAGER` | `EVENT_READ`, `TASK_WRITE` |
| `STAFF` | `EVENT_READ` |
| 그 외 | 없음 |

`EVENT_LIFECYCLE`과 `EVENT_USER_MANAGE`는 소유자만 가진다. `GRANT`로 넘길 수 없다. `EVENT_READ`는 `REVOKE`로 빼지 않는다. 운영자 제거가 그 접근을 끊는다. MANAGER와 STAFF의 나머지 기본값은 승인 전까지 비어 있다. `Permission` enum에 키가 있어도 기본값으로 들어가 있다는 뜻은 아니다.

인수인계로 소유 권한이 끝난 `OWNER`는 역할 기본값을 잃는다. 그 사람에게 남아 있는 것은 저장된 `GRANT`뿐이다.

## 지금 열려 있는 HTTP

모두 `/api/v1/operator` 아래다.

| 하는 일 | 컨트롤러 |
| --- | --- |
| 로그인, `GET /me`, 로그아웃 | `identity/OperatorSessionController` |
| 공간 이름 조회 | `space/OperatorSpaceController` |
| 행사 한 건 조회 | `event/OperatorEventController` |
| 활성화, 종료, 다시 열기, 보관, 보관 해제, 전이 목록 | `event/lifecycle/EventLifecycleController` |
| 초대 생성, 재발송, 취소, 미리보기, 수락 | `event/invitation/EventInvitationController` |
| 운영자 목록과 역할, 권한 override | `event/operator/EventOperatorController` |
| 업무 목록, 생성, 상세, 수정, 삭제 | `event/task/TaskCommandController` |
| 체크 항목, 완료, 다시 열기 | `event/task/TaskProgressController` |

초대 수락도 operator 경로다. 수락하는 사람은 운영자 세션으로 들어와 있다. 공개 URL이 아니다.

전용 URL이 없는 동작도 있다.

- 운영자 제거는 `OperatorPermissionService`가 `MembershipLeaveService.revokeEventAccess`를 호출한다.
- 공간 탈퇴와 소유권 이전은 서비스와 통합 테스트에 있다. 탈퇴용 컨트롤러는 없다.

오류 본문은 `application/problem+json`이다. 분기 값은 `code`다. 등록부는 `common/error/ErrorCode`다. `SceneException`을 던지면 `SceneExceptionHandler`가 상태로 바꾼다. 모르는 예외의 메시지는 응답에 넣지 않는다. 헤더 `X-Request-Id`와 본문 `traceId`는 같은 값이다.

## 데이터베이스

Flyway만 스키마를 쓴다. `V1__baseline.sql`이 제품 테이블이고, `V2__spring_session.sql`이 운영자 세션이다.

`V1`에 있는 테이블은 `users`, `spaces`, `members`, `events`, `event_users`, `event_user_permissions`, `event_invitations`, `event_lifecycle_transitions`, `operator_notices`, `owner_transfers`, `tasks`, `task_checklist_items`, `audit_logs`다.

행사 아래 행은 `space_id`와 `event_id`를 같이 가진다. 조회도 그 둘을 같이 넘긴다. id 하나만으로 찾은 뒤 서비스에서 공간을 비교하는 형태를 기본으로 두지 않는다.

`local` 프로파일만 `db/seed/R__local_seed.sql`을 넣는다. dev, stg, prod와 테스트는 이 시드를 쓰지 않는다. 테스트는 Testcontainers의 PostgreSQL을 띄운다.

설계 문서의 참가자, 신청, 재정, 조, 방, 차량, 체크인 테이블은 이 마이그레이션에 없다.

## 테스트

`./gradlew check`가 포맷(`spotlessCheck`)과 테스트를 같이 돌린다. 통합 테스트는 Docker가 필요하다.

| 고친 곳 | 같이 보는 테스트 |
| --- | --- |
| 패키지가 서로를 import하는 방향 | `ArchitectureTest` |
| 필터 체인, CSRF, 세션 쿠키 | `common/security/SecurityChainsIT` |
| 오류 JSON | `common/error/ProblemDetailsIT` |
| 권한 계산 | `common/permission/PermissionEvaluatorTest` |
| 테넌트와 탈퇴 뒤 조회 | `space/OperatorTenantIsolationIT` |
| 탈퇴와 접근 취소 | `space/MembershipLeaveRevokeIT` |
| 행사 상태 전이 HTTP | `event/lifecycle/EventLifecycleHttpIT` |
| 초대 | `event/invitation/EventInvitationIT`, `EventInvitationAcceptIT` |
| 운영자와 권한 override | `event/operator/EventOperatorIT`, `OperatorPermissionHttpIT` |
| 업무 명령 | `event/task/TaskCommandHttpIT` |
| 체크와 완료 | `event/task/TaskProgressHttpIT` |
| 여러 기능이 한 행사에서 맞는지 | `event/LifecycleAndTaskIT`, `event/ServerContractRegressionIT` |
| 로컬 시드 | `LocalSeedIT` |

이름 끝의 `IT`는 PostgreSQL을 띄운다. `Test`는 띄우지 않는다. 보안 테스트 안의 `/api/v1/participant/probe`와 `/api/v1/public/probe`는 제품 API가 아니다.

## 아직 코드에 없는 것

다음을 소스에서 찾아도 컨트롤러가 없다.

- 참가자 세션으로 하는 제품 API
- 공개 신청, 공개 조회
- 비밀번호, 토큰 로그인
- SMTP. 초대 링크는 `CapturingInvitationMailer`의 메모리에만 있다
- 참가자, 신청서, 회비, 조, 방, 차량, 체크인 테이블과 그 API
- MANAGER와 STAFF에 대한 `TASK_WRITE` 외의 승인된 기본 권한

`Permission`에 키가 있는 것은 그 API가 열렸다는 뜻이 아니다. `OWNER`는 등록된 키를 모두 갖고, 그 키를 쓰는 명령은 각 서비스에 있을 때만 동작한다.
