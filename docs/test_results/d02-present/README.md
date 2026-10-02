# D02 (#14) Present 캡처 색인

UX 검수 Present 클릭 결과 (2026-10-02). QA 릴리즈 가드 판정: Present 행 전부 통과.
폴더: `run1/` = 원본 `d14-present` (11:07~11:24), `run3-tablet/` = `d14-present3` B1~B5, `run4-mobile/` = `d14-present4` (100%, Present 도구막대 숨김).
`d14-present3`의 A 스크린샷은 도구막대가 헤더를 가려 생긴 실패라 넣지 않음.

## 1. 완료 → 내 업무 → 현장 운영 → 오늘 일정 → 동일 업무 경로
- `run1/00-task-detail-initial.png`, `run1/01-item2-checked.png`, `run1/02-task-complete.png`
- 태블릿 현장 운영 시작 화면 TL01: `run1/B3-left-field-620-7.png`
- 태블릿 경로 TL01 → PT03 "오늘 일정 · 내 업무" → 내 준비 업무 `664:44203` 1/2: `run3-tablet/B1.png`, `run3-tablet/B2.png`

## 2. 명시적 다시 진행과 체크 해제 표시
- 다시 진행: `run1/A1-2of2.png`, `run1/A1-complete.png`, `run1/A2-resume-2of2.png`
- 체크 해제: `run1/A3-1of2-item2.png`, `run1/A4-0of2.png`, `run1/A5-return-button-1107-7.png`, `run1/A5-return-button-2-1107-7.png`, `run1/A6-1of2-item1.png`, `run1/A6-return-button-664-43439.png`, `run1/A7-2of2.png`, `run1/A7-return-button-664-43479.png`, `run1/A8-1of2-item2.png`, `run1/A8-reopen-1091-44633.png`
- 태블릿 체크 해제: `run1/B1-0of2-1107-33.png`, `run1/B1-1of2-item2-1107-17.png`, `run1/B1-2of2.png`, `run1/B1-final-1of2-item1-664-43979.png`
- 태블릿 토글 0/2 → 1/2 → 0/2: `run3-tablet/B3-item1-off-0of2.png`, `run3-tablet/B3-item2-on-1of2.png`, `run3-tablet/B3-item2-off-0of2.png`

## 3. 첨부 복귀
- 모바일 (핫스팟 PM06 `1152:44723`, PM09 `1152:44724`, PT02 `1152:44725`): `run4-mobile/A1-back.png`, `run4-mobile/A1-return.png`, `run4-mobile/A2-back.png`, `run4-mobile/A2-return.png`, `run4-mobile/A3-back.png`, `run4-mobile/A3-return.png`
- 태블릿 복귀 후 준비 업무 1/2: `run1/B2-return-button-664-43979.png`
- 태블릿 첨부와 다시 열기 1/2 유지: `run3-tablet/B4-attachment.png`, `run3-tablet/B4-back.png`, `run3-tablet/B4-return.png`, `run3-tablet/B5.png`

메모: `run4-mobile`의 A 스크린샷이 `run1/00~02`와 같은 파일인 것은 같은 화면·같은 상태라 문제 아님 (QA).
서버 저장: 계약 확정 [DEC-062](../../product/PRODUCT_DECISIONS.md)·[#31 업무 체크리스트 저장 계약](../../architecture/api-architecture-v0.1.md#2026-10-02-업무-체크리스트-저장-계약-31-dec-062) (2026-10-02, [#31 결정 기록](https://github.com/BeomhyunPark/SCENE/issues/31#issuecomment-5946079736)). 서버 구현·검증은 미완.
