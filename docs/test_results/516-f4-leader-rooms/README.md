# #516 F4 조장 화면의 조원 방 확인 기록

- 날짜: 2026-11-28 00:10~00:40 KST, 클라우드 세션
- 브랜치: `claude/nifty-darwin-m7n5g5` (`origin/main` 745ee57 위, 푸시 전)
- 실행: `backend/compose.yaml` PostgreSQL 17 + `./gradlew bootRun --args='--spring.profiles.active=local'`(V1~V30) + `VITE_API_MOCK=0 pnpm exec vite`. 준비(행사·신청 5명·조·방 공개)는 [week4-setup.cjs](../517-i5-event-menu/week4-setup.cjs)가 실제 HTTP API로 한다. 실행: `NODE_PATH=<playwright 위치> node <스크립트> .`, deviceScaleFactor 2

서버(`leaderView.members[].room`)와 화면은 #474로 이미 main에 있었다. 이번 변경은 mock과 테스트이고, 이 기록은 실제 서버로 처음 누른 것이다.

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | 없음(api.md "내 조" 그대로) | — |
| 서버 통합 테스트 | 기존 `RoomHttpIT`(공개 전 null, 공개 뒤 방, 작업본 저장은 안 바뀜) | 전체 614개 통과 |
| 화면 테스트 | `ParticipantGroup.test` 조원 목록 방 표시 1건, mock `groupStore`가 숙소 공개본을 읽음 | 820개 통과 |
| 로컬 실제 클릭 | [f4-click.cjs](f4-click.cjs), [click-log.txt](click-log.txt) | 아래 |
| 운영 서버 확인 전 | 실제 휴대폰 | 사용자 확인 필요 |

| # | 단계 | 결과 | 캡처 |
|---|---|---|---|
| 1 | 조장(김조장) 휴대폰 390 내 조 | 조원 3명 줄마다 "방 301호/302호", 가로 넘침 없음 | 01 |
| 2 | 이조원 누르기 | 상세에 "302호 · 본관 3층 끝" | 02 |
| 3 | 작업본에서 이조원을 301호로 옮김(공개 전) | 조장 응답은 302호 그대로 | — |
| 4 | 다시 공개 | 조장 목록 "방 301호" | — |
| 5 | 조원(박조원) 내 조 | 방 글자·조원 현황 없음 | — |
