# 프로토타입 감사 수정 현황

## D01–D12

12개 결함의 프로토타입 수정안을 준비했습니다. 모두 상위 [감사 #10](https://github.com/BeomhyunPark/SCENE/issues/10)의 하위 이슈이며 [GitHub 프로젝트 #5](https://github.com/users/BeomhyunPark/projects/5/views/1)의 Review에서 추적합니다.

| 결함 | 수정 | 이슈 |
|---|---|---|
| D01 | Owner 인수인계·이탈 | [#13](https://github.com/BeomhyunPark/SCENE/issues/13) |
| D02 | 업무 상태 유지 | [#14](https://github.com/BeomhyunPark/SCENE/issues/14) |
| D03 | 저장 후 조 편성 메뉴 | [#15](https://github.com/BeomhyunPark/SCENE/issues/15) |
| D04 | 미배정 참가자 조 배정 | [#16](https://github.com/BeomhyunPark/SCENE/issues/16) |
| D05 | 인증 후 수정 제한 유지 | [#17](https://github.com/BeomhyunPark/SCENE/issues/17) |
| D06 | 신청 취소 화면 버튼명과 목적지 일치 | [#18](https://github.com/BeomhyunPark/SCENE/issues/18) |
| D07 | 대기 중 조직 가입 요청 취소 흐름 추가 | [#19](https://github.com/BeomhyunPark/SCENE/issues/19) |
| D08 | 조직 생성 권한 선언과 최종 확인 추가 | [#20](https://github.com/BeomhyunPark/SCENE/issues/20) |
| D09 | 수락 전 초대 취소와 새 초대 흐름 추가 | [#21](https://github.com/BeomhyunPark/SCENE/issues/21) |
| D10 | 내보내기 목적 선택과 최종 확인 표시 | [#22](https://github.com/BeomhyunPark/SCENE/issues/22) |
| D11 | 일정에서 연 업무의 돌아가기 경로 유지 | [#23](https://github.com/BeomhyunPark/SCENE/issues/23) |
| D12 | 미완료 준비 업무 경고 후 행사 종료 연결 | [#24](https://github.com/BeomhyunPark/SCENE/issues/24) |

## 검증 범위

D06–D12의 저장된 반응·변수 조건·문구 바인딩·정적 구조 평가 48/48 통과. [결과](d06-d12-reaction-check.json)와 [재현 스크립트](d06-d12-reaction-check.figma.js)를 보관했습니다. 원본 report.html/audit-data.json/click-ledger.csv는 최초 감사 증거로 유지하며 결과를 덮어쓰지 않았습니다.

실제 Present 클릭과 서버 호출은 수행하지 않았습니다. 각 수정은 실제 재검토 전 Review 상태로 남깁니다. 원본 정책 미결 O01과 실제 데이터로 검증 불가능한 항목도 완료 처리하지 않았습니다.

## 다음 검토

- 실제 Present에서 D01–D12를 재클릭하고 취소·재진입·권한 차단을 확인.
- #11: 실제 identity·초대 토큰 무효화·만료·동시 수락/취소 검증.
- #12: 실제 Export 목적/권한·다운로드·보존·삭제 상세 계약 검증.
- D08의 권한 확인은 자기 선언이며, 검증된 계정과 후보 검색은 기존 fixture 전제.
- D09의 새 초대 수락 화면 833:44650은 새 링크 QA 진입점. 실제 메일 발송·새 토큰 전달은 모사하지 않음.
- D10의 두 목적은 예시 선택지. 현재 기록 0개 fixture는 파일 생성 비활성 상태.
- D12의 EventOwner는 별도 fixture이며, 종료 시점 0/2 스냅샷은 실제 후속 업무 권한 정책을 대체하지 않음.

정책 문서, 최초 감사 증거, D01–D05 검증 자료, D06–D12 검증 자료를 각각 구분해 버전 관리합니다. 실제 검토 완료 여부는 각 이슈와 프로젝트 상태로 추적합니다.
