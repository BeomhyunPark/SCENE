# 참가자 홈·주기 확인·내 정보 — 실제 서버 클릭(로컬)

- 이슈: [#425](https://github.com/BeomhyunPark/SCENE/issues/425)(B3·B4), [#427](https://github.com/BeomhyunPark/SCENE/issues/427)(A5)
- 날짜: 2026-11-20
- 방법: B2(#432)가 들어간 main을 병합한 이 브랜치의 백엔드를 `local` 프로파일(PostgreSQL 17, Docker)로 띄우고 `VITE_API_MOCK=0` 개발 서버에서 Playwright로 클릭. **모든 참가자 경로가 실제 서버다**(`home`·`updates` 포함). 운영자 동작(조 만들기·배정·공개, 완료 안내 저장)은 운영자 API로 했다. 기록: [click-log.txt](click-log.txt)

캡처는 "다음 식사" 카드를 뺀 뒤(사용자 결정 2026-11-20, 식사 순서는 1월 범위 밖) 다시 찍었다. [click-log.txt](click-log.txt)는 다시 찍은 실행의 기록이다.

| 파일 | 확인한 것 |
|---|---|
| `390-01-home.png` | 공개 신청 → 내 신청 보기 → 홈. 수련회 행사라 다섯 탭, 실제 도착 QR |
| `390-02-me-saved.png` | 내 정보 고치기 저장(또래 98 → 99) |
| `390-03-group-published.png` | 운영자가 조 편성을 공개하고 화면 조작 없이 홈 내 조 카드가 바뀜. 첫 실행 **32.6초**, 다시 찍은 실행 **24.0초**("5조") |
| `390-04-completion-notice.png` | 첫 실행에서 운영자가 완료 안내를 저장하고 **27.0초 뒤** 행사 카드에 "신청 안내 보기"가 생김(`updates.home`). 다시 찍은 실행은 안내가 이미 있어 측정하지 않았다(로그의 0.0초) |
| `desktop-01-home.png`·`desktop-02-me.png` | 1280px |

탭 주소(`…/schedule`, `…/notices`, `…/group`, `…/me`)와 새로 고침 뒤 같은 탭 유지도 확인했다.

**30초 기준에 대해:** 계약 §5는 `pollAfterSeconds` 30에 ±20%를 주므로 확인 간격이 24–36초다. 첫 실행에서 공개가 32.6초 뒤에 보였다. "30초 안"을 늘 지키려면 서버 설정 `scene.participant.poll-after-seconds`를 25로 두면 20–30초가 된다(결정 대기, PR 본문).

못 한 것: 운영 서버 확인, 실제 휴대폰 기기, 200명 부하(J6).
