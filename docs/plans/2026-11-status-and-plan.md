# SCENE 현황 진단과 다음 계획 (2026-11-02)

기준은 `main` `b53248a`(2026-10-21)다. 이 문서는 읽기 전용 진단과 계획이다. 제품 결정이 아니며, 어떤 결정의 상태도 바꾸지 않는다. 여기와 [제품 결정](../product/PRODUCT_DECISIONS.md)·[Operator API](../../backend/docs/api.md)가 다르면 그 문서가 이긴다. 문서 충돌은 고치지 않고 보고만 한다.

표기는 두 가지다. **[V]**는 파일, 코드, git 또는 GitHub API에서 직접 확인한 사실이다. **[I]**는 읽은 내용으로 추론한 것이다. 라인 번호는 `b53248a` 기준이다.

## 1. 핵심 요약

1. **진행 상태.** 9/30 baseline 뒤 3주 동안 백엔드(Spring Boot 4.1.1, Java 25, MyBatis, Flyway V1–V7, HTTP 핸들러 56개)와 프론트(React 19, Vite 8)를 만들었다. 운영자 핵심 흐름과 참가자 신청·재입장은 서버까지 연결돼 있다. 10/21 이후에는 dependabot 외 활동이 없다. [V]
2. **이전 작업 평가.** 코드·테스트·자체 차이 기록은 탄탄하다. 반면 결정 로그의 상태 라벨, 대체 관계 표시, 아키텍처 문서 동기화는 약하다.
3. **주요 문제(High 4).**
   - 개발용 로그인이 prod에서도 열려 있다.
   - 종료된 행사에도 공개 신청이 들어갈 수 있다.
   - "구현하지 않는다"는 baseline 결정이 그대로 남은 채 구현이 진행됐다.
   - CONFIRMED와 본문 "수락 전"이 충돌한다.
4. **OPEN 결정.** 다음 구현 전에 정할 것이 10개, 기능 착수 때 정해도 되는 것이 9묶음이다.
5. **추천 다음 단계.** PR #200(DEC-067)을 정리하고, 공개 신청 lifecycle 검사를 고치고, baseline 정합 문서를 결정한 뒤, 신청 목록 화면으로 간다.

## 2. 타임라인

로컬 clone은 shallow라 [V] GitHub `main` 이력으로 확인했다.

| 날짜 | 내용 | 대표 커밋·PR |
| --- | --- | --- |
| 09-30 | 문서 baseline. README 재구성. 정책 검토 #3–#9 반영(DEC-028–059). 프로토타입 감사 근거 보존 | `b08cacd`, `13ef634`, `418a1d7` |
| 10-01 | DEC-060(행사 전용 협력자·초대), DEC-061(보존·삭제·Export 계약) | PR #28 |
| 10-02 | GitHub Actions(docs-check, backend, frontend, ci-ok). 백엔드 골격 P0-01. DEC-062(업무), DEC-063(lifecycle). 개인별 권한(#39). lifecycle·인계·탈퇴·업무 서비스 계층. profile, 로컬 시드, RFC 9457, X-Request-Id | PR #38, #42, #46, #47–#51 |
| 10-06 | DEC-064(참가자 링크 접근 키), DEC-065(업무 오류 순서·대행 사유). 페이지 크기 제한. 업무 쓰기 권한. 인계 수락 | PR #55, #57, #64–#69 |
| 10-07~08 | 운영자 HTTP: 탈퇴, Owner 이전, 인계 자동 완료(60초), 행사 생성·목록, 신청서, 공개 신청 제출, 신청 읽기 | PR #91–#119 |
| 10-08~15 | 프론트 셸, 공개 화면(정적: 로그인·가입·조직 찾기·비밀번호 등), 행사 생성·홈, 참가 시작, 신청 확인. trail 설정. DEC-066(AI 포함, C1·C7) | PR #125–#174 |
| 10-16~20 | API 클라이언트·MSW. 개발용 로그인 진입. 업무·신청서 연결. 초대 수락. 조직 나가기. 행사 종료·회고(mock). 참가자 신청·재입장. 인수인계 기록 | PR #180–#196 |
| 10-20~21 | DEC-066 Laya 후속, DEC-067(개발용 로그인 profile 제한·세션 쿠키). 구현 PR #200은 **미머지** | PR #197, #198, #200 |
| 10-21 이후 | dependabot PR #188, #201, #202만 열림 | — |

## 3. 현재 구현 범위

근거: [2026-10-20 인수인계](../handover/2026-10-20.md), [Operator API](../../backend/docs/api.md). 코드 점검으로 대조했다. [V]

- **화면과 서버가 연결된 것**
  - 개발용 로그인
  - 행사 목록·생성·홈
  - 업무(추가·담당·완료·다시 열기·취소·삭제, 고정 템플릿 제안)
  - 행사당 신청서 하나(질문 편집, 열기·닫기, 로컬 개인정보 경고)
  - 초대 미리보기·수락
  - 조직 나가기
  - 행사 종료(Owner)
  - 공개 신청과 접근 키 재입장(세션, `me`, 로그아웃)
- **서버만 있고 화면이 없는 것**
  - 초대 생성·재발송·취소
  - 운영자 추가·역할·권한 편집
  - Owner 이전 요청·수락·거절·취소
  - 신청 목록·상세
  - reopen·archive·unarchive
  - Space Owner 대행
- **서버에도 없는 것**
  - 비밀번호 로그인, SMTP
  - 체크 항목 추가
  - 참가자 조회(`me` 밖), 공지·일정
  - 회비·조·방·차량·체크인
  - Export, 회고, 공간 설정
  - 기간·장소·유형 PATCH
  - 공간 소유권 이전, 접근 키 재발급
- **화면이 정적인 것.** `/`, `/signup`, `/verify-email`, `/find-organization`, `/join-pending`, `/register-organization`, `/forgot-password`, `/reset-password`
- **회고.** `GET/PUT …/retrospective`는 MSW `unverified`만 있다.
- **AI.** 업무 제안은 고정 템플릿, 질문 개인정보 경고는 키워드 규칙이다. 둘 다 LLM 호출이 없다(`frontend/src/ai/`).

## 4. 이전 작업 평가

**잘된 점**
- DEC-028–063이 대부분 특정 이슈 코멘트를 근거로 연결한다.
- 테스트가 촘촘하다. 백엔드 IT 30여 개가 Testcontainers Postgres에서 돈다. 권한 매트릭스 회귀 테스트와 ArchUnit이 있다. 프론트 테스트 파일은 24개다.
- [Operator API](../../backend/docs/api.md)가 "아직 없는 경로"와 "결정 문서와 다른 점"을 스스로 기록한다.
- mock은 `unverified`로 표시하고, 없는 경로를 숨기지 않는다.
- 접근 키·초대 토큰 취급(fragment, 해시 저장)이 결정 문서와 맞는다.
- CI가 실제로 돈다. 문서 링크와 검증 JSON의 passed == total을 검사한다.

**약한 점**
- 결정 로그의 상태 라벨이 실제 합의 수준을 반영하지 못한다. CONFIRMED 하나에 접미사만 붙여 쓴다.
- 뒤 결정이 앞 결정을 바꿔도 앞 결정에 표시가 없다. `SUPERSEDED`를 한 번도 쓰지 않았다.
- `docs/architecture/`가 10/06 무렵에 멈췄다. 현재 계약은 사실상 `backend/docs/api.md`가 맡는다.
- 근거가 레포 밖에 있는 경우가 많다. "현 결정(개발 리드 전달)", 단톡방, chatgpt 대화, Gate 문서, MVP 초안이 그렇다.

## 5. 문제 목록

### High

**H1. 개발용 로그인이 모든 profile에서 열려 있다** [V]
- 무엇이 문제인가
  - `POST /api/v1/operator/auth/login`이 `permitAll`이다(`backend/src/main/java/app/scene/common/security/SecurityConfiguration.java:80`).
  - 자격 증명 없이 존재하는 아무 `users.id`로 로그인된다(`identity/OperatorSessionController.java:34-53`).
  - main 코드에 `@Profile` gate가 없다.
- 이 상태에서 생기는 일
  - 로그인 body의 `email`이 세션에 그대로 들어간다. 초대 수락은 이 값과 비교한다(`event/invitation/EventInvitationService.java:223-228`). 그래서 초대 이메일 확인을 우회할 수 있다.
  - 로그인 때 session id를 바꾸지 않는다. [I] 세션 고정(fixation)에 노출된다.
  - 쿠키 이름이 `placeholder-operator-session`과 `placeholder-participant-session`이다(`backend/src/main/resources/application.yml:33-36`). prod profile도 덮어쓰지 않는다.
  - 프론트는 `DEV || VITE_DEV_LOGIN === "1"`이면 켜진다(`frontend/src/devLogin.ts:2`). [I] 시드 UUID가 production bundle에 들어간다.
- 현재 상태
  - DEC-067(10-21)에서 고치기로 결정했다. 구현 PR #200은 열린 채 머지되지 않았다. #199가 Review에 있다.
  - CD가 없어 배포 경로가 아직 없으므로 당장은 잠재 위험이다. 운영 배포 전 차단 항목이다.

**H2. 공개 신청 제출이 행사 lifecycle을 보지 않는다** [V]
- `PublicApplicationService.submit`(`event/application/PublicApplicationService.java:70-83`)은 신청서가 있는지와 `acceptingApplications`만 확인한다.
- `ErrorCode.EVENT_ENDED`는 정의만 있고, `ErrorCode.java` 밖에서는 쓰지 않는다.
- `forms.accepting_applications`를 바꾸는 곳은 신청서 PATCH(`mapper/FormMapper.xml:13`)뿐이다. 행사 종료 경로는 이 값을 건드리지 않는다.
- [I] 따라서 신청서를 연 채로 종료하거나 보관한 행사도 계속 신청을 받는다. DEC-063 계약(종료 뒤 신청 409 `EVENT_ENDED`)과 어긋난다.
- 공개 신청서 읽기와 ENDED·ARCHIVED 조합을 시험하는 테스트가 없다.

**H3. 단계 baseline이 실제 상태와 충돌한다** [V]
- 아래 문서가 모두 "구현하지 않는다"고 적고 있다.
  - DEC-005(`PRODUCT_DECISIONS.md` L123-131): Backend/Frontend 구현·DB Schema·API 설계를 하지 않는다.
  - DEC-024(Discovery).
  - DEC-027(L708-710): Technical Design·Implementation에 들어가지 않는다.
  - 문서 상단 배너(`PRODUCT_DECISIONS.md`, `PRODUCT_DEFINITION.md`, `PROJECT_CONTEXT.md` L3): "Technical Design / implementation 전".
  - `architecture-v0.1.md` L4·L32: scaffold·migration·API 구현을 포함하지 않는다.
- 그런데 코드는 있고, 구현을 시작하기로 한 결정은 어디에도 기록이 없다.
- 보완은 하나뿐이다. `docs/README.md` L5가 "'implementation 전'은 그 문서를 적을 때의 상태"라고 적는다. 결정 로그 자체는 그대로다.
- 같은 유형의 낡은 문장: DEC-060 L1807, DEC-062 L1885, DEC-063 L1921, DEC-064 L1963, DEC-065 L2002, DEC-066 L2059, `data-model-v0.1.md` L199·L235.

**H4. CONFIRMED 라벨과 본문이 어긋난다** [V]
- DEC-063(L1893-1921)은 `CONFIRMED — 기술 계약 (QA·현 수락 전. 서버 구현은 #2 게이트 뒤)`이다. 그런데 #2는 열려 있고 lifecycle 서버 구현은 끝났다.
- DEC-061(L1819)은 `CONFIRMED — 기술 계약 (기간 값은 미정)`이다. 핵심 값이 미정이고, 법무 검토 뒤 다시 열 수 있다고 적었다(L1828).
- DEC-032(L858, L866)는 `CONFIRMED — 현재 전제`인데 본문에 "고민 중"이 있다.
- DEC-029(L780)는 CONFIRMED 안에 "MANAGER/STAFF 기본 집합 미확정, 백엔드 리드 초안 대기"를 담고 있다.

### Medium

**M1. 아키텍처 문서가 코드보다 뒤처졌다** [V]
- `data-model-v0.1.md`에 없는 것
  - `operator_notices`, `participant_sessions`, `spring_session*`
  - V7의 `events.start_date/end_date/place/event_type`
  - `members` 복합 PK와 `status ACTIVE/LEFT`
  - `forms.accepting_applications`(문서는 OPEN), CUSTOM 질문 1개 제한
- §1 Domain map(L9-19)에 없는 것: `event_invitations`, `event_lifecycle_transitions`, `owner_transfers`.
- `api-architecture-v0.1.md`
  - 참가자 세션·`me`·로그아웃을 Phase 3로 적는다(L161, L1208, L1217).
  - Owner 이전 경로 5개가 없다.
  - 오류 코드 목록(L59-79)과 `ErrorCode.java`가 양쪽으로 다르다. 문서에만 있는 코드가 9개 이상, 코드에만 있는 코드가 15개 이상이다.
  - §19 경계 트리(L802-832)가 낡았다.
- `security-privacy-v0.1.md` L50의 쿠키 이름이 DEC-067을 반영하지 않았다.
- 차이는 `backend/docs/api.md` L1019-1025가 일부 기록한다.

**M2. 합의 흔적이 약한 CONFIRMED가 많다** [V]
- 근거가 "현 결정(SCENE 개발 리드 전달)", "단톡방 5번 항목", "SCENE 구현 리뷰 2026-10-21(S1~S6, S8)"뿐이고 링크가 없다.
  - 해당 결정: DEC-064, DEC-065(이슈만 링크), DEC-066, DEC-067, DEC-029·DEC-060 추가분
  - 아키텍처 문서의 "현 결정 10/2·10/6 D1–D6"도 같다.
- DEC-001–024에는 날짜·근거·합의 흔적이 없다. 결정 로그 템플릿(§16)과도 맞지 않는다.
- DEC-025–027의 근거인 "Product Definition Gate v0.1"은 레포에 없다.
- `PRODUCT_DEFINITION.md` §5.1·§5.2·§5.5·§12의 "CONFIRMED" 표기에는 대응하는 DEC가 없다. DEC-066은 §5.5를 구속 조건으로 인용한다.

**M3. 대체·변경 관계를 표시하지 않았다** [V, 해석 일부 I]
- `PRODUCT_DECISIONS.md` §1은 `SUPERSEDED`와 `DEPRECATED`를 정의만 하고 쓰지 않는다.
- DEC-049(L1425): 조직 Owner 대행은 부재·복구 상황에서만이다. DEC-063(L1905, L1917)은 사유·audit·알림이 있으면 언제든 대행할 수 있게 넓혔다. DEC-049에는 표시가 없다.
- DEC-034(L930): 마지막 Owner만 이전 없이 떠날 수 없다. DEC-063(L1908)은 공동 Owner가 있어도 409 `OWNER_ROLE_HELD`다. [I] 더 엄격해졌지만 맞춰지지 않았다.
- DEC-053은 unarchive 권한을 열어 뒀다. DEC-063은 이를 정했지만 `event-lifecycle-review.md` L19는 그대로다.
- DEC-054–059 Consequence(6회 반복)는 "행사 삭제의 조직 Owner 제한은 제안"이라고 적는다. DEC-061 Context(L1823)는 확정이라고 적는다. `data-retention-export-review.md` L49는 여전히 제안이다.
- `organization-entry-review.md` L35는 "초대 7일을 상수로 구현하지 않는다"고 적는다. DEC-060은 7일 TTL을 확정했다.
- DEC-029 원문의 "OPEN" 문장(L767, L775)과 추가분(L777-780)이 한 결정 안에서 충돌한다.

**M4. 권한 적용이 문서와 다르고, 확인 코드가 흩어져 있다** [V]
- 신청 읽기 문서(`api-architecture-v0.1.md` §7 L245-246)는 `APPLICATION_READ`를 요구한다. 코드는 `EVENT_READ` 또는 Space OWNER/ADMIN을 확인한다(`OperatorApplicationService.java:101-112`). `api.md` L876에 기록은 있다.
- Space ADMIN이 읽을 수 있는 범위가 경로마다 다르다.
  - 행사·신청서·업무·신청 읽기는 Space OWNER와 ADMIN을 모두 허용한다.
  - lifecycle 읽기는 Space OWNER만 허용한다(`EventAccessGate.java:75-83`).
  - [I] `GET spaces/{spaceId}/events/{eventId}`는 `event_users` 행을 요구하므로, 운영자 행이 없는 ADMIN은 404를 받는다. `GET events/{eventId}`는 200이다.
- "조직 관리자"의 정의도 문서마다 다르다. DEC-028은 전체 조회를 허용한다. security L208과 API L1035는 권한 조회에서 Space ADMIN을 제외한다.
- `mayRead`·`allows` 류 확인이 서비스 5곳 이상에 손으로 복제되어 있다. [I] 이미 서로 어긋났다.

**M5. MVP Scope는 OPEN인데, 결정들은 MVP를 전제로 쓰였다** [V]
- `PRODUCT_DECISIONS.md` §17 L573, `PRODUCT_DEFINITION.md` L287, `PROJECT_CONTEXT.md` L477은 MVP Scope를 OPEN으로 둔다.
- DEC-064("MVP 참여자 인증")와 DEC-066("MVP+AI")은 MVP가 있는 것처럼 쓰였다.
- 초안 `/workspace/scene/mvp-scope-draft.md`는 레포 밖에 있다(`ai-feature-proposal.md` L143).

**M6. 검증 기록과 이슈 상태가 맞지 않는다** [V]
- [repair-status](../test_results/repair-status.md) L5·L32는 D01–D12(#13–#24)를 "Review 유지, 실제 Present 클릭 남음"으로 적는다. GitHub에서 #10과 #13–#24는 모두 닫혀 있다.
- [I] 문서가 낡았거나, 재검증 없이 닫았다. 후자라면 AGENTS.md의 Review 규칙에 어긋난다.
- 검증 수: repair-status L30은 D06–D12를 48/48로 적는다. `d06-d12-reaction-check.json`은 66건이다(D09 20건, D14 9건 포함).
- 실제 Present 클릭 근거는 `d02-present/`(D02)뿐이다.

**M7. DEC-066(AI)의 라벨과 실제 범위가 다르다** [V, 일부 I]
- 큰 OPEN 블록(L2030-2038)을 안은 채 CONFIRMED다. OPEN에는 provider, 미국 재위탁 동의·DPA(한국 PIPA 조항 없음), 비용 한도, 필드 allowlist, 조직별 on/off, 한국어 평가셋이 들어 있다.
- 결정 이유 L2055 "AI가 없으면 사용자가 도입하지 않는다(현)"는 시장 주장이다. 이를 받치는 RES·HYP가 없고, DEC-007·008의 근거 규칙과 충돌한다.
- 10-20 Laya 후속(L2041-2047)은 출하 범위를 바꿨는데 결정자 표시가 없다. [I] 첫 범위는 모델 없이 동작한다(고정 템플릿과 로컬 규칙).

**M8. 초대 메일러가 운영 코드 안에 있다** [V]
- `CapturingInvitationMailer`(`event/invitation/CapturingInvitationMailer.java`)는 운영 `@Component`다.
- 원문 토큰이 든 fragment 링크를 프로세스 메모리 리스트에 제한 없이 보관한다.
- SMTP가 없어서 초대 링크를 실제로 전할 방법이 없다.

**M9. MANAGER/STAFF 기본 권한이 미확정이라 기능이 사실상 Owner 전용이다** [V]
- `RoleDefaults.java`: MANAGER는 `EVENT_READ`와 `TASK_WRITE`, STAFF는 `EVENT_READ`만 갖는다.
- [I] 그래서 `FORM_WRITE` 등은 사실상 OWNER(또는 개별 GRANT)만 쓸 수 있다. trail learning 2026-10-16에도 같은 기록이 있다.

### Low

- **L1. 문서 검사 스크립트의 범위가 좁다.**
  - `scripts/check_docs.py`는 앵커를 확인하지 않는다. `.trail/`, `.github/` 같은 점 폴더도 건너뛴다.
  - docstring이 "아직 레포에 없는 제안 스크립트"라고 적는데, 실제로는 CI가 돌린다. 이번 점검에서 따로 확인한 깨진 앵커는 0건이다. [V]
- **L2. CI·devops 주석이 낡았다.**
  - `docs-ci.yml` L1은 "docs only"라고 적는다.
  - `ci.yml` L8은 Frontend를 "UNDECIDED"로 적는다.
  - `ci-cd.md` L22-23은 scaffold 이전 시점 기준이다.
  - `dependabot.yml`의 npm 블록이 주석 처리되어 있다.
- **L3. 버전 주석과 실제 의존성이 다르다.**
  - `libs.versions.toml` L2와 `backend/README.md` L3은 "4.0"이라고 적는데, 실제는 Spring Boot 4.1.1이다.
  - zod와 react-hook-form은 설치만 되어 있고 쓰이지 않는다(인수인계 문서가 사용 금지로 정했다).
- **L4. 경로 표기가 서로 맞지 않는다.**
  - API L463에 `{operatorId}`가 남아 있다(L208에서 `{userId}`로 정리했다).
  - Export 경로가 두 가지다(L742-743, L996-997).
  - spaces와 events 중첩 금지 규칙(L15)이 두 곳에서 깨졌다: L995 예시와 코드의 `GET spaces/{spaceId}/events/{eventId}`.
  - DB 상태는 `DECLINED`인데 경로는 `/reject`다.
  - `DATA_RETENTION_MANAGE`는 보류인데 L744에서 사용한다.
- **L5. 상태 어휘가 흔들린다.**
  - RES-010이 `UNKNOWN`이다.
  - HYP-001–006에는 Status가 없다.
  - Evidence Type `HYPOTHESIS` 정의가 DEC-007과 RESEARCH §3에서 충돌한다(architecture L90에 OPEN으로 인정됨).
  - DEC-008의 DEFERRED·REJECTED는 쓰이지 않는다.
- **L6. 색인과 외부 근거.**
  - `docs/README.md` 색인에 `ai-feature-proposal.md`가 없다.
  - 레포 밖 근거를 참조한다: `PROJECT_INSTRUCTIONS.md`, `chatgpt.com/c/…`(architecture L11), Gate v0.1.
  - RESEARCH.md backlog(L793, L801-803)가 낡았다.
- **L7. 모듈 경계가 약하다.**
  - `event.lifecycle`과 `event.task`가 서로를 참조한다.
  - `space` mapper가 `tasks`와 `owner_transfers`를 SQL로 갱신한다.
  - ArchUnit 규칙은 최상위 패키지 사이만 검사한다. [V]
- **L8. rate limit이 일부에만 있다.** `participant-sessions`와 login에는 rate limit이 없고, 초대에만 있다. 접근 키가 256-bit라 위험은 낮다. [V]
- **L9. 프론트 테스트·mock의 빈틈.**
  - MSW 기본 핸들러에 종료·초대·탈퇴가 없다. [I] `VITE_API_MOCK=1` 브라우저 실행에서는 이 흐름이 네트워크로 빠진다.
  - 알려진 `findByRole` flaky가 있다.
  - #130(SceneException serial 경고)이 남아 있다.
- **L10. dependabot PR이 대기 중이다.** #188(spotless), #201(gradle wrapper), #202(spring)가 열려 있다.
- **L11. 공개 신청 제출에 audit 행이 없다.** 의도된 결정이다(`PublicApplicationService.java:31-32`). 문서 §7 L262의 트랜잭션 설명과는 다르다.

## 6. OPEN 결정사항

### A. 다음 구현 전에 정해야 하는 것

| # | 항목 | 출처 | 막는 작업 |
| --- | --- | --- | --- |
| A1 | PR #200 머지 여부와 운영자 세션 TTL(지금은 라이브러리 기본 30분) | DEC-067 L2096-2097, #199, `api.md` L32 | 모든 비로컬 배포, H1 |
| A2 | MANAGER/STAFF 기본 권한 집합 | DEC-029 L780, security L21·L27, API L1029·L1089 | 신청 목록, 초대 생성, 운영자 관리 화면 |
| A3 | 종료·보관된 행사의 공개 신청: 종료 시 신청서 자동 닫힘 여부, `EVENT_ENDED`와 `FORM_CLOSED`의 우선순위 | DEC-063, API L81 (`FORM_CLOSED`/`APPLICATION_CLOSED` OPEN) | H2 수정 |
| A4 | DEC-063의 QA·수락 상태 | DEC-063 L1897·L1921, #2 | baseline 정합 |
| A5 | 결정 근거 기록 규칙("현 결정"의 지위, 링크 요건)과 단계 기록(구현 착수) | DEC-005·024·027, L3 배너, `PRODUCT_DECISIONS.md` L3 "정합화 검토 필요" | 이후 모든 DEC |
| A6 | 현재 계약의 정본: `backend/docs/api.md`와 `docs/architecture/` 중 무엇인가, 아키텍처 문서를 갱신할지 동결할지 | handover L3, `docs/README.md` L5 | 문서 동기화 |
| A7 | 다음 slice 범위와 MVP Scope 최소 확정(레포 밖 초안 반입 여부) | §17 L573, DEC-027 L709 | P1 순서 |
| A8 | MVP 초대 전달 방식(링크 복사 또는 SMTP) | `api.md` 아직 없는 경로, M8 | 초대 생성 화면 |
| A9 | 비밀번호 로그인·이메일 검증 방식 | DEC-067 L2097, DEC-036 L1008 | 개발용 로그인 밖의 운영자 진입, 운영 배포 |
| A10 | Space ADMIN이 읽을 수 있는 범위("조직 관리자"와 시스템 역할의 대응) | DEC-028 L743, security L37·L208 | 권한 일원화(P1-4) |

### B. 해당 기능 착수 때 정해도 되는 것

| # | 항목 | 출처 | 언제까지 |
| --- | --- | --- | --- |
| B1 | 데이터별 보존 기간, 삭제 유예, 백업 만료, Export 파일 수명, 기기 임시 저장, 미성년자·보호자 | DEC-061 L1819·L1845, #12, security L199 | Export·삭제·익명화 전 |
| B2 | 조 편성 저장·공개·변경·동시 수정·복구 계약(버전, Idempotency, 이력) | DEC-040–048, API L137·L326 | 조 편성 전 |
| B3 | 알림 전달 채널, 실패, 재시도 | DEC-042 L1206, DEC-063 L1921, API L1158 | 공지·알림 전 |
| B4 | 접근 키 TTL, 참가자 세션 TTL, 키 복구·재발급 경로, rate 수치 | DEC-064 L1951·L1957, security L65·L68 | 참가자 실사용 전 |
| B5 | timezone | data-model L60, API L26 | 일정 기능 전 |
| B6 | Leader·Class Staff identity, 리더 역할 | data-model L36·L38, API L599·L734, §20 #7 | 조·반 기능 전 |
| B7 | 참가자 수동 추가, 참가 취소·재참가, 참가자 status | API L230-231, DEC-063 L1909, data-model L31 | 참가자 관리 화면 전 |
| B8 | AI provider, 재위탁 동의·DPA, 비용 한도, allowlist, 조직별 on/off, 한국어 평가 | DEC-066 L2030-2038, `ai-feature-proposal.md` §5 | 실제 모델 도입 전 |
| B9 | 사업·플랫폼: 가격·과금 단위, 첫 고객군, 네이티브 앱, 오프라인, 통합, 패키지 이름(`BLOCKED-BY-DECISION`), CD·호스팅 | DEC-018, §17, `build.gradle.kts` L7, `ci-cd.md` L161-165 | 출시 준비 |

이 밖에 리서치 OPEN(H1–H6, HYP-001–006, PRODUCT_DEFINITION §10)도 있다. 구현 착수를 막지 않으며 제품 가설 검증 단계에서 다룬다.

## 7. 다음 계획

각 작업은 브랜치와 PR 단위로 한다. 관련 이슈와 프로젝트 #5에 연결한다. AGENTS.md에 따라 검증 종류(문서, 서버 IT, 실제 클릭)를 구분해 기록한다.

### P0 — 지금

| ID | 목적 | 선행 조건 | 산출물 | 작은 단위 |
| --- | --- | --- | --- | --- |
| P0-1 | 현황을 레포에 남긴다 | 사용자 확인 | 이 문서 | 1 커밋 |
| P0-2 | H1을 닫는다 | A1 결정 | PR #200을 main에 재정렬·머지, #199 종료 | ① #200 diff 검토 ② main rebase와 `./gradlew check`·`pnpm test` ③ 실제 브라우저 로그인 클릭 확인(현재 미검증) ④ 머지 |
| P0-3 | H2를 닫는다 | A3 결정 | 공개 신청 lifecycle 검사와 IT | ① 제출·읽기에 ENDED·ARCHIVED 검사 ② 종료 시 신청서 처리(A3 결과대로) ③ IT 추가 ④ `api.md` 갱신 |
| P0-4 | baseline 정합을 결정한다(H3·H4·M3) | A4, A5 | 결정 문서 PR. 라벨 변경은 사용자 결정분만 | ① 단계·구현 착수 DEC 초안 ② 대체 관계 표시 목록 확정 ③ DEC-063·061·032 라벨 처리 ④ 근거 기록 규칙 |
| P0-5 | 비Owner 운영자 기능의 범위를 연다 | A2 | `RoleDefaults` 결정과 문서 반영 | ① MANAGER/STAFF 표 결정 ② 문서 반영 ③ 코드와 회귀 테스트 |

### P1 — 다음

| ID | 목적 | 선행 조건 | 산출물 | 작은 단위 |
| --- | --- | --- | --- | --- |
| P1-1 | 신청 목록 화면(인수인계·DEC-067 순서 b) | P0-2, A2, APPLICATION_READ 정리 | 참가자 화면에 신청 목록·상세 | ① 권한 키 정리 ② 목록 화면 ③ 상세 ④ 테스트 |
| P1-2 | 초대 생성 화면(순서 c) | A8, P0-2 | 초대 생성·재발송·취소 화면, 메일러 처리 | ① 전달 방식 확정 ② `CapturingInvitationMailer`를 테스트 전용으로 분리 ③ 화면 ④ 테스트 |
| P1-3 | 아키텍처 문서를 코드에 맞춘다(M1) | A6 | data-model, API, security 갱신 또는 동결 표시 | ① data-model 테이블 V1–V7 ② API Phase 3·Owner 이전·오류 코드 ③ security 쿠키·세션 |
| P1-4 | 권한 확인을 일원화한다(M4) | A10 | 공통 read guard와 회귀 테스트 | ① 규칙 표 ② guard 추출 ③ Space ADMIN 테스트 |
| P1-5 | 검증 기록을 이슈 상태와 맞춘다(M6) | 사용자 확인(Q9) | repair-status 갱신, #2 상위 이슈 종료 조건 정리 | ① #13–#24 종료 근거 확인 ② 문서 갱신 ③ #2 하위 이슈 정리 |
| P1-6 | 의존성을 정리한다(L10) | 없음 | #188·#201·#202 처리, npm dependabot 활성화 | PR별 1건 |

### P2 — 나중

| ID | 목적 | 선행 조건 | 산출물 |
| --- | --- | --- | --- |
| P2-1 | 회고 저장 API(순서 d) | DEC-067의 draft 방침 재검토 | 회고 API, MSW `unverified` 제거 |
| P2-2 | 보존·Export·삭제 | B1, 법무·Privacy 검토, #12 | export_jobs, cleanup, 삭제 원장 |
| P2-3 | 남은 화면(#107: 조, 일정, 공지, 체크인) | B2, B3, B5, B6 | 기능별 상위·하위 이슈 |
| P2-4 | 실제 AI 모델 | B8 | provider 연동, 평가셋 |
| P2-5 | 도구·가드 정리 | 없음 | check_docs 앵커·점 폴더, ArchUnit 세분화, participant-sessions·login rate limit, #130, CI 주석 |
| P2-6 | 배포 | B9 CD·호스팅, P0-2, A9 | CD 활성화, 운영 profile 값 |

## 8. 사용자가 결정할 질문

1. 결정 로그의 "현"은 누구인가. "현 결정(SCENE 개발 리드 전달)"을 CONFIRMED의 근거로 인정하는가. 앞으로는 이슈 코멘트 링크를 필수로 할 것인가.
2. DEC-027 이후 구현을 시작한 것은 명시적인 결정이었는가. 새 DEC로 남길 것인가.
3. DEC-063의 QA·수락은 끝났는가. 끝나지 않았다면 라벨을 어떻게 표시할 것인가.
4. PR #200을 머지할 것인가. 운영자 세션 TTL을 얼마로 할 것인가.
5. MANAGER와 STAFF의 기본 권한은 각각 무엇인가.
6. 행사를 종료하면 신청서를 자동으로 닫을 것인가. 종료 뒤 신청의 응답은 `EVENT_ENDED`인가, `FORM_CLOSED`인가.
7. 현재 계약의 정본은 `backend/docs/api.md`인가. `docs/architecture/`는 갱신할 것인가, 이력으로 동결할 것인가.
8. 레포 밖 MVP 초안(`mvp-scope-draft.md`)을 레포에 넣고 MVP Scope를 정할 것인가.
9. #13–#24를 닫을 때 실제 Present 재검증을 했는가.
10. MVP의 초대 전달은 링크 복사로 충분한가, SMTP가 필요한가.
11. 모델 없는 첫 AI 범위(고정 템플릿과 로컬 규칙)를 DEC-066의 "AI 포함"으로 볼 것인가.
12. Space ADMIN은 어디까지 읽을 수 있어야 하는가.

## 9. 이번 진단의 한계

- 빌드와 테스트를 실행하지 않았다. 코드 판단은 정적 읽기 결과다.
- 프로젝트 #5 보드의 상태 필드를 읽지 못했다. 이슈의 open·closed만 확인했다.
- trail CLI가 이 환경에 없어 `.trail/learnings/`를 직접 읽었다.
- 레포 밖 근거(Figma, 단톡방, chatgpt 대화, `/workspace/scene/*`)는 확인할 수 없다.
- 제안: 이 문서를 [docs/README.md](../README.md) 진행 관리 목록에 연결할지는 사용자가 정한다. 이번에는 기존 문서를 수정하지 않았다.
