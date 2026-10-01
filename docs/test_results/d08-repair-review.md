# D08 · 조직 생성 권한 선언과 최종 확인 추가

조직 생성 전에 대표·위임 권한을 선언하고 최종 확인한 뒤 생성하도록 했습니다. 돌아가면 선언을 해제합니다. 외부 증빙 심사나 SCENE 승인은 추가하지 않았습니다.

## 검증

저장된 Figma 반응과 변수 조건·바인딩·정적 구조 평가: 5/5 통과.

실제 Present 클릭이나 서버 테스트는 수행하지 않았습니다. 공통 재현 스크립트와 결과는 [d06-d12-reaction-check.figma.js](d06-d12-reaction-check.figma.js), [d06-d12-reaction-check.json](d06-d12-reaction-check.json)에 있습니다.

## 남은 검토

현재 검증된 계정·조직 후보 검색은 기존 fixture를 사용합니다. 이메일 인증·중복 판정·실제 생성 권한은 서버 검증 대상입니다.

[하위 이슈 #20](https://github.com/BeomhyunPark/SCENE/issues/20) · [상위 감사 #10](https://github.com/BeomhyunPark/SCENE/issues/10) · [프로젝트 Review](https://github.com/users/BeomhyunPark/projects/5/views/1). 원본 감사 결과는 유지했습니다.
