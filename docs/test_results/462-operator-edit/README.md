# A12 운영자 신청 고치기·직접 추가 확인 기록

- 날짜: 2026-11-25, 클라우드 세션
- 브랜치: `claude/a12-operator-edit-462` (`claude/week3-integration` 위)
- 이슈: #462 (상위 #378), #339, 결정 DEC-088

| 구분 | 무엇 | 결과 |
|---|---|---|
| 문서 작성 | DEC-088, api.md "운영자의 신청 고치기·직접 추가"·알림·audit 표, source-guide, 로드맵 5.1 A12 줄 | 작성 |
| 서버 검증 | `./gradlew check` (JDK 25, Testcontainers PostgreSQL 17). 새 `OperatorApplicationEditHttpIT` 3개, `AnswerEvaluatorTest` 1개, Flyway `27` | 통과 597개, 실패 0 |
| 화면 검증 | `pnpm lint`·`typecheck`·`test`·`build` | 통과, 테스트 98파일 732개 |
| 저장된 프로토타입(mock) | `OperatorApplicationEdit.test.tsx`(mock 핸들러로 고치기·직접 추가·권한 없음) | 통과 |
| 실제 클릭 | 로컬 서버(`local` 프로필, 빈 PostgreSQL 17에서 V1~V27) + Vite(`VITE_API_MOCK=0`). [flow.cjs](flow.cjs), 기록 [click-log.txt](click-log.txt) | 아래 단계 모두 통과 |
| 운영 서버 | 하지 않았다 | 사용자 확인 필요 |

## 한 흐름

| # | 단계 | 방법 | 결과 | 캡처 |
|---|---|---|---|---|
| 1 | 신청 3명(전체 참석), 1조 공개(조장 이나래), 301호에 김가람·이나래 | API | — | — |
| 2 | 신청 받기·수정 받기 끔 | API | — | — |
| 3 | 신청 상세 → "신청 고치기" | **운영자 화면(1440px)** | 닫힌 뒤에도 버튼이 보임 | 01, 02 |
| 4 | 부분 참석, 1일차 집회부터 · 2일차 저녁까지, 숙박 안 함 → 저장 | 운영자 화면 | "고친 내용을 저장했어요", 변경 이력 "운영자 Local owner가 고침", 동의 답 그대로 | 03, 04 |
| 5 | 읽는 곳 | API | 집계 부분 참석 0→1, 표 revision 2·`OPERATOR`, 숙소 다시 볼 것 `NOT_LODGING`·`ATTENDANCE_CHANGED`, 조장 조원 상세 `revisedByOperator`·`operatorEdited` true, 참가자 알림 "운영자가 내 신청을 고쳤어요", 참가자 내 신청 revision 2 | — |
| 6 | 참가 현황 표 "수정됨", 참가자 내 정보(390px) | 화면 | 고친 값, "지금은 신청을 고칠 수 없어요"(수정 닫힘) | 05, 06 |
| 7 | "참가자 추가" → 이름·전화·집회만 참석 → 추가 | 운영자 화면 | 임시 번호 6자리 한 번, 표에 "직접 추가" | 07, 08, 11 |
| 8 | 임시 번호로 들어오기 | 참가자 API + 휴대폰 | `pinChangeRequired: true`, 새 번호 정하기 화면 | 09 |
| 9 | 김가람 전화로 다시 추가 | 운영자 화면 | "이 전화번호로 이미 신청한 사람이 있어요" + "그 신청 열기" | 10 |

## 하지 못한 것

- 운영 서버·실제 휴대폰 확인.
- 참가자 알림함 화면에서 알림을 눌러 보는 것(B5 #463 몫). 서버가 알림을 쌓는 것까지만 확인했다.
- 현장 운영 화면(`EventField`)의 현장 등록 진입점: 만들지 않았다(다른 세션 작업과 겹침). 현장에서는 참가 현황의 "참가자 추가"를 쓴다.
