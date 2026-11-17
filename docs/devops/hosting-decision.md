# SCENE 호스팅 결정 (#231)

- 상태: **결정 (2026-11-16)**. 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 집의 **Surface Pro 홈서버 + Cloudflare Tunnel**로 운영한다. 구성·준비·백업·배포 절차는 [홈서버 운영](home-server.md)에 있다.
- 이유: 비용. 두 클라우드 안은 월 약 $50~80(추정)이 든다. 홈서버는 이미 있는 기기와 Cloudflare(도메인 DNS가 이미 Cloudflare)로 추가 비용 없이 같은 출처 구성을 만든다.
- 배포: main에 병합하면 홈서버가 CI 통과를 확인하고 스스로 배포한다(2026-11-17 사용자 결정, #257). 동작과 한계는 [홈서버 운영](home-server.md)의 자동 배포 절에 있다.
- 스테이징: **따로 두지 않는다** (2026-11-16 사용자 결정). 11/30까지 홈서버에 배포해 실제 흐름을 리허설하고, 신청 시작(12/15) 전에 리허설 데이터를 지운다([홈서버 운영](home-server.md) 5절).
- 가장 큰 위험: 수련회 당일 집 정전·인터넷 장애. 대비는 전날 CSV 명단(#233), 공유기 UPS, Surface 배터리 제한 모드다([홈서버 운영](home-server.md) 2절).
- 아래 두 클라우드 비교는 **홈서버에 문제가 생겼을 때 옮길 곳의 기록**이다. 같은 날 두 세션이 따로 비교해서 추천이 다르다(부록 A는 GCP, 부록 B는 AWS Lightsail). 옮겨야 할 때 가격과 PostgreSQL 17 지원을 다시 확인하고 고른다.
- 작성일·가격 확인일: 2026-11-16. 관련: #231 (상위 #230)

## 부록 A. GCP 중심 비교 (2026-11-16, #241로 반영)

상태: **기록 — 채택하지 않음** (홈서버로 결정, 2026-11-16)

### 1. 추천안

**Google Cloud 서울(asia-northeast3) 리전 단일 구성**

| 구성 요소 | 선택 |
|---|---|
| 백엔드 | Cloud Run 서비스 (Java 25 컨테이너 이미지, 예: `eclipse-temurin:25-jre` 기반). stg `min-instances=0`, prod `min-instances=1` + startup CPU boost |
| DB | Cloud SQL for PostgreSQL 17, **Enterprise edition**. prod `db-g1-small`, stg `db-f1-micro`. 자동 일일 백업 + PITR(트랜잭션 로그) 켬 |
| 프런트엔드 | Cloud Storage 버킷에 Vite `dist/` 업로드 → 전역 외부 Application Load Balancer의 backend bucket |
| 도메인·HTTPS | 같은 LB에서 host 규칙으로 `stg.<도메인>`·`<도메인>`을 나누고 `/api/**`는 Cloud Run(serverless NEG), 나머지는 버킷. Google 관리 인증서 |
| 마이그레이션 | 같은 이미지를 Cloud Run Job으로 실행해 Flyway migrate만 수행한 뒤 서비스 배포 |
| 비밀값 | Secret Manager → Cloud Run 환경 변수로 주입 (`SCENE_DB_*`, OAuth client secret) |
| 배포 인증 | GitHub Actions OIDC → Workload Identity Federation (`google-github-actions/auth`). 장기 키 없음 |
| 이미지 저장소 | Artifact Registry (서울) |

추천 이유: 서울 리전에 데이터가 머물고, PG17과 PITR을 공식 문서에서 확인했으며, OIDC·비밀값·마이그레이션 Job을 한 콘솔에서 해결한다. Google OAuth 클라이언트도 같은 프로젝트에서 관리한다. 스테이징은 0까지 축소돼 거의 비용이 없다.

**왜 LB가 필요한가.** SCENE은 쿠키 3개(`SCENE_SESSION`, `SCENE_PSESSION`, `XSRF-TOKEN`, SameSite=Lax)를 쓰므로 프런트와 API가 **같은 출처**여야 한다. 그런데 Cloud Run 도메인 매핑은 서울 리전을 지원하지 않고, Firebase Hosting의 Cloud Run rewrite는 `__session` 외 쿠키를 제거한다. 그래서 같은 출처를 만들 방법은 LB(월 약 $18)뿐이다.

### 2. 비교표

| 기준 | A. GCP Cloud Run + Cloud SQL (서울) | B. AWS Lightsail 컨테이너 + Lightsail DB (서울) | C. 네이버 클라우드 (KR) | D. Fly.io / Render / Railway |
|---|---|---|---|---|
| 한국 리전 | 서울 ✅ | 서울 ✅ | 국내 ✅ | ❌ (Fly 도쿄, Render 싱가포르. 서울 없음) |
| Java 25 | 컨테이너라 무관 ✅ | 컨테이너 ✅ | 서버 직접 설치 또는 컨테이너 | 컨테이너 ✅ |
| PostgreSQL 17 | ✅ 공식 문서 확인 | ⚠️ 미확인 ("최신 메이저 제공"이라는 문구만 있음) | ⚠️ 미확인 | Fly MPG 도쿄 제공 여부가 자료마다 다름 |
| 백업·복구 | 자동 일일 백업 + PITR(기본 7일) ✅ | 자동 스냅샷·시점 복구 (요금 페이지 미확인) | 자동 백업 있음 (세부 미확인) | 서비스마다 다름 |
| 콜드 스타트 | stg 0까지 축소 시 수 초~십수 초. prod는 min 1로 회피 | 상시 실행, 콜드 스타트 없음. 단 0.25 vCPU에서는 Spring Boot 기동이 느림 | 상시 서버 | Fly는 auto-stop 설정에 따름 |
| 도메인·HTTPS | LB + 관리 인증서 (월 약 $18) | 컨테이너 서비스에 무료 인증서 포함 | 별도 LB·인증서 구성 | ✅ |
| GitHub OIDC | WIF ✅ | IAM OIDC 역할 ✅ | ⚠️ 미확인 (API 키 방식 위주로 보임) | 토큰 방식 |
| 비밀값 | Secret Manager 연동 ✅ | 배포 설정의 평문 환경 변수 | Key Management 별도 구성 | 플랫폼 secrets |
| Flyway 선실행 | Cloud Run Job ✅ | GitHub 러너에서 DB 접근 필요 (DB public 모드 노출) | 직접 구성 | release command 등 |
| 운영 부담 | 낮음 (초기 LB 설정만 다소 복잡) | 낮음 | 높음 (서버 관리) | 낮음 |
| 월 비용 (stg+prod) | 약 $80, 절약형 약 $50 | 약 $50~80 (컨테이너 크기에 따름, 일부 미확인) | 미확인 | 데이터 해외 보관이라 제외 |

### 3. 선택 기준

1. **개인정보 국내 보관**: 이름·전화번호·응답을 다룬다. 해외 리전(D)은 국외 이전 고지 부담이 생겨 제외했다.
2. **자동 백업 + 복구 확인**: #231 완료 조건이 "백업 복구 1회 확인"이다. 공식 문서로 PITR을 확인한 것은 A뿐이다.
3. **수련회 당일 체크인**: QR 체크인 때 첫 요청이 기동을 기다리면 안 된다. prod는 상시 1대(A: min-instances=1, B: 상시 실행)로 둔다.
4. **1인 운영**: 서버 OS 관리가 없는 관리형 서비스(A·B)를 우선했다. C는 국내 사업자라는 장점이 있지만 서버 관리 부담과 미확인 항목이 많다.
5. **CD 계획과의 정합성**: `migrate → backend → frontend → smoke` 순서가 A에서는 `Job 실행 → 서비스 배포 → 버킷 업로드 → curl`로 그대로 옮겨진다.
6. **B를 고를 조건**: 월 비용을 가장 낮게 고정하고 싶고, PG17 지원과 PITR을 콘솔에서 직접 확인한 경우. 이때 0.25 vCPU(Micro)는 Spring Boot에 빠듯하므로 0.5 vCPU 이상을 권장한다.

### 4. 비용 추정 (A, USD/월, 서울 정가, 세금 제외)

| 항목 | prod | stg | 근거 단가 (서울) |
|---|---|---|---|
| Cloud SQL 인스턴스 | g1-small 약 33.2 | f1-micro 약 10.0 | f1-micro $0.0137/h, g1-small $0.0455/h |
| SSD 10GB | 2.2 | 2.2 | $0.221/GB·월 |
| 백업·PITR 로그 | 약 1 | 약 0.5 | 백업 $0.104/GB·월 |
| Cloud Run | 약 13~18 (1 vCPU·1GiB 상시 1대 유휴 + 사용량 − 무료 등급) | 약 0~1 | 요청 기반, Tier 2: CPU $0.0000336/vCPU·s, 유휴 $0.0000035, 메모리 $0.0000035/GiB·s |
| LB (환경 공용) | 약 18.3 | (공용) | 전달 규칙 첫 5개 $0.025/h, 처리량 $0.008/GB |
| Artifact Registry·Secret Manager·Storage | 약 1 이하 | | Secret Manager 활성 버전 6개 무료, 이후 $0.06/버전·월 |
| **합계** | **약 $80 (환율 1,400원 가정 시 약 11만 원)** | | |

- 절약형 약 $50: prod도 f1-micro(−$23, SLA 미적용), 수련회 종료 후 prod `min-instances=0`, stg Cloud SQL은 쓰지 않을 때 중지(스토리지 요금만 남음).
- dev 환경은 별도 DB를 두지 않는다. stg 인스턴스 안에 `scene_dev` 데이터베이스를 따로 만들어 추가 비용을 없앤다.
- Cloud Run 무료 등급은 결제 계정마다 Tier 1 가격 기준의 할인으로 적용된다(180,000 vCPU·s, 360,000 GiB·s, 요청 200만 건).
- 예산 알림을 월 $100로 걸어 둔다.

### 5. 사용자가 할 일 (GCP를 골랐을 때, 지금은 쓰지 않음)

1. **Google Cloud 계정·결제**: 결제 계정을 만들고 카드를 등록한다. 프로젝트는 `scene-stg`와 `scene-prod` 두 개를 권장한다(하나로 합쳐도 된다). 예산 알림도 설정한다.
2. **도메인**: 교회 도메인의 하위 도메인(예: `scene.<교회도메인>`)을 쓰거나 새로 구매한다. LB IP를 가리키는 A 레코드를 DNS에 추가할 권한이 필요하다.
3. **Google OAuth 클라이언트**(#232): OAuth 동의 화면을 External / In production으로 두고 범위는 `openid email profile`만 쓴다. 승인된 리디렉션 URI는 다음과 같다.
   - `https://<도메인>/login/oauth2/code/google`
   - `https://stg.<도메인>/login/oauth2/code/google`
   - 로컬 검증용 `http://localhost:8080/login/oauth2/code/google` (사용할 경우)
   - 승인된 도메인에 `<도메인>`을 등록한다. 리디렉션 경로는 Spring Security 기본값 기준이며 구현 시 확정한다.
4. **GitHub 저장소 설정**: Environments `dev`·`stg`·`prod`를 만들고 prod에 필수 리뷰어를 둔다. WIF provider 이름과 서비스 계정 이메일을 Environment 변수로 등록한다(비밀 아님).
5. **개인정보 고지**: 처리방침에 수탁자(Google Cloud)와 보관 위치(서울)를 적는다.

### 6. 다음 단계 (GCP를 골랐을 때, 지금은 쓰지 않음)

1. 이 문서로 호스팅을 결정한다 (사용자).
2. 백엔드 `Dockerfile`(Temurin 25 JRE)과 Flyway 전용 실행 모드(마이그레이션 후 종료)를 추가한다. 프로필에 `server.forward-headers-strategy`를 설정해 LB 뒤에서 OAuth 리디렉션 URL이 https로 만들어지게 한다.
3. stg 인프라를 만든다. Cloud SQL(PG17, Enterprise, 백업·PITR), Artifact Registry, Secret Manager, Cloud Run 서비스·Job(ingress는 `internal-and-cloud-load-balancing`), 버킷, LB, 인증서 순서다. 명령은 `docs/devops/`에 스크립트로 남긴다.
4. `cd-skeleton.yml`을 `.github/workflows/cd.yml`로 옮기고 단계를 채운다. 순서는 WIF 인증 → 이미지 빌드·푸시 → `gcloud run jobs execute migrate --wait` → `gcloud run deploy` → `gsutil rsync dist/` → 스모크(`/actuator/health`, 로그인 페이지)다.
5. rc 태그로 stg에 배포한다 (마감 11/30). Google 로그인과 신청을 실제로 클릭해 확인한다.
6. **백업 복구 리허설**: stg에서 PITR로 새 인스턴스를 복원하고 삭제 원장 재적용 절차(security-privacy §백업 복원)를 확인한다.
7. prod 인프라를 같은 스크립트로 만들고 release 태그로 배포한다 (마감 12/10). 신청 시작 전 `min-instances=1`을 확인한다.

### 7. 확인한 출처 (확인일 2026-11-16)

이 세션의 네트워크에서는 `cloud.google.com` 요금 페이지만 직접 열렸다. AWS·Fly·Render·네이버·Firebase 공식 페이지는 접속이 차단돼 검색 결과 요약만 확인했다. 해당 항목은 "미확인"으로 표시했다.

- Cloud Run 요금 (서울 Tier 2 단가, 무료 등급, 유휴 단가): https://cloud.google.com/run/pricing (직접 확인)
- Cloud SQL 요금 (서울 shared-core·SSD·백업 단가, shared-core SLA 제외): https://cloud.google.com/sql/pricing (직접 확인)
- LB 전달 규칙·처리량 요금: https://cloud.google.com/vpc/network-pricing (직접 확인)
- Secret Manager 요금: https://cloud.google.com/secret-manager/pricing (직접 확인)
- Cloud SQL PG 버전(17 포함): https://docs.cloud.google.com/sql/docs/postgres/instance-settings (검색 요약)
- Cloud SQL PITR: https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr (검색 요약)
- Cloud Run 도메인 매핑 지원 리전(서울 없음): https://docs.cloud.google.com/run/docs/locations (검색 요약)
- Firebase Hosting 쿠키 제거(`__session`만 유지): https://firebase.google.com/docs/hosting/manage-cache (검색 요약)
- GitHub Actions WIF: https://github.com/google-github-actions/auth (검색 요약)
- Lightsail 컨테이너 FAQ (Nano $7/월 등): https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-containers.html (검색 요약. 요금 페이지 https://aws.amazon.com/lightsail/pricing/ 는 접속 차단으로 미확인)
- Lightsail DB 엔진: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html (PG17 명시 없음)
- Fly.io MPG 리전: https://fly.io/docs/mpg , https://community.fly.io/t/managed-postgres-additional-region-support-ams-nrt-sin-sjc/25882 (검색 요약, 서로 다름)
- Render 리전: https://render.com/docs/regions (검색 요약, 아시아는 싱가포르만)

## 부록 B. AWS Lightsail 중심 비교 (2026-11-16, #240으로 반영)

상태: **기록 — 채택하지 않음** (홈서버로 결정, 2026-11-16) · 작성 2026-11-16 · 관련: #230(상위), #231, #232(Google OAuth)

이 문서는 스테이징(11/30)·운영(12/10) 배포 전에 호스팅을 고르기 위한 비교와 추천이다. 계정 생성·결제·도메인 구매·외부 설정은 하지 않았다. 비밀값은 이름만 적는다.

### 1. 결론

**추천: AWS Lightsail 서울 리전 — VM 1대(Docker Compose: Caddy + Spring Boot jar)와 Lightsail 관리형 PostgreSQL, 환경마다 한 벌씩.**

- 한국 리전에 데이터와 앱이 함께 있고, 월 고정 요금이 가장 예측 가능하다(두 환경 합계 약 $50 안팎, 추정).
- 인스턴스가 늘 켜져 있어 콜드 스타트가 없고 `DueHandoverJob`(60초 주기 스케줄러)이 그대로 돈다.
- Caddy가 HTTPS 인증서를 자동 발급하고, 같은 도메인에서 정적 프런트(`dist/`)와 `/api`를 함께 서빙한다. 아래 §2.3대로 현재 코드는 같은 출처를 전제한다.
- 관리형 DB는 자동 백업과 7일 시점 복구(5분 단위)를 문서에 명시한다.

**조건(가장 큰 미확인):** Lightsail 관리형 DB가 PostgreSQL 17을 제공하는지 확인하지 못했다. 검색된 AWS 문서는 12~16만 적고 있다. 콘솔(또는 `aws lightsail get-relational-database-blueprints`)에서 `postgres_17`이 없으면 **DB만 Amazon RDS for PostgreSQL 17(서울, db.t4g.micro 급)** 으로 바꾼다. RDS는 PostgreSQL 17을 지원한다(AWS 발표 2024-11-18). 앱 구성은 같다.

버린 안: **GCP Cloud Run + Cloud SQL**(스케줄러 때문에 상시 CPU 할당이 필요해 비싸고, shared-core DB는 SLA 밖), **Render**(한국·도쿄 리전이 없어 싱가포르에 개인정보 저장, 2GB 인스턴스 가격 미확인). 이유는 §4.

### 2. 저장소에서 확인한 배포 요구사항

모두 2026-11-16 `main`(e71f04b) 기준으로 코드를 읽어 확인했다.

#### 2.1 실행물과 프로필

- 백엔드: Spring Boot 4.1.1, Java 25 툴체인(Adoptium), `./gradlew bootJar` → 실행 jar 1개. Dockerfile·IaC는 아직 없다.
- 프로필 파일이 이미 있다: `application-{local,dev,stg,prod}.yml`. stg·prod는 DB 접속과 CORS만 환경 변수로 받는다.
- Flyway가 유일한 스키마 작성자다(`spring.session.jdbc.initialize-schema: never`, Spring Session 테이블은 `V2__spring_session.sql`). 현재 V8까지. 앱 기동 시 Flyway가 먼저 돈다.
- 프런트: React + Vite, `pnpm@10.22.0`, Node 24(`.nvmrc`), `pnpm build` → 정적 `dist/`.
- 런타임 이미지: `eclipse-temurin:25-jre`(noble/alpine) 태그가 있다(Docker Hub·Adoptium 검색 결과, 2026-11-16). 직접 pull은 하지 않았다.

#### 2.2 환경 변수·비밀값 (이름만)

| 이름 | 비밀 | 용도 | 근거 |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | 아니오 | `stg` 또는 `prod` **하나만** | §2.5 |
| `SCENE_DB_URL` | 아니오(호스트 노출 주의) | `jdbc:postgresql://…/scene` | `application-stg.yml`, `application-prod.yml` |
| `SCENE_DB_USER` | 예 | DB 사용자 | 같음 |
| `SCENE_DB_PASSWORD` | 예 | DB 비밀번호 | 같음 |
| `SCENE_CORS_ALLOWED_ORIGINS` | 아니오 | 같은 출처로 가면 프런트 출처 1개(예: `https://<도메인>`) | 같음 |
| `SCENE_GOOGLE_CLIENT_ID` (가칭) | 아니오 | Google OAuth | #232에서 확정 |
| `SCENE_GOOGLE_CLIENT_SECRET` (가칭) | 예 | Google OAuth | #232에서 확정 |
| `SCENE_CHECKIN_CODE_SECRET` | 예 | 체크인 QR 서명. 비면 QR 체크인이 꺼진다. 행사 기간에 바꾸지 않는다 | DEC-071, #282 |
| 배포용 SSH 키 / 클라우드 자격 | 예 | GitHub Actions → 서버 | GitHub Environment secret |

- 세션 비밀값은 따로 없다. 운영자 세션은 Spring Session JDBC(DB 테이블)에 있고 쿠키 값은 세션 ID다(`SecurityConfiguration.operatorSessionCookie`).
- 쿠키 도메인 설정은 없다(호스트 전용 쿠키). `SCENE_SESSION`(path `/`), `SCENE_PSESSION`(path `/api/v1/participant`), `XSRF-TOKEN`(path `/`) 모두 Secure·SameSite=Lax.
- OAuth redirect URI 후보: `https://<stg 도메인>/…`, `https://<운영 도메인>/…`(경로는 #232에서 정함). 리버스 프록시 뒤에서 redirect URI와 Secure 판정을 맞추려면 `server.forward-headers-strategy` 설정이 필요할 가능성이 높다(추정, #232·배포 단계에서 확인).

#### 2.3 같은 도메인 vs 하위 도메인 → **같은 출처가 필요하다**

- `frontend/src/api/client.ts`의 `apiRequest`가 `new URL(path, window.location.origin)`으로 API를 부른다. API 기본 주소 설정(`VITE_API_BASE` 같은 것)이 없다.
- CSRF는 이중 제출 방식이다. 프런트가 `ensureCsrfToken()`에서 `XSRF-TOKEN` 쿠키를 **자기 출처에** `Domain` 없이 쓰고, 같은 값을 `X-XSRF-TOKEN` 헤더로 보낸다. 서버(`CookieCsrfTokenRepository`)는 쿠키와 헤더를 비교한다. API가 다른 호스트(`api.example.org`)면 이 쿠키가 API로 가지 않아 모든 변경 요청이 403이 된다.
- 따라서 **프런트와 `/api`를 같은 호스트에 둔다**(리버스 프록시 또는 Spring Boot가 `dist/`를 서빙). 하위 도메인 분리는 코드 변경(API base URL, 쿠키 Domain, CORS)이 필요해 이번 일정에 맞지 않는다.
- 주의: Firebase Hosting → Cloud Run 리라이트는 `__session` 외 쿠키를 전달하지 않는 것으로 알고 있다(기억, 이번에 확인하지 못함). GCP를 고른다면 이 구성은 쓰지 않는다.

#### 2.4 상시 실행 요구

- `DueHandoverJob`이 `@Scheduled(fixedDelay = 60s)`로 기한이 지난 소유권 이전을 완료한다(`HandoverScheduling`, `scene.handover.scheduler.enabled` 기본 true).
- 인스턴스가 0으로 줄거나 요청 밖에서 CPU가 묶이면(Cloud Run 요청 기반 과금) 이 작업이 멈춘다. → **최소 1개 인스턴스가 늘 켜져 있고 요청 밖에서도 CPU를 쓰는 환경**이 필요하다.

#### 2.5 배포 프로필 설계 (learning 2026-10-21 "dev login exists only on local and test" 반영)

- `POST /api/v1/operator/auth/login`은 `@Profile({"local","test"})`인 `DevLoginController`에만 있다. 켜는 플래그는 없다. stg·prod에서는 빈이 없어 404다.
- 배포 환경은 `SPRING_PROFILES_ACTIVE`를 `stg`·`prod` 하나로만 설정한다. `local`, `test`, `dev`를 섞지 않는다. 이미지에 `application.properties`로 프로필을 넣지 않는다.
- 스모크 테스트에 "stg·prod에서 `POST /api/v1/operator/auth/login`이 404"를 넣는다.
- 프런트는 `pnpm build`(production)만 배포한다. 빌드 검사가 `dist/assets`에 시드 문자열이 있으면 실패한다. learning 2026-11-13에 따라 `개발용 로그인` 문자열이 번들에 없는지도 확인한다.
- `local` 프로필의 `db/seed`는 stg·prod에서 로드되지 않는다(`application.yml`의 `flyway.locations`).

#### 2.6 메모리 (추정)

- 실측하지 못했다(§6). Spring Boot 4 + Hikari + MyBatis + Spring Session JDBC 웹 앱은 보통 힙 256~512MB, 프로세스 RSS 400~700MB 정도다(경험적 추정).
- 권장: 앱 컨테이너 메모리 1GB, `-XX:MaxRAMPercentage=60` 정도. VM은 OS·Caddy·Docker 포함 **2GB**. 512MB 인스턴스는 부족할 가능성이 높다.
- 규모(신청 수백 명, 체크인 때 짧은 동시 접속)에는 vCPU 1~2개로 충분하다고 본다(추정).

### 3. 비교표

가격은 USD/월, 세금 제외. "확인"은 2026-11-16 웹 검색 결과 스니펫에서 본 값이다. 이 세션의 네트워크 정책이 aws.amazon.com·render.com·cloud.google.com 문서 페이지 본문 열기를 막아, **공식 가격 페이지를 직접 열어 보지 못했다.** 결정 전에 각 콘솔·가격 계산기로 다시 확인해야 한다.

| 기준 | A. AWS Lightsail 서울 (추천) | B. GCP Cloud Run + Cloud SQL 서울 | C. Render 싱가포르 |
|---|---|---|---|
| 구성 | VM(Compose: Caddy+jar+dist) + Lightsail 관리형 DB | Cloud Run(jar+dist 한 컨테이너) + Cloud SQL | Docker 웹 서비스(jar+dist) + Render Postgres |
| 운영 월 비용 | VM 2GB $12 + DB 1GB $15 ≈ **$27** | Cloud Run 1vCPU/1GiB 상시 CPU ≈ $60 내외(추정) + Cloud SQL db-f1-micro $10~17 + 스토리지 ≈ **$75~80** | 웹 2GB ~$25(미확인) + Postgres Basic-1gb $19 ≈ **$44** + 워크스페이스 요금(불명확) |
| 스테이징 월 비용 | VM 1~2GB $7~12 + DB $15 ≈ **$22~27** (같은 DB 인스턴스에 별도 database로 두면 ≈ $7~12) | Cloud Run 최소 0(콜드 스타트 감수) ≈ $0~5 + Cloud SQL $10~17 ≈ **$10~22** | Starter 512MB $7 + Basic-256mb $6 ≈ **$13** (512MB는 부족할 수 있음) |
| 합계(추정) | **약 $35~54** | **약 $85~100** | **약 $57~ + 워크스페이스** |
| 운영 부담 | 중간: OS 업데이트, Docker·Caddy 관리, 로그는 VM 안 | 낮음: 서버 관리 없음, 단 IAM·Artifact Registry·Cloud SQL 커넥터 설정이 많음 | 낮음: Git 연동 자동 배포, 관리형 HTTPS |
| 한국 리전·지연 | 서울(ap-northeast-2) — 국내 수 ms(추정) | 서울(asia-northeast3, Cloud Run Tier 2) | 한국·도쿄 없음. 싱가포르(왕복 70~100ms 추정, 미측정) |
| 관리형 PG 17 | **미확인**(문서상 12~16). 없으면 RDS PG17로 대체 | 지원(Cloud SQL Enterprise `POSTGRES_17` 문서) | 지원(17 GA, 18까지 지원 문서) |
| 자동 백업·PITR | 자동 백업 + 7일, 5분 단위 PITR(새 DB로 복원) | 자동 백업 + PITR, Enterprise 최대 7일 로그 보존. shared-core는 **SLA 밖** | 유료 DB에 PITR: Hobby 3일, Pro 이상 7일. 무료 DB는 백업 없음 |
| Java 25 | Docker 이미지라 제약 없음 | 컨테이너라 제약 없음 | Docker 서비스라 제약 없음(네이티브 Java 런타임 아님) |
| HTTPS·도메인 | Caddy가 Let's Encrypt 자동 발급, DNS A 레코드 | 관리형 인증서 + 도메인 매핑(또는 LB) | 관리형 HTTPS + 커스텀 도메인 |
| GitHub Actions | 이미지 빌드→GHCR→SSH로 `docker compose pull && up` | Workload Identity(OIDC)→`gcloud run deploy` | Deploy hook 또는 Git 자동 배포 |
| 콜드 스타트 | 없음(상시 VM) | 최소 인스턴스 1이면 없음, 0이면 Spring Boot 기동 수 초~수십 초(추정) | 유료 플랜은 없음. 무료 웹 서비스는 15분 무활동 시 잠듦 |
| 스케줄러(§2.4) | 그대로 동작 | 인스턴스 기반 과금(상시 CPU) + 최소 1 필요 → 비용 상승 | 유료 플랜에서 동작 |
| 데이터 위치 | 한국 | 한국 | 싱가포르(국외 이전 고지·동의 검토 필요, 법률 판단 아님) |

### 4. 추천 이유와 버린 이유

**A를 추천하는 이유**

1. 개인정보(이름·전화)가 한국에 남는다. 국외 이전 고지 문제가 없다.
2. 두 환경 합계가 세 후보 중 가장 낮고, 번들 고정 요금이라 수련회 기간 트래픽 변동에 비용이 흔들리지 않는다.
3. 스케줄러·세션 JDBC·같은 출처 요구를 코드 변경 없이 만족한다(Caddy가 `/api/*`는 jar로, 나머지는 `dist/`와 SPA 폴백으로).
4. 관리형 DB의 7일 PITR로 "신청 데이터 보호"와 #231 완료 조건(백업 복구 1회 확인)을 맞출 수 있다.

**A의 약점과 대응**

- VM 관리 부담: 무인 보안 업데이트(unattended-upgrades), Compose `restart: unless-stopped`, 디스크·메모리 알림 정도로 한정한다. 행사 기간이 짧아(12월~1월 하순) 감당 가능하다고 본다.
- PostgreSQL 17 미확인: 위 조건대로 RDS로 대체. RDS 서울 db.t4g.micro 가격은 확인하지 못했다(추정 $15~25 + 스토리지).
- 단일 VM이라 장애 시 재기동 시간이 필요하다. 수련회 규모에서는 감수하고, 체크인 당일에는 수동 대응 담당자를 정해 둔다.

**B(GCP)를 버린 이유**

- §2.4 스케줄러 때문에 운영은 상시 CPU 할당 + 최소 인스턴스 1이 필요하고, 이때 Cloud Run 비용이 VM보다 높다(추정 약 $60/월).
- 싼 Cloud SQL(db-f1-micro 0.6GB, db-g1-small 1.7GB)은 shared-core라 SLA 밖이다. 전용 코어로 가면 비용이 더 오른다.
- 같은 출처를 위해 Firebase Hosting 리라이트를 쓸 수 없고(쿠키 전달 제약, 미확인), 결국 한 컨테이너에 프런트를 넣거나 LB를 둬야 한다.
- 장점(서버 관리 없음, 서울 리전, PG17 확실)은 분명하다. 예산이 넉넉하고 VM 관리를 피하고 싶다면 2순위다.

**C(Render)를 버린 이유**

- 한국·도쿄 리전이 없어 싱가포르에 개인정보를 둔다. 지연도 늘어난다(체크인 때 체감 가능, 미측정).
- Spring Boot에 512MB Starter는 부족할 가능성이 높고, 2GB 플랜 가격·워크스페이스 요금을 확인하지 못했다(2026년 요금제 변경 보도들이 서로 다름).
- Hobby 워크스페이스 PITR은 3일이다.

### 5. 출처와 확인 상태 (2026-11-16)

웹 검색(WebSearch)으로 본 스니펫이다. 공식 페이지 본문은 네트워크 정책으로 열지 못했다.

| 항목 | 값 | 출처 | 상태 |
|---|---|---|---|
| Lightsail 서울 리전 존재 | 있음 | [AWS 한국 블로그: Lightsail 서울 리전](https://aws.amazon.com/ko/blogs/korea/now-available-amazon-lightsail-seoul-region) | 확인 |
| Lightsail VM 2GB | $12/월 | [VPSBenchmarks](https://www.vpsbenchmarks.com/hosters/amazon_lightsail/plans/1155) | 확인(지역 미표기, 서울 동일 여부 미확인) |
| Lightsail DB 최소 번들 | $15/월, 1GB RAM, 40GB SSD | [CloudZero](https://www.cloudzero.com/blog/amazon-lightsail-pricing/), [Cloudburn](https://cloudburn.io/blog/amazon-lightsail-pricing) | 제3자 출처 |
| Lightsail DB PITR | 7일, 5분 단위, 새 DB로 복원 | [AWS Lightsail 문서: point-in-time 복원](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html) | 확인(스니펫) |
| Lightsail PG 버전 | 12~16 기재, 17 언급 없음 | [AWS Lightsail 문서: DB 선택](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html) | **17 미확인** |
| RDS PG 17 | 17.1부터 지원 | [AWS 발표 2024-11-18](https://www.amazonaws.cn/en/new/2024/amazon-rds-for-postgresql-now-supports-major-version-17/) | 확인 |
| Lightsail 컨테이너 서비스 | Nano $7(512MB), Micro $10(1GB), Small $15 또는 $25 | [Cloudburn](https://cloudburn.io/blog/amazon-lightsail-pricing), [Wring](https://wring.co/blog/aws-lightsail-pricing-guide) | Small 값 충돌 |
| Cloud SQL db-f1-micro 서울 | $10/월 또는 시간당 $0.0234(≈$17) | [Bytebase](https://www.bytebase.com/dbcost/cloudsql/instance/db-f1-micro/), [Spare Cores](https://sparecores.com/database/gcp/db-f1-micro) | 출처 간 불일치 |
| Cloud SQL PG 17, PITR 7일(Enterprise) | 지원 | [Cloud SQL 인스턴스 설정](https://docs.cloud.google.com/sql/docs/postgres/instance-settings), [Editions](https://docs.cloud.google.com/sql/docs/postgres/editions-intro) | 확인(스니펫) |
| shared-core SLA 제외 | 제외 | [Cloud SQL 가격](https://cloud.google.com/sql/pricing), [운영 지침](https://cloud.google.com/sql/docs/postgres/operational-guidelines?hl=ko) | 확인(스니펫) |
| Cloud Run 서울 등급 | Tier 2 | [Cloud Run 가격](https://cloud.google.com/run/pricing) | 확인(스니펫, 표 단가는 열 배치가 섞여 불확실) |
| Render 리전 | Oregon, Ohio, Virginia, Frankfurt, Singapore | Render 문서(검색 스니펫) | 확인(스니펫) |
| Render 웹 Starter | $7, 512MB, 0.5 CPU | [Render 가격](https://render.com/pricing), [Render compute plans 변경](https://render.com/docs/compute-plans-update.md) | 확인(스니펫). 2GB 가격 미확인 |
| Render Postgres | Basic-256mb $6, Basic-1gb $19, PITR Hobby 3일·Pro 7일 | [Render 가격](https://render.com/pricing), [Render 백업 문서](https://render.com/docs/postgresql-backups) | 확인(스니펫) |
| Render PG 17 | 지원(18까지) | [Render changelog: PG17](https://render.com/changelog/postgresql-17-is-now-available-for-render-postgres-databases), [업그레이드 문서](https://render.com/docs/postgresql-upgrading) | 확인 |
| Render 무료 웹 서비스 잠듦 | 15분 무활동 | [livemy.app 정리](https://livemy.app/blog/render-pricing) | 제3자 출처 |
| Temurin 25 JRE 이미지 | `25-jre-noble`, `25-jre-alpine` | [Docker Hub eclipse-temurin](https://hub.docker.com/_/eclipse-temurin), [Adoptium 컨테이너](https://adoptium.net/installation/containers/) | 확인(스니펫) |

**추정한 값:** Cloud Run 상시 비용(단가 × 730시간 계산), 메모리 요구(§2.6), 지연 시간, RDS 서울 가격, Render 2GB 가격($25는 기억), Firebase Hosting 쿠키 제약(기억).

### 6. 이 세션에서 돌리지 못한 것

- `./gradlew --offline bootJar`: `org.gradle.toolchains.foojay-resolver-convention` 플러그인을 받지 못해 실패했다(오프라인 캐시 없음). 우회하지 않았다. 따라서 jar 크기·기동 시간·실제 메모리는 측정하지 못했다.
- Docker 이미지 빌드·pull은 시도하지 않았다.
- 공식 가격 페이지 본문: aws.amazon.com, render.com, docs.cloud.google.com이 이 세션 네트워크에서 열리지 않았다.

### 7. 결정 뒤 다음 단계 (Lightsail을 골랐을 때의 계획, 지금은 쓰지 않음)

#231 댓글의 체크리스트를 기준으로 한다. 요약:

1. 사용자: 호스팅·예산·도메인·계정 소유자 결정, 계정·결제 생성, Lightsail에서 PG17 제공 여부 확인.
2. 저장소: Dockerfile(`eclipse-temurin:25-jre`), `deploy/compose.yaml` + `Caddyfile`(같은 출처, SPA 폴백, `/api/*` 프록시), `cd-skeleton.yml` → `.github/workflows/cd.yml`(stg: 태그 `-rc`, prod: 태그 + 리뷰어 승인).
3. 스테이징: Flyway V1~V8 적용 확인, 스모크(헬스, dev login 404, 참가 신청 1건, 운영자 로그인은 #232 이후).
4. 운영: 같은 절차 + DB PITR로 새 DB 복원 1회 확인 → 완료 조건 충족 기록.
