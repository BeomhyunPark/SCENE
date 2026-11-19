# 내 조(조원·조장이 보는 범위) 계약 초안

> **아직 서버에 없다. 계약 초안이다.** 지금 서버의 `GET /api/v1/participant/group`은 [backend/docs/api.md "조 편성"](../../backend/docs/api.md)에 있고 DEC-072 §6 범위(조장만 조원 이름·또래)다. 이 문서의 새 응답과 경로는 [#382](https://github.com/BeomhyunPark/SCENE/issues/382) F2에서 만든다. 만든 뒤 api.md의 그 절을 이 내용으로 바꾸고 이 문서를 지운다.

- 정책: [DEC-083](../product/PRODUCT_DECISIONS.md) (F1, [#403](https://github.com/BeomhyunPark/SCENE/issues/403))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `updates.group`
- 작성: 2026-11-19. 확인 방법: 결정 문서·api.md·마이그레이션·`ParticipantGroup.tsx`를 읽었다. 서버 검증과 실제 클릭은 하지 않았다.

## 1. 누가 무엇을 보나

모든 값은 **가장 최근 조 편성 공개본**(DEC-043)과 지금 활성 참가자(`SUBMITTED` 신청이 있는 사람, DEC-044) 기준이다. 작업본의 변경은 공개하기 전까지 보이지 않는다. 신청을 취소한 사람은 다음 요청부터 빠진다.

| 정보 | 같은 조 조원 | 조장(자기 조원) | 다른 조 사람 |
|---|---|---|---|
| 조 이름, 조장 이름 | ✔ | ✔ | — |
| 조원 이름·또래·성별·조장 표시 | ✔ (스위치가 켜졌을 때) | ✔ (늘) | ✘ |
| 조원 참가자 id | ✘ | ✔ | ✘ |
| 도착 여부·도착 시각 | ✘ | ✔ | ✘ |
| 참석 방식·참석 구간·참석 칸 | ✘ | ✔ | ✘ |
| 방(G1 뒤) | ✘ (숙소 화면의 방 배정표는 G1이 정한다) | ✔ | ✘ |
| 신청 답 전체(운영자가 고친 값 포함, 새가족 답 포함) | ✘ | ✔ (조원 상세) | ✘ |
| 전화번호(신청 전화, 전화 형식 답) | ✘ | ✔ (조원 상세, 열람 기록) | ✘ |
| 운영 메모(DEC-075), 숫자 6자리·해시, 접근 키, 세션 | ✘ | ✘ | ✘ |
| 숨긴 질문의 답, 숨긴 보기만 남은 답의 원래 값 | ✘ | ✘ | ✘ |

- "조장"은 공개본에서 그 조의 조장이고 지금 활성 참가자인 사람이다(조당 최대 1명, DEC-072 Follow-up #343).
- 조장이 운영자이기도 해도 두 신원은 연결하지 않는다(DEC-072 §2). 이 범위는 참가자 세션으로 들어왔을 때의 것이다.

## 2. 조원 명단 공개 스위치

행사별 설정 `groupRosterVisibleToMembers`(불리언, **기본 켬**)다.

- 켜져 있으면 일반 조원도 같은 조의 이름·또래·성별·조장 표시를 본다. 꺼져 있으면 일반 조원은 DEC-072 §6처럼 조 이름·조장 이름만 본다. 조장은 스위치와 상관없이 조원 명단을 본다.
- 운영자 경로: `GET·PUT /api/v1/operator/events/{eventId}/participant-settings`. 읽기는 `EVENT_READ` 또는 활성 공간 `OWNER`·`ADMIN`, 쓰기는 `EVENT_UPDATE`(행사 OWNER 기본)다. 본문은 `{ "groupRosterVisibleToMembers": false, "expectedVersion": 0 }`, 응답은 `{ "groupRosterVisibleToMembers", "version", "updatedAt", "updatedByDisplayName" }`이다. 저장한 적이 없으면 기본값과 `version: 0`이다. `expectedVersion`이 다르면 `409 CONCURRENT_MODIFICATION`(`version`). `ARCHIVED`는 `409 EVENT_ARCHIVED`, 그 밖의 상태에서는 쓴다.
- 바꾸면 같은 트랜잭션에서 DEC-080 `participant_feed_versions.groups`를 올린다(화면이 내 조를 다시 읽는다). audit `EVENT_PARTICIPANT_SETTINGS_UPDATED`(`fields`, `version`).
- 같은 테이블에 G1이 방 배정표 공개 스위치를 더한다(로드맵 구조 10의 "범위는 행사별 스위치").

## 3. `GET /api/v1/participant/group`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 지금 응답의 키(`status`, `publishedAt`, `group`, `leader`, `members`)는 이름과 뜻을 그대로 두고 더하기만 한다. 지금 화면(`ParticipantGroup.tsx`)은 바꾸지 않아도 깨지지 않는다.

`200` — 일반 조원(스위치 켬)

```json
{
  "status": "ASSIGNED",
  "publishedAt": "2026-12-20T09:00:00Z",
  "group": { "name": "1조", "leaders": [{ "name": "박" }] },
  "leader": false,
  "rosterVisible": true,
  "members": [
    { "name": "박", "cohort": "95", "gender": "남", "leader": true, "me": false },
    { "name": "김", "cohort": "94", "gender": "여", "leader": false, "me": true }
  ],
  "leaderView": null
}
```

`200` — 조장

```json
{
  "status": "ASSIGNED",
  "publishedAt": "2026-12-20T09:00:00Z",
  "group": { "name": "1조", "leaders": [{ "name": "박" }] },
  "leader": true,
  "rosterVisible": true,
  "members": [ { "name": "박", "cohort": "95", "gender": "남", "leader": true, "me": true } ],
  "leaderView": {
    "activeCount": 9,
    "checkedInCount": 6,
    "slots": [
      { "slotId": "opt_d1_dinner", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)", "meal": "DINNER", "label": "저녁", "sortOrder": 0 }
    ],
    "members": [
      {
        "participantId": "…",
        "name": "김",
        "cohort": "94",
        "gender": "여",
        "leader": false,
        "checkIn": { "checkedIn": true, "checkedInAt": "2027-01-22T08:12:00Z" },
        "attendance": {
          "type": "PARTIAL",
          "arrivalSlotId": "opt_d1_dinner",
          "departureSlotId": "opt_d2_lunch",
          "slotIds": ["opt_d1_dinner", "opt_d1_worship", "opt_d2_breakfast", "opt_d2_lunch"],
          "lodgingNights": [1]
        },
        "room": null,
        "applicationRevisedAt": "2026-12-28T10:00:00Z"
      }
    ]
  }
}
```

| `status` | 경우 | `group` | `members` | `leaderView` |
|---|---|---|---|---|
| `NOT_PUBLISHED` | 공개한 적이 없다 | `null` | `null` | `null` |
| `UNASSIGNED` | 공개됐지만 공개본에 내 조가 없다 | `null` | `null` | `null` |
| `ASSIGNED` | 공개본에 내 조가 있다 | 값 | 아래 규칙 | 조장이면 값 |
| `NOT_ELIGIBLE` | `SUBMITTED` 신청이 없다 | `null` | `null` | `null` |

- `rosterVisible`은 이 응답을 받는 사람이 조원 명단을 보는지다(조장이면 늘 `true`, 일반 조원은 스위치 값). `ASSIGNED`가 아니면 `false`다.
- `members`는 `rosterVisible`이 `true`일 때 그 조의 활성 조원(나 포함)을 공개본의 운영자 순서로 담는다. 아니면 `null`이다. 항목은 **`name`·`cohort`·`gender`·`leader`·`me`만** 있다. 참가자 id·전화·답·도착·칸·방은 없다. 지금 조장 응답의 `members` 항목(`name`·`cohort`·`leader`)은 그대로 들어 있고 `gender`·`me`만 더해진다.
- `cohort`는 `COHORT` 답(앞뒤 공백 자름)이고, 또래 질문이 꺼졌거나 답이 없으면 `null`이다.
- **`gender`는 `GENDER` 답의 지금 보기 문구다.** 성별 질문이 없거나 꺼진 행사, 답이 없는 사람, 그 보기가 숨겨진 경우(DEC-073 §6과 같다)는 `null`이다. 화면은 `null`을 표시하지 않는다(빈칸). 성별이 꺼진 행사의 조원 명단은 이름·또래만 보인다.
- `leaderView`는 `leader`가 `true`일 때만 있다. 그 밖에는 반드시 `null`이다.
  - `activeCount`·`checkedInCount`: 조의 활성 조원 수(조장 포함)와 그중 지금 체크인 상태(`CHECKED_IN`)인 수.
  - `slots`: 편성판 `slots`와 같은 칸 정의(같은 코드 `MealSlots`). 설정이 없으면 `null`이고 그때 `attendance.slotIds`도 `null`이다.
  - `checkIn`: api.md "체크인"의 참가자 QR 응답과 같은 뜻의 `checkedIn`·`checkedInAt`.
  - `attendance.type`: 편성판 `attendance`와 같다(`FULL`·`PARTIAL`·`WORSHIP_ONLY`, 질문이 없으면 `FULL`). `arrivalSlotId`·`departureSlotId`는 `RANGE`(DEC-074)의 `PARTIAL`일 때만 값이고 그 밖에는 `null`이다. `slotIds`는 편성판 `slotIds`와 같은 규칙이다(`null`은 모름). `lodgingNights`는 신청 집계(DEC-073)의 숙박 계산과 같은 규칙으로 그 사람이 자는 밤 번호(1부터)이고, 모르면 `null`, 숙박하지 않으면 `[]`이다.
  - **운영자가 고친 값이 먼저다.** 운영자가 참석 범위·답을 고친 값(#378 A12, #339)이 있으면 그 값으로 계산한다. 읽는 쪽은 DEC-075 §1의 "운영 값이 있으면 운영 값, 없으면 원본"을 따른다.
  - `room`: 숙소(G1) 전에는 `null`. G1 뒤에는 `{ "name", "locationNote" }`.
  - `applicationRevisedAt`: 그 조원의 지금 신청 revision이 생긴 시각(A4). 화면은 조장 화면에서 "최근 수정" 표시에 쓴다.
  - 순서는 공개본의 운영자 순서다.
- 조장 응답(`leaderView` 포함)은 **전화번호를 담지 않는다.** 그래서 이 경로는 열람 기록을 남기지 않는다. 전화는 조원 상세에서만 나온다.
- 조회는 audit을 남기지 않는다. DEC-080 `updates.group`이 바뀌면 화면이 다시 읽는다. 조장 화면의 도착 현황은 화면이 보이는 동안 `updates.group`과 별개로 60초마다 다시 읽는다(체크인은 행사 범위 값이 아니다).

## 4. `GET /api/v1/participant/group/members/{participantId}`

조장이 조원 한 사람을 누르면 연다. 참가자 세션 쿠키가 필요하다.

**판정:** 요청한 사람이 공개본에서 조장이고 활성 참가자이며, `participantId`가 공개본에서 같은 조의 활성 조원일 때만 `200`이다. 그 밖(조장이 아님, 다른 조, 없는 id, 취소한 조원, 공개 전, 형식이 맞지 않는 id)은 모두 `404 RESOURCE_NOT_FOUND`이고 서로 구분하지 않는다. 자기 자신도 조원이므로 열린다.

`200`

```json
{
  "participantId": "…",
  "name": "김",
  "cohort": "94",
  "gender": "여",
  "leader": false,
  "phone": "010-1234-5678",
  "checkIn": { "checkedIn": true, "checkedInAt": "2027-01-22T08:12:00Z" },
  "attendance": { "같은 모양": "leaderView.members[].attendance" },
  "room": null,
  "application": {
    "submittedAt": "2026-12-16T03:00:00Z",
    "revisedAt": "2026-12-28T10:00:00Z",
    "revisedByOperator": false,
    "answers": [
      { "fieldId": "…", "presetKey": "MIDDLE_GROUP", "label": "중그룹", "type": "SINGLE_CHOICE", "display": "새가족 (등반X)", "value": { "optionId": "opt_newcomer" }, "operatorEdited": false },
      { "fieldId": "…", "presetKey": null, "label": "보호자 연락처", "type": "SHORT_TEXT", "display": "010-9876-5432", "value": { "text": "010-9876-5432" }, "operatorEdited": true }
    ]
  }
}
```

- `phone`은 참가자의 신청 전화(`participants.phone`) 전체다.
- `answers`는 지금 `SUBMITTED` 신청의 답을 신청서 질문 순서로 담는다.
  - **빼는 것:** SYSTEM 이름·전화(위 필드로 이미 있다), 숨긴 질문(`hidden`)의 답, 개인정보 동의(`YES_NO`의 `style: CONSENT`), 숨긴 질문 때문에 버려진 답(DEC-068). 숫자 6자리는 답이 아니라서 애초에 없다.
  - **넣는 것:** 그 밖의 보이는 질문 전부. 새가족 보기(`opt_newcomer`)를 고른 중그룹·셀 답도 그대로 들어간다(DEC-070 Follow-up 갱신, DEC-083 §5).
  - `display`는 서버가 만든 읽기용 글자다: 단답·서술은 글 그대로, 선택은 지금 보기 문구(복수는 `, `로 잇는다), 날짜·기간은 `1월 22일 (금) 19:00` 꼴, 예/아니오는 `yesLabel`·`noLabel`(없으면 "예"·"아니오"), 숫자는 숫자. 숨긴 보기를 고른 답은 그 보기 문구에 "(꺼짐)"을 붙인다.
  - `value`는 저장된 답 원본 모양(DEC-068 §1)이다.
  - `operatorEdited`는 운영자가 고친 값(A12)이면 `true`다. `revisedByOperator`는 지금 revision을 운영자가 만들었는지다.
- **운영 메모(DEC-075)는 넣지 않는다.** `application_operations`는 읽지 않는다(참석 범위 운영 값이 생기면 `attendance` 계산에만 쓴다).
- 응답 헤더는 `Cache-Control: no-store`다.

### 전화번호 열람 기록

이 응답에 전화 값이 하나라도 담기면(`phone`, 또는 `format: PHONE`인 단답 답에 값이 있음) **같은 트랜잭션에서** `privacy_logs`에 한 줄 남긴다. 기록이 실패하면 응답도 실패한다(`500`).

| 열 | 값 |
|---|---|
| `action` | `CONTACT_VIEW` |
| `actor_kind` | `PARTICIPANT` |
| `actor_participant_id` | 요청한 조장 |
| `subject_participant_id` | 조원 |
| `channel` | `PARTICIPANT_GROUP_MEMBER` |
| `detail` | `{ "groupPublicationId", "fields": ["phone", "<fieldId>…"] }`. 번호·이름·답 값은 넣지 않는다 |
| `occurred_at` | 시각 |

- 같은 조원을 다시 열면 다시 남긴다(합치지 않는다). 화면은 상세를 주기적으로 다시 읽지 않는다.
- 1월에는 읽는 화면이 없다. 운영자가 볼 때는 `PRIVACY_LOG_READ`로 연다(범위 밖, 확장 지점).
- 운영자 연락처 열람의 audit `APPLICANT_CONTACTS_VIEWED`는 그대로 두고, 나중에 같은 `privacy_logs`로 옮긴다(`actor_kind = 'OPERATOR'`).

```sql
CREATE TABLE privacy_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  action varchar(32) NOT NULL CHECK (action IN ('CONTACT_VIEW')),
  actor_kind varchar(16) NOT NULL CHECK (actor_kind IN ('PARTICIPANT', 'OPERATOR')),
  actor_participant_id uuid,
  actor_user_id uuid REFERENCES users (id),
  subject_participant_id uuid NOT NULL,
  channel varchar(48) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT privacy_logs_one_actor CHECK (
    (actor_kind = 'PARTICIPANT' AND actor_participant_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_kind = 'OPERATOR' AND actor_user_id IS NOT NULL AND actor_participant_id IS NULL)),
  FOREIGN KEY (space_id, event_id, actor_participant_id) REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, subject_participant_id) REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX privacy_logs_subject ON privacy_logs (space_id, event_id, subject_participant_id, seq);

CREATE TABLE event_participant_settings (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  group_roster_visible_to_members boolean NOT NULL DEFAULT true,
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
```

`audit_logs.actor_user_id`는 `users`만 받으므로 참가자가 한 일은 `audit_logs`에 남길 수 없다. 그래서 별도 테이블이다. 보존은 행사 데이터와 같이 지운다(DEC-056).

## 5. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| 참가자 세션 없음 | `401 AUTHENTICATION_REQUIRED` |
| 조원 상세: 조장이 아님·다른 조·없음·취소·공개 전·id 형식 | `404 RESOURCE_NOT_FOUND`(구분하지 않음) |
| 설정 저장 버전 불일치 | `409 CONCURRENT_MODIFICATION` |
| 설정 저장 권한 없음 | `403 FORBIDDEN` |

## 6. 시험 조건 — 다른 조 사람에게는 어떤 경로로도 안 나간다

F2 서버 PR은 아래를 통합 테스트로 갖는다.

1. 조 A의 조원·조장이 부르는 `GET /participant/group`에 조 B 사람의 이름·또래·성별·id가 없다.
2. 조 A의 조장이 조 B 조원의 id로 상세를 부르면 `404`이고 `privacy_logs`가 늘지 않는다.
3. 일반 조원이 같은 조 조원의 id로 상세를 부르면 `404`다(조원은 id를 받지도 않는다).
4. 일반 조원 응답의 `members[]` 항목 키가 정확히 `name`·`cohort`·`gender`·`leader`·`me`이고 `leaderView`가 `null`이다.
5. 스위치를 끄면 일반 조원의 `members`가 `null`이고 조장은 그대로 본다. 스위치 변경이 `updates.group`을 올린다.
6. 작업본에서 조원을 옮기거나 조장을 바꿔도 공개 전에는 응답·상세 판정이 그대로다. 공개하면 바로 바뀐다(조장이 풀린 사람의 상세 요청은 `404`).
7. 취소한 조원은 다음 요청부터 명단·`leaderView`·상세에서 빠지고, 취소한 조장은 `NOT_ELIGIBLE`이다.
8. 조원 상세에 운영 메모, 숨긴 질문의 답, 동의 답, 숫자 6자리·해시·접근 키가 없다.
9. 상세에 전화가 담기면 `privacy_logs`가 정확히 한 줄 늘고, detail에 번호·이름이 없다. 전화 값이 없으면 늘지 않는다.
10. 성별 질문이 꺼진 행사에서 `gender`가 모두 `null`이다.
11. 참가자 홈·`updates`·알림·일정·공지 응답 어디에도 다른 참가자의 전화·답이 없다.
12. 조원 이름을 누른 상세가 운영자 세션 쿠키로는 열리지 않는다(참가자 경로).
