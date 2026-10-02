# SCENE Data Model v0.1

현재 요청·추가 참조 원문 §1–13과 API 대화의 Domain 경계를 정리한다. 제공 범위 밖의 ERD·DDL을 확장하지 않는다. [소스 우선순위](architecture-v0.1.md) 적용.

## 1. Domain map

아래는 추가 원문에서 제공된 Domain / table map이다. 새로운 테이블을 추가하지 않는다. (2026-10-02 현 결정으로 Core에 개인별 권한 `event_user_permissions`를 추가했다. [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)) Participant Access는 Application Domain에 두고 보안 규칙은 Security 문서에서 다룬다.

| Domain | 책임 / 확인된 개념 | 경계 |
|---|---|---|
| Core | `users`, `spaces`, `members`, `events`, `event_users`, `event_user_permissions`(2026-10-02), `participants` | identity, tenant, 참가 운영 주체. User와 Participant 구분 |
| Common | `tasks`, `schedules`, `notices` | 업무, 현재 일정, 변경 안내. 범용 Workflow Engine 아님 |
| Application | `forms`, `fields`, `applications`, `answers`, `participant_access` | 제출 원본·revision, 참가자 접근키. 운영 상태 저장소 아님 |
| Finance | Fee, Payment (`fees`, `payments`) | 부과와 실제 금전 흐름 구분 |
| Assignment | `groups`, `group_members`, `group_leaders`, `rooms`, `room_members`, `rides`, `ride_members` | 각 업무가 배정 상태 직접 소유. 범용 `assignments` 테이블 없음 |
| Field | Check-in (`checkins`, `checkin_logs`) | current state와 history 분리 |
| Mission | Partner, Flight, Flight Member (`partners`, `flights`, `flight_members`) | v0.1 범위 한정 |
| Child | Guardian, Guardian Link, Class, Class Member, Class Staff (`guardians`, `guardian_links`, `classes`, `class_members`, `class_staff`) | Guardian은 User와 구분, Class는 Retreat Group과 구분 |
| Security / Operations | `privacy_logs`, `audit_logs` | 인증·권한 정책과 개인정보 조회·변경 기록. Session 저장 구조는 OPEN |

Flight/Class 배정은 Mission/Child 업무에서 관리한다. 지도는 해당 책임을 설명하며 단일 범용 배정 테이블을 추가하지 않는다.

## 2. Identity와 state separation

- `users != participants`.
- `users`는 운영계정 Login Identity. `space_id`, `event_id`, `role`, `participant_id`를 포함하지 않는다.
- `members`는 users ↔ spaces 소속 관계. Space role은 `OWNER / ADMIN / MEMBER`.
- `event_users`는 특정 Event 운영자. Event role은 `OWNER / MANAGER / STAFF`. 최초 기준은 `user → member → event_user`였으나 DEC-039에 따라 조직 소속 없이 해당 행사만 운영하는 사용자도 지원해야 한다. Membership 필수 관계를 모든 운영자에게 강제하지 않는다. 2026-10-01 DEC-060으로 `event_users.user_id` 직접 참조를 확정했다(아래 절).
- `events`는 제품 중심 Entity. 기존 상태 후보는 `DRAFT / ACTIVE / ENDED / ARCHIVED`. #8에서 활성화·종료·재개·보관·해제의 제품 전이를 확정했다. 상세 저장·전이 계약은 후속이다.
- Application = submitted source information / Participant = operational subject.
- Participant 최소 Identity: `id`, `space_id`, `event_id`, `name`, `phone`, `phone_hash`, `phone_last4`, `status`, `created_at`, `updated_at`. Participant status 값은 제공 원문에 없어 추가 확정하지 않는다.
- Participant에 `paid`, `checked_in`, `group_id`, `room_id`, `ride_id`, `vehicle_id`, `guardian_id`, `passport`, `visa`, `attendance_type` 등 운영 상태·Domain 정보를 몰아넣지 않는다.
- 납부 상태는 Finance, 조·방·차량 배정은 각 Assignment 업무, 도착 상태는 Check-in에서 관리한다.
- 신청 당시 이동 희망과 실제 Ride Assignment를 구분한다. `OUTBOUND / RETURN / LOCAL` 방향을 구분하며 다른 방향의 복수 배정은 가능하다.
- Ride mode: `BUS / VAN / CAR / SHUTTLE / OTHER`.
- Group Leader와 Class Staff의 identity reference는 OPEN. Guardian이나 Partner를 자동으로 `users` 또는 외부 계정으로 모델링하지 않는다.

2026-09-30 [역할·권한 후속 결정](../product/PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다)은 행사 운영진별 업무 권한 차등 부여를 요구한다. 기존 `event_users`의 역할만으로 표현 가능한지 검토하며 개별 권한 저장 schema는 OPEN이다. (2026-10-02 현 결정으로 해소: Event role 기본값 + 사람별 `event_user_permissions` GRANT/REVOKE. [아래 절](#2026-10-02-개인별-권한-현-결정-dec-029-정합)) 조직 관리자에게 조회를 허용하기 위해 행사 운영자 관계를 자동 생성하는 것으로 정하지 않는다. 조직 관리자에게는 같은 조직 행사의 전체 정보, 그룹 리더에게는 자기 그룹원 전체 정보를 조회하도록 허용하는 제품 기준을 반영한다. 그룹 리더의 identity reference와 조회 계약은 계속 OPEN이다.

## 3. Source와 revision

- Form Field: `SYSTEM / NAME`, `SYSTEM / PHONE`, `CUSTOM / ...`. Custom Field가 System Field 의미를 대신하지 않는다.
- Application 변경은 기존 answers 덮어쓰기 대신 새 revision 생성: `v1 SUPERSEDED → v2 SUBMITTED`.
- Application 상태: `SUBMITTED / SUPERSEDED / WITHDRAWN`. 상태값이 있다는 이유로 미정 command를 추가하지 않는다.
- 최초 제출은 Form/Event 검증, 답변, Participant 생성/연결, Participant Access 생성, Audit를 하나의 transaction으로 묶는 기준이다.
- Participant 생성/연결의 세부 중복 판정과 consent 정책은 원문 이상으로 확대하지 않는다.
- Participant는 SCENE 운영계정을 만들지 않는다. 행사별 링크/QR → 신청 → Participant 생성 → participant_access 발급 → 본인 인증 → Participant Session 흐름.
- Participant Session scope는 `participant_id`, `event_id`, `space_id`에 고정한다.
- Form의 OPEN/CLOSE 오류 경계는 있으나 실제 상태 schema는 OPEN이다.

## 4. Tenant 관계

- Event-scoped 요청은 `eventId`로 서버가 `spaceId`를 resolve한다.
- `space_id + event_id` tenant isolation과 composite FK로 잘못된 tenant 간 관계를 방지한다.
- PK는 UUID(예외: 2026-10-02 `event_user_permissions`는 외부 식별자가 없는 연결 행이라 `(event_id, user_id, permission)` 복합 PK). Composite FK 예: `(event_id, space_id) → events(id, space_id)`. 가능한 하위 관계도 `(participant_id, event_id, space_id)`, `(group_id, event_id, space_id)`로 tenant consistency 보장.
- Security / Service / MyBatis tenant condition / DB composite FK를 함께 적용한다.
- UUID 외부 노출은 조회 권한이나 tenant 검사를 대체하지 않는다.
- DB 이름은 `snake_case`, API JSON은 `camelCase`.
- Mapper는 `findById(spaceId, eventId, id)` 형태 우선. `findById(id)` 후 Service에서 tenant 비교하는 구조를 기본으로 하지 않는다.
- Timestamp 의미는 `timestamptz`, 날짜만 의미하면 `date`. Event/Schedule/Flight timezone model은 별도 OPEN.
- DB enum을 남발하지 않고 기본은 `varchar + CHECK constraint`, Java에서는 enum 사용.
- 위 예시 밖의 UNIQUE/FK DDL, index, nullable, cardinality는 새로 확정하지 않는다. (DEC-060 `event_users`·`event_invitations`와 2026-10-02 `event_user_permissions`의 PK/FK는 각 절에서 확정했다.)

## 5. 업무별 변경 경계

- Group/Room/Ride/Class 이동은 source 제거와 target 추가를 move command transaction으로 처리한다. 중간 unassigned 상태를 외부에 노출하지 않는다.
- Flight 이동 endpoint도 대화에서 제시됐다. 상세 constraint는 확장하지 않는다.
- Fee는 부과, Payment는 금전 흐름. Payment UPDATE/DELETE 대신 VOID/REFUND 기록을 사용한다.
- Fee 상태: `OPEN / WAIVED / CANCELLED`. `PAID boolean`으로 모델링하지 않는다.
- Payment `kind`: `PAYMENT / REFUND`; `source`: `MANUAL / IMPORT / BANK`; `method`: `TRANSFER / CASH / CARD / OTHER`; `status`: `POSTED / VOID`. 이 값만으로 외부 은행·카드 연동 구현을 확정하지 않는다.
- Check-in current state 변경과 check-in history를 같은 transaction으로 남긴다.
- Task는 `TODO / DOING / DONE / CANCELLED`. 모든 Task에 optimistic version을 강제하지 않는다.
- Schedule `mode`: `DATE / TIME`; `status`: `DRAFT / PUBLISHED / CANCELLED`. Notice 상태: `DRAFT / PUBLISHED / ARCHIVED`.
- JSONB는 `fields.config`, `answers.value`에 제한적으로 사용한다. Domain 관계·상태 전체를 만능 Entity-Attribute 또는 JSONB 구조로 대체하지 않는다.

## 6. Security data

- Participant Access는 high-entropy random key를 사용하며 저장은 `key_hash`만 허용한다.
- 개인정보 조회 기록 `privacy_logs`와 변경 기록 `audit_logs`를 구분한다.
- privacy action 예: `CONTACT_VIEW / SENSITIVE_VIEW / EXPORT`.
- 민감값·password·raw access key·session을 audit before/after에 복사하지 않는다.
- retention / anonymization / deletion을 구분한다. 상세 정책은 [Security / Privacy](security-privacy-v0.1.md) 참조.

## 7. OPEN 및 현재 범위 밖

제공 범위 밖의 상세 schema, OWNER cardinality, Event transition, Form 상태 표현, timezone model, Leader/Staff identity, 수동 Participant 생성·consent/access, 민감 필드 접근과 보존기간은 OPEN이다.

Mission v0.1에서 Passport/Visa/Health/Insurance/Readiness schema/API를 선행 생성하지 않는다. Readiness는 여러 Domain Current State에서 계산되는 Projection 방향이며 범용 CRUD 대상으로 확정하지 않는다. Child Presence는 연구 근거가 있으나 상태 모델이 보류되어 API를 만들지 않는다.

통합 목록: [API Architecture OPEN](api-architecture-v0.1.md#open-items).


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

- `event_users`: `space_id`, `event_id`, `user_id`, `role`. `member_id` 필수 참조 없음. 조직 소속 여부는 `members` 조인으로 계산하고 저장하지 않는다. `UNIQUE(event_id, user_id)`, composite FK `(event_id, space_id) → events(id, space_id)`.
- Event OWNER의 활성 Membership 조건은 DB가 아니라 서비스에서 지정·위임·Membership 종료 시점에 검사한다.
- `event_invitations`: `space_id`, `event_id`, `email_normalized`, `role`, `token_hash`, `status`, `expires_at`, `invited_by`, `accepted_user_id`, 생성·변경 시각.
  - `status`: `PENDING / ACCEPTED / REVOKED / SUPERSEDED` (`varchar + CHECK`). 만료는 `status = 'PENDING' AND expires_at <= now()`로 계산하며 `EXPIRED`를 저장하지 않는다.
  - `UNIQUE(event_id, email_normalized) WHERE status = 'PENDING'`.
  - 새 초대·재전송은 한 transaction에서 기존 PENDING 행(만료 포함)을 SUPERSEDED로 바꾸고 새 행을 INSERT한다.
  - 수락은 `UPDATE … WHERE status = 'PENDING' AND expires_at > now()` 한 행 성공으로 판정하고 같은 transaction에서 `event_users`를 생성한다.
- 아직 코드가 없으므로 위 구조는 마이그레이션이 아니라 Flyway V1 초기 스키마에 반영한다.

## 2026-10-01 보존·삭제·Export 처리 계약 (DEC-061)

- 보존 정책표 키: 참가자 식별정보 / 신청 응답 / 고위험 필드 / 운영 기록 / 정산 상태 / 결제 증빙 / privacy·audit 로그 / Export 파일 / 기기 임시 데이터. 기간 값은 미정이며 상수로 넣지 않는다.
- 개인정보 정리 작업: 상태 `PENDING / RUNNING / COMPLETED / PARTIAL_FAILED`, 도메인 단계별 진행 기록, 단계별 멱등 재시도.
- 행사 삭제: Event lifecycle enum에 넣지 않고 별도 삭제 요청·작업 레코드로 관리한다. `scheduled_at`을 둬서 유예기간 도입 시 스키마를 바꾸지 않는다.
- `export_jobs`: 행사·대상·필드 범위, `created_by`, `status`, `expires_at`, 파일 참조. 파일 내용은 로그에 복제하지 않는다.
- 삭제 원장: 삭제·익명화 대상 ID와 처리 시각만 저장(개인정보 없음), 운영 백업과 분리 보관.

## 2026-10-02 개인별 권한 (현 결정, DEC-029 정합)

2026-10-02 현 결정(SCENE 개발 리드 전달, 테이블 형태는 SCENE Backend Lead와 합의)으로 [DEC-029](../product/PRODUCT_DECISIONS.md#dec-029--행사-운영진의-업무-권한을-사람별로-달리-부여한다)의 사람별 업무 권한과 enum 기반 Role 모델의 충돌을 정리한다. Event 권한 = Event role 기본 Permission Set + 사람별 GRANT − 사람별 REVOKE다. 부여·회수는 Event Owner만 한다. role 기본 집합은 계속 Java enum mapping이며 DB `permissions / role_permissions` 테이블은 만들지 않는다. 사람별 차이만 아래 테이블에 저장한다. API는 [API Architecture](api-architecture-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합), 보안 규칙은 [Security / Privacy](security-privacy-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)의 같은 이름 절을 따른다.

`event_user_permissions`

| 컬럼 | 의미 |
|---|---|
| `event_id` | uuid. 대상 행사 |
| `user_id` | uuid. 대상 운영자(`event_users.user_id`) |
| `permission` | varchar. 서버 Permission enum의 Event 범위 키([키 목록 초안](api-architecture-v0.1.md#2026-10-02-개인별-권한-현-결정-dec-029-정합)) |
| `effect` | varchar + CHECK `GRANT / REVOKE` |
| `granted_by` | uuid → `users(id)`. 변경한 Event Owner |
| `granted_at` | timestamptz |

- PK `(event_id, user_id, permission)`. 한 운영자·한 키에 override는 하나이며 같은 키의 GRANT와 REVOKE를 함께 저장할 수 없다. §4 "PK는 UUID" 기본 규칙의 예외다. 외부 식별자로 노출하지 않는 연결 행이고 API가 `(eventId, userId)` 단위 전체 목록으로만 다루므로 surrogate id를 두지 않는다.
- FK `(event_id, user_id) → event_users(event_id, user_id) ON DELETE CASCADE`. DEC-060의 `event_users` `UNIQUE(event_id, user_id)`를 참조 대상으로 쓴다. 운영자 제거(`event_users` 행 삭제)는 override를 함께 지운다.
- `space_id` 컬럼과 composite FK `(event_id, space_id)`는 두지 않는다. FK 대상인 `event_users`가 이미 `(event_id, space_id) → events(id, space_id)`로 tenant를 고정하므로 이 테이블에서 다른 tenant의 행사·운영자를 잘못 연결할 수 없다. 조회는 서버가 `eventId`로 resolve한 `spaceId`와 `event_users` 조인으로 tenant 조건을 건다. MyBatis tenant 조건을 위해 `space_id`를 직접 둬야 한다면 `event_users`에 `UNIQUE(event_id, user_id, space_id)`를 추가하고 FK를 `(event_id, user_id, space_id)`로 넓힌다(Backend Lead 판단).
- `permission` 값은 서비스에서 Java enum으로 검증한다. 키 목록이 초안이므로 DB CHECK는 목록 확정 후 추가 여부를 정한다.
- Effective = role 기본 집합 ∪ GRANT − REVOKE. 저장하지 않고 요청마다 계산한다.
- OWNER role 운영자에게는 override 행을 두지 않는다(OWNER 권한은 override 불가). OWNER 전용 키는 OWNER가 아닌 운영자에게 GRANT로 저장하지 않는다. 둘 다 서비스에서 검사한다.
- role 변경(`event_users.role` UPDATE)은 같은 transaction에서 해당 운영자의 override를 모두 삭제하고 audit에 남긴다. Owner 위임 수락으로 OWNER가 되는 것도 role 변경이다.
- 운영자 제거와 DEC-060의 조직 탈퇴·관리자 제거에 따른 행사 접근 회수는 `event_users` 행 삭제이므로 CASCADE로 override가 사라진다. CASCADE 삭제 자체는 audit에 남지 않으므로 운영자 제거 audit 항목에 삭제된 override 목록을 함께 기록한다. 행사 전용 협력자로 전환해 `event_users` 행이 유지되면 override도 유지된다.
- 아직 코드가 없으므로 마이그레이션이 아니라 Flyway V1 초기 스키마에 포함한다(SCENE Backend Lead).
