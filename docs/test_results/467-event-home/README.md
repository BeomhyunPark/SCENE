# #467 운영자 행사 홈 — Figma 「02 행사 홈 · v2.0 Candidate」 맞춤

기준: Figma `RreFdEVMiwgHrV7teaCEOm` 46:18286(페이지 4:6, 사용자 지정). Figma MCP `get_design_context`로 직접 읽었다(`figma-46-18286.png`).

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
- 맥락 줄(날짜·장소 / 상태 + 상태 배지), 요약 카드 4개(첫 카드 brand-subtle, radius 8, padding 18/20, gap 16), 2단(지금 할 일 2fr / 다가오는 일정 1fr, gap 20, 58px 행), 바로가기 카드 4개, 본문 padding 28/32, 섹션 gap 24.
- 글자: 카드 라벨 13 medium → `--scene-body-s` + 500, 숫자 26 bold → `--scene-display`, 보조 12 → `--scene-caption-m`, 패널 제목 18 bold → `--scene-heading-s`, 행 제목 14 medium → `--scene-label-m`, 일정 시각 13 bold → `--scene-body-s-strong`(brand), 장소 11 → `--scene-caption-s`, 바로가기 제목 15 bold → `--scene-title`.
- 색은 모두 `var(--color-*)` 토큰(본문 배경 canvas, 카드 surface, 행 subtle).

## 다르게 둔 부분과 이유
- 변경 요청 카드: 대응 기능이 없어 운영자 알림의 신청 변경(`APPLICATION_REVISED`·`RESUBMITTED`·`CANCELLED`, 최근 30개)으로 대신했다. 숫자는 건수, 보조는 "미확인 N".
- 참가자 카드: 신청 집계로 열리므로 오른쪽 위에 "신청 집계"를 더했다(Figma에 없음). 보조 줄은 진행 중이면 체크인 "도착·미도착", 아니면 참석 방식(전체·부분·집회만). Figma의 "예정·취소"는 신청 집계가 제출된 신청만 세서 낼 수 없다.
- 준비 업무: 기한 데이터가 없어 "마감 임박" 대신 "진행 중 N" 또는 "남은 업무 N". 일정: 담당 데이터가 없어 "공개 전 변경 N"/"모두 공개됨".
- 지금 할 일 체크 상자는 표시만 한다(누르면 업무 상세로 이동). 완료 처리는 체크리스트 조건이 있어 상세 화면에서 한다.
- 운영진 공지(DEC-082 §5)는 Figma에 자리가 없어 2단 아래에 같은 패널 스타일로 두었다. "공지 전체" → "모두 보기", 글자 `--scene-label-m`. 공지 화면의 `.notices__link`(휴대폰용 큰 글자)는 그대로 두었다.
- 종료·보관 행사는 지금 할 일·다가오는 일정 대신 종료 안내와 회고 버튼을 둔다. 현장 운영 바로가기는 ACTIVE일 때만.
- 상단 두 번째 배지("확인 필요 2")는 대응 데이터가 없어 넣지 않았다.
- 목업의 체크인 요약은 시드 명단을 함께 세어 "미도착 16"처럼 신청 수(8명)와 어긋난다. 목업 데이터 문제로 보고 이번 범위에서 고치지 않았다.
- 데스크톱 본문 왼쪽 쏠림은 다른 작업(OperatorShell framed)에서 다룬다.
