# 참가 현황 스프레드시트 (#507 · #508 · #509, DEC-091) 확인 기록

> 작업 중에는 DEC-090으로 불렀다. main 병합 때 DEC-091로 바꿨다(PRODUCT_DECISIONS.md DEC-091 맨 위 메모).

## 저장된 프로토타입(mock) 캡처 — 2026-11-26, 병합 전

`sheet-shots.mjs`(VITE_API_MOCK=1, 40명): `1-full-width.png`, `2-editing.png`, `3-operator-rows-formulas.png`, `4-column-menu.png`. 운영 열 추가·이름 바꾸기, 회비 입력, 운영 줄 `=SUM(H:H)`·`COUNTBLANK`, 굵게·채우기, 조건부 서식, 함수 자동완성, 열 메뉴.

## main 병합 뒤 — 2026-11-26

브랜치 `claude/sleepy-pascal-5pl2wd`에 `origin/main`(`09393a8`: #506 식사·집회 자동 연동, #510 현장 운영 상태 말)을 merge 커밋으로 합쳤다. 마이그레이션 `V29__roster_sheets.sql` → `V30__roster_sheets.sql`, 결정 DEC-090 → DEC-091.

| 구분 | 무엇 | 결과 |
|---|---|---|
| 서버 검사 | `./gradlew check` (JDK 25 Temurin, Testcontainers PostgreSQL 17). 빈 DB에서 V1~V30, `ApplicationContextIT` 기대 버전 30, `RosterSheetHttpIT` 포함 | 통과 613개, 실패 0, 건너뜀 0 |
| 화면 검사 | `pnpm lint`·`typecheck`·`test`·`build` | 모두 통과, 테스트 106파일 809개 |
| 마이그레이션 경로 | 빈 PostgreSQL 17에 **main(`09393a8`) 서버**를 띄워 V1~V29 + 시드, 행사 하나(식사·집회 칸 7개 자동 채움)를 넣고 멈춤 → **이 브랜치 서버**를 같은 DB로 기동 | "Successfully validated 31 migrations", "Successfully applied 1 migration", `flyway_schema_history` 30 `roster sheets` 성공, `event_roster_sheets` 생성 |
| 실제 클릭 | 로컬 서버(`local` 프로필, 위 DB) + Vite(`VITE_API_MOCK=0`), Playwright Chromium. [merge-click.cjs](merge-click.cjs), 기록 [merge-click-log.txt](merge-click-log.txt) | 아래 단계 모두 통과, 콘솔 오류 없음 |
| 운영 서버 | 하지 않았다 | 사용자 확인 필요 |

두 마이그레이션은 서로 다른 테이블만 다룬다: V29는 `schedule_items`(열 추가)·`schedule_slot_dismissals`·`schedule_boards`, V30은 새 `event_roster_sheets`.

### 한 흐름 (실제 API)

| # | 단계 | 결과 | 캡처 |
|---|---|---|---|
| 1 | API로 행사·신청서 설정(성별, RANGE 참석, 식사), 신청 9명 + 운영자 직접 추가 1명(임현장, 집회만), 방 301호·401호 배정·공개, 이나래 또래를 운영자 대리 수정(`PUT …/answers`) | 표 10행, 방 열 9명 | — |
| 2 | 참가 현황 1440 | 시트 전체 폭, 방 열(301호·401호), "수정됨 1"·"직접 추가" 표시, 가로 넘침 없음(1440/1440) | m1-merged-1440 |
| 3 | "+ 열 보기"로 성별 열 켬 → 최하늘 성별 칸 Enter → "남성" 입력 → Enter | 저장은 A12와 같은 `PUT …/applications/{id}/answers`(`expectedRevision`), 표 revision 2·`OPERATOR`, "수정됨 2" | m1b-column-panel-1440, m2-editing-1440, m3-after-save-1440 |
| 4 | 운영 시트 문서(`GET …/roster-sheet`) | 최하늘의 답이 시트 문서에 따로 저장되지 않음(값은 신청 한 곳) | — |
| 5 | 신청 상세 | 성별 "남성", 변경 이력 "운영자 Local owner가 고침 · 바뀐 질문: 성별" | m4-detail-1440 |
| 6 | 신청 집계 | 성별 남 6 → 7, 여 4 → 3 (화면: 여성 3·남성 7) | m5-summary-1440 |
| 7 | 참가 현황 390 | 가로 넘침 없음(390/390), 툴바가 세 줄로 접힘 | m6-merged-390 |

### 알게 된 점 (고치지 않음, 결정 필요)

- (Follow-up 1에서 고침) **답 칸을 고치면 그 사람이 표 맨 아래로 간다.** A12의 운영자 대리 수정은 새 신청 행(revision 2)을 만들고 그 `submitted_at`이 고친 시각이다. 표는 `submitted_at` 순이라 고친 사람이 맨 아래로 가고, 그 뒤 사람들의 행 번호가 하나씩 당겨진다(m3: 이나래·최하늘이 7행 밑). DEC-091 §5는 "행 번호는 제출 순서로 고정"이라 적었다. 수식은 행 키(`p:<participantId>`)로 저장해 계산은 맞지만, 화면의 행 번호·A1 주소가 바뀐다. 병합 전 브랜치(A12가 이미 base에 있음)에서도 같다. 처음 제출 시각 순으로 둘지 정해야 한다.
- (Follow-up 3에서 맞춤) 참가 현황의 "도착 완료 / 도착 전"(칩·현재 상태)은 main의 표 문구 그대로다. #510은 현장 운영 화면만 "도착 / 미도착 / 도착 예정"으로 바꿨다. 이 브랜치 화면에 "끼니"·"체크인 완료/미완료"는 없다. 도움말 예시 `=COUNTIF(D:D,"도착 완료")`는 표 문구를 따른다.
- (Follow-up에서 채움) `backend/docs/api.md`·`source-guide.md`에 roster-sheet 계약·코드 위치가 없다(병합 전부터).

## DEC-091 Follow-up 뒤 — 2026-11-26

사용자 결정 1·2·3(처음 제출 순서 고정, 겹치는 버튼·패널 빼기, 현장 운영과 같은 상태 말) 반영 뒤.

| 구분 | 무엇 | 결과 |
|---|---|---|
| 서버 검사 | `./gradlew check` (JDK 25, Testcontainers PostgreSQL 17). 새 `OperatorApplicationEditHttpIT.tableAndCsvKeepEachPersonWhereTheyFirstApplied`(옛 쿼리에서는 실패 확인), `MealCountHttpIT`에 표의 `arrival` = 명단 항목 | 통과 614개, 실패 0, 건너뜀 0 |
| 화면 검사 | `pnpm lint`·`typecheck`·`test`·`build` | 모두 통과, 106파일 811개 |
| 실제 클릭 | 빈 PostgreSQL 17에서 V1~V30 + Vite(`VITE_API_MOCK=0`). [followup-click.cjs](followup-click.cjs), 기록 [followup-click-log.txt](followup-click-log.txt) | 모두 통과, 콘솔 오류 없음 |

| # | 단계 | 결과 | 캡처 |
|---|---|---|---|
| 1 | 같은 준비 + 김가람 도착 체크인, 1440 | 상단 정렬·필터·"+ 열 보기", 도움말, 작업 열 없음. 칩 "전체 참가자 10 · 미도착 1 · 도착 예정 8 · 도착 1 · 미배정 10 · 수정됨 1". "도착 완료"·"도착 전" 없음 | n1-sheet-1440 |
| 2 | 현재 상태 열 메뉴 → 숨긴 열 보이기 (10) → 성별 | 성별이 현재 상태 오른쪽에 | n2-hidden-columns-menu-1440 |
| 3 | 4행 최하늘 성별 여성 → 남성 | revision 2·OPERATOR, **여전히 4행**, 열 순서·CSV 순서도 처음 제출 순 | n3-same-row-after-edit-1440 |
| 4 | 성별 열 메뉴 → 오름차순 → 정렬 해제 | ▲ 뒤 해제, 처음 제출 순으로 돌아옴 | n4-column-menu-1440 |
| 5 | 성별 열 메뉴 → 필터 → 여성 | 3명, 머리글 깔때기. 패널 닫기 → 열 메뉴 "필터 해제" → 10명, 표시 없음 | n5-filter-1440 |
| 6 | 방 열 숨기기 → 조 배정 열 메뉴 → 숨긴 열 보이기 → 방 | 방 열이 숨었다 다시 보임 | n6-after-menu-roundtrip-1440 |
| 7 | 390 | 가로 넘침 없음(390/390), 머리글 ▾가 보임(hover 없는 기기) | n7-sheet-390, n7b-sheet-grid-390 |
| 8 | 390에서 이름(김가람)을 누름 | 신청 상세로 감 | n8-detail-from-name-390 |

- 미도착 1은 직접 추가한 임현장이다. 참석 칸 답이 없어 서버 `arrival`이 `UNKNOWN`이고, 현장 운영과 같은 규칙으로 "미도착"이다.
- 날짜가 미래인 행사라 체크인하지 않은 신청자는 서버가 `COMING`으로 보아 "도착 예정"이다.

## 다시 돌리기

```bash
docker run -d --name scene-pg -e POSTGRES_DB=scene -e POSTGRES_USER=scene -e POSTGRES_PASSWORD=scene -p 5432:5432 postgres:17
(cd backend && ./gradlew bootRun --args='--spring.profiles.active=local') &
(cd frontend && VITE_API_MOCK=0 pnpm dev --port 5173) &
node docs/test_results/509-roster-sheet/merge-click.cjs docs/test_results/509-roster-sheet
node docs/test_results/509-roster-sheet/followup-click.cjs docs/test_results/509-roster-sheet
```
