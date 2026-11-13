---
title: "Spring's own 4xx request errors keep their status and are not logged as failures"
author: Claude
date: 2026-11-13
branch: claude/dreamy-darwin-g6jvhs
cost: { minutes: 9, tokens: 126681 }
id: l-8542df30
scope: repo
status: active
src: agent
touches:
  - backend/docs/api.md
  - backend/src/main/java/app/scene/common/error/SceneExceptionHandler.java
  - backend/src/test/java/app/scene/common/error/ProblemDetailsIT.java
---

## Decided
- A request Spring rejects with its own 4xx status answers with that status, not 500. Wrong method is 405 with `Allow`, unreadable `Content-Type` is 415, unmatched `Accept` is 406.
- These bodies look like the missing-route 404: no product `code`, a `traceId`, the HTTP reason phrase as `title`, and a fixed Korean `detail`. The Spring exception text never goes in the body. No new `ErrorCode`.
- They are client mistakes, so they do not write the "Unhandled request failure" error log.
- All Spring `ErrorResponse` exceptions with a 4xx status are handled in one place instead of one handler per exception, so the same gap does not reopen for the next exception type. A 5xx `ErrorResponse` is still the unexpected 500 with the error log.
- The more specific handlers still win: `SceneException`, the `400 VALIDATION_FAILED` group, and `NoResourceFoundException` (404, `요청한 경로가 없습니다.`) are unchanged.

## Tried and ruled out
- A separate `@ExceptionHandler(ErrorResponse.class)` method. `ErrorResponse` is an interface, not a `Throwable`, so it cannot be an `@ExceptionHandler` target. The check is an `instanceof` branch at the top of the `Exception` catch-all.
- One handler per exception (405, 415, 406 each). Rejected in issue #212 because the next unlisted Spring exception falls into the 500 catch-all again.
- Running the backend in the cloud session to reproduce. The JDK 25 toolchain download is blocked by the proxy and there is no Docker daemon for Testcontainers. Only `spotlessApply` and `spotlessCheck` run there.

## Watch out
- To prove a bug exists when the backend cannot run locally: push the test-only commit, open a draft PR, and wait for that CI run to finish before pushing the fix. CI cancels a superseded PR run, so pushing the fix early loses the red result.
- The catch-all now passes the exception's headers through. 405 gets `Allow`; 415 and 406 also get Spring's `Accept` header listing supported types.
- Any `ResponseStatusException` with a 4xx status thrown from app code now answers with that status and the generic detail `요청을 처리할 수 없습니다.`, with no `code`. Product errors should still be `SceneException` with an `ErrorCode`.
- The pre-fix "Unhandled request failure" log line was never seen directly. CI console output does not print captured test output. Only the 500 status was observed.

In the code:
- `backend/src/main/java/app/scene/common/error/SceneExceptionHandler.java`: `unexpected` branches to `clientError` when `exception instanceof ErrorResponse` and `getStatusCode().is4xxClientError()`.
- `backend/src/test/java/app/scene/common/error/ProblemDetailsIT.java`: `unsupportedMethodIsMethodNotAllowedWithAllow`, `unsupportedContentTypeIsUnsupportedMediaType`, `unacceptableAcceptIsNotAcceptable`. Probe routes `/__probe/body` (POST only) and `/__probe/json` (`produces` JSON).
- `backend/docs/api.md`: the paragraph after the unexpected-500 and 404 description.
- Before the fix, CI on the test-only commit: `284 tests completed, 3 failed`, each `Status expected:<4xx> but was:<500>`. After the fix: 284 passed.
