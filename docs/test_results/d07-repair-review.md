# D07 · 대기 중 조직 가입 요청 취소 흐름 추가

대기 중 가입 요청에서 취소 확인·철회 결과·재요청을 연결했습니다. 취소 상태가 상태 확인으로 대기 상태로 복구되지 않도록 했습니다.

## 검증

후속 사용자 재검토에서 화면 밖의 복귀·예외 경로를 추가 수정했다. 최신 결과는 [경로 재수정 검토](cross-route-repair-review.md)를 따른다. 아래 검증은 최초 수정 당시의 범위다.

저장된 Figma 반응과 변수 조건·바인딩·정적 구조 평가: 6/6 통과.

실제 Present 클릭이나 서버 테스트는 수행하지 않았습니다. 공통 재현 스크립트와 결과는 [d06-d12-reaction-check.figma.js](d06-d12-reaction-check.figma.js), [d06-d12-reaction-check.json](d06-d12-reaction-check.json)에 있습니다.

## 남은 검토

실제 가입 요청 API, 승인과 취소 경합 및 멱등성은 서버 검증 대상입니다.

[하위 이슈 #19](https://github.com/BeomhyunPark/SCENE/issues/19) · [상위 감사 #10](https://github.com/BeomhyunPark/SCENE/issues/10) · [프로젝트 Review](https://github.com/users/BeomhyunPark/projects/5/views/1). 원본 감사 결과는 유지했습니다.
