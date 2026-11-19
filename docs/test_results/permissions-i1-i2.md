# 운영자별 권한 화면과 역할 기본값 확인 (#394 I2, #395 I1, 2026-11-19)

브랜치 `claude/roadmap-i-permissions`. 결정은 DEC-079.

## 구분

| 종류 | 무엇 | 결과 |
| --- | --- | --- |
| 문서 작성 | DEC-079(역할 기본 권한 표, 권한 화면 규칙), api.md "운영자", source-guide 권한 표, api-architecture 보류 행 | 완료 |
| 서버 검증 | `./gradlew check` (Docker PostgreSQL 17, JDK 25). `PermissionEvaluatorTest`의 DEC-079 표, `OperatorPermissionHttpIT`의 MANAGER 기본값 응답·기본 키 GRANT 정리·STAFF `GROUP_WRITE` GRANT | 통과 |
| 화면 검증 | `pnpm lint`, `typecheck`, `test`(71 파일 525개), `build`. `operatorPermissions.test.ts`, `OperatorPermissionEditor.test.tsx` | 통과 |
| 실제 클릭 | 로컬 서버(bootRun local + `VITE_API_MOCK=0`)에서 Playwright, 스크립트 `permissions-click.cjs` | 통과 |
| 운영 서버 | 사용자 확인 몫 | 남음 |

## 실제 클릭 순서와 결과

준비(같은 세션의 API): Local owner가 새 행사를 만들고 활성화, 신청서를 열고 3명 신청, Local staff를 STAFF로 추가.

1. STAFF가 조 편성을 연다: "조 편성을 볼 권한이 없어요" (`GET …/group-board` 403 `FORBIDDEN`) → `permissions-1-staff-before-grant.png`
2. OWNER의 운영 멤버 화면: STAFF 행에 "역할 기본 권한"과 "권한" 버튼, OWNER 행에는 없음 → `permissions-2-owner-operators.png`
3. "Local staff 권한": 체크인만 켜짐("역할 기본") → `permissions-3-dialog-defaults.png`
4. "조 편성"을 켬: "개별로 더함" → `permissions-4-dialog-group-on.png`
5. 저장: "Local staff님의 권한을 저장했어요.", 행에 "개별 권한 1개 더함" → `permissions-5-owner-saved.png`. 서버 응답 `overrides.grants = ["GROUP_WRITE"]`, `effective = [CHECKIN_WRITE, EVENT_READ, GROUP_WRITE]`
6. STAFF가 편성판에서 "1조"를 만들고 김하늘을 골라 1조로 보냄: "1명을 1조로 보냈어요." → `permissions-6-staff-edited-board.png`. 서버 편성판 `boardVersion` 2, 김하늘 `groupId` 있음
7. 휴대폰 폭(390): 운영 멤버 → `permissions-7-phone-operators.png`, 권한 창 → `permissions-8-phone-dialog.png`. 본문만 스크롤되고 저장 버튼이 보인다. 페이지 가로 넘침 없음(scrollWidth 390)

## 사용자가 운영 서버에서 확인할 것

- 행사 OWNER로 운영 멤버 → 조 편성 담당자의 "권한" → "조 편성" 켜고 저장. 그 사람이 조 편성 화면을 열고 고칠 수 있다.
- 기존 MANAGER의 권한 창에 "일정 쓰기"·"공지 쓰기"가 "역할 기본"으로 켜져 있다(배포 즉시 모든 행사에 적용, DEC-079 §2).
