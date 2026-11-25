# #487 기본 select → 공용 Select(Figma)

[#487](https://github.com/BeomhyunPark/SCENE/issues/487) · 브랜치 `feat/scene-select`

## 따른 Figma

| 출처 | 노드 | 가져온 값 |
| --- | --- | --- |
| EOP(Venture) Styleguide `2yztLB533ohOebuAKuwZr0` | `Selector` 723:18126 · Combo Box 67:2576 | 트리거: 좌우 12, 20px 꺾쇠(열리면 위로), 기본/hover/focus/disabled |
| 〃 | `Wrapper / Menu` 724:19358 | 패널: 흰 바탕 · 1px 테두리 · 그림자 0 4 20 · 아래 6 여백 · 최대 높이 270 → 272(옵션 약 8개) |
| 〃 | Menu Item 724:19162 / 724:19318 / 724:19326 | 옵션: 좌우 12 · 위아래 6 · 14px, hover 회색 바탕, 비활성 흐린 글자 |
| SCENE DS v0.1 `ZFajaGIQ3VneNqkncKYXbJ` | Combobox / Option 38:74 | 옵션 높이 36, 선택은 오른쪽 체크(색만으로 구분하지 않음) |
| 〃 | Combobox / Documentation 38:21 | AVOID WHEN "작은 고정 목록" · NOTES "Select는 제한된 목록의 직접 선택" → 검색 칸 없음 |
| 제품 UI `RreFdEVMiwgHrV7teaCEOm` | 4:3 컴포넌트 마스터 | SCENE Select 마스터 없음(Form Field·Action만) |

색·글자는 SCENE 토큰으로 옮겼다: 패널 `--color-bg-raised`/`--color-border-raised`/`--color-shadow-popover`, 옵션 hover `--color-bg-subtle`, 체크 `--color-text-brand`, 열림 테두리 `--color-border-selected`, 오류 `--color-danger-fg`, 포커스 `--color-focus-ring`, 글자 `--scene-body-m`.
radius는 Venture 4px 대신 8px: SCENE이 쓰는 EOP 변수 `Border Radius/8 px`(752:13)이고 옆 입력 칸과 같다.

## 동작

WAI-ARIA select-only combobox. 포커스는 트리거(`button[role=combobox]`)에 남고 `aria-activedescendant`로 옵션을 가리킨다.
`<label for>`·감싼 `<label>` 모두 이름이 붙는다. 위/아래·Home/End·PageUp/Down, Enter/Space로 고르기, Esc·Tab·바깥 누르기로 닫기(값 그대로), 글자 입력으로 이동, 비활성 옵션 건너뛰기.
패널은 `position: fixed`라 스크롤 상자에 잘리지 않고, 아래 자리가 없으면 위로 펼친다. `name`을 주면 숨은 input으로 폼에 값을 싣는다.
휴대폰(≤639px): 글자 16px, 트리거·옵션 높이 44px(화면이 40 이상으로 정한 곳은 그대로).

## 교체한 곳 (30곳 전부)

일정 편집 분류·집회/식사 칸 연결 · 행사 만들기 유형 · 조 편성 필터 6개·보낼 조 · 숙소 필터 6개·보낼 방·방 만들기/고치기 성별·조 단위 넣기(조 기준·조·방) · 운영자 조직 멤버·추가 역할·초대 역할 · 운영 서랍 조 배정 · 업무 담당자 · 참가 현황 묶어 보기·정렬 방향·정렬 더하기·조건 더하기·세는 항목·나눠 보기 · 신청서 드롭다운 답(참가자 화면) · 질문 편집 답변 유형·입력 형식·보여 주는 방식·모양·조건 질문 · 개발용 로그인 시드 사용자.

남긴 곳 없음. 검토가 필요한 곳: 참가자 신청서 드롭다운(`AnswerInput`)은 휴대폰이 주 화면이라 OS 기본 선택 창이 더 익숙할 수 있다. 옵션이 아주 많은 곳(조직 멤버, 정렬·조건 더하기의 질문 목록)은 검색 없이 스크롤·글자 입력으로 찾는다.

## 검증

- `pnpm typecheck` · `pnpm lint` 통과, `pnpm test` 104 파일 782개 통과 (2026-11-25)
- `Select.test.tsx` 12개: 이름·숨은 값, 클릭 선택·체크, 비활성, 키보드, Space, Esc/Tab/바깥/blur 닫힘, 다시 눌러 닫기, 글자 입력, disabled, placeholder, 감싼 label, 위로 펼침
- 기존 테스트 23개는 `src/test/select.ts`(`chooseOption`·`optionLabels`·`selectValue`·`findOptionLabel`)로 같은 의미를 확인하게 바꿨다.
- 스크린샷: `select-shots.mjs`(목업 Vite, deviceScaleFactor 2), `shots/`.
  - before: 기본 select는 펼친 목록을 OS가 그려 헤드리스 화면에 안 나온다. 닫힘·포커스만 있다.
  - after: 일정 편집 분류의 닫힘·키보드 포커스·키보드로 연 목록·클릭으로 연 목록·선택 후 (1440, 390), 운영자 초대 역할, 참가 현황 묶어 보기.
- 390 선택 후 사진의 포커스 테두리는 같은 실행에서 앞서 키보드를 써서 Chrome이 키보드 포커스 상태로 남은 것이다(기본 select도 같다). 마우스·터치로만 고르면 테두리 없이 포커스를 돌린다.
- 실제 클릭은 Playwright(Chromium)로만 했다. 실제 휴대폰 터치·화면 읽기 프로그램 확인은 남았다.
