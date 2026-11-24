# 숙소(방 배정) 계약 초안

> **아직 서버에 없다. 계약 초안이다.** 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#383](https://github.com/BeomhyunPark/SCENE/issues/383) G2(서버)·G3(운영자 화면)·G4(참가자 화면)·G5(참가 현황 표·CSV·현장 명단)에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

- 정책: [DEC-085](../product/PRODUCT_DECISIONS.md) (G1, [#424](https://github.com/BeomhyunPark/SCENE/issues/424))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `features.rooms`·`updates.rooms`·`ROOM_PUBLISHED`, [내 조](../../backend/docs/api.md#get-apiv1participantgroup)(DEC-083)의 `event_participant_settings`·`leaderView.members[].room`
- 본보기: api.md "조 편성"(작업본·공개본, `boardVersion`, `fromGroupId` 비교, `ALREADY_PUBLISHED`, `confirmUnassigned`)
- 2026-11-20 사용자 결정 반영: **숙박하지 않는 사람(`NOT_LODGING`)은 방에 넣지 못한다**(DEC-085 결정 대기 3, Follow-up 2026-11-20). §3·§4·§7.1·§7.6·§7.8·§7.9·§8·§13·§15에 반영했다.
- 작성: 2026-11-20. 확인 방법: 로드맵, #383·#382·#230, DEC-043~048·072~075·079~084, api.md "조 편성"·"신청 집계"·"체크인", 계약 초안 네 개, `event/group/`·`MealSlots`·`ApplicationSummaryService`·`Permission`·`ErrorCode`·`AuditActions`, 마이그레이션 V13·V14·V16을 읽었다. **서버 검증과 실제 클릭은 하지 않았다.**

공통 규칙(JSON 이름, 시각, 오류 본문, CSRF, 세션 쿠키)은 api.md "공통"을 따른다. 운영자 경로는 `/api/v1/operator/events/{eventId}/rooms…`·`…/room-board`·`…/room-assignments`, 참가자 경로는 `/api/v1/participant/rooms`다. 이 문서에서 "가칭"이라고 적은 이름은 아직 코드에 없고 서버 PR이 정한다. 코드에 있는 이름(`ROOM_WRITE`, `GROUP_WRITE`, `EVENT_READ`, `MealSlots`, `group_publications`, ErrorCode 값)은 2026-11-20 main에서 확인했다.

## 1. 개념

- **방(작업본)**: 운영자가 만든 방 목록과 사람별 배정. 저장해도 참가자에게 보이지 않는다.
- **공개본**: 공개할 때 방 목록과 배정을 찍은 스냅샷(`room_publications`). 참가자·조장·참가 현황 표·현장 명단은 가장 최근 공개본만 본다(DEC-043과 같다).
- **배정의 모양**: 1월에는 **행사 전체에 참가자당 방 하나**다. 밤마다 다른 배정(G6, P2)은 배정 행의 `night` 열로 더한다(§11.1). 1월 서버는 `night = 0`(행사 전체)만 쓴다.
- **조 편성과 따로다.** 테이블·버전·공개가 따로 있고 `participants`에 `room_id`를 두지 않는다(data-model §2). "조 단위 일괄 배정"은 화면이 조원 목록으로 요청을 만드는 동작이고, 저장은 사람별 배정이다. 조가 바뀌어도 방은 그대로다.
- **자동 편성은 없다**(제품 정의 §5.5, 로드맵 7절). 서버는 경고만 계산한다.

## 2. 방

```json
{
  "roomId": "…",
  "name": "301호",
  "locationNote": "본관 3층 계단 옆",
  "capacity": 6,
  "gender": { "optionId": "opt_male", "label": "남성" },
  "sortOrder": 0,
  "version": 2
}
```

| 필드 | 규칙 |
|---|---|
| `name` | 필수. 앞뒤 공백 자름, 1–50자. 같은 행사 안에서 겹치면 `409 CONFLICT` |
| `locationNote` | 선택. 0–100자, 일반 글. 빈 문자열은 `null`로 저장한다. 참가자에게 보인다(운영 메모를 적는 칸이 아니다) |
| `capacity` | 선택. 1–50 정수. `null`은 "정원 없음"(강당 바닥 숙소 등)이고 정원 경고를 내지 않는다 |
| `gender` | 성별 구분. 요청은 `genderOptionId`(문자열 또는 `null`)로 보낸다. `null`은 "구분 없음"이다. 값은 그 행사 신청서의 `GENDER` 질문 보기 id여야 한다(설정 카드 기본은 `opt_female`·`opt_male`). 질문이 없거나 그 보기가 없으면 `400 VALIDATION_FAILED`(필드 `genderOptionId`). 응답의 `label`은 지금 보기 문구이고, 나중에 보기를 찾을 수 없으면 `label: null`이다 |
| `sortOrder` | 행사 안 순서. 만들 때 맨 뒤. 순서 바꾸기는 `PUT …/rooms/order` |
| `version` | 방마다. 이름·위치·정원·성별이 바뀔 때 1 오른다. 배정은 올리지 않는다 |

- 행사당 방은 200개까지(잠정)이고 넘으면 `409 CONFLICT`, `reason: ROOM_LIMIT`.
- 방 안 사람의 순서는 저장하지 않는다. 화면·공개본·참가자 응답 모두 이름, 그다음 참가자 id 순이다(조처럼 순서를 정하는 요구가 아직 없다. 확장 지점 §11.4).
- **방 지우기**: 배정된 사람(취소자 포함)은 미배정이 된다. 사람마다 이력(`ROOM_DELETED`)을 남긴다. 지난 공개본은 그대로라 다시 공개하기 전까지 참가자는 그 방을 계속 본다. 막지 않는다(조 지우기와 같다). 화면은 "배정된 N명이 미배정이 돼요"로 확인받는다.

## 3. 누가 배정 대상인가

**활성 참가자**는 그 행사에 `SUBMITTED` 신청이 있는 참가자다(DEC-044, 조 편성과 같다). 신청을 취소한(`WITHDRAWN`) 사람은 배정판의 활성 명단·미배정 수·공개본 조회·참가자 응답·알림에서 읽을 때마다 빠진다.

활성 참가자마다 서버가 **숙박 상태**(`lodging`)를 정한다. 계산은 신청 집계(DEC-073 `lodging`)와 **같은 코드**다. G2는 `ApplicationSummaryService.lodging`의 사람별 판정을 한 함수(가칭 `LodgingNights.of(setup, answers, person)` → 밤 번호 목록 또는 `null`)로 꺼내 집계·DEC-083 `leaderView.attendance.lodgingNights`·숙소가 같이 쓴다. 운영자가 고친 값(A12)이 있으면 그 값이 먼저다(DEC-075 §1).

| `lodging` | 경우 | 미배정 수에 드나 | 배정할 수 있나 |
|---|---|---|---|
| `LODGING` | 자는 밤이 하나 이상(전체 참석, 부분 참석의 구간·`LODGING` 답) | 든다 | 된다 |
| `NOT_LODGING` | 자는 밤이 없다(집회만 참석, `NO_LODGING` 체크, 같은 날 도착·출발, `LODGING`에서 아무 밤도 안 고름) | 들지 않는다 | **안 된다**(§7.6. 사용자 결정 2026-11-20). 배정한 뒤 숙박을 뺀 사람은 방에 남고 "다시 볼 것"이 된다(§5) |
| `UNKNOWN` | 판단할 수 없다(구간 답 없음, `LODGING` 질문이 꺼진 부분 참석, 설정 없이 만든 신청서, 하루짜리 행사·기간 없는 설정처럼 집계 `lodging`이 `null`인 행사) | 든다 | 된다 |

- "숙박 질문이 없는 행사"(설정 없이 만든 신청서, 기간 없는 설정)는 모두 `UNKNOWN`이라 모두 배정 대상이다. 화면은 숙박 표시를 하지 않는다. `UNKNOWN`은 막지 않는다(숙박 질문이 없는 행사에서 아무도 배정하지 못하면 안 된다).
- 운영자가 숙박 값을 고치면(A12) 고친 값으로 판단한다. 숙박하지 않는 사람을 꼭 방에 넣어야 하면 운영자가 그 사람의 숙박을 먼저 고친다.
- `lodgingNights`(밤 번호 목록, 모르면 `null`)도 함께 준다. G6에서 밤별 배정의 대상을 거르는 데 쓴다.

## 4. 경고

정원·성별은 **막지 않고 경고만 계산한다.** 숙박하지 않는 사람은 경고가 아니라 배정 요청에서 거절한다(§7.6). 배정판을 읽을 때 방마다 돌려주고, 배정 요청의 응답에는 이번 요청으로 사람이 드나든 방의 경고를 돌려준다.

| `code` | 뜻 | 함께 주는 값 |
|---|---|---|
| `OVER_CAPACITY` | 활성 배정 인원 > `capacity` | `count`, `capacity` |
| `GENDER_MISMATCH` | 방에 성별 구분이 있는데 다른 성별 보기를 고른 사람이 있다 | `participantIds` |
| `GENDER_UNKNOWN` | 방에 성별 구분이 있는데 성별 답이 없는 사람이 있다(질문 꺼짐, 답 없음, 고른 보기가 숨겨짐 포함) | `participantIds` |
| `NOT_LODGING` | 방에 있는 사람 중 `lodging`이 `NOT_LODGING`인 사람이 있다. **새로 넣을 때는 생기지 않는다**(거절된다). 배정한 뒤 신청을 고쳐 숙박을 뺀 사람만 이렇게 된다(§5) | `participantIds` |

- 성별은 `GENDER` 답의 보기 id로 비교한다(문구가 아니다). 질문이 꺼진 행사에서는 성별 구분이 있는 방의 모든 사람이 `GENDER_UNKNOWN`이다.
- 취소자는 경고 계산에 넣지 않는다.
- 공개는 정원·성별 경고 때문에 막거나 확인받지 않는다(결정 대기 6). 공개 응답에 경고가 있는 방 수를 담는다. 방에 남은 숙박하지 않는 사람은 공개할 때 확인을 받는다(§7.8 3번, 결정 대기 7).

## 5. "다시 볼 것"(A11)

배정한 뒤 신청이 바뀌어도 방은 자동으로 바뀌지 않는다(DEC-045). 대신 배정판에 **다시 볼 것**을 표시한다.

배정 행은 배정(또는 확인)할 때의 판단 근거 `basis`를 저장한다: `{ "genderOptionId", "lodgingNights", "slotIds" }`(`slotIds`는 `MealSlots.attended`와 같은 참석 칸). 배정판을 읽을 때 지금 값과 비교한다.

| `reasons[]` 값 | 조건 |
|---|---|
| `NOT_LODGING` | 지금 `lodging`이 `NOT_LODGING`이고 근거에서는 아니었다(숙박을 뺐다). 방에서 자동으로 빼지 않는다(DEC-045) |
| `LODGING_CHANGED` | 자는 밤 목록이 근거와 다르다(위 경우는 빼고) |
| `ATTENDANCE_CHANGED` | 참석 칸(참석 구간)이 근거와 다르다 |
| `GENDER_CHANGED` | 성별 보기 id가 근거와 다르다 |

- 취소한 사람은 `withdrawn[]`에 따로 나온다(§7.1). 신청 취소 경로(A7, DEC-084)가 같은 트랜잭션에서 배정 행을 지우므로 보통은 남지 않는다. 그 경로가 생기기 전에 취소된 행이나 경로 밖의 상태 변화만 여기 남는다.
- **숙박을 뺀 사람(`NOT_LODGING`)**: 다른 방으로 옮길 수는 없고(§7.6 거절) 미배정으로 빼거나 그대로 둔다. "확인"하면 표시는 지워지지만 방의 `NOT_LODGING` 경고와 공개할 때의 확인(§7.8)은 남는다. 숙박을 다시 넣으면(신청 수정·A12) 모두 사라진다.
- **표시 지우기**: 사람을 다른 방으로 옮기거나 같은 방에서 "확인"하면(`POST …/room-assignments/review`) 근거를 지금 값으로 다시 찍는다. 확인은 방을 바꾸지 않으므로 `boardVersion`을 올리지 않고 이력도 남기지 않는다.
- 공개본·참가자 응답에는 이 표시가 없다.

## 6. 버전과 동시 수정

- `boardVersion`: 행사당 하나(`room_boards`). 작업본이 실제로 바뀔 때마다(방 추가·고치기·지우기·순서, 배정) 1 오른다. 공개·확인(§5)은 올리지 않는다. 처음은 0이다.
- 방 `version`: 고치기·지우기는 `expectedVersion`. 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `version`.
- 배정은 사람마다 `fromRoomId`(화면이 본 지금 방, 미배정은 `null`)를 보낸다. 하나라도 지금 값과 다르면 아무것도 저장하지 않고 `409 CONCURRENT_MODIFICATION`과 `conflicts[]`. 지금 값이 이미 `toRoomId`면 반영된 것으로 본다. 서로 다른 사람을 옮기는 두 운영자는 충돌하지 않는다(DEC-046).
- 공개는 `expectedBoardVersion`. 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.
- 쓰기는 행사 행을 잠그고 처리한다. 같은 행사의 쓰기는 차례로 커밋된다.
- `Idempotency-Key`는 읽지 않는다. 배정은 "이미 목적지면 성공", 공개는 "같으면 `ALREADY_PUBLISHED`"(DEC-047).
- **배정·이동은 한 트랜잭션이다.** 한 요청의 모든 사람이 함께 저장되거나 아무도 저장되지 않는다. 중간 미배정 상태가 밖에 보이지 않는다(data-model §4).

## 7. 운영자 경로

### 7.0 권한과 행사 상태

| 동작 | 권한 |
|---|---|
| 배정판(작업본) 조회 `GET …/room-board` | 유효한 `ROOM_WRITE`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 방 만들기·고치기·지우기·순서, 배정, 확인, 공개 | 유효한 `ROOM_WRITE` |
| 공개본 조회(운영자) `GET …/rooms/published` | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 방 배정표 공개 범위 스위치 | DEC-083 `participant-settings`와 같다(읽기 `EVENT_READ`, 쓰기 `EVENT_UPDATE`) |

- 배정판에는 이름·또래·성별·숙박·참석 칸이 있어 조 편성판(`GROUP_WRITE` 또는 공간 `OWNER`·`ADMIN`)과 같은 규칙으로 좁힌다. 이 정보는 같은 사람이 신청 원본에서 이미 볼 수 있어 새로 열리는 것이 없다.
- 기본 역할: `ROOM_WRITE`는 `OWNER`가 갖는다. MANAGER는 DEC-079 Follow-up(OWNER 전용 둘을 뺀 전부, 다른 세션 진행 중)이 `RoleDefaults`에 넣으면 갖는다. 그 전에는 OWNER가 사람별 `GRANT`로 준다. 새 권한 키는 없다.

| 행사 상태 | 조회 | 쓰기·공개 | 참가자 숙소 |
|---|---|---|---|
| `DRAFT` | 조회 | 가능 | 공개본 |
| `ACTIVE` | 조회 | 가능 | 공개본 |
| `ENDED` | 조회 | `409 EVENT_ENDED` | 마지막 공개본 |
| `ARCHIVED` | 읽기 전용 조회 | `409 EVENT_ARCHIVED` | 마지막 공개본 |

쓰기의 판정 순서는 조 편성과 같다: 행사 없음·멤버 아님(`404`·`403 NOT_A_MEMBER`) → 권한(`403 FORBIDDEN`) → 본문(`400`) → 행사 상태(`409`) → 대상 찾기(`404`) → 버전·충돌(`409`) → 참가 자격·규칙(`409`) → 결과(`200`). 읽기는 행사 상태로 막지 않는다.

### 7.1 `GET /api/v1/operator/events/{eventId}/room-board`

`200`

```json
{
  "eventStatus": "ACTIVE",
  "boardVersion": 18,
  "rooms": [
    {
      "roomId": "…", "name": "301호", "locationNote": "본관 3층", "capacity": 6,
      "gender": { "optionId": "opt_male", "label": "남성" }, "sortOrder": 0, "version": 2,
      "memberCount": 7,
      "warnings": [
        { "code": "OVER_CAPACITY", "count": 7, "capacity": 6 },
        { "code": "GENDER_UNKNOWN", "participantIds": ["…"] }
      ]
    }
  ],
  "participants": [
    {
      "participantId": "…",
      "name": "김",
      "cohort": "94",
      "gender": { "optionId": "opt_female", "label": "여성" },
      "attendance": "PARTIAL",
      "slotIds": ["opt_d1_dinner", "opt_d1_worship", "opt_d2_breakfast"],
      "lodging": "LODGING",
      "lodgingNights": [1],
      "group": { "groupId": "…", "name": "3조" },
      "draftGroupId": "…",
      "roomId": "…",
      "publishedRoomId": "…",
      "review": { "reasons": ["LODGING_CHANGED"], "assignedAt": "2026-12-28T10:00:00Z" }
    }
  ],
  "withdrawn": [ { "participantId": "…", "name": "이", "roomId": "…" } ],
  "publication": {
    "lastPublishedAt": "2027-01-10T09:00:00Z",
    "lastPublishedByDisplayName": "김OO",
    "lastPublishedBoardVersion": 16,
    "activeCount": 190,
    "eligibleCount": 182,
    "assignedCount": 178,
    "unassignedCount": 4,
    "notLodgingAssignedCount": 0,
    "changedParticipantCount": 3,
    "roomChanges": 1,
    "hasUnpublishedChanges": true
  },
  "groups": [ { "groupId": "…", "name": "3조", "sortOrder": 2 } ],
  "slots": [ { "slotId": "opt_d1_dinner", "day": 1, "date": "2027-01-22", "dayLabel": "1월 22일 (금)", "meal": "DINNER", "label": "저녁", "sortOrder": 0 } ]
}
```

- `participants`는 **활성 참가자 전원**이고 순서는 이름, 그다음 참가자 id다. 페이지는 없다(200명 기준 수십 KB). 전화·접근 키·숫자 6자리·신청 답 원본·운영 메모는 없다.
- `cohort`·`gender`·`attendance`·`slotIds`는 편성판(api.md "조 편성")과 같은 값·같은 코드다. `slots`도 편성판 `slots`와 같다(`null` 규칙 포함).
- `lodging`·`lodgingNights`는 §3.
- `group`은 **가장 최근 조 편성 공개본**의 조다(공개 전이거나 공개본에 없으면 `null`). `groups`는 그 공개본의 조 목록(이름·순서)이다. 화면의 "조로 거르기"와 "조 단위 일괄 배정"이 이 값을 쓴다. `draftGroupId`는 **요청한 운영자에게 유효한 `GROUP_WRITE`가 있을 때만** 조 편성 작업본의 조 id이고, 없으면 늘 `null`이다(준비 중 편성은 업무 권한으로 구분한다, DEC-043). 결정 대기 4.
- `roomId`가 `null`이면 미배정이다. `publishedRoomId`는 가장 최근 숙소 공개본의 방이다(없으면 `null`).
- `review`는 §5의 다시 볼 것이 없으면 `null`이다. 미배정인 사람은 늘 `null`이다. `assignedAt`은 근거를 찍은 시각이다.
- `withdrawn`은 배정 행이 남았지만 활성 참가자가 아닌 사람이다. 인원·경고·미배정 수에 넣지 않는다.
- `publication`: `eligibleCount`는 활성 참가자 중 `lodging`이 `LODGING`·`UNKNOWN`인 수, `unassignedCount`는 그중 미배정인 수다(`NOT_LODGING` 미배정은 세지 않는다). `assignedCount`는 배정된 활성 참가자 수다. 새로 넣을 때 `NOT_LODGING`은 거절되므로, 여기에 드는 `NOT_LODGING`은 배정한 뒤 숙박을 뺀 사람뿐이고 그 수를 `notLodgingAssignedCount`로 따로 준다(공개 확인 §7.8 3번). `changedParticipantCount`는 작업본과 최근 공개본의 방이 다른 활성 참가자 수(처음 공개 전에는 배정된 수), `roomChanges`는 추가·삭제됐거나 이름·위치 메모·정원·성별·순서가 다른 방 수(처음 공개 전에는 방 수)다. 비교는 내용으로 한다(옮겼다 되돌리면 변경이 없다). `hasUnpublishedChanges`는 둘 중 하나라도 0이 아니면 `true`다.

### 7.2 `POST /api/v1/operator/events/{eventId}/rooms`

본문은 `{ "name": "301호", "locationNote": "본관 3층", "capacity": 6, "genderOptionId": "opt_male" }`다. `name` 밖은 선택이다. 형식은 §2. `201` 본문은 `{ "room": { 방 객체 }, "boardVersion" }`다.

### 7.3 `PATCH /api/v1/operator/events/{eventId}/rooms/{roomId}`

본문은 바꿀 필드와 `expectedVersion`이다(`{ "capacity": 8, "expectedVersion": 2 }`). 넣지 않은 필드는 그대로이고 `null`을 보내면 지운다(`name` 제외). `expectedVersion`이 없으면 `400`(필드 `expectedVersion`). 그 행사의 방이 아니면 `404`. 값이 그대로면 아무것도 바꾸지 않고 `200`. `200` 본문은 `{ "room", "boardVersion" }`다. 정원·성별을 바꾸면 응답의 `room`에 바뀐 `warnings`가 들어 있다(배정판의 방 객체와 같은 모양).

### 7.4 `DELETE /api/v1/operator/events/{eventId}/rooms/{roomId}?expectedVersion=2`

§2 "방 지우기". `200` 본문은 `{ "unassignedCount": 6, "boardVersion": 21 }`(이 삭제로 미배정이 된 사람 수, 취소자 포함).

### 7.5 `PUT /api/v1/operator/events/{eventId}/rooms/order`

본문은 `{ "roomIds": ["…", "…"] }`. 그 행사의 방 전체를 정확히 한 번씩 담는다. 빠지거나 더하거나 겹치면 `409 CONFLICT`(화면은 배정판을 다시 읽는다). 그대로면 `boardVersion`을 올리지 않는다. `200` 본문은 `{ "boardVersion" }`.

### 7.6 `POST /api/v1/operator/events/{eventId}/room-assignments`

여러 사람을 한 번에 넣고 옮기고 뺀다. **걸러서 보내기**(배정판에서 또래·성별·숙박·조로 거른 뒤 골라 보내기), **끌어 놓기**, **조 단위 일괄 배정**이 모두 이 요청 하나다.

```json
{
  "changes": [
    { "participantId": "…", "fromRoomId": null, "toRoomId": "…" },
    { "participantId": "…", "fromRoomId": "…", "toRoomId": null }
  ]
}
```

- `changes`는 1–200개, 같은 `participantId`가 두 번 나오면 `400 VALIDATION_FAILED`(필드 `changes`). `fromRoomId`·`toRoomId` 둘 다 키가 있어야 한다(`null`은 미배정). 1월에는 `night`를 받지 않는다(있으면 `400`, 필드 `changes`. G6에서 연다).
- 그 행사의 참가자나 `toRoomId`의 방이 아니면 `404 RESOURCE_NOT_FOUND`. `fromRoomId`는 지금 방과 비교만 한다.
- 사람마다: 지금 = `toRoomId`면 이미 반영(바꾸지 않음), 지금 = `fromRoomId`면 옮김, 그 밖은 충돌. 충돌이 하나라도 있으면 **아무것도 저장하지 않고** `409 CONCURRENT_MODIFICATION`, 확장 필드 `conflicts: [{ "participantId", "currentRoomId" }]`, `boardVersion`.
- 옮기는 사람이 활성 참가자가 아니면 `409 INVALID_STATE_TRANSITION`, `reason: APPLICATION_NOT_SUBMITTED`, `participantIds`. 취소자를 미배정으로 빼는 것(`toRoomId: null`)은 된다.
- **숙박하지 않는 사람은 방에 넣지 못한다(사용자 결정 2026-11-20).** `toRoomId`가 방이고 지금 방과 다른(이미 반영이 아닌) 사람 중 `lodging`이 `NOT_LODGING`인 사람이 하나라도 있으면 **아무것도 저장하지 않고** `409 INVALID_STATE_TRANSITION`, `reason: NOT_LODGING`, `participantIds`(그 사람들). 활성 참가자가 아닌 사람과 같은 모양이고 새 ErrorCode는 없다. 미배정으로 빼는 것(`toRoomId: null`)은 된다. 이미 방에 있는 사람(지금 = `toRoomId`)은 이미 반영으로 보고 거절하지 않는다. `UNKNOWN`은 막지 않는다. 판정 순서: 형식(`400`) → 없는 방·참가자(`404`) → 충돌(`409 CONCURRENT_MODIFICATION`) → 활성 아님 → 숙박 안 함.
- **정원 초과·성별 불일치·성별 답 없음은 막지 않는다.** 저장하고 경고를 돌려준다.
- 옮긴(이미 반영 아닌) 사람마다 `room_assignment_logs`에 한 줄, 근거(`basis`)를 지금 값으로 찍는다.

`200`

```json
{
  "changed": 6,
  "alreadyApplied": 0,
  "boardVersion": 19,
  "rooms": [
    { "roomId": "…", "memberCount": 7, "warnings": [{ "code": "OVER_CAPACITY", "count": 7, "capacity": 6 }] }
  ]
}
```

`rooms`는 이번 요청으로 사람이 들어오거나 나간 방(미배정 제외)의 지금 인원과 경고다. 바뀐 사람이 없으면 `boardVersion`을 올리지 않고 `rooms`는 `[]`다.

**조 단위 일괄 배정(화면 동작):** 운영자가 배정판에서 조 하나(공개본 `group`, `GROUP_WRITE`가 있으면 `draftGroupId`도 고를 수 있다)와 방을 고르면 화면이 그 조의 활성 참가자 중 `lodging`이 `NOT_LODGING`이 아닌 사람으로 `changes`를 만든다. 숙박하지 않는 사람은 포함할 수 없다(화면에서 고를 수 없게 흐리게 보이고 "숙박 안 함"이라고 적는다. 보내도 서버가 거절한다). 그 밖의 사람은 화면에서 포함을 바꿀 수 있다. 서버에는 "조"를 받는 경로가 없다. 조가 나중에 바뀌어도 방은 그대로다. 정원이 모자라면 응답의 `OVER_CAPACITY`로 알 수 있다.

### 7.7 `POST /api/v1/operator/events/{eventId}/room-assignments/review`

다시 볼 것(§5)을 "확인했음"으로 지운다. 본문은 `{ "participantIds": ["…"] }`(1–200개). 배정되지 않았거나 활성 참가자가 아닌 id는 건너뛴다. 근거를 지금 값으로 다시 찍는다. `boardVersion`·이력은 바뀌지 않는다. `200` 본문은 `{ "cleared": 3 }`.

### 7.8 `POST /api/v1/operator/events/{eventId}/rooms/publish`

```json
{ "expectedBoardVersion": 19, "confirmUnassigned": true, "confirmNotLodging": false, "notify": true }
```

`expectedBoardVersion`은 필수(0 이상 정수). `confirmUnassigned`·`confirmNotLodging`·`notify`는 생략하면 `false`·`false`·`true`. 판정은 행사 상태 다음에 이 순서다.

1. `boardVersion`이 다르면 `409 CONCURRENT_MODIFICATION`, 확장 필드 `boardVersion`.
2. 공개한 적이 있고 작업본이 최근 공개본과 같으면 `200`, `result: ALREADY_PUBLISHED`. 아무것도 남기지 않는다(알림·`updates`·audit 없음). 공개한 적이 없으면 건너뛴다(방이 없어도 첫 공개가 된다).
3. 미배정 대상(§7.1 `unassignedCount` > 0)이 있고 `confirmUnassigned`가 `false`이거나, 방에 남은 숙박하지 않는 사람(§7.1 `notLodgingAssignedCount` > 0, 배정한 뒤 숙박을 뺀 사람)이 있고 `confirmNotLodging`이 `false`면 `409 CONFIRMATION_REQUIRED`, 확장 필드 `unassignedCount`·`notLodgingAssignedCount`(DEC-041. 둘 다 늘 담는다. 화면은 한 확인 창에 두 수를 보이고 필요한 플래그를 켜서 다시 보낸다. 결정 대기 7).
4. 공개한다. 같은 트랜잭션에서: `room_publications`에 한 행, DEC-080 `participant_feed_versions.rooms` +1, audit `ROOMS_PUBLISHED`, `notify`면 `ROOM_PUBLISHED` 알림(§9).

`200`

```json
{
  "result": "PUBLISHED",
  "publicationId": "…",
  "publishedAt": "2027-01-10T09:00:00Z",
  "boardVersion": 19,
  "assignedCount": 178,
  "unassignedCount": 4,
  "notLodgingAssignedCount": 0,
  "changedParticipantCount": 3,
  "roomsWithWarnings": 2,
  "notifiedCount": 3
}
```

`ALREADY_PUBLISHED`면 `publicationId`·`publishedAt`이 최근 공개 값이고 `changedParticipantCount`·`notifiedCount`는 0이다.

**스냅샷에 찍는 것**(`room_publications.snapshot`): `{ "rooms": [ { "roomId", "name", "locationNote", "capacity", "genderOptionId", "sortOrder", "memberIds": ["…"] } ] }`. 방 이름·위치는 개인정보가 아니라 그대로 담고, 사람은 **활성 참가자 id만** 담는다(이름·또래·성별·전화는 읽을 때 지금 값으로 붙인다. DEC-072 §1과 같은 이유: 취소자 제외와 보존 정리). 배정된 사람은 모두 담는다. `NOT_LODGING`은 새로 넣을 수 없으므로 여기 드는 `NOT_LODGING`은 배정한 뒤 숙박을 뺐고 공개할 때 운영자가 확인한(`confirmNotLodging`) 사람뿐이다. 그 사람도 공개본의 방 명단(참가자 `myRoom.members`·`rooms`, 조장 `room`, 현장 명단)에 다른 사람과 똑같이 보인다(결정 대기 7). 미배정은 담지 않는다. G6에서는 같은 스냅샷에 `nights: [{ "night": 1, "rooms": [...] }]`를 더한다.

### 7.9 `GET /api/v1/operator/events/{eventId}/rooms/published`

가장 최근 공개본이다(접수대·인쇄용, J11).

```json
{
  "publishedAt": "2027-01-10T09:00:00Z",
  "rooms": [
    {
      "roomId": "…", "name": "301호", "locationNote": "본관 3층", "capacity": 6,
      "gender": { "optionId": "opt_male", "label": "남성" },
      "members": [ { "participantId": "…", "name": "김", "cohort": "94" } ]
    }
  ],
  "unassigned": [ { "participantId": "…", "name": "최", "cohort": "01", "lodging": "LODGING" } ]
}
```

공개한 적이 없으면 `{ "publishedAt": null, "rooms": [], "unassigned": [] }`(`404` 아님). 취소자는 빠진다. 공개 뒤 새로 신청한 활성 참가자는 `unassigned`에 든다(`NOT_LODGING`은 넣지 않는다).

## 8. 참가자 경로

### 8.1 방 배정표 공개 범위 스위치

DEC-083의 `event_participant_settings`에 `roomRosterScope`를 더한다(같은 `GET·PUT …/participant-settings`, 같은 `version`·audit `EVENT_PARTICIPANT_SETTINGS_UPDATED`).

| 값 | 참가자가 보는 것 |
|---|---|
| `ALL` (**기본**) | 내 방(이름·위치 메모)과 같은 방 사람(이름·또래·성별), 전체 방 배정표(방별 이름·또래) |
| `ROOMMATES` | 내 방과 같은 방 사람까지. 전체 배정표는 없다 |
| `MY_ROOM` | 내 방의 이름·위치 메모만 |

- 기본 `ALL`은 사용자 결정(2026-11-19, 로드맵 결정 4 "같은 방 사람과 다른 방 배정까지 참가자가 봐도 된다")이다.
- 스위치를 바꾸면 같은 트랜잭션에서 `participant_feed_versions.rooms`를 올린다(화면이 숙소를 다시 읽는다). `PUT` 본문은 DEC-083 계약대로 바꿀 키와 `expectedVersion`이고 응답에 `roomRosterScope`가 더해진다. 다른 값이면 `400 VALIDATION_FAILED`(필드 `roomRosterScope`).
- 조장은 스위치와 상관없이 조원의 방을 본다(DEC-083, §10.2).

### 8.2 `GET /api/v1/participant/rooms`

참가자 세션 쿠키가 필요하다. CSRF는 필요 없다. 응답 헤더 `Cache-Control: no-store`. 대상은 세션의 행사·참가자뿐이고 **가장 최근 숙소 공개본만** 읽는다. 행사 상태와 상관없이 같다.

`200` — 배정됨, 범위 `ALL`

```json
{
  "status": "ASSIGNED",
  "publishedAt": "2027-01-10T09:00:00Z",
  "rosterScope": "ALL",
  "notLodging": false,
  "myRoom": {
    "roomId": "…",
    "name": "301호",
    "locationNote": "본관 3층 계단 옆",
    "genderLabel": "남성",
    "members": [
      { "name": "박", "cohort": "95", "gender": "남성", "me": false },
      { "name": "김", "cohort": "94", "gender": "남성", "me": true }
    ]
  },
  "rooms": [
    {
      "roomId": "…", "name": "301호", "locationNote": "본관 3층 계단 옆", "genderLabel": "남성",
      "members": [ { "name": "박", "cohort": "95" }, { "name": "김", "cohort": "94" } ]
    }
  ]
}
```

| `status` | 경우 | `myRoom` | `rooms` |
|---|---|---|---|
| `NOT_ELIGIBLE` | `SUBMITTED` 신청이 없다(먼저 본다) | `null` | `null` |
| `NOT_PUBLISHED` | 숙소를 공개한 적이 없다 | `null` | `null` |
| `UNASSIGNED` | 공개됐지만 공개본에 내 방이 없다 | `null` | 범위 `ALL`이면 값 |
| `ASSIGNED` | 공개본에 내 방이 있다 | 값 | 범위 `ALL`이면 값 |

- `notLodging`은 **나의** `lodging`이 `NOT_LODGING`인지다(`UNASSIGNED`일 때 화면이 "숙박하지 않는 것으로 신청했어요"를 보이는 데 쓴다. 숙박하지 않는 사람은 방에 넣지 못하므로 보통 이 경우다). 배정한 뒤 숙박을 뺐는데 공개본에 방이 남은 사람은 `ASSIGNED`이고 `notLodging: true`다. 화면은 방을 그대로 보인다(문구를 더하지 않는다). 내 신청에서 나온 값이라 다른 사람 정보가 아니다. `NOT_ELIGIBLE`이면 `false`.
- `myRoom.members`는 범위가 `ALL`·`ROOMMATES`일 때 그 방의 활성 참가자(나 포함), 이름 순이다. `MY_ROOM`이면 `null`. 항목 키는 **`name`·`cohort`·`gender`·`me`만**이다. `gender`는 `GENDER` 답의 지금 보기 문구이고 질문이 꺼졌거나 답이 없으면 `null`(DEC-083 §7과 같다).
- `rooms`는 범위가 `ALL`일 때 공개본의 모든 방을 방 순서로 담는다(빈 방 포함). 항목의 `members`는 **`name`·`cohort`만**이다. 범위가 `ROOMMATES`·`MY_ROOM`이면 `null`.
- **없는 것:** 참가자 id, 전화, 신청 답, 숙박 밤·참석 칸, 정원, 다시 볼 것, 운영 메모, 미배정 명단. `roomId`는 방의 id라 개인정보가 아니고 화면이 전체 표에서 내 방을 강조하는 데 쓴다.
- 취소한 사람은 다음 요청부터 빠진다. 이름·또래·성별은 읽을 때 지금 값이다.
- 조회는 audit을 남기지 않는다.
- 읽기 비용: 세션 → 내 신청 → 최근 `room_publications` 한 행 → 그 공개본 사람들의 이름·또래·성별(한 번의 조회) → 설정 한 행. 화면은 `updates.rooms`가 바뀔 때만 다시 읽는다.

## 9. 갱신과 알림

- `participant_feed_versions.rooms`는 **공개(`PUBLISHED`)와 `roomRosterScope` 변경**에만 오른다. 작업본 저장·확인·`ALREADY_PUBLISHED`에는 오르지 않는다.
- `ROOM_PUBLISHED`(`target.type: ROOM`, `target.id`: 받는 사람의 방 id, 미배정이면 `null`), 공개할 때 `notify`가 `true`면 같은 트랜잭션에서 만든다.

| 공개 | 받는 사람 | 문구(초안) |
|---|---|---|
| 첫 공개 | 공개본에 방이 있는 활성 참가자 전원 | 제목 "숙소가 정해졌어요", 본문 "301호 · 본관 3층" |
| 두 번째 이후 | 직전 공개본과 **내 방이 다른** 활성 참가자(새로 배정, 다른 방, 미배정으로 빠짐), 그리고 **내 방의 이름·위치 메모가 바뀐** 사람 | 배정·이동: "숙소가 바뀌었어요" / "302호 · 본관 3층". 빠짐: "숙소 배정이 바뀌었어요" / "숙소 화면에서 확인해 주세요". 이름·위치: "숙소 정보가 바뀌었어요" / "301호 · 본관 3층" |

- 같은 방 사람이 들어오거나 나간 것만으로는 알림을 만들지 않는다(결정 대기 2). 화면은 `updates.rooms`로 30초 안에 바뀐다.
- 문구에 **다른 참가자의 이름을 넣지 않는다.** 내 방 이름·위치만이다. 범위가 `MY_ROOM`이어도 내 방 이름·위치는 보이므로 같은 문구다.
- 읽지 않은 `ROOM_PUBLISHED`가 있으면 합친다(DEC-080 §7.3. `target`이 같을 때).
- 운영자 알림은 만들지 않는다.

## 10. DEC-080·DEC-083 계약에 더하는 것

[participant-home-contract](participant-home-contract.md)와 내 조 계약(지금은 [api.md "조 편성"](../../backend/docs/api.md#get-apiv1participantgroup))은 다른 세션이 고치고 있어 이 문서에 적는다. G2·G4 PR이 그 문서(또는 그때의 api.md)에 옮긴다.

### 10.1 DEC-080(참가자 홈)에 더하는 것

| 자리 | 정하는 것 |
|---|---|
| §1 숙소 카드 "`rooms`(G1에서 정함)" | 읽는 경로는 `GET /participant/rooms`. 카드: `ASSIGNED`면 방 이름·위치 메모와 같은 방 사람 이름(나 빼고, 최대 5명 + "외 N명", `myRoom.members`가 `null`이면 생략). 범위 `ALL`이면 "전체 방 배정표" 버튼(같은 응답의 `rooms`로 그린다). `UNASSIGNED`는 `notLodging`이면 "숙박하지 않는 것으로 신청했어요", 아니면 "숙소를 정하고 있어요". `NOT_PUBLISHED`는 빈 상태 "숙소가 정해지면 여기에 보여요". `NOT_ELIGIBLE`은 카드 없음 |
| §2 `features.rooms` | 규칙은 그대로(유형 기본값 → 공개본이 있으면 켬). "공개본이 있다"는 `room_publications`에 그 행사 행이 있다는 뜻이다 |
| §4 `updates.rooms` 오르는 때 | 숙소 공개(`PUBLISHED`)와 `roomRosterScope` 변경 |
| §7.2 `ROOM_PUBLISHED` 받는 사람 | §9 표 |
| §10 시험 조건 | `ROOM_PUBLISHED`의 `title`·`body`에 다른 참가자 이름이 없다 |

### 10.2 DEC-083(내 조)에 더하는 것

- `event_participant_settings`에 `room_roster_scope`(§8.1, §12). `participant-settings` 응답·본문에 `roomRosterScope`.
- `leaderView.members[].room`과 조원 상세의 `room`: **가장 최근 숙소 공개본**에서 그 조원의 방 `{ "name", "locationNote" }`. 공개 전이거나 공개본에 없으면 `null`. `roomId`·같은 방 사람·정원은 넣지 않는다. `roomRosterScope`와 상관없이 조장에게 보인다. 작업본은 보이지 않는다.
- 숙소를 공개하면 조장 화면의 방이 바뀌므로, 화면은 `updates.rooms`가 바뀌면 조장의 `group`도 다시 읽는다(`group` 값은 숙소 공개로 오르지 않는다).

### 10.3 G5 — 참가 현황 표·CSV·현장 명단의 방

모두 **가장 최근 공개본** 기준이다(접수대가 참가자 화면과 같은 방을 안내한다. 결정 대기 5). 작업본의 방은 배정판에서만 본다.

| 위치 | 더하는 것 | 권한 |
|---|---|---|
| `GET …/applications/table`(참가 현황 표) | `rows[].room: { "roomId", "name" }` 또는 `null`, 응답 위에 `roomPublishedAt` | 지금 표와 같다 |
| `POST …/applications/export`(CSV) | 마지막에 `방` 열(방 이름, 없으면 빈칸) | 지금 CSV와 같다(`DATA_EXPORT`) |
| `GET …/check-in-roster`(현장 명단) | 항목에 `room: { "name", "locationNote" }` 또는 `null` | 지금 명단과 같다 |
| `GET …/groups/published`(조별 보기) | 넣지 않는다 | — |

### 10.4 신청 취소(A7, DEC-084)에 더하는 것

신청을 취소하는 트랜잭션에서 그 사람의 `room_assignments` 행을 지우고 `room_assignment_logs`에 `cause = WITHDRAWN`으로 한 줄 남긴다(DEC-072 §5와 같은 이유: 되돌릴 때 옛 방이 자동으로 돌아오지 않게). 숙소 `boardVersion`을 1 올린다. 공개본은 그대로이고 읽을 때 취소자를 뺀다. A7이 먼저 병합되면 G2 PR이 취소 경로에 이 처리를 더하고, G2가 먼저면 A7이 더한다.

## 11. 확장 지점

1. **밤마다 다른 배정(G6):** `room_assignments.night`(0 = 행사 전체, 1.. = 그 밤)와 기본 키 `(space_id, event_id, participant_id, night)`가 1월부터 있다. 밤 행이 있으면 그 밤에는 그 행이 행사 전체 행보다 먼저다. 요청의 `changes[].night`, 배정판의 `participants[].nights`, 스냅샷의 `nights[]`, 참가자 응답의 `nights[]`(밤별 `myRoom`)를 더한다. `lodgingNights`로 밤별 대상을 거른다. 1월 응답 키는 그대로다.
2. **차량 배정(`RIDE_WRITE`):** 같은 계약 모양(작업본 `rides`·`ride_assignments`, `ride_boards`, `ride_publications`, `fromRideId` 비교, 경고 `OVER_CAPACITY`, 공개 스위치)으로 만든다. 테이블은 따로 둔다(data-model "범용 assignments 없음"). 서버 코드는 공통 부품(가칭 `AssignmentBoardSupport`: 사람 단위 충돌 비교·스냅샷 비교·근거 비교)을 같이 쓸 수 있다. 차량은 `night` 대신 `leg`(가는 길·오는 길)를 같은 자리에 둔다.
3. **대상 `ROOM`:** 공지·일정 대상(DEC-080 §8)에 `{ "type": "ROOM", "ids": [...] }`를 더하면 "301호 공지"가 된다. 판정은 숙소 공개본으로 한다.
4. **방 안 순서·침대 자리:** `room_assignments.position`을 더하고 조원 순서(#343)와 같은 `PUT …/rooms/{roomId}/members/order`를 연다.
5. **열쇠·방장:** 방장 표시는 조장처럼 배정 행의 표시로 더한다.
6. **방 묶음(층·동):** `rooms.building`처럼 열을 더하고 참가자 표를 묶어 보인다.

## 12. 테이블 초안

```sql
-- 행사당 한 행. 첫 변경 때 만든다. 없으면 boardVersion 0.
CREATE TABLE room_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name varchar(50) NOT NULL,
  location_note varchar(100),
  capacity smallint CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 50),
  gender_option_id varchar(64),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  version integer NOT NULL CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT rooms_event_space UNIQUE (space_id, event_id, id),
  CONSTRAINT rooms_name_per_event UNIQUE (space_id, event_id, name),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- 배정된 사람만 행이 있다. 미배정은 행 없음. night 0은 행사 전체(1월에는 0만 쓴다).
-- basis는 "다시 볼 것" 비교용 근거: { genderOptionId, lodgingNights, slotIds }. 이름·전화·답 원문은 없다.
CREATE TABLE room_assignments (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  night smallint NOT NULL DEFAULT 0 CHECK (night >= 0),
  room_id uuid NOT NULL,
  basis jsonb NOT NULL,
  basis_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, participant_id, night),
  FOREIGN KEY (space_id, event_id, participant_id) REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, room_id) REFERENCES rooms (space_id, event_id, id)
);
CREATE INDEX room_assignments_room ON room_assignments (space_id, event_id, room_id);

-- 더하기만 하는 이력. 방이 지워져도 이력이 남도록 방 id에 FK를 두지 않는다.
CREATE TABLE room_assignment_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  night smallint NOT NULL DEFAULT 0,
  from_room_id uuid,
  to_room_id uuid,
  cause varchar(16) NOT NULL CHECK (cause IN ('MOVE', 'ROOM_DELETED', 'WITHDRAWN')),
  actor_user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (space_id, event_id, participant_id) REFERENCES participants (space_id, event_id, id)
);
CREATE INDEX room_assignment_logs_participant ON room_assignment_logs (space_id, event_id, participant_id, seq);

-- 공개 스냅샷. snapshot: { rooms: [ { roomId, name, locationNote, capacity, genderOptionId, sortOrder, memberIds } ] }
CREATE TABLE room_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX room_publications_latest ON room_publications (space_id, event_id, seq DESC);

-- DEC-083의 event_participant_settings(F2가 만든다)에 열 하나. F2보다 G2가 먼저면 G2가 테이블을 만들고 F2가 자기 열을 더한다.
ALTER TABLE event_participant_settings
  ADD COLUMN room_roster_scope varchar(16) NOT NULL DEFAULT 'ALL'
  CHECK (room_roster_scope IN ('ALL', 'ROOMMATES', 'MY_ROOM'));
```

- `room_assignment_logs.actor_user_id`는 신청 취소를 참가자 본인이 했을 때 `null`이다(`WITHDRAWN`만).
- 마이그레이션 번호는 G2 PR이 그때의 다음 번호로 정한다.
- 보존: 행사 데이터와 같이 지운다(DEC-056).

## 13. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| 필드 형식·길이·범위, `genderOptionId`가 `GENDER` 보기가 아님, `changes` 형식·개수·중복, `night` 사용, `roomRosterScope` 값 | `400 VALIDATION_FAILED`, `errors[].field` |
| 행사 없음 / 멤버 아님 | `404 RESOURCE_NOT_FOUND` / `403 NOT_A_MEMBER` |
| 권한 없음 | `403 FORBIDDEN` |
| `ENDED` / `ARCHIVED`에서 쓰기 | `409 EVENT_ENDED` / `409 EVENT_ARCHIVED` |
| 그 행사의 방·참가자가 아님 | `404 RESOURCE_NOT_FOUND` |
| 방 `expectedVersion`, 배정 `fromRoomId`, 공개 `expectedBoardVersion` 불일치 | `409 CONCURRENT_MODIFICATION`(`version` / `conflicts`·`boardVersion` / `boardVersion`) |
| 같은 이름의 방, 방 200개 초과(`reason: ROOM_LIMIT`), 순서 목록 불일치 | `409 CONFLICT` |
| 활성 참가자가 아닌 사람을 방에 넣음 | `409 INVALID_STATE_TRANSITION`, `reason: APPLICATION_NOT_SUBMITTED`, `participantIds` |
| 숙박하지 않는 사람(`NOT_LODGING`)을 방에 넣음 | `409 INVALID_STATE_TRANSITION`, `reason: NOT_LODGING`, `participantIds`. 아무것도 저장하지 않는다 |
| 미배정 대상이나 방에 남은 숙박하지 않는 사람이 있는데 확인 없이 공개 | `409 CONFIRMATION_REQUIRED`, `unassignedCount`·`notLodgingAssignedCount` |
| 참가자 세션 없음 | `401 AUTHENTICATION_REQUIRED` |

## 14. audit과 이력

- audit `ROOMS_PUBLISHED`(가칭, `AuditActions`에 더한다): detail `publicationId`, `boardVersion`, `assignedCount`, `unassignedCount`, `changedParticipantCount`, `roomsWithWarnings`, `notify`, `notifiedCount`. `ALREADY_PUBLISHED`는 남기지 않는다.
- 방 만들기·고치기·지우기·순서는 audit을 남기지 않는다(조 편성과 같다). 배정 변경은 `room_assignment_logs`에 남긴다. 확인(§7.7)은 남기지 않는다.
- 이름·전화·답은 audit·이력·로그에 넣지 않는다. 1차에 이력을 읽는 URL은 없다(I7에서 연다).

## 15. 시험 조건

G2 서버 PR은 아래를 통합 테스트로 갖는다.

1. 작업본 저장(방 만들기·배정·지우기)은 `GET /participant/rooms`·`updates.rooms`·조장 `leaderView.members[].room`·참가 현황 표·현장 명단을 바꾸지 않는다. 공개하면 모두 바뀌고 `updates.rooms`가 정확히 1 오른다.
2. 같은 공개를 다시 보내면 `ALREADY_PUBLISHED`이고 `room_publications`·`updates.rooms`·알림·audit이 늘지 않는다.
3. 두 운영자가 같은 사람을 다른 방으로 옮기면 늦은 쪽이 `409 CONCURRENT_MODIFICATION`이고 그 요청의 **누구도** 저장되지 않는다. 다른 사람이면 둘 다 저장된다.
4. 정원을 넘기거나 성별이 다른 사람·성별 답이 없는 사람을 넣어도 `200`이고 응답 `rooms[].warnings`에 해당 `code`가 있다. 숙박하지 않는 사람이 하나라도 든 요청은 `409 INVALID_STATE_TRANSITION`(`reason: NOT_LODGING`, `participantIds`)이고 같은 요청의 **누구도** 저장되지 않으며 `boardVersion`이 그대로다. 그 사람을 미배정으로 빼는 요청은 `200`이다. `UNKNOWN`(숙박 질문이 없는 행사)은 모두 배정된다.
5. 숙박 계산: 집회만 참석·`NO_LODGING` 체크·같은 날 도착 출발은 `NOT_LODGING`이고 `unassignedCount`에 들지 않으며 방에 넣을 수 없다. 신청 집계 `lodging`의 밤별 인원과 배정판 `lodgingNights`로 센 인원이 같다.
6. 배정 뒤 참가자가 신청을 고쳐 숙박을 빼면 배정판 `review.reasons`에 `NOT_LODGING`이 있고 방은 그대로이며 그 방에 `NOT_LODGING` 경고, `notLodgingAssignedCount`가 1이다. 그대로 공개하면 `confirmNotLodging` 없이 `409 CONFIRMATION_REQUIRED`(`notLodgingAssignedCount: 1`), 켜면 공개되고 그 사람이 공개본 방 명단에 있다. 그 사람을 다른 방으로 옮기면 거절된다. 성별·참석 구간을 고치면 `GENDER_CHANGED`·`ATTENDANCE_CHANGED`. 확인하면 사라지고 `boardVersion`은 그대로다.
7. 신청을 취소한 사람은 다음 요청부터 참가자 응답(`myRoom.members`·`rooms`)·공개본 조회·경고·인원에서 빠지고, 취소한 본인은 `NOT_ELIGIBLE`이다. 취소 경로(A7)가 배정 행을 지우고 `WITHDRAWN` 이력을 남긴다.
8. **다른 방 사람의 연락처·답이 어떤 경로로도 나가지 않는다:** `GET /participant/rooms`의 `myRoom.members[]` 키가 정확히 `name`·`cohort`·`gender`·`me`, `rooms[].members[]` 키가 정확히 `name`·`cohort`이고, 응답 어디에도 다른 참가자의 `participantId`·전화·신청 답·숙박 밤·참석 칸·운영 메모가 없다. 조장 `leaderView.members[].room`에 `name`·`locationNote`밖에 없다. `ROOM_PUBLISHED` 문구에 다른 참가자 이름이 없다.
9. 범위 `ROOMMATES`면 `rooms`가 `null`, `MY_ROOM`이면 `myRoom.members`도 `null`이다. 스위치를 바꾸면 `updates.rooms`가 오른다. 조장의 `leaderView`는 범위와 상관없이 방을 담는다.
10. `ROOM_WRITE`가 없는 운영자(공간 `OWNER`·`ADMIN`도 아님)는 배정판 `403 FORBIDDEN`. 공간 `OWNER`·`ADMIN`은 배정판을 읽지만 쓰지 못한다. `GROUP_WRITE`가 없는 사람의 배정판 `draftGroupId`는 모두 `null`이다.
11. `ENDED`에서 쓰기가 `409 EVENT_ENDED`, `ARCHIVED`에서 `409 EVENT_ARCHIVED`이고 참가자는 마지막 공개본을 본다.
12. 방을 지우면 그 방 사람이 미배정이 되고 `ROOM_DELETED` 이력이 사람마다 남으며, 다시 공개하기 전까지 참가자 응답은 그대로다.
13. 첫 공개의 `ROOM_PUBLISHED`는 배정된 활성 참가자 수만큼, 두 번째 공개는 방이 바뀐 사람과 방 이름·위치가 바뀐 방 사람에게만 만들어진다. `notify: false`면 만들지 않는다.
14. 운영자 세션 쿠키로 `GET /participant/rooms`가 열리지 않는다(`401`).
