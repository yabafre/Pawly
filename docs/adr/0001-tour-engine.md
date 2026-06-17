# ADR-0001: First-run guided tour engine (driver.js + custom cross-route controller)

**Date:** 2026-06-17
**Status:** accepted
**Decided by:** Alex (facilitated by aped-arch)

## Context

Pawly has no first-run orientation on first login. Admins get a *setup* wizard (work days / hours / shift types, gated by `Clinic.onboardingCompleted`) but no orientation of their workspace; employees get nothing (brutal redirect to `/dashboard`). We want an anchored, interactive **guided tour** at first login for both roles — "where am I, what to do first, how my space works". Full spec is locked in `docs/grill-summary.md` (11 decisions). Relates to PRD FR18 (onboarding) and the "ending the blank page" activation value prop.

## Decision

Build a **generic, stateful tour engine** in the web app:

- **Renderer:** `driver.js` (MIT, zero-dependency, lightest, imperative API), wrapped in a client-only React controller.
- **Orchestration (custom code, library-agnostic):** a tour registry, per-user persisted progress, cross-route resume, debounced progress save, missing-anchor polling + graceful skip.
- **Persistence:** two new nullable fields on Prisma `User` — `tourCompletedAt DateTime?` and `tourState Json?` (`{ tourKey, step, updatedAt }`).
- v1 ships **exactly two tours**: `employee-onboarding` (single-page, descriptive) and `admin-onboarding` (multi-page, action-oriented).

## Why

- The hard requirements (multi-page across App Router, resume-at-exact-step, graceful skip, generic registry) are custom code **regardless of library** — so the library only needs to render one step's spotlight + popover and be programmatically controllable. driver.js is the lightest such renderer (critical for the employee **mobile PWA** — NFR21 Lighthouse ≥ 90, NFR1 < 100ms perceived latency) with an imperative API that fits a custom controller cleanly.
- MIT-licensed → commercial-safe (unlike intro.js, dual AGPL/commercial).
- `tourState Json?` mirrors the existing `Clinic.onboardingDraft Json?` precedent (story 10-3) → convention-consistent and forward-compatible with the generic engine.

## Considered options (renderer)

- **driver.js — chosen.** Lightest (~5 KB), MIT, zero-dep, imperative control fits the custom orchestration.
- **shepherd.js — runner-up / pre-vetted fallback.** MIT now (ex-AGPL), explicit `Tour` object is great for cross-route, but ~25 KB gz (~5× heavier). Swap-in path: same controller, different renderer, if driver.js spotlight/theming proves limiting.
- **react-joyride V3 — rejected.** React 19 OK since Mar 2026, but its declarative `run` / `stepIndex` model fights arbitrary cross-route resume/skip; heavier.
- **Custom (Radix Popover + floating-ui + SVG mask) — rejected for v1.** Best "Warm Linen" fit but reinvents spotlight/positioning/a11y. Revisit only if driver.js theming is insufficient.

## Design (authoritative for aped-story / aped-dev)

### Data model — Prisma `User` (`apps/api/prisma/schema/User.prisma`)

- `tourCompletedAt DateTime?` — null = tour not completed for this user's role. Set on **finish OR explicit skip**. Backfilled `now()` for existing **ADMIN** users (migration); left null for **EMPLOYEE** and all new users.
- `tourState Json?` — `{ tourKey: string, step: number, updatedAt: string } | null`. In-progress resume point; cleared on completion. Accidental interruption (close/refresh/navigate-away) leaves it set → resume next login.

### Tour registry (web, e.g. `apps/web/src/lib/tours/registry.ts`)

- `tours: Record<TourKey, TourDef>`, `TourDef = { role: 'ADMIN' | 'EMPLOYEE', steps: TourStep[] }`.
- `TourStep = { id: string; route: string; selector: string; titleKey: string; bodyKey: string; placement?: Side; optional?: boolean }`.
- Copy via **next-intl** keys (FR/EN), namespace `tour.*`. No hardcoded strings.
- v1: `employee-onboarding` (role EMPLOYEE, single `route: /dashboard`, stable selectors) · `admin-onboarding` (role ADMIN, steps across `/admin/dashboard` → `/admin/employees` → `/admin/planning`).

### Runtime (web)

- `TourProvider` (client) mounted inside the authenticated layouts (`admin/layout.tsx`, `dashboard/layout.tsx`). Runtime state (active tourKey, current step, isRunning) in **Zustand** (UI state, per architecture).
- On mount: read state via Zsa hook → server action → tRPC `tour.getState`. If `tourCompletedAt` is null and a registry tour matches `user.role` → start at `tourState?.step ?? 0`.
- driver.js instance created client-side (`'use client'`, guard `window`); driven by the provider per current step.

### Cross-route orchestration

- Each step carries `{ route, selector }`. Advancing to a step on a different `route`: persist progress, `router.push(route)`; the destination layout's `TourProvider` re-reads `tourState` and resumes.
- Re-anchor via `useTourAnchor(selector)`: poll `document.querySelector(selector)` on a short interval up to a timeout. Found → `driver.highlight(...)`. Timeout → **graceful skip** to the next step whose anchor resolves; if none remain → end (mark complete only if it was the last step). **Never hard-fail / block the UI.**

### Persistence flow (respects mandated Zsa → Server Action → tRPC → NestJS)

- `tour.saveProgress({ tourKey, step })` — **debounced ~1s** (mirror `saveOnboardingDraft`), writes `tourState`.
- `tour.complete({ tourKey })` — sets `tourCompletedAt = now()`, clears `tourState`. Called on last-step finish OR explicit "Passer".
- `tour.getState()` — returns `{ tourCompletedAt, tourState }` for the current user.
- New tRPC router `tour.router.ts` (`apps/api/src/trpc/`), inputs validated via `@pawly/validators` (new `tour` schemas), naming `{resource}.{action}`.

### Replay

- A persistent "Revoir le guide" entry (help / avatar menu) resets runtime and starts the role's tour from step 0. Replay is **ephemeral** — it does NOT clear `tourCompletedAt`.

### Migration (split-by-role backfill)

- Prisma migration adds the two fields, then a data step: `UPDATE "User" SET "tourCompletedAt" = now() WHERE "role" = 'ADMIN';`. EMPLOYEE rows and all future users default to null.

## Consequences

- New runtime dependency `driver.js` in `apps/web`.
- Tours couple to DOM selectors → fragile to markup refactors. **Mitigation:** anchor on stable `data-tour="..."` attributes (add them to target elements) rather than CSS classes.
- `tourState` Json is unvalidated at the DB layer → validate its shape with Zod on read/write.
- The multi-page admin tour triggers navigation side-effects mid-tour; ensure route guards (`onboardingCompleted`, subscription) don't fight tour navigation.
- **Watch item (W):** driver.js theming to "Warm Linen". If insufficient → shepherd.js is the pre-vetted fallback (same controller, swap renderer).
