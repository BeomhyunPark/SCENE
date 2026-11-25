# #484 눌리는 요소의 반응 표시

브랜치 `fix/pressable-states` · 2026-11-25 · 목업 서버(`VITE_API_MOCK=1 pnpm dev`)에서 Playwright로 확인

## 검증 구분

| 구분 | 결과 |
| --- | --- |
| 문서·조사 | TSX 59개, CSS 64개 전수 조사(아래 조사표) |
| 목업 화면 실측 | `shots.mjs`: 1440 기본·hover·키보드 포커스, 390 기본. 계산된 cursor·배경·테두리·outline을 `before-report.json`·`after-report.json`에 남김 |
| 실제 클릭(오너) | **남음**: 오너가 실제 화면에서 마우스·키보드로 확인 |
| 서버 검증 | 해당 없음(스타일만 바뀜) |
| 자동 검사 | `pnpm typecheck` 통과, `pnpm lint` 통과, `pnpm test` 103개 파일 770개 통과 |

## 따른 기준

- SCENE DS v0.1 `ZFajaGIQ3VneNqkncKYXbJ` 33:33 **Operational List Item**: 테두리 카드 + 오른쪽 꺾쇠(›). Selected는 옅은 바탕 + 진한 테두리.
- Venture DS `2yztLB533ohOebuAKuwZr0` 1342:80963 **카드 Hovered**(같은 테두리에 옅은 바탕), 724:19152 **Menu Item** hover(행 전체 옅은 바탕).
- 제품 UI `RreFdEVMiwgHrV7teaCEOm` 264:25382 P02-01 행사 목록: 빈 상태 화면만 있어 행 상태는 위 두 DS를 따름.
- fe-handoff §2: `bg/hover-row`·`border/hover-row`(Row hover), 칩 hover, `focus/ring` 2px·2px 띄움.

## 공용 규칙 `frontend/src/styles/pressable.css`

| 클래스 | 쓰는 곳 | hover (마우스 기기만) | 눌림 |
| --- | --- | --- | --- |
| `scene-press` | 모든 눌리는 요소 | — | — · cursor pointer · `:focus-visible` 링 · 비활성은 not-allowed |
| `--card` | 테두리 카드·행 | 바탕 `bg/subtle` + 테두리 `border/hover-row` | `bg/brand-subtle` |
| `--row` | 목록 안 테두리 없는 행 | `bg/hover-row` | `bg/subtle` |
| `--quiet` | 탭·아이콘 버튼 | `bg/subtle` | `bg/brand-subtle` |
| `--chip` | 칩·세그먼트 | 칩 hover 토큰 | `bg/subtle` |
| `--text` | 글자 링크·글자 버튼 | 밑줄 | `accent-pressed` |
| `--inset` / `--keep-border` | 링을 안쪽에 / 테두리 색 유지(중요 공지) | | |
| `scene-chevron` (`--end`) | 다른 화면으로 들어가는 행 | 진해지고 2px 오른쪽으로 | |

- 카드는 canvas(#F4F7F8) 위에 있어 `bg/hover-row`(#F4F7F8)를 깔면 바탕과 같아져 오히려 사라져 보였다. 그래서 카드 hover 바탕은 한 단계 진한 `bg/subtle`.
- 선택·현재 상태(`aria-current`, `aria-selected`, `aria-pressed`, 체크된 칩)에는 hover를 덮어쓰지 않는다.
- 클래스 없이 적용되는 공용 규칙: 체크박스·라디오를 감싼 `label`, `summary`에 손가락 커서(`summary`는 포커스 링·hover 밑줄도).

## 측정 (전 → 후, 1440)

| 화면 | 요소 | 전 | 후 |
| --- | --- | --- | --- |
| 행사 목록 | 행사 행 | cursor default, hover 변화 없음, 포커스 브라우저 기본 링 | pointer, hover 바탕 #EDF2F3·테두리 #B9C6C9, 포커스 #2F6FEB 실선, 꺾쇠 › |
| 준비 업무 | 업무 행 | cursor default, hover 변화 없음 | pointer, 같은 카드 hover, 꺾쇠 › |
| 공지 | 공지 행(중요) | hover 변화 없음 | 바탕 #EDF2F3, 빨간 테두리 유지 |
| 공지 | 상태 칩 | hover 변화 없음 | 칩 hover 바탕·글자색 |
| 행사 홈 | 업무 행 | 바탕 #F4F7F8(canvas와 같음) | #488 뒤 구분선 행: 바탕 #F4F7F8(흰 바탕 위), 눌림·포커스 추가 |
| 참가자 | 참가 방법 카드 | hover 변화 없음, 동작 없는 카드도 pointer | 동작 있는 카드만 hover·pointer |
| 390 | 행사 목록·업무 | — | 가로 넘침 없음, 꺾쇠 포함 한 줄 유지 |

스크린샷: `before-*` / `after-*` (01 행사 목록 default·hover·focus, 02 업무 default·hover·focus, 03 공지, 04 공지 칩, 05 행사 홈 업무, 06 참가 방법 카드, 10·11 390).

## 조사표 (요약, HEAD b48379c 기준) 와 조치

✓ 있음 · ✗ 없음 · ⓐ 링크라 브라우저 기본 pointer · △ 일부. `:active`는 공용 Button과 공개 홈·로그인 버튼 두 곳 말고는 모두 없었다.

### 운영자

| 요소 | 파일 | hover | focus | cursor | 조치 |
| --- | --- | --- | --- | --- | --- |
| 행사 목록 행 | EventList.tsx:157, 268 | ✗ | ✗ | ✗ | `--card` + 꺾쇠 |
| 업무 목록 행 | EventTasks.tsx:214, 246 | ✗ | ✗ | ✗ | `--card` + 꺾쇠 |
| 행사 홈 업무 행 | EventHome.tsx:308 | △(canvas와 같은 색) | ✓ | ⓐ | `--card` |
| 행사 홈 다가오는 일정 | EventHome.tsx:364 | △(제목 밑줄) | ✓ | ⓐ | `--row` |
| 행사 홈 모듈·요약 카드 | EventHome.tsx:133, 161 | ✓(테두리만) | ✓ | ⓐ | 그대로(이미 꺾쇠·hover) |
| 참가 방법 카드 | EventParticipation.tsx:269 | ✗ | ✓ | ✓(동작 없는 카드 포함) | 동작 있는 카드만 `--card`, 나머지 pointer 제거 |
| 공지 행 | notices/EventNotices.tsx:171 | ✗ | ✗ | ⓐ | `--card`(중요는 `--keep-border`) |
| 공지 상태 칩 | notices/EventNotices.tsx:103 | ✗ | ✗ | ✓ | `--chip` |
| 공지 작성 대상 칩 | notices/NoticeEditor.tsx:273 | ✗ | △ | ✓ | `--chip` |
| 운영진 공지 행·모두 보기 | notices/StaffNoticesCard.tsx:22, 33 | ✓/✗ | ✗ | ⓐ | `--card` / `--text` |
| 알림 행 | EventNotifications.tsx:148, 156 | ✓ | ✓(브랜드색 링) | ✓ | `--row --inset`, 화면 전용 hover·링 규칙 지움 |
| 일정 일차 탭 | EventSchedule.tsx:288 | ✗ | ✓ | ✓ | `--quiet` |
| 일정 행 | EventSchedule.tsx:349 | ✓ | ✓ | ⓐ | `--row`(눌림 추가) |
| 일정 편집 세그먼트 | EventScheduleItem.tsx:404, 486 | ✗ | ✓ | ✓ | `--chip` |
| 사이드바 접기 | OperatorShell.tsx:110 | ✗ | ✓ | ✓ | `--quiet` |
| 하단 탭 | OperatorBottomNav.tsx:26, 42 | ✗ | ✓ | ✓ | `--quiet --inset` |
| 현장 보기 전환·필터 칩 | EventField.tsx:331, 432 | ✗ | ✓ | ✓ | `--quiet` / `--chip` |
| 현장 명단 행·조 머리 | FieldRosterRow.tsx:72, FieldGroups.tsx:63 | ✗ | ✓ | ✓ | `--row --inset` |
| 늦은 도착 보기 | EventField.tsx:663 | ✗ | ✓ | ✓ | `--text` |
| 신청자 표 명단/세기 탭 | applicantTable/ApplicantTable.tsx:295 | ✗ | ✓ | ✓ | `--quiet` |
| 신청자 표 글자 버튼 | applicantTable/ApplicantTable.tsx (roster__link 7곳) | ✗ | ✓ | ✓ | `--text` |
| 신청자 표 상세 링크 | applicantTable/SheetGrid.tsx:467 | ✗ | ✓ | ⓐ | `--text` |
| 운영 정보 드로어 닫기 ‹ | OperationDrawer.tsx:221 | ✗ | ✗ | ✓ | `--quiet` |
| 뒤로 ← 링크 18곳 | EventHome·EventTasks 등 (`event-home__back`) | ✗ | ✓ | ⓐ | `--text` |
| 글자 링크 | menu-pending, notices, meals, event-schedule, revisions, app-summary, event-field__meals-link, event-rooms__link, event-home__retrospective | ✗ | ✗ | ⓐ/✓ | `--text` |
| 행사 만들기 뒤로·달력 | EventCreate.tsx:108, 308 | ✗ | ✓ | ⓐ/✓ | `--text` / `--quiet` |
| 업무 달력 + 업무 | TaskMonth.tsx:288 | ✗ | ✗ | ✓ | `--quiet` |
| 조장 하트 토글 | EventGroups.tsx:1472 | ✗ | ✓ | ✓ | `--quiet` |
| 체크·라디오 라벨(권한, 나가기, 신청서 설정, 질문, 업무 체크리스트, 추천, 표 옵션, 숙소 공개 범위 등 15곳) | 여러 파일 | ✗ | △ | ✗ | 공용 규칙으로 pointer |
| summary(공지 내가 쓴 내용, 식수 설명) | NoticeEditor.tsx:230, EventMeals.tsx:231 | ✗ | ✗ | ✓ | 공용 규칙(포커스 링·hover 밑줄) |

### 참가자

| 요소 | 파일 | hover | focus | cursor | 조치 |
| --- | --- | --- | --- | --- | --- |
| 알림함 행 | participant/InboxScreen.tsx:160 | ✗ | ✓ | ✓ | `--card`(중요는 `--keep-border`) |
| 알림 종 | participant/InboxScreen.tsx:28 | ✗ | ✓ | ⓐ | `--quiet` |
| 하단 탭 | participant/ParticipantTabBar.tsx:19 | ✗ | ✓ | ⓐ | `--quiet --inset` |
| 공지 행 | participant/NoticesTab.tsx:79 | ✗ | ✗ | ⓐ | `--card` |
| 일정 일차 탭·오늘 | participant/ScheduleTab.tsx:109, 123 | ✗ | ✓ | ✓ | `--quiet` |
| 신청서 선택지 칸 | apply/AnswerInput.tsx | ✗ | △ | ✓ | 공용 라벨 규칙(이미 pointer) |
| 카드 글자 링크·조원 링크 | participant/* | ✓ | ✓ | ⓐ | 그대로 |
| 신청 안내 summary | participant/cards/EventHeadCard.tsx:47 | ✗ | ✗ | ✓ | 공용 summary 규칙 |

### 공개

| 요소 | 파일 | hover | focus | cursor | 조치 |
| --- | --- | --- | --- | --- | --- |
| 조직 찾기 결과·새로 등록 | PublicFindOrganization.tsx:67, 77 | ✗ | ✓ | ✓ | `--card` |
| 헤더 로그인 | PublicHeader.tsx:36 | ✗ | ✗ | ⓐ | `--text` |
| 비밀번호 찾기 뒤로, 가입 약관 보기, 조직 등록 가입 요청 | PublicForgotPassword·PublicSignup·PublicRegisterOrganization | ✗ | ✓ | ⓐ/✓ | `--text` |
| 비밀번호 보기 눈, 약관 창 닫기 | PublicResetPassword·PublicSignup·PublicTermsDialog | ✗ | ✓ | ✓ | `--quiet` |
| 공개 홈 시작하기, Google 로그인 | PublicHome·PublicLogin | ✓ | ✓ | ✓ | 그대로(이미 hover·눌림) |

## 후속: main(#481·#488·#490·#489·#492) 병합 뒤 (2026-11-25)

- 행사 목록 행: 꺾쇠가 들어가며 `space-between`의 자식이 늘어 상태 배지가 행 가운데로 밀렸다. 이제 이름(묶음)만 왼쪽에 두고 날짜·장소·상태는 꺾쇠 바로 앞에 붙는다(`EventList.css`, TSX 구조·문구는 그대로). 업무 목록 행은 내용이 왼쪽에 모이고 꺾쇠만 `--end`로 끝에 있어 밀림이 없다.
- #488(박스 줄이기)과 충돌한 3곳(`EventHome.tsx`, `EventField.tsx`, `notices/StaffNoticesCard.tsx`)은 merge로 풀었다. 박스는 되살리지 않았고, 새 구조에 반응을 다시 입혔다.
  - 행사 홈 업무·일정 구분선 행, 운영진 공지 구분선 행: `--row --inset`
  - 요약 칸(`event-home__stat`): `--row --inset`, 포커스 링을 새로 줌
  - 요약 칸 "신청 집계", 운영진 공지 "모두 보기", 현장 "식수 현황 보기": `--text`
- 현장 운영 명단 행: 누르는 버튼(`event-field__row-main`)이 행 안쪽 칸이라 hover가 행 전체에 보이지 않았다. 이제 행(`event-field__row`) 전체에 `bg/hover-row`, 눌림은 `bg/subtle`을 깐다. 선택된 행은 선택 색을 그대로 둔다.
- #490(불필요한 요소 정리)은 충돌 없이 합쳐졌다. `EventList.tsx`의 정리된 문구는 그대로 두었다. 참가 방법 카드는 "신청 링크 만들기" 하나만 남아 늘 눌리므로 `--card`를 조건 없이 준다.
- 합친 상태에서 행사 목록 행의 상태 배지가 꺾쇠 바로 앞에 붙는 것을 확인했다(`after-01-event-list-hover.png`).
- 식수 현황: 목업에는 식사 칸이 없어 "신청서 설정으로 가기" 글자 링크와 펼침(summary)만 있다. 둘 다 hover·포커스 규칙을 받는다(`after-12-meals-hover.png`).
- #489(식수 현황 두 숫자)·#492(공용 Select) 병합: `EventMeals.tsx`는 #489의 새 구조·문구를 두고 "신청서 설정으로 가기"에만 `--text`를 다시 입혔다. `ApplicantTable.tsx`는 공용 Select 교체를 그대로 두고 옆 글자 버튼 "빼기"에만 `--text`를 입혔다. 공용 Select에는 자체 hover·포커스가 있어 `scene-press`를 겹치지 않았다.
- 검사: typecheck·lint 통과, test 103개 파일 781개 통과.
- 새 스크린샷:
  - 행사 목록: `after-01-event-list-{default,hover,focus}.png`
  - 행사 홈 구분선 행: `after-05-event-home-task-hover.png`
  - 행사 홈 요약 칸: `after-05b-event-home-stat-{hover,focus}.png`
  - 현장 운영 명단 행: `after-09-field-row-hover.png`

## 고치지 않은 것과 이유

- **공지·알림함 행의 꺾쇠**: 세로로 쌓인 카드(제목·미리보기·시각)라 꺾쇠를 넣으려면 배치를 바꿔야 한다. 이번 건은 반응 표시만 다뤄 hover·눌림·포커스만 줬다.
- **끌어서 옮기는 요소**(조 카드 머리, 조원·방 사람 행, 날짜·빈 시간 끌기 칸): 누르는 요소가 아니라 끄는 요소라 grab·cell 커서를 그대로 둔다.
- **업무 달력 막대**: 상태별 색 바탕이라 회색 hover가 상태 색을 가린다. 포커스·pointer는 이미 있다.
- **신청자 표 칸**: 표 편집 모델(누르면 선택, 두 번 누르면 상세)이 따로 있어 건드리지 않았다.
- **드로어 배경 눌러 닫기**: 포인터 전용 보조 동작.
- **동작 없는 버튼**(OperatorNav.tsx:140 to 없는 메뉴 항목, 참가 방법 카드 일부): 눌러도 아무 일이 없는 구조 문제라 다른 작업 몫. 참가 방법 카드는 pointer만 걷어냈다.
- **`Button.css`, 공지 칩 `Notices.css`**: 다른 세션(`fix/button-chip-font-size`)이 고치는 파일이라 CSS를 건드리지 않았다. 공지 칩은 TSX에 공용 클래스만 붙였다. `Notices.css`의 운영진 공지 행 hover 규칙은 그대로 남아 공용 규칙과 같은 토큰으로 보인다.
