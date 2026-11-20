# 일정표 계약 초안

> **서버에 있다.** 경로·요청·응답·오류·테이블은 [#435](https://github.com/BeomhyunPark/SCENE/issues/435)(C2·C3)에서 만들어 [backend/docs/api.md "일정표"](../../backend/docs/api.md#일정표)로 옮겼다. 지금 서버가 받는 계약은 api.md다. 이 문서에는 화면 세션(C4 운영자 편집, C5 참가자 일정 탭)이 읽을 개념과 화면 규칙만 남긴다.

- 정책: [DEC-081](../product/PRODUCT_DECISIONS.md) (C1, [#398](https://github.com/BeomhyunPark/SCENE/issues/398))와 그 Follow-up(2026-11-20, #435)
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `updates.schedule`, 알림, 대상(audience)
- 본보기: api.md "조 편성"(작업본·공개본, 버전, `ALREADY_PUBLISHED`)
- 작성: 2026-11-19. 2026-11-20 #435에서 경로를 api.md로 옮겼다(서버 검증: 통합 테스트·로컬 HTTP. 화면이 없어 실제 클릭은 하지 않았다).

## 1. 개념

- **작업본**: 운영자가 고치는 항목들. 저장해도 참가자에게 보이지 않는다.
- **공개본**: 공개할 때 작업본 전체를 찍은 스냅샷. 참가자는 가장 최근 공개본만 본다(DEC-043과 같다).
- **"저장하고 바로 공개"**: 항목 하나를 고치는 요청에 `publish: true`를 붙이면 같은 트랜잭션에서 저장하고 공개한다. 현장에서 휴대폰으로 시각·장소를 고쳐 한 번에 내보내는 경로다.

## 2–5. 항목·버전·권한·운영자 경로

api.md로 옮겼다: [항목](../../backend/docs/api.md#항목), [버전](../../backend/docs/api.md#버전-1), [권한과 행사 상태](../../backend/docs/api.md#일정표), [`GET …/schedule`](../../backend/docs/api.md#get-apiv1operatoreventseventidschedule), [항목 만들기·고치기·지우기](../../backend/docs/api.md#post-apiv1operatoreventseventidscheduleitems), [공개](../../backend/docs/api.md#post-apiv1operatoreventseventidschedulepublish), [공개본 조회](../../backend/docs/api.md#get-apiv1operatoreventseventidschedulepublished).

**운영자 화면 규칙 (C4)**

- 시각으로 정렬되므로 순서 바꾸기 버튼은 같은 시각 안에서만 의미가 있다(`PATCH`의 `sortOrder`).
- 항목의 `publishState`가 `ADDED`·`CHANGED`면 "공개 안 됨" 표시를 붙이고, `publication.pendingChanges`로 "공개하지 않은 변경 N건"을 보인다. 지운 항목은 작업본에 없으므로 `removed` 수로만 보인다.
- `outOfPeriod: true` 항목은 행사 기간이 줄어 밖에 있다. 공개 버튼을 누르면 `409 ITEMS_OUT_OF_PERIOD`(`itemIds`)이므로 그 항목들을 강조하고 옮기거나 지우게 한다.
- `slotId`가 응답의 `slots`에 없으면 "신청서에 없는 칸"으로 보인다. `slots[].linkedItemId`가 있는 칸은 이미 다른 항목이 가졌다(`409 SLOT_ALREADY_LINKED`).
- `409 CONCURRENT_MODIFICATION`(`item`)이면 지금 값과 내 수정을 나란히 보여 주고 다시 고르게 한다(DEC-046). 지금 값이 내가 보낸 값과 같으면 성공으로 본다.
- 공개 `409 CONCURRENT_MODIFICATION`(`boardVersion`)이면 작업본을 다시 읽고 바뀐 항목 요약을 보여 확인받는다.

## 6. 저장하고 바로 공개

api.md로 옮겼다: [저장하고 바로 공개](../../backend/docs/api.md#저장하고-바로-공개).

**화면 규칙 (C4, 휴대폰)**

- "저장하고 바로 공개" 버튼은 항목 편집 화면의 요청 하나다(`publish: true`).
- `409 CONFIRMATION_REQUIRED`면 `otherChanges`로 "다른 미공개 변경 N건도 함께 공개돼요"와 그 제목 목록을 보이고, 확인하면 같은 요청에 `confirmOtherChanges: true`를 붙여 다시 보낸다. 취소하면 아무것도 저장되지 않았다.
- 오타 수정처럼 알릴 필요가 없으면 "알림 보내기"를 끄고 `notify: false`로 보낸다(기본은 켬, DEC-081 결정 대기 1).
- 응답의 `publication.result`가 `ALREADY_PUBLISHED`면(되돌리기) "바뀐 내용이 없어요"로 보인다.

## 7. 알림과 갱신

api.md로 옮겼다: [공개의 알림](../../backend/docs/api.md#post-apiv1operatoreventseventidschedulepublish). 운영자 알림은 만들지 않는다. 운영자 화면은 `GET …/events/{eventId}/updates`의 `schedule`(작업본 `boardVersion`, I3)로 다시 읽는다. 일정 공개 때 공지 초안을 만드는 것은 C7(P2)이다.

## 8. 참가자 경로

api.md로 옮겼다: [`GET /api/v1/participant/schedule`](../../backend/docs/api.md#get-apiv1participantschedule).

**참가자 화면 규칙 (C5)**

- 일차 탭은 `days`로 만들고, 오늘(`serverTime`의 `timeZone` 날짜)이 행사 기간 안이면 그날 탭을 먼저 연다.
- `status: NOT_PUBLISHED`면 "아직 일정표가 올라오지 않았어요", `NOT_ELIGIBLE`이면 신청이 없다는 안내를 보인다(취소되면 보통 `401`이 먼저라 들어오기 화면으로 간다).
- `change`가 있으면 `kind`에 따라 "변경됨"(`CHANGED`) 또는 "새 일정"(`ADDED`) 표시를 붙이고, `previous`가 있는 필드는 "09:00 → 09:30"처럼 이전 값과 지금 값을 보인다. 서버가 24시간이 지난 표시를 빼므로 화면은 `change`가 있으면 보이기만 한다.
- `removedItems`는 그날(`day`) 목록의 그 시각 자리에 "취소됨"으로 줄을 그어 보인다.
- `leadersOnly: true` 항목에는 "조장" 표시를 붙인다.
- `endsNextDay: true`면 끝 시각 옆에 "(다음 날)"을 붙인다. 지금·다음 일정은 `startsAt`·`endsAt`으로 계산한다([홈 계약 §6](participant-home-contract.md)).
- `updates.schedule`이 바뀌면 이 경로를 다시 읽고 "마지막 갱신"(`publishedAt`)을 보인다. 일정 탭을 열면 `POST /participant/notifications/read`에 `{ "target": { "type": "SCHEDULE", "id": null } }`로 일정 알림을 읽음으로 한다.

## 9–11. 오류·audit·테이블

api.md로 옮겼다: [일정표](../../backend/docs/api.md#일정표)의 판정 순서와 각 경로, [기록과 저장](../../backend/docs/api.md#기록과-저장). 새 ErrorCode는 없다.

## 12. 시험 조건

#435에서 통합 테스트(`ScheduleHttpIT`, `ParticipantScheduleCostIT`, `ScheduleChangeTest`)로 확인했다.

- 작업본 저장은 참가자 응답·`updates.schedule`을 바꾸지 않는다. 공개하면 둘 다 바뀐다(값은 정확히 1). `ALREADY_PUBLISHED`는 값·알림·audit·공개 행을 늘리지 않는다.
- 두 운영자가 같은 항목을 고치면 늦은 쪽이 `409 CONCURRENT_MODIFICATION`이고 저장되지 않는다. 다른 항목이면 둘 다 저장된다.
- 저장하고 바로 공개는 다른 미공개 변경이 있으면 확인 없이 아무것도 저장하지 않는다. 확인하면 저장과 공개가 함께 커밋된다. 공개 단계가 실패하면 저장·갱신 값·알림도 되돌린다.
- `LEADERS` 항목은 공개본의 조장에게만, `STAFF` 항목은 아무 참가자에게도 보이지 않는다. 조장이 풀린 공개 뒤 다음 읽기에서 `LEADERS` 항목이 사라진다. 신청이 취소된 참가자는 항목을 보지 못하고(세션이 끊겨 `401`, DEC-084) 알림도 받지 않는다.
- `22:00`–`00:30` 항목이 `endsNextDay: true`이고 `endsAt`이 다음 날이다.
- 같은 `slotId`를 두 항목에 줄 수 없다.
- `ENDED`에서 쓰기가 `409 EVENT_ENDED`이고 참가자는 마지막 공개본을 계속 본다.
- 참가자 조회 한 요청은 SQL 세 문장이다.
