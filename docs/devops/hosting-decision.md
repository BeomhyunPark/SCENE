# SCENE 호스팅 결정

- 상태: **대체됨 (2026-11-16)**. 사용자가 집의 Surface Pro 홈서버 + Cloudflare Tunnel로 결정했다 → [홈서버 운영](home-server.md). 아래 클라우드 비교는 홈서버에 문제가 생겼을 때 옮길 곳의 기록으로 남긴다.
- 작성일·가격 확인일: 2026-11-16
- 관련: #231 (상위 #230). 마감: 스테이징 2026-11-30, 운영 2026-12-10, 신청 시작 약 2026-12-15
- 범위: 백엔드 실행 환경, 관리형 PostgreSQL, 프런트엔드 정적 호스팅, 도메인·HTTPS, CD 대상. 코드·인프라는 아직 만들지 않았다.

## 1. 추천안

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

## 2. 비교표

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

## 3. 선택 기준

1. **개인정보 국내 보관**: 이름·전화번호·응답을 다룬다. 해외 리전(D)은 국외 이전 고지 부담이 생겨 제외했다.
2. **자동 백업 + 복구 확인**: #231 완료 조건이 "백업 복구 1회 확인"이다. 공식 문서로 PITR을 확인한 것은 A뿐이다.
3. **수련회 당일 체크인**: QR 체크인 때 첫 요청이 기동을 기다리면 안 된다. prod는 상시 1대(A: min-instances=1, B: 상시 실행)로 둔다.
4. **1인 운영**: 서버 OS 관리가 없는 관리형 서비스(A·B)를 우선했다. C는 국내 사업자라는 장점이 있지만 서버 관리 부담과 미확인 항목이 많다.
5. **CD 계획과의 정합성**: `migrate → backend → frontend → smoke` 순서가 A에서는 `Job 실행 → 서비스 배포 → 버킷 업로드 → curl`로 그대로 옮겨진다.
6. **B를 고를 조건**: 월 비용을 가장 낮게 고정하고 싶고, PG17 지원과 PITR을 콘솔에서 직접 확인한 경우. 이때 0.25 vCPU(Micro)는 Spring Boot에 빠듯하므로 0.5 vCPU 이상을 권장한다.

## 4. 비용 추정 (A, USD/월, 서울 정가, 세금 제외)

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

## 5. 사용자가 할 일

1. **Google Cloud 계정·결제**: 결제 계정을 만들고 카드를 등록한다. 프로젝트는 `scene-stg`와 `scene-prod` 두 개를 권장한다(하나로 합쳐도 된다). 예산 알림도 설정한다.
2. **도메인**: 교회 도메인의 하위 도메인(예: `scene.<교회도메인>`)을 쓰거나 새로 구매한다. LB IP를 가리키는 A 레코드를 DNS에 추가할 권한이 필요하다.
3. **Google OAuth 클라이언트**(#232): OAuth 동의 화면을 External / In production으로 두고 범위는 `openid email profile`만 쓴다. 승인된 리디렉션 URI는 다음과 같다.
   - `https://<도메인>/login/oauth2/code/google`
   - `https://stg.<도메인>/login/oauth2/code/google`
   - 로컬 검증용 `http://localhost:8080/login/oauth2/code/google` (사용할 경우)
   - 승인된 도메인에 `<도메인>`을 등록한다. 리디렉션 경로는 Spring Security 기본값 기준이며 구현 시 확정한다.
4. **GitHub 저장소 설정**: Environments `dev`·`stg`·`prod`를 만들고 prod에 필수 리뷰어를 둔다. WIF provider 이름과 서비스 계정 이메일을 Environment 변수로 등록한다(비밀 아님).
5. **개인정보 고지**: 처리방침에 수탁자(Google Cloud)와 보관 위치(서울)를 적는다.

## 6. 다음 단계 (CD 활성화 순서)

1. 이 문서로 호스팅을 결정한다 (사용자).
2. 백엔드 `Dockerfile`(Temurin 25 JRE)과 Flyway 전용 실행 모드(마이그레이션 후 종료)를 추가한다. 프로필에 `server.forward-headers-strategy`를 설정해 LB 뒤에서 OAuth 리디렉션 URL이 https로 만들어지게 한다.
3. stg 인프라를 만든다. Cloud SQL(PG17, Enterprise, 백업·PITR), Artifact Registry, Secret Manager, Cloud Run 서비스·Job(ingress는 `internal-and-cloud-load-balancing`), 버킷, LB, 인증서 순서다. 명령은 `docs/devops/`에 스크립트로 남긴다.
4. `cd-skeleton.yml`을 `.github/workflows/cd.yml`로 옮기고 단계를 채운다. 순서는 WIF 인증 → 이미지 빌드·푸시 → `gcloud run jobs execute migrate --wait` → `gcloud run deploy` → `gsutil rsync dist/` → 스모크(`/actuator/health`, 로그인 페이지)다.
5. rc 태그로 stg에 배포한다 (마감 11/30). Google 로그인과 신청을 실제로 클릭해 확인한다.
6. **백업 복구 리허설**: stg에서 PITR로 새 인스턴스를 복원하고 삭제 원장 재적용 절차(security-privacy §백업 복원)를 확인한다.
7. prod 인프라를 같은 스크립트로 만들고 release 태그로 배포한다 (마감 12/10). 신청 시작 전 `min-instances=1`을 확인한다.

## 7. 확인한 출처 (확인일 2026-11-16)

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
- 네이버 클라우드 요금: https://www.gov-ncloud.com/charge/price/ko (검색 요약, Cloud DB for PostgreSQL 단가·PG17 미확인)
