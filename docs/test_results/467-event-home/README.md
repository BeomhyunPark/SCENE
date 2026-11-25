# #467 운영자 행사 홈 — Figma 「02 행사 홈 · v2.0 Candidate」 맞춤

기준(사용자 지정, Figma MCP `get_design_context`로 직접 읽음):
- 화면 구조: SCENE `RreFdEVMiwgHrV7teaCEOm` 46:18286 「02 행사 홈 · v2.0 Candidate」(페이지 4:6) — `figma-46-18286.png`
- 카드·패널·목록 행·배지 모양: 출처가 겹쳐 **Venture 우선**. Event Operation Platform Design System `2yztLB533ohOebuAKuwZr0` Design 28:217의 Dashboard 873:109446(통계 카드 539:33865, Upcoming Agenda 539:33910, Rows 652:38950) — `venture-dashboard-873-109446.png`, 같은 파일 사본인 SCENE 80. REFERENCES — VENTURE 41:16850의 Analytics (Activity) 14:2842(패널) — `venture-analytics-14-2842.png`
- 참고만 함: SCENE Design System v0.1 Audit `ZFajaGIQ3VneNqkncKYXbJ` 144:2 VENTURE HARVEST. Dashboard 전체는 KPI·차트 편향으로 DROP, "Upcoming Agenda 같은 작은 정보 그룹"만 쓸 만하다는 판정을 따라 차트는 넣지 않았다. 172:2, 173:8060, 65:25, 50:17, 33:28은 시간 관계상 열어 보지 않았다.

## 검증 구분
| 구분 | 결과 |
| --- | --- |
| 단위·화면 테스트 | `pnpm typecheck`·`pnpm lint`·`pnpm test` 통과(85 파일, 656 테스트) |
| 목업 서버 스크린샷 | `VITE_API_MOCK=1 pnpm dev` + `event-home-shots.mjs`, 1440px·390px, 고치기 전(`before-*`)/후(`after-*`) |
| 실제 서버(백엔드) 확인 | 하지 않음 |
| 사람의 실제 클릭 확인 | 하지 않음(사용자 검토 대기) |

## 스크린샷
- `before-active-1440.png`, `before-active-390.png`, `before-draft-empty-*.png`: 고치기 전
- `after-active-1440.png`, `after-active-390.png`: 진행 중 행사(참가자 8명, 업무 5개, 일정 4개, 신청 변경 2건 시드)
- `after-draft-empty-1440.png`, `after-draft-empty-390.png`: 새로 만든 행사(목업 기본 업무 1개 외 데이터 없음)

## Figma와 맞춘 부분
- 46:18286에서: 맥락 줄(날짜·장소 / 상태 + 상태 배지) → 요약 카드 4개 → 2단(지금 할 일 2fr / 다가오는 일정 1fr) → 바로가기 4개 순서, 본문 padding 28/32, 섹션 gap 24, 카드에 보조 줄.
- Venture 통계 카드 539:33865: radius 4, padding 20, gap 12, 위 줄 아이콘 칸(32px, bg-subtle, 아이콘 24px) + 오른쪽 꺾쇠 12px, 라벨 14 medium → `--scene-label-m`, 숫자 28 → `--scene-display`. 카드 사이 20. 바로가기도 같은 카드(제목 + 꺾쇠).
- Venture 패널(Analytics 14:2842): radius 8, padding 20, gap 16, 제목 20 → `--scene-heading-m`, 패널 사이 24.
- Venture Rows 652:38950: 흰 행, 1px 테두리, radius 4, padding 12, 행 사이 12, 본문 14 → `--scene-body-m`. 상태 배지는 pill(padding 4/8, 8px 점, 12 medium → `--scene-label-s`). 지금 할 일·운영진 공지 행에 같이 적용.
- Venture Upcoming Agenda 539:33910: 시각 배지(radius 4, padding 4/6, 12 medium) → 제목 14 medium(`--scene-label-m`) → 장소 12(`--scene-caption-m`), 항목 사이 16.
- 아이콘은 Figma 자산을 내려받지 않고 저장소의 같은 아이콘(`assets/event-nav/` address·clipboard·calendar·bell·caret)을 다시 썼다.
- 색은 모두 `var(--color-*)` 토큰(본문 배경 canvas, 카드·패널 surface, 아이콘 칸 subtle, 시각 배지 brand-subtle).

## 다르게 둔 부분과 이유
- 변경 요청 카드: 대응 기능이 없어 운영자 알림의 신청 변경(`APPLICATION_REVISED`·`RESUBMITTED`·`CANCELLED`, 최근 30개)으로 대신했다. 숫자는 건수, 보조는 "미확인 N".
- 참가자 카드: 신청 집계로 열리므로 오른쪽 위에 "신청 집계"를 더했다(Figma에 없음). 보조 줄은 진행 중이면 체크인 "도착·미도착", 아니면 참석 방식(전체·부분·집회만). Figma의 "예정·취소"는 신청 집계가 제출된 신청만 세서 낼 수 없다.
- 준비 업무: 기한 데이터가 없어 "마감 임박" 대신 "진행 중 N" 또는 "남은 업무 N". 일정: 담당 데이터가 없어 "공개 전 변경 N"/"모두 공개됨".
- 46:18286의 첫 카드 brand-subtle 배경, 행 안 체크 상자, subtle 배경 행은 Venture를 우선해 흰 카드·테두리 행으로 바꿨다(체크 상자는 누를 수 없는 표시라 뺐다). 행을 누르면 업무 상세로 간다.
- 목록 행 테두리는 Venture처럼 `border/default`로 두었다. 핸드오프 §2는 테두리만 있는 눌리는 요소에 `border/control`을 권하므로, 다크 모드 대비가 문제되면 바꿔야 한다(기존 공지 행도 `border/default`).
- 운영진 공지(DEC-082 §5)는 Figma에 자리가 없어 2단 아래에 같은 패널 스타일로 두었다. "공지 전체" → "모두 보기", 글자 `--scene-label-m`. 공지 화면의 `.notices__link`(휴대폰용 큰 글자)는 그대로 두었다.
- 종료·보관 행사는 지금 할 일·다가오는 일정 대신 종료 안내와 회고 버튼을 둔다. 현장 운영 바로가기는 ACTIVE일 때만.
- 상단 두 번째 배지("확인 필요 2")는 대응 데이터가 없어 넣지 않았다.
- 목업의 체크인 요약은 시드 명단을 함께 세어 "미도착 16"처럼 신청 수(8명)와 어긋난다. 목업 데이터 문제로 보고 이번 범위에서 고치지 않았다.
- 데스크톱 본문 왼쪽 쏠림은 다른 작업(OperatorShell framed)에서 다룬다.
