# SCENE Security / Privacy v0.1

[소스·상태 규칙](architecture-v0.1.md)에 따라 현재 요청·추가 참조 원문·회수된 대화를 정리한다. 상세 보안 설계·보존기간·법적 정책을 새로 결정하지 않는다.

## 1. 접근 개념 구분

| 개념 | 의미 |
|---|---|
| Authentication | 누구인지 확인 |
| Membership | 어느 Space에 소속되는지. 행사 전용 협력자는 조직 Membership 없이 접근 가능 |
| Event Access | 어느 Event에 접근할 수 있는지 |
| Authorization | 해당 행위를 수행할 Permission이 있는지 |
| Operational Responsibility | 누구의 어떤 운영 업무를 담당하는지 |

일반 행사 운영진은 담당 업무에 맞게 정보 접근권을 부여한다. 조직 관리자와 그룹 리더의 조회 범위는 아래 후속 결정에 따른다. 필요한 정보 조회 범위와 수정 권한·책임 범위는 동일하지 않을 수 있다.

- Space role: `OWNER / ADMIN / MEMBER`.
- Event role: `OWNER / MANAGER / STAFF`.
- Server-side authorization은 Permission 기반.
- 초기 구현 방향: Java enum + Role → Permission Set mapping. DB `permissions / role_permissions` 테이블은 만들지 않는다. (2026-10-02 현 결정: role 기본 집합은 그대로 enum mapping이고 위 두 테이블도 만들지 않는다. 다만 Role만으로 권한이 정해진다는 해석은 대체한다. 사람별 GRANT/REVOKE를 `event_user_permissions`에 저장하고 effective 집합으로 판정한다. [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합))
- [Permission 후보 목록](api-architecture-v0.1.md#permissions)과 실제 role mapping은 구분한다. 미제공 Role별 세부 허용 집합을 추가 확정하지 않는다(role 기본값은 계속 OPEN이다. 예외: `TASK_WRITE` 기본값은 2026-10-02 DEC-062로 확정([아래 절](#2026-10-02-업무-처리-권한-31-dec-062)), 사람별 GRANT/REVOKE는 #39로 확정([아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합))).

### 2026-09-30 사용자 답변 반영

[DEC-028~030](../product/PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다)에 따라 조직 관리자에게 행사 운영진 지정 없이도 같은 조직 행사의 개인별 정보·정산 상세를 포함한 전체 조회를 허용하지만, 행사 수정은 별도 권한이다. 행사 운영진은 담당 업무에 따라 사람별 권한을 달리 부여한다. 그룹 리더는 자기 그룹원의 연락처·신청 정보를 포함한 전체 정보·리더용 정보, 참가자는 자기 정보·참가자용 안내를 본다.

기존 Role → Permission Set 기준만으로 개별 운영자 권한을 표현할 수 있는지 재검토해야 한다. 개별 권한 저장 구조·기본값·부여자·회수 방식은 OPEN이며 새 권한 테이블을 확정하지 않는다. (2026-10-02 현 결정으로 저장 구조(`event_user_permissions`)·부여자(Event Owner)·회수 방식(운영자 제거·role 변경 시 삭제)을 확정했다. MANAGER/STAFF 기본 집합은 미확정, 백엔드 리드 초안 대기(현 결정 10/2: Backend Lead 초안, 현 승인). 예외: `TASK_WRITE` 기본값은 DEC-062로 확정. [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)) 조직 관리자 전체 조회와 리더의 자기 그룹원 전체 조회 범위는 사용자 추가 답변으로 확정했다. 정보 분류와 권한 없음 화면·서버 일치 기준은 DEC-031 및 [확정 정책](../product/access-policy-review.md)을 따른다. 서버 Permission·tenant·resource 소속 검사는 계속 적용한다.

### 2026-10-02 업무 처리 권한 (#31, DEC-062)

[#31 현 결정 기록 (10/2)](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946079736)에 따른 업무 체크·완료·다시 진행의 권한 판정이다. endpoint·오류 코드는 [API Architecture](api-architecture-v0.1.md#2026-10-02-업무-체크리스트-저장-계약-31-dec-062) §8의 같은 날짜 절을 따른다.

- `TASK_WRITE` role 기본값: Event OWNER·MANAGER는 포함, STAFF는 미포함. 위 "미제공 Role별 세부 허용 집합을 추가 확정하지 않는다"의 예외로 `TASK_WRITE`만 확정한다. 나머지 키의 role별 기본값은 계속 OPEN이다.
- 유효 `TASK_WRITE` = role 기본값 + 사람별 GRANT − REVOKE([개인별 권한](#2026-10-02-개인별-권한-현-결정-dec-029-정합), 현 결정 10/2). 사람별 GRANT/REVOKE는 Event Owner만 한다.
- 담당자 본인 규칙: 업무 담당자(업무당 1명)는 유효 `TASK_WRITE` 없이도 자기 업무를 체크·완료·다시 진행할 수 있다. `TASK_WRITE`가 REVOKE돼도 자기 담당 업무는 처리할 수 있다. 처리 권한을 빼려면 담당을 바꾼다(담당 지정·변경은 `TASK_WRITE`).
- 담당자가 아닌 운영자는 유효 `TASK_WRITE`가 있어야 남의 업무를 체크·완료·다시 진행할 수 있다. 없으면 403 `FORBIDDEN`이다.
- 조직 관리자(Space OWNER/ADMIN)는 행사 운영자가 아니어도 업무를 조회할 수 있지만 쓰기는 403이다(DEC-028). 그룹 리더 역할만으로는 업무 쓰기 권한이 생기지 않는다(DEC-030).
- 서버는 매 요청 현재 권한·담당 여부로 다시 판정하고 화면 버튼 상태도 같은 판정을 따른다(DEC-031). 행사 접근이 회수된 세션은 403 `NOT_A_MEMBER`(#30 코멘트 기준, 제안)를 받는다.
- 응답의 운영자 참조는 `assigneeUserId`·`checkedByUserId`·`completedByUserId`(= `event_users.user_id`, #39와 같은 식별자)와 각 `…DisplayName`만 담고 연락처를 넣지 않는다(DEC-060).
- 운영자 제거(행사 접근 회수 포함) 시 같은 transaction에서 그 사람이 담당인 업무를 미배정(`assignee_user_id` = NULL)으로 바꾸고 audit을 남긴다. 업무는 삭제하지 않는다. 체크·완료 기록(`checked_by_user_id`·`completed_by_user_id`)은 남으며, 제거된 사람은 이후 요청부터 담당자 규칙으로 업무를 처리할 수 없다.
- 상태가 바뀐 업무 쓰기만 `audit_logs`에 남긴다.

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

Session store/TTL/복구, Access 재발급, OWNER cardinality/transfer, Role별 Permission mapping과 개별 권한 판정 상세(2026-10-02: 개별 권한 판정은 [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)로 확정, MANAGER/STAFF 기본 mapping은 미확정, 백엔드 리드 초안 대기. 예외: `TASK_WRITE`는 2026-10-02 DEC-062로 확정), 일반 운영진의 민감 필드 접근, 보존기간·익명화 필드, Export infrastructure, QR credential 구조는 OPEN 또는 원문 대조 필요. 조직 관리자와 그룹 리더의 전체 조회 범위는 위 후속 결정으로 확정했다.

전체 업무 OPEN 목록: [API Architecture](api-architecture-v0.1.md#open-items).


## 2026-09-30 Owner·책임 이전 후속 정책

[DEC-032~035](../product/PRODUCT_DECISIONS.md#dec-032--조직행사-owner는-복수-가능하며-같은-사람이-두-역할을-맡을-수-있다)에 따라 조직·행사 Owner는 복수 가능하고 같은 사람이 두 역할을 맡을 수 있다. 수락 T0에 새 Owner가 즉시 권한을 받고, 넘긴 사람의 해당 Owner·인수인계 권한만 T0+14일에 종료한다. 다른 조직·행사 역할과 별도 권한은 유지한다.

업무 상태 PENDING에서는 요청자 취소·수신자 거절, HANDOVER에서는 양쪽 취소, COMPLETED에서는 취소 불가·새 위임 시작으로 처리한다. 취소는 위임·인수인계와 해당 권한·책임 이전 상태만 복구하고 실제 행사 작업 데이터는 유지한다. 위임과 Membership 종료는 별도다.

마지막 Owner 이탈은 후임 수락 전 차단하고 탈퇴·제거 전 남은 행사 책임·준비 업무의 인수자 수락을 검사한다. 조직 Owner는 행사 책임구조 복구를 시작하고 새 담당자를 지정해 수락을 받는다. 긴급 상황에서는 기존 담당자 접근을 먼저 차단하고 책임자 지정 필요 상태를 표시할 수 있다. 조직 Owner를 모든 행사의 상시 Owner로 자동 지정하지 않는다.

기존 OWNER cardinality·transfer 전체가 미정이라는 설명은 위 제품 정책에 한해 갱신한다. 상세 관계·권한 저장·만료·동시성·세션·endpoint/DTO와 책임자 지정 상태의 저장 방식은 기술 설계에서 정한다. 업무 상태명을 DB enum으로 자동 확정하거나 행사 lifecycle에 새 상태를 임의 추가하지 않는다. 모든 조직 Owner의 접근 불가 상황은 별도 Account/Organization Recovery 정책으로 남긴다. [검토 결과](../product/owner-handover-review.md)에 적용 범위와 후속 #5·#8·#9·#10을 기록한다.


## 2026-09-30 조직 가입·행사 전용 협력자 후속 정책

[DEC-036~039](../product/PRODUCT_DECISIONS.md#dec-036--검증된-조직-생성자가-최초-owner가-된다)와 [검토 결과](../product/organization-entry-review.md)를 적용한다. 검증된 생성자가 최초 Owner가 되고, 조직 검색 가입 요청은 조직 Owner 승인, 대상자 조직 초대는 수락만으로 MEMBER가 된다. 대기 사용자는 조직 내부 정보를 보지 못한다. 초대는 대상 계정·범위·만료·1회 소비를 검증한다. 7일은 제안값이며 정확한 TTL은 상세 계약에서 정한다.

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

- Event 권한은 `event_users` role과 개인별 업무 권한에서만 판정한다. (2026-10-02: 개인별 업무 권한 = `event_user_permissions`, [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)) Space 범위 API(조직 설정·구성원 목록·다른 행사)는 활성 Membership을 요구한다.
- 행사 전용 협력자에게 다른 운영자는 이름·역할만 노출하고 연락처는 숨긴다.
- 관리자에 의한 멤버 제거 시 해당 Space 행사 접근을 기본으로 전체 회수하고, 유지할 행사만 명시 선택하며 남는 접근권을 표시한다.
- 초대 토큰: 128비트 이상 CSPRNG 난수, DB에는 `token_hash`만 저장. 링크의 fragment(#)로 전달하고 POST body로 검증해 서버 로그·Referer 노출을 막는다.
- 프론트 토큰 보관: 로그인 전 `localStorage`에 보관 시각과 함께 저장하고, 수락 성공(200 `outcome: ACCEPTED`), 30분 경과, 로그아웃 중 먼저 오는 시점에 삭제한다. 미리보기 성공(200 `outcome: PENDING`)은 토큰을 지우지 않고, 미리보기가 401이면 토큰을 유지한 채 로그인으로 보낸다. (2026-10-02 보강, #27) 미리보기·수락이 종결 결과(404 `INVITATION_NOT_FOUND`, 410 `INVITATION_EXPIRED`/`INVITATION_REVOKED`/`INVITATION_SUPERSEDED`, 409 `INVITATION_ALREADY_ACCEPTED`, 200 `outcome: ALREADY_ACCEPTED`)를 돌려주면 즉시 토큰을 지운다. 401, 429, 403 `INVITATION_EMAIL_MISMATCH`와 그 밖의 응답(5xx, 네트워크 오류·시간 초과, 목록에 없는 4xx)에서는 유지한다. (2026-10-02 #27) 예외: 이메일 불일치 화면(15)의 '계정 바꾸기' 로그아웃은 토큰을 유지하되 최초 보관 시각 기준 30분을 넘기지 않으며 보관 시각을 갱신하지 않는다. '돌아가기'는 토큰을 지우고 S00으로 간다. 로그인 리다이렉트 URL에 싣지 않는다. 다른 탭에서 로그인(이메일 인증 링크 등)한 뒤 돌아와도 수락을 이어갈 수 있게 하기 위함이며, 수락은 대상 이메일 로그인이 필수라 탭 간 공유 위험은 제한적이다.
- 로그인 전에는 서버를 호출하지 않고 단일 안내 화면을 보여 토큰 존재 여부를 드러내지 않는다. 로그인 후 판정 순서는 토큰 조회 → 이메일 일치 → 상태이며, 회수·만료 등 상태는 대상 이메일로 로그인한 사용자에게만 보인다.
- (2026-10-02 #27) 미리보기·수락 모두 계정별·IP별 rate limit을 두고 초과 시 429를 반환한다(정확한 숫자는 미정). 대상이 아닌 계정은 `INVITATION_NOT_FOUND` 또는 `INVITATION_EMAIL_MISMATCH`만 받고, 불일치 화면의 대상 이메일은 마스킹해 보여 준다.

## 2026-10-01 보존·삭제·Export 처리 계약 (DEC-061)

- 참가자 데이터는 교회(조직)가 개인정보처리자, SCENE은 수탁자다. 운영자 계정 데이터는 SCENE이 처리자다. 법률 검토 후 이 항목만 다시 열 수 있다.
- 개인정보 정리는 Event OWNER·Space OWNER만 실행한다. 범위는 식별값·개인정보 응답·자유서술·첨부·과거 revision이며 비식별 운영 기록은 유지한다.
- 행사 최종 삭제는 Event Owner 요청 → Space OWNER 실행이며 재인증과 행사명 입력 확인을 받는다. 미리보기에 삭제/별도 보존 데이터를 표시한다.
- Export: 생성 시 권한·범위 검사, 민감 필드 포함 시 재인증. 다운로드마다 현재 권한·범위를 재검사하고 수 분짜리 URL을 발급한다. 생성과 다운로드를 각각 `privacy_logs`에 기록한다. 권한 회수 후 추가 다운로드를 차단하며 이미 받은 파일의 회수는 보장하지 않는다.
- 백업 복원: 삭제 원장을 복원 후 서비스 재개 전에 다시 적용해 삭제·익명화된 개인정보가 재노출되지 않게 한다.
- ARCHIVED는 운영 편집 읽기 전용이지만 개인정보 정리와 허용된 Export는 가능하다.
- 기기 임시 변경은 계정+기기 범위로 두고 로그아웃·권한 회수 시 삭제한다.
- 미정: 데이터 종류별 보존기간, 삭제 유예기간, 백업 소멸기간, Export 파일 수명, 기기 임시 데이터 최대 보관기간, 미성년·보호자 처리 기준.

## 2026-10-02 개인별 권한 (현 결정, DEC-029 정합)

2026-10-02 현 결정(SCENE 개발 리드 전달)으로 DEC-029의 사람별 권한을 role 기본값 + `event_user_permissions` GRANT/REVOKE로 구현한다. 저장 구조는 [Data Model](data-model-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합), endpoint·오류 코드·회귀 표는 [API Architecture](api-architecture-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 같은 이름 절에 둔다.

- 판정: Event Authorization은 effective 집합(role 기본 + GRANT − REVOKE)으로 한다. 모든 Event API 요청마다 서버가 다시 계산해 검사하고, 화면의 숨김·읽기 전용·비활성화도 같은 집합을 따른다(DEC-031). 클라이언트가 보낸 권한 목록이나 화면 상태를 믿지 않는다. 권한을 세션에 고정하지 않으며 캐시를 두더라도 override·role 변경·운영자 제거 시 즉시 무효화한다.
- role 기본 집합은 계속 Java enum mapping이고 DB `permissions / role_permissions` 테이블은 만들지 않는다. 사람별 차이만 저장한다.
- 부여자 (현 결정 10/2): 해당 행사의 Event OWNER만 운영자를 관리한다. 운영자 추가·제거·role 변경과 override 변경이 모두 여기에 든다. `EVENT_USER_MANAGE`는 OWNER 전용이며 GRANT할 수 없다. MANAGER·STAFF와 행사 운영자가 아닌 Space OWNER/ADMIN은 바꿀 수 없다(403 `FORBIDDEN`). 그래서 MANAGER가 role을 바꿨다 되돌리거나 제거 후 재추가해 Owner의 REVOKE를 지우는 경로가 없다. 조직 관리자의 전체 조회(DEC-028)는 수정 권한을 주지 않는다.
- 조회 (현 결정 10/2): 개인별 권한 GET은 Event OWNER(모든 운영자), 본인(자기 행), Space OWNER(조회만)만 할 수 있다. Space ADMIN을 포함한 그 밖은 403 `FORBIDDEN`이다. 권한 없는 호출자에게는 대상이 운영자인지 드러내지 않는다(403이 404보다 앞섬).
- DEC-060 우선 (현 결정 10/2): 행사 전용 협력자에게 다른 운영자의 연락처를 숨기는 DEC-060 규칙은 어떤 GRANT보다 앞선다. `EVENT_USER_READ`, `PARTICIPANT_CONTACT_READ` 등 어떤 GRANT로도 풀 수 없다.
- OWNER 경계: OWNER role의 권한은 override하지 않는다(OWNER 대상 GRANT·REVOKE 거절). OWNER 전용 키(Owner 위임, 행사 삭제 요청, 개인정보 정리, 행사 lifecycle 전이, 운영자·권한 관리)는 OWNER가 아닌 운영자에게 GRANT하지 않는다(422). 외부 협력자는 OWNER가 될 수 없으므로(DEC-060) OWNER 전용 권한을 얻는 경로가 없다.
- GRANT는 업무 범위를 넓힐 뿐 정보 분류·tenant·resource 소속 검사, 민감 Export 재인증(DEC-061), privacy log 기록을 생략하지 않는다. `DATA_EXPORT` GRANT도 Export 다운로드마다 현재 effective 집합으로 다시 검사하며 REVOKE 후 추가 다운로드를 막는다.
- Audit: override가 실제로 바뀔 때마다 `audit_logs`에 실행자·행사·대상 운영자·변경 전후 grants/revokes를 남긴다. role 변경에 따른 override 삭제와 운영자 제거(CASCADE)로 사라진 override도 해당 audit 항목에 목록으로 남긴다. 권한 키는 개인정보가 아니므로 `privacy_logs` 대상이 아니다.
- Owner 위임 (현 결정 10/2, DEC-033): override가 있는 운영자가 위임을 수락해 OWNER가 되면 같은 transaction에서 override를 위임 기록에 저장하고 지운다. 취소되면 이전 role과 함께 되살린다. 넘긴 사람은 새 role 기본값으로 시작하고 override는 없다. 단계마다 audit을 남긴다.
- 행사 상태 (현 결정 10/2, #30 L5): ENDED에서는 override 변경을 허용한다. ARCHIVED에서는 줄이는 변경(REVOKE 추가, GRANT 제거, 운영자 제거)만 허용하고 늘리는 변경은 409 `EVENT_ARCHIVED`다. role 변경(override를 지워 REVOKE가 풀릴 수 있고 role 기본값이 바뀜)과 제거됐던 사용자의 재추가(직접 추가·DEC-060 초대 수락, 접근을 새로 만듦)도 늘리는 변경이다(현 결정 10/2 (#30 L5), #44 머지에서 빠진 규칙 복원).
- 회수: 운영자 제거, DEC-060의 관리자 제거 시 행사 접근 회수, 자진 탈퇴 시 회수 선택은 `event_users` 행 삭제이며 CASCADE로 override도 지운다. 다시 추가된 운영자에게 예전 override가 되살아나지 않는다. 자진 탈퇴 후 행사 전용 협력자로 접근을 유지하면 override도 유지된다. role 변경은 같은 transaction에서 override를 초기화한다. REVOKE와 회수는 다음 요청부터 적용하고, DEC-061의 기기 임시 데이터도 권한 회수 시 삭제한다.
- 행사 lifecycle (DEC-063): `EVENT_LIFECYCLE`은 GRANT하지 않는다. Space OWNER의 종료·재개·활성화 대행은 사유·audit·Event OWNER 알림 기록이 있을 때만 허용한다. 보관·보관 해제는 Space OWNER의 직접 권한이다. 본인 이탈이 막히면 권한을 일부만 회수하지 않는다. 이탈 뒤 회수된 경로의 세션은 403 `NOT_A_MEMBER`다.
