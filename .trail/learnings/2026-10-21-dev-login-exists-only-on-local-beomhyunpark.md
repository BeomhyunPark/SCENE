---
title: dev login exists only on local and test
author: BeomhyunPark
date: 2026-10-21
branch: fix/dev-login-profile-gate-session
touches:
  - backend/docs/api.md
  - backend/docs/source-guide.md
  - backend/src/main/java/app/scene/common/error/ErrorCode.java
  - backend/src/main/java/app/scene/common/error/SceneExceptionHandler.java
  - backend/src/main/java/app/scene/common/security/SecurityProperties.java
  - backend/src/main/java/app/scene/event/invitation/EventInvitationService.java
  - backend/src/main/java/app/scene/identity/OperatorLoginRequest.java
  - backend/src/main/java/app/scene/identity/OperatorPrincipal.java
  - backend/src/main/java/app/scene/identity/OperatorSessionController.java
  - backend/src/main/resources/application.yml
---

## Decided
- `POST /api/v1/operator/auth/login` lives only on `DevLoginController` with `@Profile({"local","test"})`. `me` and `logout` stay on `OperatorSessionController` for every profile. There is no enable flag.
- The login matcher stays `permitAll`. Other profiles return 404 because the bean is absent, not because security rejects the call.
- `OperatorPrincipal.email` is the verified session address. Only dev login writes it. Invitation preview and accept throw `EMAIL_NOT_VERIFIED` (403) when that address is missing, and `INVITATION_EMAIL_MISMATCH` when it differs.
- Cookie names are `SCENE_SESSION` (path `/`) and `SCENE_PSESSION` (path `/api/v1/participant`). Both are HttpOnly, Secure, SameSite=Lax. A successful login calls `getSession()`, then `changeSessionId()`, then `saveContext`.
- Tests set `spring.profiles.active=test` in `src/test/resources/application.properties`. A prod or stg IT must also set `spring.profiles.active` on `@SpringBootTest` so `test` does not stay active. Do not `@Import(PostgresTestcontainer)` on those contexts. Supply `SCENE_DB_*` with `@DynamicPropertySource`. Do not relax `ApplicationContextIT`.
- A path with no controller is 404 with no product `code`. `SceneExceptionHandler` handles `NoResourceFoundException` before the `Exception` catch-all. The detail is `요청한 경로가 없습니다.` and the body does not include `No static resource`.
- The dev login panel and the seed user list load only when `import.meta.env.DEV` is true. `VITE_DEV_LOGIN` is gone. `pnpm build` fails if `dist/assets` contains `Local owner` or the seed owner UUID. The hint sits outside the panel `Suspense`.

## Tried and ruled out
- A property or env flag that turns dev login on outside `local` and `test`.
- Making the security matcher conditional. The first prod failure was 500, not 401 or 403. Security was not blocking the missing controller.
- Returning `RESOURCE_NOT_FOUND` for a missing route. That code means a missing resource the caller is not shown.
- Renaming `OperatorPrincipal.email`. A comment states that the field is the verified address.
- Editing `PRODUCT_DECISIONS.md` to mark the DEC-067 consequence line done. The decision doc stays as written. `backend/docs/api.md` matches the code.
- Proving session fixation by comparing `MockHttpSession` id with the cookie. Those are different id spaces. Log in twice and show the old cookie is 401 on `/me`.
- Putting the dev-login hint inside the same `Suspense` as the lazy panel. The fallback replaces the hint while the chunk loads.

## Watch out
- `spring.mvc.problemdetails.enabled` turns a missing controller into `NoResourceFoundException`. The catch-all used to answer 500 `urn:scene:problem:unexpected` with no `code`. A new missing-route test must expect 404, not that 500.
- `@ActiveProfiles("prod")` alone does not drop the `test` profile from test `application.properties`.
- `vi.stubEnv("DEV", …)` needs a boolean. `import.meta.env.DEV` is `true` under Vitest.
- Do not treat `rg … || echo clean` as proof when `rg` is missing from the shell.
