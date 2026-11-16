---
title: SCENE is hosted on the Surface Pro home server with no separate staging; rehearsal data is deleted before applications open
author: Claude
date: 2026-11-16
branch: claude/magical-noether-hrkn1d
cost: { minutes: 2, tokens: 18403 }
id: l-92d6784a
scope: repo
status: active
replaces: l-81dd973a
src: agent
touches:
  - docs/devops/cd-skeleton.yml
  - docs/devops/ci-cd.md
  - docs/devops/hosting-decision.md
  - docs/devops/home-server.md
  - deploy/home/compose.yaml
---

## Decided
The user chose the Surface Pro home server behind a Cloudflare Tunnel for the January 2027 retreat (2026-11-16, #231), for cost. There is no separate staging. By 11/30 the whole flow is rehearsed on that one server (operator login, form setup, applying from a phone, roster). Before applications open on 12/15, a backup is taken and the rehearsal events and applications are deleted, or the database is recreated. Deploys stay manual until January and CD stays off. The hosting decision doc puts this choice at the top. The Google Cloud and Lightsail comparisons sit below it as fallback records.

## Tried and ruled out
A separate staging environment: a second server or cloud bill for a one-person project before January. AWS Lightsail Seoul (the #240 recommendation) and Google Cloud Seoul (the #241 comparison): about $50–80 a month (estimate) against hardware already owned. If the home server has to be abandoned, recheck prices and PostgreSQL 17 support before picking either one.

## Watch out
With no staging, a bad deploy after 12/15 hits real applications directly. Take a backup before every deploy. Frontend and API must still share one origin (nginx serves the pages and proxies /api). The scheduler (DueHandoverJob, every 60 s) needs an always-on process. No route for CD to reach the home server has been chosen yet.

In the code:
- docs/devops/hosting-decision.md (decision and staging at the top, appendix A Google Cloud, appendix B Lightsail)
- docs/devops/home-server.md §1 and §5 (rehearsal and deletion checklist), deploy/home/compose.yaml
- docs/devops/ci-cd.md, docs/devops/cd-skeleton.yml (CD off, no stg for January)
