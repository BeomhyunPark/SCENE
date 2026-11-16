---
title: Changing what an invitation response carries breaks secret checks in three test classes
author: Claude
date: 2026-11-16
branch: claude/applicant-list-with-names-24mq1y
cost: { minutes: 2, tokens: 36572 }
id: l-22da0c08
scope: repo
status: active
src: agent
touches:
  - backend/src/test/java/app/scene/event/ServerContractRegressionIT.java
  - backend/src/test/java/app/scene/event/invitation/EventInvitationAcceptIT.java
  - backend/src/test/java/app/scene/event/invitation/EventInvitationIT.java
---

## Decided
- When the invitation create/resend body started carrying `link` (DEC-060 Follow-up 2026-11-16), the "no token in the body" checks were rewritten, not removed: `link` must equal the mail port's fragment link, and the body with that link cut out, the audit, and the logs must still not contain the token.

## Watch out
- The token-omission assertion lives in three places, not one. Updating only the invitation IT left 10 CI failures in the other two.
- This session cannot run Gradle tests, so the first CI run is where these show up. Search the test tree for `doesNotContain(token)` before changing any response that touches the token.

In the code: backend/src/test/java/app/scene/event/invitation/EventInvitationIT.java, backend/src/test/java/app/scene/event/invitation/EventInvitationAcceptIT.java (invite helper), backend/src/test/java/app/scene/event/ServerContractRegressionIT.java (responsesAuditsAndLogsOmitSecrets)
