# SCENE 홈서버 운영

- 상태: **결정 (2026-11-16)**. 1월 수련회([#230](https://github.com/BeomhyunPark/SCENE/issues/230))는 집의 Surface Pro 홈서버에서 운영한다. 클라우드 비교는 [호스팅 결정](hosting-decision.md)에 기록으로 남긴다.
- 주소: `https://scene.greengroove.app` (Cloudflare DNS + Cloudflare Tunnel)
- 파일: [`deploy/home/`](../../deploy/home/) — `compose.yaml`, `.env.example`, `backup.sh`, systemd 타이머

## 1. 구성

```
브라우저 ──HTTPS──▶ Cloudflare ──Tunnel(밖으로 나가는 연결)──▶ cloudflared ─▶ web(nginx) ─┬─▶ 정적 화면
                                                                                       └─▶ /api ─▶ backend(Spring) ─▶ postgres
```

- 공유기 포트를 열지 않는다. 집 IP가 드러나지 않고, IP가 바뀌어도 접속이 유지된다.
- 화면과 API를 한 주소(같은 출처)에서 제공한다. `SCENE_SESSION`·`SCENE_PSESSION` 쿠키가 그대로 동작한다.
- HTTPS는 Cloudflare가 처리한다. nginx는 백엔드에 `X-Forwarded-Proto: https`를 넘긴다. 이 값은 Google 로그인(#232)의 리디렉션 주소에 쓰인다.
- 이 서버 하나가 운영 환경이다. 리허설 데이터는 신청을 열기 전에 지운다(5절).

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

## 3. 처음 배포

1. Cloudflare Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared). 토큰을 복사한다.
2. 그 터널의 **Public Hostname**: `scene.greengroove.app` → Service `HTTP` · `web:80`.
3. 서버에서 다음을 실행한다.

```bash
sudo mkdir -p /opt/scene && sudo chown "$USER" /opt/scene
```

```bash
git clone https://github.com/BeomhyunPark/SCENE.git /opt/scene
```

```bash
cd /opt/scene/deploy/home && cp .env.example .env && chmod 600 .env
```

4. `.env`에 `SCENE_DB_PASSWORD`(`openssl rand -base64 32`로 만든 값)와 `CLOUDFLARE_TUNNEL_TOKEN`을 채운다.
5. 실행한다.

```bash
docker compose up -d --build
```

6. 확인: `docker compose ps`에서 모두 `healthy`·`running`인지 본다. 브라우저에서 `https://scene.greengroove.app`이 열리는지 본다.

**업데이트:** `cd /opt/scene && git pull && cd deploy/home && docker compose up -d --build`. DB 변경(Flyway)은 백엔드가 시작될 때 자동으로 적용된다. 업데이트 전에 4절 백업을 한 번 직접 돌린다.

> 기존 `retreat.greengroove.app` 터널과 서비스는 내린다. 같은 기기에서 돌린다면 메모리와 포트가 겹치지 않는지도 확인한다.

## 4. 백업 (매일 03:30, 암호화, 집 밖 보관)

1. **키는 다른 기기에서 만든다** (휴대폰·다른 PC): `age-keygen -o scene-backup.key`. 출력된 공개키(`age1…`)만 `.env`의 `BACKUP_AGE_RECIPIENT`에 넣는다. 개인키는 비밀번호 관리자 등 서버 밖에 둔다. 서버에는 공개키만 있으므로, 서버를 도난당해도 백업은 풀리지 않는다.
2. 서버에 `sudo apt install age rclone`을 설치하고 `rclone config`로 Google Drive를 `gdrive`라는 이름으로 연결한다. `BACKUP_REMOTE=gdrive:scene-backups`.
3. 직접 한 번 실행해 본다: `./backup.sh`.
4. 매일 자동으로 돌게 등록한다.

```bash
sudo cp scene-backup.service scene-backup.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now scene-backup.timer
```

5. **복구 리허설 (신청 시작 전 한 번 필수)**: 다른 기기에서 받은 파일로 아래처럼 복구해 보고 신청 건수가 맞는지 확인한다.

```bash
age -d -i scene-backup.key scene-YYYYMMDD-HHMMSS.sql.gz.age | gunzip | docker compose exec -T postgres psql -U scene -d scene_restore
```

(`scene_restore` DB는 먼저 `createdb`로 만든다. 운영 DB에 바로 덮어쓰지 않는다.)

## 5. 신청 시작 전 체크리스트 (12/15 전)

- [ ] Google 로그인(#232) 동작, 운영진 계정으로 로그인 확인
- [ ] 리허설로 만든 행사·신청 삭제 (또는 DB를 새로 만들기)
- [ ] 백업 자동 실행 + 복구 리허설 1회
- [ ] 휴대폰 LTE(집 Wi-Fi 아님)로 신청 페이지 접속 확인
- [ ] Cloudflare에서 `scene.greengroove.app`이 프록시(주황 구름) 상태인지 확인

## 6. 수련회 당일 (가장 큰 위험: 집 정전·인터넷 장애)

- 전날 밤: 신청자 명단 CSV를 내려받아(#233) 운영진 휴대폰과 종이에 보관한다. 서버가 멈춰도 명단으로 체크인을 이어 간다.
- 당일 아침: 집 밖 네트워크에서 접속을 확인한다. 집에 있는 사람이 재부팅할 수 있게 연락을 정해 둔다.
- 서버가 멈추면: Surface 재부팅 → `docker compose ps` 확인. 모든 서비스가 `restart: unless-stopped`라서 부팅 후 자동으로 올라온다.
- 장애가 하루 이상 이어지면: 최신 백업을 클라우드 VM에 복구하고 터널 토큰만 옮겨 같은 주소로 띄운다(compose 파일이 같다).

## 7. 아직 하지 않은 것

- 이 구성은 Docker가 없는 개발 환경에서 문법(compose YAML, bash)만 확인했다. **Surface에서 처음 빌드하고 실행할 때 실제로 확인**하고 결과를 #231에 남긴다.
- 자동 배포(CD)는 두지 않는다. 1월까지는 위 업데이트 명령을 손으로 실행한다.
- 서버 모니터링·알림: Cloudflare Tunnel 상태 알림(Zero Trust → Notifications)을 켜 두는 것을 권장한다.
