# 공지 화면 확인 기록 (D3 #442, D4 #443, DEC-082)

- 날짜: 2026-11-20, 클라우드 세션
- 브랜치: `claude/roadmap-d3-d4-notice-screens`

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | DEC-082 Follow-up (2026-11-20, #442·#443), operator-sidebar-menus-review의 "공지" 메뉴 | 작성. 결정 대기는 PR 본문 |
| mock 연결 검증 | `pnpm lint`·`typecheck`·`test`·`build`. 공지 mock 저장소·핸들러(서버 판정 순서), 운영자 화면 시험 15개(`EventNotices.test.tsx`, `noticeUpdates.test.tsx`), 참가자 화면 시험 7개(`participant/NoticesTab.test.tsx`) | origin/main(I3 #445까지) 병합 뒤 테스트 619개 통과, lint·typecheck·build 성공 |
| 실제 클릭(로컬) | 로컬 서버(local 프로필, PostgreSQL 17, Flyway V1~V22) + Vite `VITE_API_MOCK=0`, Playwright `notices-click.mjs` | 아래 단계 모두 통과(origin/main 병합 뒤 코드). 기록은 `click-log.txt` |
| 운영 서버 | 하지 않았다(이 환경에서 접속할 수 없다) | 사용자 확인 필요 |

행사·신청서·신청 2명(김가람 조원, 이나래 조장)·조 공개·STAFF 운영 멤버는 HTTP API로 만들고, 공지 쓰기·발행·고치기·고정·보관과 참가자 화면은 눌렀다. 참가자 화면은 손으로 새로 고치지 않고 화면이 스스로 `updates`를 확인하기를 기다렸다. 고정 3개는 API로 만들었다.

## 단계와 결과

1. `01` 참가자(390px) 홈: "공지가 올라오면 여기에 보여요."
2. `02`~`03` 운영자 휴대폰: 하단 막대 "전체 메뉴" → 행사 운영 "공지" → 빈 목록
3. `04`~`05` **공지 쓰기 → (제목·내용 입력, 중요 체크) → 발행. 글을 쓴 뒤 누른 횟수 2번**(입력칸을 누르는 것과 중요 체크는 뺐다). "발행했어요. 2명에게 알렸어요."
4. `06` 참가자 홈에 **25.6초** 뒤 "새 공지·중요" 표시와 함께 뜸(주기 25초 ±20%). 앞선 두 번은 26.6초·23.1초
5. `07` 상세: `<script>`·`<b>`는 글자 그대로(태그 0개), `https://example.com/map?x=1`만 링크(`target=_blank`, `rel=noopener noreferrer`), `javascript:alert(2)`는 글자
6. 상세를 열면 `updates.notifications`가 `unreadCount 1 → 0`, `08` 목록의 "새 공지" 사라짐
7. `09`~`10` 운영자가 휴대폰에서 고치기 → "참가자에게 '수정됨'으로 보여요", 내용을 바꾸면 "다시 알림"(기본 끔) → 저장. 참가자 목록에 28.0초 뒤 "수정됨 13:20"
8. `11` 데스크톱에서 대상 "조장" → "공개한 조 편성의 조장만 봐요…" → 발행 "1명에게 알렸어요". `12` 조장(이나래) 목록에 "조장 공지" 표시. `13` 조원(김가람) 화면·API 목록에 조장·운영진 공지 없음
9. 대상 "운영진" 발행 "1명에게 알렸어요"(작성자 뺀 STAFF). `14` 데스크톱 운영자 행사 홈 "운영진 공지" 카드, `15` STAFF 휴대폰 행사 홈 카드, STAFF 운영자 `updates.notices` 4
10. `15b` STAFF 알림 목록(I3)의 "운영진 공지" 알림 → `/events/{eventId}/notices/{noticeId}`로 열림
11. `16` STAFF 공지 목록: "공지를 쓸 권한이 없어 읽기만 할 수 있어요.", 공지 쓰기 버튼 0개
12. `17` 고정 4개째: 서버 `409 PIN_LIMIT` → "고정은 3개까지예요. 다른 고정을 풀어 주세요."와 고정된 공지 셋(링크). `18` 데스크톱 목록, `19` 휴대폰 목록("고정 3/3")
13. `20`~`21` 보관 → 참가자 목록에서 15.0초 뒤 사라짐
14. 참가자(김가람) 화면이 공지 경로를 부른 수 6번: 처음 읽기와 `updates.notices`가 바뀐 때, 상세 열기뿐이다. 공지 경로를 주기적으로 부르지 않는다

## 실제 클릭에서 찾아 고친 것

- 휴대폰 공지 고치기 화면에서 제목을 고친 바로 뒤 "저장"을 누르면 요청이 나가지 않았다. 입력칸에 초점이 있으면 운영자 하단 막대가 숨었다가(OperatorShell) 다른 곳을 누르는 순간 돌아오는데, "저장"이 화면 맨 아래에 있으면 그 탭이 돌아온 막대("알림")로 갔다. 쓰기 화면의 버튼 줄을 막대 자리 위에 붙여(`position: sticky; bottom: var(--operator-bottom-nav-space)`) 고쳤다. 다른 화면의 같은 모양은 손대지 않았다.
- 참가자 홈 카드의 공지 행이 카드 폭을 채우지 않았다. 고쳤다.

## 하지 못한 것

- 운영 서버(scene.greengroove.app) 확인
- 실제 휴대폰(iOS Safari·Android Chrome)에서 키보드가 열린 채 누르기. Playwright 휴대폰 흉내(390px, 터치)로만 확인했다
- 참가자 화면의 데스크톱 폭 캡처(참가자 화면은 휴대폰 기준이라 찍지 않았다)
- 동시 수정(`409 CONCURRENT_MODIFICATION`)과 STAFF·ARCHIVED·ENDED 행사의 화면은 mock 시험으로만 확인했다

## 다시 돌리기

```bash
sudo dockerd > /tmp/dockerd.log 2>&1 &
cd backend && docker compose up -d --wait
./gradlew -Porg.gradle.java.installations.paths=/opt/temurin25 bootRun --args='--spring.profiles.active=local'
cd frontend && VITE_API_MOCK=0 pnpm dev
node docs/test_results/442-notices/notices-click.mjs docs/test_results/442-notices
```
