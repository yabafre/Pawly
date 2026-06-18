---
generated_by: aped-grill
generated_at: 2026-06-17T15:50:00+02:00
question_count: 11
decided_count: 11
deferred_count: 5
out_of_scope_count: 2
stop_reason: no-new-question
---

# Grill summary — First-run guided TOUR onboarding (both roles), Pawly

Scope: an anchored, interactive product walkthrough at first login that orients users
("where am I, what to do first, how my space works"). Distinct from — and layered on top of —
the existing admin setup wizard (work days / hours / shift types, gated by `Clinic.onboardingCompleted`).
Applies to EMPLOYEE (mobile PWA `/dashboard`) and ADMIN (desktop `/admin`).

## Decided

- **One shared tour mechanism for both roles** — not two separate engines (Q1).
- **Anchored interactive tour** (spotlight on real on-screen elements with next/skip), via a single responsive library (driver.js as default candidate) (Q2).
- **Completion tracked per-user in DB** (e.g. `User.tourCompletedAt`), not `localStorage` — one nullable timestamp suffices since each user has exactly one role (Q3).
- **Admin tour is action-oriented** (guide toward first real tasks: add first employee → generate first schedule). **Employee tour is descriptive** ("here's your schedule", "swipe to confirm presence") (Q4).
- **Skippable anytime, never blocking, replayable on demand** from a help/avatar menu ("Revoir le guide"). Reaching the end OR clicking "Passer" writes the completion flag (Q5).
- **Employee tour fires on first login regardless** of whether a schedule is published; anchored to STABLE layout elements (timeline container, nav, confirm zone), conceptual wording that tolerates an empty timeline (Q6).
- **Admin tour is a multi-page walkthrough** that follows the admin across routes (dashboard → employees → planning) — requires a controller that persists progress across navigation and re-anchors after each route loads (Q7).
- **Resume at the exact step** after interruption → persist a **per-user step pointer**, not just the boolean. Only reaching the end OR explicit "Passer" marks complete; accidental interruption (close/refresh/navigate-away) does NOT complete → re-fires next login as a safety net (Q8).
- **Build a generic, reusable tour engine** (registry of named tours = `tour key + ordered steps`). **Ship exactly 2 tours in v1** (employee + admin) (Q9).
- **Missing anchor handling: brief polling then graceful skip** to the next valid step; end gracefully if none remain; never hard-fail or block the UI (Q10).
- **Migration backfill split by role**: existing ADMINS backfilled as "completed" (don't nag productive admins with a multi-page tour); existing EMPLOYEES left NULL → they see the descriptive tour once (they never had any onboarding) (Q11).

## Deferred (still need a real answer — mostly architecture/UX)

- **Tour library choice** (driver.js vs react-joyride vs shepherd vs custom) given multi-page + resumable + role-shared requirements (Q2/Q7/Q8) — recommended next: `aped-arch`.
- **Exact persistence shape** on `User` (`tourCompletedAt DateTime?` + a step pointer — scalar `tourStep Int?` vs `tourState Json?` carrying tour key + index) (Q3/Q8) — recommended next: `aped-arch` / `aped-story`.
- **Cross-route resume orchestration pattern** — how the controller persists in-progress step and re-anchors after App Router navigation/refresh (Q7/Q8) — recommended next: `aped-arch`.
- **Polling timeout values** for missing-anchor handling (Q10) — recommended next: `aped-arch`.
- **Step content & count per role, tour copy (FR/EN), placement of the "Revoir le guide" entry** (Q4/Q5/Q6) — recommended next: `aped-ux` / `aped-story`.

## Out of scope (pinned for later)

- Feature-announcement / "what's new" tours that reuse the engine (Q9).
- Admin-authored / editable tours (Q9).

## Assumptions in play

- **Each user has exactly one role** (ADMIN or EMPLOYEE) — so a single per-user flag + step pointer is sufficient (drove Q3). From the explored auth model.
- **Employee app is mobile-first PWA; admin is desktop-first** — this drove the Q1/Q6 framing even though Alex chose a single unified mechanism. From PRD product scope.
- **The existing admin setup wizard stays unchanged**; the tour is a layer on top, firing after the wizard on first admin landing (`/admin/dashboard`). From PRD FR18 + story 10-3.
- **Employee first login usually coincides with a published schedule** (magic link sent on publish, PRD journey "Declarative Trust"), but the tour must tolerate an empty timeline (Q6).
- **Stack: Next.js App Router + tRPC + Prisma (Neon) + shadcn/ui + "Warm Linen" + i18n FR/EN** — any new copy must be bilingual.

## Suggested next skill

- **`aped-arch`** — the grilling converged on a stateful, generic tour engine. Before story/dev, the technical decisions still open (library choice, per-user persistence + step-pointer shape, cross-route resume orchestration, missing-anchor robustness) warrant a focused design pass. From there → `aped-story` → `aped-dev`.
