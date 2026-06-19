# Story: 5-7-clinic-24-7-hours — Clinic open 24/7

**Epic:** Epic 5 — Staff Management & Clinic Configuration
**Status:** done
**Branch:** feature/story-5-7-clinic-24-7-hours
**Ticket:** none (derived from quick-fix triage — original request: image #1, onboarding "Work hours" step)
**Commit prefix:** `feat: ...`

## User Story

**As an** admin, **I want** to mark my clinic as open 24/7, **so that** the planning baseline isn't artificially bounded by opening/closing hours and I don't have to invent fake times for a round-the-clock clinic.

## Acceptance Criteria

- **Given** the onboarding "Work hours" step or the admin operational settings panel, **When** I toggle "Open 24/7", **Then** the opening/closing time inputs are disabled (greyed) and `is24_7=true` is persisted on `ClinicConfig`.
- **Given** `is24_7=true`, **When** I submit, **Then** the `defaultEndTime > defaultStartTime` validation is NOT enforced (a 24/7 clinic may keep any/identical times).
- **Given** `is24_7=false` (default), **When** I submit, **Then** existing behaviour is unchanged (end > start enforced; invalid time format rejected).
- **Given** the normalized planning contract `getOperationalConfig`, **When** it is read, **Then** the returned object includes `is24_7`.
- **Given** FR and EN locales, **When** I use the toggle, **Then** its label is translated in both files.
- **Given** the schema migration, **When** `pnpm db:push` runs, **Then** the clinic config gains an `is24_7` boolean defaulting to false, leaving existing clinics unaffected.

## Tasks

- [x] **Task 1 — Prisma: add `is24_7` to `ClinicConfig`** [AC: 1, 6]. Edit `apps/api/prisma/schema/ClinicConfig.prisma`, adding the `is24_7` line between `defaultEndTime` and `createdAt`:

```prisma
  defaultEndTime   String   @map("default_end_time")
  is24_7           Boolean  @default(false) @map("is_24_7")
  createdAt        DateTime @default(now()) @map("created_at")
```

Run (repo root, never `cd apps/api`): `pnpm db:generate && pnpm db:push`
Expected: Prisma Client regenerated; "Your database is now in sync with your Prisma schema.", exit 0.
Commit: `git add apps/api/prisma/schema/ClinicConfig.prisma && git commit -m "feat(clinic): add is24_7 flag to ClinicConfig"`

- [x] **Task 2 — Validators: `onboarding.schema.ts` (wizard surface)** [AC: 1, 2, 3]. Edit `packages/validators/src/clinic/onboarding.schema.ts`. Add `is24_7` to `workHoursFieldsSchema` and make the three `end > start` refines short-circuit on it:

```ts
export const workHoursFieldsSchema = z.object({
  defaultStartTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  defaultEndTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  is24_7: z.boolean().default(false),
});

export const updateWorkHoursSchema = workHoursFieldsSchema.refine(
  (data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime,
  { message: "End time must be after start time", path: ["defaultEndTime"] },
);

export const updateClinicConfigSchema = updateWorkDaysSchema
  .merge(workHoursFieldsSchema)
  .refine((data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime, {
    message: "End time must be after start time",
    path: ["defaultEndTime"],
  });
```

In `completeOnboardingSchema`, add `is24_7: z.boolean().default(false),` to the object (after `defaultEndTime`) and change the refine predicate to `(data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime`.
Run: `pnpm --filter @pawly/validators test`
Expected: existing suites green, exit 0.
Commit: `git add packages/validators/src/clinic/onboarding.schema.ts && git commit -m "feat(validators): is24_7 on onboarding/work-hours schemas"`

- [x] **Task 3 — Validators: `operational-config.schema.ts` (settings surface)** [AC: 1, 2, 3, 4]. Edit `packages/validators/src/clinic/operational-config.schema.ts`. Add `is24_7: z.boolean().default(false),` to the `updateClinicOperationalConfigSchema` object (after `defaultEndTime`), and guard the time-order issue:

```ts
  .superRefine((data, ctx) => {
    if (!data.is24_7 && data.defaultEndTime <= data.defaultStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["defaultEndTime"],
      });
    }
    // (keep the duplicate closed/special-day checks exactly as they are)
```

Add `is24_7: z.boolean(),` to the output `clinicOperationalConfigSchema` (after `defaultEndTime`).
Run: `pnpm --filter @pawly/validators test`
Expected: green, exit 0.
Commit: `git add packages/validators/src/clinic/operational-config.schema.ts && git commit -m "feat(validators): is24_7 on operational-config schema"`

- [x] **Task 4 — Validators tests** [AC: 2, 3]. Edit `packages/validators/src/clinic/operational-config.schema.test.ts`, appending inside the existing `describe` for `updateClinicOperationalConfigSchema`:

```ts
it("accepts equal times when is24_7 is true", () => {
  const result = updateClinicOperationalConfigSchema.safeParse({
    workDays: ["MONDAY"], defaultStartTime: "00:00", defaultEndTime: "00:00",
    is24_7: true, closedDays: [], specialDays: [],
  });
  expect(result.success).toBe(true);
});

it("still rejects end <= start when is24_7 is false", () => {
  const result = updateClinicOperationalConfigSchema.safeParse({
    workDays: ["MONDAY"], defaultStartTime: "18:00", defaultEndTime: "09:00",
    is24_7: false, closedDays: [], specialDays: [],
  });
  expect(result.success).toBe(false);
});

it("defaults is24_7 to false when omitted", () => {
  const result = updateClinicOperationalConfigSchema.safeParse({
    workDays: ["MONDAY"], defaultStartTime: "08:30", defaultEndTime: "18:30",
    closedDays: [], specialDays: [],
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.is24_7).toBe(false);
});
```

Run: `pnpm --filter @pawly/validators test`
Expected: 3 new tests pass, exit 0.
Commit: `git add packages/validators/src/clinic/operational-config.schema.test.ts && git commit -m "test(validators): is24_7 short-circuits time order rule"`

- [x] **Task 5 — API: propagate + expose `is24_7` in `clinic.service.ts`** [AC: 1, 4]. Edit `apps/api/src/modules/clinic/clinic.service.ts`. In all THREE `clinicConfig.upsert` blocks (`upsertClinicConfig`, the `tx.clinicConfig.upsert` in `completeOnboarding`, the one in `updateOperationalConfig`), add `is24_7: data.is24_7 ?? false,` to BOTH `create` and `update` objects (after `defaultEndTime`). In `getOperationalConfig`, add `is24_7: clinic.config.is24_7,` to the returned object (after `defaultEndTime`, before `closedDays`).

Run: `pnpm --filter @pawly/api exec jest clinic.service`
Expected: existing clinic.service suite green, exit 0.
Commit: `git add apps/api/src/modules/clinic/clinic.service.ts && git commit -m "feat(clinic): persist + expose is24_7"`

- [x] **Task 6 — API service test** [AC: 1, 4]. Edit `apps/api/src/modules/clinic/clinic.service.spec.ts` (read the top first to match its mock helpers). Add a test asserting `getOperationalConfig` returns `is24_7`:

```ts
it("exposes is24_7 in the normalized operational config", async () => {
  prisma.clinic.findUnique.mockResolvedValue({
    id: "clinic-1",
    config: { workDays: ["MONDAY"], defaultStartTime: "00:00", defaultEndTime: "00:00", is24_7: true },
    closedDays: [], specialDays: [],
  } as any);
  const result = await service.getOperationalConfig("clinic-1");
  expect(result.is24_7).toBe(true);
});
```

Run: `pnpm --filter @pawly/api exec jest clinic.service`
Expected: new test passes, exit 0.
Commit: `git add apps/api/src/modules/clinic/clinic.service.spec.ts && git commit -m "test(clinic): is24_7 surfaced by getOperationalConfig"`

- [x] **Task 7 — Web: onboarding wizard toggle** [AC: 1, 2, 5]. Edit `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx`: add `is24_7: boolean;` to `OnboardingFormValues` (after `defaultEndTime`); add `is24_7: initialData.config?.is24_7 ?? false,` to `fallbackDefaults` (after `defaultEndTime`); replace `validateCurrentStep` case 1 with:

```ts
      case 1:
        return (
          /^\d{2}:\d{2}$/.test(values.defaultStartTime) &&
          /^\d{2}:\d{2}$/.test(values.defaultEndTime) &&
          (values.is24_7 || values.defaultEndTime > values.defaultStartTime)
        );
```

Edit `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx`: import `Checkbox` from `@/components/ui/checkbox`; add a 24/7 toggle field ABOVE the time inputs and disable both `<Input type="time">` when on (greying only — do not clear values):

```tsx
<form.Field name="is24_7">
  {(field: any) => (
    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
      <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
      {t("is24_7")}
    </label>
  )}
</form.Field>
```

Wrap the existing two time fields in `<form.Subscribe selector={(s: any) => s.values.is24_7}>{(is24_7: boolean) => (...)}</form.Subscribe>` and pass `disabled={is24_7}` to each `<Input type="time" .../>`.
Run: `pnpm --filter @pawly/web test`
Expected: no regression (720 passed, 2 known pre-existing failures), exit 0.
Commit: `git add "apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx" "apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx" && git commit -m "feat(onboarding): 24/7 toggle in work-hours step"`

- [x] **Task 8 — Web: settings panel toggle** [AC: 1, 2, 5]. Edit `apps/web/src/app/[locale]/admin/settings/_components/ClinicOperationalConfigPanel.tsx`: add `is24_7: boolean;` to the `FormValues` type (after `defaultEndTime`); add `is24_7: boolean;` to `configToFormValues`'s param type and `is24_7: config.is24_7,` to its returned object. Add a toggle inside the "Weekly defaults" `<section>` (after the work-hours grid):

```tsx
<form.Field name="is24_7">
  {(field: any) => (
    <label className="mt-4 flex items-center gap-2 text-sm font-medium cursor-pointer">
      <Checkbox checked={field.state.value} onCheckedChange={(c) => field.handleChange(c === true)} />
      {t("fields.is24_7")}
    </label>
  )}
</form.Field>
```

Add `disabled={form.getFieldValue("is24_7")}` to both `<Input id="defaultStartTime" ...>` and `<Input id="defaultEndTime" ...>`. `Checkbox` is already imported (line 10). `onSubmit` already runs `updateClinicOperationalConfigSchema.safeParse(value)`, so `is24_7` flows through once it's in `FormValues`/`defaultValues`.
Run: `pnpm --filter @pawly/web test`
Expected: `ClinicOperationalConfigPanel.spec.tsx` + rest green, exit 0.
Commit: `git add "apps/web/src/app/[locale]/admin/settings/_components/ClinicOperationalConfigPanel.tsx" && git commit -m "feat(settings): 24/7 toggle in operational config"`

- [x] **Task 9 — i18n keys (EN + FR)** [AC: 5]. Edit `apps/web/src/i18n/langs/en.json` and `apps/web/src/i18n/langs/fr.json`. Under `onboarding.steps.workHours` add `"is24_7"` (EN: `"Open 24/7"`, FR: `"Ouvert 24h/24"`). Under `settings.operationalConfig.fields` add `"is24_7"` (EN: `"Open 24/7"`, FR: `"Ouvert 24h/24"`).
Run: `pnpm --filter @pawly/web run i18n:check`
Expected: `Translation validation PASSED`, keys identical EN/FR, exit 0.
Commit: `git add apps/web/src/i18n/langs/en.json apps/web/src/i18n/langs/fr.json && git commit -m "i18n: 24/7 toggle labels (en/fr)"`

- [x] **Task 10 — Quality gates + visual verification** [AC: all]. Run from repo root: `pnpm test`, then `pnpm --filter @pawly/web exec tsc --noEmit -p tsconfig.json`, then `pnpm lint`.
Expected: `pnpm test` — no NEW failures vs `develop` (the 2 pre-existing `landing-page.spec` + `employee-form.spec` failures stay, count unchanged). `tsc` — no error on changed files (the pre-existing `AppRouter`/trpc-types error is unrelated, see lesson L5). `lint` — no NEW errors (pre-existing `react-hooks/refs` in `layout.tsx`/`TourProvider.tsx` are known).
Visual: with `pnpm dev` running, toggle "Open 24/7" in the onboarding work-hours step AND Settings → operational config; confirm time inputs grey out, the form saves, and reload shows the toggle checked (`is24_7=true` persisted).
Commit: none (gates only).

## Dev Notes

- **Architecture:** Non-negotiable data flow `Page → Client → Hook → Zsa → Server Action → tRPC → NestJS Service → Prisma`. No direct Prisma from `apps/web`; no direct tRPC from client components. Validation single-sourced in `@pawly/validators`; clinic logic stays in `clinic.service.ts`. Writes are `subscribedProcedure + adminOnly`, except `completeOnboarding` (`protectedProcedure`, before subscription).
- **Planning impact: NONE.** `apps/api/src/modules/planning/` never reads `defaultStartTime`/`defaultEndTime` (0 references outside the clinic module). Shift windows come from `ClinicShiftType` + `specialDays`; `getOperationalConfig` only feeds `workDays`/`closedDays`/`specialDays` into generation. So `is24_7` is storage + validation + UI + contract exposure only — do NOT touch `planning-generation.service.ts`.
- **Redis:** `updateOperationalConfig` already invalidates `clinic:ops:{clinicId}` in the router; `getOperationalConfig` caches 300s. No change needed.
- **Testing:** validators = Vitest (`*.test.ts`), API = Jest (`*.spec.ts`), web = Vitest (`*.spec.tsx`). Run pnpm from repo root only.
- **Dependencies:** none new. `Checkbox` (`@/components/ui/checkbox`) already exists.

### Lessons applied

- **L1** — Zsa server actions return `[data, err]` tuples while `mutateAsync` returns directly. `useClinicOperationalConfig.ts` already wraps via `useServerAction*`; keep destructuring correct in `clinic-operational-config-actions.ts` if touched.
- **L4** — consult Context7 `/prisma/docs` before the migration (Prisma 7.2.0).
- **L2** — perform the Task 10 visual pass; unit tests alone previously missed runtime bugs.

### File decisions (one responsibility each)

- `ClinicConfig.prisma` — clinic base config model; gains `is24_7`.
- `onboarding.schema.ts` — wizard/work-hours contracts; `is24_7` + conditional refines.
- `operational-config.schema.ts` — settings operational contract; `is24_7` + conditional superRefine + output.
- `clinic.service.ts` — clinic domain logic; persists `is24_7` (3 upserts) + returns it from `getOperationalConfig`.
- `StepWorkHours.tsx` / `OnboardingWizard.tsx` — onboarding step 2; `is24_7` in form state + greyed inputs.
- `ClinicOperationalConfigPanel.tsx` — admin operational form; `is24_7` in form state + greyed inputs.
- `i18n/langs/{en,fr}.json` — `is24_7` label under two namespaces.

### Existing code at write time (Step-0 quotes)

`ClinicConfig.prisma` (current): model `ClinicConfig` has `workDays`, `defaultStartTime @map("default_start_time")`, `defaultEndTime @map("default_end_time")`, `createdAt`, `updatedAt`, `@@map("clinic_configs")` — NO `is24_7` yet.

`onboarding.schema.ts` (current): `workHoursFieldsSchema` = `{ defaultStartTime, defaultEndTime }` (no `is24_7`); `updateWorkHoursSchema`, `updateClinicConfigSchema`, `completeOnboardingSchema` each `.refine((data) => data.defaultEndTime > data.defaultStartTime, ...)` — unconditional.

`operational-config.schema.ts` (current): `updateClinicOperationalConfigSchema` superRefine starts with `if (data.defaultEndTime <= data.defaultStartTime) ctx.addIssue(...)` — unconditional; `clinicOperationalConfigSchema` output has no `is24_7`.

`clinic.service.ts` (current): `getOperationalConfig` returns `{ workDays, defaultStartTime, defaultEndTime, closedDays, specialDays }` — no `is24_7`. The 3 `clinicConfig.upsert` blocks write `{ clinicId, workDays, defaultStartTime, defaultEndTime }` — no `is24_7`.

`OnboardingWizard.tsx` (current): `validateCurrentStep` case 1 returns `regex(start) && regex(end) && values.defaultEndTime > values.defaultStartTime`; `OnboardingFormValues` and `fallbackDefaults` have no `is24_7`.

`ClinicOperationalConfigPanel.tsx` (current): `FormValues` and `configToFormValues` (lines 25-77) omit `is24_7`; `useForm` defaultValues = `configToFormValues(config)`; time inputs at the work-hours grid have no `disabled`.

## File List

- `apps/api/prisma/schema/ClinicConfig.prisma` (modify)
- `packages/validators/src/clinic/onboarding.schema.ts` (modify)
- `packages/validators/src/clinic/operational-config.schema.ts` (modify)
- `packages/validators/src/clinic/operational-config.schema.test.ts` (modify)
- `apps/api/src/modules/clinic/clinic.service.ts` (modify)
- `apps/api/src/modules/clinic/clinic.service.spec.ts` (modify)
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` (modify)
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx` (modify)
- `apps/web/src/app/[locale]/admin/settings/_components/ClinicOperationalConfigPanel.tsx` (modify)
- `apps/web/src/i18n/langs/en.json` (modify)
- `apps/web/src/i18n/langs/fr.json` (modify)

## Dev Agent Record

### Summary

Added an `is24_7` flag end-to-end (Prisma → validators → clinic service → onboarding wizard + operational-settings UI → i18n EN/FR). The `defaultEndTime > defaultStartTime` validation is short-circuited when `is24_7` is true; the time inputs grey out when the toggle is on. As predicted in the story, the planning algorithm needed no change — it never reads the default hours. Scope held.

### Files changed

- `apps/api/prisma/schema/ClinicConfig.prisma`
- `packages/validators/src/clinic/onboarding.schema.ts` (+ `.test.ts`)
- `packages/validators/src/clinic/operational-config.schema.ts` (+ `.test.ts`)
- `apps/api/src/modules/clinic/clinic.service.ts` (+ `.spec.ts`)
- `apps/api/src/trpc/routers/clinic.router.spec.ts`
- `apps/web/.../onboarding/_components/OnboardingWizard.tsx` + `steps/StepWorkHours.tsx`
- `apps/web/.../settings/_components/ClinicOperationalConfigPanel.tsx` (+ `__tests__/...spec.tsx`)
- `apps/web/src/i18n/langs/en.json`, `fr.json`
- `packages/types/src/clinic/config.types.ts`

### Deviations

- Committed per layer (validators / service / frontend) rather than one-commit-per-task — interdependent files must land together to keep each commit green.
- `is24_7` typed **optional** in `OnboardingInitialData.config` and the `configToFormValues` param (the trpc-inferred / package types don't yet carry it; runtime always provides it via `getOperationalConfig`). Coalesced with `?? false`.
- Visual verification deferred — react-grab MCP unavailable this session (per lesson L2, do a manual pass before merge).
- Unrelated `apps/web/src/lib/tours/driver-adapter.ts` change (`animate` toggle) appeared in the working tree mid-session; NOT created by this story, left uncommitted and surfaced to the user.

### Test output

Fresh full run (`run-tests.sh`):
- `@pawly/validators`: **763 passed** (27 files) — incl. the 3 new is24_7 cases.
- `@pawly/api` (jest): **827 passed** (30 suites) — incl. `clinic.service` getOperationalConfig is24_7 + router.
- `@pawly/web` (vitest): **720 passed**; 2 pre-existing failures unrelated to this story (`landing-page.spec`, `employee-form.spec`) — confirmed identical on `develop`.
- `tsc --noEmit` (web): clean on changed files (pre-existing `AppRouter`/trpc-types error only, per L5).
- `i18n:check`: PASSED (EN/FR identical).

## Review Record

**Date:** 2026-06-19
**Auditors:** Spec, Code, Edge & Hallucination, Aria
**Verdict:** done

Implementation was correct and complete end-to-end at review time; the gaps were
in proof, not behaviour. The user elected to fix all actionable findings during
review (commit `6f864bd`) rather than bounce the story back to dev.

### Findings

#### Resolved
- [MAJOR] AC-1 — no test asserted the time inputs grey out when "Open 24/7" is toggled on [apps/web/.../settings/__tests__/clinic-operational-config-panel.spec.tsx]
  - Source: Spec + Code
  - Resolution: `6f864bd` — +2 panel tests (toggle disables both `<Input type="time">`; equal start/end times submit with `is24_7: true`).
- [MINOR] AC-2 — the is24_7 short-circuit was untested on the three onboarding schemas [packages/validators/src/clinic/onboarding.schema.test.ts]
  - Source: Spec
  - Resolution: `6f864bd` — +4 cases across `updateWorkHoursSchema`, `updateClinicConfigSchema`, `completeOnboardingSchema` (equal-times accepted when true; invalid format still rejected).
- [MINOR] The `is24_7: true` write path was never asserted (only the `?? false` default branch) [apps/api/src/modules/clinic/clinic.service.spec.ts]
  - Source: Code
  - Resolution: `6f864bd` — upsert test asserting `is24_7: true` reaches both `create` and `update`.
- [NIT] The older `getOperationalConfig` contract snapshot omitted `is24_7` [apps/api/src/modules/clinic/clinic.service.spec.ts:705]
  - Source: Spec
  - Resolution: `6f864bd` — `is24_7: false` added to both the mock config and the `toEqual` expectation.
- [NIT] The 24/7 Checkbox relied on implicit label wrapping — a Radix button is not natively labelled that way, so screen readers missed the accessible name (WCAG 2.1 AA / NFR14) [apps/web/.../steps/StepWorkHours.tsx:26, apps/web/.../_components/ClinicOperationalConfigPanel.tsx:235]
  - Source: Aria
  - Resolution: `6f864bd` — Checkbox given `id="is24_7"` + explicit `<label/Label htmlFor>` in both surfaces (matches the existing workDays pattern).
- [MINOR] An unrelated change to `apps/web/src/lib/tours/driver-adapter.ts` (re-enabling tour `animate`, reverting a documented lag fix) sat uncommitted in the working tree [apps/web/src/lib/tours/driver-adapter.ts:30]
  - Source: Code + Edge
  - Resolution: reverted (`git checkout --`); excluded from this PR.

#### Dismissed
- [NIT] The time-format regex `^\d{2}:\d{2}$` accepts impossible times (`99:99`, `25:00`) [packages/validators/src/clinic/onboarding.schema.ts:27, operational-config.schema.ts:4]
  - Source: Edge
  - Rationale: pre-existing — byte-identical at base `b27f711`, independent of 5-7. AC-3 is not violated (the format check still runs when `is24_7=true`, proven by runtime probe). Tracked for a separate hardening ticket (`^([01]\d|2[0-3]):[0-5]\d$`).
- [NIT] Prettier single-quote reformat inflates the diff (~80% of churn in the touched validators/spec files)
  - Source: Code
  - Rationale: conforms to repo `.prettierrc`; no assertions weakened (verified — `it()` counts and `toEqual` strictness preserved). Advice for future commits only.
- [NIT] `react-hooks/refs` errors + 2 unused-var warnings in `ClinicOperationalConfigPanel.tsx` (lines 3, 76, 118-119)
  - Source: Lead (lint gate)
  - Rationale: proven identical at base `b27f711` (originated in story 5-3); the ref-during-render is an intentional derived-state pattern. Not introduced by 5-7 or by the review fix; out of scope.

### Verification
- Test commands (fresh run at review):
  - `pnpm --filter @pawly/validators test` → **767 passed** (27 files).
  - `pnpm --filter @pawly/api test` → **828 passed** (30 suites).
  - `pnpm --filter @pawly/web test` → **722 passed**, 2 failed.
- Web failures are the known pre-existing pair `landing-page.spec.tsx` + `employee-form.spec.tsx` (unchanged vs `develop`) — zero new regressions.
- `tsc --noEmit` (web): clean apart from the known L5 `@pawly/api/trpc-types` artefact.
- `i18n:check`: PASSED (1480 keys, EN/FR identical).
- Lint: 4 problems, all proven pre-existing at base `b27f711`; zero introduced.
- Visual verification: **waived by user** — React Grab MCP unavailable this session; the input-greying behaviour is now covered by an automated test and was confirmed by static review (Edge ran the compiled validators; Aria read both components).

### Ticket sync
- Ticket: none (story derived from quick-fix triage).
- PR: #91 (https://github.com/yabafre/Pawly/pull/91, base `develop`) — pre-existing; fix commit `6f864bd` not yet pushed at finalize.
