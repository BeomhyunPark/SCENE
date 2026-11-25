# 준비 업무 월 달력 (#475) 확인 기록

2026-11-25. 사용자 요청 "월 달력은 운영진들이 해야 할 일 할 때 써야 하니 만들어 달라". 결정: 날짜는 **시작일~마감일 기간**, 달력에는 **업무 + 행사 기간**(DEC-087).

## 화면 (목업 서버, 2027-01-05 Asia/Seoul 고정, 행사 1/22–1/24)

`task-month-shots.mjs`가 `window.sceneMock`에 업무 10건을 심고 찍는다.

| 파일 | 확인 |
|---|---|
| `desktop-month.png` (1440) | 6주 격자. 숙소 방 배정(1/11–15)·차량 배차표(1/14–19)는 한 주 안에서 같은 줄로 이어진 막대, 다음 주(1/17)에 이름을 다시 씀. 1/3 장소 계약금(마감 지남, 열림)은 위험 색, 1/2 안내 영상(완료)은 흐리게 줄긋기. 오늘(5일) 동그라미, 1/22–24 행사 기간 칸 색. 1/21은 세 줄 + "+1개". 날짜 없는 업무는 달력 아래 |
| `desktop-month-drag.png` → `desktop-month-picked.png` | 18일에서 20일로 끌면 칸이 표시되고, 놓으면 만들기 칸에 시작일 1/18·마감일 1/20이 채워짐 |
| `phone-month.png` (390) | 월 격자 대신 날짜별 목록(업무가 있는 날, 오늘, 행사 기간), 날마다 "+ 업무" |

참고 디자인: Venture Calendar Monthly(`2yztLB533ohOebuAKuwZr0` 853:86993) 구조를 SCENE 토큰으로, SCENE DS 43. PATTERNS — CALENDAR(`ZFajaGIQ3VneNqkncKYXbJ` 65:25)의 "월 격자는 휴대폰에 줄이지 않음", "색은 상태만" 규칙.

## 검증

- 프런트: `pnpm typecheck`·`pnpm lint` 통과, `pnpm test` 통과(새 테스트: `taskMonth.test.ts` 날짜 계산·주 줄 배정, `EventTasks.test.tsx` 기간 업무 만들기·월 격자 표시·날짜 눌러 기간 채우기·휴대폰 목록·검증).
- 서버: Docker가 없어 Testcontainers 대신 로컬 PostgreSQL **16**을 띄우고 테스트 DB 설정만 잠시 바꿔 실행(커밋하지 않음). 업무 테스트 `TaskCommandHttpIT`(16, 새 4건 포함)·`TaskProgressHttpIT`(13)·`LifecycleAndTaskIT`(58) **87개 통과**. 전체 546개 중 34개 실패는 Docker를 직접 쓰는 테스트와, DB 하나를 여러 설정이 같이 써서 생긴 Flyway 검증 실패로 이번 변경과 무관하다(원래는 컨텍스트마다 새 컨테이너). CI(PostgreSQL 17 컨테이너)에서 다시 확인이 필요하다.
- 못 한 것: 실서버(`VITE_API_MOCK=0`)로 화면 확인, 실제 휴대폰 손 확인.
