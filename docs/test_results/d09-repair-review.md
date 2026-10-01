# D09 · 수락 전 초대 취소와 새 초대 흐름 추가

조직 Owner의 수락 전 초대 취소·상태 표시·기존 링크 거부·새 초대 수락을 연결했습니다. 비Owner의 취소와 재초대 및 이미 수락된 초대의 취소를 차단했습니다.

## 검증

저장된 Figma 반응과 변수 조건·바인딩·정적 구조 평가: 11/11 통과.

실제 Present 클릭이나 서버 테스트는 수행하지 않았습니다. 공통 재현 스크립트와 결과는 [d06-d12-reaction-check.figma.js](d06-d12-reaction-check.figma.js), [d06-d12-reaction-check.json](d06-d12-reaction-check.json)에 있습니다.

## 남은 검토

Figma 변수로 토큰 상태를 모사했습니다. 실제 만료·토큰 회전·수락/취소 동시성·메일 발송은 #11에서 검증합니다. 새 초대 QA 진입 화면은 833:44650입니다.

[하위 이슈 #21](https://github.com/BeomhyunPark/SCENE/issues/21) · [상위 감사 #10](https://github.com/BeomhyunPark/SCENE/issues/10) · [프로젝트 Review](https://github.com/users/BeomhyunPark/projects/5/views/1). 원본 감사 결과는 유지했습니다.
