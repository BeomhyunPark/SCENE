---
title: Operator invitation link stays outside the operator shell
author: BeomhyunPark
date: 2026-10-16
branch: feat/fe-invitation-accept
touches:
  - frontend/src/App.tsx
  - frontend/src/api/errors.ts
  - frontend/src/api/invitations.ts
  - frontend/src/components/InvitationAccept.css
  - frontend/src/components/InvitationAccept.test.tsx
  - frontend/src/components/InvitationAccept.tsx
  - frontend/src/invitationToken.test.ts
  - frontend/src/invitationToken.ts
---

## Decided
- `/operator/invitations` is a public route, outside `RequireOperator`. A logged-out visit shows guidance and does not call preview or accept.
- The fragment token is read on the first render, removed with `history.replaceState`, and kept in `localStorage` (`scene.invitation`) for 30 minutes from the first store. The login URL only carries `next=/operator/invitations`.
- `EMAIL_NOT_VERIFIED` is a client code. `ErrorCode.java` does not emit it. Show that screen only when the code arrives, and add it to `API_ERROR_CODES` or `isApiError` never matches.
- A failed `localStorage` write uses the same unusable-link screen as `INVITATION_NOT_FOUND`. Do not fall back to an older token. StrictMode runs capture twice, so the failure has to stay unusable after the fragment is gone.
- 200 `ALREADY_ACCEPTED` goes to `/events`. Preview and accept have no `eventId`.
- [돌아가기] on revoked, superseded, expired, mismatch, and the unusable link goes to `/` and clears the token. The status header is the SCENE wordmark.

## Tried and ruled out
- Wrapping the page in `RequireOperator`. Logged-out people would be sent to login before the guidance screen.
- Editing `PublicLogin`. It ignores `next`. Dev login already honors a same-origin `next`.
- Putting `role="status"` on the result `h1`. Testing Library then no longer treats it as a heading.

## Watch out
- `MemoryRouter` does not mirror `window.location.hash`. Tests set the hash on `window` before render.
- The 30-minute case stores an old `storedAt`. Do not wrap `findByRole` in fake timers.
- The server keeps only the token hash. A browser pass cannot click a real accept unless a mailer log still has the raw token.
