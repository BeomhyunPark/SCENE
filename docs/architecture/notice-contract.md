# 공지 계약 초안

> **서버 경로는 [backend/docs/api.md "공지"](../../backend/docs/api.md#공지)로 옮겼다**([#434](https://github.com/BeomhyunPark/SCENE/issues/434), D2). 경로·요청·응답·오류·갱신 값·알림·audit·저장은 그곳이 정본이다. 이 문서에는 화면 세션(D3 운영자 공지, D4 참가자 공지 탭)이 읽을 화면 규칙과 나중 확장만 남긴다. 초안과 다르게 만든 점은 [DEC-082 Follow-up (2026-11-20, #434)](../product/PRODUCT_DECISIONS.md)에 있다.

- 정책: [DEC-082](../product/PRODUCT_DECISIONS.md) (D1, [#400](https://github.com/BeomhyunPark/SCENE/issues/400))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `updates.notices`, 알림, 대상(audience)
- 작성: 2026-11-19. 2026-11-20 서버 경로를 api.md로 옮겼다(통합 테스트·로컬 HTTP로 확인, 실제 클릭은 화면이 없어 하지 않았다).
- 2026-11-20 화면(D3 #442, D4 #443)을 만들었다. 화면에서 정한 것은 [DEC-082 Follow-up (2026-11-20, #442 #443)](../product/PRODUCT_DECISIONS.md), 로컬 실제 클릭 기록은 [442-notices](../test_results/442-notices/README.md)다.

## 1. 공지 객체

[api.md "공지 객체 (운영자)"](../../backend/docs/api.md#공지-객체-운영자)로 옮겼다.

화면 규칙:

- 본문은 일반 글이다. 화면은 줄바꿈을 살리고 `http(s)://` 주소만 링크로 보인다. HTML·마크다운은 해석하지 않는다.
- `important`는 참가자 목록에서 강조하고, 알림도 중요로 표시된다.
- `pinned`는 참가자 목록 맨 위다. 행사당 발행된 고정 공지는 3개까지다. 운영자 목록의 `pinnedCount`가 3이면 고정 단추를 막고, 서버가 `409 CONFLICT PIN_LIMIT`을 주면 `pinnedNoticeIds`의 공지를 보여 하나를 풀게 한다.

## 2. 상태

```text
DRAFT ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED
  │                    ▲                       │
  └──────archive───────┼───────────────────────┤
                       └──────unarchive────────┘  (한 번이라도 발행했으면 PUBLISHED, 아니면 DRAFT)
```

- `DRAFT`: 운영자만 본다. 지울 수 있다.
- `PUBLISHED`: 대상에게 보인다. 고칠 수 있고 `PUBLISHED`로 남는다. 지울 수 없다.
- `ARCHIVED`: 참가자 목록과 운영자 행사 홈에서 사라진다. 운영자 공지 목록의 "보관" 거르기(`status=ARCHIVED`)로만 보인다. 고칠 수 없다. 보관하면 고정이 풀린다.

**발행 뒤 수정(화면):** 참가자 화면은 `editedAt`이 있으면 "수정됨 HH:mm"을 붙인다. 운영자 수정 화면은 "다시 알림" 선택(기본 끔)을 두고 켜면 `notify: true`를 보낸다. 고정만 바꿀 때는 그 선택을 보이지 않는다(서버도 알리지 않는다).

## 3. 권한과 행사 상태

[api.md "권한과 판정 순서"](../../backend/docs/api.md#권한과-판정-순서)로 옮겼다. 화면은 `NOTICE_WRITE`가 없는 운영자(기본 STAFF)에게 쓰기 단추를 보이지 않고, `ARCHIVED` 행사에서는 읽기만 보인다. `ENDED` 행사에서도 쓴다(후속 공지).

## 4. 운영자 경로

[api.md "공지"](../../backend/docs/api.md#공지)로 옮겼다.

화면 규칙:

- 휴대폰에서 "발행"까지 세 번 안쪽(D3): 작성 화면 하나에서 `POST …/notices`에 `publish: true`로 만들며 발행한다. 초안 저장은 `publish`를 빼고 보낸다.
- **운영진 공지가 운영자 화면에 보이는 경로:** 운영자 행사 홈의 "운영진 공지" 카드는 `GET …/notices?status=PUBLISHED&audience=STAFF&limit=3`을 부른다. 새 운영진 공지는 받는 운영자 알림(`STAFF_NOTICE_PUBLISHED`)과 운영자 `updates.notices`(운영자 범위 값, I3가 경로를 연다)로 30초 안팎에 보인다. 운영자 공지 메뉴(I5에서 연결)는 같은 목록 경로의 전체 화면이다.
- `409 CONCURRENT_MODIFICATION`이면 응답의 `notice.updatedByDisplayName`으로 "다른 사람이 먼저 고쳤어요"를 보이고 상세를 다시 읽는다(오류 본문에는 제목·본문이 없다).

## 5. 참가자 경로

[api.md "`GET /api/v1/participant/notices`"](../../backend/docs/api.md#get-apiv1participantnoticesbeforelimit)로 옮겼다.

화면 규칙:

- `unread`가 `true`면 "새 공지" 표시를 한다. 상세를 열면 `POST /participant/notifications/read` `{ "target": { "type": "NOTICE", "id": "…" } }`를 부른다(조회만으로 읽음이 되지 않는다).
- `leadersOnly`가 `true`면 "조장 공지" 표시를 한다.
- 상세가 `404`면(보관·대상 밖) 빈 상태 문구를 보이고 목록으로 돌아간다. 알림에서 들어온 경우도 같다.
- `updates.notices` 값이 바뀌면 목록 첫 페이지와 홈의 최신 공지 카드를 다시 읽는다.

## 6. 갱신과 알림

[api.md "갱신 값과 알림"](../../backend/docs/api.md#갱신-값과-알림)으로 옮겼다.

## 7. 전달 기록의 자리

1월의 전달은 화면 안 알림뿐이고, 그 기록은 알림 행(`notifications`) 자체다. 공지에는 전달 기록 열을 두지 않는다.

웹 푸시(D7, P2)·알림톡·문자는 DEC-080 §7.6의 `notification_deliveries`를 알림 행에 붙여 더한다. 공지 쪽에서 바꿀 것은 발행 요청의 선택 키 `channels`(예: `["IN_APP", "WEB_PUSH"]`)뿐이다. 1월 서버는 모르는 키를 무시한다. 공유 문구 복사(D5)는 화면이 공지 제목·본문·참가자 주소로 만들고 서버에 저장하지 않는다.

## 8. 오류

[api.md "공지"의 오류](../../backend/docs/api.md#오류-1)로 옮겼다. 새 ErrorCode는 없다.

## 9. audit

[api.md "`audit_logs`"](../../backend/docs/api.md#audit_logs)로 옮겼다. 제목·본문은 audit·로그·오류 응답에 넣지 않는다.

## 10. 테이블

[api.md "공지"의 저장](../../backend/docs/api.md#저장-1)으로 옮겼다(`V22__notices.sql`, 번호는 병합 때 맞춘다).

## 11. 시험 조건

모두 `backend/src/test/java/app/scene/event/notice/NoticeHttpIT`에 있다(참가자 목록 읽기 비용은 `NoticeCostIT`).

- 조장 대상 공지는 공개본의 조장에게만 목록·상세·알림으로 오고, 일반 참가자의 상세 요청은 `404`다.
- 운영진 대상 공지는 어떤 참가자 경로에도 나오지 않고, 활성 운영자에게 알림이 간다(작성자 제외).
- `DRAFT` 저장은 참가자 `updates.notices`를 올리지 않는다. 발행·보관은 올린다.
- 발행된 공지를 고치면 `editedAt`이 바뀌고, `notify`가 없으면 알림이 생기지 않는다.
- `ENDED` 행사에서 발행이 되고, `ARCHIVED` 행사에서는 `409 EVENT_ARCHIVED`다.
- 고정 공지가 3개면 네 번째 고정이 `409 CONFLICT PIN_LIMIT`이다.
- audit detail에 제목·본문이 없다.
