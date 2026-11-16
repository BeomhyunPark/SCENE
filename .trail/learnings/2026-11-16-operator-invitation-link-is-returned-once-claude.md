---
title: Operator invitation link is returned once by create and resend until mail is sent
author: Claude
date: 2026-11-16
branch: claude/applicant-list-with-names-24mq1y
cost: { minutes: 12, tokens: 178507 }
id: l-67ba63cd
scope: repo
status: active
src: agent
touches:
  - docs/test_results/operator-invite-1-link.png
  - frontend/src/components/EventOperators.tsx
  - docs/test_results/operator-invite-2-accepted.png
  - docs/test_results/operator-invite-3-mobile.png
  - frontend/src/App.tsx
  - frontend/src/components/EventHome.css
  - frontend/src/components/EventOperators.test.tsx
  - frontend/src/components/InvitationAccept.tsx
  - frontend/src/components/OperatorShell.tsx
  - frontend/src/components/eventFormat.ts
---

## Decided
- While there is no SMTP adapter, create and resend return `link` (`/operator/invitations#<token>`) once in the 200 body (user decision 2026-11-16, #222, DEC-060 Follow-up). The server still stores only the hash and never logs, audits, or stores the link. Revoke and the list carry no link. Accept still needs the session's verified email, so the owner who sees the link cannot accept it.
- The owner sees pending invitations through `GET /api/v1/operator/events/{eventId}/invitations` (owner only, PENDING only, newest first, `{ id, email, role, status, expiresAt }`).
- The screen is `/events/:eventId/operators` from the event sidebar "운영 멤버". The link lives only in component state; no localStorage, sessionStorage, path, or query.

## Tried and ruled out
- A local/test-only route that reads the captured mail link: production would still have no way to deliver.
- Adding SMTP first: needs a sending method and domain decision.
- Remembering only invitations made on this screen: a reload loses resend and revoke targets.

## Watch out
- After resend the old row is SUPERSEDED. Swap the id in the list cache on success, or a quick click before the refetch revokes the old id and gets 400.
- All three seed users already operate the Local event, so a mock accept keeps their role. To see a new operator appear, use a newly created event.
- The session branch name was reused after its PR was squash-merged; force-push was refused, so the old remote history was merged in (no tree change).

In the code: backend/src/main/java/app/scene/event/invitation/EventInvitationService.java (issue, list), frontend/src/components/EventOperators.tsx, frontend/src/mocks/invitationStore.ts
