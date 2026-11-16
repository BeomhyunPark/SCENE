---
title: SCENE is hosted on the Surface Pro home server; the Lightsail and Google Cloud comparisons are only fallback records
author: Claude
date: 2026-11-16
branch: claude/magical-noether-hrkn1d
cost: { minutes: 3, tokens: 41999 }
id: l-81dd973a
scope: repo
status: active
replaces: l-37c07f11
src: agent
touches:
  - backend/.dockerignore
  - backend/Dockerfile
  - deploy/home/.env.example
  - deploy/home/backup.sh
  - deploy/home/compose.yaml
  - deploy/home/scene-backup.service
  - deploy/home/scene-backup.timer
  - docs/README.md
  - docs/devops/home-server.md
  - docs/devops/hosting-decision.md
---

## Decided
The user chose the Surface Pro home server behind a Cloudflare Tunnel for the January 2027 retreat (2026-11-16, #231), for cost. This replaces the Lightsail recommendation. The hosting decision doc now puts this choice at the top. Two cloud comparisons from the same day sit below it as fallback records: one recommends Google Cloud, the other AWS Lightsail. Deploys stay manual until January and CD stays off.

## Tried and ruled out
AWS Lightsail Seoul (the #240 recommendation) and Google Cloud Seoul (the #241 comparison): about $50–80 a month (estimate) against hardware already owned. If the home server has to be abandoned, recheck prices and PostgreSQL 17 support before picking either one.

## Watch out
Frontend and API must still share one origin. On the home server, nginx serves the pages and proxies /api. The scheduler (DueHandoverJob, every 60 s) needs an always-on process, which the home server has. No route for CD to reach the home server has been chosen yet (tunnel or self-hosted runner).

In the code:
- docs/devops/hosting-decision.md (decision at the top, appendix A Google Cloud, appendix B Lightsail)
- docs/devops/home-server.md, deploy/home/compose.yaml
- docs/devops/ci-cd.md, docs/devops/cd-skeleton.yml (CD off, manual deploy)
