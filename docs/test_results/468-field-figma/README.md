# 현장 운영 화면을 Figma OM01·TL01에 맞춘 확인 (#468)

2026-11-25. 브랜치 `fix/field-ops-figma-layout`.

## 구분

| 종류 | 한 일 | 결과 |
|---|---|---|
| Figma 대조 | Figma MCP로 OM01 622:7·TL01 620:7의 design context, OM02 622:46·OM03 622:71·OM10 622:241의 스크린샷을 읽었다 | 아래 표 |
| 단위 테스트 | `pnpm typecheck && pnpm lint && pnpm test` | 통과. 85파일 652개. 테스트 파일은 고치지 않았다 |
| 목업 클릭 | `VITE_API_MOCK=1 pnpm dev` + `shots.mjs`(Playwright. 목업 저장소에 ACTIVE·조 편성 공개·체크인 3명을 넣음). 390×844 터치, 1440×900 | `before-*`/`after-*` 캡처 |
| QR 카메라 | 헤드리스 Chromium의 가짜 카메라로 스캐너가 열리는 것만 확인 | 실제 휴대폰 카메라로 QR을 읽는 것은 확인하지 못함 |
| 서버 검증 | 서버 변경 없음 | — |

캡처: `{before,after}-{390,1440}-{1-list,2-groups,3-qr,4-offline,5-cancel}.png`. 다시 찍으려면 `node shots.mjs . after`를 실행한다.

## Figma 노드별 반영

| Figma | 코드 |
|---|---|
| OM01 622:12·622:13 행사명(Heading/M), 보조줄(Body/S tertiary) | `.event-field__event`·`__context`(스페이스 · 날짜 · 장소) |
| OM01 622:10 "확인 14:50" 칩 | `.event-field__read`. 마지막으로 읽은 시각이며, 누르면 바로 읽는다(#408). 스크린리더에는 "…에 읽음" |
| OM01 622:14 Quick Search(52, radius 10, border-control, 돋보기, 라벨 없음) | `.event-field__search`. 라벨은 시각적으로 숨김 |
| OM01 622:21 "전체 104명 · 미도착 24명"(Title) | `체크인 현황` 한 줄: 전체 · 미완료 · 체크인 완료 |
| TL01 620:19·620:21 필터 칩, 620:17 수 칩 | 전체/미완료/완료 칩 + "n명" 칩 |
| Participant Item 616:3971(radius 10, 13/14, 이름 15 semibold, 메타 12/18, pill 칩 + 10px 빈 원) | `FieldRosterRow`. 체크인 완료는 체크 표시 + attendance-full 배지 색 |
| OM01 622:42 Connection Status, OM10 622:241 | 오프라인·확인 안 된 요청 카드 |
| Venture 계열(아래) | QR 버튼·전체/조별 탭·선택한 카드 |
| TL01 620:7 2단(대기열 472px + 상세 패널 620:56) | 1024px 이상에서 `.event-field__layout--wide`. 상세 패널: "선택한 참가자", 이름(Display), 상태 칩, 읽기 전용 칸(48, radius 8), 동작 버튼. QR 스캐너는 이 패널 자리에 열린다 |

## Venture 계열 추가 기준 (2026-11-25 사용자 지정)

P13에 자리가 없는 요소는 아래 노드를 따랐다. 색과 글자는 SCENE 토큰으로 옮겼다. P13에 자리가 있는 요소(검색창 52/radius 10, 현황 한 줄, 필터 칩, 참가자 카드)는 P13 화면 설계를 그대로 두었다.

| 요소 | 따른 노드 |
|---|---|
| QR 스캔 버튼 | SCENE DS v0.1 `ZFajaGIQ3VneNqkncKYXbJ` 33:28 **Filter Trigger**, 172:6 "04 참가자 명단"의 Data Toolbar(173:7736: 검색 + 아이콘·라벨 outline 컨트롤), Venture Contact (List) `RreFdEVMiwgHrV7teaCEOm` 20:3612의 "Filter" 버튼. outline, radius 8, 20px 아이콘 + 14px medium 라벨 "QR 스캔"을 쓰고, 열림 상태는 Filter Trigger Active(진한 테두리 + subtle 채움)로 표시한다 |
| 전체/조별 전환 | Venture Contact (List) 20:3612의 보기 탭("List · Kanban · Table"): 글자 탭 + 선택 시 2px 밑줄. 행사명 아래, 대기열·상세 위에 둔다 |
| 선택한 카드(데스크톱) | 33:28 **Operational List Item**의 Selected 상태(색 채움 + 진한 테두리). 정보 순서(identity → 상태 → 메타 → 동작)도 이 컴포넌트와 같다 |
| 확인했지만 바꾸지 않음 | EOP Design System `2yztLB533ohOebuAKuwZr0`는 handoff 문서상 SCENE 토큰으로 다시 묶인 기반 라이브러리이며, 위 Venture 패턴과 겹쳐서 따로 적용하지 않았다. 172:7 "05 참가자 상세"(라벨-값 행)는 TL01 상세 패널과 겹쳐서 TL01을 따랐다 |

## Figma와 다르게 둔 것

- 행마다 "체크인" 버튼을 둔다(40px). Figma 카드는 `›`로 상세에 들어가지만, 현장에서 한 번에 체크인하는 흐름을 지키려고 남겼다. 취소는 secondary로 낮췄다.
- QR 스캔과 전체/조별은 P13에 자리가 없어서 Venture 계열 패턴을 따랐다(위 표). 조별 보기에서는 검색창이 없어서 QR 버튼만 오른쪽에 남는다.
- 쓰지 않은 Figma 요소: "오늘 일정" 바로가기(범위 밖), "현장 모드" 배지(셸 헤더 범위), "확인 보류" 칩·버튼(서버 API 없음), 참가 유형·신청 상태 칸(데이터 없음), "본인 확인 안내", "처리하면 다음 대기 참가자를 자동으로 골라요"(자동 선택 없음), "대기 참가자 더 보기"(기존 "더 보기" 유지).
- 새로 넣은 문구: 상세 패널의 칸 이름 "조"·"체크인"·"기록", 오프라인 칩 "오프라인", 검색 placeholder는 제품 용어대로 "이름 또는 전화 끝 4자리"로 썼다.
- 이름 15 semibold는 SCENE 텍스트 스타일에 없어서 값을 그대로 적었다.

## 범위 밖

- 데스크톱 본문 가운데 정렬(`OperatorShell.css` framed 목록)은 다른 세션이 맡는다. 1440 캡처에서 본문이 왼쪽에 붙은 것은 그 때문이다.
- 휴대폰 하단 탭 바가 전체 페이지 캡처 중간에 찍힌 것은 셸의 고정 요소 때문이며 화면 문제는 아니다.
