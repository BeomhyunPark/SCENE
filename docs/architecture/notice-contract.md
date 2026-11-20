# 공지 계약 초안

> **아직 서버에 없다. 계약 초안이다.** 지금 서버가 받는 계약은 [backend/docs/api.md](../../backend/docs/api.md)다. 이 문서의 경로는 [#380](https://github.com/BeomhyunPark/SCENE/issues/380) D2에서 만든다. 만든 경로는 api.md로 옮기고 이 문서에서 지운다.

- 정책: [DEC-082](../product/PRODUCT_DECISIONS.md) (D1, [#400](https://github.com/BeomhyunPark/SCENE/issues/400))
- 기대는 계약: [참가자 홈·갱신 확인·알림](participant-home-contract.md)(DEC-080)의 `updates.notices`, 알림, 대상(audience)
- 작성: 2026-11-19. 확인 방법: 결정 문서·api.md·마이그레이션을 읽었다. 서버 검증과 실제 클릭은 하지 않았다.

공통 규칙은 api.md "공통"을 따른다. 운영자 경로는 `/api/v1/operator/events/{eventId}/notices…`, 참가자 경로는 `/api/v1/participant/notices…`다.

## 1. 공지

```json
{
  "noticeId": "…",
  "title": "내일 아침 집회 장소 변경",
  "body": "소강당이 아니라 대강당입니다.\n7시 50분까지 모여 주세요.",
  "important": true,
  "pinned": false,
  "audience": [{ "type": "ALL" }],
  "status": "PUBLISHED",
  "version": 4,
  "firstPublishedAt": "2027-01-22T12:00:00Z",
  "publishedAt": "2027-01-22T12:00:00Z",
  "editedAt": "2027-01-22T12:20:00Z",
  "archivedAt": null,
  "createdByDisplayName": "김OO",
  "updatedByDisplayName": "이OO",
  "updatedAt": "2027-01-22T12:20:00Z"
}
```

| 필드 | 규칙 |
|---|---|
| `title` | 필수. 앞뒤 공백 자름, 1–100자 |
| `body` | 필수. 1–5,000자. 일반 글이다. 줄바꿈은 살리고 HTML·마크다운은 해석하지 않는다. 화면은 `http(s)://` 주소만 링크로 보인다 |
| `important` | 불리언, 기본 `false`. 참가자 목록에서 강조하고 알림을 중요로 표시한다 |
| `pinned` | 불리언, 기본 `false`. 참가자 목록 맨 위에 둔다. **행사당 `PUBLISHED` 고정 공지는 3개까지**(잠정) |
| `audience` | 필수. DEC-080 공통 모양. 1월에는 `ALL`·`LEADERS`·`STAFF` 중 하나 |
| `status` | `DRAFT`·`PUBLISHED`·`ARCHIVED` |
| `version` | 내용·상태가 바뀔 때마다 1 오른다. 처음은 1 |
| `firstPublishedAt` | 처음 발행한 시각. 다시 바뀌지 않는다 |
| `publishedAt` | 참가자 목록 순서의 기준 시각. 처음 발행 때 정하고, 수정해도 바뀌지 않는다 |
| `editedAt` | **발행된 뒤** 내용(제목·본문·중요·대상)을 고친 마지막 시각. 발행 전 수정이나 고정·보관은 바꾸지 않는다. 한 번도 고치지 않았으면 `null` |

## 2. 상태

```text
DRAFT ──publish──▶ PUBLISHED ──archive──▶ ARCHIVED
  │                    ▲                       │
  └──────archive───────┼───────────────────────┤
                       └──────unarchive────────┘  (한 번이라도 발행했으면 PUBLISHED, 아니면 DRAFT)
```

- `DRAFT`: 운영자만 본다. 지울 수 있다(행 삭제).
- `PUBLISHED`: 대상에게 보인다. 고칠 수 있고 `PUBLISHED`로 남는다(아래 "발행 뒤 수정"). 지울 수 없다.
- `ARCHIVED`: 참가자·운영자 행사 홈에서 사라진다. 운영자 공지 목록의 "보관" 거르기로만 보인다. 고칠 수 없다. 보관하면 고정이 풀린다.
- 같은 상태로 가는 명령은 오류가 아니다: 이미 `PUBLISHED`에 `publish`는 `200 result: ALREADY_PUBLISHED`, 이미 `ARCHIVED`에 `archive`는 `200 result: ALREADY_ARCHIVED`. 아무것도 남기지 않는다.

**발행 뒤 수정:** `PUBLISHED` 공지를 고치면 `editedAt`이 바뀌고 참가자 화면에 "수정됨 HH:mm"이 붙는다. 기본으로 알림을 다시 보내지 않는다. 운영자가 `notify: true`를 보내면 대상에게 `NOTICE_UPDATED`를 만든다(중요한 정정). 대상을 바꾸면 바로 반영된다(넓히면 새로 보이고, 좁히면 사라진다). 이전 본문은 1차에 저장하지 않는다.

## 3. 권한과 행사 상태

| 동작 | 권한 |
|---|---|
| 공지 목록·상세(운영자, 모든 상태·대상) | 유효한 `EVENT_READ`, 또는 활성 공간 `OWNER`·`ADMIN` |
| 만들기·고치기·지우기(DRAFT)·발행·보관·보관 해제·고정 | 유효한 `NOTICE_WRITE` |

기본 역할 중 `NOTICE_WRITE`는 `OWNER`와 `MANAGER`가 갖는다(DEC-079와 그 Follow-up 2026-11-20). 공지에는 운영자가 쓴 글만 있어 조회를 업무 권한으로 좁히지 않는다.

| 행사 상태 | 조회 | 쓰기 | 참가자 공지 |
|---|---|---|---|
| `DRAFT` | 조회 | 가능 | 발행본 |
| `ACTIVE` | 조회 | 가능 | 발행본 |
| `ENDED` | 조회 | **가능**(후속 공지, DEC-051) | 발행본 |
| `ARCHIVED` | 조회 | `409 EVENT_ARCHIVED` | 발행본 |

판정 순서는 api.md의 다른 쓰기와 같다: 행사 없음·멤버 아님 → 권한 → 본문 → 행사 상태 → 대상 찾기 → 버전(`409 CONCURRENT_MODIFICATION`) → 상태·규칙(`409`) → 결과. 쓰기는 행사 행을 잠근다(고정 개수 판정 때문).

## 4. 운영자 경로

### `GET /api/v1/operator/events/{eventId}/notices?status=&audience=&before=&limit=`

- `status`: `DRAFT`·`PUBLISHED`·`ARCHIVED` 중 여럿을 쉼표로. 생략하면 `DRAFT,PUBLISHED`.
- `audience`: `ALL`·`LEADERS`·`STAFF` 중 여럿을 쉼표로. 생략하면 모두.
- 순서: 고정(`PUBLISHED`) → `DRAFT`(수정 시각 내림차순) → `publishedAt` 내림차순. 페이지는 `before`(직전 응답의 `nextBefore`)와 `limit`(1–50, 기본 30).

`200`

```json
{ "items": [ { "공지": "…" } ], "pinnedCount": 1, "nextBefore": null }
```

**운영진 공지가 운영자 화면에 보이는 경로:** 운영자 행사 홈의 "운영진 공지" 카드는 `GET …/notices?status=PUBLISHED&audience=STAFF&limit=3`을 부른다. 새 운영진 공지는 받는 운영자 알림(`STAFF_NOTICE_PUBLISHED`, DEC-080 §7.2)과 운영자 `updates.notices`로 30초 안팎에 보인다. 운영자 공지 메뉴(I5에서 연결)는 같은 목록 경로의 전체 화면이다.

### `GET /api/v1/operator/events/{eventId}/notices/{noticeId}`

`200` 본문은 공지 객체다.

### `POST /api/v1/operator/events/{eventId}/notices`

```json
{
  "title": "…", "body": "…", "important": false, "pinned": false,
  "audience": [{ "type": "ALL" }],
  "publish": true
}
```

`publish: true`면 만들면서 발행한다(휴대폰에서 "발행"까지 세 번 안쪽, D3). 생략하면 `DRAFT`다. `201` 본문은 `{ "notice": { … }, "notifiedCount": 187 }`이고 `DRAFT`면 `notifiedCount`가 0이다.

### `PATCH /api/v1/operator/events/{eventId}/notices/{noticeId}`

본문은 바꿀 필드(`title`·`body`·`important`·`pinned`·`audience`)와 `expectedVersion`(필수), 선택 키 `notify`(발행된 공지일 때만 읽는다, 기본 `false`)다. 값이 그대로면 아무것도 바꾸지 않고 `200`이다. `ARCHIVED`면 `409 INVALID_STATE_TRANSITION`, 확장 필드 `noticeStatus`다.

`200` 본문은 `{ "notice", "notifiedCount" }`다.

### `DELETE /api/v1/operator/events/{eventId}/notices/{noticeId}?expectedVersion=1`

`DRAFT`만 지운다. 다른 상태는 `409 INVALID_STATE_TRANSITION`(`noticeStatus`). `204`.

### 상태 명령

- `POST …/notices/{noticeId}/publish` — 본문 `{ "expectedVersion": 1 }`. `DRAFT` → `PUBLISHED`. `ARCHIVED`에서는 `409 INVALID_STATE_TRANSITION`(보관 해제를 쓴다).
- `POST …/notices/{noticeId}/archive` — 본문 `{ "expectedVersion": 4 }`. `DRAFT`·`PUBLISHED` → `ARCHIVED`.
- `POST …/notices/{noticeId}/unarchive` — 본문 `{ "expectedVersion": 5 }`. `ARCHIVED` → 한 번이라도 발행했으면 `PUBLISHED`(`publishedAt`은 그대로, 알림 없음), 아니면 `DRAFT`. 고정은 풀린 채로 돌아온다.

`200`

```json
{ "result": "PUBLISHED", "notice": { "공지": "…" }, "notifiedCount": 187 }
```

`result`는 `PUBLISHED`·`ALREADY_PUBLISHED`·`ARCHIVED`·`ALREADY_ARCHIVED`·`UNARCHIVED`다.

**고정 개수:** 고정한 `PUBLISHED` 공지가 이미 3개인데 네 번째를 고정하거나(만들기·고치기·발행), 고정된 `DRAFT`를 발행하면 `409 CONFLICT`, 확장 필드 `reason: PIN_LIMIT`, `pinnedNoticeIds`다. `DRAFT`의 `pinned`는 발행할 때 적용할 값으로 저장만 한다.

## 5. 참가자 경로

### `GET /api/v1/participant/notices?before=&limit=`

참가자 세션 쿠키가 필요하다. `PUBLISHED`이고 대상에 드는 공지만 준다(DEC-080 §8: `ALL`은 모두, `LEADERS`는 공개본의 조장, `STAFF`는 아무도 아님). 행사 상태와 상관없이 같다.

`200`

```json
{
  "items": [
    {
      "noticeId": "…",
      "title": "내일 아침 집회 장소 변경",
      "bodyPreview": "소강당이 아니라 대강당입니다. 7시 50분까지…",
      "important": true,
      "pinned": true,
      "leadersOnly": false,
      "publishedAt": "2027-01-22T12:00:00Z",
      "editedAt": "2027-01-22T12:20:00Z",
      "unread": true
    }
  ],
  "nextBefore": null
}
```

- 순서는 고정 → `publishedAt` 내림차순 → `noticeId`. 페이지는 `before`·`limit`(1–50, 기본 20). 고정 공지는 첫 페이지에만 나온다.
- `bodyPreview`는 본문 앞 80자(줄바꿈은 공백)다.
- `leadersOnly`는 대상이 `LEADERS`일 때 `true`다. 응답에 `audience` 원본은 없다.
- `unread`는 이 공지를 가리키는 내 알림(`NOTICE_PUBLISHED`·`NOTICE_UPDATED`) 중 읽지 않은 것이 있으면 `true`다. 화면은 "새 공지" 표시로 쓴다. 알림이 만들어진 뒤 조장이 된 사람처럼 알림이 없는 공지는 `false`다.
- 작성자 이름은 주지 않는다(운영자 이름을 참가자에게 보일 필요가 없다).

### `GET /api/v1/participant/notices/{noticeId}`

`200` 본문은 목록 항목에 `body`(전체)를 더한 것이다. 보이지 않는 공지(없음, `DRAFT`, `ARCHIVED`, 대상 밖)는 모두 `404 RESOURCE_NOT_FOUND`이고 서로 구분하지 않는다. 조회로 읽음 처리하지 않는다. 화면은 상세를 열 때 `POST /participant/notifications/read` `{ "target": { "type": "NOTICE", "id": "…" } }`를 부른다(DEC-080 §7.4).

조회는 audit을 남기지 않는다.

## 6. 갱신과 알림

| 일 | `participant_feed_versions.notices` | 참가자 알림 | 운영자 알림 | 운영자 `updates.notices` |
|---|---|---|---|---|
| `DRAFT` 만들기·고치기·지우기 | 그대로 | 없음 | 없음 | +1 |
| 발행 | 대상이 `ALL`·`LEADERS`면 +1 | `NOTICE_PUBLISHED`(대상의 활성 참가자) | 대상이 `STAFF`면 `STAFF_NOTICE_PUBLISHED`(작성자 뺀 활성 운영자) | +1 |
| 발행된 공지 고치기·고정 바꾸기 | 바뀌기 전이나 뒤의 대상이 참가자를 포함하면 +1 | `notify: true`일 때만 `NOTICE_UPDATED` | `notify: true`이고 대상이 `STAFF`면 같은 종류 | +1 |
| 보관·보관 해제(발행했던 공지) | 대상이 참가자를 포함하면 +1 | 없음 | 없음 | +1 |

- 알림은 발행과 같은 트랜잭션에서 만든다. 받는 사람은 그 순간 대상에 드는 사람이다. 나중에 조장이 된 사람은 목록에서 공지를 보지만 알림은 받지 않는다.
- 알림 `title`은 "새 공지"(중요면 "중요 공지"), `body`는 공지 제목이다. `important`는 공지 값을 따른다.
- 보관하면 그 공지를 가리키는 읽지 않은 알림을 읽음으로 바꾼다(사라진 공지를 계속 "새"로 보이지 않게).

## 7. 전달 기록의 자리

1월의 전달은 화면 안 알림뿐이고, 그 기록은 알림 행(`notifications`) 자체다. 공지에는 전달 기록 열을 두지 않는다.

웹 푸시(D7, P2)·알림톡·문자는 DEC-080 §7.6의 `notification_deliveries`를 알림 행에 붙여 더한다. 공지 쪽에서 바꿀 것은 발행 요청의 선택 키 `channels`(예: `["IN_APP", "WEB_PUSH"]`, 1월에는 받지 않는다)뿐이다. 공유 문구 복사(D5)는 화면이 공지 제목·본문·참가자 주소로 만들고 서버에 저장하지 않는다.

## 8. 오류

새 ErrorCode는 만들지 않는다.

| 경우 | 응답 |
|---|---|
| 필드 형식·길이, `audience` 모양, 쿼리 값 | `400 VALIDATION_FAILED`, `errors[].field` |
| 그 행사의 공지가 아님 / 참가자에게 보이지 않음 | `404 RESOURCE_NOT_FOUND` |
| `expectedVersion` 불일치 | `409 CONCURRENT_MODIFICATION`, 확장 필드 `notice`(지금 값) |
| 그 상태에서 할 수 없는 일(보관된 공지 고치기, DRAFT가 아닌 공지 지우기, 보관된 공지 발행) | `409 INVALID_STATE_TRANSITION`, `noticeStatus` |
| 고정 4개째 | `409 CONFLICT`, `reason: PIN_LIMIT`, `pinnedNoticeIds` |
| `ARCHIVED` 행사 | `409 EVENT_ARCHIVED` |

## 9. audit

| `action` | 언제 | detail |
|---|---|---|
| `NOTICE_PUBLISHED` | 발행할 때(`ALREADY_PUBLISHED` 제외) | `noticeId`, `version`, `audienceTypes`, `important`, `notifiedCount` |
| `NOTICE_UPDATED` | **발행된** 공지를 고칠 때 | `noticeId`, `version`, `fields`(바뀐 필드 이름), `notify`, `notifiedCount` |
| `NOTICE_ARCHIVED`, `NOTICE_UNARCHIVED` | 보관·보관 해제가 실제로 일어날 때 | `noticeId`, `version` |

제목·본문은 audit·로그·오류 응답에 넣지 않는다(공지에 이름·연락처가 들어갈 수 있다). `DRAFT` 만들기·고치기·지우기와 고정만 바꾸기는 남기지 않는다.

## 10. 테이블 초안

```sql
CREATE TABLE notices (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  title varchar(100) NOT NULL,
  body varchar(5000) NOT NULL,
  important boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  audience jsonb NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  version integer NOT NULL CHECK (version >= 1),
  first_published_at timestamptz,
  published_at timestamptz,
  edited_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  CONSTRAINT notices_published_shape CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
CREATE INDEX notices_list ON notices (space_id, event_id, status, published_at DESC);
```

- 대상은 `audience jsonb` 하나에 DEC-080 모양 그대로 둔다. 참가자 목록은 `status = 'PUBLISHED'`로 읽은 뒤 서버의 `ParticipantAudience`로 거른다(행사당 공지는 많아야 수십 건).
- 고정 3개는 DB 색인이 아니라 행사 행을 잠근 뒤 세어서 지킨다.

## 11. 시험 조건

- 조장 대상 공지는 공개본의 조장에게만 목록·상세·알림으로 오고, 일반 참가자의 상세 요청은 `404`다.
- 운영진 대상 공지는 어떤 참가자 경로에도 나오지 않고, 활성 운영자에게 알림이 간다(작성자 제외).
- `DRAFT` 저장은 참가자 `updates.notices`를 올리지 않는다. 발행·보관은 올린다.
- 발행된 공지를 고치면 `editedAt`이 바뀌고, `notify`가 없으면 알림이 생기지 않는다.
- `ENDED` 행사에서 발행이 되고, `ARCHIVED` 행사에서는 `409 EVENT_ARCHIVED`다.
- 고정 공지가 3개면 네 번째 고정이 `409 CONFLICT PIN_LIMIT`이다.
- audit detail에 제목·본문이 없다.
