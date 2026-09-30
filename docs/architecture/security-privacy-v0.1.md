# SCENE Security / Privacy v0.1

[소스·상태 규칙](architecture-v0.1.md)에 따라 현재 요청·추가 참조 원문·회수된 대화를 정리한다. 상세 보안 설계·보존기간·법적 정책을 새로 결정하지 않는다.

## 1. 접근 개념 구분

| 개념 | 의미 |
|---|---|
| Authentication | 누구인지 확인 |
| Membership | 어느 Space에 소속되는지 |
| Event Access | 어느 Event에 접근할 수 있는지 |
| Authorization | 해당 행위를 수행할 Permission이 있는지 |
| Operational Responsibility | 누구의 어떤 운영 업무를 담당하는지 |

업무 담당이라는 이유로 모든 개인정보 접근권을 주지 않는다. 필요한 정보 조회 범위와 수정 권한·책임 범위는 동일하지 않을 수 있다.

- Space role: `OWNER / ADMIN / MEMBER`.
- Event role: `OWNER / MANAGER / STAFF`.
- Server-side authorization은 Permission 기반.
- 초기 구현 방향: Java enum + Role → Permission Set mapping. DB `permissions / role_permissions` 테이블은 만들지 않는다.
- [Permission 후보 목록](api-architecture-v0.1.md#permissions)과 실제 role mapping은 구분한다. 미제공 Role별 세부 허용 집합을 추가 확정하지 않는다.

## 2. 인증 영역과 Session

- `/api/v1/operator/**`: Operator 인증·권한 영역.
- `/api/v1/public/**`: 공개 Form 조회/최초 제출, Participant Access 검증 진입 영역.
- `/api/v1/participant/**`: Participant 인증 후 자신의 Event 운영정보 영역.
- Operator와 Participant 인증체계를 분리한다.
- 기본 방향: server-revocable session, `HttpOnly` / `Secure` / `SameSite` cookie, CSRF 보호, Production CORS는 SCENE Frontend allowlist.
- Operator와 Participant Session은 독립 관리. `scene_operator_session`, `scene_participant_session`은 원문에서 제시한 개념명이며 실제 cookie name 확정값으로 승격하지 않는다.
- Participant Session은 `participant_id`, `event_id`, `space_id` scope에 고정한다.
- Public 영역이라는 이유로 검증·brute-force 방어·공개 범위 검사를 생략하지 않는다.
- 정확한 session store, TTL, 복구 방식은 OPEN. Cookie 세부 설정·인증 공급자·credential 형식도 원문 없이 확정하지 않는다.

## 3. Participant Access

- Cryptographically secure random key, 최소 128-bit entropy 수준.
- 6자리 숫자·생년월일·전화번호 뒤 4자리·사용자 PIN은 credential로 사용하지 않는다. 이름/전화번호 뒤 4자리는 secret이 아니다.
- DB에는 `key_hash`만 저장. raw key 저장 금지.
- raw key를 URL에 넣지 않고 POST body로 검증.
- 검증 진입 경계: `/api/v1/public/events/{eventId}/participant-sessions`.
- 성공 후 Participant session으로 자신의 scope에 접근.
- Rate limit, 실패 monitoring, brute-force 방어 및 server-side revocation 가능해야 함. 정확한 rate limit 숫자는 미정.
- 최초 Application 성공에서 새 Access가 만들어지면 raw key는 그때 1회만 전달하는 기준.
- 키 복구·재발급, TTL, rate limit 숫자, idempotent retry 시 1회 전달 보장 방식은 OPEN. raw key 재저장을 새 해법으로 정하지 않는다.

## 4. Tenant isolation

Event API는 `eventId`를 tenant anchor로 사용하고 서버가 `spaceId`를 resolve한다. 요청 body의 tenant 값만 믿고 접근 범위를 정하지 않는다.

| 계층 | 책임 |
|---|---|
| Security | 인증, 접근 경계, Permission 확인 |
| Service | Event/Space 접근과 업무 조건 검증 |
| MyBatis | tenant condition을 포함한 데이터 접근 |
| DB | `space_id + event_id` 관계와 composite FK를 통한 tenant 간 잘못된 연결 방지 |

하위 resource ID에도 Event 소속 검사가 필요하다. UUID를 알거나 Event가 존재한다는 사실만으로 접근을 허용하지 않는다.

## 5. 데이터 분류와 응답

현재 분류: `PUBLIC / INTERNAL / PERSONAL / SENSITIVE / SECURITY`.

- List/Detail DTO 분리. Sensitive DTO 최소화.
- Participant의 응답은 자신의 scope로 제한. Finance 내부 메모·처리자 정보 등은 Participant 납부 조회에 노출하지 않는다.
- Guardian 연락처는 별도 contact 경계와 `GUARDIAN_CONTACT_READ`, `CONTACT_VIEW` privacy log 사용.
- Participant 연락처는 별도 `/participants/{participantId}/contact`, `PARTICIPANT_CONTACT_READ`, `CONTACT_VIEW` privacy log로 구분한다.
- Sensitive Data 추가 시 별도 Permission·field-level access 검토. 여권·건강 등을 미래 요구사항으로 확정하지 않는다.

## 6. 로그와 Export

- `privacy_logs`: 개인정보를 누가 조회·내보냈는지 기록.
- `audit_logs`: 무엇이 변경됐는지 기록.
- Audit before/after에 password, raw access key, session, raw sensitive field를 복사하지 않는다.
- Export: Authorization → export scope 기록 → privacy log `EXPORT` → audit → export 생성.
- Export 파일 저장소, Signed URL, job infrastructure와 비동기 처리 세부는 OPEN.
- 초기 `X-Request-Id`로 사용자 오류와 Backend log 연결. 분산 tracing 도입 시 `traceparent` / `tracestate` context와 개념을 구분한다. 오류의 `traceId`와 정확한 값 매핑은 상세 계약에서 정한다.

## 7. Retention / Anonymization / Deletion

- Retention: 목적에 따른 보존기간·정책.
- Anonymization: 식별 가능한 정보를 익명화하는 업무 처리.
- Deletion: 삭제. 모든 Domain에 일괄 DELETE를 강제하지 않는다.
- 데이터 등급과 목적에 따라 `delete / pseudonymize / anonymize / retain`을 구분한다. 가명처리와 익명화를 동일 처리로 합치지 않는다.
- Event `ENDED`는 즉시 DELETE를 의미하지 않는다.
- Participant 익명화는 일반 CRUD 삭제 대신 여러 Domain에 걸친 command / transaction / process 경계로 다룬다.
- PERSONAL, SENSITIVE, INTERNAL, 보안·감사 기록은 서로 다른 보존 목적을 고려한다. 대화의 `SECURITY-AUDIT` 표현은 보존 목적을 설명하며 여섯 번째 데이터 등급을 추가한 것으로 확정하지 않는다.
- 익명화 대상 필드와 보존기간은 별도 정책에서 확정한다.

## 8. OPEN

Session store/TTL/복구, Access 재발급, OWNER cardinality/transfer, Role별 Permission mapping 상세, 민감 필드 접근, 보존기간·익명화 필드, Export infrastructure, QR credential 구조는 OPEN 또는 원문 대조 필요.

전체 업무 OPEN 목록: [API Architecture](api-architecture-v0.1.md#open-items).
