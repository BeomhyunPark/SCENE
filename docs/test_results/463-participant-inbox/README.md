# 참가자 알림함(B5) — 실제 서버 클릭(로컬)

- 이슈: [#463](https://github.com/BeomhyunPark/SCENE/issues/463)(로드맵 B5, 상위 [#379](https://github.com/BeomhyunPark/SCENE/issues/379)), 정책 DEC-080과 Follow-up(2026-11-25, #463)
- 날짜: 2026-11-25
- 방법: 작업 브랜치 `claude/b5-participant-inbox-463`(통합 브랜치 `claude/week3-integration` 위)의 백엔드를 `local` 프로파일(PostgreSQL 17, Docker, JDK 25)로 띄우고 `VITE_API_MOCK=0` 개발 서버에서 Playwright로 390px 휴대폰 화면을 눌렀다. **참가자 경로는 모두 실제 서버다.** 공지 발행·일정 공개·조 공개·숙소 공개와 조장·운영진 공지는 운영자 API로 일으켰다. 참가자 휴대폰은 알림함을 열어 둔 채 자기 `updates` 확인만 기다렸다(화면 조작 없음). 스크립트: [inbox-click.mjs](inbox-click.mjs), 기록: [click-log.txt](click-log.txt)

| 파일 | 확인한 것 |
|---|---|
| `01-home-bell.png` | 홈 머리글 오른쪽에 종(읽지 않은 알림 없음, 배지 없음). 하단 탭 다섯 개 그대로(홈·일정·공지·내 조·내 정보) |
| `02-inbox-empty.png` | 종 → `/participate/{eventId}/inbox` "아직 받은 알림이 없어요…" |
| `03-notice-a-row.png` → `03-notice-b-landing.png` | 공지 발행 뒤 **21.4초**에 "새 공지 / 첫날 집합 장소 안내" 한 줄, 종 1 → 누르면 공지 상세(현재 탭 "공지"), 종 배지 사라짐 |
| `04-schedule-a-row.png` → `04-schedule-b-landing.png` | 일정 공개(저장하고 바로 공개) 뒤 **26.0초**에 "일정표가 올라왔어요", 종 1 → 일정 탭, 종 0 |
| `05-group-a-row.png` → `05-group-b-landing.png` | 조 공개 뒤 **22.0초**에 "내 조가 정해졌어요 / 1조", 종 1 → 내 조 탭, 종 0 |
| `06-rooms-a-row.png` → `06-rooms-b-landing.png` | 숙소 공개 뒤 **26.5초**에 "숙소가 정해졌어요 / 301호 · 본관 3층 계단 옆", 종 1 → `/participate/{eventId}/rooms`(현재 탭 "홈"), 종 0 |
| `07-inbox-all-read.png` | 조장 공지·운영진 공지 발행 뒤 32초: 조원 김가람의 알림함은 네 줄 그대로, "조장 모임"·"운영진 집합" 없음 |

각 공개마다 알림 목록(`GET /participant/notifications`)은 한 번만 다시 읽었다(`updates`가 바뀔 때만, 새 폴링 없음).

**대상 필터(API로 확인):** 조원 김가람 4건(숙소·조·일정·전체 공지), 조장 박나래 5건(+조장 공지). 운영진 공지는 둘 다 없음. 같은 내용을 통합 테스트 `ParticipantInboxHttpIT`로도 확인했다.

**30초 기준:** 로컬 서버의 갱신 주기는 기본값(25초 ±20%)이라 확인 간격이 20–30초다. 네 번 모두 30초 안이다(21.4–26.5초).

**구분:** 문서 작성(DEC-080 Follow-up, api.md) / 서버 검증(`./gradlew check`, 통합 테스트 595개 통과) / 저장된 프로토타입(mock) 연결 검증(컴포넌트 테스트 `InboxScreen.test.tsx`·`inboxRoutes.test.ts`) / 실제 클릭(이 문서, 로컬 서버).

못 한 것: 운영 서버 확인, 실제 휴대폰 기기, 운영자가 내 신청을 고친 알림(`APPLICATION_UPDATED_BY_OPERATOR`, 서버는 A12 #462 몫이라 컴포넌트 테스트로만 "내 정보"로 가는 것을 확인), 일정 두 번째 공개(`SCHEDULE_CHANGED`, 서버는 기존 `ScheduleHttpIT`)와 조 다시 공개(바뀐 사람만, `ParticipantInboxHttpIT`)의 화면 클릭, 알림 30건을 넘는 "더 보기".
