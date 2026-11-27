# #348 I6 이름을 누르면 같은 신청 상세 확인 기록

- 날짜: 2026-11-28 00:10~00:40 KST, 클라우드 세션
- 브랜치: `claude/nifty-darwin-m7n5g5` (`origin/main` 745ee57 위, 푸시 전)
- 실행: `backend/compose.yaml` PostgreSQL 17 + `./gradlew bootRun --args='--spring.profiles.active=local'`(V1~V30) + `VITE_API_MOCK=0 pnpm exec vite`. 준비(행사·신청 5명·조·방 공개)는 [week4-setup.cjs](../517-i5-event-menu/week4-setup.cjs)가 실제 HTTP API로 한다. 실행: `NODE_PATH=<playwright 위치> node <스크립트> .`, deviceScaleFactor 2

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | api.md: check-in-roster 항목, group-board·room-board `participants[]`에 `applicationId` | 작성 |
| 서버 통합 테스트 | `CheckInHttpIT`·`GroupHttpIT`·`RoomHttpIT`: 값이 DB의 SUBMITTED 신청 id와 같음, 키 목록 | 전체 614개 통과 |
| 화면 테스트 | `ApplicantLink.test` 5건(세 화면에서 열고 뒤로, 미배정 카드는 이름이 고르기, 참가 현황 뒤로) | 820개 통과 |
| 로컬 실제 클릭 | [i6-click.cjs](i6-click.cjs), [click-log.txt](click-log.txt) | 아래 |
| 운영 서버 확인 전 | | 사용자 확인 필요 |

| # | 단계 | 결과 | 캡처 |
|---|---|---|---|
| 1 | 현장 운영 1440: 줄을 눌러 고른 뒤 오른쪽 패널의 이름 | 같은 신청 상세, 뒤로 → 현장 운영 | 01, 02 |
| 2 | 조 편성 1440: 조원 줄 이름 | 같은 상세, 뒤로 → 조 편성 | 03 |
| 3 | 숙소 1440: 방 카드 이름 | 같은 상세, 뒤로 → 숙소 | 04 |
| 4 | 현장 운영 390: 명단 이름 | 같은 상세, 뒤로 → 현장 운영, 가로 넘침 없음 | 05, 06 |
| 5 | 주소로 연 상세 | 뒤로 → 참가 현황(예전 그대로) | — |

실제 클릭에서 찾은 것: 처음 만든 화면은 미배정 카드의 이름도 링크라서 "이름을 눌러 고른 뒤 조로 보내요"가 깨졌다(mock 시드에는 신청 id가 없어 단위 테스트가 놓쳤다). 고칠 수 있는 미배정 카드에서는 이름이 그대로 고르기이고(96c1c3e), 그 테스트를 더했다. 위 캡처는 고친 뒤다.

확인하지 못한 것: 조 편성판에서 마우스로 끌기(이름이 아닌 곳에서 시작)는 실제 브라우저로 누르지 않았다. 끌기는 링크에서 시작하지 않는 기존 규칙(`useBoardDrag`)이고 기존 단위 테스트가 통과했다.
