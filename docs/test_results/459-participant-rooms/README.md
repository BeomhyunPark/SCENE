# 참가자 숙소 화면(G4) — 실제 서버 클릭(로컬)

- 이슈: [#459](https://github.com/BeomhyunPark/SCENE/issues/459)(로드맵 G4, 상위 [#383](https://github.com/BeomhyunPark/SCENE/issues/383)), 정책 DEC-085와 Follow-up
- 날짜: 2026-11-25
- 방법: 작업 브랜치 `claude/g4-participant-rooms`(G2 서버 `claude/g2-room-server` 위)의 백엔드를 `local` 프로파일(PostgreSQL 17, Docker, JDK 25)로 띄우고 `VITE_API_MOCK=0` 개발 서버에서 Playwright로 390px 휴대폰 화면을 눌렀다. **참가자 경로는 모두 실제 서버다.** 방 만들기·배정·공개·공개 범위 변경은 운영자 API로 했다(운영자 배정판 G3 #458은 다른 세션). 스크립트: [rooms-click.mjs](rooms-click.mjs), 기록: [click-log.txt](click-log.txt)
- 신청서는 기본 질문(이름·전화·또래)만 있어 **성별 질문이 없다.** 그래서 캡처의 같은 방 사람에 성별이 없다(`gender: null`이면 빼는 동작). 성별이 있을 때의 "이름 · 또래 · 성별"은 컴포넌트 테스트(`RoomsScreen.test.tsx`)로 확인했다.

| 파일 | 확인한 것 |
|---|---|
| `01-home-not-published.png` | 공개 전 홈 숙소 카드 "숙소가 정해지면 여기에 보여요." |
| (캡처 없음) | 방 3개를 만들고 5명을 배정한 뒤(작업본) 32초 동안 카드 그대로, `GET /participant/rooms` 다시 읽기 0번 |
| `02-home-published.png` | 공개 후 화면 조작 없이 **10.9초** 뒤 카드에 "301호 / 본관 3층 계단 옆 / 박나래 · 92 / 이다온 · 93 / 전체 방 배정표". 그동안 rooms 1번만 다시 읽고 일정은 0번 |
| `03-rooms-screen-all.png` | "자세히" → `/participate/{eventId}/rooms`. 하단 탭은 다섯 개 그대로, 현재 탭 "홈". 내 방(같은 방 3명, "나"), 전체 방 배정표(301호 "내 방" 강조, 302호, 빈 303호 "아직 배정된 사람이 없어요."). 화면 글자에 전화번호·참가자 id·방 id 없음 |
| `04-home-unassigned.png` | 방이 없는 최라온: "숙소를 정하고 있어요. 방이 정해지면 여기에 보여요." + 전체 방 배정표 링크(범위 `ALL`) |
| `05-rooms-screen-roommates.png` | 범위 `ROOMMATES`: 내 방과 같은 방 사람만, 전체 방 배정표 없음 |
| `06-rooms-screen-my-room.png` | 열어 둔 숙소 화면에서 범위를 `MY_ROOM`으로 바꾸자 **28.5초** 뒤 같은 방 사람이 사라지고 방 이름·위치만 남음(`updates.rooms`) |

알림: 공개 뒤 김가람의 `GET /participant/notifications`에 `ROOM_PUBLISHED` 1건("숙소가 정해졌어요 / 301호 · 본관 3층 계단 옆", target `ROOM`). **참가자 알림 목록 화면은 아직 없어서(B5 #463) 누르기는 확인하지 못했다.** 이 화면은 숙소 화면 주소만 마련했고 알림 → 숙소 연결은 B5가 `ROOM_PUBLISHED` → `/participate/{eventId}/rooms`로 잇는다.

**30초 기준:** 로컬 서버의 갱신 주기는 기본값(25초 ±20%)이라 확인 간격이 20–30초다. 두 번 잰 값(10.9초, 28.5초) 모두 30초 안이다.

참고(이 작업 밖): 시작·끝 날짜가 없는 행사에서는 `GET /participant/schedule`이 `401`을 돌려 참가자가 입구로 돌아간다(처음 실행에서 날짜 없이 만든 행사로 겪음). 운영 행사는 날짜가 있어 영향이 없지만 별도로 확인할 거리다.

못 한 것: 운영 서버 확인, 실제 휴대폰 기기, 성별 질문이 있는 신청서로 실제 서버 확인, 알림 누르기(B5 화면 없음), 200명 규모의 전체 표 스크롤.
