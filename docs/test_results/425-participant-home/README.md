# 참가자 홈 탭·카드·주기 확인·내 정보 — 저장된 프로토타입(mock) 연결 검증

- 이슈: [#425](https://github.com/BeomhyunPark/SCENE/issues/425)(B3·B4), [#427](https://github.com/BeomhyunPark/SCENE/issues/427)(A5)
- 날짜: 2026-11-20
- 방법: `VITE_API_MOCK=1` 개발 서버(MSW)에서 Playwright(Chromium)로 실제 클릭. mock 저장소에 행사(수련회 유형, 진행 중)·신청서·완료 안내·신청 한 건을 넣고, 화면에서 이름·전화번호·숫자 6자리로 들어왔다. 기록: [click-log.txt](click-log.txt)
- **실제 서버 클릭이 아니다.** `GET /participant/home`·`/participant/updates`는 아직 서버에 없어(B2) mock 응답이다. 운영 서버(scene.greengroove.app)는 이 환경에서 접속할 수 없다.

| 파일 | 확인한 것 |
|---|---|
| `390-01-home.png` | 390px. 하단 탭 홈·일정·공지·내 조·내 정보, 카드 순서(행사·지금·다음 일정·최신 공지·도착 QR·내 조·숙소·다음 식사), 빈 상태 문구 |
| `390-02-home-notice-open.png` | 완료 안내를 펼친 모습(기본은 접힘) |
| `390-03-schedule.png`·`390-04-notices.png` | 일정·공지 탭 빈 상태와 탭 주소(`…/schedule`, `…/notices`) |
| `390-05-group.png` | 내 조 탭(`…/group`). 새로 고침 뒤에도 주소가 남는다(mock 저장소는 새로 고침에 비워져 다시 들어왔다) |
| `390-06-group-published.png` | 운영자가 조 편성을 공개하고 **28.5초 뒤**(화면 조작 없음, 주기 확인) 홈 내 조 카드가 "3조"로 바뀜. 조장이라 "조원 현황" 바로가기가 보임 |
| `390-07-me.png`·`390-08-me-edit.png`·`390-09-me-saved.png` | 내 정보: 낸 답, 고치기(전화번호는 읽기만), 저장 뒤 revision 2 |
| `390-10-me-closed.png` | 신청·수정을 모두 닫은 뒤 내 정보를 다시 열면 고치기가 없고 안내가 보임 |
| `390-11-offline.png` | 오프라인: "연결이 끊겼어요 · 마지막 갱신 HH:mm" |
| `desktop-*.png` | 1280px. 가운데 좁은 폭(최대 560px)과 하단 탭 |

전체 페이지 캡처라 고정된 하단 탭이 캡처 중간에 찍힌 것은 캡처 방식 때문이다(화면에서는 맨 아래에 붙어 있다).

화면이 숨겨졌을 때 멈춤, 실패 시 두 배 간격, `401` 처리는 가짜 타이머 단위 시험(`useParticipantUpdates.test.tsx`)으로 확인했고 이 캡처에는 없다.
