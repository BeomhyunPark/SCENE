# A8 신청 완료 안내 — 검증 기록 (#406)

2026-11-19, 클라우드 세션. 문서 작성 / 서버 검증 / 실제 클릭을 나눠 적는다. 운영 서버 확인은 하지 않았다(사용자 몫).

## 문서 작성
- `backend/docs/api.md`: 신청서 상세 `completionNotice`, `PUT …/forms/{formId}/completion-notice`, 신청 완료 응답 `completionNotice`, 참가자 홈(B2)에서 읽는 자리(계약만)
- `docs/product/PRODUCT_DECISIONS.md`: DEC-070 Follow-up 2026-11-19

## 서버 검증 (로컬, PostgreSQL 17 Testcontainers)
- `./gradlew check` 통과(JDK 25). 새 마이그레이션 V18, `ApplicationContextIT` 핀 18
- `PublicApplicationSubmitHttpIT.completionNoticeIsPlainTextReturnedOnSubmitAndStaysEditableAfterSubmit`: CRLF→LF·앞뒤 공백 자르기, `<b>`·링크 그대로, 공개 신청서 GET에 없음, 제출 응답에 있음, 신청 뒤(`locked`)에도 수정, 1001자·모르는 키·빠진 키·숫자 → 400, 1000자 저장, 빈 문자열·null → 지움, 없는 신청서 404
- `CompletionNoticeTest`: 정규화, 코드 포인트 길이, 제어 문자

## 프런트
- `pnpm lint`, `typecheck`, `test`(69 파일 516개), `build` 통과
- `EventRegistrationSetup.test.tsx`: 쓰기·미리보기·저장·1000자 넘김·비우기, 신청 뒤 수정, `FORM_WRITE` 없으면 읽기만
- `ParticipantApply.test.tsx`: 완료 화면에 글자 그대로(태그·링크가 요소가 되지 않음), 없으면 블록 없음

## 실제 클릭 (로컬 서버 `local` 프로필 + Vite `VITE_API_MOCK=0`, Playwright)
스크립트: `a8-completion-notice-click.cjs`. 행사·신청서 생성과 신청 열기는 같은 세션의 API로 하고(날짜 입력이 달력 선택이라), 그 뒤는 화면에서 누른다.

| 캡처 | 확인한 것 |
|---|---|
| `a8-completion-notice-1-empty.png` | 신청서 화면의 "완료 안내" 편집 칸(기존 "준비 중" 대체). "신청 기간"은 그대로 준비 중 |
| `a8-completion-notice-2-draft-preview.png` | 저장 전 문구가 미리보기의 "신청을 마친 화면"에 줄바꿈 그대로 보인다 |
| `a8-completion-notice-3-saved.png` | "안내 저장" → 저장했어요. 서버 저장값이 입력과 같다 |
| `a8-completion-notice-4-phone-form.png` | iPhone 13 폭에서 신청서 작성 |
| `a8-completion-notice-5-phone-done.png` | 신청을 마친 화면에 안내 블록. `<b>` 태그와 URL이 글자 그대로, 가로 스크롤 없음(390/390) |
| `a8-completion-notice-6-edit-after-submit.png` | 신청이 들어와 `locked=true`인 뒤에도 안내를 고쳐 저장 |

클릭 중 찾아 고친 것: 넓은 화면에서 붙어 다니는(sticky) 미리보기가 그 아래 칸의 완료 안내 편집기를 덮었다. 미리보기가 오른쪽 열을 세 줄 차지하게 바꿔 편집기가 왼쪽 열로 간다(6번 캡처).

## 사용자가 확인할 것
- 운영 서버 배포 뒤 실제 수련회 신청서에서 문구를 쓰고, 휴대폰으로 신청해 완료 화면에 보이는지
- 문구 길이 1000자, 링크를 누를 수 없게 글자로만 두는 것이 괜찮은지
