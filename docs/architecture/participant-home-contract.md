# 참가자 홈·갱신 확인·알림 계약 초안

> **아직 서버에 없다. 계약 초안이다.** 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#379](https://github.com/BeomhyunPark/SCENE/issues/379) B2·B4·B5와 [#385](https://github.com/BeomhyunPark/SCENE/issues/385) I3에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

- 정책: [DEC-080](../product/PRODUCT_DECISIONS.md) (B1, [#396](https://github.com/BeomhyunPark/SCENE/issues/396))
- 함께 읽는 계약: [일정표](schedule-contract.md)(DEC-081), [공지](notice-contract.md)(DEC-082), [내 조](participant-group-contract.md)(DEC-083)
- 작성: 2026-11-19. 확인 방법: 결정 문서·api.md·마이그레이션·화면 소스를 읽었다. 서버 검증과 실제 클릭은 하지 않았다.

공통 규칙(JSON 이름, 시각, 오류 본문, CSRF, 참가자 세션 쿠키 `SCENE_PSESSION`)은 api.md "공통"을 따른다. 참가자 경로는 모두 참가자 세션 쿠키가 필요하고, 없거나 저장된 세션이 아니면 `401 AUTHENTICATION_REQUIRED`다. 대상은 세션의 행사·참가자뿐이다. 조회 `GET`은 CSRF가 필요 없고 응답 헤더는 `Cache-Control: no-store`다. 참가자 세션을 여는 방법은 DEC-078(다른 세션 작성)이 정한다. 이 문서는 "참가자 세션"으로만 가리킨다.

## 1. 화면 구성

하단 탭은 다섯 개다. 순서는 고정이다.

| 탭 | 보이는 조건 | 내용 |
|---|---|---|
| 홈 | 늘 | 아래 카드 |
| 일정 | `features.schedule` | [`GET /participant/schedule`](schedule-contract.md#get-apiv1participantschedule) |
| 공지 | `features.notices` | [`GET /participant/notices`](notice-contract.md#get-apiv1participantnotices) |
| 내 조 | `features.groups` | [`GET /participant/group`](participant-group-contract.md#get-apiv1participantgroup) |
| 내 정보 | 늘 | 내 신청 보기·고치기(#378 A5), 로그아웃 |

알림함은 탭이 아니다. 화면 위쪽의 종 모양 버튼(읽지 않은 수 표시)으로 연다.

홈 카드는 이 순서다. 영역이 꺼져 있으면 카드가 없다. 켜져 있지만 아직 공개된 것이 없으면 카드가 빈 상태 문구("일정이 올라오면 여기에 보여요" 등)를 보인다.

| 카드 | 보이는 조건 | 읽는 경로 | 내용 |
|---|---|---|---|
| 행사 머리 | 늘 | `home` | 행사 이름·기간·장소, 완료 안내(있으면 접어서) |
| 지금·다음 일정 | `features.schedule` | `schedule` | 지금 진행 중인 항목(없으면 생략)과 다음 항목 하나. 계산은 화면이 한다(§6) |
| 최신 공지 | `features.notices` | `notices` | 고정 공지와 최신 공지 최대 2건 |
| 도착 QR | 늘 | `check-in` | api.md "체크인"의 참가자 QR 그대로 |
| 내 조 | `features.groups` | `group` | 조 이름·조장 이름. 조장이면 "조원 현황" 바로가기 |
| 숙소 | `features.rooms` | `rooms`(G1에서 정함) | 방 이름·위치·같은 방 사람. G1 전에는 빈 상태 |
| 다음 식사 | `features.mealOrder` | `schedule` + `meal-order`(H1에서 정함) | 다음 식사 항목 시각. H1 뒤에는 우리 조 순서와 시각 |

## 2. 기능 영역(`features`)

참가자 화면에서 켜고 끄는 영역은 `schedule`, `notices`, `groups`, `rooms`, `mealOrder` 다섯이다. 도착 QR과 내 정보는 영역이 아니라 늘 있다.

영역이 켜졌는지는 서버가 정해서 `home`에 담는다. 화면은 이 값만 본다.

1. 운영자가 영역을 저장했으면(I5에서 `event_features`로 만든다) 그 값.
2. 저장한 값이 없으면 행사 유형 기본값: `RETREAT`·`CAMP`는 다섯 영역 모두 켬, 그 밖의 유형과 유형 없음은 `schedule`·`notices`만 켬.
3. 1·2와 상관없이, 공개본이 하나라도 있는 영역은 켬으로 본다. 공개한 내용이 화면에서 사라지지 않게 하려는 것이다.

I5 전에는 1번이 없고 2·3번만으로 정한다. 응답 모양은 I5 뒤에도 같다.

## 3. `GET /api/v1/participant/home`

홈 머리와 탭 구성에 필요한 값을 준다. 카드 내용은 각 카드 경로가 준다.

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
  "completionMessage": { "text": "참가비 계좌: …\n문의: …", "updatedAt": "2026-12-10T03:00:00Z" },
  "features": { "schedule": true, "notices": true, "groups": true, "rooms": true, "mealOrder": false },
  "updates": { "…": "아래 updates 응답과 같은 값" }
}
```

- `event.status`는 `DRAFT`·`ACTIVE`·`ENDED`·`ARCHIVED`다. 화면은 `ENDED`·`ARCHIVED`에서 머리에 "행사가 끝났어요"를 보인다. 읽기는 행사 상태로 막지 않는다.
- `startDate`·`endDate`·`place`는 행사 값이고 없으면 `null`이다. `timeZone`은 1월에는 늘 `Asia/Seoul`이다(행사에 시간대 열이 없다).
- `participant.applicationStatus`는 `SUBMITTED` 또는 `NONE`이다. `NONE`이면 각 카드가 이미 정한 `NOT_ELIGIBLE` 상태를 보인다. 신청 취소(A7)는 세션을 끊으므로 보통 `401`로 먼저 끝난다.
- `completionMessage`는 신청서의 완료 안내(#378 A8)다. 저장 위치는 A8이 정한다. 비어 있거나 A8 전이면 `null`이다.
- `updates`는 `GET /participant/updates`와 같은 객체다. 처음 열 때 요청을 하나 줄인다.
- 전화·접근 키·숫자 6자리는 없다. 조회는 audit을 남기지 않는다.

## 4. `GET /api/v1/participant/updates`

화면이 주기적으로 불러 어느 카드가 바뀌었는지만 확인한다. 참가자 200명이 30초마다 부르므로(초당 7건 안팎) 본문이 작고 DB 읽기가 적어야 한다.

`200`

```json
{
  "home": 3,
  "schedule": 12,
  "notices": 7,
  "group": 2,
  "rooms": 0,
  "mealOrder": 0,
  "checkIn": 1,
  "application": 2,
  "notifications": { "latestSeq": 5821, "unreadCount": 2 },
  "pollAfterSeconds": 30,
  "serverTime": "2027-01-22T05:30:12Z"
}
```

| 키 | 범위 | 오르는 때 | 다시 읽는 경로 |
|---|---|---|---|
| `home` | 행사 | 행사 이름·기간·장소·상태, 완료 안내, `features`가 바뀔 때 | `home` |
| `schedule` | 행사 | 일정표를 공개할 때(`PUBLISHED`만. `ALREADY_PUBLISHED`는 아님) | `schedule` |
| `notices` | 행사 | 참가자에게 보이는 공지(대상 `ALL`·`LEADERS`)가 발행·수정·보관·보관 해제·고정 변경될 때. 바뀌기 전이나 뒤의 대상 중 하나라도 참가자를 포함하면 오른다 | `notices` |
| `group` | 행사 | 조 편성을 공개할 때(`PUBLISHED`), 조원 명단 스위치(DEC-083)가 바뀔 때 | `group` |
| `rooms` | 행사 | 숙소 배정을 공개할 때(G1) | `rooms` |
| `mealOrder` | 행사 | 식사 순서를 공개할 때(H1) | `meal-order` |
| `checkIn` | 참가자 | 내 체크인·취소가 기록될 때 | `check-in` |
| `application` | 참가자 | 내 신청의 새 revision이 생길 때(나 또는 운영자, A4·A12) | 내 정보 |
| `notifications.latestSeq` | 참가자 | 나에게 알림이 생길 때 | 알림함 |
| `notifications.unreadCount` | 참가자 | 알림이 생기거나 읽을 때 | (배지) |

- **값은 비교만 한다.** 화면은 마지막으로 읽은 값과 다르면(크거나 작거나) 그 카드를 다시 읽는다. 크기 비교로 분기하지 않는다. 값이 0이면 그 영역에서 아직 아무 일도 없었다는 뜻이다.
- 행사 범위 값은 같은 행사의 모든 참가자에게 같다. 한 공지가 조장 대상이어도 `notices`는 모두에게 오른다. 일반 참가자는 다시 읽어도 새 항목이 없을 뿐이다(무엇이 바뀌었는지는 드러나지 않는다).
- 조장이 되거나 풀리는 것은 조 편성 공개로 일어나므로 `group`이 오른다. 화면은 `group`이 바뀌면 `notices`·`schedule`도 다시 읽는다(조장 대상 항목이 생기거나 사라지므로).
- `unreadCount`는 100에서 멈춘다. 100이면 화면은 "99+"로 보인다.
- `pollAfterSeconds`는 서버가 정하는 다음 확인까지의 초다. 1월 시작값은 30이다. 부하 확인(J6) 결과에 따라 앱을 다시 배포하지 않고 서버 설정 `scene.participant.poll-after-seconds`로 바꾼다(범위 10–300).
- `serverTime`은 화면이 "지금·다음 일정"을 계산할 때 휴대폰 시계 오차를 보정하는 데 쓴다.
- 조회는 audit·로그 본문을 남기지 않는다. 요청 로그는 경로와 상태만 남긴다.

### 읽기 비용

서버는 한 요청에 다음만 읽는다.

1. 세션 확인(모든 참가자 경로와 같다)
2. `participant_feed_versions` 한 행(행사 범위 값 전부, 기본 키)
3. `notifications`에서 이 참가자의 최대 `seq`와 읽지 않은 수(색인 `(recipient_participant_id, read_at, seq)`, 101건에서 멈춤)
4. 이 참가자의 `checkin_logs` 최대 `seq`(`checkIn` 값)와 최신 신청 revision 번호(`application` 값, A4가 정하는 열). 각각 색인 한 번이다

공개본이나 공지 목록은 읽지 않는다. 행사 범위 값은 각 공개 경로가 **같은 트랜잭션**에서 `participant_feed_versions`의 해당 열을 1 올린다. 값이 오르고 커밋이 실패하는 일은 없다.

`ETag`·`304`는 1차에 쓰지 않는다. 본문이 200바이트 안팎이라 이득이 작다.

## 5. 갱신 주기와 화면이 안 보일 때

| 상황 | 동작 |
|---|---|
| 화면이 보인다(`document.visibilityState === "visible"`) | `pollAfterSeconds` ±20% 무작위(30이면 24–36초)마다 `updates`를 부른다. 200명이 같은 순간에 몰리지 않게 하려는 것이다 |
| 화면이 숨겨진다(다른 앱, 화면 꺼짐, 다른 탭) | 확인을 멈춘다. 타이머를 남기지 않는다 |
| 다시 보인다 | 바로 한 번 부르고 주기를 다시 시작한다 |
| `offline` 이벤트 | 멈추고 "연결이 끊겼어요 · 마지막 갱신 HH:mm"을 보인다. `online`이면 바로 부른다 |
| 실패(네트워크, `5xx`) | 다음 간격을 두 배로 늘린다(최대 300초). 성공하면 원래 간격으로 돌아온다. 마지막 갱신 시각을 보인다 |
| `401` | 확인을 멈추고 들어오기 화면으로 보낸다 |
| 바뀐 키가 있다 | 그 키의 경로만 다시 읽는다. 지금 열린 탭은 바로, 나머지는 그 탭을 열 때 읽는다. 홈 카드에 쓰는 경로는 홈이 열려 있으면 바로 읽는다 |

카드 경로가 실패하면 그 카드만 마지막 값을 유지하고 "갱신 실패"를 작게 보인다. 다른 카드에는 영향이 없다. 마지막으로 받은 값을 기기에 남겨 오프라인에서 보이는 것은 B6(P1)이다.

## 6. 지금·다음 일정 계산

화면이 `schedule` 응답과 `serverTime`으로 계산한다. 서버는 "지금" 항목을 따로 주지 않는다.

- 지금 = 시작 ≤ 현재 < 끝인 항목. 끝이 없는 항목은 다음 항목의 시작(없으면 시작 + 60분)까지로 본다. 여럿이면 시작이 늦은 것 하나.
- 다음 = 시작 > 현재인 가장 이른 항목 하나. 같은 시각이 여럿이면 일정표 순서의 첫 번째.
- 현재 = 휴대폰 시각 + (`serverTime` − 응답을 받은 휴대폰 시각).
- 행사 기간 전이면 "첫 일정"으로 1일차 첫 항목, 기간이 지나면 카드에 "일정이 모두 끝났어요"를 보인다.

## 7. 알림 목록

알림은 **받는 사람별 목록**이다. 참가자와 운영자가 같은 테이블·같은 모양을 쓴다. 1월에는 화면 안에서만 보인다. 웹 푸시·알림톡·문자는 이 목록의 행에 전달 기록을 붙여 나중에 더한다(§7.5).

### 7.1 알림 객체

```json
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
```

- `seq`는 서버 전체에서 늘어나는 순서 번호다. 목록 순서와 "여기까지 읽음"에 쓴다.
- `kind`는 아래 표의 값이다. 화면은 모르는 `kind`를 받으면 `title`·`body`만 보이고 누를 수 없게 한다(나중에 종류가 늘어도 깨지지 않는다).
- `target`은 눌렀을 때 갈 곳이다. `type`과 `id`로 화면 경로를 정한다. 대상이 사라졌으면(보관된 공지 등) 그 화면이 빈 상태를 보인다.
- `title`·`body`는 만들 때 서버가 채운 짧은 문구다(각 80자·200자 안). **받는 사람이 그 화면에서 볼 수 있는 정보만** 담는다. 참가자 알림에 다른 참가자의 이름·전화·답을 넣지 않는다.
- `count`는 합쳐진 알림 수다(§7.3). 1이 기본이다.
- `readAt`이 `null`이면 읽지 않았다.

### 7.2 종류

참가자가 받는 것(B5, P1):

| `kind` | `target.type` | 받는 사람 | 만드는 때 |
|---|---|---|---|
| `NOTICE_PUBLISHED` | `NOTICE` | 공지 대상에 드는 활성 참가자 | 공지 발행(DEC-082) |
| `NOTICE_UPDATED` | `NOTICE` | 같음 | 발행된 공지를 고치며 운영자가 "다시 알림"을 고를 때만 |
| `SCHEDULE_PUBLISHED` | `SCHEDULE` | 활성 참가자 전원 | 일정표 첫 공개(DEC-081) |
| `SCHEDULE_CHANGED` | `SCHEDULE` | 바뀐 항목을 볼 수 있는 활성 참가자 | 두 번째 이후 공개에서 운영자가 알림을 끄지 않았을 때 |
| `GROUP_PUBLISHED` | `GROUP` | 공개본에서 조·조장 표시가 바뀐 활성 참가자(처음이면 배정된 전원) | 조 편성 공개 |
| `ROOM_PUBLISHED` | `ROOM` | G1에서 정함 | 숙소 공개 |
| `MEAL_ORDER_PUBLISHED` | `MEAL_ORDER` | H1에서 정함 | 식사 순서 공개 |
| `APPLICATION_UPDATED_BY_OPERATOR` | `APPLICATION` | 그 신청의 참가자 | 운영자가 내 신청을 고칠 때(A12) |

운영자가 받는 것(I3, P0):

| `kind` | `target.type` | 받는 사람 | 만드는 때 |
|---|---|---|---|
| `APPLICATION_REVISED` | `APPLICATION` | 그 행사에서 유효한 `PARTICIPANT_READ`를 가진 운영자(결정 대기 1) | 참가자가 신청을 고칠 때(A4) |
| `APPLICATION_RESUBMITTED` | `APPLICATION` | 같음 | 같은 전화로 다시 신청해 수정으로 덮어쓸 때(A4) |
| `APPLICATION_CANCELLED` | `APPLICATION` | 같음 | 참가자 또는 다른 운영자가 신청을 취소할 때(A7). 취소한 본인에게는 만들지 않는다 |
| `STAFF_NOTICE_PUBLISHED` | `NOTICE` | 그 행사의 활성 운영자 전원(작성자 제외) | 대상 `STAFF` 공지 발행(DEC-082) |
| `LIFECYCLE_OVERRIDE` | `EVENT` | 지금 `operator_notices`와 같다 | 공간 소유자가 대신 활성화·종료·다시 열기 |

- 운영자 알림의 `body`는 이름과 바뀐 질문의 제목까지다(예: "김OO님이 신청을 고쳤어요 · 참석 방식, 이동 수단"). 답의 내용은 넣지 않는다. 신청 상세에서 본다.
- 받는 사람은 **만드는 순간** 정한다. 나중에 권한을 받거나 조장이 된 사람에게 지난 알림을 만들지 않는다. 목록 화면(공지 목록 등)은 읽을 때 대상을 다시 계산하므로 볼 것은 다 보인다.
- 알림을 만든 사람 자신에게는 만들지 않는다.

### 7.3 합치기

같은 받는 사람에게 같은 `kind`·같은 `target`의 **읽지 않은** 알림이 있으면 새 행을 더하지 않고 그 행을 지우고 새 행을 넣는다(`seq`가 새로 붙고, `count`는 이전 + 1, `title`·`body`는 새 값). 참가자가 신청을 다섯 번 고쳐도 운영자 알림함에는 한 줄("5번 고쳤어요")이다. 읽은 알림은 합치지 않는다.

### 7.4 참가자 경로

#### `GET /api/v1/participant/notifications?before={seq}&limit=30`

`200`

```json
{
  "items": [ { "알림 객체": "…" } ],
  "unreadCount": 2,
  "nextBefore": 5790
}
```

- `seq` 내림차순이다. `before`가 없으면 맨 앞부터. `limit`은 1–50, 기본 30. 범위를 벗어나면 `400 VALIDATION_FAILED`(필드 `limit`·`before`).
- `nextBefore`는 더 있으면 다음 요청의 `before`, 없으면 `null`이다.
- 조회만으로 읽음 처리하지 않는다.

#### `POST /api/v1/participant/notifications/read`

CSRF가 필요하다. 본문은 셋 중 하나다.

```json
{ "notificationIds": ["…"] }
{ "target": { "type": "NOTICE", "id": "…" } }
{ "upToSeq": 5821 }
```

- `notificationIds`: 1–50개. 내 알림이 아닌 id는 조용히 건너뛴다(다른 사람 알림의 존재를 드러내지 않는다).
- `target`: 그 대상을 가리키는 내 알림을 모두 읽음으로 한다. 공지 상세를 열 때 화면이 부른다.
- `upToSeq`: 그 `seq` 이하의 내 알림을 모두 읽음으로 한다("모두 읽음").
- 둘 이상을 보내거나 하나도 없으면 `400 VALIDATION_FAILED`.
- 이미 읽은 알림은 그대로다(`readAt`을 바꾸지 않는다). 다시 보내도 결과가 같다.

`200` 본문은 `{ "unreadCount": 0 }`이다. audit을 남기지 않는다.

### 7.5 운영자 경로

운영자 알림은 행사 단위로 본다(1월의 종류가 모두 행사 안의 일이다). 운영자 세션과 그 행사의 활성 운영자 관계가 필요하다. 판정 순서는 api.md의 다른 운영자 경로와 같다(행사 없음·멤버 아님 `404`·`403 NOT_A_MEMBER`).

- `GET /api/v1/operator/events/{eventId}/notifications?before=&limit=` — 참가자 경로와 같은 모양이다. 받는 사람이 세션의 운영자인 행만 준다. 권한 키는 필요 없다(받은 것만 본다).
- `POST /api/v1/operator/events/{eventId}/notifications/read` — 참가자 경로와 같은 본문·응답이다.
- `GET /api/v1/operator/events/{eventId}/updates` — 운영자 화면의 주기 확인이다(I3 알림 배지, D3 운영진 공지 카드, E1 현장 현황).

```json
{
  "notifications": { "latestSeq": 9012, "unreadCount": 3 },
  "notices": 8,
  "schedule": 12,
  "checkIns": 154,
  "pollAfterSeconds": 15,
  "serverTime": "2027-01-22T05:30:12Z"
}
```

`notices`는 운영자 범위 값(대상과 상태에 상관없이 공지가 바뀌면 오름), `schedule`은 작업본 `boardVersion`, `checkIns`는 그 행사 `checkin_logs`의 최대 `seq`다(E1이 이 값으로 현황을 다시 읽는다). 운영자 `pollAfterSeconds` 시작값은 15다(운영자는 많아야 수십 명).

알림 메뉴(`/notifications`)와 휴대폰 하단 막대의 배지는 지금 보고 있는 행사의 `unreadCount`다. 행사 밖(조직 메뉴)에서는 배지를 보이지 않는다. 여러 행사를 모아 보는 목록은 범위 밖이다.

### 7.6 저장

`notifications` 한 테이블에 참가자·운영자 알림을 모두 둔다.

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  recipient_kind varchar(16) NOT NULL CHECK (recipient_kind IN ('PARTICIPANT', 'OPERATOR')),
  recipient_participant_id uuid,
  recipient_user_id uuid REFERENCES users (id),
  kind varchar(64) NOT NULL,
  target_type varchar(32) NOT NULL,
  target_id uuid,
  title varchar(80) NOT NULL,
  body varchar(200),
  important boolean NOT NULL DEFAULT false,
  count integer NOT NULL DEFAULT 1 CHECK (count >= 1),
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  CONSTRAINT notifications_one_recipient CHECK (
    (recipient_kind = 'PARTICIPANT' AND recipient_participant_id IS NOT NULL AND recipient_user_id IS NULL)
    OR (recipient_kind = 'OPERATOR' AND recipient_user_id IS NOT NULL AND recipient_participant_id IS NULL)),
  FOREIGN KEY (space_id, event_id, recipient_participant_id) REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX notifications_participant ON notifications (recipient_participant_id, seq DESC) WHERE recipient_participant_id IS NOT NULL;
CREATE INDEX notifications_participant_unread ON notifications (recipient_participant_id) WHERE recipient_participant_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX notifications_operator ON notifications (event_id, recipient_user_id, seq DESC) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX notifications_target ON notifications (event_id, target_type, target_id);

-- 행사 범위 갱신 값. 행사당 한 행, 처음 오를 때 만든다. 없으면 모두 0으로 읽는다.
CREATE TABLE participant_feed_versions (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  home bigint NOT NULL DEFAULT 0,
  schedule bigint NOT NULL DEFAULT 0,
  notices bigint NOT NULL DEFAULT 0,
  groups bigint NOT NULL DEFAULT 0,
  rooms bigint NOT NULL DEFAULT 0,
  meal_order bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
```

- **`operator_notices`와의 관계:** 마이그레이션에서 기존 `operator_notices` 행을 `notifications`(`recipient_kind = 'OPERATOR'`, `kind = 'LIFECYCLE_OVERRIDE'`, `target_type = 'EVENT'`, `target_id = event_id`, `title` "행사 상태를 공간 소유자가 바꿨어요", `read_at` = `created_at`)로 옮긴다. 옮긴 행은 읽은 것으로 둔다(지금까지 보여 준 적이 없는 옛 알림이 한꺼번에 뜨지 않게). 그 뒤 코드는 `notifications`에만 쓰고, `operator_notices`는 다음 마이그레이션에서 지운다. 이 순서는 I3 서버 작업이 한 PR에서 한다.
- 공개 경로가 알림을 만들 때는 공개와 **같은 트랜잭션**에서 넣는다. 200명에게 200행이다. 실패하면 공개도 되돌린다. 알림 수가 많아져 공개가 느려지면 나중에 따로 떼어 낸다(확장 지점).
- 보존: 행사 데이터와 같이 지운다(DEC-056). 알림만의 보존 기간은 따로 두지 않는다.
- 전달 채널(나중): `notification_deliveries(notification_id, channel IN ('WEB_PUSH','ALIMTALK','SMS'), status, attempts, last_error, sent_at)`를 이 행에 붙인다. 공지·일정 쪽은 바꾸지 않는다. 1월에는 만들지 않는다.

## 8. 대상(audience) 공통 모양

공지(DEC-082)와 일정 항목(DEC-081)은 "누가 보는가"를 같은 모양으로 갖는다.

```json
"audience": [{ "type": "ALL" }]
```

- 목록이고 뜻은 합집합이다. 저장은 `jsonb` 열 하나에 이 배열 그대로 둔다.
- 1월에는 **정확히 한 항목**이고 `type`은 셋 중 하나다. `ids`는 넣지 않는다. 어기면 `400 VALIDATION_FAILED`(필드 `audience`).

| `type` | 보는 참가자 | 보는 운영자 |
|---|---|---|
| `ALL` | 그 행사의 참가자 전원 | 모두 |
| `LEADERS` | 가장 최근 조 편성 공개본에서 조장이고 활성 참가자인 사람. 조를 공개한 적이 없으면 없음 | 모두 |
| `STAFF` | 없음 | 모두 |

- 운영자 화면은 대상과 상관없이 모든 항목을 보고, 대상 표시를 붙인다.
- 참가자 쪽 판정은 **읽을 때마다** 한다. 조장이 바뀌어 공개되면 다음 읽기부터 바뀐다. 판정 함수는 서버 한곳(`ParticipantAudience`)에 둔다.
- 확장: `{ "type": "GROUP", "ids": ["…"] }`(특정 조), `ROOM`, `ROLE`(운영자 역할)을 더한다. 읽는 쪽은 모르는 `type`을 "보이지 않음"으로 처리하므로, 옛 서버가 새 값을 만나도 정보가 새지 않는다.

## 9. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| 참가자 세션 없음·만료 | `401 AUTHENTICATION_REQUIRED` |
| 본문·쿼리 형식 | `400 VALIDATION_FAILED`와 `errors[].field` |
| 운영자 경로의 행사 없음·멤버 아님 | `404 RESOURCE_NOT_FOUND`·`403 NOT_A_MEMBER` |

## 10. 시험 조건

- `updates`가 위 표의 때에만 오르고, `ALREADY_PUBLISHED`·작업본 저장·DRAFT 공지 저장에는 오르지 않는다.
- `updates` 한 요청의 SQL이 여섯 번 이하다(세션 확인 포함). 공개본·공지 테이블을 읽지 않는다.
- 참가자 알림 `title`·`body`에 다른 참가자의 이름·전화·답이 없다(조 공개 알림은 "내 조가 정해졌어요 · 1조"까지).
- 다른 참가자의 알림 id로 읽음 처리해도 그 알림이 바뀌지 않고 응답이 같다.
- 합치기: 읽지 않은 같은 종류·대상이 있으면 행이 하나이고 `count`가 오른다.
- `operator_notices`의 기존 행이 옮겨지고 읽은 상태다.
