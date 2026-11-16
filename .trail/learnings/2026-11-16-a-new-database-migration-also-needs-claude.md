---
title: A new database migration also needs the pinned latest-version check bumped
author: Claude
date: 2026-11-16
branch: claude/applicant-list-with-names-24mq1y
cost: { minutes: 2, tokens: 7811 }
id: l-945209a6
scope: repo
status: active
src: agent
touches:
  - backend/src/test/java/app/scene/ApplicationContextIT.java
---

## Decided
- A context test pins the latest applied Flyway version. Each new migration bumps that number in the same change (V7 did it, V8 for retrospectives did it after CI caught it).

## Watch out
- This session cannot run Gradle, so the miss shows up only as one red test in CI ("expected N but was N+1"). Bump it when you add the migration file.

In the code: backend/src/test/java/app/scene/ApplicationContextIT.java (flywayAppliedBaselineMigration), backend/src/main/resources/db/migration/
