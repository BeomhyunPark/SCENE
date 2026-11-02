---
title: Local email login replaces the separate dev login panel
author: Claude
date: 2026-11-02
branch: claude/loving-maxwell-82iyy0
cost: { minutes: 1, tokens: 1333 }
id: l-13a464e2
scope: repo
status: active
src: agent
touches:
  - frontend/src/components/PublicLogin.tsx
---

## Decided
- In DEV builds the normal login form signs in with a local seed account email; the password is ignored. The separate dev login panel is gone. Hyun asked for this after the panel and the email form kept confusing each other.
- Production builds only say email and Google login are not ready yet. They never navigate to /events without a session.

## Tried and ruled out
- Keeping the panel and only making the email button show a notice. Two login paths on one screen still confused the user, so the panel was removed.
- Building real email + password auth for this fix. That needs a credential format decision first, so the fix stays a local-only bridge.

## Watch out
- An email button that only navigates to /events looks like a login while a dev session cookie is alive, and after logout RequireOperator bounces to /login?next=%2Fevents, which looks like a reload loop.
- Switching account means logging in again with another local email.
- Keep the account list in the lazily imported module so seed users stay out of the production bundle.

In the code:
- frontend/src/localLogin.ts maps owner@scene.local, manager@scene.local, staff@scene.local and local-invite@example.com to seed userIds.
- frontend/src/components/PublicLogin.tsx loads it via an import.meta.env.DEV dynamic import, clears the query cache, sets queryKeys.me and navigates to the next param with replace.
