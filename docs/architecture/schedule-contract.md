# 일정표 계약 초안

> **아직 서버에 없다. 계약 초안이다.** 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#278](https://github.com/BeomhyunPark/SCENE/issues/278) C2·C3에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

- 정책: [DEC-081](../product/PRODUCT_DECISIONS.md) (C1, [#398](https://github.com/BeomhyunPark/SCENE/issues/398))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `updates.schedule`, 알림, 대상(audience)
- 본보기: api.md "조 편성"(작업본·공개본, 버전, `ALREADY_PUBLISHED`)
- 작성: 2026-11-19. 확인 방법: 결정 문서·api.md·마이그레이션을 읽었다. 서버 검증과 실제 클릭은 하지 않았다.

공통 규칙은 api.md "공통"을 따른다. 운영자 경로는 `/api/v1/operator/events/{eventId}/schedule…`, 참가자 경로는 `/api/v1/participant/schedule`이다.

## 1. 개념

- **작업본**: 운영자가 고치는 항목들. 저장해도 참가자에게 보이지 않는다.
- **공개본**: 공개할 때 작업본 전체를 찍은 스냅샷. 참가자는 가장 최근 공개본만 본다(DEC-043과 같다).
- **"저장하고 바로 공개"**: 항목 하나를 고치는 요청에 `publish: true`를 붙이면 같은 트랜잭션에서 저장하고 공개한다. 현장에서 휴대폰으로 시각·장소를 고쳐 한 번에 내보내는 경로다.

## 2. 항목

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
  "slotId": "opt_d2_worship",
  "sortOrder": 0,
  "version": 3,
  "updatedAt": "2027-01-22T12:00:00Z",
  "updatedByDisplayName": "김OO"
}
```

| 필드 | 규칙 |
|---|---|
| `day` | 1부터. 행사 시작일이 1일차다. 1 ≤ `day` ≤ 행사 일수. 저장 기준은 `day`이고 `date`는 읽을 때 계산한다 |
| `startTime` | 필수. `HH:mm`(00:00–23:59), 행사 현지 시각 |
| `endTime` | 선택. `HH:mm`. `startTime`과 같으면 안 된다. `startTime`보다 이르면 **다음 날 끝남**이고 `endsNextDay: true`다(예: 22:00–00:30) |
| `startsAt`·`endsAt` | 읽기 전용. `date`·시각·`Asia/Seoul`로 계산한 `+09:00` 시각. `endTime`이 없으면 `endsAt: null` |
| `title` | 필수. 앞뒤 공백 자름, 1–100자 |
| `place` | 선택. 0–100자. 빈 문자열은 `null`로 저장 |
| `description` | 선택. 0–2,000자. 일반 글(줄바꿈만 살림). HTML·마크다운을 해석하지 않는다 |
| `category` | 필수. `WORSHIP`(집회)·`MEAL`(식사)·`PROGRAM`(프로그램)·`GROUP`(조 모임)·`FREE`(자유·휴식)·`MOVE`(이동)·`OTHER` |
| `audience` | 필수. DEC-080 공통 모양. 1월에는 `ALL`·`LEADERS`·`STAFF` 중 하나 |
| `slotId` | 선택. `opt_d{day}_{breakfast\|lunch\|dinner\|worship}`. 앞의 일차가 항목의 `day`와 같아야 한다. `breakfast`·`lunch`·`dinner`는 `category: MEAL`, `worship`은 `category: WORSHIP`일 때만 받는다. 한 일정표 안에서 같은 `slotId`는 한 항목만 가진다 |
| `sortOrder` | 같은 일차·같은 시작 시각 안의 순서. 작은 값이 앞. 만들 때 그 시각의 맨 뒤 |
| `version` | 항목마다. 내용이 바뀔 때마다 1 오른다 |

**순서:** `day` → `startTime` → `sortOrder` → `itemId`. 시각으로 정렬되므로 순서 바꾸기 경로는 따로 없다.

**칸 id 연결:** `slotId`는 신청서 설정의 식사·집회 칸(DEC-070, DEC-073, DEC-074)과 같은 id다. 식수 현황(E3)·식사 순서(H1)가 이 id로 일정 항목의 시각·장소를 찾는다. 신청서 설정에 없는 칸이어도 저장은 되고, 편성판처럼 운영자 일정표 응답의 `slots`에 그 칸이 없을 뿐이다(화면은 "신청서에 없는 칸"으로 표시한다).

## 3. 버전과 동시 수정

- `boardVersion`: 행사당 하나(`schedule_boards`). 작업본이 실제로 바뀔 때마다 1 오른다. 공개는 올리지 않는다. 처음은 0이다.
- 항목 `version`: 고치기·지우기는 `expectedVersion`이 필요하다. 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`, 확장 필드 `item`(지금 값)이다. 화면은 지금 값과 내 수정을 나란히 보여 주고 다시 고르게 한다(DEC-046).
- 서로 다른 항목을 고치는 두 운영자는 충돌하지 않는다.
- 공개는 `expectedBoardVersion`이 필요하다. 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`. 화면은 최신 작업본과 바뀐 항목 요약을 다시 보여 주고 확인받는다.
- 쓰기는 행사 행을 잠그고 처리한다. 같은 행사의 쓰기는 차례로 커밋된다.
- `Idempotency-Key`는 읽지 않는다. 같은 고치기를 다시 보내면 `version`이 달라 `409`이고, 화면은 지금 값이 내가 보낸 값과 같으면 성공으로 본다. 같은 공개를 다시 보내면 `ALREADY_PUBLISHED`다(DEC-047).

## 4. 권한과 행사 상태

| 동작 | 권한 |
|---|---|
| 작업본·공개본 조회(운영자) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 항목 만들기·고치기·지우기, 공개, 저장하고 바로 공개 | 유효한 `SCHEDULE_WRITE` |

기본 역할 중 `SCHEDULE_WRITE`는 `OWNER`와 `MANAGER`가 갖는다(DEC-079와 그 Follow-up 2026-11-20). 공간 역할만으로는 쓰지 못한다. 작업본에는 개인정보가 없어 읽기를 업무 권한으로 좁히지 않는다.

| 행사 상태 | 조회 | 쓰기·공개 | 참가자 일정 |
|---|---|---|---|
| `DRAFT` | 조회 | 가능 | 공개본 |
| `ACTIVE` | 조회 | 가능 | 공개본 |
| `ENDED` | 조회 | `409 EVENT_ENDED` | 마지막 공개본 |
| `ARCHIVED` | 조회 | `409 EVENT_ARCHIVED` | 마지막 공개본 |

`ENDED`에서 막는 것은 DEC-051의 "현장 일정 운영 차단"이다. 행사 기간(`startDate`·`endDate`)이 없으면 만들기·공개가 `409 CONFLICT`, 확장 필드 `reason: EVENT_PERIOD_REQUIRED`다.

쓰기의 판정 순서는 조 편성과 같다: 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → 버전·충돌(`409`) → 규칙(`409`) → 결과.

## 5. 운영자 경로

### `GET /api/v1/operator/events/{eventId}/schedule`

작업본이다.

`200`

```json
{
  "eventStatus": "ACTIVE",
  "boardVersion": 31,
  "days": [
    { "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)" },
    { "day": 2, "date": "2027-01-23", "dayLabel": "1월 23일 (토)" }
  ],
  "items": [ { "항목": "…", "publishState": "CHANGED", "outOfPeriod": false } ],
  "publication": {
    "lastPublishedAt": "2027-01-22T11:00:00Z",
    "lastPublishedByDisplayName": "김OO",
    "lastPublishedBoardVersion": 29,
    "hasUnpublishedChanges": true,
    "pendingChanges": { "added": 0, "changed": 1, "removed": 1 }
  },
  "slots": [
    { "slotId": "opt_d1_dinner", "day": 1, "meal": "DINNER", "label": "저녁", "linkedItemId": "…" }
  ]
}
```

- `items`는 §2 순서다. 페이지는 없다. 행사당 300개(잠정)까지 만든다.
- `publishState`는 최근 공개본과 비교한 값이다: `UNCHANGED`, `ADDED`(공개본에 없음), `CHANGED`(내용이 다름). 공개한 적이 없으면 모두 `ADDED`다. 공개본에만 있고 작업본에서 지운 항목 수는 `pendingChanges.removed`다.
- `outOfPeriod`는 행사 기간이 줄어 `day`가 기간 밖이 된 항목이다. 공개할 수 없다(§5 공개 3번).
- `days`는 행사 기간의 모든 날이다. 기간이 없으면 `[]`다.
- `slots`는 신청서 설정의 칸(편성판 `slots`와 같은 코드)이고 `linkedItemId`는 그 칸을 가진 항목이다(없으면 `null`). 설정이 없으면 `null`이다.
- 비교는 내용으로 한다. 고쳤다가 되돌려 내용이 같으면 `UNCHANGED`다. 비교하는 필드는 `day`·`startTime`·`endTime`·`title`·`place`·`description`·`category`·`audience`·`slotId`·`sortOrder`다.

### `POST /api/v1/operator/events/{eventId}/schedule/items`

본문은 항목의 쓰기 필드(`day`, `startTime`, `endTime`, `title`, `place`, `description`, `category`, `audience`, `slotId`)와 선택 키 `publish`·`confirmOtherChanges`·`notify`(§6)다. `sortOrder`는 받지 않는다(그 시각의 맨 뒤).

`201`

```json
{ "item": { "항목": "…" }, "boardVersion": 32, "publication": null }
```

`publish: true`였으면 `publication`이 공개 응답(§5 공개)이다.

### `PATCH /api/v1/operator/events/{eventId}/schedule/items/{itemId}`

본문은 바꿀 필드와 `expectedVersion`(필수)이다. 보낸 필드만 바꾼다. `endTime`·`place`·`description`·`slotId`는 `null`을 보내면 지운다. `sortOrder`도 여기서 바꾼다. 값이 그대로면 아무것도 바꾸지 않고 `200`이며 `version`·`boardVersion`이 그대로다. 선택 키 `publish`·`confirmOtherChanges`·`notify`는 §6이다.

`200` 본문은 `POST`와 같다.

### `DELETE /api/v1/operator/events/{eventId}/schedule/items/{itemId}?expectedVersion=3`

작업본에서 지운다. 지난 공개본은 그대로라 다시 공개하기 전까지 참가자는 그 항목을 계속 본다. 쿼리 `publish=true`(와 `confirmOtherChanges=true`, `notify=false`)로 저장하고 바로 공개할 수 있다.

`200` 본문은 `{ "boardVersion": 33, "publication": null }`이다.

### `POST /api/v1/operator/events/{eventId}/schedule/publish`

```json
{ "expectedBoardVersion": 33, "notify": true }
```

판정은 행사 상태 다음에 이 순서다.

1. `boardVersion`이 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.
2. 공개한 적이 있고 작업본이 최근 공개본과 같으면 `200`, `result: ALREADY_PUBLISHED`. 아무것도 남기지 않는다. 공개한 적이 없으면 건너뛴다(항목이 없어도 첫 공개가 된다).
3. `outOfPeriod` 항목이 있으면 `409 CONFLICT`, 확장 필드 `reason: ITEMS_OUT_OF_PERIOD`, `itemIds`.
4. 공개한다.

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

- `ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 최근 공개 값이고 `changes`의 세 목록은 비어 있으며 `notifiedCount`는 0이다.
- 첫 공개의 `changes`는 모든 항목이 `added`다.
- 공개는 `schedule_publications`에 한 행을 더하고, 같은 트랜잭션에서 DEC-080 `participant_feed_versions.schedule`을 1 올리고, audit `SCHEDULE_PUBLISHED`를 남기고, `notify`가 `true`면 알림을 만든다(§7).
- `notify`는 생략하면 `true`다. 오타 고치기처럼 알릴 필요가 없으면 `false`로 보낸다. 알림을 꺼도 참가자 화면은 30초 안에 바뀌고 "변경됨" 표시도 붙는다.

### `GET /api/v1/operator/events/{eventId}/schedule/published`

가장 최근 공개본이다. 모양은 참가자 응답(§8)과 같고 대상 필터 없이 모든 항목을 담으며 항목마다 `audience`가 있다. 공개한 적이 없으면 `{ "publishedAt": null, "days": […], "items": [], "removedItems": [] }`다.

## 6. 저장하고 바로 공개

항목 `POST`·`PATCH`·`DELETE`에 `publish: true`를 붙이면 그 저장과 공개를 **한 트랜잭션**에서 한다. 휴대폰 화면의 "저장하고 바로 공개" 버튼이 이 요청 하나다.

- 저장 판정(버전·규칙)이 먼저다. 저장이 실패하면 공개도 하지 않는다.
- **다른 미공개 변경이 있으면 확인을 받는다.** 이 저장을 뺀 작업본이 최근 공개본과 다르면(다른 운영자가 정리 중인 변경 등) `confirmOtherChanges: true`가 없을 때 `409 CONFIRMATION_REQUIRED`이고 아무것도 저장하지 않는다. 확장 필드는 `otherChanges: { "added", "changed", "removed" }`(항목 id·제목)다. 화면은 "다른 미공개 변경 N건도 함께 공개돼요"를 보이고, 운영자가 확인하면 같은 요청에 `confirmOtherChanges: true`를 붙여 다시 보낸다. 일정표는 한 번에 공개되므로 항목 하나만 공개하는 길은 없다.
- 공개 판정의 `expectedBoardVersion`은 서버가 이 저장 직후 값으로 채운다(같은 트랜잭션이라 다른 쓰기가 끼어들 수 없다).
- 응답의 `publication`이 §5 공개 응답이다. 저장 결과 작업본이 공개본과 같아지면(되돌리기) `ALREADY_PUBLISHED`다.

## 7. 알림과 갱신

- `participant_feed_versions.schedule`은 `PUBLISHED`일 때만 오른다.
- 첫 공개: 활성 참가자 전원에게 `SCHEDULE_PUBLISHED`("일정표가 올라왔어요"). 대상이 `STAFF`인 항목만 있으면 만들지 않는다.
- 두 번째 이후 공개(`notify: true`): `changes`에서 참가자에게 보이는 항목(대상 `ALL`, 조장에게는 `LEADERS`까지)이 있는 활성 참가자에게 `SCHEDULE_CHANGED`. 본문은 바뀐 항목 제목을 최대 세 개("오전 집회 시간이 바뀌었어요 외 2건")다. 읽지 않은 `SCHEDULE_CHANGED`가 있으면 합친다(DEC-080 §7.3).
- 대상이 `STAFF`인 항목만 바뀌었으면 참가자 알림을 만들지 않는다. 운영자 알림도 만들지 않는다(운영자는 `GET …/updates`의 `schedule`로 다시 읽는다).
- 일정 공개 때 공지 초안을 만드는 것은 C7(P2)이다.

## 8. 참가자 경로

### `GET /api/v1/participant/schedule`

참가자 세션 쿠키가 필요하다. 가장 최근 공개본만 읽는다. 행사 상태와 상관없이 같다.

`200`

```json
{
  "status": "PUBLISHED",
  "publishedAt": "2027-01-22T12:05:00Z",
  "timeZone": "Asia/Seoul",
  "days": [{ "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)" }],
  "items": [
    {
      "itemId": "…",
      "day": 2, "date": "2027-01-23",
      "startTime": "09:30", "endTime": "11:00", "endsNextDay": false,
      "startsAt": "2027-01-23T09:30:00+09:00", "endsAt": "2027-01-23T11:00:00+09:00",
      "title": "오전 집회", "place": "대강당", "description": "성경책을 챙겨 주세요",
      "category": "WORSHIP", "slotId": "opt_d2_worship",
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
    { "itemId": "…", "day": 2, "title": "산책", "startTime": "15:00", "removedAt": "2027-01-22T12:05:00Z" }
  ]
}
```

- `status`는 `NOT_PUBLISHED`(공개한 적 없음, `items: []`) 또는 `PUBLISHED`다. 신청 상태는 보지 않는다(일정은 신청과 상관없는 안내다).
- **대상 필터:** `ALL`은 모두, `LEADERS`는 DEC-080 §8의 조장에게만 보인다. `STAFF`는 참가자에게 보이지 않는다. 조장에게 보이는 `LEADERS` 항목은 `leadersOnly: true`다. 응답에 `audience` 원본은 없다.
- **`change`(변경 표시):** 공개할 때 직전 공개본과 비교해 항목마다 저장한다. 첫 공개의 항목과 그 뒤 바뀌지 않은 항목은 `change: null`이다.
  - `kind`는 `ADDED`(새로 생김) 또는 `CHANGED`다.
  - `changedAt`은 그 변경이 공개된 시각이다. 다음 공개에서 바뀌지 않으면 그대로 이어진다.
  - `fields`는 바뀐 필드 이름이고, `previous`는 그중 `day`·`startTime`·`endTime`·`place`의 이전 값만 담는다(제목·설명의 이전 값은 담지 않는다).
  - **화면 규칙:** `changedAt`이 24시간 안이면 "변경됨"(또는 "새 일정") 표시와 `previous`("09:00 → 09:30")를 보인다. 24시간이 지나면 표시하지 않는다. 기준은 `updates.serverTime`이다.
- **`removedItems`:** 직전 몇 번의 공개에서 지워진 항목 중 지워진 지 24시간 안인 것이다. 화면은 그날 목록에 "취소됨"으로 줄을 그어 보인다. 대상 필터는 `items`와 같다.
- `slotId`는 식사 순서(H4)가 "우리 조 순서"를 붙일 자리다.
- 조회는 audit을 남기지 않는다.

## 9. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| 필드 형식·길이, `day` 범위, `slotId` 형식·일차·분류 불일치, `endTime` = `startTime`, `audience` 모양 | `400 VALIDATION_FAILED`, `errors[].field` |
| 그 행사의 항목이 아님 | `404 RESOURCE_NOT_FOUND` |
| 항목 `expectedVersion`·`expectedBoardVersion` 불일치 | `409 CONCURRENT_MODIFICATION` (`item` 또는 `boardVersion`) |
| 같은 `slotId`를 가진 다른 항목 | `409 CONFLICT`, `reason: SLOT_ALREADY_LINKED`, `itemId` |
| 항목 300개 초과 | `409 CONFLICT`, `reason: ITEM_LIMIT` |
| 행사 기간 없음 | `409 CONFLICT`, `reason: EVENT_PERIOD_REQUIRED` |
| 기간 밖 항목이 있는데 공개 | `409 CONFLICT`, `reason: ITEMS_OUT_OF_PERIOD`, `itemIds` |
| 저장하고 바로 공개에 다른 미공개 변경 | `409 CONFIRMATION_REQUIRED`, `otherChanges` |
| `ENDED`·`ARCHIVED` | `409 EVENT_ENDED`·`409 EVENT_ARCHIVED` |

## 10. audit

- `SCHEDULE_PUBLISHED`: detail `publicationId`, `boardVersion`, `added`, `changed`, `removed`(개수), `notify`, `notifiedCount`. `ALREADY_PUBLISHED`는 남기지 않는다.
- 항목 만들기·고치기·지우기는 audit을 남기지 않는다. 공개본 스냅샷이 공개 기록이고, 작업본 편집 이력은 1차에 저장하지 않는다(DEC-048의 되돌리기는 지난 공개본을 보고 다시 고친다).

## 11. 테이블 초안

```sql
CREATE TABLE schedule_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE schedule_items (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  day smallint NOT NULL CHECK (day >= 1),
  start_time time NOT NULL,
  end_time time,
  title varchar(100) NOT NULL,
  place varchar(100),
  description varchar(2000),
  category varchar(16) NOT NULL CHECK (category IN ('WORSHIP','MEAL','PROGRAM','GROUP','FREE','MOVE','OTHER')),
  audience jsonb NOT NULL,
  slot_id varchar(32),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  version integer NOT NULL CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  CONSTRAINT schedule_items_end CHECK (end_time IS NULL OR end_time <> start_time),
  CONSTRAINT schedule_items_slot UNIQUE (space_id, event_id, slot_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX schedule_items_order ON schedule_items (space_id, event_id, day, start_time, sort_order);

-- 공개 스냅샷. 개인정보가 없으므로 항목 내용 전체와 항목별 change를 담는다.
-- snapshot: { items: [ { itemId, day, startTime, endTime, title, place, description, category,
--                        audience, slotId, sortOrder, change } ], removedItems: [ … ] }
CREATE TABLE schedule_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  changes jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX schedule_publications_latest ON schedule_publications (space_id, event_id, seq DESC);
```

- `UNIQUE (space_id, event_id, slot_id)`는 `slot_id`가 `NULL`인 행끼리 겹쳐도 된다(PostgreSQL 기본).
- 참가자 조회는 최근 공개 행 하나의 `snapshot`만 읽고 대상으로 거른다. 이름·전화가 없어 읽을 때 붙일 값이 없다.
- `removedItems`는 공개할 때 직전 스냅샷의 `removedItems` 중 24시간 안인 것과 이번에 지워진 것을 합쳐 다시 담는다.

## 12. 시험 조건

- 작업본 저장은 참가자 응답·`updates.schedule`을 바꾸지 않는다. 공개하면 둘 다 바뀐다.
- 두 운영자가 같은 항목을 고치면 늦은 쪽이 `409 CONCURRENT_MODIFICATION`이고 저장되지 않는다. 다른 항목이면 둘 다 저장된다.
- 저장하고 바로 공개는 다른 미공개 변경이 있으면 확인 없이 아무것도 저장하지 않는다. 확인하면 저장과 공개가 함께 커밋된다. 공개 단계가 실패하면 저장도 되돌린다.
- `LEADERS` 항목은 공개본의 조장에게만, `STAFF` 항목은 아무 참가자에게도 보이지 않는다. 조장이 풀린 공개 뒤 다음 읽기에서 `LEADERS` 항목이 사라진다.
- `22:00`–`00:30` 항목이 `endsNextDay: true`이고 `endsAt`이 다음 날이다.
- 같은 `slotId`를 두 항목에 줄 수 없다.
- `ENDED`에서 쓰기가 `409 EVENT_ENDED`이고 참가자는 마지막 공개본을 계속 본다.
