# SCENE 홈서버 운영

- 상태: **결정 (2026-11-16)**. 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 집의 Surface Pro 홈서버에서 운영한다. 클라우드 비교는 [호스팅 결정](hosting-decision.md)에 기록으로 남긴다.
- 주소: `https://scene.greengroove.app` (Cloudflare DNS + Cloudflare Tunnel)
- 파일: [`deploy/home/`](../../deploy/home/) — `compose.yaml`, `.env.example`, `auto-deploy.sh`, `backup.sh`, `notify.sh`(알림), `boot-check.sh`(재부팅 확인)

## 1. 구성

```
브라우저 ──HTTPS──▶ Cloudflare ──Tunnel(밖으로 나가는 연결)──▶ cloudflared ─▶ web(nginx) ─┬─▶ 정적 화면
                                                                                       └─▶ /api ─▶ backend(Spring) ─▶ postgres
```

- 공유기 포트를 열지 않는다. 집 IP가 드러나지 않고, IP가 바뀌어도 접속이 유지된다.
- 화면과 API를 한 주소(같은 출처)에서 제공한다. `SCENE_SESSION`·`SCENE_PSESSION` 쿠키가 그대로 동작한다.
- HTTPS는 Cloudflare가 처리한다. nginx는 백엔드에 `X-Forwarded-Proto: https`를 넘긴다. 이 값은 Google 로그인(#232)의 리디렉션 주소에 쓰인다.
- 이 서버 하나가 운영 환경이다. **스테이징은 따로 두지 않는다** (2026-11-16 사용자 결정). 11/30까지 이 서버에서 리허설하고, 리허설 데이터는 신청을 열기 전에 지운다(5절).

## 2. Surface Pro 준비 (한 번)

| 항목 | 이유 | 방법 |
|---|---|---|
| 유선 LAN | Wi-Fi 끊김 방지 | USB-C 이더넷 어댑터 |
| 덮개를 닫아도 켜짐, 절전 끔 | 노트북 기본값은 잠든다 | `/etc/systemd/logind.conf`에 `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`를 넣고 `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target` |
| 배터리 충전 제한 | 늘 꽂아 두면 배터리가 부푼다 | Surface UEFI(전원 + 볼륨 업) → Boot configuration → **Enable Battery Limit mode** (50%에서 멈춤). 정전 때는 이 배터리가 UPS 역할을 한다 |
| 공유기·모뎀 UPS | 서버가 살아 있어도 공유기가 꺼지면 접속이 끊긴다 | 소형 UPS(공유기·ONT용) |
| 자동 보안 업데이트 | 인터넷에 연결된 서버 | `sudo apt install unattended-upgrades` 후 `sudo dpkg-reconfigure unattended-upgrades` |
| 디스크 암호화 | 기기 분실·도난 대비 | 설치할 때 LUKS를 켜지 않았다면, 최소한 백업은 암호화한다(4절) |
| Docker | 실행 환경 | Docker Engine + Compose plugin (공식 apt 저장소) |

**실제 기기 (2026-11-17 확인):** 이 Surface는 Ubuntu를 직접 설치한 기기가 아니라 **Windows + WSL2(Ubuntu, systemd 켜짐)** 이다. WSL에 보이는 메모리는 7.7 GB다. 위 표에서 덮개·절전·디스크 암호화는 Windows 설정(전원 옵션의 절전 끔, BitLocker)으로 맞춘다. 부팅 때 WSL을 켜는 것은 Windows 작업 스케줄러의 **Start WSL Server** 작업(`wsl.exe -d Ubuntu --exec /bin/true`)이고, Docker는 WSL 안의 systemd가 올린다. 같은 기기에서 `ongi` 스택(백엔드·postgres·cloudflared)이 함께 돈다.

## 3. 처음 배포

1. Cloudflare Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared). 토큰을 복사한다.
2. 그 터널의 **Public Hostname**: `scene.greengroove.app` → Service `HTTP` · `web:80`.
3. 서버에서 다음을 실행한다.

```bash
git clone https://github.com/BeomhyunPark/SCENE.git ~/scene
```

```bash
cd ~/scene/deploy/home && cp .env.example .env && chmod 600 .env
```

운영 사본은 개발 작업 폴더(`~/code/SCENE`)와 따로 둔다. 작업 브랜치를 바꿔도 운영 중인 코드가 바뀌지 않게 하기 위해서다.

4. `.env`에 `SCENE_DB_PASSWORD`(`openssl rand -base64 32`로 만든 값)와 `CLOUDFLARE_TUNNEL_TOKEN`을 채운다.
   - **Google 로그인(#232):** Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션)를 만든다.
     - 승인된 리디렉션 URI: `https://scene.greengroove.app/login/oauth2/code/google`
     - OAuth 동의 화면: 외부, 게시됨(In production), 범위 `openid email profile`
     - 받은 값을 `SCENE_GOOGLE_CLIENT_ID`·`SCENE_GOOGLE_CLIENT_SECRET`에 넣는다.
   - **첫 관리자(DEC-069):** `SCENE_BOOTSTRAP_OWNER_EMAIL`에 첫 관리자의 Google 이메일을, `SCENE_BOOTSTRAP_SPACE_NAME`에 조직 이름을 넣는다.
     - 그 계정이 처음 로그인할 때 조직이 아직 없으면 조직을 만들고 OWNER로 넣는다. 한 번만 일어난다.
   - **체크인 QR(DEC-071):** `SCENE_CHECKIN_CODE_SECRET`에 `openssl rand -base64 32`로 만든 값을 넣는다. 비어 있으면 QR 체크인이 꺼지고 수동 체크인만 된다. 행사 기간에 바꾸면 이미 보여 준 QR이 모두 무효가 된다.
5. 실행한다.

```bash
docker compose up -d --build
```

6. 확인: `docker compose ps`에서 모두 `healthy`·`running`인지 본다. 브라우저에서 `https://scene.greengroove.app`이 열리는지 본다.

### 자동 배포 (#257, 2026-11-17)

main에 병합하면 서버가 5분 안에 스스로 반영한다. 서버가 밖으로 확인하러 나가는 방식이라, 집으로 들어오는 경로는 열지 않는다.

- cron이 5분마다 [`auto-deploy.sh`](../../deploy/home/auto-deploy.sh)를 실행한다 (`crontab -l`의 `# scene-auto-deploy` 줄).
- `origin/main`이 바뀌었고 그 커밋의 `ci-ok`·`docs-check`가 성공했을 때만 움직인다. CI가 도는 중이면 다음 차례에 다시 본다.
- `backend/`, `frontend/`, `deploy/home/compose.yaml`이 바뀌지 않았으면 코드만 맞추고 아무것도 재시작하지 않는다 (문서 PR 등).
- 바뀌었으면: DB 덤프(`~/scene-backups/pre-deploy-*.sql.gz`, 최근 10개 보관) → `docker compose up -d --build --wait` → 공개 주소 스모크 테스트(`/` 200, `/api/v1/operator/me` 401).
- 실패하면 이전 커밋으로 되돌려 다시 띄우고, 같은 커밋은 다시 시도하지 않는다. **DB 변경(Flyway)은 되돌려지지 않는다.** 그때는 배포 전 덤프로 직접 복구한다.
- 기록: `~/.local/state/scene-deploy/auto-deploy.log`. 배포 완료·실패·되돌림은 휴대폰 알림으로 온다(8절). 알림을 설정하기 전에는 실행 코드를 병합한 뒤 이 기록이나 사이트를 한 번 본다.
- 이미지를 먼저 빌드하고, 빌드가 실패하면 돌고 있는 컨테이너는 건드리지 않는다.
- cron에는 Windows PATH가 없어 `~/.docker/config.json`의 Docker Desktop 인증 도우미(`desktop.exe`)를 못 찾는다. 그래서 스크립트는 빈 설정(`~/.local/state/scene-deploy/docker-config`)을 쓴다. 공개 이미지만 쓰므로 인증이 필요 없다.
- `.env`를 바꿨거나 지금 바로 다시 띄우려면: `~/scene/deploy/home/auto-deploy.sh --force`
- 잠시 멈추기·다시 켜기·상태: `auto-deploy.sh --pause "이유"`, `--resume`, `--status`. GitHub에서 거는 동결(`deploy/home/FREEZE`)과 동결 중 급한 수정은 10절. 손으로 배포할 때는 `cd ~/scene && git pull && cd deploy/home && docker compose up -d --build`.
- 배포 전 덤프는 같은 디스크에 있는 임시 안전망이다. 집 밖 백업(4절)을 대신하지 않는다.
- 스테이징이 없으므로 병합이 곧 운영 반영이다. 병합 규칙은 10절에 있다.

### 기존 `retreat.greengroove.app` 종료 (2026-11-17)

같은 기기의 `~/server`(church-retreat-ops: Caddy 80/443 + 백엔드 + postgres:16)는 더 운영하지 않는다(2026-11-17 사용자 결정).

- [x] 최종 덤프를 받고 `~/server` 스택을 중지했다.
- [x] Windows 작업 스케줄러의 **Retreat WSL Server** 사용 안 함 (부팅 때 `~/server`에서 `docker compose up -d`를 실행하던 작업). WSL을 켜는 **Start WSL Server**는 그대로 둔다. — 사용자 처리, 상태 `Disabled` 확인
- [x] `retreat-auto-deploy.timer`, `retreat-db-backup.timer` 끄기 — 사용자 처리, `disabled`·`inactive` 확인
- [x] Cloudflare DNS의 `retreat` 레코드 삭제 — 사용자 처리, 공개 DNS에서 NXDOMAIN 확인
- [x] 공유기의 80/443 포트 포워딩 삭제 — 사용자 처리. 집 안에서는 확인할 수 없어 서버 쪽 검증은 하지 않았다 (SCENE은 터널만 쓰므로 열린 포트가 필요 없다)
- [x] 옛 신청 데이터 전부 삭제 (2026-11-17 사용자 결정 "새로 시작"): 컨테이너와 DB 볼륨(`server_postgres_data`, `retreat_postgres_data`), Caddy 볼륨, 로컬 덤프 전부(최종 덤프 포함), R2 `retreat-db-backups` 버킷의 백업 86개(암호화 85, 암호화 전 초기 덤프 1). 삭제 뒤 볼륨·덤프·버킷 객체 0개 확인. 되돌릴 수 없다. `~/server`의 코드·설정 파일과 빈 R2 버킷은 남아 있다.

## 4. 백업 (매일 03:30, 암호화, 집 밖 보관)

저장소는 Cloudflare R2의 `retreat-db-backups` 버킷, `scene/` 폴더다 (2026-11-17 사용자 결정. 옛 서비스가 쓰던 버킷과 rclone 원격 `r2`를 그대로 쓴다). 암호화는 rclone의 `r2crypt`가 아니라 age를 쓴다. `r2crypt`의 비밀번호는 이 서버에 있지만, age는 서버에 공개키만 두므로 서버를 도난당해도 백업은 풀리지 않는다.

1. **키는 다른 기기에서 만든다** (휴대폰·다른 PC): `age-keygen -o scene-backup.key`. 출력된 공개키(`age1…`)만 `.env`의 `BACKUP_AGE_RECIPIENT`에 넣는다. 개인키는 비밀번호 관리자 등 서버 밖에 둔다. 개인키를 잃으면 백업을 풀 수 없다.
2. 서버에는 `age`(v1.3.2, `~/.local/bin`, sudo 없이 공식 배포 파일로 설치)와 `rclone`(원격 `r2`)이 있다. `.env`의 `BACKUP_REMOTE=r2:retreat-db-backups/scene`.
3. 직접 한 번 실행해 본다: `~/scene/deploy/home/backup.sh`.
4. 매일 자동으로 돌게 cron에 등록한다 (`crontab -e`). WSL이라 sudo가 필요한 systemd 타이머 대신 자동 배포와 같은 cron을 쓴다.

```
30 3 * * * /home/user/scene/deploy/home/backup.sh >> /home/user/.local/state/scene-deploy/backup.log 2>&1 # scene-backup
```

5. **복구 리허설 (신청 시작 전 한 번 필수)**: 개인키가 있는 기기에서 파일을 풀어 `scene_restore` DB에 넣고 건수를 비교한다. 운영 DB에 바로 덮어쓰지 않는다.

```bash
docker compose exec -T postgres createdb -U scene scene_restore
```

```bash
age -d -i scene-backup.key scene-YYYYMMDD-HHMMSS.sql.gz.age | gunzip | docker compose exec -T postgres psql -U scene -d scene_restore
```

**확인한 것 (2026-11-17, 서버 검증, 임시 키·`scene-test` 폴더):** cron과 같은 짧은 PATH로 `backup.sh` 실행 → R2 업로드 → 내려받아 복호화 → `scene_restore`에 복구 → 운영 DB와 사용자·조직·멤버·Flyway·테이블 수 일치. 확인 뒤 임시 키, 시험 백업, `scene_restore`는 지웠다. **실제 키로 한 백업과 복구 리허설은 아직 하지 않았다.**

백업이 실패하면 알림이 오고, 백업이 아예 돌지 않으면 heartbeat가 끊겨 외부 서비스가 알린다(8절). 알림을 설정하기 전에는 `backup.log`나 버킷의 최신 파일 날짜를 가끔 본다.

## 5. 신청 시작 전 체크리스트 (12/15 전)

- [ ] Google 로그인(#232): 첫 관리자 로그인 → 조직이 생겼는지 확인 → 행사 만들기 → 다른 운영진을 초대해 Google로 수락
- [ ] 11/30까지 리허설: 운영자 로그인 → 신청서 구성 → 휴대폰으로 신청 → 명단 확인을 이 서버에서 한 번 끝까지 해 본다
- [ ] 리허설로 만든 행사·신청 삭제 (또는 DB를 새로 만들기). 지우기 전에 백업 1회를 받아 둔다
- [ ] 백업 자동 실행 + 복구 리허설 1회
- [ ] 휴대폰 LTE(집 Wi-Fi 아님)로 신청 페이지 접속 확인
- [ ] Cloudflare에서 `scene.greengroove.app`이 프록시(주황 구름) 상태인지 확인

## 6. 수련회 당일 (가장 큰 위험: 집 정전·인터넷 장애)

- 전날 밤: 신청자 명단 CSV를 내려받아(#233) 운영진 휴대폰과 종이에 보관한다. 서버가 멈춰도 명단으로 체크인을 이어 간다.
- 당일 아침: 집 밖 네트워크에서 접속을 확인한다. 집에 있는 사람이 재부팅할 수 있게 연락을 정해 둔다.
- 서버가 멈추면: 가동 확인 알림(8절)이 먼저 온다. Surface 재부팅 → 재부팅 알림을 기다린다(9절). 모든 서비스가 `restart: unless-stopped`라서 부팅 후 자동으로 올라오고, `boot-check.sh`가 결과를 알린다. 알림이 없으면 `~/scene/deploy/home/boot-check.sh --report`.
- 수련회 기간에는 배포 동결 중이다(10절). 급한 수정만 10.3의 순서로 배포한다.
- 장애가 하루 이상 이어지면: 최신 백업을 클라우드 VM에 복구하고 터널 토큰만 옮겨 같은 주소로 띄운다(compose 파일이 같다).

## 7. 아직 하지 않은 것

- **확인한 것 (2026-11-17, 이 Surface, 가짜 비밀값·임시 프로젝트 이름, 터널 제외):** `backend`·`web` 이미지 빌드, postgres:17 + 백엔드(prod 프로필) 기동과 Flyway 11개 적용, 세 서비스 healthy. nginx를 거쳐 `/`와 SPA 경로 200, `/api/v1/operator/me` 401, `/oauth2/authorization/google`이 `redirect_uri=https://scene.greengroove.app/login/oauth2/code/google`로 302. 메모리는 백엔드 약 330 MB, postgres 약 50 MB. 확인 뒤 임시 스택과 볼륨은 지웠다.
- **운영 기동 (2026-11-17 00:55):** `~/scene`(main `4f02023`)에서 `docker compose up -d --build`. 터널 연결 4개 등록, 외부에서 `https://scene.greengroove.app/` 200, `/api/v1/operator/me` 401, Google 로그인 시작이 실제 클라이언트 ID와 올바른 `redirect_uri`로 302.
- **실제 클릭 (2026-11-17, 사용자):** 첫 관리자 Google 로그인 성공. 서버 DB에서 조직 1개·사용자 1명·멤버 1명·Google 계정 연결 1건 생성 확인.
- **아직 확인하지 않은 것:** 행사 만들기와 운영진 초대, 휴대폰 신청, 백업·복구(4절), Windows 재부팅 뒤 자동 기동(9절 체크리스트).
- 자동 배포 확인 (2026-11-17, 서버 검증): 변경 없음 실행, `--force` 배포 1회(덤프 → 빌드 → 스모크 통과), 스모크 주소를 틀리게 주어 실패·되돌림 경로 1회 실행. 되돌린 뒤 스모크가 통과하는 경우와 실제 DB 변경이 있는 배포는 아직 겪지 않았다. cron을 통한 실제 병합 반영 결과는 #257에 남긴다.
- **장애 기록 (2026-11-17 15:00 ~ 11-18 22:00):** cron에서 실행된 코드 배포 9건이 모두 이미지 pull 단계에서 실패했다(위 `desktop.exe` 문제). 손으로 실행한 시험은 Windows PATH가 있는 셸이라 통과해서 놓쳤다. 빌드 전에 실패해 사이트는 이전 버전(8f64cdb)으로 계속 떠 있었다. 수정 뒤 cron과 같은 환경(`env -i`, 짧은 PATH)으로 main `b5075b1`을 배포해 V16까지 Flyway 적용과 스모크 통과를 확인했다(서버 검증). 빌드 실패 시 컨테이너를 건드리지 않는 경로는 아직 실행해 보지 않았다.
- 알림·가동 확인(8절), 재부팅 확인(9절), 배포 규칙(10절)은 스크립트와 문서가 준비됐고(2026-11-19, #409·#410·#411), Surface에서의 설정과 확인은 아직이다.

## 8. 알림과 가동 확인 (#409, 2026-11-19)

서버 안의 스크립트는 자기 실패를 알리고, 서버 밖의 서비스는 서버가 통째로 멈춘 것(집 전기·인터넷, WSL 종료)을 알린다. 서버 안에서는 서버 중단을 알릴 수 없기 때문이다.

### 8.1 무엇이 어디로 오나

| 상황 | 누가 알리나 | 받는 곳 |
|---|---|---|
| 배포 완료, 빌드 실패, 배포 실패와 되돌림(성공·실패), 배포 전 덤프 실패 | `auto-deploy.sh` | `SCENE_ALERT_URL` |
| main의 CI 실패, CI 결과를 1시간째 못 읽음, 30분째 `git fetch` 실패, 운영 사본에 손댄 파일, 동결 켜기·끄기, 그 밖의 예상 못 한 중단 | `auto-deploy.sh` | `SCENE_ALERT_URL` |
| 백업 실패(어느 단계인지) | `backup.sh` | `SCENE_ALERT_URL` + `BACKUP_HEARTBEAT_URL/fail` |
| 백업이 아예 안 돎(cron 꺼짐, 서버 꺼짐) | 외부 heartbeat 서비스 | `BACKUP_HEARTBEAT_URL`이 하루 넘게 안 불림 |
| 자동 배포 cron이 멈춤, WSL·Surface가 꺼짐 | 외부 heartbeat 서비스 | `SCENE_DEPLOY_HEARTBEAT_URL`이 15분 넘게 안 불림 |
| 사이트 중단(집 전기·인터넷, 터널, nginx, 백엔드, DB) | 외부 가동 확인 서비스 | `https://scene.greengroove.app/actuator/health`가 `UP`이 아님 |
| 재부팅 뒤 다시 켜짐 / 켜졌지만 응답 없음 | `boot-check.sh` (cron `@reboot`) | `SCENE_ALERT_URL` |

- 세 값은 모두 `.env`에 넣고 비워 두어도 된다. 비어 있으면 아무것도 보내지 않고 기존 동작 그대로다.
- 알림 본문은 한 줄이다. 들어가는 것은 주소(`scene.greengroove.app`), 단계 이름, 커밋 앞 7자리, 서비스 이름과 상태뿐이다. 비밀값·이름·전화번호·DB 내용·로그는 넣지 않는다. 자세한 내용은 서버의 `auto-deploy.log`·`backup.log`·`boot-check.log`에서 본다.
- 같은 종류의 알림은 6시간에 한 번만 보낸다(`SCENE_ALERT_DEDUPE_HOURS`). 같은 커밋의 빌드 실패는 다시 시도하지 않으므로 한 번만 온다.
- 알림 주소에는 토큰이 들어 있다. 스크립트는 주소를 기록에 남기지 않는다. 알림 전송이 실패해도 배포·백업은 계속된다.
- 준비 확인 주소: `GET /actuator/health`는 백엔드와 DB가 모두 살아 있을 때만 `{"status":"UP"}`(200)이고, 아니면 503이다. 세부 정보는 보이지 않는다(`show-details: never`). nginx는 이 한 경로만 백엔드로 넘긴다(`frontend/nginx.conf`). 이 변경이 배포되기 전에는 이 주소가 화면(HTML)을 돌려준다.

### 8.2 서버 밖 가동 확인: 비교와 추천

| 방법 | 비용 | 간격 | 알림 | 판단 |
|---|---|---|---|---|
| **UptimeRobot** (HTTP 키워드 확인) | 무료 50개 | 5분 | 휴대폰 앱 푸시, 이메일, 웹훅 | **추천(주)**. 주소를 직접 확인하므로 집 정전·인터넷 장애·백엔드 장애를 모두 잡는다 |
| **Healthchecks.io** (heartbeat) | 무료 20개 | 받는 쪽 기준 | 이메일, 앱 연동(Discord, Telegram 등) | **추천(heartbeat)**. 백업·자동 배포가 "안 돈 것"을 잡는다 |
| GitHub Actions 예약 실행 (`.github/workflows/uptime.yml`) | 공개 저장소라 무료 | 15분, 늦거나 건너뛸 수 있음 | `SCENE_ALERT_URL` 저장소 비밀값, 실패 메일 | **보조**. 저장소에 구현했다. 5분 기준은 못 맞춘다 |
| Cloudflare Tunnel 상태 알림 (Zero Trust → Notifications) | 무료(Zero Trust 플랜 포함) | 터널 상태가 바뀔 때 | 이메일. 웹훅은 유료 영역 조건이 있어 확인 필요 | **보조**. 터널만 보고 백엔드·DB는 못 본다 |
| Cloudflare Health Checks | 유료 요금제 기능으로 안다 | — | — | 제외(가입 화면에서 확인) |

- 추천 조합: UptimeRobot(5분) + Healthchecks.io heartbeat 2개 + `uptime.yml`(보조) + Cloudflare 터널 이메일 알림(보조).
- "서버를 끄면 5분 안에 알림"은 UptimeRobot 무료의 5분 간격이라 최악의 경우 5분을 조금 넘을 수 있다. 실제로 꺼 보고 걸린 시간을 적는다(8.5). 더 빨라야 하면 1분 간격 유료 요금제를 쓴다.
- 요금제·한도는 2026-11-19에 검색으로 확인한 것이다. 가입할 때 화면에서 다시 본다.

### 8.3 알림 채널 고르기 (`SCENE_ALERT_URL`)

웹훅 주소 하나를 받는다. 주소 모양으로 보내는 형식을 정하고, 맞지 않으면 `SCENE_ALERT_FORMAT=text|discord|slack|telegram`으로 정한다.

| 채널 | 주소 예 | 장점 | 주의 |
|---|---|---|---|
| **ntfy** (추천) | `https://ntfy.sh/<길고 무작위인 토픽>` | 가입 없음, 무료, 앱에서 토픽만 구독 | 토픽 이름이 곧 비밀번호다. `openssl rand -hex 16`으로 만든다. 공용 서버라 본문은 한 줄 요약만 보낸다 |
| Discord | `https://discord.com/api/webhooks/<id>/<token>` | 운영진과 채널 하나로 함께 받기 쉽다 | 서버(길드)와 채널을 만들어야 한다 |
| Telegram | `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>` | 운영진 단톡방에 바로 | BotFather로 봇을 만들고 chat id를 알아내야 한다 |
| Slack | `https://hooks.slack.com/services/...` | 이미 Slack을 쓰면 | 무료 워크스페이스의 기록 보관 제한 |

- 추천: 혼자 받으면 ntfy, 운영진이 함께 받아야 하면 Telegram 또는 Discord. 결정은 #409의 "결정 대기"에 있다.
- UptimeRobot·Healthchecks.io는 자기 앱 푸시나 이메일로 따로 알린다. 같은 채널(예: Telegram)로 모으고 싶으면 각 서비스의 연동 화면에서 붙인다.

### 8.4 설정 순서 (Surface와 휴대폰에서, 사용자)

1. 알림 채널을 고르고 휴대폰 앱을 설치한다. ntfy라면 앱에서 토픽을 구독한다.
2. `~/scene/deploy/home/.env`에 `SCENE_ALERT_URL=`을 채운다(`.env.example` 참고). 시험: `~/scene/deploy/home/auto-deploy.sh --test-alert` → 휴대폰에 "시험 알림"이 오는지 본다.
3. Healthchecks.io에 가입하고 check 두 개를 만든다.
   - `scene-auto-deploy`: Period 5분, Grace 10분 → Ping URL을 `SCENE_DEPLOY_HEARTBEAT_URL`에
   - `scene-backup`: Cron `30 3 * * *`, 시간대 `Asia/Seoul`(서버 시간대와 맞춘다), Grace 2시간 → Ping URL을 `BACKUP_HEARTBEAT_URL`에
   - Integrations에서 휴대폰으로 받을 채널(이메일은 기본)을 켠다.
4. 5분 기다려 `scene-auto-deploy`가 초록인지 본다. 백업은 `~/scene/deploy/home/backup.sh`를 한 번 돌려 `scene-backup`이 초록이 되는지 본다.
5. UptimeRobot에 가입하고 모니터를 만든다: 종류 **Keyword**, URL `https://scene.greengroove.app/actuator/health`, 키워드 `"status":"UP"`, "키워드가 없으면 장애", 간격 5분. 휴대폰 앱을 설치하고 푸시 알림을 켠다. (위 nginx 변경이 배포된 뒤에 만든다.)
6. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret: 이름 `SCENE_ALERT_URL`, 값은 2와 같은 주소. Actions 탭에서 `uptime` 워크플로를 **Run workflow**로 한 번 돌려 초록인지 본다.
7. Cloudflare Zero Trust → Notifications(또는 계정 Notifications) → **Tunnel Health Alert**를 이메일로 만든다.
8. `boot-check.sh`의 cron 줄을 넣는다(9절).

### 8.5 확인할 것 (사용자, Surface에서)

- [ ] `--test-alert`가 휴대폰에 온다
- [ ] 두 heartbeat가 초록이다
- [ ] **서버 중단:** `docker compose stop web` → 알림이 몇 분 만에 오는지 적는다 → `docker compose start web` → 복구 알림
- [ ] **WSL 중단:** Windows에서 `wsl --shutdown` → UptimeRobot과 `scene-auto-deploy` heartbeat 알림 → Surface 재부팅으로 복구(9절 확인과 함께 해도 된다)
- [ ] **백업 실패:** `.env`의 `BACKUP_REMOTE`를 잠시 없는 원격(`nope:x`)으로 바꾸고 `backup.sh` → 실패 알림(단계 `upload`)과 heartbeat 빨강 → 되돌리고 다시 실행해 초록
- [ ] 배포 알림은 다음 실제 병합 때 "배포 완료"가 오는지 본다

## 9. 재부팅 뒤 자동 시작 (#410, 2026-11-19)

### 9.1 부팅 순서

| 순서 | 무엇이 | 무엇을 켜나 | 확인 |
|---|---|---|---|
| 1 | Windows 시작 | 로그인 없이도 작업 스케줄러가 돈다 | 2의 작업이 "사용자가 로그온했는지 여부에 관계없이 실행"인지 |
| 2 | 작업 스케줄러 **Start WSL Server** (트리거: 시스템 시작 시) | WSL Ubuntu | `wsl -l -v`에서 `Running` |
| 3 | WSL이 계속 살아 있음 | — | 아래 9.2. 할 일이 없으면 WSL이 스스로 꺼질 수 있다 |
| 4 | WSL 안의 systemd (`/etc/wsl.conf`의 `[boot] systemd=true`) | `docker.service`, `cron.service` | `systemctl is-enabled docker cron` |
| 5 | Docker | `restart: unless-stopped`인 컨테이너 | `docker compose ps` |
| 6 | cron `@reboot` → `boot-check.sh` | 멈춰 있던 서비스가 있으면 `docker compose up -d --wait`(빌드 없음), 공개 주소 확인, 알림 | 휴대폰 "재부팅 뒤 다시 켜졌습니다" |
| 7 | cron | 5분마다 `auto-deploy.sh`, 매일 03:30 `backup.sh` | heartbeat 초록 |

`boot-check.sh` cron 줄 (`crontab -e`):

```
@reboot sleep 60 && /home/user/scene/deploy/home/boot-check.sh >> /home/user/.local/state/scene-deploy/boot-check.log 2>&1 # scene-boot-check
```

연결된 모든 단계를 한 번에 보려면: `~/scene/deploy/home/boot-check.sh --report` (알림은 보내지 않는다).

### 9.2 빈 곳과 조치

- **WSL이 스스로 꺼질 수 있다.** 작업 동작이 `wsl.exe -d Ubuntu --exec /bin/true`이면 명령이 바로 끝난다. WSL은 연결된 Windows 쪽 프로세스가 없으면 잠시 뒤 배포판과 VM을 끈다고 알려져 있고, systemd만으로는 막지 못한다는 보고가 있다(버전마다 다르다). 지금까지 살아 있던 이유는 확인하지 않았다(열어 둔 터미널 등). 조치:
  - 작업 동작을 `wsl.exe`, 인수 `-d Ubuntu --exec /bin/sh -c "exec sleep infinity"`로 바꾼다. 작업 설정의 **"다음 기간 이상 작업이 실행되면 중지"(기본 3일)를 끈다.** 이 `wsl.exe`가 떠 있는 동안 WSL이 유지된다.
  - `%UserProfile%\.wslconfig`에 다음을 넣는다(없으면 만든다). 바꾼 뒤 `wsl --shutdown`.

```
[wsl2]
vmIdleTimeout=-1
```

- **로그인해야 뜨는가.** Docker가 WSL 안의 Docker Engine이면(`docker info --format '{{.OperatingSystem}}'`가 `Ubuntu …`) 로그인이 필요 없다. `Docker Desktop`이라고 나오면 Windows 로그인 뒤에야 뜨므로, 자동 로그인을 켜거나 WSL 안의 Docker Engine으로 바꿔야 한다.
- **Windows 업데이트 재부팅.** 수련회 전주부터 끝날 때까지 Windows 업데이트를 일시 중지한다(설정 → Windows 업데이트 → 업데이트 일시 중지). 활성 시간도 넓혀 둔다.
- **정전.** Surface는 배터리(50% 제한)로 버틴다. 배터리가 바닥나 꺼지면 전기가 돌아와도 스스로 켜지는지 확인하지 않았다. 켜지지 않으면 집에 있는 사람이 전원 버튼을 눌러야 한다(6절 연락).
- **손으로 멈춘 컨테이너.** `docker compose stop`으로 멈춘 서비스는 `unless-stopped`라서 재부팅 뒤에도 그대로 멈춰 있다. `boot-check.sh`가 `up -d`로 올린다.
- **같은 기기의 `ongi` 스택**은 이 순서와 따로 움직인다. 메모리를 함께 쓰므로 재부팅 직후 느릴 수 있다.

### 9.3 재부팅 확인 체크리스트 (사용자, Surface에서)

- [ ] `crontab -l`에 `# scene-auto-deploy`, `# scene-backup`, `# scene-boot-check` 세 줄이 있다
- [ ] `boot-check.sh --report`가 모두 `[ok]`다(알림 값을 아직 안 넣었다면 그 줄만 FAIL)
- [ ] 작업 스케줄러 **Start WSL Server**: 트리거 "시스템 시작 시", "사용자가 로그온했는지 여부에 관계없이 실행", 동작이 `sleep infinity`, 3일 중지 꺼짐 (9.2)
- [ ] `.wslconfig`의 `vmIdleTimeout=-1`
- [ ] Windows 업데이트 일시 중지 날짜
- [ ] **실제 재부팅:** 시작 → 다시 시작. **로그인하지 않고** 기다린다. 휴대폰 LTE로 사이트가 열리기까지 걸린 시간과 "재부팅 뒤 다시 켜졌습니다" 알림 시각을 적는다
- [ ] 30분 뒤 로그인하지 않은 상태 그대로 사이트가 열린다(WSL이 꺼지지 않았다)
- [ ] 로그인해서 `docker compose ps` 모두 `healthy`·`running`, `~/.local/state/scene-deploy/boot-check.log`에 결과
- [ ] 결과를 #410에 남긴다

## 10. 배포 규칙 (#411, 2026-11-19)

스테이징이 없어 main 병합이 곧 운영 배포다. 병합 뒤 5분 안에 서버가 가져가고, 코드가 바뀌었으면 몇 분 안에 다시 뜬다.

### 10.1 병합 전 확인 (모든 PR)

- [ ] `ci-ok`와 `docs-check`가 초록이다(빨강이면 서버는 배포하지 않고 알린다)
- [ ] 동결 중이 아니다(10.3). 동결 중이면 급한 수정만, 10.3 순서로
- [ ] DB를 바꾸는가: `backend/src/main/resources/db/migration/`에 새 파일이 있으면 10.2를 따른다
- [ ] `deploy/home/compose.yaml`이나 `.env`에 새 값이 필요한가: 필요하면 **병합 전에** 서버 `.env`에 먼저 넣는다(값이 없으면 compose가 멈춘다)
- [ ] 신청이 몰리는 시간(공지 직후 등)을 피한다
- [ ] 병합한 사람이 뒤 15분 동안 휴대폰을 본다: "배포 완료" 또는 실패 알림. 알림 설정 전이면 사이트를 직접 연다

### 10.2 12/15 이후 DB를 바꾸는 PR

배포가 실패하면 코드는 되돌아가지만 Flyway 변경은 되돌아가지 않는다. 그래서 집 밖 백업을 먼저 받는다.

1. Surface에서 `~/scene/deploy/home/backup.sh`를 직접 실행하고 `uploaded scene-….sql.gz.age`를 확인한다(실패하면 알림이 온다). 배포 전 덤프(`~/scene-backups/pre-deploy-*`)는 같은 디스크라 이것을 대신하지 않는다.
2. PR을 병합한다.
3. "배포 완료"를 기다리고 사이트에서 바뀐 화면을 한 번 연다.
4. 실패·되돌림 알림이 오면: 먼저 `auto-deploy.sh --pause "DB 복구"`로 자동 배포를 멈춘다. 바뀐 DB에서 이전 코드가 뜨는지 본다. 뜨지 않으면 배포 전 덤프나 1의 백업으로 복구한다. 복구 순서는 4절의 복구 리허설과 같고, 실제 키로 한 리허설(J1)에서 운영 DB에 쓰는 순서까지 확인한 뒤 여기에 적는다.

### 10.3 수련회 배포 동결

- **기간:** 수련회 시작 사흘 전 00:00부터 수련회가 끝나는 날까지. 날짜가 정해지면 적는다: 동결 시작 `____-__-__`, 해제 `____-__-__` (#386 Q8).
- **동결 거는 법 (어디서나):** main에 `deploy/home/FREEZE` 파일을 더하는 PR을 병합한다. 파일 안에는 기간과 이유를 한 줄 적는다. 서버는 이 파일이 있는 커밋을 배포하지 않고 "배포 동결 중" 알림을 한 번 보낸다. `auto-deploy.sh --status`의 `freeze:` 줄로도 본다.
- **동결 푸는 법:** `deploy/home/FREEZE`를 지우는 PR을 병합한다. 그동안 병합된 것이 모두 함께 배포된다.
- **서버에서 바로 멈추는 법:** `auto-deploy.sh --pause "이유"` / `--resume`. 이 기기에서만 켜고 끌 수 있으므로, 집을 떠나는 수련회 동결에는 FREEZE 파일을 쓴다. `--pause`가 켜져 있으면 FREEZE와 상관없이 아무것도 배포하지 않는다.
- **동결 중 급한 수정:**
  1. 정말 수련회 진행을 막는 문제인지 운영진과 정한다. 화면 문구·편의 기능은 기다린다.
  2. 고칠 것만 담은 PR을 만들고 CI를 통과시킨다. 동결 중에는 다른 PR을 병합하지 않는다(급한 수정과 함께 배포된다).
  3. DB를 바꾸면 10.2의 백업이 필요한데, 수련회장에서는 Surface에 손이 닿지 않는다. 그래서 동결 중 급한 수정은 DB를 바꾸지 않는 것으로 한정한다.
  4. Squash and merge 할 때 커밋 메시지 본문에 다음 한 줄을 넣는다: `Deploy-During-Freeze: yes`
  5. 10분 안에 "배포 완료" 또는 실패 알림을 확인한다. 실패하면 서버가 이전 버전으로 되돌린다.
- **서버 앞에서 바로 배포:** `auto-deploy.sh --force`는 `--pause`와 FREEZE를 모두 무시하고 지금의 origin/main을 배포한다.

### 10.4 확인할 것 (사용자, Surface에서)

- [ ] `auto-deploy.sh --pause "시험"` → 알림 → `--status`에 PAUSED → `--resume` → 알림
- [ ] 수련회 날짜가 정해지면 10.3에 동결 기간을 적는다
