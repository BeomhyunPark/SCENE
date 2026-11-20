# 참가자 홈·갱신 확인·알림 계약 초안

> **일부는 서버에 있다.** 참가자 홈·`updates`·참가자 알림 경로와 두 테이블은 #423에서 만들어 api.md로 옮겼다(§3·§4·§7.4·§7.6). 나머지(운영자 알림 경로 §7.5, `operator_notices` 이전, 참가자 알림 만들기)는 아직 계약 초안이다. 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#379](https://github.com/BeomhyunPark/SCENE/issues/379) B2·B4·B5와 [#385](https://github.com/BeomhyunPark/SCENE/issues/385) I3에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

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
| ~~다음 식사~~ | — | — | **1월에는 쓰지 않는다**(식사 순서 보류, 사용자 결정 2026-11-20, DEC-080 Follow-up 2026-11-20). 카드를 만들지 않는다. 보류 전 계획: `features.mealOrder`일 때 `schedule` + `meal-order`로 다음 식사 시각과 우리 조 순서 |

## 2. 기능 영역(`features`)

참가자 화면에서 켜고 끄는 영역은 `schedule`, `notices`, `groups`, `rooms`, `mealOrder` 다섯이다. 도착 QR과 내 정보는 영역이 아니라 늘 있다.

`mealOrder`는 **1월에는 쓰지 않는다. 키는 응답에 남는다**(식사 순서 보류, DEC-086 Follow-up 2026-11-20). 유형 기본값으로 켜지지 않고(아래 2번), 올리는 경로가 없어 3번으로도 켜지지 않아 1월에는 늘 `false`다. 화면은 이 키를 보지 않는다.

영역이 켜졌는지는 서버가 정해서 `home`에 담는다. 화면은 이 값만 본다.

1. 운영자가 영역을 저장했으면(I5에서 `event_features`로 만든다) 그 값.
2. 저장한 값이 없으면 행사 유형 기본값: `RETREAT`·`CAMP`는 `mealOrder`를 뺀 네 영역 켬, 그 밖의 유형과 유형 없음은 `schedule`·`notices`만 켬.
3. 1·2와 상관없이, 공개본이 하나라도 있는 영역은 켬으로 본다. 공개한 내용이 화면에서 사라지지 않게 하려는 것이다.

I5 전에는 1번이 없고 2·3번만으로 정한다. 응답 모양은 I5 뒤에도 같다.

## 3. `GET /api/v1/participant/home`

api.md로 옮겼다([참가자 홈·갱신 확인·알림](../../backend/docs/api.md#참가자-홈갱신-확인알림), #423). 완료 안내는 `completionNotice` 문자열이다(DEC-080 Follow-up 2026-11-20).

## 4. `GET /api/v1/participant/updates`

api.md로 옮겼다([참가자 홈·갱신 확인·알림](../../backend/docs/api.md#참가자-홈갱신-확인알림), #423). 키의 뜻과 오르는 때(아직 만들지 않은 일정·공지·숙소·식사 순서 포함)는 아래 표가 기준이다. 일정·공지·숙소·식사 세션은 `ParticipantFeedVersions.bump`로 해당 열을 올린다(source-guide "다른 기능이 부르는 공용 코드").

| 키 | 오르는 때 |
|---|---|
| `schedule` | 일정표를 공개할 때(`PUBLISHED`만) |
| `notices` | 참가자에게 보이는 공지(대상 `ALL`·`LEADERS`)가 발행·수정·보관·보관 해제·고정 변경될 때. 바뀌기 전이나 뒤의 대상 중 하나라도 참가자를 포함하면 오른다 |
| `group` | 조 편성 공개(`PUBLISHED`, 만들었다), 조원 명단 스위치(DEC-083)가 바뀔 때 |
| `rooms` | 숙소 배정을 공개할 때(G1) |
| `mealOrder` | 식사 순서를 공개할 때(H1). **1월에는 쓰지 않는다**(보류). 키는 남고 늘 0이다 |

- 조장이 되거나 풀리는 것은 조 편성 공개로 일어나므로 `group`이 오른다. 화면은 `group`이 바뀌면 `notices`·`schedule`도 다시 읽는다.

## 5. 갱신 주기와 화면이 안 보일 때

| 상황 | 동작 |
|---|---|
| 화면이 보인다(`document.visibilityState === "visible"`) | `pollAfterSeconds` ±20% 무작위(기본 25면 20–30초)마다 `updates`를 부른다. 200명이 같은 순간에 몰리지 않게 하려는 것이다 |
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
| `MEAL_ORDER_PUBLISHED` | `MEAL_ORDER` | H1에서 정함 | 식사 순서 공개. **1월에는 만들지 않는다**(보류) |
| `APPLICATION_UPDATED_BY_OPERATOR` | `APPLICATION` | 그 신청의 참가자 | 운영자가 내 신청을 고칠 때(A12) |

운영자가 받는 것(I3, P0):

| `kind` | `target.type` | 받는 사람 | 만드는 때 |
|---|---|---|---|
| `APPLICATION_REVISED` | `APPLICATION` | 그 행사에서 유효한 `PARTICIPANT_READ`를 가진 운영자(결정 대기 1) | 참가자가 신청을 고칠 때(A4) |
| `APPLICATION_RESUBMITTED` | `APPLICATION` | 같음 | 같은 전화로 다시 신청해 수정으로 덮어쓸 때(A4) |
| `APPLICATION_CANCELLED` | `APPLICATION` | 같음 | 참가자 또는 다른 운영자가 신청을 취소할 때(A7). 취소한 본인에게는 만들지 않는다. 서버는 `ApplicationStatusChanged`(`action: WITHDRAWN`) 이벤트로 알린다(DEC-084 §7) |
| `APPLICATION_RESTORED` | `APPLICATION` | 같음 | 운영자가 취소를 되돌리거나, 취소된 사람이 같은 전화·6자리로 다시 신청해 돌아올 때(A7, DEC-084 §5). 되돌린 본인에게는 만들지 않는다. 이벤트 `action: RESTORED`, `actorKind`로 둘을 가른다 |
| `STAFF_NOTICE_PUBLISHED` | `NOTICE` | 그 행사의 활성 운영자 전원(작성자 제외) | 대상 `STAFF` 공지 발행(DEC-082) |
| `LIFECYCLE_OVERRIDE` | `EVENT` | 지금 `operator_notices`와 같다 | 공간 소유자가 대신 활성화·종료·다시 열기 |

- 운영자 알림의 `body`는 이름과 바뀐 질문의 제목까지다(예: "김OO님이 신청을 고쳤어요 · 참석 방식, 이동 수단"). 답의 내용은 넣지 않는다. 신청 상세에서 본다.
- 받는 사람은 **만드는 순간** 정한다. 나중에 권한을 받거나 조장이 된 사람에게 지난 알림을 만들지 않는다. 목록 화면(공지 목록 등)은 읽을 때 대상을 다시 계산하므로 볼 것은 다 보인다.
- 알림을 만든 사람 자신에게는 만들지 않는다.

### 7.3 합치기

같은 받는 사람에게 같은 `kind`·같은 `target`의 **읽지 않은** 알림이 있으면 새 행을 더하지 않고 그 행을 지우고 새 행을 넣는다(`seq`가 새로 붙고, `count`는 이전 + 1, `title`·`body`는 새 값). 참가자가 신청을 다섯 번 고쳐도 운영자 알림함에는 한 줄("5번 고쳤어요")이다. 읽은 알림은 합치지 않는다.

### 7.4 참가자 경로

api.md로 옮겼다([참가자 홈·갱신 확인·알림](../../backend/docs/api.md#참가자-홈갱신-확인알림), #423). 운영자 경로(§7.5)는 같은 본문·응답 모양을 쓴다(`NotificationReadRequest`, `NotificationListQuery`).

### 7.5 운영자 경로

api.md로 옮겼다([운영자 알림·갱신 확인](../../backend/docs/api.md#운영자-알림갱신-확인), #436). 아래는 초안 그대로 두고, 다른 점은 DEC-080 Follow-up(#436)에 있다.

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

`notifications`와 `participant_feed_versions`는 `V20`으로 만들었다. api.md로 옮겼다([저장](../../backend/docs/api.md#참가자-홈갱신-확인알림), #423). 아래는 아직 만들지 않은 부분이다.

- **`operator_notices`와의 관계:** 마이그레이션에서 기존 `operator_notices` 행을 `notifications`(`recipient_kind = 'OPERATOR'`, `kind = 'LIFECYCLE_OVERRIDE'`, `target_type = 'EVENT'`, `target_id = event_id`, `title` "행사 상태를 공간 소유자가 바꿨어요", `read_at` = `created_at`)로 옮긴다. 옮긴 행은 읽은 것으로 둔다(지금까지 보여 준 적이 없는 옛 알림이 한꺼번에 뜨지 않게). 그 뒤 코드는 `notifications`에만 쓰고, `operator_notices`는 다음 마이그레이션에서 지운다. (#436: 옮기기는 `V24`가 했다. 테이블 삭제는 되돌림에 대비해 이번에 하지 않고 수련회 뒤 마이그레이션으로 남겼다.)
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
- `updates` 한 요청의 SQL이 여섯 번 이하다(세션 확인 포함). 공개본·공지 테이블을 읽지 않는다. (#423에서 `ParticipantUpdatesCostIT`로 확인했다: 네 문장)
- 참가자 알림 `title`·`body`에 다른 참가자의 이름·전화·답이 없다(조 공개 알림은 "내 조가 정해졌어요 · 1조"까지).
- 다른 참가자의 알림 id로 읽음 처리해도 그 알림이 바뀌지 않고 응답이 같다.
- 합치기: 읽지 않은 같은 종류·대상이 있으면 행이 하나이고 `count`가 오른다.
- `operator_notices`의 기존 행이 옮겨지고 읽은 상태다. (#436에서 `OperatorNoticeMigrationIT`·`OperatorNotificationHttpIT`·`OperatorUpdatesCostIT`로 확인했다)
