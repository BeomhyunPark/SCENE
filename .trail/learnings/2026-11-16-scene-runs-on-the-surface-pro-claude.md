---
title: "SCENE runs on the Surface Pro home server behind a Cloudflare Tunnel, with nightly encrypted backups off the machine"
author: Claude
date: 2026-11-16
branch: claude/exciting-newton-6cjmsc
cost: { minutes: 3, tokens: 30255 }
id: l-27c93764
scope: repo
status: active
src: agent
touches:
  - frontend/src/api/applications.ts
  - frontend/src/components/ParticipantApply.test.tsx
  - frontend/src/components/ParticipantGate.css
  - frontend/src/components/PublicApply.tsx
  - frontend/src/components/apply/AnswerInput.tsx
  - frontend/src/components/apply/answerModel.test.ts
  - frontend/src/components/apply/answerModel.ts
  - frontend/src/mocks/participantStore.ts
  - docs/devops/home-server.md
---

## Decided
For the January 2027 retreat, SCENE runs at scene.greengroove.app on the user's Surface Pro (16 GB, Ubuntu) at home. The domain's DNS is already on Cloudflare. The stack is Docker Compose: postgres:17, the backend on the prod profile, nginx serving the pages and proxying /api on one origin, and cloudflared using a tunnel token. No router port is opened, and the home IP stays hidden. pg_dump runs every night, is encrypted with age to a public key, and goes to Google Drive with rclone. The private key stays off the server. Deploys are manual (git pull, then docker compose up -d --build). There is no CD before January.

## Tried and ruled out
Google Cloud Seoul (Cloud Run, Cloud SQL, load balancer) at about $80 a month: the user picked the home server for cost. The comparison stays in the hosting decision doc as the fallback. Port forwarding with dynamic DNS: it exposes the home IP and depends on the ISP.

## Watch out
The biggest risk is a home power or internet outage on retreat day. The plan is a CSV roster the night before (#233), a UPS on the router, and Battery Limit mode on the Surface so it doesn't swell while always plugged in. In prod, the only operator login is Google login (#232); dev login stays local and test only (DEC-067). The compose setup was checked only for syntax here, because this environment has no Docker. Verify it on the Surface.

In the code:
- deploy/home/{compose.yaml,.env.example,backup.sh,scene-backup.service,scene-backup.timer}
- backend/Dockerfile, frontend/Dockerfile, frontend/nginx.conf
- docs/devops/home-server.md (runbook), docs/devops/hosting-decision.md (superseded)
