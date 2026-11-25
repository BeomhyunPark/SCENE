# 내 조 조원 명단·조장 조원 현황·조원 상세·명단 공개 스위치 — 실제 서버 클릭(로컬)

- 이슈: [#453](https://github.com/BeomhyunPark/SCENE/issues/453)(로드맵 F3), 정책 DEC-083과 Follow-up
- 날짜: 2026-11-25
- 브랜치: `claude/f3-participant-group-screen`(F2 서버 `claude/f2-participant-group-roster` 위)
- 방법: 이 브랜치의 백엔드를 `local` 프로파일(PostgreSQL 17, Docker, JDK 25)로 띄우고 Vite 개발 서버(mock 끔)에서 Playwright Chromium으로 클릭. 휴대폰은 `iPhone 13` 에뮬레이션(390×664, 배율 3). **참가자·운영자 경로가 모두 실제 서버다.** 행사·신청 8명(1조 7명·2조 1명, 조장 김하늘)·조 편성·공개·체크인 3명은 실제 API로 넣었다. 기록: [click-log.txt](click-log.txt)

| 파일 | 확인한 것 |
|---|---|
| `01-leader-home-card.png` | 조장 홈의 내 조 카드에 "조원 현황 · 미도착 n명" |
| `02-leader-status-first-screen.png` | **조장이 휴대폰 첫 화면에서 미도착 조원을 본다.** 미도착 목록 y 333–469 (화면 높이 664) |
| `03-leader-status-full.png` | 조원 전체(성별·조장·나·최근 수정·도착 시각), 끼니별 인원(신청 기준) |
| `04-member-detail.png` | 조원 상세: `tel:01050001001` 전화 걸기, 서버 `display` 그대로의 신청 답, "최근 수정", 도착·참석 구간·숙박 밤. 방은 `null`이라 줄이 없다 |
| `05-other-group-404.png` | 다른 조 사람 id를 주소로 열면 "볼 수 없어요." |
| `06-leader-after-60s.png` | 화면을 둔 채 65초 뒤 내 조를 다시 읽음(요청 6→7). 첫 실행에서는 그사이 운영자 체크인이 도착 3→4로 반영됐다 |
| `07`·`08-operator-switch-*.png` | 운영자 조 편성 화면(390px)의 "조원 명단 공개" 켬·끔 |
| `09-operator-switch-409.png` | 다른 운영자가 먼저 바꾼 뒤 누르면 저장하지 않고 다시 읽음(서버 `409 CONCURRENT_MODIFICATION`) |
| `10-member-roster-off.png` | 스위치 끔: 일반 조원은 조 이름·조장 이름만 |
| `11-member-roster-on.png` | 스위치 켬 + 새로 고침: 일반 조원 명단(또래 이름·성별·조장·나), 누를 수 있는 항목 0개. 조원이 조장 상세 주소를 직접 부르면 `404` |

실제 클릭에서 찾아 고친 것(커밋 199a67a): 홈에서 들어오면 스크롤이 남아 미도착이 첫 화면 밖이던 것, 개발 모드에서 조원 상세가 한 번 열 때 두 번 읽히던 것(열람 기록 두 줄).

못 한 것:
- "오늘 오는 사람·가는 사람"은 실제 서버로 보지 못했다. "오늘"은 서버 시각(2026-11-25)을 따르는데 행사(2027-01-22~24) 밖이라 이 칸이 숨는다. 계산은 단위 테스트(`groupStatusView.test.ts`)로만 확인했다.
- 운영 서버 확인, 실제 휴대폰 기기, 방(G2 전이라 늘 `null`), 운영자가 고친 값 표시(A12 전이라 늘 `false`).
- `privacy_logs` 행 수를 DB에서 직접 세지 않았다(요청 수로만 확인).
