---
title: "A cloud session runs the full backend check and real click checks through Docker on PostgreSQL 17, and unmerged verified work is cherry-picked onto main"
author: Claude
date: 2026-11-16
branch: claude/tender-gates-nhjpob
cost: { minutes: 11, tokens: 44097 }
id: l-4c48590f
scope: repo
status: active
replaces: l-a986896f
src: agent
touches:
  - frontend/src/components/answerDisplay.test.ts
  - frontend/src/components/answerDisplay.ts
  - backend/docs/api.md
  - backend/src/main/java/app/scene/event/application/ApplicationAnswer.java
  - backend/src/main/java/app/scene/event/application/ApplicationAnswerRow.java
  - backend/src/main/java/app/scene/event/application/OperatorApplicationService.java
  - backend/src/main/resources/mapper/ApplicationQueryMapper.xml
  - backend/src/test/java/app/scene/event/application/ApplicationReadHttpIT.java
  - frontend/src/api/applications.ts
  - frontend/src/components/EventApplication.tsx
---

## Decided
A cloud session can run the full backend check, Testcontainers ITs included, and click through the real app on PostgreSQL 17, the same version as CI and production. Docker works once the daemon is started by hand, so the earlier "no Docker, use the local PostgreSQL 16" route is no longer needed. JDK 25 is copied out of the eclipse-temurin image, so no extra network hosts have to be allowed.

Work that was verified on a branch but never got a pull request is moved onto the latest main by cherry-picking its own commits, not by rebuilding it. The applicant detail view for #228 came over this way after the form setup change (#253) merged.

In the applicant detail view an option that belongs to a group shows the group first, because generated meal options are just "집회" or "점심" and the day lives in the group.

## Tried and ruled out
Rebuilding the #228 view from scratch: the earlier branch already had the backend fields, the display rules, tests and a click record. Merging that whole branch: it carries old pre-squash history of work already on main, so only its three own commits were taken.

## Watch out
A backgrounded server stops when the app or the time limit ends the task; start it again before a click check. Maven Central sometimes answers 429 on the first Gradle run; a retry passes. The form screen is the usual conflict spot when two branches touch registration: hand-made questions use the full editor and need the event period passed in, while base and generated questions use the wording editor.

In the code:
- `sudo dockerd > /tmp/dockerd.log 2>&1 &`, then `docker pull eclipse-temurin:25-jdk`, `docker create`, `docker cp <id>:/opt/java/openjdk /opt/temurin25`
- `cd backend && docker compose up -d --wait`, `./gradlew -Porg.gradle.java.installations.paths=/opt/temurin25 check` or `bootRun --args='--spring.profiles.active=local'`
- `cd frontend && VITE_API_MOCK=0 pnpm dev`
- frontend/src/components/answerDisplay.ts (optionText), frontend/src/components/EventRegistrationSetup.tsx
