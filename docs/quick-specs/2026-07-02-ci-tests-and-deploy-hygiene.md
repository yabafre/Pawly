# Quick Spec: CI tests + deploy hygiene (pre-mortem R3, R12, R13)

**Date:** 2026-07-02
**Author:** Alex
**Type:** fix
**Status:** done

## What

Three infra fixes from `docs/pre-mortem.md`: (1) add a blocking **test job** to the CI workflow — today `build.yml` only compiles and none of the 2,327 tests runs automatically (R3); (2) extend `trigger-deploy.yml` `paths:` with `apps/api/src/modules/mail/**` so email-template changes redeploy the Trigger.dev tasks that import them (R12); (3) replace the U+2500 box-drawing characters in `.env.example` comments with ASCII — they are the documented dotenv-cli breakage, and prod boot depends on dotenv-cli (R13).

## Why

R3 is the highest-likelihood critical pre-mortem risk: a regression on the publish→notify path can merge green because it merely compiles. R12/R13 are one-line time bombs (stale prod emails; broken env parsing on a fresh environment) that cost nothing to defuse now.

## Acceptance Criteria

- [ ] `.github/workflows/build.yml` contains a `test` job (or step) running `pnpm turbo run test` on the same triggers as build (PR + push on develop/main), with the placeholder `DATABASE_URL` pattern already used by the build job; a failing test makes the workflow red.
- [ ] `.github/workflows/trigger-deploy.yml` `paths:` includes `apps/api/src/modules/mail/**` (templates + `mail-i18n` are imported by `src/trigger/tasks/send-email.ts:4-14`).
- [ ] `.env.example` contains no non-ASCII characters: `grep -P '[^\x00-\x7F]' .env.example` returns nothing; structure/comments preserved.

## Files to Change

- `.github/workflows/build.yml` — add test job/step
- `.github/workflows/trigger-deploy.yml` — extend `paths:` filter
- `.env.example` — ASCII-only comment separators

## Test Plan

- Local dry-run of the exact CI command: `DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' pnpm turbo run test` must exit 0 (this validates the job will be green on the current codebase before it becomes blocking).
- `grep -P '[^\x00-\x7F]' .env.example` → empty; `npx dotenv -e .env.example -- node -e "process.exit(0)"` parses without error.
- YAML sanity: workflows parse (push to feature branch, observe Actions run).

## Result

- `.github/workflows/build.yml` — "Run tests (turbo)" step added after build, same triggers, placeholder `DATABASE_URL`; job id `build` kept intact (branch protection).
- `.github/workflows/trigger-deploy.yml` — `apps/api/src/modules/mail/**` added to `paths:`.
- `.env.example` — 222 non-ASCII characters removed (U+2500 separators, arrows); `dotenv -e .env.example` parses cleanly.
- **Scope addition (baseline repair):** the new CI gate exposed 2 pre-existing stale web tests, fixed so the gate ships green: `landing-page.spec.tsx` (footer pricing href is `/#pricing` since the section moved onto the landing page) and `employee-form.spec.tsx` (email label gained a required `*`, exact `getByText` → regex). 5 files total.
- Full suite green in CI conditions (placeholder `DATABASE_URL`): API 838, web 724, validators 767 — turbo 8/8 tasks.
