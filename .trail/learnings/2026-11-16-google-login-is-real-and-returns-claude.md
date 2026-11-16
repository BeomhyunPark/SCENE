---
title: Google login is real and returns through the login-done page; email login still shows a not-ready notice
author: Claude
date: 2026-11-16
branch: claude/google-login
cost: { minutes: 9, tokens: 103248 }
id: l-a5cc3021
scope: repo
status: active
replaces: l-fb3d571e
src: agent
---

## Decided
The Google button starts real sign-in (DEC-069). It saves `next` in sessionStorage and goes to /oauth2/authorization/google. The server ends a successful sign-in at /login/done, which reads `next` once, keeps only a same-site path, and replaces itself. Failures come back as /login?error=google or /login?error=google_unverified with a short notice. On the mock API (VITE_API_MOCK=1) the button shows "목업 화면에서는 Google 로그인을 쓸 수 없어요." instead of leaving the app. Email login still shows "이메일 로그인은 아직 준비 중이에요. Google로 로그인해 주세요."

## Tried and ruled out
Redirecting straight to /events after Google: invitation and space-leave links send people to /login?next=…, and that path would be lost. Passing `next` through the server: Spring's authorization start does not carry it, and a server-side open redirect needs its own checks.

## Watch out
Any sentence that mentions 개발용 로그인 must stay inside the DEV-only branch. After a build, `grep -c -F "개발용 로그인" dist/assets/*.js` must print 0. The Vite dev proxy and nginx both forward /oauth2 and /login/oauth2 to the backend. /login/done is an app route and must not be proxied.

In the code:
- frontend/src/api/googleSignIn.ts (startGoogleSignIn, takeLoginNext, safeNext), frontend/src/components/LoginDone.tsx, PublicLogin.tsx, App.tsx route, vite.config.ts proxy
- backend/src/main/java/app/scene/identity/GoogleSignInHandler.java (SUCCESS = /login/done)
