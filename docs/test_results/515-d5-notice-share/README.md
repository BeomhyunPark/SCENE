# #515 D5 공지 "공유 문구 복사" 확인 기록

- 날짜: 2026-11-28 00:10~00:40 KST, 클라우드 세션
- 브랜치: `claude/nifty-darwin-m7n5g5` (`origin/main` 745ee57 위, 푸시 전)
- 실행: `backend/compose.yaml` PostgreSQL 17 + `./gradlew bootRun --args='--spring.profiles.active=local'`(V1~V30) + `VITE_API_MOCK=0 pnpm exec vite`. 준비(행사·신청 5명·조·방 공개)는 [week4-setup.cjs](../517-i5-event-menu/week4-setup.cjs)가 실제 HTTP API로 한다. 실행: `NODE_PATH=<playwright 위치> node <스크립트> .`, deviceScaleFactor 2

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | notice-contract "공유 문구 복사"에 만든 모양(제목 / 본문 / 참가자 주소, ALL·LEADERS 발행 공지만) | 작성 |
| 서버 통합 테스트 | 서버 변경 없음(화면이 만든다) | 해당 없음. 전체 `./gradlew check` 614개 통과 |
| 화면 테스트 | `EventNotices.test` 2건(복사 글, 초안·운영진 공지에 없음·읽기만 하는 운영자에게 있음) | 전체 107파일 820개 통과 |
| 로컬 실제 클릭 | [d5-click.cjs](d5-click.cjs), [click-log.txt](click-log.txt) | 아래 |
| 운영 서버 확인 전 | 실제 카카오톡 붙여 넣기 포함 | 사용자 확인 필요 |

| # | 단계 | 결과 | 캡처 |
|---|---|---|---|
| 1 | 1440: 공지 쓰기 → 발행 → 공유 문구 복사 | "공유 문구를 복사했어요." 클립보드 = 제목 / 빈 줄 / 본문 / 빈 줄 / `…/participate/{eventId}` | 01 |
| 2 | 390: 같은 흐름 | 같음, 가로 넘침 없음 | 02 |
| 3 | 운영진 공지·초안 상세 | 버튼 0개 | 03 |
