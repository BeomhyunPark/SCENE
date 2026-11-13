---
title: Email and Google login stay on the login screen with a not-ready notice
author: Claude
date: 2026-11-13
branch: claude/magical-thompson-pvmfe4
cost: { minutes: 5, tokens: 113080 }
id: l-fb3d571e
scope: repo
status: active
src: agent
touches:
  - frontend/src/components/PublicLogin.css
  - frontend/src/components/PublicLogin.test.tsx
  - frontend/src/components/PublicLogin.tsx
---

## Decided
- The email login submit and the Google button never navigate to /events. They show "이메일·Google 로그인은 아직 준비 중이에요." on the login screen. There is no server login for either yet (issue #210).
- In DEV builds the existing dev login hint also appears below the notice. Hyun asked on 2026-11-13 to keep the dev login panel and only add the notice.
- The notice copy is a draft. There is no confirmed Figma copy for it.

## Tried and ruled out
- One live region holding both sentences. The dev sentence has to stay inside the existing DEV-only branch, so there are two regions: one for the notice, one inside that branch for the hint.
- Testing the format error with "abc". The browser's own type=email check stops that submit before the handler runs. "a@b" passes the native check and fails the app's check, so it reaches the handler.

## Watch out
- Any sentence that mentions 개발용 로그인 must sit inside the DEV-only branch, or the string ships in the production bundle. The build check does not ban that string, so look for it by hand after a build.
- Without a dev session, going to /events bounces back to /login?next=%2Fevents and looks like a reload. With a dev session alive it looks like a successful email login.
- The real backend could not be started in a cloud session: the JDK 25 toolchain download was refused by the network proxy. The click check ran against the mock API only.

In the code:
- frontend/src/components/PublicLogin.tsx: `notReady` state, two `role="status"` regions, the `DevLoginPanel ? (...) : null` branch.
- frontend/src/components/PublicLogin.test.tsx
- Check: `corepack pnpm build`, then `grep -c -F "개발용 로그인" dist/assets/*.js` must print 0.
