# SCENE 홈서버 운영

- 상태: **결정 (2026-11-16)**. 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 집의 Surface Pro 홈서버에서 운영한다. 클라우드 비교는 [호스팅 결정](hosting-decision.md)에 기록으로 남긴다.
- 주소: `https://scene.greengroove.app` (Cloudflare DNS + Cloudflare Tunnel)
- 파일: [`deploy/home/`](../../deploy/home/) — `compose.yaml`, `.env.example`, `auto-deploy.sh`, `backup.sh`

## 1. 구성

```
브라우저 ──HTTPS──▶ Cloudflare ──Tunnel(밖으로 나가는 연결)──▶ cloudflared ─▶ web(nginx) ─┬─▶ 정적 화면
                                                                                       └─▶ /api ─▶ backend(Spring) ─▶ postgres
```

- 공유기 포트를 열지 않는다. 집 IP가 드러나지 않고, IP가 바뀌어도 접속이 유지된다.
- 화면과 API를 한 주소(같은 출처)에서 제공한다. `SCENE_SESSION`·`SCENE_PSESSION` 쿠키가 그대로 동작한다.
- HTTPS는 Cloudflare가 처리한다. nginx는 백엔드에 `X-Forwarded-Proto: https`를 넘긴다. 이 값은 Google 로그인(#232)의 리디렉션 주소에 쓰인다.
- **클라이언트 IP (#389, 2026-11-19).** 초대 미리보기·수락 횟수 제한은 계정과 클라이언트 IP 기준이다. nginx는 `X-Forwarded-For`를 Cloudflare가 넣는 `CF-Connecting-IP` 하나로 **덮어쓴다**(이어 붙이지 않는다). 클라이언트가 보낸 `X-Forwarded-For`·`Forwarded`·`X-Forwarded-Port`·`X-Forwarded-Prefix`·`X-Forwarded-Ssl`·`X-Real-IP`는 백엔드로 넘기지 않는다(`frontend/nginx.conf`).
  - 백엔드는 `server.forward-headers-strategy: native`(Tomcat RemoteIpValve, `application.yml`)다. 이 헤더들은 접속한 주소가 사설·루프백 대역(`server.tomcat.remoteip.internal-proxies` 기본값, compose 네트워크의 nginx 포함)일 때만 믿고, RFC 7239 `Forwarded`는 읽지 않는다. 그래서 사용자마다 따로 한도를 쓰고, 헤더를 꾸며 한도를 우회할 수 없다.
  - 전제: nginx·백엔드 포트를 밖에 열지 않는다. 포트를 열면 `CF-Connecting-IP`를 클라이언트가 직접 넣을 수 있으므로, 그때는 nginx `set_real_ip_from`에 Cloudflare 대역을 넣는 방식으로 바꾼다.
  - 이전(`SERVER_FORWARD_HEADERS_STRATEGY: framework`)은 어느 주소에서 온 헤더든 믿었고, nginx가 그대로 넘기던 `Forwarded: for=…`로 요청마다 다른 IP를 꾸밀 수 있었다.
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
- 기록: `~/.local/state/scene-deploy/auto-deploy.log`. 실패해도 알림은 오지 않으므로, 실행 코드를 병합한 뒤에는 이 기록이나 사이트를 한 번 본다.
- 이미지를 먼저 빌드하고, 빌드가 실패하면 돌고 있는 컨테이너는 건드리지 않는다.
- cron에는 Windows PATH가 없어 `~/.docker/config.json`의 Docker Desktop 인증 도우미(`desktop.exe`)를 못 찾는다. 그래서 스크립트는 빈 설정(`~/.local/state/scene-deploy/docker-config`)을 쓴다. 공개 이미지만 쓰므로 인증이 필요 없다.
- `.env`를 바꿨거나 지금 바로 다시 띄우려면: `~/scene/deploy/home/auto-deploy.sh --force`
- 잠시 멈추려면 `crontab -e`에서 `# scene-auto-deploy` 줄 앞에 `#`을 붙인다. 손으로 배포할 때는 `cd ~/scene && git pull && cd deploy/home && docker compose up -d --build`.
- 배포 전 덤프는 같은 디스크에 있는 임시 안전망이다. 집 밖 백업(4절)을 대신하지 않는다.
- 스테이징이 없으므로 병합이 곧 운영 반영이다. 신청이 열린 뒤(12/15~)에는 DB 변경이 있는 PR을 병합하기 전에 4절 백업을 한 번 직접 돌린다.

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

백업이 실패해도 알림은 오지 않는다. `backup.log`나 버킷의 최신 파일 날짜를 가끔 본다.

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
- 서버가 멈추면: Surface 재부팅 → `docker compose ps` 확인. 모든 서비스가 `restart: unless-stopped`라서 부팅 후 자동으로 올라온다.
- 장애가 하루 이상 이어지면: 최신 백업을 클라우드 VM에 복구하고 터널 토큰만 옮겨 같은 주소로 띄운다(compose 파일이 같다).

## 7. 아직 하지 않은 것

- **확인한 것 (2026-11-17, 이 Surface, 가짜 비밀값·임시 프로젝트 이름, 터널 제외):** `backend`·`web` 이미지 빌드, postgres:17 + 백엔드(prod 프로필) 기동과 Flyway 11개 적용, 세 서비스 healthy. nginx를 거쳐 `/`와 SPA 경로 200, `/api/v1/operator/me` 401, `/oauth2/authorization/google`이 `redirect_uri=https://scene.greengroove.app/login/oauth2/code/google`로 302. 메모리는 백엔드 약 330 MB, postgres 약 50 MB. 확인 뒤 임시 스택과 볼륨은 지웠다.
- **운영 기동 (2026-11-17 00:55):** `~/scene`(main `4f02023`)에서 `docker compose up -d --build`. 터널 연결 4개 등록, 외부에서 `https://scene.greengroove.app/` 200, `/api/v1/operator/me` 401, Google 로그인 시작이 실제 클라이언트 ID와 올바른 `redirect_uri`로 302.
- **실제 클릭 (2026-11-17, 사용자):** 첫 관리자 Google 로그인 성공. 서버 DB에서 조직 1개·사용자 1명·멤버 1명·Google 계정 연결 1건 생성 확인.
- **아직 확인하지 않은 것:** 행사 만들기와 운영진 초대, 휴대폰 신청, 백업·복구(4절), Windows 재부팅 뒤 자동 기동.
- 자동 배포 확인 (2026-11-17, 서버 검증): 변경 없음 실행, `--force` 배포 1회(덤프 → 빌드 → 스모크 통과), 스모크 주소를 틀리게 주어 실패·되돌림 경로 1회 실행. 되돌린 뒤 스모크가 통과하는 경우와 실제 DB 변경이 있는 배포는 아직 겪지 않았다. cron을 통한 실제 병합 반영 결과는 #257에 남긴다.
- **장애 기록 (2026-11-17 15:00 ~ 11-18 22:00):** cron에서 실행된 코드 배포 9건이 모두 이미지 pull 단계에서 실패했다(위 `desktop.exe` 문제). 손으로 실행한 시험은 Windows PATH가 있는 셸이라 통과해서 놓쳤다. 빌드 전에 실패해 사이트는 이전 버전(8f64cdb)으로 계속 떠 있었다. 수정 뒤 cron과 같은 환경(`env -i`, 짧은 PATH)으로 main `b5075b1`을 배포해 V16까지 Flyway 적용과 스모크 통과를 확인했다(서버 검증). 빌드 실패 시 컨테이너를 건드리지 않는 경로는 아직 실행해 보지 않았다.
- 배포 실패 알림이 없다.
- 서버 모니터링·알림: Cloudflare Tunnel 상태 알림(Zero Trust → Notifications)을 켜 두는 것을 권장한다.
