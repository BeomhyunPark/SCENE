# SCENE Data Model v0.1

현재 요청·추가 참조 원문 §1–13과 API 대화의 Domain 경계를 정리한다. 제공 범위 밖의 ERD·DDL을 확장하지 않는다. [소스 우선순위](architecture-v0.1.md) 적용.

## 1. Domain map

아래는 추가 원문에서 제공된 Domain / table map이다. 새로운 테이블을 추가하지 않는다. Participant Access는 Application Domain에 두고 보안 규칙은 Security 문서에서 다룬다.

| Domain | 책임 / 확인된 개념 | 경계 |
|---|---|---|
| Core | `users`, `spaces`, `members`, `events`, `event_users`, `participants` | identity, tenant, 참가 운영 주체. User와 Participant 구분 |
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
- `event_users`는 특정 Event 운영자. Event role은 `OWNER / MANAGER / STAFF`. 최초 기준은 `user → member → event_user`였으나 DEC-039에 따라 조직 소속 없이 해당 행사만 운영하는 사용자도 지원해야 한다. Membership 필수 관계를 모든 운영자에게 강제하지 않으며 상세 identity 연결·FK는 후속 설계에서 정한다.
- `events`는 제품 중심 Entity. 상태 후보는 `DRAFT / ACTIVE / ENDED / ARCHIVED`; transition rule은 OPEN.
- Application = submitted source information / Participant = operational subject.
- Participant 최소 Identity: `id`, `space_id`, `event_id`, `name`, `phone`, `phone_hash`, `phone_last4`, `status`, `created_at`, `updated_at`. Participant status 값은 제공 원문에 없어 추가 확정하지 않는다.
- Participant에 `paid`, `checked_in`, `group_id`, `room_id`, `ride_id`, `vehicle_id`, `guardian_id`, `passport`, `visa`, `attendance_type` 등 운영 상태·Domain 정보를 몰아넣지 않는다.
- 납부 상태는 Finance, 조·방·차량 배정은 각 Assignment 업무, 도착 상태는 Check-in에서 관리한다.
- 신청 당시 이동 희망과 실제 Ride Assignment를 구분한다. `OUTBOUND / RETURN / LOCAL` 방향을 구분하며 다른 방향의 복수 배정은 가능하다.
- Ride mode: `BUS / VAN / CAR / SHUTTLE / OTHER`.
- Group Leader와 Class Staff의 identity reference는 OPEN. Guardian이나 Partner를 자동으로 `users` 또는 외부 계정으로 모델링하지 않는다.

2026-09-30 [역할·권한 후속 결정](../product/PRODUCT_DECISIONS.md#dec-028--조직-관리자의-행사-조회와-행사-수정-권한을-구분한다)은 행사 운영진별 업무 권한 차등 부여를 요구한다. 기존 `event_users`의 역할만으로 표현 가능한지 검토하며 개별 권한 저장 schema는 OPEN이다. 조직 관리자에게 조회를 허용하기 위해 행사 운영자 관계를 자동 생성하는 것으로 정하지 않는다. 조직 관리자에게는 같은 조직 행사의 전체 정보, 그룹 리더에게는 자기 그룹원 전체 정보를 조회하도록 허용하는 제품 기준을 반영한다. 그룹 리더의 identity reference와 조회 계약은 계속 OPEN이다.

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
- PK는 UUID. Composite FK 예: `(event_id, space_id) → events(id, space_id)`. 가능한 하위 관계도 `(participant_id, event_id, space_id)`, `(group_id, event_id, space_id)`로 tenant consistency 보장.
- Security / Service / MyBatis tenant condition / DB composite FK를 함께 적용한다.
- UUID 외부 노출은 조회 권한이나 tenant 검사를 대체하지 않는다.
- DB 이름은 `snake_case`, API JSON은 `camelCase`.
- Mapper는 `findById(spaceId, eventId, id)` 형태 우선. `findById(id)` 후 Service에서 tenant 비교하는 구조를 기본으로 하지 않는다.
- Timestamp 의미는 `timestamptz`, 날짜만 의미하면 `date`. Event/Schedule/Flight timezone model은 별도 OPEN.
- DB enum을 남발하지 않고 기본은 `varchar + CHECK constraint`, Java에서는 enum 사용.
- 위 예시 밖의 UNIQUE/FK DDL, index, nullable, cardinality는 새로 확정하지 않는다.

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
