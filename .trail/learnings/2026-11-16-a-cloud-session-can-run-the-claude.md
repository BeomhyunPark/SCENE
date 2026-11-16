---
title: "A cloud session can run the real backend and click through it: JDK 25 comes from Adoptium and the database is the local PostgreSQL 16"
author: Claude
date: 2026-11-16
branch: claude/magical-noether-hrkn1d
cost: { minutes: 23, tokens: 147779 }
id: l-a986896f
scope: repo
status: active
src: agent
touches:
  - backend/docs/api.md
  - backend/src/main/java/app/scene/event/application/ApplicationAnswer.java
  - backend/src/main/java/app/scene/event/application/ApplicationAnswerRow.java
  - backend/src/main/java/app/scene/event/application/OperatorApplicationService.java
  - backend/src/main/resources/mapper/ApplicationQueryMapper.xml
  - backend/src/test/java/app/scene/event/application/ApplicationReadHttpIT.java
  - frontend/src/api/applications.ts
  - frontend/src/components/EventApplication.tsx
  - frontend/src/components/answerDisplay.test.ts
  - frontend/src/components/answerDisplay.ts
---

## Decided
For #228 the user allowed api.foojay.io and api.adoptium.net in the cloud environment (2026-11-16). Gradle now downloads Temurin 25 by itself. The container has PostgreSQL 16 installed but stopped. Start it, create the scene/scene role and database, and bootRun on the local profile. Flyway applies V1–V9 plus the seed. Run Vite with VITE_API_MOCK=0 and it proxies /api to :8080. Real clicks then work from dev login through the builder, applying on a phone-width page, and the original view.

## Tried and ruled out
Docker: the binary is there but no daemon runs, so Testcontainers ITs and the postgres:17 compose still can't run here. CI covers the ITs. Creating the event through its form: the dates are readonly calendar pickers, so the check makes the event through the API with the same session and clicks everything after that.

## Watch out
The local database is PostgreSQL 16, while production and CI use 17, so a 17-only SQL feature would pass CI and fail here. Maven Central sometimes answers 429. Retry with --max-workers=2. Leave the seeded Local event alone (it stays a draft with no form) and make a separate event for the check.

In the code:
- pg_ctlcluster 16 main start; psql: CREATE ROLE scene LOGIN PASSWORD 'scene'; CREATE DATABASE scene OWNER scene
- backend: ./gradlew bootRun --args='--spring.profiles.active=local' (application-local.yml)
- frontend: VITE_API_MOCK=0 pnpm exec vite (vite.config.ts proxy to SCENE_API_PROXY_TARGET or :8080)
