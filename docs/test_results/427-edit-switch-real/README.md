# 운영자 "신청 수정 받기" 스위치 — 실제 서버 클릭(로컬)

- 이슈: [#427](https://github.com/BeomhyunPark/SCENE/issues/427)(A5)
- 날짜: 2026-11-20
- 방법: main(#438 병합 뒤) 백엔드를 `local` 프로파일(PostgreSQL 17, Docker)로 띄우고 `VITE_API_MOCK=0` 개발 서버에서 Playwright로 클릭. 운영자(1280px·390px)와 참가자(390px)를 서로 다른 브라우저로 열었다. 행사·신청서 준비만 운영자 API로 했다. 기록: [click-log.txt](click-log.txt)

| 파일 | 확인한 것 |
|---|---|
| `01-operator-edits-on.png` | 신청서 화면: 신청 받는 중, "신청 수정 받기 · 받는 중" |
| `02-operator-applications-closed-edits-on.png` | "신청 닫기" 뒤에도 수정은 받는 중("신청은 닫혔지만 이미 낸 신청은 고칠 수 있어요") |
| `03-participant-edit-after-applications-closed.png` | 신청이 닫힌 뒤 참가자가 내 정보에서 고쳐 저장(또래 95 → 96) |
| `04-operator-edits-off.png` | "수정 닫기" → 받지 않음 |
| `05-participant-read-only.png` | 참가자가 내 정보를 다시 열면 고치기가 없고 "지금은 신청을 고칠 수 없어요" |
| `06-operator-390.png` | 운영자 휴대폰 폭 |

"수정 받기"로 다시 켜면 참가자 내 정보에 고치기가 다시 보였고, 서버 신청서는 `acceptingApplications=false`, `acceptingEdits=true`였다.

시험으로만 확인한 것: 행사 시작 전에는 "수정 받기"가 비활성(안내 문구), 서버가 `409 INVALID_STATE_TRANSITION`이면 안내(서버 문구는 보이지 않음), `FORM_WRITE`가 없으면 상태만 보이고 버튼이 없음, 끝난 행사는 "받지 않음"과 안내만.

못 한 것: 운영 서버 확인.
