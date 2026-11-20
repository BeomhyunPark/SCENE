# 식사 순서(조별 배식 차례) 계약 초안

> **1월 범위 밖으로 보류됐다. 구현하지 않는다.** 사용자 결정 2026-11-20("식사 순서는 일단 전부 빼자. 현장에서 관리 가능하다"), [DEC-086](../product/PRODUCT_DECISIONS.md) Follow-up, 로드맵 6.1 결정 14. 아래 본문은 다시 할 때의 출발점으로 그대로 둔다. 참가자 홈의 `features.mealOrder`·`updates.mealOrder` 키는 응답에 남고 1월에는 늘 꺼짐·0이다.

> **아직 서버에 없다. 계약 초안이다.** 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#384](https://github.com/BeomhyunPark/SCENE/issues/384) H2(서버)·H3(운영자 화면)·H4(참가자 화면)에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

- 정책: [DEC-086](../product/PRODUCT_DECISIONS.md) (H1, [#426](https://github.com/BeomhyunPark/SCENE/issues/426))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `features.mealOrder`·`updates.mealOrder`·`MEAL_ORDER_PUBLISHED`·"다음 식사" 카드, [일정표](schedule-contract.md)(DEC-081)의 `slotId`, [내 조](participant-group-contract.md)(DEC-083)의 `leaderView`, api.md "조 편성"의 조·공개본
- 본보기: [일정표 계약](schedule-contract.md)(작업본·공개본, "저장하고 바로 공개", `confirmOtherChanges`, `notify`)
- 작성: 2026-11-20. 확인 방법: 로드맵, #384·#382·#230, DEC-043·046·047·070·072·073·074·079~083, api.md "조 편성"·"신청 집계", 계약 초안 네 개, `event/group/`·`MealSlots`·`Permission`·`ErrorCode`, 마이그레이션 V13·V14·V16을 읽었다. **서버 검증과 실제 클릭은 하지 않았다.**

공통 규칙은 api.md "공통"을 따른다. 운영자 경로는 `/api/v1/operator/events/{eventId}/meal-order…`, 참가자 경로는 `/api/v1/participant/meal-order`다. "가칭"이라고 적은 이름은 아직 코드에 없고 서버 PR이 정한다. 코드에 있는 이름(`SCHEDULE_WRITE`, `EVENT_READ`, `MealSlots`, `groups`, `group_publications`, ErrorCode 값)은 2026-11-20 main에서 확인했다.

## 1. 개념

- **식사 순서는 "조별 배식 차례" 안내다.** 체크가 아니다. 식수는 끼니마다 QR을 찍지 않는다(로드맵 결정 1). 이 기능은 식수 숫자를 만들지 않는다.
- **표의 모양은 끼니 × 조 → 차례·시각**이다. 끼니마다 조마다 **차례 번호**(1부터)와 **선택 시각**(`HH:mm`)을 둔다. 같은 차례를 여러 조가 가질 수 있다(1차·2차 배식 묶음).
- **끼니는 칸 id다.** `opt_d{일차}_{breakfast|lunch|dinner}`. 신청서 설정의 식사 칸(DEC-070), 식수 집계(DEC-073), 편성판 `slots`(DEC-072 Follow-up), 일정 항목 `slotId`(DEC-081)와 같은 키다. 집회 칸(`worship`)은 끼니가 아니라서 쓰지 않는다.
- **작업본과 공개본**은 일정표와 같다. 작업본 저장은 참가자에게 보이지 않고, 공개하면 표 전체를 스냅샷으로 찍는다. 참가자는 가장 최근 공개본만 본다.
- **일정표와 따로 공개한다**(§7, 결정 대기 1). "저장하고 바로 공개"도 있다(§6.5).

## 2. 끼니 목록과 조 목록

### 2.1 끼니(칸)

- 출처는 **신청서 설정의 식사 칸**이다. 서버는 `MealSlots.days(setup, labels)`(편성판·집계와 같은 코드)에서 `meal`이 `BREAKFAST`·`LUNCH`·`DINNER`인 칸만 칸 순서(일차 → 아침 → 점심 → 저녁)로 쓴다. 칸의 `label`·`dayLabel`도 그 코드의 값이다.
- **설정이 없거나 식사 칸이 하나도 없는 행사**(신청서 없음, `fromSetup: false`, 일정표에 식사를 하나도 켜지 않음)는 `slots: []`이고 쓰기는 `409 CONFLICT`, `reason: NO_MEAL_SLOTS`다. 화면은 "신청서 설정에서 식사 칸을 켜면 순서를 만들 수 있어요"를 보인다.
- 설정에서 꺼진 칸(접수 전에 설정을 고친 경우)의 저장된 순서는 지우지 않고 운영자 표에 `orphanSlots`로 보인다. 공개에는 넣지 않는다.
- 일정표 작업본에 같은 `slotId`를 가진 식사 항목이 있으면 운영자 표의 칸에 그 항목의 시작 시각·장소를 함께 보인다(시각 자동 채우기의 기준, §6.3).

### 2.2 조

- 표의 줄은 **조 편성 작업본의 조**(`groups` 테이블, 조 순서 `sort_order`)다. 순서를 미리 만들 수 있게 하려는 것이다.
- **참가자에게 보이는 것은 조 편성 공개본과 맞춘다.** 참가자의 조는 가장 최근 `group_publications`에서 정하고, 조 이름도 그 공개본의 이름을 쓴다. 식사 순서 공개본에 있지만 조 편성 공개본에 없는 조(아직 공개하지 않은 새 조)는 참가자 표에 나오지 않는다.
- 작업본의 조 목록과 조 편성 공개본의 조 목록이 다르면(조를 더하거나 지우고 아직 조 편성을 공개하지 않음) 식사 순서 공개가 확인을 받는다(§6.4, `GROUPS_NOT_PUBLISHED`).

### 2.3 조를 더하거나 지웠을 때 맞추기(H2 완료 조건)

서버는 저장된 줄을 그대로 쓰지 않고 **읽을 때마다 맞춘 표**(실효 표)를 만든다. 운영자 표·공개·비교·참가자 응답 모두 이 실효 표를 쓴다.

1. **지운 조:** 그 조의 줄은 DB에서 함께 지워진다(`group_id` FK `ON DELETE CASCADE`). 조 편성 코드는 바꾸지 않는다.
2. **새 조:** 순서가 있는 끼니(줄이 하나 이상 있는 끼니)에 줄이 없는 조는 **맨 뒤 차례(지금 가장 큰 차례 + 1)**에 시각 없이 붙는다. 새 조가 여럿이면 조 순서대로 하나씩 뒤에 붙는다. 운영자 표에는 `added: true`로 표시한다. 순서가 없는 끼니에는 붙지 않는다.
3. **차례 번호 당기기:** 끼니마다 차례 번호를 빈틈 없이 1부터 다시 매긴다(1, 2, 2, 4 → 1, 2, 2, 3). 같은 차례 묶음은 유지된다. 시각은 줄마다 저장되므로 번호가 당겨져도 그 조의 시각은 그대로다.

실효 표가 공개본과 다르면 "미공개 변경"이다(조를 지우거나 더하기만 해도 그렇다). `boardVersion`은 식사 순서를 저장할 때만 오르므로 조 추가·삭제로는 오르지 않는다. 다음 저장이 그 끼니의 실효 표를 그대로 저장한다.

## 3. 표의 값

```json
{
  "slotId": "opt_d2_lunch",
  "ordered": true,
  "version": 4,
  "entries": [
    { "groupId": "…", "turn": 1, "time": "12:00", "added": false },
    { "groupId": "…", "turn": 1, "time": "12:00", "added": false },
    { "groupId": "…", "turn": 2, "time": "12:20", "added": false },
    { "groupId": "…", "turn": 3, "time": null, "added": true },
    { "groupId": "…", "turn": null, "time": null, "added": false }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `ordered` | 이 끼니에 순서가 있는지. 줄이 없으면 `false`("순서 없음", 자유 배식) |
| `version` | 끼니마다. 그 끼니가 저장될 때 1 오른다. 저장한 적이 없으면 0 |
| `entries[].turn` | 1–100 정수 또는 `null`. `null`은 "이 끼니에는 이 조의 차례가 없음"(외부 일정 등)이다. 같은 값은 같은 배식 묶음이다 |
| `entries[].time` | 선택. `HH:mm`(00:00–23:59), 행사 현지 시각(Asia/Seoul, DEC-081 §3). 같은 차례의 조끼리 달라도 저장한다(화면은 다르면 표시만 한다) |
| `entries[].added` | 읽기 전용. §2.3의 2번으로 붙은 줄이면 `true` |

`entries` 순서는 차례 → 조 순서이고, `turn: null`은 맨 뒤다.

## 4. 버전과 동시 수정

- `boardVersion`: 행사당 하나. 식사 순서 작업본이 바뀔 때마다 1 오른다(끼니 저장, 자동 채우기). 공개는 올리지 않는다. 처음은 0이다.
- 끼니 `version`: 한 끼니 저장(`PUT …/slots/{slotId}`)은 `expectedVersion`이 필요하다. 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`, 확장 필드 `slot`(지금 실효 값). 서로 다른 끼니를 고치는 두 운영자는 충돌하지 않는다.
- 자동 채우기와 공개는 `expectedBoardVersion`이 필요하다. 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.
- 쓰기는 행사 행을 잠그고 처리한다. `Idempotency-Key`는 읽지 않는다. 같은 공개를 다시 보내면 `ALREADY_PUBLISHED`다(DEC-047).

## 5. 권한과 행사 상태

| 동작 | 권한 |
|---|---|
| 작업본·공개본 조회(운영자) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 끼니 저장, 자동 채우기, 공개, 저장하고 바로 공개 | 유효한 `SCHEDULE_WRITE` |

- 표에는 조 이름과 차례·시각만 있고 개인정보가 없어 읽기를 업무 권한으로 좁히지 않는다(일정표와 같다).
- `SCHEDULE_WRITE`는 `OWNER`와 `MANAGER`가 기본으로 갖는다(DEC-079). 일정을 맡은 사람이 식사 시각도 맡는다. 새 권한 키는 없다(#384 추천안).

| 행사 상태 | 조회 | 쓰기·공개 | 참가자 식사 순서 |
|---|---|---|---|
| `DRAFT`·`ACTIVE` | 조회 | 가능 | 공개본 |
| `ENDED` | 조회 | `409 EVENT_ENDED` | 마지막 공개본 |
| `ARCHIVED` | 조회 | `409 EVENT_ARCHIVED` | 마지막 공개본 |

쓰기의 판정 순서는 조 편성·일정표와 같다: 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → 버전·충돌(`409`) → 규칙·확인(`409`) → 결과.

## 6. 운영자 경로

### 6.1 `GET /api/v1/operator/events/{eventId}/meal-order`

작업본(실효 표)이다.

`200`

```json
{
  "eventStatus": "ACTIVE",
  "boardVersion": 12,
  "groups": [
    { "groupId": "…", "name": "1조", "sortOrder": 0, "published": true },
    { "groupId": "…", "name": "9조", "sortOrder": 8, "published": false }
  ],
  "slots": [
    {
      "slotId": "opt_d1_dinner", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)",
      "meal": "DINNER", "label": "저녁",
      "scheduleItem": { "itemId": "…", "startTime": "18:00", "place": "식당" },
      "ordered": true, "version": 3, "turnCount": 5,
      "publishState": "CHANGED",
      "entries": [ { "groupId": "…", "turn": 1, "time": "18:00", "added": false } ]
    }
  ],
  "orphanSlots": [ { "slotId": "opt_d3_dinner", "entryCount": 8 } ],
  "publication": {
    "lastPublishedAt": "2027-01-15T10:00:00Z",
    "lastPublishedByDisplayName": "김OO",
    "lastPublishedBoardVersion": 10,
    "hasUnpublishedChanges": true,
    "changedSlotIds": ["opt_d1_dinner"]
  },
  "groupPublication": { "publishedAt": "2026-12-20T09:00:00Z", "matchesDraft": false }
}
```

- `groups`는 조 편성 작업본의 조를 조 순서로. `published`는 가장 최근 조 편성 공개본에 그 조가 있는지다.
- `slots`는 §2.1의 끼니 전부다(순서가 없는 끼니도 `ordered: false`, `entries: []`로 나온다). `turnCount`는 실효 표의 서로 다른 차례 수다.
- `scheduleItem`은 일정표 **작업본**에서 같은 `slotId`를 가진 항목이다(없으면 `null`). 운영자 조회 권한이 같아(`EVENT_READ`) 따로 막지 않는다.
- `publishState`는 최근 공개본과 비교한 끼니 값: `UNCHANGED`, `CHANGED`, `ADDED`(공개본에 없는 끼니), `REMOVED`(공개본에는 순서가 있는데 지금 없음). 공개한 적이 없으면 순서가 있는 끼니는 `ADDED`다. 비교는 실효 표의 조별 `turn`·`time`으로 한다.
- `groupPublication.matchesDraft`는 작업본의 조 id 집합과 조 편성 공개본의 조 id 집합이 같은지다. 조 편성을 공개한 적이 없으면 `publishedAt: null`, `matchesDraft: false`다.

### 6.2 `PUT /api/v1/operator/events/{eventId}/meal-order/slots/{slotId}`

한 끼니를 통째로 바꾼다. **손으로 고치기**(차례 바꾸기, 묶기, 시각 넣기, 이 끼니에서 빼기, 순서 없애기)가 모두 이 요청이다.

```json
{
  "expectedVersion": 3,
  "entries": [
    { "groupId": "…", "turn": 1, "time": "12:00" },
    { "groupId": "…", "turn": 1, "time": "12:00" },
    { "groupId": "…", "turn": 2, "time": "12:20" }
  ],
  "publish": false
}
```

- `slotId`가 §2.1의 끼니가 아니면 `404 RESOURCE_NOT_FOUND`.
- `entries: []`는 "순서 없음"으로 만든다(그 끼니의 줄을 모두 지운다).
- 그 밖에는 **작업본의 모든 조를 정확히 한 번씩** 담는다. 빠지거나 더하거나 모르는 조가 있으면 아무것도 저장하지 않고 `409 CONFLICT`, `reason: GROUPS_CHANGED`, 확장 필드 `groups`(지금 조 목록). 화면은 표를 다시 읽는다. 겹치면 `400 VALIDATION_FAILED`(필드 `entries`).
- `turn`·`time` 형식이 틀리면 `400`(필드 `entries`). 서버는 차례 번호를 §2.3의 3번처럼 당겨 저장한다. 모든 조가 `turn: null`이면 "순서 없음"과 같게 저장한다.
- 실효 표와 같으면 아무것도 바꾸지 않고 `200`(버전 그대로).

`200` 본문은 `{ "slot": { 끼니 값 }, "boardVersion": 13, "publication": null }`이다. `publish: true`면 §6.5.

### 6.3 `POST /api/v1/operator/events/{eventId}/meal-order/fill` — 순환 자동 채우기

첫 끼니 순서를 정하면 끼니마다 한 칸씩 돌려 채운다. 단순한 돌려 채우기라 자동 편성(알고리즘 배정)이 아니다.

```json
{
  "expectedBoardVersion": 12,
  "slotIds": ["opt_d1_dinner", "opt_d2_breakfast", "opt_d2_lunch", "opt_d2_dinner", "opt_d3_breakfast"],
  "firstOrder": ["g1", "g2", "g3", "g4", "g5", "g6"],
  "shift": 1,
  "groupsPerTurn": 2,
  "intervalMinutes": 15,
  "publish": false
}
```

| 키 | 규칙 | 생략하면 |
|---|---|---|
| `slotIds` | §2.1 끼니 중 채울 것, **보낸 순서가 돌리는 순서**다. 1개 이상, 겹치면 `400` | 모든 끼니(칸 순서) |
| `firstOrder` | 첫 끼니의 조 순서. 작업본의 모든 조를 정확히 한 번씩. 아니면 `409 CONFLICT`, `reason: GROUPS_CHANGED` | 조 순서 |
| `shift` | 끼니마다 앞에서 뒤로 보내는 조 수. 0 이상 정수(0이면 모든 끼니가 같은 순서) | 1 |
| `groupsPerTurn` | 한 차례에 묶는 조 수. 1–20 | 1 |
| `intervalMinutes` | 차례 사이 분. 0–180 또는 `null`(시각을 넣지 않음) | `null` |

**규칙:** 조 수를 `n`, `slotIds`의 `k`번째(0부터) 끼니의 순서를 `firstOrder`를 왼쪽으로 `(k × shift) mod n`칸 돌린 것으로 한다(첫 끼니에 맨 앞이던 조가 다음 끼니에 맨 뒤로 간다). 그 순서의 `i`번째(0부터) 조의 차례는 `floor(i / groupsPerTurn) + 1`이다. `intervalMinutes`가 있고 일정표 작업본에 그 `slotId`의 항목이 있으면 차례 `t`의 시각은 `항목 시작 시각 + (t − 1) × intervalMinutes`이고, 23:59를 넘거나 항목이 없으면 `null`이다.

예: 조 6개, `shift` 1, `groupsPerTurn` 2, 저녁 항목 18:00, `intervalMinutes` 15

| 끼니 | 1차 | 2차 | 3차 |
|---|---|---|---|
| 1일 저녁 | 1조·2조 18:00 | 3조·4조 18:15 | 5조·6조 18:30 |
| 2일 아침 | 2조·3조 | 4조·5조 | 6조·1조 |
| 2일 점심 | 3조·4조 | 5조·6조 | 1조·2조 |

- `slotIds`의 끼니는 **통째로 덮어쓴다**(손으로 고친 것도). 화면은 "선택한 N끼니의 순서를 새로 채워요"로 확인받는다. 넣지 않은 끼니는 그대로다.
- 조가 하나도 없으면 `409 CONFLICT`, `reason: NO_GROUPS`.
- 덮어쓴 끼니마다 `version`이 1 오르고 `boardVersion`은 1 오른다.

`200` 본문은 `{ "slots": [ 바뀐 끼니 값 ], "boardVersion": 13, "publication": null }`이다. `publish: true`면 §6.5.

### 6.4 `POST /api/v1/operator/events/{eventId}/meal-order/publish`

```json
{ "expectedBoardVersion": 13, "confirmGroupMismatch": false, "notify": true }
```

판정은 행사 상태 다음에 이 순서다.

1. `boardVersion`이 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.
2. 공개한 적이 있고 실효 표가 최근 공개본과 같으면 `200`, `result: ALREADY_PUBLISHED`. 아무것도 남기지 않는다. 공개한 적이 없으면 건너뛴다(순서가 하나도 없어도 첫 공개가 된다).
3. 작업본의 조 목록이 조 편성 공개본과 다르고(`matchesDraft: false`) `confirmGroupMismatch`가 `false`면 `409 CONFIRMATION_REQUIRED`, 확장 필드 `reason: GROUPS_NOT_PUBLISHED`, `notInGroupPublication: ["조 id"]`(작업본에만 있는 조), `notInDraft: ["조 id"]`(공개본에만 있는 조). 화면은 "조 편성을 먼저 공개하면 새 조의 순서도 참가자에게 보여요"를 보인다.
4. 공개한다. 같은 트랜잭션에서: 공개 행 하나, DEC-080 `participant_feed_versions.meal_order` +1, audit `MEAL_ORDER_PUBLISHED`, `notify`면 알림(§8).

`200`

```json
{
  "result": "PUBLISHED",
  "publicationId": "…",
  "publishedAt": "2027-01-15T10:00:00Z",
  "boardVersion": 13,
  "changes": { "slotIds": ["opt_d1_dinner", "opt_d2_lunch"], "groupIds": ["…", "…"] },
  "notifiedCount": 38
}
```

- `changes.slotIds`는 직전 공개본과 비교해 순서가 생기거나 없어지거나 어느 조의 `turn`·`time`이 바뀐 끼니, `groupIds`는 그런 끼니에서 차례·시각이 바뀐 조다. 첫 공개는 순서가 있는 모든 끼니와 그 조들이다.
- `ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 최근 공개 값이고 `changes`는 비었으며 `notifiedCount`는 0이다.
- **스냅샷에 찍는 것:** `{ "slots": [ { "slotId", "entries": [ { "groupId", "turn", "time" } ] } ] }`. §2.1의 지금 끼니 중 순서가 있는 것만, 실효 표 그대로(`turn: null` 줄은 빼고) 담는다. 조 이름은 담지 않는다(참가자 쪽은 조 편성 공개본의 이름을 쓴다).

### 6.5 저장하고 바로 공개

끼니 저장(§6.2)과 자동 채우기(§6.3)에 `publish: true`를 붙이면 저장과 공개를 **한 트랜잭션**에서 한다. 현장에서 "점심 순서 바꿔요"를 휴대폰으로 바로 내보내는 경로다. 일정표 "저장하고 바로 공개"(DEC-081 §5)와 같은 규칙이다.

- 저장 판정(버전·조 목록)이 먼저다. 저장이 실패하면 공개도 하지 않는다.
- 이 저장을 뺀 작업본이 최근 공개본과 다르면 `confirmOtherChanges: true`가 없을 때 `409 CONFIRMATION_REQUIRED`, `reason: OTHER_CHANGES`, 확장 필드 `otherChanges: { "slotIds": [...] }`이고 아무것도 저장하지 않는다.
- §6.4의 3번(조 목록 불일치)도 같은 요청의 `confirmGroupMismatch`로 확인한다.
- 공개 판정의 `expectedBoardVersion`은 서버가 이 저장 직후 값으로 채운다. `notify`는 §6.4와 같다(생략하면 `true`).
- 응답의 `publication`이 §6.4 공개 응답이다.

### 6.6 `GET /api/v1/operator/events/{eventId}/meal-order/published`

가장 최근 공개본을 조 이름(조 편성 공개본 기준, 없으면 작업본 이름)과 함께 준다. 모양은 참가자 응답의 `slots[].turns`와 같다. 공개한 적이 없으면 `{ "publishedAt": null, "slots": [] }`다.

## 7. 공개 방식: 일정표와 따로

**식사 순서는 일정표와 따로 공개한다.** "저장하고 바로 공개"를 둔다. 이유:

- 일정표는 시각·장소 하나를 고칠 때마다 공개한다(DEC-081). 같이 묶으면 식사 순서를 손보는 중에 일정 한 줄을 공개할 수 없거나, 정리 중인 식사 순서가 같이 나간다.
- 식사 순서는 조 편성 공개 뒤에야 의미가 있어 준비 시점이 다르다. 따로 두면 각자의 `ALREADY_PUBLISHED`·미공개 변경 표시가 정확하다.
- 참가자 쪽은 `slotId`로 이미 이어진다(§9). 공개를 묶지 않아도 화면이 둘을 합쳐 보인다.
- 알림이 따로 간다. 일정 시각 변경 알림과 "우리 조 순서가 바뀌었어요"는 받는 사람이 다르다.
- 같은 사람(`SCHEDULE_WRITE`)이 둘을 고치므로 화면은 일정표의 식사 항목 옆에 "식사 순서 열기"를 둔다(H3).

## 8. 갱신과 알림

- `participant_feed_versions.meal_order`는 `PUBLISHED`일 때만 오른다. 작업본 저장·`ALREADY_PUBLISHED`·조 추가·삭제에는 오르지 않는다.
- `MEAL_ORDER_PUBLISHED`(`target: { "type": "MEAL_ORDER", "id": null }`). `notify`가 `true`면 공개와 같은 트랜잭션에서 만든다.

| 공개 | 받는 사람 | 문구(초안) |
|---|---|---|
| 첫 공개 | 조 편성 공개본에서 조가 있고, 그 조가 이번 공개본에 차례를 하나 이상 가진 활성 참가자 | 제목 "식사 순서가 올라왔어요", 본문 "3조 · 내 조 차례를 확인해 주세요" |
| 두 번째 이후 | 위 사람 중 내 조가 `changes.groupIds`에 있는 사람 | 제목 "식사 순서가 바뀌었어요", 본문 "1월 23일 (토) 점심 외 1끼니" |

- 문구에는 **내 조 이름과 끼니 이름까지**만 넣는다. 다른 참가자의 이름은 없다. 다른 조의 이름도 넣지 않는다.
- 조가 없는 참가자, 조 편성을 공개하지 않은 행사의 참가자는 받지 않는다.
- 읽지 않은 `MEAL_ORDER_PUBLISHED`가 있으면 합친다(DEC-080 §7.3).
- 조 편성을 다시 공개해 내 조가 바뀐 사람은 `GROUP_PUBLISHED`를 받는다. 식사 순서 알림을 따로 만들지 않는다(화면은 §9.3대로 다시 읽는다).

## 9. 참가자 경로

### 9.1 `GET /api/v1/participant/meal-order`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 응답 헤더 `Cache-Control: no-store`. 가장 최근 식사 순서 공개본과 가장 최근 조 편성 공개본만 읽는다. 행사 상태와 상관없이 같다.

`200`

```json
{
  "status": "PUBLISHED",
  "publishedAt": "2027-01-15T10:00:00Z",
  "groupStatus": "ASSIGNED",
  "group": { "name": "3조" },
  "slots": [
    {
      "slotId": "opt_d2_lunch", "day": 2, "date": "2027-01-23", "dayLabel": "1월 23일 (토)",
      "meal": "LUNCH", "label": "점심",
      "turnCount": 3,
      "mine": { "turn": 2, "time": "12:20" },
      "attending": true,
      "turns": [
        { "turn": 1, "time": "12:00", "groups": ["1조", "2조"] },
        { "turn": 2, "time": "12:20", "groups": ["3조", "4조"] },
        { "turn": 3, "time": null, "groups": ["5조"] }
      ]
    }
  ]
}
```

| `status` | 경우 | `slots` |
|---|---|---|
| `NOT_ELIGIBLE` | `SUBMITTED` 신청이 없다(먼저 본다) | `[]` |
| `NOT_PUBLISHED` | 식사 순서를 공개한 적이 없다 | `[]` |
| `PUBLISHED` | 공개본이 있다 | 순서가 있는 끼니, 칸 순서 |

- `groupStatus`·`group`은 조 편성 공개본 기준이다: `ASSIGNED`(내 조 있음, `group: { name }`), `UNASSIGNED`(공개됐지만 내 조 없음), `NOT_PUBLISHED`(조 편성을 공개한 적 없음). 뒤의 둘은 `group: null`이고 모든 끼니의 `mine`이 `null`이다. `NOT_ELIGIBLE`·`NOT_PUBLISHED`에서는 `groupStatus`도 `null`이다.
- `mine`은 그 끼니에서 내 조의 차례·시각이다. 내 조가 그 끼니 공개본에 없으면(공개 뒤에 생긴 조, 그 끼니에서 뺀 조) `null`이다. 화면은 "이 식사에는 우리 조 순서가 없어요"를 보인다.
- **`attending`은 내가 그 끼니에 있는지다.** 참석 칸 계산(`MealSlots.attended`, 운영자가 고친 값 먼저)으로 정한다. `false`면 부분 참석자가 그 끼니에 없는 것이고, 화면은 차례를 흐리게 보이며 "이 식사에는 참석하지 않아요"를 붙인다. 모르면 `null`(표시하지 않음). 내 참석 칸은 내 신청에서 나온 값이다.
- **`turns`(전체 표)는 모두에게 보인다.** 조 이름과 차례·시각만 있고 사람 정보가 없다(결정 대기 3). 조 편성 공개본에 없는 조는 빠지고, 그래서 그 차례가 비면 그 차례도 빠진다(번호는 공개본 그대로라 화면은 빈 번호를 그대로 둔다).
- 끼니의 `label`·`dayLabel`은 지금 신청서 설정의 값이다. 공개 뒤 설정에서 사라진 끼니는 빠진다.
- **없는 것:** 사람 이름·id·전화·답·조원 수, 다른 조의 조원.
- 조회는 audit을 남기지 않는다. 읽기 비용: 세션 → 내 신청 → 식사 순서 공개 행 하나 → 조 편성 공개 행 하나 → 설정 한 행.

### 9.2 홈 "다음 식사" 카드 (H4, 화면이 계산)

DEC-080 §6과 같은 방식으로 **화면이** `schedule`·`meal-order` 응답과 `updates.serverTime`으로 계산한다. 서버는 "다음 식사"를 따로 주지 않는다.

1. 일정 공개본에서 `category: MEAL`이고 `slotId`가 있는 항목을 시각 순으로 본다.
2. "지금 또는 다음 식사" = 현재 < 끝(끝이 없으면 시작 + 60분)인 가장 이른 항목이다. 식사 중이면 그 식사를 보인다.
3. 카드: 끼니 이름(`1월 23일 (토) 점심`)·항목 시각·장소. `meal-order`의 같은 `slotId` 끼니에 `mine`이 있으면 "우리 조 2번째 · 12:20"(시각이 없으면 "우리 조 2번째"), 묶음이면 "1차"처럼 같은 문구, `attending: false`면 "이 식사에는 참석하지 않아요".
4. 일정을 공개하지 않았거나 식사 항목에 `slotId`가 없으면: `meal-order.slots`에서 날짜가 오늘(행사 현지) 이후인 첫 끼니를 시각 없이 보인다.
5. 식사 항목이 모두 지나면 "식사가 모두 끝났어요".
6. 일정 탭의 식사 항목(`slotId`가 있는 것)에도 같은 문구를 작은 표로 붙인다.

### 9.3 다시 읽는 때

화면은 `updates.mealOrder` **또는** `updates.group`이 바뀌면 `meal-order`를 다시 읽는다(내 조가 바뀌면 내 차례가 바뀐다). `updates.schedule`이 바뀌면 `schedule`을 다시 읽고 카드를 다시 계산한다.

## 10. DEC-080·DEC-083 계약에 더하는 것

[participant-home-contract](participant-home-contract.md)와 [participant-group-contract](participant-group-contract.md)는 다른 세션이 고치고 있어 이 문서에 적는다. H2·H4 PR이 그 문서(또는 그때의 api.md)에 옮긴다.

### 10.1 DEC-080(참가자 홈)에 더하는 것

| 자리 | 정하는 것 |
|---|---|
| §1 다음 식사 카드 "`meal-order`(H1에서 정함)" | 경로는 `GET /participant/meal-order`. 계산은 §9.2 |
| §2 `features.mealOrder` | 규칙은 그대로. "공개본이 있다"는 식사 순서 공개 행이 있다는 뜻이다. 신청서에 식사 칸이 없는 행사는 유형 기본값이 켬이어도 카드가 빈 상태다 |
| §4 `updates.mealOrder` 오르는 때 | 식사 순서 공개(`PUBLISHED`)만 |
| §4 다시 읽기 | `meal-order`는 `mealOrder` 또는 `group`이 바뀔 때 다시 읽는다(§9.3) |
| §7.2 `MEAL_ORDER_PUBLISHED` 받는 사람 | §8 표 |
| §10 시험 조건 | `MEAL_ORDER_PUBLISHED` 문구에 다른 참가자 이름이 없다 |

### 10.2 DEC-083(내 조)에 더하는 것 — F4

- 식사 순서는 **조 단위**라 `leaderView.members[]`에 키를 더하지 않는다(DEC-083 확장 지점 (3)을 이렇게 닫는다). 조장 화면은 같은 `GET /participant/meal-order`로 우리 조 차례를 보이고, 끼니마다 그 끼니에 있는 조원 수를 `leaderView.members[].attendance.slotIds`로 센다("점심 2번째 · 7명").
- 조장에게 따로 열리는 정보는 없다.

### 10.3 식수 현황(E3)과의 관계

같은 칸 id를 쓸 뿐이다. 이 기능은 식수 숫자를 만들지 않고, E3는 식사 순서를 읽지 않는다. 나중에 "차례별 인원"(조 공개본 × 참석 칸)을 E3나 H3에 보이려면 화면이 계산한다(확장 지점 3).

## 11. 확장 지점

1. **조별 당번(청소·설거지):** 테이블은 처음부터 `kind`(1월은 `MEAL`)를 갖는다(§12). 당번은 `kind = 'DUTY'`, 칸은 신청서 칸이 아니라 운영자가 만드는 칸(가칭 `group_turn_slot_defs`, id `duty_d{일차}_{키}`)이고, 경로는 `/operator/events/{eventId}/duties…`·`/participant/duties`, `features.duties`·`updates.duties`를 하나씩 더한다. 실효 표(§2.3)·자동 채우기(§6.3)·공개·알림 규칙은 그대로 쓴다. 권한은 그때 정한다(`SCHEDULE_WRITE` 재사용이 기본안).
2. **끼니별 체크(구조 7):** 같은 칸 id로 체크 지점을 더하면 "우리 조 차례에 왔는지"를 셀 수 있다. 1월에는 하지 않는다.
3. **차례별 인원:** 운영자 표에 끼니·차례마다 조 공개본 × 참석 칸으로 센 인원을 보인다(배식 준비용). 서버 값 없이 화면이 센다.
4. **일정 시각과 맞추기:** 일정 항목 시각이 바뀌면 운영자 표에 "식사 시작 시각이 바뀌었어요"를 보이고 다시 채우기를 권한다. 자동으로 바꾸지 않는다(DEC-045와 같은 원칙).
5. **조 대신 다른 묶음:** 방(숙소)이나 또래 단위 순서가 필요하면 줄의 `group_id` 자리에 `target_type`을 더한다.

## 12. 테이블 초안

```sql
-- kind: 1월은 'MEAL'만. 조별 당번이 'DUTY'를 더한다.
CREATE TABLE group_turn_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('MEAL')),
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, kind),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- 끼니마다 한 행(저장한 적이 있으면). 줄이 없으면 "순서 없음".
CREATE TABLE group_turn_slots (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind varchar(16) NOT NULL,
  slot_id varchar(32) NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, kind, slot_id),
  FOREIGN KEY (space_id, event_id, kind) REFERENCES group_turn_boards (space_id, event_id, kind)
);

-- 끼니 × 조 → 차례·시각. 조를 지우면 줄도 지워진다(실효 표 §2.3).
CREATE TABLE group_turn_entries (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind varchar(16) NOT NULL,
  slot_id varchar(32) NOT NULL,
  group_id uuid NOT NULL,
  turn smallint CHECK (turn IS NULL OR turn BETWEEN 1 AND 100),
  turn_time time,
  PRIMARY KEY (space_id, event_id, kind, slot_id, group_id),
  FOREIGN KEY (space_id, event_id, kind, slot_id) REFERENCES group_turn_slots (space_id, event_id, kind, slot_id) ON DELETE CASCADE,
  FOREIGN KEY (space_id, event_id, group_id) REFERENCES groups (space_id, event_id, id) ON DELETE CASCADE
);

-- 공개 스냅샷. snapshot: { slots: [ { slotId, entries: [ { groupId, turn, time } ] } ] }
-- changes: { slotIds, groupIds } (알림과 공개 결과용)
CREATE TABLE group_turn_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind varchar(16) NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  changes jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX group_turn_publications_latest ON group_turn_publications (space_id, event_id, kind, seq DESC);
```

- `groups (space_id, event_id, id)`는 V13의 `groups_event_space` 유일 제약이 이미 있어 FK로 쓸 수 있다.
- 조를 지울 때 이 테이블의 줄이 함께 지워져도 `group_turn_boards.version`은 오르지 않는다. 미공개 변경은 내용 비교로 잡는다(§2.3).
- 공개 스냅샷의 조 id는 FK가 없다(지운 조도 지난 공개본에 남는다). 참가자 쪽은 조 편성 공개본에 없는 조를 빼므로 지운 조가 보이지 않는다.
- 마이그레이션 번호는 H2 PR이 그때의 다음 번호로 정한다. 보존은 행사 데이터와 같이 지운다(DEC-056).

## 13. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| `turn`·`time`·`shift`·`groupsPerTurn`·`intervalMinutes`·`slotIds` 형식·범위, 조 중복 | `400 VALIDATION_FAILED`, `errors[].field` |
| 행사 없음 / 멤버 아님 / 권한 없음 | `404 RESOURCE_NOT_FOUND` / `403 NOT_A_MEMBER` / `403 FORBIDDEN` |
| `ENDED` / `ARCHIVED`에서 쓰기 | `409 EVENT_ENDED` / `409 EVENT_ARCHIVED` |
| 끼니가 아닌 `slotId`(경로) | `404 RESOURCE_NOT_FOUND` |
| 끼니 `expectedVersion`, `expectedBoardVersion` 불일치 | `409 CONCURRENT_MODIFICATION`(`slot` / `boardVersion`) |
| 보낸 조 목록이 지금 조와 다름 | `409 CONFLICT`, `reason: GROUPS_CHANGED`, `groups` |
| 식사 칸이 없는 행사, 조가 없는 행사의 채우기 | `409 CONFLICT`, `reason: NO_MEAL_SLOTS` / `NO_GROUPS` |
| 조 편성 공개본과 조 목록이 다름 | `409 CONFIRMATION_REQUIRED`, `reason: GROUPS_NOT_PUBLISHED` |
| 저장하고 바로 공개에 다른 미공개 변경 | `409 CONFIRMATION_REQUIRED`, `reason: OTHER_CHANGES`, `otherChanges` |
| 참가자 세션 없음 | `401 AUTHENTICATION_REQUIRED` |

## 14. audit

- `MEAL_ORDER_PUBLISHED`(가칭, `AuditActions`에 더한다): detail `publicationId`, `boardVersion`, `changedSlots`(개수), `notify`, `notifiedCount`. `ALREADY_PUBLISHED`는 남기지 않는다.
- 끼니 저장·자동 채우기는 audit을 남기지 않는다(일정표와 같다. 공개 스냅샷이 기록이다).

## 15. 시험 조건

H2 서버 PR은 아래를 통합 테스트로 갖는다.

1. 작업본 저장·자동 채우기는 `GET /participant/meal-order`와 `updates.mealOrder`를 바꾸지 않는다. 공개하면 둘 다 바뀌고 `updates.mealOrder`가 정확히 1 오른다. `ALREADY_PUBLISHED`는 아무것도 늘리지 않는다.
2. 자동 채우기: 조 6개·`shift` 1·`groupsPerTurn` 2에서 §6.3 예시 표와 같은 차례가 나오고, `intervalMinutes`로 넣은 시각이 일정 작업본의 식사 항목 시작에서 계산된다. 항목이 없는 끼니는 시각이 `null`이다.
3. 손으로 고치기: 두 조에 같은 차례를 주면 둘 다 그 차례이고, 1·2·2·4는 1·2·2·3으로 저장된다. `entries: []`는 순서 없음이 된다.
4. **조를 지우면** 그 조의 줄이 사라지고 남은 차례가 당겨진다. **조를 더하면** 순서가 있는 끼니마다 맨 뒤 차례로 `added: true`가 붙는다. 둘 다 `hasUnpublishedChanges`가 `true`가 된다.
5. 두 운영자가 같은 끼니를 고치면 늦은 쪽이 `409 CONCURRENT_MODIFICATION`이고 다른 끼니면 둘 다 저장된다. 그새 조가 바뀌면 `409 CONFLICT GROUPS_CHANGED`이고 저장되지 않는다.
6. 조 편성 작업본에 새 조가 있고 공개하지 않았으면 식사 순서 공개가 `409 CONFIRMATION_REQUIRED GROUPS_NOT_PUBLISHED`다. 확인하면 공개되고, 참가자 표에는 그 조가 나오지 않는다.
7. 저장하고 바로 공개는 다른 끼니에 미공개 변경이 있으면 확인 없이 아무것도 저장하지 않는다. 공개 단계가 실패하면 저장도 되돌린다.
8. 참가자: 조가 없는 사람은 `groupStatus: UNASSIGNED`·`mine: null`이고 `turns`는 보인다. 조 편성을 공개하지 않은 행사는 `groupStatus: NOT_PUBLISHED`다. 신청이 없는 사람은 `NOT_ELIGIBLE`이다. 그 끼니에 없는 부분 참석자는 `attending: false`이고 `mine`은 그대로다.
9. 참가자 응답과 `MEAL_ORDER_PUBLISHED` 문구 어디에도 사람 이름·id·전화·답이 없다. `turns[].groups`는 조 이름 문자열뿐이다.
10. 두 번째 공개의 알림은 차례·시각이 바뀐 조의 활성 참가자에게만 만들어지고, `notify: false`면 만들지 않는다.
11. `SCHEDULE_WRITE`가 없는 운영자의 쓰기는 `403 FORBIDDEN`이고, `EVENT_READ`만 있는 STAFF는 표를 읽는다. `ENDED`에서 쓰기가 `409 EVENT_ENDED`이고 참가자는 마지막 공개본을 본다.
12. 식사 칸이 없는 행사는 표의 `slots`가 `[]`이고 채우기가 `409 CONFLICT NO_MEAL_SLOTS`다. 집회 칸(`worship`)은 끼니에 나오지 않는다.
