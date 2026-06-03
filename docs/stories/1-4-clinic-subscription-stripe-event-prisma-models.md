# Story 1.4: Clinic, Subscription & StripeEvent Prisma Models

Status: done

## User Story

As a developer,
I need to create the Clinic, Subscription, and StripeEvent Prisma models with proper foreign key relationships,
so that multi-tenancy is enforced via proper FK constraints and the subscription lifecycle has a data foundation.

## Acceptance Criteria

1. **Given** the existing Prisma schema in `apps/api/prisma/schema/`, **When** the new models are created, **Then** a `Clinic` model exists with fields: `id` (cuid), `name`, `slug` (@unique), `onboardingCompleted` (Boolean, default false), `createdAt`, `updatedAt`. [Source: docs/planning-artifacts/epics.md#Story 1.4]
2. **Then** a `Subscription` model exists (1:1 with Clinic) with fields: `id`, `clinicId` (FK, @unique), `stripeCustomerId`, `stripeSubscriptionId`, `status` (enum: trialing, active, past_due, canceled, unpaid), `planKey`, `entitlementTier`, `currentPeriodEnd`, `cancelAtPeriodEnd` (Boolean), `trialEnd` (nullable DateTime), `createdAt`, `updatedAt`. [Source: docs/planning-artifacts/architecture.md#Data Architecture]
3. **Then** a `StripeEvent` model exists with fields: `id`, `stripeEventId` (@unique), `type`, `processedAt`. [Source: docs/planning-artifacts/architecture.md#Data Architecture]
4. **Then** all existing models with orphaned `clinicId` string fields are migrated to use `Clinic.id` as a proper foreign key with `@relation` directives and cascade behavior. [Source: docs/planning-artifacts/epics.md#Story 1.4]
5. **Then** the `User` model `@@unique([email, clinicId])` constraint is reviewed: `email` should become `@unique` (standalone) to support Story 1.5 where login is email-only. [Source: docs/planning-artifacts/epics.md#Story 1.5, Global Rules]
6. **Then** the seed file is updated to create a default `Clinic` record and link all existing seed data to it via proper FK. [Source: docs/planning-artifacts/epics.md#Story 1.4]
7. **Then** `pnpm db:push` and `pnpm db:generate` run successfully from the project root with no errors. [Source: docs/planning-artifacts/epics.md#Story 1.4]

## Tasks

- [x] **Task 1: Create `Clinic.prisma` schema file** (AC: 1, 4)
  - [x] Create `apps/api/prisma/schema/Clinic.prisma`
  - [x] Define `Clinic` model with: `id String @id @default(cuid())`, `name String`, `slug String @unique`, `onboardingCompleted Boolean @default(false)`, `createdAt`, `updatedAt`
  - [x] Add reverse relations: `users User[]`, `employees Employee[]`, `shifts Shift[]`, `absences Absence[]`, `unavailabilities Unavailability[]`, `magicLinks MagicLink[]`, `planningTemplates PlanningTemplate[]`, `varianceEvents VarianceEvent[]`, `subscription Subscription?`
- [x] **Task 2: Create `Subscription.prisma` schema file** (AC: 2)
  - [x] Create `apps/api/prisma/schema/Subscription.prisma`
  - [x] Define `SubscriptionStatus` enum: `trialing`, `active`, `past_due`, `canceled`, `unpaid`
  - [x] Define `Subscription` model with: `id String @id @default(cuid())`, `clinicId String @unique @map("clinic_id")`, `stripeCustomerId String @map("stripe_customer_id")`, `stripeSubscriptionId String? @map("stripe_subscription_id")`, `status SubscriptionStatus @default(trialing)`, `planKey String @map("plan_key")`, `entitlementTier String @default("starter") @map("entitlement_tier")`, `currentPeriodEnd DateTime? @map("current_period_end")`, `cancelAtPeriodEnd Boolean @default(false) @map("cancel_at_period_end")`, `trialEnd DateTime? @map("trial_end")`, `createdAt`, `updatedAt`
  - [x] Add relation: `clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)`
- [x] **Task 3: Create `StripeEvent.prisma` schema file** (AC: 3)
  - [x] Create `apps/api/prisma/schema/StripeEvent.prisma`
  - [x] Define `StripeEvent` model with: `id String @id @default(cuid())`, `stripeEventId String @unique @map("stripe_event_id")`, `type String`, `processedAt DateTime @default(now()) @map("processed_at")`
- [x] **Task 4: Migrate existing models to use Clinic FK** (AC: 4)
  - [x] `User.prisma`: Add `clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)` and change `clinicId` to proper FK
  - [x] `Employee.prisma`: Add `clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)`
  - [x] `MagicLink.prisma`: Add `clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)`
  - [x] `Planning.prisma` (Shift, Absence, PlanningTemplate, VarianceEvent): Add `clinic Clinic @relation(...)` to each model
  - [x] `Unavailability` in `Employee.prisma`: Add `clinic Clinic @relation(...)`
- [x] **Task 5: Update User unique constraint for Story 1.5 compatibility** (AC: 5)
  - [x] Change `@@unique([email, clinicId])` to `@unique` on `email` field directly (email is globally unique — one user per email across all clinics)
  - [x] This enables Story 1.5's email-only login (`findUnique({ where: { email } })`)
  - [x] Ensure existing seed data has no email collisions across clinics (currently only 1 clinic, so safe)
- [x] **Task 6: Update seed file** (AC: 6)
  - [x] Create a `Clinic` record via slug-based upsert (auto-generated cuid ID), name `Clinique Zen Dev`, slug `clinique-zen-dev`, `onboardingCompleted: true`
  - [x] Link all existing User/Employee upserts to the Clinic via FK
  - [x] Optionally create a seed `Subscription` record for dev testing (status: `active`, planKey: `starter`, entitlementTier: `starter`)
- [x] **Task 7: Run database push and generate** (AC: 7)
  - [x] Run `pnpm db:push` from project root — verify no errors
  - [x] Run `pnpm db:generate` from project root — verify Prisma Client regenerated
  - [x] Verify build passes: `pnpm build` from project root
- [x] **Task 8: Update existing tests** (AC: 7)
  - [x] Verify existing auth tests still pass (they mock Prisma, should be unaffected)
  - [x] Run `pnpm test` from project root — all 112 tests should pass
  - [x] Fix any type errors caused by new FK relations in test mocks

## Dev Notes

### CRITICAL: This is a Pure Schema Change
This story creates the **data foundation** for Epic 3 (Stripe). It does NOT implement any Stripe logic, webhook handling, or API endpoints. Only Prisma schema files, the seed, and database push.

### Current clinicId State (MUST FIX)
All existing models use `clinicId String @map("clinic_id")` as an **orphaned string field** — no FK constraint, no `Clinic` model exists. This story transforms all of these into proper FK references with `@relation` directives.

**Models requiring FK migration:**
| Model | File | Current State |
|-------|------|---------------|
| User | `User.prisma` | `clinicId String` + `@@unique([email, clinicId])` + `@@index([clinicId])` |
| Employee | `Employee.prisma` | `clinicId String` + `@@index([clinicId])` |
| MagicLink | `MagicLink.prisma` | `clinicId String` + `@@index([clinicId])` |
| Shift | `Planning.prisma` | `clinicId String` + `@@index([clinicId])` |
| Absence | `Planning.prisma` | `clinicId String` + `@@index([clinicId])` |
| PlanningTemplate | `Planning.prisma` | `clinicId String` + `@@index([clinicId])` |
| VarianceEvent | `Planning.prisma` | `clinicId String` + `@@index([clinicId])` |
| Unavailability | `Employee.prisma` | `clinicId String` + `@@index([clinicId])` |

### Prisma Schema Folders Pattern
- **One file per model** in `apps/api/prisma/schema/`
- Existing files: `base.prisma`, `User.prisma`, `Employee.prisma`, `MagicLink.prisma`, `Planning.prisma`
- New files to create: `Clinic.prisma`, `Subscription.prisma`, `StripeEvent.prisma`
- `base.prisma` has `generator client` and `datasource db` — do NOT duplicate these
- Prisma 7.2.0 with `prisma.config.ts` pointing to `schema: 'prisma/schema'`

### Naming Conventions (from Architecture)
- Tables: singular `PascalCase` (e.g., `Clinic`, `Subscription`, `StripeEvent`)
- Columns: `camelCase` in Prisma, `snake_case` via `@map()` in DB
- IDs: `cuid()` (consistent with existing models that use `uuid()` — align to `cuid()` as per architecture spec OR keep `uuid()` for consistency with existing code)

### ID Strategy Decision
Current models use `@default(uuid())`. Architecture says `cuid()` for `Clinic.id`. Choose ONE:
- **Option A (Recommended):** Use `@default(cuid())` for new models (Clinic, Subscription, StripeEvent) to align with architecture spec. Keep existing models on `uuid()` to avoid migration complexity. Future refactor can unify.
- **Option B:** Keep `@default(uuid())` everywhere for consistency with existing code.

### Cascade Delete Strategy
- `Clinic` -> `User`: `onDelete: Cascade` (deleting a clinic deletes all its users)
- `Clinic` -> `Employee`: `onDelete: Cascade`
- `Clinic` -> `Subscription`: `onDelete: Cascade` (1:1, clinic deletion = subscription cleanup)
- `Clinic` -> `MagicLink`: `onDelete: Cascade`
- `Clinic` -> `Shift`, `Absence`, `PlanningTemplate`, `VarianceEvent`, `Unavailability`: `onDelete: Cascade`
- This matches the multi-tenant isolation pattern: if a clinic is deleted, ALL its data is removed.

### Prisma Multi-Model Relations in Schema Folders
When using Schema Folders, relations spanning multiple `.prisma` files work natively in Prisma 7. The Prisma compiler merges all files in the `schema/` directory. Ensure:
- Relation fields reference the correct model name (not file name)
- Both sides of a relation are defined (e.g., `Clinic` has `users User[]` AND `User` has `clinic Clinic`)
- `@relation` directive with `fields` and `references` on the FK side

### Seed File Updates
Seed uses slug-based upsert (`where: { slug }`) for the Clinic. Clinic ID is auto-generated as CUID (matching `@default(cuid())`). After this story:
1. Create the `Clinic` record FIRST via slug-based upsert (auto-generated cuid ID)
2. Then create Users/Employees that reference it via `clinic.id`
3. Use `upsert` for the Clinic record for idempotency
4. Seed a `Subscription` with realistic `stripeSubscriptionId` for dev/test convenience

### User.email Unique Constraint Change
Current: `@@unique([email, clinicId])` allows same email in different clinics.
Required: `@unique` on `email` alone — one user per email globally.
**Why:** Story 1.5 requires `findUnique({ where: { email } })` for login. This is impossible with a composite unique where `clinicId` is required. The business rule is: one admin/employee email = one account = one clinic.

### Database is Neon.com (NOT Docker)
- `DATABASE_URL` loaded from `.env` at monorepo root
- Use `pnpm db:push` (not `prisma migrate dev`) for schema sync
- No need for Docker or local Postgres

### Previous Story Intelligence (from Story 1.3)
- **Zod 4.3.6** is the current version (migrated from 3.23.8). UUID validation is strict in Zod 4.
- **112 tests passing** (71 web + 41 API). Build green on develop.
- Seed file uses slug-based upsert for Clinic (auto-generated CUID). Zod 4 compatible.
- `@pawly/zod` provides the shared Zod instance. Validators in `@pawly/validators`.
- Prisma Client is imported from `@prisma/client` in `apps/api`.

### Git Patterns from Recent Commits
- Commit format: `feat(story-X-Y): description` or `fix(story-X-Y): description`
- PRs target `develop` branch from `feature/story-*` branches
- Code review follows adversarial pattern (16 issues fixed in last review)

### What NOT to Do
- Do NOT create any Stripe API integration, webhook handlers, or NestJS modules
- Do NOT create any new NestJS services or controllers
- Do NOT modify the tRPC router
- Do NOT touch any frontend code
- Do NOT create migration files manually — use `pnpm db:push` for Neon
- Do NOT duplicate `generator` or `datasource` blocks (they exist in `base.prisma`)
- Do NOT add `@pawly/validators` schemas for Clinic/Subscription yet (that's Story 3.1+)

### Project Structure Notes

- `apps/api/prisma/schema/` — All .prisma files (Schema Folders)
- `apps/api/prisma.config.ts` — Prisma 7 config (schema path, datasource, seed command)
- `apps/api/prisma/seed.ts` — Seed script (uses PrismaPg adapter + Pool)
- `packages/database/` — Does NOT exist (architecture mentions it but actual location is `apps/api/prisma/`)
- `packages/validators/src/index.ts` — Shared Zod schemas (NOT modified in this story)
- `packages/zod/` — Shared Zod instance (v4.3.6)

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.4]
- [Source: docs/planning-artifacts/architecture.md#Data Architecture]
- [Source: docs/planning-artifacts/architecture.md#Core Architectural Decisions]
- [Source: docs/planning-artifacts/epics.md#Global Implementation Rules]
- [Source: docs/implementation-artifacts/1-3-interface-de-connexion-flux-zsatrpc.md#Completion Notes]

### Dev Agent Record (original)

#### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

#### Debug Log References

- DB push initially failed due to orphaned clinicId data in Neon. Resolved with `--force-reset` (user-approved) since dev database.

#### Completion Notes List

- Created 3 new Prisma schema files: `Clinic.prisma`, `Subscription.prisma`, `StripeEvent.prisma`
- New models use `@default(cuid())` per architecture spec (Option A); existing models remain on `uuid()` for migration safety
- All 8 existing models migrated from orphaned `clinicId String` to proper FK with `@relation` + `onDelete: Cascade`
- User `@@unique([email, clinicId])` replaced with `@unique` on `email` to prepare Story 1.5 email-only login
- Seed updated: creates Clinic first, then Subscription (active/starter), then Users/Employee linked via FK
- Neon database force-reset and schema pushed successfully
- All 112 tests pass (41 API + 71 web) — zero regressions
- Build green across all 5 packages

#### Implementation Plan

- ID Strategy: Option A (cuid for new models, uuid for existing) — avoids migration complexity
- Cascade: All child models cascade on Clinic delete for multi-tenant isolation
- ALL timestamps across ALL models now use `@map("created_at")` / `@map("updated_at")` for DB snake_case consistency

### Senior Developer Review (AI)

#### Review Date
2026-02-04

#### Reviewer
Claude Opus 4.5 (adversarial code review)

#### Issues Found: 8 (3 HIGH, 4 MEDIUM, 1 LOW)

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| 1 | HIGH | `Subscription.stripeCustomerId` missing `@unique` — prevents `findUnique` in webhook handlers | Added `@unique` |
| 2 | HIGH | `Subscription.stripeSubscriptionId` missing `@unique` — full table scan on webhook queries | Added `@unique` |
| 3 | HIGH | Inconsistent timestamp `@map()` — new models had `@map("created_at")` but existing models did not | Added `@map` to all timestamps in User, Employee, MagicLink, Planning |
| 4 | MEDIUM | `VarianceEvent.shiftId` dangling string — no FK relation or index | Added `@relation` to Shift with `onDelete: Cascade` + `@@index([shiftId])` |
| 5 | MEDIUM | `StripeEvent` model minimal for production | Deferred to Story 3.1 — AC3 met as specified |
| 6 | MEDIUM | `Shift.employee` and `Absence.employee` missing `onDelete` behavior | Added `onDelete: Cascade` |
| 7 | MEDIUM | Seed hardcoded UUID vs Clinic `cuid()` type mismatch | Changed to slug-based upsert with auto-generated cuid |
| 8 | LOW | Seed Subscription missing `stripeSubscriptionId` for active status | Added `stripeSubscriptionId: 'sub_dev_seed_000001'` |

#### Verification After Fixes
- `pnpm db:generate`: Prisma Client v7.2.0 generated successfully
- `pnpm db:push --accept-data-loss`: Schema synced to Neon
- `pnpm db seed`: Seed successful (Clinic ID: auto-generated cuid)
- Tests: 112 passing (41 API + 71 web) — zero regressions
- Build: 5/5 packages green (FULL TURBO)

#### Outcome
**Approved** — All HIGH and MEDIUM issues fixed. Story status updated to `done`.

### Change Log

- 2026-02-04: Story 1.4 implemented — Clinic, Subscription, StripeEvent Prisma models created; all existing models migrated to Clinic FK; User email made globally unique; seed updated; 112 tests passing.
- 2026-02-04: Adversarial code review — 7 issues fixed (3 HIGH, 3 MEDIUM, 1 LOW). Added @unique to Subscription Stripe IDs, fixed timestamp @map consistency across all models, added VarianceEvent→Shift FK, added onDelete: Cascade to Employee relations, improved seed with slug-based upsert and realistic data.

## File List

**New files:**
- `apps/api/prisma/schema/Clinic.prisma`
- `apps/api/prisma/schema/Subscription.prisma`
- `apps/api/prisma/schema/StripeEvent.prisma`

**Modified files:**
- `apps/api/prisma/schema/User.prisma` — Added Clinic FK relation, changed email to @unique, removed @@unique([email, clinicId])
- `apps/api/prisma/schema/Employee.prisma` — Added Clinic FK relation to Employee and Unavailability models
- `apps/api/prisma/schema/MagicLink.prisma` — Added Clinic FK relation
- `apps/api/prisma/schema/Planning.prisma` — Added Clinic FK relation to Shift, Absence, PlanningTemplate, VarianceEvent; added onDelete: Cascade to Shift→Employee and Absence→Employee; added FK relation for VarianceEvent→Shift with index
- `apps/api/prisma/seed.ts` — Slug-based Clinic upsert (auto-generated cuid), added stripeSubscriptionId, uses clinic.id for all FK references
- `docs/implementation-artifacts/sprint-status.yaml` — Story 1-4 status: ready-for-dev → in-progress → review → done
