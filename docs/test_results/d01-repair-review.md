# D01 Owner 요청·수락·조직 이탈 수정 검토

상태: Review. 원본 `report.html`, `audit-data.json`, `click-ledger.csv`는 수정 전 감사 증거로 유지한다.

- 추적: [하위 이슈 #13](https://github.com/BeomhyunPark/SCENE/issues/13), [감사 이슈 #10](https://github.com/BeomhyunPark/SCENE/issues/10)
- 화면: [Figma D01 검토 영역](https://www.figma.com/design/RreFdEVMiwgHrV7teaCEOm/?node-id=791-43169)
- 정책: #4의 Owner 요청·수락·14일 인수인계 및 #5의 남은 책임 인계 조건.

## 수정 내용

Owner 요청은 PENDING만 만든다. 수신자가 수락하면 HANDOVER가 되고 새 Owner 권한이 생긴다. 마지막 Owner는 수락 전 나갈 수 없으며, 후임 수락 후에도 남은 책임을 별도로 수락받아야 조직 이탈을 확인할 수 있다.

요청 취소·거절과 인수인계 취소를 연결했다. 완료 후 취소는 차단하고, 14일 경과 후에도 남은 책임을 인계할 경로를 유지했다. 일반 구성원의 이탈은 기존 Owner 정보를 바꾸지 않는다.

## 검증

Figma에 저장된 reactions를 다시 읽어 `d01-reaction-check.figma.js`로 평가한 25개 시나리오가 모두 통과했다. 결과는 `d01-reaction-check.json`에 있다. 이 스크립트는 Figma `use_figma` 문맥에서 실행하며 화면이나 변수 기본값을 수정하지 않는다.

검사 범위는 저장된 조건·변수 변경·목적지 전이이다. 실제 Present에서의 클릭, 화면 표시, 브라우저 뒤로 가기, 실제 인증, 서버 권한 및 시간 경과는 이 검사로 확인하지 않았다. 하단 계정 전환과 14일 경과 버튼은 검토 전용이다.

## 종료 전 남은 검토

- [ ] Present에서 요청 → 수신자 계정 → 수락 → 책임 수락 → 요청자 조직 이탈을 재현한다.
- [ ] 수락 전·책임 수락 전 이탈 차단과 취소·거절 경로를 클릭으로 확인한다.
- [ ] 14일 경과 예시 후 취소 차단 및 늦은 책임 수락 경로를 확인한다.
- [ ] 검토 결과와 캡처를 #13에 기록한 후 D01의 종료 여부를 판단한다.

다른 감사 결함 D02–D12 및 별도 정책 검토 #11·#12는 이번 수정 범위에 포함되지 않는다.
