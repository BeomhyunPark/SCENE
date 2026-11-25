# 3주차 통합 브랜치 확인 기록

- 날짜: 2026-11-25 10:30~10:45 KST, 클라우드 세션
- 브랜치: `claude/week3-integration` (최신 `origin/main` a62d048 위에 F2 → F3 → G2 → G3 → G4 → G5 → E3 → E4를 merge 커밋으로 합침)
- 이슈: #452 #453 #457 #458 #459 #460 #461 #454 #456 (상위 #230)

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | 충돌 해결: 로드맵 5.1 표·상태 줄, DEC-085 Follow-up(G3·A11, G4, G5 모두 유지), api.md "숙소" 머리말·"다음 작업이 더하는 것"·시험 조건 | 작성 |
| 서버 검증 | `./gradlew check` (JDK 25, Testcontainers PostgreSQL 17). `ApplicationContextIT`의 Flyway 버전 `26` 확인 | 통과 593개, 실패 0, 건너뜀 0 |
| 화면 검증 | `pnpm lint`·`typecheck`·`test`·`build` | lint·typecheck 통과, 테스트 97파일 728개 통과, build 통과 |
| 저장된 프로토타입(mock) | 병합 뒤 `EventRooms.test` 1건 실패 → 참가자 설정 mock을 하나로 합쳐 고침(커밋 d7c9610) | 고친 뒤 통과 |
| 실제 클릭 | 로컬 서버(`local` 프로필, 빈 DB에서 V1~V26 한 번에 적용) + Vite(`VITE_API_MOCK=0`). [flow.cjs](flow.cjs), 기록 [click-log.txt](click-log.txt) | 아래 단계 모두 통과 |
| 운영 서버 | 하지 않았다 | 사용자 확인 필요 |

## 한 흐름

행사는 어제~내일(오늘이 둘째 날)로 만들고, 신청서는 성별·참석 범위(RANGE)·집회만 참석을 켰다.

| # | 단계 | 방법 | 결과 | 캡처 |
|---|---|---|---|---|
| 1 | 신청 8명 | 참가자 API(사람마다 브라우저 컨텍스트) | 전체 참석 5, 오늘 저녁 도착 1(박서준), 오늘 아침 도착 1(윤새벽), 집회만 1(정집회) | — |
| 2 | 조 편성·공개 | 운영자 API | 1조 4명(조장 김하늘)·2조 4명(조장 최예린), `PUBLISHED` | — |
| 3 | 방 만들기·배정·공개 | **운영자 숙소 화면(1440px)** | 301호(남)·302호(여) 만들기, 조 단위 넣기에서 "숙박하지 않는 1명은 빼고 넣어요."(정집회), 공개 → 301호 3명·302호 4명 | 01, 02 |
| 4 | 참가자 홈 | 김하늘 휴대폰(390px) | 내 조 카드 "1조 · 조장 김하늘 · 조원 현황 · 미도착 4명", 숙소 카드 "301호 / 본관 3층 왼쪽 · 남성 방 / 박서준·이도윤 / 전체 방 배정표" | 03 |
| 5 | 내 조 명단·숙소 화면 | 이도윤 휴대폰 | 같은 조 4명(조장·나 표시), 숙소 화면에 내 방 3명·전체 방 배정표 2개 | 04, 05 |
| 6 | 조장 조원 현황 | 김하늘 휴대폰 | 조원마다 "미도착 / 방 301호", 정집회는 방 줄 없음(F3의 값 있을 때만 + G2 공개본). 오늘 오는 사람 "박서준 · 저녁부터" | 06 |
| 7 | 조원 상세 | 김하늘이 `/group/members/{이도윤}`을 주소로 엶 | "방 301호 · 본관 3층 왼쪽", 연락처 열람 안내 | 07 |
| 8 | 체크인 | 현장 운영(390px) 김하늘 체크인 | 알림 "94 김하늘 님을 체크인했어요. 방: 301호 · 본관 3층 왼쪽" | 08 |
| 9 | 현장 명단 | 같은 화면 | 한 줄에 방(G5)과 도착 예정(E4)이 함께: 박서준 "방 301호 · 본관 3층 왼쪽 / 2일차 저녁 도착 예정 · 올 예정", 윤새벽 "… 왔어야 함", 정집회 "숙박 안 함 / … 참석 칸 지남". **줄 폭 358px, 문서·줄 가로 넘침 0** | 09, 10-* |
| 10 | 식수 현황 | 같은 휴대폰 | 다음 끼니 "11월 25일 (수) 점심", 예정 6 · 도착 1 · 아직 안 옴 5 | 11 |

## 하지 못한 것

- 조 편성과 신청은 화면이 아니라 API로 했다(조 편성 화면은 2주차에 main에서 확인됨).
- 조장 조원 현황에서 조원을 눌러 상세로 가는 것은 링크를 찾지 못해 주소로 직접 열었다. → 아래 "조원 상세 다시 확인"에서 눌러서 확인했다.
- QR 체크인(카메라 없음), 운영 서버, 실제 휴대폰.
- `ROOM_PUBLISHED` 알림 → 숙소 화면 연결은 B5 몫이라 확인하지 않았다.

## 범위 밖 버그 후보 재현 (고치지 않음)

[schedule401.cjs](schedule401.cjs): 시작·끝 날짜 없이 만든 행사에 신청하면 `GET /participant/home` 200, `GET /participant/schedule` **401 AUTHENTICATION_REQUIRED**. 통합 브랜치에서 재현된다.

원인 위치: `backend/src/main/resources/mapper/ScheduleMapper.xml`의 참가자 읽기(`SELECT e.start_date, e.end_date, latest.published_at, latest.snapshot … LEFT JOIN LATERAL`)는 날짜가 없고 공개본도 없으면 모든 칸이 NULL인 행을 돌려준다. MyBatis는 모든 칸이 NULL인 행을 `null`로 매핑하므로(`returnInstanceForEmptyRow` 기본 false), `ScheduleService.participant`(`event/schedule/ScheduleService.java` 697행 근처)의 `row == null → AUTHENTICATION_REQUIRED`로 빠져 참가자가 로그인 화면으로 돌아간다. 일정을 하나라도 공개했거나 날짜가 있으면 생기지 않는다.

## 조원 상세 다시 확인 (2026-11-25, #453)

- 방법: 로컬 서버(`local` 프로필) + Vite(`VITE_API_MOCK=0`), 휴대폰 390px 터치. [member-click.cjs](member-detail/member-click.cjs), 기록 [click-log.txt](member-detail/click-log.txt)
- 결과: **병합으로 깨지지 않았다.** 조장 홈 내 조 카드의 "조원 현황"을 누른 뒤, "미도착 N명"·"조원 N명" 목록의 **조원 줄 전체**가 링크다(줄 높이 44px, 오른쪽 끝 `›`). "95 이도윤"을 누르면 `/group/members/{id}`로 가서 전화번호·신청 답이 보이고, 뒤로 가기로 조원 현황에 돌아온다.
- 조원(이도윤) 내 조 화면에는 링크가 하나도 없고, 조원 상세 API를 직접 부르면 404다(DEC-083).
- 앞선 확인에서 못 찾은 이유: 그 흐름은 상세를 주소로 바로 열도록 짜여 있었고, 누를 수 있다는 표시는 오른쪽 끝의 옅은 `›` 하나뿐이다. 표시는 이미 있어 모양은 바꾸지 않았다. 컴포넌트 테스트는 `ParticipantGroup.test.tsx`가 미도착 줄을 눌러 상세를 여는 것까지 이미 확인한다.

| 캡처 | 내용 |
|---|---|
| [01](member-detail/01-leader-status-before-tap.png) | 조장 조원 현황: 줄마다 `›` |
| [02](member-detail/02-leader-member-detail-after-tap.png) | 이도윤을 누른 뒤 조원 상세 |
| [03](member-detail/03-member-group-no-links.png) | 일반 조원 화면: 누를 수 있는 조원 항목 없음 |
