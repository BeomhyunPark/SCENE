---
title: Host SCENE on AWS Lightsail Seoul with frontend and API on one origin
author: Claude
date: 2026-11-16
branch: claude/peaceful-ride-f1g0vl
cost: { minutes: 5, tokens: 115559 }
id: l-37c07f11
scope: repo
status: active
src: agent
touches:
  - docs/devops/hosting-decision.md
  - frontend/src/api/client.ts
  - backend/src/main/java/app/scene/common/security/SecurityConfiguration.java
  - backend/src/main/java/app/scene/event/transfer/DueHandoverJob.java
---

## Decided
- Recommended hosting for #231 (2026-11-16, awaiting the user's choice): AWS Lightsail Seoul, one VM per environment running Docker Compose (Caddy + Spring Boot jar + static dist) plus a Lightsail managed PostgreSQL. If Lightsail has no PostgreSQL 17, keep the VM and move only the DB to RDS PostgreSQL 17 in Seoul.
- Frontend and API must share one origin. The frontend calls the API relative to window.location.origin and writes the XSRF-TOKEN cookie itself with no Domain, then sends it as X-XSRF-TOKEN. An API on another subdomain never receives that cookie, so every POST would be 403.
- At least one instance must run all the time with CPU outside requests: DueHandoverJob runs every 60 seconds.
- Deploys set SPRING_PROFILES_ACTIVE to exactly stg or prod. The smoke test checks that POST /api/v1/operator/auth/login is 404 there.

## Tried and ruled out
- GCP Cloud Run + Cloud SQL: the scheduler needs always-on CPU and min instances 1, which costs about $60 a month (estimate) for the app alone. Cheap shared-core Cloud SQL is outside the SLA. Firebase Hosting rewrites reportedly forward only the __session cookie (not verified). Second choice if VM upkeep must be avoided.
- Render: no Korea or Tokyo region, so personal data sits in Singapore. The 512MB Starter is likely too small for Spring Boot. Hobby workspace PITR is 3 days.
- Splitting the API onto a subdomain: needs an API base URL, a cookie Domain and CORS changes, too much before the December dates.

## Watch out
- Lightsail PostgreSQL 17 was not confirmed: the docs found list 12 to 16. Check the blueprint list before creating the DB.
- Prices came from search snippets. This cloud session could not open aws.amazon.com, render.com or docs.cloud.google.com pages, and Gradle could not resolve the foojay plugin offline, so memory and jar size are estimates.

In the code:
- docs/devops/hosting-decision.md (comparison table, sources, checklist)
- frontend/src/api/client.ts: apiRequest, ensureCsrfToken
- backend/src/main/java/app/scene/common/security/SecurityConfiguration.java: CookieCsrfTokenRepository, cookie serializer
- backend/src/main/java/app/scene/event/transfer/DueHandoverJob.java
