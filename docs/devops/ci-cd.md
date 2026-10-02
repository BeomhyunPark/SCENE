# SCENE CI/CD pipeline

Status: baseline CI. CD intentionally not enabled (hosting undecided).

## Workflows

| Workflow | File | Jobs (check names) | Runs on |
|---|---|---|---|
| docs-ci | `.github/workflows/docs-ci.yml` | `docs-check` | PR to main, push to main, manual |
| ci | `.github/workflows/ci.yml` | `changes`, `backend`, `frontend`, `ci-ok` | PR to main, push to main, manual |

- **docs-check**: `scripts/check_docs.py` (all `docs/**/*.json` parse; reaction-check results have passed == total;
  relative Markdown links resolve) + syntax check of `docs/**/*.figma.js` (wrapped in an async function, since they
  are Figma plugin bodies with top-level `return`).
- **changes**: decides whether backend/frontend jobs run. A job runs only if its project exists
  (`backend/gradlew`, `frontend/package.json`) AND (relevant paths changed OR manual run).
  Paths: `backend/**` / `frontend/**` + `.github/workflows/ci.yml`.
- **backend** (confirmed by Backend Lead): working dir `backend/`; Java 25 Temurin (`actions/setup-java`, no cache);
  `gradle/actions/setup-gradle` for caching + wrapper validation (default `validate-wrappers: true`);
  `chmod +x gradlew`; `./gradlew check` (Spotless google-java-format + tests incl. Testcontainers postgres:17 on runner
  Docker); `./gradlew assemble` (no test re-run); uploads `build/reports/tests` + `build/test-results` unless cancelled.
  Timeout 25 min. Starts running once `feat/backend-phase0-scaffold` (which adds `backend/gradlew`) is opened/merged.
- **frontend**: skeleton; skips until `frontend/package.json` exists. Assumes pnpm + `frontend/.nvmrc` (undecided).
  Uses `pnpm run --if-present lint/typecheck/test` and `pnpm run build`.
- **ci-ok**: aggregate; passes if every job succeeded or was skipped. Use as the stable required check.
- Concurrency: superseded PR runs are cancelled; push-to-main runs are not. Permissions default `contents: read`
  (`changes` adds `pull-requests: read` for paths-filter).

Action versions (latest majors verified 2026-10-02 via GitHub releases API):
actions/checkout@v7 (7.0.1), actions/setup-java@v6 (6.0.1, README documents temurin 25), gradle/actions/setup-gradle@v6
(6.4.0), actions/upload-artifact@v7 (7.0.1), dorny/paths-filter@v4 (4.0.3), actions/setup-python@v7 (7.0.0),
actions/setup-node@v7 (7.0.0), pnpm/action-setup@v6 (6.1.0). Temurin 25 LTS GA available (Adoptium API: 25.0.4+101).

## Dependabot
`.github/dependabot.yml`: github-actions (/) and gradle (/backend), weekly, Asia/Seoul. npm (/frontend) commented out.

## CD (not enabled)
[`cd-skeleton.yml`](cd-skeleton.yml) is reference only and is not under `.github/workflows`. Proposed mapping, to confirm with the
tech architect: push main -> dev; tag `vX.Y.Z-rc.N` -> stg; tag `vX.Y.Z` -> prod (Environment with required reviewer).
Order: Flyway migrate -> backend rollout -> frontend publish -> smoke test. Blocked on: hosting choice for backend,
frontend, PostgreSQL; artifact form (image vs jar, registry); per-env secrets (DB creds, deploy creds/OIDC, API base URL,
CORS allowlist).

## Proposed branch protection for main
Required checks: `docs-check`, `ci-ok`. See PR description for full settings.
