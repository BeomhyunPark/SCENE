# 식수 현황 확인 기록 (#454, DEC-087)

- 날짜: 2026-11-24, 클라우드 세션
- 브랜치: `claude/e3-meal-counts`

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | DEC-087, api.md "식수 현황", source-guide, 로드맵 5.1 E3 줄 | 작성. 결정 대기 6개는 사용자 확인 필요 |
| 서버 검증 | `./gradlew check` (Testcontainers PostgreSQL 17). 새 `MealTallyTest`(시각 경계 6개), `ArrivalSlotsTest`(4개), `MealCountHttpIT`(4개: 예정 = 신청 집계, 체크인·체크인 취소·A4 수정·A7 취소 반영, 일정표 시각, 지난 행사, 설정 없음, 다른 공간 404) | 통과, 실패 0 |
| 화면 검증 | `pnpm lint`·`typecheck`·`test`·`build`. 새 `EventMeals.test.tsx`(7개), `mealCountText.test.ts`(2개) | 통과 |
| 저장된 프로토타입 연결 검증 | mock 핸들러(`mocks/handlers/mealCounts.ts`)는 컴포넌트 테스트로만 확인했다. `VITE_API_MOCK=1` 화면은 열지 않았다 | 화면 테스트 통과 |
| 실제 클릭 | 로컬 서버(local 프로필, PostgreSQL 17, 새 DB) + Vite(실제 API). `seed.py`로 행사 기간을 어제~내일로 두고 신청서(RANGE)·일정 아침 항목(07:30)·신청 12명·도착 6명을 HTTP API로 만들었다. Playwright `meals-click.cjs`(iPhone 13) | 아래 단계 모두 통과. 기록은 `click-log.txt`, 서버 응답은 `server-response.json` |
| 운영 서버 | 하지 않았다 | 사용자 확인 필요 |

## 단계

1. `1-field-link` 현장 운영 위의 "식수 현황 보기" 링크
2. `2-meals-next`·`3-meals-full` 링크를 눌러 `/events/{id}/meals`. 다음 끼니(셋째 날 아침, 기본 시각) 도착 반영 6명 = 도착 5 + 올 예정 1(셋째 날 아침에 오는 부분 참석), 아직 안 옴 4(전체 참석 3 + 둘째 날 점심에 왔어야 하는 부분 참석 1). 지난 끼니는 "지남", 일정표 항목이 있는 둘째 날 아침은 07:30. 손으로 센 숫자와 같다
3. `4-copied` "다음 끼니 복사" → 클립보드 `[Local event] 식수 (11/24 23:24 기준)` + `11월 25일 (수) 아침 6명 (신청 10명, 아직 안 온 4명 제외)`. "남은 끼니 복사"는 점심 줄까지
4. `5-after-checkin` 다른 접수대처럼 API로 두 명 체크인(올 예정 1명, 아직 안 온 1명) → 화면이 9.2초 뒤 스스로 다시 읽어 6명 → 7명, "예정 10 · 도착 7 · 올 예정 0 · 아직 안 옴 3"
5. `6-how` "숫자는 이렇게 나와요" 펼침

`3-meals-full`은 전체 페이지 캡처라 고정된 아래 메뉴가 중간에 찍혔다(화면 문제 아님).

## 하지 못한 것

- 운영 서버와 실제 휴대폰 확인, 실제 주방 연락처(카카오톡 등)에 붙여 넣기
- 클립보드가 막힌 브라우저의 "길게 눌러 복사" 대체 화면은 컴포넌트 테스트로만 확인했다
