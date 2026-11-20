# 내 정보(A5) — 실제 서버 클릭(로컬)

- 이슈: [#427](https://github.com/BeomhyunPark/SCENE/issues/427), 화면 틀 [#425](https://github.com/BeomhyunPark/SCENE/issues/425)
- 날짜: 2026-11-20
- 방법: 이 브랜치의 백엔드를 `local` 프로파일(PostgreSQL 17, Docker)로 띄우고 `VITE_API_MOCK=0` 개발 서버에서 Playwright(390px)로 클릭. 운영자 API로 수련회 행사를 만들고 진행 중으로 바꾼 뒤 신청서를 열었다. 기록: [click-log.txt](click-log.txt)
- **`GET /participant/home`·`/participant/updates`는 아직 서버에 없다(B2).** 서버는 없는 참가자 경로에 `401`을 주므로, 그대로 두면 화면이 세션이 끊긴 것으로 보고 들어오기 화면으로 간다(의도한 동작). 그래서 이 두 경로만 브라우저에서 계약 §3·§4 모양으로 대신 답하고, 나머지(`me`, `check-in`, `group`, `application` GET·PUT, 로그아웃, 신청, 들어오기)는 실제 서버다.

| 파일 | 확인한 것 |
|---|---|
| `01-home.png` | 공개 신청 → "내 신청 보기" → 홈(신청 응답의 쿠키로 바로 들어간 상태), 실제 도착 QR |
| `02-me.png` | 내 정보: 실제 서버의 낸 답 |
| `03-me-saved.png` | 또래 96 → 97 저장. `PUT /participant/application` 200, 서버에 이전 revision이 `SUPERSEDED`, 새 revision이 `SUBMITTED`로 남음 |
| `04-me-closed.png` | 운영자가 신청 받기·수정 받기를 모두 끈 뒤 내 정보를 다시 열면 고치기가 없고 안내가 보임. 고치기 주소로 직접 가도 내 정보로 돌아감 |

로그아웃 뒤 이름·전화번호·숫자 6자리로 다시 들어오면 마지막 탭(`/me`)이 열린다.

못 한 것: B2 병합 뒤 `home`·`updates`까지 실제 서버로 확인하는 것(조 편성 공개 30초 반영 포함), 운영 서버 확인.
