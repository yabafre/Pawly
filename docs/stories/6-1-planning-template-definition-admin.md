# Story 6.1: Planning Template Definition (Admin)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an admin,
I want to create and manage week templates that define shift type requirements per day,
so that I have a baseline structure for monthly planning generation.

## Acceptance Criteria

1. **Given** the template management interface **When** I create a new template **Then** it is stored in the existing `PlanningTemplate` model with a structured `data` JSON field containing daily shift slots with shift type codes, required staff counts, and optional job type constraints.
2. **Given** a template creation or editing form **When** I define slots for each day of the week **Then** each slot references a valid `ClinicShiftType.code` from my clinic's configured shift types (Story 5.5), specifies `requiredStaff` count (minimum 1), and optionally specifies `requiredJobTypes` from the `JobType` enum.
3. **Given** the template list view **When** I view my templates **Then** I see all templates scoped to my clinic with name, creation date, a visual week preview showing slot counts per day, and action buttons (edit, duplicate, delete).
4. **Given** an existing template **When** I duplicate it **Then** a new template is created with the same `data` structure, a name suffixed with "(Copy)", and I can immediately rename and edit it.
5. **Given** the template editor **When** I add a slot to a day **Then** I can select from my clinic's configured shift types (dropdown populated from `ClinicShiftType` records), set the required staff count, and optionally filter by job types.
6. **Given** the template editor **When** I view the week grid preview **Then** I see a visual 7-day grid (Mon–Sun) showing shift type color chips with staff counts, empty days clearly indicated, and a total staff-hours summary per day.
7. **Given** any CRUD operation on templates **When** the request is executed **Then** it is strictly scoped to the authenticated admin's `clinicId` (multi-tenant isolation).
8. **Given** template slot configuration **When** a slot references a `shiftTypeCode` **Then** the system validates that the code exists in the clinic's `ClinicShiftType` records (server-side cross-reference).
9. **Given** the clinic's configured `workDays` (from Story 5.3) **When** I create a template **Then** non-work-day columns are visually dimmed but still editable (admin may choose to schedule on off-days).
10. **Given** FR/EN locales **When** I use this feature **Then** all user-facing strings are translated and the interface follows the Clinique Zen conventions with WCAG AA-compliant interactions.

## Tasks

- [x] **Task 1: Create planning template validators** (AC: #1, #2, #5, #8)
  - [x] 1.1 Create `packages/validators/src/planning/planning-template.schema.ts` with template slot, day, data, create, update, duplicate, list schemas
  - [x] 1.2 Add tests in `packages/validators/src/planning/planning-template.schema.test.ts`
  - [x] 1.3 Export from `packages/validators/src/planning/index.ts`

- [x] **Task 2: Add PlanningTemplateService to PlanningModule** (AC: #1, #2, #3, #4, #7, #8)
  - [x] 2.1 Create `apps/api/src/modules/planning/planning-template.service.ts` with CRUD + duplicate + validateTemplateData methods
  - [x] 2.2 Register service in `PlanningModule` providers and exports
  - [x] 2.3 Add `PlanningTemplateService` to `TRPCServices` in `context.ts` and inject in `trpc.module.ts`

- [x] **Task 3: Expose tRPC template procedures** (AC: #1, #3, #4, #7)
  - [x] 3.1 Add template procedures to `planning.router.ts`: `listTemplates`, `getTemplateById`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `duplicateTemplate`
  - [x] 3.2 All procedures use `subscribedProcedure` + ADMIN role check
  - [x] 3.3 Input validation with schemas from `@pawly/validators`

- [x] **Task 4: Create web server actions and hooks** (AC: #1, #3, #4)
  - [x] 4.1 Create server actions in `admin/planning/templates/_actions/template-actions.ts`
  - [x] 4.2 Create `useTemplates` hook with query/mutation hooks
  - [x] 4.3 Add `planningTemplates` query key to `QueryKeyFactory`
  - [x] 4.4 Invalidate template keys after mutations

- [x] **Task 5: Build admin template management UI** (AC: #1, #3, #5, #6, #9, #10)
  - [x] 5.1 Create dedicated sub-route `admin/planning/templates/page.tsx`
  - [x] 5.2 Create `TemplateList.tsx` with card grid showing template name, week preview, and action buttons
  - [x] 5.3 Create `TemplateEditor.tsx` with week grid editor (7 columns, slot rows per day)
  - [x] 5.4 Create `TemplateSlotForm.tsx` with shift type dropdown, staff count, job type multi-select
  - [x] 5.5 Create `TemplateWeekPreview.tsx` with visual week grid showing shift type color chips
  - [x] 5.6 Add loading.tsx, error.tsx, and skeleton states
  - [x] 5.7 Follow Clinique Zen aesthetic with rounded-3xl cards, soft shadows, teal accents

- [x] **Task 6: Add sidebar navigation link** (AC: #10)
  - [x] 6.1 Add "Templates" link under Planning section with `LayoutTemplate` Lucide icon
  - [x] 6.2 Active route highlighting with improved specificity matching

- [x] **Task 7: Add i18n translations** (AC: #10)
  - [x] 7.1 Add `admin.planningTemplates` namespace keys in `en.json`
  - [x] 7.2 Add equivalent keys in `fr.json`
  - [x] 7.3 Include template fields, slot labels, day names, toast messages, empty state

- [x] **Task 8: Add comprehensive tests** (AC: all)
  - [x] 8.1 **Validators (Vitest, `*.test.ts`)**: template slot schema, day schema, create/update/duplicate/list schemas, shiftTypeCode validation, requiredStaff min 1
  - [x] 8.2 **API service (Jest, `*.spec.ts`)**: CRUD, duplicate, clinic isolation, shiftTypeCode cross-validation, data structure validation
  - [x] 8.3 **tRPC router (Jest, `*.spec.ts`)**: auth/subscription guards, ADMIN-only, clinic scoping, input validation
  - [x] 8.4 **Web (Vitest, `*.spec.tsx`)**: template list rendering, empty state, editor grid, slot form, duplicate action, FR/EN labels
  - [x] 8.5 Root quality gates: `pnpm test` and `pnpm build` green

## Dev Notes

This story creates the template definition infrastructure that Story 6.2 (Greedy Generation Algorithm) will use to generate monthly schedules. A template defines the **ideal week structure** — which shift types are needed each day and how many staff per slot. The existing `PlanningTemplate` Prisma model (in `Planning.prisma`) already has the right shape (`id`, `name`, `data Json`, `clinicId`); this story provides the CRUD infrastructure, validation, and admin UI to populate it.

### Design Decision: Template Data Structure

The `PlanningTemplate.data` Json field stores a structured week definition:

```typescript
type TemplateSlot = {
  shiftTypeCode: string;    // References ClinicShiftType.code (e.g., "SURGERY", "RECEPTION")
  requiredStaff: number;    // Minimum employees needed for this slot (>= 1)
  requiredJobTypes?: string[]; // Optional: restrict to specific JobType values (VET, ASV, APPRENTICE)
};

type TemplateDay = {
  dayOfWeek: number;  // 1 (Monday) to 7 (Sunday) — ISO 8601 convention
  slots: TemplateSlot[];
};

type TemplateData = {
  days: TemplateDay[];  // 0 to 7 entries (not all days required)
};
```

**Rationale:**
- `shiftTypeCode` links to `ClinicShiftType` (Story 5.5) — the admin's custom shift types with start/end times and colors. This avoids hardcoding shift types.
- `requiredStaff` tells Story 6.2 how many employees the algorithm must assign to each slot.
- `requiredJobTypes` optional filter enables rules like "Surgery requires at least 1 VET".
- `dayOfWeek` uses ISO 8601 (1=Monday, 7=Sunday) matching JavaScript's `date-fns` convention and Prisma's date handling. **Do NOT use JS Date.getDay() convention (0=Sunday)** — always ISO 8601 in template data.
- Days can be omitted (e.g., if clinic doesn't operate on Sunday, dayOfWeek=7 is absent).

### Relationship to Existing Infrastructure

- **PlanningTemplate model (Planning.prisma)**: Already exists with `id`, `name`, `data Json`, `clinicId`, `createdAt`, `updatedAt`, `@@index([clinicId])`. No schema migration needed — just CRUD + validation around the existing model.
- **ClinicShiftType (ShiftType.prisma)**: Provides shift type codes, names, colors, start/end times. Template slots reference these via `shiftTypeCode`. The editor UI populates shift type dropdowns from `ClinicShiftType` records.
- **ClinicConfig.workDays (ClinicConfig.prisma)**: Indicates which days the clinic operates. The template editor uses this to visually dim non-work-day columns but does NOT prevent scheduling on those days (admin override).
- **PlanningService (planning.service.ts)**: Currently handles planning rule CRUD. Template service is a separate `PlanningTemplateService` in the same module — keep separation of concerns.
- **Story 6.2 dependency**: The greedy algorithm will call `planningTemplateService.getTemplateById()` to load the template, then iterate over `data.days` to create Shift records. The template data structure is the contract between 6.1 and 6.2.

### Technical Requirements

- **No Prisma schema changes**: `PlanningTemplate` model already exists with the correct shape. Run `pnpm db:generate` only if other schema changes are needed.
- **Separate service**: Create `PlanningTemplateService` (NOT merge into `PlanningService`) to keep concerns separated. Both live in `PlanningModule`.
- **Validation at two levels**:
  1. **Zod schema** (shared validators): Validates data structure shape (days array, slot fields, requiredStaff >= 1).
  2. **Service-level cross-reference**: Validates `shiftTypeCode` exists in clinic's `ClinicShiftType` records, validates `requiredJobTypes` values match `JobType` enum.
- **Duplicate operation**: Create a new record with same `data`, name = `${original.name} (Copy)`. Return the new record for immediate editing.
- **Template data validation in service**:
  - Each `dayOfWeek` must be 1–7 and unique within the template.
  - Each slot's `shiftTypeCode` must exist in the clinic's `ClinicShiftType` records.
  - Each slot's `requiredStaff` must be >= 1.
  - If `requiredJobTypes` provided, values must be valid `JobType` enum values.
  - Empty days array is valid (minimal template).
- **Query patterns**:
  - `listTemplates(clinicId)`: Return all templates for clinic, ordered by `updatedAt desc`.
  - `getTemplateById(clinicId, templateId)`: Return single template, verify clinic ownership.
  - `createTemplate(clinicId, input)`: Validate data, create record.
  - `updateTemplate(clinicId, input)`: Verify ownership, validate data, update record.
  - `deleteTemplate(clinicId, templateId)`: Verify ownership, delete record.
  - `duplicateTemplate(clinicId, templateId)`: Verify ownership, create copy.

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow must remain unchanged:

```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- No direct Prisma access from `apps/web`.
- No direct tRPC calls from client components; only through route-local server actions.
- Keep template business logic in `apps/api/src/modules/planning/planning-template.service.ts`.
- All tRPC procedures must validate input with schemas from `@pawly/validators`.
- Keep auth/subscription semantics:
  - Template CRUD behind `subscribedProcedure` (requires auth + active subscription).
  - Only ADMIN role can create/update/delete/duplicate templates.
  - EMPLOYEE role has no access to template management.
- Preserve strict clinic tenancy:
  - Scope all queries by `ctx.user.clinicId`.
  - Reject any design that relies on client-passed clinic identifiers.
- Mutations must invalidate relevant React Query keys through `QueryKeyFactory` patterns.
- `PlanningTemplateService` lives inside existing `PlanningModule` (same domain):
  - No new module imports needed.
  - Import `ClinicModule` is already in PlanningModule.
  - Export `PlanningTemplateService` for tRPC injection.

### Library & Framework Requirements

- **Prisma (project pinned to `7.2.0`)**
  - Use existing `PlanningTemplate` model in `Planning.prisma` — NO schema changes needed.
  - `Json` field validated at application layer (Zod validates shape, service validates references).
  - Simple CRUD: `create`, `findMany`, `findFirst`, `update`, `delete`.
  - No `$transaction` needed — single-record operations.

- **NestJS (project baseline `11.x`)**
  - `PlanningTemplateService` as new provider in `PlanningModule`.
  - Constructor injection for `PrismaService` and `ClinicService` (for shift type validation).
  - Use typed exceptions (`NotFoundException`, `BadRequestException`).
  - Keep service methods thin — one method per operation.

- **tRPC (`11.x`)**
  - Add template procedures to existing `planning.router.ts` (same router, new methods).
  - ADMIN role enforcement via existing `adminOnly()` pattern.
  - Input validation with shared Zod schemas.

- **Zod via `@pawly/zod` (`zod` override `4.3.6`)**
  - `templateSlotSchema`: `{ shiftTypeCode: z.string().min(1), requiredStaff: z.number().int().min(1), requiredJobTypes: z.array(z.enum(['VET', 'ASV', 'APPRENTICE'])).optional() }`
  - `templateDaySchema`: `{ dayOfWeek: z.number().int().min(1).max(7), slots: z.array(templateSlotSchema) }`
  - `templateDataSchema`: `{ days: z.array(templateDaySchema) }` with `.refine()` for unique dayOfWeek values.
  - CRITICAL: Zod `.refine()` creates ZodEffects — create base `templateDataBaseSchema` (plain object) separately, then add `.refine()` only at final step. Do NOT `.merge()` a ZodEffects schema.
  - `createTemplateSchema`: `{ name: z.string().min(1).max(100), data: templateDataSchema }`
  - `updateTemplateSchema`: `{ id: z.string().uuid(), name: z.string().min(1).max(100), data: templateDataSchema }`
  - `duplicateTemplateSchema`: `{ id: z.string().uuid() }`
  - `listTemplatesSchema`: `z.void()` or `z.object({})` — no filters needed.
  - `templateIdSchema`: `{ id: z.string().uuid() }`

- **Next.js (`16.x`) + next-intl (`4.x`)**
  - New template route under `app/[locale]/admin/planning/templates/`.
  - Use `setRequestLocale(locale)` in page.
  - Follow existing `loading.tsx`, `error.tsx` patterns.

- **TanStack Form (`@tanstack/react-form` 1.x)**
  - Template editor form for name + day slots.
  - Don't use `useForm<T>` generic (expects 12 type args). Let TS infer.
  - Use `any` type alias for field render props.

- **UI stack**
  - Tailwind v4 + shadcn/ui + Lucide + Sonner.
  - Template cards: `rounded-3xl`, soft shadows, shift type color chips.
  - Week grid: 7-column layout with day headers (Mon–Sun), rows for slots.
  - Shift type chips: colored circles/badges matching `ClinicShiftType.color`.
  - Empty state: "No templates yet — create your first week template" with dashed card CTA.
  - Clinique Zen aesthetic: generous spacing, teal accents for primary actions, Inter font.
  - AlertDialog for delete confirmation.
  - Sheet or Dialog for template creation/editing form.
  - DropdownMenu for template card actions (Edit, Duplicate, Delete).

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/planning/
  planning-template.schema.ts
  planning-template.schema.test.ts

apps/api/src/modules/planning/
  planning-template.service.ts
  planning-template.service.spec.ts

apps/web/src/app/[locale]/admin/planning/templates/
  page.tsx
  loading.tsx
  error.tsx
  _actions/
    template-actions.ts
  _hooks/
    useTemplates.ts
  _components/
    TemplateList.tsx
    TemplateEditor.tsx
    TemplateSlotForm.tsx
    TemplateWeekPreview.tsx
  __tests__/
    templates.spec.tsx
```

**Files to modify:**

- `apps/api/src/modules/planning/planning.module.ts` (add PlanningTemplateService to providers/exports)
- `apps/api/src/trpc/context.ts` (add `planningTemplateService: PlanningTemplateService` to TRPCServices)
- `apps/api/src/trpc/trpc.module.ts` (inject PlanningTemplateService)
- `apps/api/src/trpc/routers/planning.router.ts` (add 6 template procedures)
- `apps/api/src/trpc/routers/planning.router.spec.ts` (update procedure count, add mockPlanningTemplateService)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add `planningTemplates` query key)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` (add Templates nav link)
- `apps/web/src/i18n/langs/en.json` (add admin.planningTemplates namespace)
- `apps/web/src/i18n/langs/fr.json` (add admin.planningTemplates namespace)

**Structure constraints:**

- Keep all template web artifacts route-local under `app/[locale]/admin/planning/templates/*`.
- `PlanningTemplateService` is separate from `PlanningService` but lives in same module.
- Template data validation logic stays server-side — never duplicate in frontend (frontend validates shape only, server validates references).
- No new NestJS module — extend existing `PlanningModule`.

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**

- accept valid templateSlot with shiftTypeCode, requiredStaff >= 1
- reject templateSlot with empty shiftTypeCode
- reject templateSlot with requiredStaff < 1 or non-integer
- accept templateSlot with optional requiredJobTypes (valid enum values)
- reject templateSlot with invalid requiredJobTypes enum values
- accept valid templateDay with dayOfWeek 1-7 and slots array
- reject templateDay with dayOfWeek outside 1-7 range
- accept valid templateData with unique dayOfWeek values
- reject templateData with duplicate dayOfWeek values
- accept empty days array (minimal template)
- accept valid createTemplate with name and data
- reject createTemplate with empty name
- reject createTemplate with name exceeding 100 chars
- accept valid updateTemplate with id, name, data
- accept valid duplicateTemplate with uuid id
- reject duplicateTemplate with invalid uuid

**API service tests (Jest, `*.spec.ts`):**

- `createTemplate` creates record with correct clinicId and validated data
- `createTemplate` rejects invalid shiftTypeCode (not in clinic's ClinicShiftType records)
- `createTemplate` rejects duplicate dayOfWeek values in data
- `listTemplates` returns only templates for authenticated clinic
- `listTemplates` returns templates ordered by updatedAt desc
- `getTemplateById` returns template when clinicId matches
- `getTemplateById` throws NotFoundException for wrong clinic
- `updateTemplate` verifies clinic ownership before update
- `updateTemplate` validates shiftTypeCode references
- `deleteTemplate` verifies clinic ownership before deletion
- `deleteTemplate` throws NotFoundException for non-existent template
- `duplicateTemplate` creates copy with "(Copy)" suffix
- `duplicateTemplate` throws NotFoundException for wrong clinic template
- clinic isolation: cannot read/modify templates from another clinic

**tRPC router tests (Jest, `*.spec.ts`):**

- auth/subscription middleware stays correct (`subscribedProcedure`)
- ADMIN role can CRUD planning templates
- ADMIN role can duplicate templates
- EMPLOYEE role receives FORBIDDEN for template mutations
- input validation failures return typed tRPC errors
- router forwards `ctx.user.clinicId` for all operations

**Web tests (Vitest, `*.spec.tsx`):**

- template list renders empty state when no templates exist
- template list renders template cards with name and week preview
- template card shows action dropdown (edit, duplicate, delete)
- delete button triggers deletion with confirmation dialog
- duplicate button triggers duplication mutation
- editor renders 7-day grid with slot management
- slot form renders shift type dropdown and staff count input
- week preview renders shift type color chips correctly
- FR/EN rendering assertions for template labels and day names
- loading state renders skeleton

**Quality gates before PR (run from repository root):**

- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Stories 5.1-5.6) — EXHAUSTIVE

**Story 5.6 (Equity Counters Management):**
- Added `EquityCounterService` + `EquityCounterScheduler` to PlanningModule — Story 6.1 adds `PlanningTemplateService` following the same pattern.
- Established chart rendering with Recharts — template preview uses simple CSS grid, no chart library needed.
- Bug: shadcn Chart component stalled on interactive prompt — use components directly if needed.
- Nav link with improved path matching — follow the same pattern for `/admin/planning/templates`.

**Story 5.5 (Planning Assistance Rules):**
- Introduced `PlanningService` in `PlanningModule` — Story 6.1 adds `PlanningTemplateService` as a separate service in the same module.
- Established `planningRules` query key pattern in `QueryKeyFactory` — follow same pattern for `planningTemplates`.
- ShiftType CRUD in Settings with dropdown in planning rules — reuse `useClinicShiftTypes` hook and shift type dropdown pattern for template slot form.
- `validateShiftTypeCode` method in PlanningService — reuse the same validation pattern in PlanningTemplateService.
- **Debug fix**: Jest CLI flag is `--testPathPatterns` (plural), NOT `--testPathPattern`.
- `subscribedProcedure` composition is LOCAL in each router file.

**Story 5.4 (Monthly School Day Declaration):**
- `ScheduleModule.forRoot()` already imported — no cron needed for templates.
- Employee invitation flow irrelevant to templates.

**Story 5.3 (Clinic Configuration Hours & Days):**
- `ClinicConfig.workDays` — template editor can dim non-work-day columns (visual cue only, not enforced).
- `ClinicClosedDay` model — not relevant to templates (templates define ideal weeks, not specific dates).
- Replace-list pattern with `deleteMany` + `createMany` in `$transaction` — NOT needed for templates (single Json field, not child records).
- `staleTime: 0` + `refetchOnMount: "always"` pattern for settings hooks.
- `loading.tsx`, `error.tsx`, and `Skeleton` patterns established.

**Story 5.2 (Declarative Constraints):**
- Reset local form/panel state when dialogs close.
- NuqsAdapter context needed in tests for URL-synced components (not needed for templates unless URL state is used).

**Story 5.1 (Employee CRUD):**
- `Employee.contractHours` field — not directly used in templates but relevant for Story 6.2 constraint checking.
- `Employee.isActive` field — templates don't reference employees directly.
- `nuqs` for URL-synced filters — not needed for templates (simple list).
- `actionKeyFactory` does NOT exist in `zsa-react-query` — use `onSuccess` with `queryClient.invalidateQueries()`.
- `form.Subscribe` selector type error with TanStack Form v1.x — use `any` types.
- Toast messages must match action semantics.

**Cross-cutting learnings (ALL stories):**
- `placeholderData: (prev) => prev` prevents skeleton flash during refetch.
- Query keys should be specific (include template id for detail queries).
- Zod `.refine()` creates ZodEffects — use base schemas for `.merge()`.
- Always use `setRequestLocale(locale)` in every page and layout.
- Run `pnpm db:generate` from root after any schema-related changes.
- Test patterns: API = Jest `*.spec.ts`, Web = Vitest `*.spec.tsx`, Validators = Vitest `*.test.ts`.

### Git Intelligence Summary

Recent relevant commit trajectory:

- `1f12f368` — `Merge pull request #23 from yabafre/feature/story-5-6-equity-counters-management`
- `514fddea` — `fix(story-5-6): address code review findings (race condition, ClinicService DI, test assertions)`
- `155e26e9` — `feat(story-5-6): implement equity counters management`
- `d367d053` — `docs: mark story 5.5 planning assistance rules as done`
- `4e9dc615` — `Merge pull request #22 from yabafre/feature/story-5-5-planning-assistance-rules-configurable`

Actionable implications for Story 6.1:

- Story 5.6 review found race condition + ClinicService DI issues — ensure PlanningTemplateService properly injects ClinicService via PlanningModule imports (ClinicModule is already imported).
- Follow the established cross-layer implementation style: validators → service → router → server actions → hooks → UI → tests.
- PlanningTemplateService extends PlanningModule — follow the same injection pattern (add to providers + exports, register in TRPCServices).
- Loading/error/skeleton patterns established — apply consistently to the new templates route.
- Existing planning page (`admin/planning/page.tsx`) is a hardcoded demo prototype — Story 6.1 adds a `/templates` sub-route WITHOUT touching the existing prototype grid (that will be replaced in Story 6.3).

### Latest Tech Information (Context7 + Applied Skills)

- **Prisma Json field (Context7 `/prisma/docs`)**
  - `Json` type stores arbitrary JSON in PostgreSQL `jsonb` column.
  - Validation is application-side (Zod), not database-side.
  - Type safety via manual casting at service layer: `data as Prisma.InputJsonValue` on write, typed assertion on read.
  - For this story: validate template data shape in service layer before Prisma write.

- **NestJS Module Architecture (Context7 `/nestjs/docs.nestjs.com`)**
  - Add `PlanningTemplateService` to existing PlanningModule's `providers` and `exports` arrays.
  - Constructor injection: `private readonly prisma: PrismaService, private readonly clinicService: ClinicService`.
  - No `forwardRef` needed — PlanningModule already imports ClinicModule.

- **tRPC Router (Context7 `/websites/trpc_io`)**
  - Add 6 new procedures to existing `planning.router.ts`.
  - Follow existing `subscribedProcedure` + `adminOnly()` pattern.
  - Input validation via shared Zod schemas from `@pawly/validators`.

- **Turborepo (applied skill)**
  - No new dependencies needed (reuse existing stack).
  - Quality gates: `pnpm test`, `pnpm build`, `pnpm lint` from root.

- **Vercel/React Best Practices (applied skill)**
  - Template management page as RSC entry + client components for interactivity.
  - Keep form state in TanStack Form, server data in React Query (via Zsa).
  - Avoid data waterfalls: load templates + shift types in parallel.

- **Frontend Design (applied skill)**
  - Template cards: Clinique Zen aesthetic with `rounded-3xl`, soft shadows, generous spacing.
  - Week preview grid: 7 columns with colored chips matching ClinicShiftType colors.
  - Empty state: "No templates created yet" with dashed card CTA.
  - Template editor: visual week grid with add/remove slot buttons per day cell.
  - Use Sheet for template creation/editing (not a separate page — keep context).

- **NestJS Best Practices (applied skill)**
  - Keep service methods focused: one method per CRUD operation.
  - Use typed exceptions for predictable tRPC error mapping.
  - Constructor injection, avoid property injection.
  - Validate data integrity at service level (shiftTypeCode exists, requiredStaff valid).

- **Stripe Integration (applied skill — regression check)**
  - No payment changes in this story.
  - `subscribedProcedure` pattern unchanged.

### Project Structure Notes

- This story extends the `PlanningModule` with template CRUD capabilities. The existing `PlanningTemplate` Prisma model is already defined — no migration required.
- The template data will be consumed by Story 6.2's greedy generation algorithm. The structured `TemplateData` type is the contract: algorithm iterates `data.days`, for each day creates `Shift` records matching the slot requirements.
- The existing prototype planning page (`admin/planning/page.tsx`) uses hardcoded demo data. Story 6.1 adds a `/templates` sub-route without touching the prototype. The prototype will be replaced in Story 6.3 (Schedule Visualization) with real data from Story 6.2's algorithm.
- Admin navigation already has "Planning" and "Equity Counters" links. Add "Templates" as a new nav item. Consider grouping planning-related links: Planning (grid), Templates, Rules, Equity — or use sub-navigation within the planning section.
- The `ClinicShiftType` model provides the shift type vocabulary for templates. Templates reference codes like "SURGERY", "RECEPTION" — same codes used in planning rules (Story 5.5).

### References

- [Source: docs/planning-artifacts/epics.md#Epic 6: Story 6.1 Planning Template Definition]
- [Source: docs/planning-artifacts/prd.md#FR4 — Admins apply recurring rotation templates]
- [Source: docs/planning-artifacts/architecture.md#Data Flow, PlanningTemplate, Naming Patterns]
- [Source: docs/planning-artifacts/ux-design-specification.md#Admin Staff-Grid, Clinique Zen, Template Concepts]
- [Source: apps/api/prisma/schema/Planning.prisma#PlanningTemplate model (name, data Json, clinicId)]
- [Source: apps/api/prisma/schema/ShiftType.prisma#ClinicShiftType model (code, name, color, startTime, endTime)]
- [Source: apps/api/prisma/schema/Employee.prisma#JobType enum (VET, ASV, APPRENTICE)]
- [Source: apps/api/src/modules/planning/planning.module.ts#PlanningModule structure]
- [Source: apps/api/src/modules/planning/planning.service.ts#validateShiftTypeCode pattern]
- [Source: apps/api/src/trpc/context.ts#TRPCServices injection pattern]
- [Source: apps/api/src/trpc/routers/planning.router.ts#subscribedProcedure + ADMIN check pattern]
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts#QueryKeyFactory]
- [Source: apps/web/src/app/[locale]/admin/planning/page.tsx#Existing prototype (hardcoded demo)]
- [Source: docs/implementation-artifacts/5-5-planning-assistance-rules-configurable.md#PlanningService, ShiftType CRUD patterns]
- [Source: docs/implementation-artifacts/5-6-equity-counters-management.md#EquityCounterService injection pattern]
- [Source: docs/implementation-artifacts/sprint-status.yaml#development_status]

### Story Completion Status

- Story status: `review`.
- All 8 tasks and 31 subtasks completed.
- All acceptance criteria met.

## File List

**Files Created:**

- `packages/validators/src/planning/planning-template.schema.ts`
- `packages/validators/src/planning/planning-template.schema.test.ts`
- `apps/api/src/modules/planning/planning-template.service.ts`
- `apps/api/src/modules/planning/planning-template.service.spec.ts`
- `apps/web/src/app/[locale]/admin/planning/templates/page.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/loading.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/error.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/_actions/template-actions.ts`
- `apps/web/src/app/[locale]/admin/planning/templates/_hooks/useTemplates.ts`
- `apps/web/src/app/[locale]/admin/planning/templates/_components/TemplatesClient.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/_components/TemplateList.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/_components/TemplateEditor.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/_components/TemplateSlotForm.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/_components/TemplateWeekPreview.tsx`
- `apps/web/src/app/[locale]/admin/planning/templates/__tests__/templates.spec.tsx`
- `apps/web/src/components/ui/dropdown-menu.tsx` (shadcn)

**Files Modified:**

- `packages/validators/src/planning/index.ts` (template schema exports)
- `apps/api/src/modules/planning/planning.module.ts` (added PlanningTemplateService)
- `apps/api/src/trpc/context.ts` (added planningTemplateService to TRPCServices)
- `apps/api/src/trpc/trpc.module.ts` (injected PlanningTemplateService)
- `apps/api/src/trpc/routers/planning.router.ts` (6 template procedures)
- `apps/api/src/trpc/routers/planning.router.spec.ts` (17 new template tests)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (planningTemplates query key)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` (Templates nav link)
- `apps/web/src/i18n/langs/en.json` (admin.planningTemplates namespace)
- `apps/web/src/i18n/langs/fr.json` (admin.planningTemplates namespace)
- `docs/implementation-artifacts/sprint-status.yaml` (story status)
- `docs/implementation-artifacts/6-1-planning-template-definition-admin.md` (this file)

## Dev Agent Record

### Summary

Story 6.1 implemented: planning template CRUD infrastructure with PlanningTemplateService, validators, tRPC procedures, admin UI. All quality gates passed: pnpm test (1130 total: 328 validators, 408 API, 394 web) and pnpm build green. 92 new tests (35 validators + 19 API service + 17 API router + 21 web). Agent model: Claude Opus 4.6.

Code review fixes applied: DRY violation (JOB_TYPE_VALUES → import from validators), data validation added to duplicateTemplate, redundant dayOfWeek check removed from service, 3 hardcoded English strings replaced with i18n keys, aria-label for dropdown trigger, form validation announcements, 10 TemplateEditor tests added, FR deleteFailed typo fixed.

Debug log:
- Fixed `JOB_TYPES`/`JobType` export conflict between `employee` and `planning` validators — imported from employee instead of re-defining.
- Fixed `@testing-library/user-event` not installed in web — rewrote tests with `fireEvent`.
- Fixed translation mock: `useTranslations` mock returns keys not English text — updated test assertions.
- Installed missing `dropdown-menu` shadcn component via MCP shadcn tool.

### Files changed

See File List above for complete listing of created and modified files.

### Deviations

None recorded.

### Test output

pnpm test: 1130 tests passing (328 validators, 408 API, 394 web). pnpm build: green.
