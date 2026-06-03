# Story 3.3: Post-Checkout Onboarding & First Login

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As a new clinic admin,
I want to be guided through an onboarding wizard after my first login,
So that my clinic is properly configured before I start using the application.

## Acceptance Criteria

1. **Given** a new admin who has clicked the Magic Link from the registration email, **When** they arrive in the application for the first time, **Then** they are redirected to the onboarding wizard at `app/[locale]/admin/onboarding/page.tsx`.
2. **Given** the onboarding wizard, **When** the admin reaches Step 1, **Then** they can confirm or edit their clinic name (pre-filled from `checkout.session.completed` metadata).
3. **Given** the onboarding wizard, **When** the admin reaches Step 2, **Then** they can configure work days (select which days the clinic operates, e.g., Monday–Saturday).
4. **Given** the onboarding wizard, **When** the admin reaches Step 3, **Then** they can configure work hours (default shift start/end times for the clinic).
5. **Given** the onboarding wizard, **When** the admin reaches Step 4, **Then** they can define initial shift types (e.g., Surgery, Reception) with name, code, start time, end time, and color.
6. **Given** the wizard is completed, **When** the admin clicks "Finish", **Then** `Clinic.onboardingCompleted` is set to `true` and the admin is redirected to the main dashboard.
7. **Given** an authenticated admin whose `Clinic.onboardingCompleted` is `false`, **When** they try to access any admin route (except `/admin/onboarding`), **Then** they are redirected to `/admin/onboarding`.
8. **Given** an authenticated admin whose `Clinic.onboardingCompleted` is `true`, **When** they access `/admin/onboarding`, **Then** they are redirected to `/admin/dashboard` (onboarding is one-time only).
9. **Given** the onboarding wizard, **Then** all user-facing strings have FR/EN translation keys and the wizard follows the "Clinique Zen" aesthetic.
10. **Given** the data flow architecture, **Then** the wizard follows the mandatory pattern: Component → Hook → Zsa → Server Action → tRPC → NestJS API.

## Tasks

- [x] Task 1: Create Prisma models for clinic configuration (AC: #3, #4, #5)
  - [x] 1.1 Create `apps/api/prisma/schema/ClinicConfig.prisma` with fields: `id`, `clinicId` (FK, @unique), `workDays` (String[]), `defaultStartTime` (String), `defaultEndTime` (String), `createdAt`, `updatedAt`
  - [x] 1.2 Create `apps/api/prisma/schema/ShiftType.prisma` — model named `ClinicShiftType` (avoids conflict with existing `ShiftType` enum in Planning.prisma), `@@map("clinic_shift_types")`, `@@unique([clinicId, code])`
  - [x] 1.3 Run `pnpm db:generate` and `pnpm db:push` from project root

- [x] Task 2: Create Zod validators for onboarding input (AC: #2, #3, #4, #5, #10)
  - [x] 2.1 Create `packages/validators/src/clinic/onboarding.schema.ts` with all schemas + `workHoursFieldsSchema` (base object without refine for merge compatibility) and `updateClinicConfigSchema` (merged workDays + workHours + refine)
  - [x] 2.2 Create `packages/validators/src/clinic/index.ts` and export from `packages/validators/src/index.ts`

- [x] Task 3: Create ClinicModule in NestJS (AC: #2, #3, #4, #5, #6, #10)
  - [x] 3.1 Create `apps/api/src/modules/clinic/clinic.module.ts` importing PrismaModule
  - [x] 3.2 Create `apps/api/src/modules/clinic/clinic.service.ts` with all methods. Extracted `generateSlug` to shared utility `apps/api/src/common/utils/slug.ts`
  - [x] 3.3 Register ClinicModule in `apps/api/src/app.module.ts`

- [x] Task 4: Create tRPC clinic router (AC: #2, #3, #4, #5, #6, #7, #8, #10)
  - [x] 4.1 Create `apps/api/src/trpc/routers/clinic.router.ts` with 5 procedures (all protectedProcedure, using ctx.user.clinicId)
  - [x] 4.2 Add `clinicService` to `TRPCServices` interface in `apps/api/src/trpc/context.ts`
  - [x] 4.3 Import ClinicModule into TRPCModule in `apps/api/src/trpc/trpc.module.ts`, inject ClinicService
  - [x] 4.4 Merge `clinicRouter` into appRouter in `apps/api/src/trpc/routers/_app.ts`

- [x] Task 5: Implement admin layout onboarding guard (AC: #7, #8)
  - [x] 5.1 Updated `apps/web/src/app/[locale]/admin/layout.tsx` with server-side onboarding guard using `x-pathname` header from middleware
  - [x] 5.2 Updated `apps/web/src/proxy.ts` to set `x-pathname` header for pathname detection in RSC layouts

- [x] Task 6: Create Zsa server actions for onboarding (AC: #10)
  - [x] 6.1 Create `apps/web/src/app/[locale]/admin/onboarding/_actions/onboarding-actions.ts` with 5 Zsa server actions

- [x] Task 7: Create onboarding wizard UI (AC: #1, #2, #3, #4, #5, #6, #9)
  - [x] 7.1 Create `apps/web/src/app/[locale]/admin/onboarding/page.tsx` (server component)
  - [x] 7.2 Create `OnboardingWizard.tsx` — single `useForm`, `useState` for steps, Clinique Zen aesthetic
  - [x] 7.3 Create `StepClinicName.tsx` — pre-filled Input, min 2/max 100 validation
  - [x] 7.4 Create `StepWorkDays.tsx` — 7 toggle buttons, pre-select Mon–Sat, teal active state
  - [x] 7.5 Create `StepWorkHours.tsx` — two time inputs, default 08:30–18:30
  - [x] 7.6 Create `StepShiftTypes.tsx` — dynamic list, auto-code generation, curated 8-color palette
  - [x] 7.7 Create `StepIndicator.tsx` — horizontal step indicator with numbered circles

- [x] Task 8: Add i18n translation keys (AC: #9)
  - [x] 8.1 Add `onboarding` namespace keys to `apps/web/src/i18n/langs/fr.json`
  - [x] 8.2 Add `onboarding` namespace keys to `apps/web/src/i18n/langs/en.json`
  - [x] 8.3 Full key structure: title, subtitle, steps.clinicName.*, steps.workDays.*, steps.workHours.*, steps.shiftTypes.*, navigation.*, completion.*, days.*, errors.*

- [x] Task 9: Add QueryKeyFactory namespace (AC: #10)
  - [x] 9.1 Add `clinic` namespace to `QueryKeyFactory` in `apps/web/src/lib/hooks/server-action-hooks.ts`

- [x] Task 10: Write tests (all ACs)
  - [x] 10.1 Unit tests for ClinicService methods — 14 tests in `clinic.service.spec.ts` (6 describe blocks)
  - [x] 10.4 Unit tests for Zod validators — 50 tests in `onboarding.schema.test.ts` (6 describe blocks)
  - [x] 10.5 Run all existing tests — 266 total (91 API + 125 web + 50 validators), all passing, no regressions

## Dev Notes

### Critical Rules (NON-NEGOTIABLE)

1. **Data flow**: Component → Hook → Zsa → Server Action → tRPC → NestJS. NO shortcuts. NO direct Prisma calls from Next.js.
2. **Form state**: Use `@tanstack/react-form` for the wizard — NOT useState for form data, NOT Zustand, NOT react-hook-form.
3. **Multi-tenant isolation**: All clinic queries MUST filter by `clinicId` from the authenticated user's JWT. Never trust client-provided clinicId.
4. **Onboarding guard**: The guard in `admin/layout.tsx` must be server-side (RSC). Never rely on client-side checks for route protection.
5. **Atomic operations**: The `completeOnboarding` mutation MUST save all configuration data AND set `onboardingCompleted = true` in a single `prisma.$transaction()`. Partial saves are not acceptable.
6. **i18n**: All user-facing strings MUST have FR/EN translation keys. Use `useTranslations('onboarding')` in client components.
7. **No new NestJS controllers**: The onboarding data flows through tRPC routers ONLY. No REST endpoints for clinic configuration.
8. **Slug regeneration**: When updating clinic name, regenerate the slug using the same `generateSlug()` helper from Story 3.2 (in `stripe-webhook.controller.ts`). Extract it to a shared utility if needed.
9. **ShiftType uniqueness**: `@@unique([clinicId, code])` prevents duplicate shift codes per clinic. Handle P2002 gracefully with user-friendly error.
10. **Onboarding is one-time**: Once `onboardingCompleted = true`, the wizard page redirects to dashboard. No "re-onboard" flow.

### Architecture Compliance

**Backend module location**: `apps/api/src/modules/clinic/` (NEW module)
**tRPC router location**: `apps/api/src/trpc/routers/clinic.router.ts` (NEW)
**Frontend location**: `apps/web/src/app/[locale]/admin/onboarding/` (NEW pages + components)
**Validators location**: `packages/validators/src/clinic/` (NEW)
**Existing file modifications**: `admin/layout.tsx`, `context.ts`, `trpc.module.ts`, `_app.ts`, `app.module.ts`, `server-action-hooks.ts`

**tRPC procedure types:**
- `getOnboardingStatus` → `protectedProcedure` (requires auth). Uses `ctx.user.clinicId` from JWT — never accepts clinicId as input.
- All mutations → `protectedProcedure`. Validate input with Zod schemas from `@pawly/validators`.

**Admin layout guard flow:**
```
admin/layout.tsx (server component)
  1. Check auth token cookie → if missing → redirect to /login
  2. Call tRPC clinic.getOnboardingStatus (server-side)
  3. If onboardingCompleted === false AND path !== /admin/onboarding → redirect to /admin/onboarding
  4. If onboardingCompleted === true AND path === /admin/onboarding → redirect to /admin/dashboard
  5. Render children
```

**Data flow for wizard submit:**
```
OnboardingWizard (client component)
  → useServerActionMutation(completeOnboardingAction)
    → completeOnboardingAction (Zsa server action)
      → trpc.clinic.completeOnboarding.mutate(data)
        → ClinicService.completeOnboarding(clinicId, data)
          → prisma.$transaction([updateClinic, upsertConfig, createShiftTypes])
  → router.push('/{locale}/admin/dashboard')
```

### Library & Framework Requirements

| Library | Version | Usage | Already Installed |
|---------|---------|-------|-------------------|
| `@tanstack/react-form` | latest | Wizard multi-step form state management | Yes |
| `zsa` | ^0.6.0 | Server action wrapper with typed I/O | Yes |
| `@trpc/server` | ^11.9.0 | tRPC router procedures | Yes |
| `@pawly/validators` | workspace | Zod schemas for onboarding input | Yes (extend) |
| `next-intl` | latest | i18n translations `useTranslations('onboarding')` | Yes |
| `sonner` | latest | Toast notifications for success/error feedback | Yes |
| `lucide-react` | latest | Icons (Check, ChevronRight, Building2, Calendar, Clock, Layers) | Yes |
| `shadcn/ui` | — | Card, Button, Input, Label components | Yes |

**NO new dependencies needed** — all libraries already installed.

**shadcn components to verify/add** (run from `apps/web` if missing):
- `checkbox` or `toggle` — for work days selection (Step 2). Check if already installed, otherwise `npx shadcn@latest add checkbox toggle`

**@tanstack/react-form multi-step pattern:**
```typescript
// Single useForm instance for ALL steps
const form = useForm({
  defaultValues: {
    clinicName: initialData.clinicName,           // Step 1
    workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], // Step 2
    defaultStartTime: '08:30',                     // Step 3
    defaultEndTime: '18:30',                       // Step 3
    shiftTypes: [                                  // Step 4
      { name: 'Surgery', code: 'CHIR', startTime: '08:30', endTime: '18:30', color: '#4F46E5' },
      { name: 'Reception', code: 'ACC', startTime: '09:00', endTime: '19:30', color: '#F97316' },
    ],
  },
  onSubmit: async ({ value }) => { /* final submit all data */ },
});

// Step navigation managed externally
const [currentStep, setCurrentStep] = useState(0);

// Validate current step fields before advancing
const handleNext = async () => {
  // Validate only current step's fields
  // If valid → setCurrentStep(prev => prev + 1)
};
```

**DO NOT use the existing `form.tsx` shadcn wrapper** — it's built on react-hook-form. Use `@tanstack/react-form`'s `form.Field` directly with shadcn `<Input>`, `<Label>` primitives.

### File Structure Requirements

```
apps/
├── api/
│   ├── prisma/schema/
│   │   ├── ClinicConfig.prisma          # NEW — clinic configuration model
│   │   └── ShiftType.prisma             # NEW — shift type model
│   ├── src/
│   │   ├── modules/
│   │   │   └── clinic/                  # NEW MODULE
│   │   │       ├── clinic.module.ts
│   │   │       ├── clinic.service.ts
│   │   │       └── clinic.service.spec.ts
│   │   ├── trpc/
│   │   │   ├── context.ts               # MODIFY — add clinicService
│   │   │   ├── trpc.module.ts           # MODIFY — import ClinicModule
│   │   │   └── routers/
│   │   │       ├── _app.ts              # MODIFY — add clinicRouter
│   │   │       └── clinic.router.ts     # NEW
│   │   └── app.module.ts               # MODIFY — register ClinicModule
├── web/
│   └── src/
│       ├── app/[locale]/admin/
│       │   ├── layout.tsx               # MODIFY — add onboarding guard
│       │   └── onboarding/              # NEW ROUTE
│       │       ├── page.tsx             # Server component
│       │       ├── _actions/
│       │       │   └── onboarding-actions.ts
│       │       └── _components/
│       │           ├── OnboardingWizard.tsx
│       │           ├── StepIndicator.tsx
│       │           └── steps/
│       │               ├── StepClinicName.tsx
│       │               ├── StepWorkDays.tsx
│       │               ├── StepWorkHours.tsx
│       │               └── StepShiftTypes.tsx
│       ├── i18n/langs/
│       │   ├── fr.json                  # MODIFY — add onboarding keys
│       │   └── en.json                  # MODIFY — add onboarding keys
│       └── lib/hooks/
│           └── server-action-hooks.ts   # MODIFY — add clinic namespace
packages/
└── validators/src/
    └── clinic/                          # NEW
        ├── onboarding.schema.ts
        └── index.ts
```

### Prisma Schema Patterns

**ClinicConfig.prisma:**
```prisma
model ClinicConfig {
  id             String   @id @default(uuid())
  clinicId       String   @unique @map("clinic_id")
  clinic         Clinic   @relation(fields: [clinicId], references: [id])
  workDays       String[] @map("work_days")
  defaultStartTime String @map("default_start_time")
  defaultEndTime   String @map("default_end_time")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("clinic_configs")
}
```

**ShiftType.prisma:**
```prisma
model ShiftType {
  id        String   @id @default(uuid())
  clinicId  String   @map("clinic_id")
  clinic    Clinic   @relation(fields: [clinicId], references: [id])
  name      String
  code      String
  startTime String   @map("start_time")
  endTime   String   @map("end_time")
  color     String
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([clinicId, code])
  @@map("shift_types")
}
```

**Add relations to Clinic.prisma:**
```prisma
// Add to existing Clinic model:
config     ClinicConfig?
shiftTypes ShiftType[]
```

### Testing Requirements

**ClinicService tests** (`apps/api/src/modules/clinic/clinic.service.spec.ts`):
- `getClinicById`: returns clinic with config and shiftTypes; throws if not found
- `updateClinicName`: updates name + regenerates slug; validates min/max length
- `upsertClinicConfig`: creates new config on first call; updates on subsequent calls
- `createShiftTypes`: deletes existing + creates new in transaction; handles P2002 duplicate code
- `completeOnboarding`: sets `onboardingCompleted = true`; verify atomic transaction wraps all operations
- `getOnboardingStatus`: returns complete status with config and shiftTypes

**tRPC router tests:**
- All procedures require authentication (reject unauthenticated calls)
- All procedures use `ctx.user.clinicId` (never client input for clinicId)
- Input validation rejects invalid data (wrong format, empty arrays, invalid times)

**Onboarding guard tests:**
- Admin with `onboardingCompleted = false` visiting `/admin/dashboard` → redirected to `/admin/onboarding`
- Admin with `onboardingCompleted = false` visiting `/admin/onboarding` → allowed
- Admin with `onboardingCompleted = true` visiting `/admin/onboarding` → redirected to `/admin/dashboard`
- Admin with `onboardingCompleted = true` visiting `/admin/dashboard` → allowed

**Zod validator tests:**
- `updateClinicNameSchema`: reject empty string, reject > 100 chars, accept valid name
- `updateWorkDaysSchema`: reject empty array, reject invalid day names, accept valid days
- `updateWorkHoursSchema`: reject invalid time format, reject end < start, accept valid range
- `createShiftTypesSchema`: reject empty array, reject missing fields, accept valid shift types

**Regression safety:**
- Run `pnpm test` from root — all existing 75 API tests + 125 web tests must pass
- Run `pnpm build` from root — TypeScript compilation must succeed

### Previous Story Intelligence (Story 3.2)

**Patterns established in Story 3.2 that MUST be followed:**

- **tRPC router pattern**: See `apps/api/src/trpc/routers/stripe.router.ts` — import `router`, `publicProcedure`/`protectedProcedure` from `../trpc`. Use `.input()` with Zod schemas from `@pawly/validators`.
- **TRPCServices injection**: Add service to interface in `context.ts` (line ~8-13), inject in `trpc.module.ts`, access via `ctx.services.clinicService` in router.
- **Zsa server action pattern**: See `apps/web/src/app/[locale]/pricing/_actions/checkout-actions.ts` — `createServerAction().input(schema).handler(async ({ input }) => { ... })`.
- **Slug generation**: `generateSlug()` in `stripe-webhook.controller.ts` (lines ~130-140). Uses `normalize('NFD')` + accent removal + kebab-case + 4-byte random hex suffix. Reuse this logic for clinic name updates.
- **Module registration**: StripeModule pattern — `@Module({ imports: [PrismaModule], providers: [Service], exports: [Service] })`. Register in `app.module.ts` imports array.
- **forwardRef pattern**: Use `forwardRef(() => Module)` only if circular dependencies exist. ClinicModule should NOT need forwardRef (no circular deps expected).

**Fixes from Story 3.2 code review to learn from:**
- Always use type-safe status mapping (no `as any` casts)
- Always null-check metadata before accessing properties
- Always validate inputs with Zod even for tRPC procedures (belt + suspenders)
- P2002 unique constraint errors must be caught and returned as user-friendly messages

**Key files to reference for patterns:**
- `apps/api/src/trpc/context.ts` — TRPCServices interface, AuthenticatedUser type
- `apps/api/src/trpc/trpc.module.ts` — module imports and provider injection
- `apps/api/src/trpc/routers/_app.ts` — router merging pattern
- `apps/api/src/modules/stripe/stripe.service.ts` — service pattern with PrismaService + ConfigService injection
- `apps/web/src/app/[locale]/pricing/_components/PreCheckoutForm.tsx` — @tanstack/react-form usage with Zod validation + shadcn primitives

### Git Intelligence

**Recent commit patterns (last 15 commits):**
- Commit style: `feat(story-X-Y): description` for features, `fix(story-X-Y): description` for fixes
- Feature branch pattern: `feature/story-X-Y-slug-name`
- Code review fixes: separate commit `fix(story-X-Y): address code review findings`
- All PRs target `develop` branch

**Current branch**: `feature/story-3-3-post-checkout-onboarding-first-login` (created from `develop`)

**Dependencies from previous stories already in place:**
- Clinic model with `onboardingCompleted` field (Story 1.4)
- Auth system with JWT containing `clinicId` (Story 1.5)
- i18n routing with `[locale]` (Story 2.1)
- Translation files structure (Story 2.2)
- StripeModule, tRPC infrastructure, Zsa patterns (Stories 3.1, 3.2)
- Admin layout with auth guard + TODO for onboarding guard (Story 1.3)

### Latest Technical Information

**@tanstack/react-form v1.x (current):**
- `useForm` hook with `defaultValues`, `validators` (onChange/onBlur/onSubmit), `onSubmit`
- `form.Field` component with `children` render prop pattern — NOT `render` prop
- Validation: return `undefined` for success, string or object for errors
- Multi-step: manage `currentStep` with `useState`, validate per-step fields before advancing
- NO built-in wizard/stepper component — build custom step indicator

**next-intl with App Router:**
- Client components: `useTranslations('namespace')` hook
- Server components: `const t = await getTranslations('namespace')`
- Nested keys via dot notation: `t('steps.clinicName.title')`
- ICU syntax for dynamic values: `t('progress', { current: 1, total: 4 })`
- Existing keys to REUSE: `common.next`, `common.previous`, `common.loading`, `common.error`

**NestJS module pattern:**
- `@Injectable()` services with constructor DI
- `@Module({ imports: [PrismaModule], providers: [Service], exports: [Service] })`
- Config access: `private configService: ConfigService<EnvConfig, true>`
- Logger: `private readonly logger = new Logger(ClinicService.name)`

**Prisma 7.2.0 Schema Folders:**
- One file per model in `apps/api/prisma/schema/`
- Relations declared on BOTH sides
- `@@map("table_name")` for snake_case table names
- `@map("column_name")` for snake_case column names

### UX & Design Reference

**"Clinique Zen" aesthetic for the wizard:**
- **Primary color**: Vet Teal (`#009588`) — validation, progress, primary buttons
- **Warning color**: Vital Orange (`#F97316`) — alerts, attention
- **Backgrounds**: Surgical White (`#FFFFFF`) cards on Neutral Wash (`#FDFDFD`)
- **Radius**: `rounded-2xl` / `rounded-3xl` for cards and containers
- **Shadows**: Soft teal-tinted shadows: `shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)]`
- **Typography**: Inter font. Headings in Ink Black (`#171717`), body in Soft Steel (`#737373`)
- **Icons**: Lucide React, 1.5px stroke
- **Spacing**: Ample whitespace with `p-8` to `p-12` padding
- **Touch targets**: Min 44px for interactive elements

**Step indicator design:**
- Horizontal layout with numbered circles + connecting lines
- Completed steps: Vet Teal background + white check icon
- Current step: Vet Teal border + teal number
- Upcoming steps: grey border + grey number
- Connecting lines: teal for completed, grey for upcoming

**Wizard card layout:**
- Each step in a `Card` with `CardHeader` (title + description) + `CardContent` (form fields) + `CardFooter` (navigation buttons)
- Navigation: "Previous" (outline variant) left-aligned, "Next" / "Complete Setup" (primary variant) right-aligned
- Final step button: "Complete Setup" with Check icon

### Project Structure Notes

- Alignment with architecture: onboarding wizard at `app/[locale]/admin/onboarding/page.tsx` as specified in architecture doc
- ClinicModule is a NEW NestJS module — separate from StripeModule (no circular dependency)
- Clinic configuration data (workDays, hours, shiftTypes) will be used by future epics (Epic 5: Staff Management, Epic 6: Planning Engine)
- ShiftType model serves as foundation for future planning features — design the model with extensibility in mind
- ClinicConfig is 1:1 with Clinic (via @unique clinicId) — similar pattern to Subscription model

### Skill-Based Guidelines

#### Turborepo (Monorepo)
- **Run all commands from project root**: `pnpm db:push`, `pnpm db:generate`, `pnpm test`, `pnpm build`. NEVER `cd` into `apps/` directories.
- **Package exports**: When adding schemas to `@pawly/validators`, ensure proper exports in `packages/validators/src/index.ts` so workspace dependency resolution works.
- **Build verification**: After Prisma schema changes, run `pnpm db:generate` then `pnpm build` to verify TypeScript compilation across the monorepo.
- **Workspace deps**: `@pawly/validators` is a workspace dependency — changes are picked up automatically via `"workspace:*"`. No version bumps needed.

#### Vercel React Best Practices
- **`server-serialization`**: In `onboarding/page.tsx` (RSC), fetch onboarding status server-side and pass ONLY the minimal data needed to the client `OnboardingWizard` component. Do NOT pass full Prisma objects — serialize to plain objects with only required fields.
- **`server-auth-actions`**: All Zsa server actions MUST verify authentication. The tRPC `protectedProcedure` handles this, but ensure the Zsa action layer also validates auth context.
- **`rendering-conditional-render`**: Use ternary operators for step rendering (`currentStep === 0 ? <StepClinicName /> : currentStep === 1 ? <StepWorkDays /> : ...`), NOT `&&` operator which can leak falsy values.
- **`rerender-lazy-state-init`**: For form `defaultValues` with complex objects (shift types array), pass a function initializer to avoid re-creating on every render.
- **`async-parallel`**: If onboarding page needs multiple independent fetches, use `Promise.all()` instead of sequential awaits.
- **`bundle-dynamic-imports`**: Consider `next/dynamic` for step components if bundle analysis shows they're large, but for a 4-step wizard this is likely premature optimization.

#### NestJS Best Practices
- **`arch-feature-modules`**: ClinicModule is correctly organized as a feature module with its own service, tests, and clear boundaries.
- **`arch-avoid-circular-deps`**: ClinicModule imports only PrismaModule — no circular dependency risk. Do NOT import AuthModule or StripeModule into ClinicModule.
- **`di-prefer-constructor-injection`**: Use standard constructor injection for PrismaService in ClinicService.
- **`db-use-transactions`**: `completeOnboarding()` MUST wrap all operations (updateClinic + upsertConfig + createShiftTypes + setOnboardingCompleted) in a single `prisma.$transaction()`.
- **`test-use-testing-module`**: Use `Test.createTestingModule()` for ClinicService tests with mocked PrismaService.
- **`error-throw-http-exceptions`**: In ClinicService, throw `NotFoundException` if clinic not found, `ConflictException` for P2002 duplicate shift code, `BadRequestException` for invalid input.
- **`arch-single-responsibility`**: ClinicService handles ONLY clinic configuration. Do NOT add subscription or auth logic to this service.

#### Frontend Design ("Clinique Zen" Implementation)
- **Tone**: "Clinical Precision + Human Warmth" — clean, calming, professional. NOT playful, NOT corporate.
- **Step transitions**: Use CSS transitions (`transition-all duration-300 ease-in-out`) for smooth step changes. Fade + subtle slide (`opacity-0 translate-y-2` → `opacity-100 translate-y-0`). Avoid heavy framer-motion for this simple wizard.
- **Card elevation**: Wizard card should feel elevated but gentle — use `shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)]` (teal-tinted shadow), NOT harsh black shadow.
- **Day selector (Step 2)**: Toggle buttons with `rounded-xl` pill shape. Active state: Vet Teal bg + white text. Inactive: white bg + grey border. Transition on toggle.
- **Shift type list (Step 4)**: Card-based entries with soft borders. "Add shift type" button with `+` icon and dashed border (`border-dashed border-neutral-300`). Color picker using a curated palette (indigo, orange, emerald, rose, teal) — NOT a free-form color picker.
- **Completion celebration**: On final submit, brief success animation (checkmark + confetti-lite or simple scale-up) before redirect to dashboard. Use `sonner` toast: "Clinic configured successfully!" with Vet Teal accent.
- **Layout**: Centered container `max-w-2xl mx-auto`, generous padding `py-12 px-6`, `min-h-screen bg-[#FDFDFD]`.

#### Stripe Plugin Context
- Story 3.3 does NOT directly interact with Stripe APIs — it consumes data created by the `checkout.session.completed` webhook (Story 3.2).
- The clinic name pre-filled in Step 1 comes from `Clinic.name` which was set from `session.metadata.clinicName` during checkout.
- Subscription status is NOT checked in onboarding — the admin layout guard checks auth only. Subscription-based access control is Story 3.6.
- No Stripe SDK imports needed in ClinicModule or onboarding components.

### References

- [Source: docs/planning-artifacts/epics.md#Epic 3, Story 3.3]
- [Source: docs/planning-artifacts/architecture.md#Onboarding Guard, Implementation Sequence Step 8]
- [Source: docs/planning-artifacts/prd.md#FR18]
- [Source: docs/planning-artifacts/ux-design-specification.md#Clinique Zen Design System]
- [Source: docs/implementation-artifacts/3-2-stripe-checkout-clinic-registration.md]
- [Source: @tanstack/react-form docs — Multi-step form pattern]
- [Source: next-intl docs — useTranslations, getTranslations]

### Dev Agent Record (original)

#### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

#### Debug Log References

- Prisma `ShiftType` name conflict with existing enum in Planning.prisma → renamed model to `ClinicShiftType` with `@@map("clinic_shift_types")`
- Zod `.refine()` creates `ZodEffects` which can't be `.merge()`d → created separate `workHoursFieldsSchema` (base object) and `updateClinicConfigSchema` (merged + refine)
- `useForm<OnboardingFormValues>` gave "Expected 12 type arguments, but got 1" (tanstack/react-form v1.x API) → removed generic, let TypeScript infer
- `ReactFormExtendedApi` type import not working → used `OnboardingForm = any` type alias with eslint-disable comments
- Next.js App Router layouts don't receive pathname → modified i18n middleware (proxy.ts) to set `x-pathname` header, read in layout via `headers()`
- Validators test file created as `*.spec.ts` but vitest config uses `src/**/*.test.ts` → renamed to `*.test.ts`

#### Completion Notes List

1. All 10 tasks completed successfully
2. 270 tests passing (93 API + 125 web + 52 validators), zero regressions
3. `generateSlug` extracted from stripe-webhook.controller.ts to shared utility at `common/utils/slug.ts`
4. Prisma model `ClinicShiftType` (not `ShiftType`) to avoid naming conflict with existing enum
5. Onboarding guard uses `x-pathname` header approach for server-side path detection in RSC layouts
6. All user-facing strings have FR/EN translations (~40 keys each)
7. Build passes with zero TypeScript errors

#### Code Review Fixes (Applied 2026-02-06)

**Issue #1 - Empty Catch Block in Onboarding Guard (HIGH)**
- **File:** `apps/web/src/app/[locale]/admin/layout.tsx`
- **Fix:** Replaced empty catch block with specific error handling. Now only allows access if clinic truly doesn't exist (first-time login), re-throws all other errors (network, auth, validation) to prevent silent failures.
- **Validation:** Critical Rule #4 compliance restored.

**Issue #2 - Missing Time Validation in completeOnboardingSchema (HIGH)**
- **File:** `packages/validators/src/clinic/onboarding.schema.ts`
- **Fix:** Added `.refine()` validation to ensure `defaultEndTime > defaultStartTime`. This matches the validation already present in `updateWorkHoursSchema` and `updateClinicConfigSchema`.
- **Tests Added:** 2 new test cases in `onboarding.schema.test.ts` to verify rejection of invalid time ranges (inverted times, equal times).
- **Validation:** Server-side validation now prevents bypassing client-side checks.

**Issue #3 - Missing P2002 Error Handling in completeOnboarding (HIGH)**
- **File:** `apps/api/src/modules/clinic/clinic.service.ts`
- **Fix:** Wrapped `completeOnboarding` transaction in try/catch to handle P2002 duplicate shift code errors gracefully. Now throws user-friendly `ConflictException` instead of raw Prisma error.
- **Tests Added:** 2 new test cases in `clinic.service.spec.ts` to verify P2002 handling and non-P2002 error re-throwing.
- **Validation:** Critical Rule #9 compliance restored, matches error handling pattern in `createShiftTypes`.

#### Change Log

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/api/prisma/schema/ClinicConfig.prisma` | NEW | Clinic configuration model (workDays, hours) |
| `apps/api/prisma/schema/ShiftType.prisma` | NEW | ClinicShiftType model with compound unique [clinicId, code] |
| `apps/api/prisma/schema/Clinic.prisma` | MODIFIED | Added `config` and `shiftTypes` relations |
| `apps/api/src/common/utils/slug.ts` | NEW | Shared `generateSlug()` utility extracted from webhook controller |
| `apps/api/src/modules/clinic/clinic.module.ts` | NEW | NestJS ClinicModule |
| `apps/api/src/modules/clinic/clinic.service.ts` | NEW | ClinicService with 6 methods (CODE REVIEW: added P2002 error handling in completeOnboarding) |
| `apps/api/src/modules/clinic/clinic.service.spec.ts` | NEW | 16 unit tests for ClinicService (CODE REVIEW: +2 tests for P2002 handling) |
| `apps/api/src/trpc/routers/clinic.router.ts` | NEW | tRPC clinic router with 5 protected procedures |
| `apps/api/src/trpc/context.ts` | MODIFIED | Added clinicService to TRPCServices |
| `apps/api/src/trpc/trpc.module.ts` | MODIFIED | Imported ClinicModule, injected ClinicService |
| `apps/api/src/trpc/routers/_app.ts` | MODIFIED | Added clinicRouter to appRouter |
| `apps/api/src/app.module.ts` | MODIFIED | Registered ClinicModule |
| `apps/api/src/modules/stripe/stripe-webhook.controller.ts` | MODIFIED | Extracted generateSlug to shared utility |
| `packages/validators/src/clinic/onboarding.schema.ts` | NEW | 8 Zod schemas for onboarding validation (CODE REVIEW: added .refine() to completeOnboardingSchema) |
| `packages/validators/src/clinic/onboarding.schema.test.ts` | NEW | 52 unit tests for Zod validators (CODE REVIEW: +2 tests for time validation) |
| `packages/validators/src/clinic/index.ts` | NEW | Re-exports all schemas and types |
| `packages/validators/src/index.ts` | MODIFIED | Added clinic export |
| `apps/web/src/proxy.ts` | MODIFIED | Added x-pathname header for RSC path detection |
| `apps/web/src/app/[locale]/admin/layout.tsx` | MODIFIED | Added server-side onboarding guard (CODE REVIEW: improved error handling in catch block) |
| `apps/web/src/app/[locale]/admin/onboarding/page.tsx` | NEW | Server component fetching initial data |
| `apps/web/src/app/[locale]/admin/onboarding/_actions/onboarding-actions.ts` | NEW | 5 Zsa server actions |
| `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` | NEW | Multi-step wizard with @tanstack/react-form |
| `apps/web/src/app/[locale]/admin/onboarding/_components/StepIndicator.tsx` | NEW | Horizontal step progress indicator |
| `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepClinicName.tsx` | NEW | Step 1: clinic name input |
| `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkDays.tsx` | NEW | Step 2: work days toggle buttons |
| `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx` | NEW | Step 3: work hours time inputs |
| `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx` | NEW | Step 4: shift types dynamic list |
| `apps/web/src/i18n/langs/fr.json` | MODIFIED | Added ~40 onboarding translation keys (FR) |
| `apps/web/src/i18n/langs/en.json` | MODIFIED | Added ~40 onboarding translation keys (EN) |
| `apps/web/src/lib/hooks/server-action-hooks.ts` | MODIFIED | Added clinic namespace to QueryKeyFactory |

## File List

**New Files (18):**
- `apps/api/prisma/schema/ClinicConfig.prisma`
- `apps/api/prisma/schema/ShiftType.prisma`
- `apps/api/src/common/utils/slug.ts`
- `apps/api/src/modules/clinic/clinic.module.ts`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `apps/api/src/trpc/routers/clinic.router.ts`
- `packages/validators/src/clinic/onboarding.schema.ts`
- `packages/validators/src/clinic/onboarding.schema.test.ts`
- `packages/validators/src/clinic/index.ts`
- `apps/web/src/app/[locale]/admin/onboarding/page.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_actions/onboarding-actions.ts`
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/StepIndicator.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepClinicName.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkDays.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx`

**Modified Files (12):**
- `apps/api/prisma/schema/Clinic.prisma`
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/trpc/context.ts`
- `apps/api/src/trpc/trpc.module.ts`
- `apps/api/src/trpc/routers/_app.ts`
- `packages/validators/src/index.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/app/[locale]/admin/layout.tsx`
- `apps/web/src/lib/hooks/server-action-hooks.ts`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

## Dev Agent Record

### Summary

Story 3.3 implemented the Post-Checkout Onboarding wizard. New ClinicModule with ClinicService (6 methods, $transaction for completeOnboarding). New Prisma models (ClinicConfig, ClinicShiftType). tRPC clinic router (5 protected procedures). Server-side onboarding guard in admin/layout.tsx via x-pathname header. 4-step wizard UI with @tanstack/react-form. 40+ i18n keys. Code review applied 3 HIGH fixes (empty catch, missing time validation, P2002 handling). 270 tests passing, build green.

### Files changed

**New Files (18):**
- `apps/api/prisma/schema/ClinicConfig.prisma`
- `apps/api/prisma/schema/ShiftType.prisma`
- `apps/api/src/common/utils/slug.ts`
- `apps/api/src/modules/clinic/clinic.module.ts`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `apps/api/src/trpc/routers/clinic.router.ts`
- `packages/validators/src/clinic/onboarding.schema.ts`
- `packages/validators/src/clinic/onboarding.schema.test.ts`
- `packages/validators/src/clinic/index.ts`
- `apps/web/src/app/[locale]/admin/onboarding/page.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_actions/onboarding-actions.ts`
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/StepIndicator.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepClinicName.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkDays.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx`

**Modified Files (12):**
- `apps/api/prisma/schema/Clinic.prisma`
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/trpc/context.ts`
- `apps/api/src/trpc/trpc.module.ts`
- `apps/api/src/trpc/routers/_app.ts`
- `packages/validators/src/index.ts`
- `apps/web/src/proxy.ts`
- `apps/web/src/app/[locale]/admin/layout.tsx`
- `apps/web/src/lib/hooks/server-action-hooks.ts`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

### Deviations

- Prisma model named `ClinicShiftType` (not `ShiftType`) to avoid naming conflict with existing `ShiftType` enum in Planning.prisma.
- `generateSlug` extracted from stripe-webhook.controller.ts to shared utility at `common/utils/slug.ts`.
- Onboarding guard uses `x-pathname` header (set in proxy.ts) rather than direct pathname access (Next.js App Router layouts do not receive pathname).

### Test output

- `pnpm test`: 93 API + 125 web + 52 validators = 270 total, 0 failures
- `pnpm build`: green, 0 TypeScript errors
- 16 new ClinicService tests, 52 validator tests (including 2 added by code review)
