# Story 5.1: Employee & Contract Management (CRUD)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an admin,
I want to manage employee profiles and their contract types,
So that the staff list is always up to date for scheduling.

## Acceptance Criteria

1. **Given** the employee management interface **When** I create a new employee with firstName, lastName, jobType, contractType, and contractHours **Then** the data is saved in the `Employee` model via Prisma **And** the employee is automatically associated with the authenticated user's `clinicId`.

2. **Given** the employee list page **When** I navigate to `/admin/employees` **Then** I see all employees belonging to my clinic **And** the list displays employee name, job type, contract type, contract hours, and active status **And** only employees for my `clinicId` are shown (multi-tenant isolation).

3. **Given** an existing employee **When** I click to edit their profile **Then** I can update any field (name, job type, contract type, hours, contact info, dates) **And** the changes are persisted in the database **And** the `clinicId` filter is enforced on the update query.

4. **Given** an existing employee **When** I deactivate them **Then** the employee's `isActive` field is set to `false` **And** deactivated employees are visually distinguished in the list **And** deactivated employees are excluded from scheduling but their historical data is preserved.

5. **Given** the employee form **When** I submit with invalid data (missing required fields, invalid email format) **Then** validation errors are displayed inline on each field **And** the form does NOT submit until all validation passes.

6. **Given** the entire feature **When** implemented **Then** all text is internationalized (FR/EN) via next-intl **And** the UI follows the "Clinique Zen" design system (shadcn/ui + Tailwind CSS v4) **And** the page is accessible (WCAG AA: semantic HTML, aria attributes, keyboard navigation).

7. **Given** the data flow **When** any CRUD operation is performed **Then** it follows the mandatory architecture: Component → Hook → Zsa → Server Action → tRPC → NestJS Service → Prisma **And** no shortcuts are taken (no direct tRPC calls from client components).

## Tasks

- [x] **Task 1: Enhance Prisma Employee Schema** (AC: #1, #4)
  - [x] 1.1 Add `ContractType` enum (`CDI`, `CDD`, `APPRENTICESHIP`) to `Employee.prisma`
  - [x] 1.2 Add fields to Employee model: `contractType`, `email`, `phone`, `hireDate`, `endDate`, `isActive`
  - [x] 1.3 Run `pnpm db:push` to sync schema
  - [x] 1.4 Run `pnpm db:generate` to regenerate Prisma client types

- [x] **Task 2: Create Zod Validators** (AC: #5)
  - [x] 2.1 Create `packages/validators/src/employee/` directory with `index.ts`
  - [x] 2.2 Create `employee.schema.ts` with: `createEmployeeSchema`, `updateEmployeeSchema`, `employeeIdSchema`, `listEmployeesSchema`
  - [x] 2.3 Export from `packages/validators/src/index.ts`
  - [x] 2.4 Write validator tests in `employee.schema.test.ts` (Vitest, `*.test.ts` pattern)

- [x] **Task 3: Create NestJS Employee Module** (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `apps/api/src/modules/employee/employee.module.ts`
  - [x] 3.2 Create `apps/api/src/modules/employee/employee.service.ts` with CRUD methods (all clinicId-scoped)
  - [x] 3.3 Register `EmployeeModule` in `AppModule`
  - [x] 3.4 Write service tests in `employee.service.spec.ts` (Jest, `*.spec.ts` pattern)

- [x] **Task 4: Create tRPC Employee Router** (AC: #7)
  - [x] 4.1 Create `apps/api/src/trpc/routers/employee.router.ts` with procedures: `list`, `getById`, `create`, `update`, `toggleActive`
  - [x] 4.2 Add `EmployeeService` to `TRPCServices` interface in `context.ts`
  - [x] 4.3 Inject `EmployeeModule` + `EmployeeService` in `trpc.module.ts`
  - [x] 4.4 Register `employeeRouter` in `_app.ts` root router
  - [x] 4.5 Write router integration tests

- [x] **Task 5: Create Server Actions** (AC: #7)
  - [x] 5.1 Create `apps/web/src/app/[locale]/admin/employees/_actions/employee-actions.ts`
  - [x] 5.2 Implement actions: `listEmployeesAction`, `getEmployeeAction`, `createEmployeeAction`, `updateEmployeeAction`, `toggleEmployeeActiveAction`

- [x] **Task 6: Create Custom Hooks** (AC: #7)
  - [x] 6.1 Create `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployees.ts`
  - [x] 6.2 Implement hooks: `useEmployees` (list query), `useEmployee` (single query), `useCreateEmployee`, `useUpdateEmployee`, `useToggleEmployeeActive`
  - [x] 6.3 Use existing `QueryKeyFactory.employees()` key (already defined in `server-action-hooks.ts`)

- [x] **Task 7: Create Employee List Page (RSC)** (AC: #2, #6)
  - [x] 7.1 Create `apps/web/src/app/[locale]/admin/employees/page.tsx` (Server Component with `generateMetadata`, `setRequestLocale`)
  - [x] 7.2 Create `_components/EmployeeList.tsx` (client component) with data table displaying employees
  - [x] 7.3 Create `_components/EmployeeCard.tsx` for individual employee display with job type badge and status indicator
  - [x] 7.4 Implement empty state with CTA to create first employee
  - [x] 7.5 Add search/filter by name and job type

- [x] **Task 8: Create Employee Form (Create/Edit)** (AC: #1, #3, #5)
  - [x] 8.1 Create `_components/EmployeeForm.tsx` using `@tanstack/react-form` with Zod validation
  - [x] 8.2 Create `_components/EmployeeDialog.tsx` (Dialog wrapper for form — create and edit modes)
  - [x] 8.3 Fields: firstName, lastName, email (optional), phone (optional), jobType (select), contractType (select), contractHours (number), hireDate (date picker), endDate (optional date picker)
  - [x] 8.4 Form-level validation via `createEmployeeSchema` / `updateEmployeeSchema`
  - [x] 8.5 Invalidate employee list queries on successful mutation

- [x] **Task 9: Employee Deactivation** (AC: #4)
  - [x] 9.1 Add toggle active/inactive action with confirmation dialog
  - [x] 9.2 Visual distinction for deactivated employees (muted styling, badge)
  - [x] 9.3 Filter toggle to show/hide inactive employees

- [x] **Task 10: i18n Translations** (AC: #6)
  - [x] 10.1 Add `employees` namespace keys to `apps/web/src/i18n/langs/en.json`
  - [x] 10.2 Add `employees` namespace keys to `apps/web/src/i18n/langs/fr.json`
  - [x] 10.3 Keys: page title, meta description, form labels, placeholders, buttons, error messages, empty state, confirmation dialogs, job type labels, contract type labels, status labels

- [x] **Task 11: Comprehensive Tests** (AC: all)
  - [x] 11.1 API: Employee service unit tests (Jest, `*.spec.ts`) — CRUD operations, multi-tenant isolation, edge cases
  - [x] 11.2 API: Employee tRPC router tests — procedure access control, input validation
  - [x] 11.3 Web: Employee page test (Vitest, `*.spec.tsx`) — SSR rendering, metadata
  - [x] 11.4 Web: EmployeeList component test — renders employees, handles empty state
  - [x] 11.5 Web: EmployeeForm component test — validation, submit, edit mode
  - [x] 11.6 Validators: Employee schema tests (Vitest, `*.test.ts`) — valid/invalid inputs, edge cases

## Dev Notes

### Architecture Compliance (NON-NEGOTIABLE)

**Mandatory Data Flow — NEVER deviate:**
```
Page (RSC) → Client Component → Custom Hook → Zsa Hook → Server Action → tRPC Client → NestJS Service → Prisma
```

**Key patterns to follow (reference implementations):**
- **tRPC Router pattern:** Follow `clinic.router.ts` — compose `protectedProcedure` and `subscribedProcedure` locally in the router file, NOT globally. Import `isAuthed` and `isSubscribed` from `../trpc`.
- **tRPC Service injection:** Add `EmployeeService` to `TRPCServices` interface in `context.ts`, import `EmployeeModule` and inject `EmployeeService` in `trpc.module.ts` constructor and `TRPCServices` object.
- **Server Action pattern:** Follow `apps/web/src/app/[locale]/pricing/_actions/checkout-actions.ts` — use `createServerAction()` from `zsa`, chain `.input()` and `.handler()`.
- **Hook pattern:** Follow `apps/web/src/app/[locale]/pricing/_hooks/useCheckout.ts` — wrap `useServerActionMutation` / `useServerActionQuery` from `server-action-hooks.ts`.
- **Form pattern:** Use `@tanstack/react-form` with Zod validators. Do NOT use `useForm<T>` generic (expects 12 type args). Let TypeScript infer. Reference: `PreCheckoutForm.tsx` in pricing.
- **State management:** Server state via Zsa hooks (React Query under the hood). NEVER use Zustand for server data. ALWAYS invalidate queries after mutations using `QueryKeyFactory.employees()`.

### Multi-Tenant Isolation (CRITICAL)

**Every single database query MUST filter by `clinicId`:**
```typescript
// CORRECT — always scope by clinicId
async findAll(clinicId: string) {
  return this.prisma.employee.findMany({
    where: { clinicId },
    orderBy: { lastName: 'asc' },
  });
}

// WRONG — never query without clinicId
async findAll() {
  return this.prisma.employee.findMany(); // SECURITY VULNERABILITY
}
```

The `clinicId` comes from `ctx.user.clinicId` in tRPC procedures (resolved from DB in context.ts, never from client input).

### Prisma Schema Enhancement Details

**Current Employee model** (`apps/api/prisma/schema/Employee.prisma`):
- Already has: `id`, `firstName`, `lastName`, `color`, `jobType` (VET/ASV/APPRENTICE), `contractHours`, `clinicId`, `userId`, relations to Shift/Absence/Unavailability
- Already has: `@@index([clinicId])` for performance

**Fields to ADD:**
```prisma
enum ContractType {
  CDI        // Permanent contract
  CDD        // Fixed-term contract
  APPRENTICESHIP  // Apprentice contract

  @@map("contract_type")
}

// Add to Employee model:
  email        String?   @map("email")
  phone        String?   @map("phone")
  contractType ContractType @default(CDI) @map("contract_type")
  hireDate     DateTime?    @map("hire_date")
  endDate      DateTime?    @map("end_date")
  isActive     Boolean      @default(true) @map("is_active")
```

**IMPORTANT — Naming conflict prevention:**
- Use `ContractType` for the enum name (no conflict with existing enums)
- Use `@@map("contract_type")` for DB column mapping as per Prisma conventions
- Check `Planning.prisma` for potential conflicts before adding enums (learned from `ClinicShiftType` conflict in Story 3.3)

### tRPC Router Procedures

| Procedure | Type | Middleware | Input Schema | Description |
|-----------|------|-----------|--------------|-------------|
| `employee.list` | query | subscribedProcedure | `listEmployeesSchema` (optional filters) | List all employees for clinic |
| `employee.getById` | query | subscribedProcedure | `employeeIdSchema` | Get single employee by ID |
| `employee.create` | mutation | subscribedProcedure | `createEmployeeSchema` | Create new employee |
| `employee.update` | mutation | subscribedProcedure | `updateEmployeeSchema` | Update employee data |
| `employee.toggleActive` | mutation | subscribedProcedure | `employeeIdSchema` | Toggle isActive flag |

All procedures use `subscribedProcedure` (requires auth + active subscription) since employee management is a paid feature behind the admin dashboard.

### Zod Schema Design

**CRITICAL — Avoid ZodEffects merging issue:**
Create base schemas as plain `z.object()` first, THEN merge if needed, THEN refine. Never `.merge()` a ZodEffects (result of `.refine()`).

```typescript
// Base fields (plain object, NOT refined)
const employeeFieldsSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  jobType: z.enum(['VET', 'ASV', 'APPRENTICE']),
  contractType: z.enum(['CDI', 'CDD', 'APPRENTICESHIP']),
  contractHours: z.number().int().min(1).max(48),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  hireDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Create schema = base + refine
export const createEmployeeSchema = employeeFieldsSchema.refine(
  (data) => {
    if (data.contractType !== 'CDI' && data.endDate && data.hireDate) {
      return new Date(data.endDate) > new Date(data.hireDate);
    }
    return true;
  },
  { message: 'End date must be after hire date', path: ['endDate'] }
);

// Update schema = base.partial() + id
export const updateEmployeeSchema = employeeFieldsSchema.partial().extend({
  id: z.string().uuid(),
});
```

### File Structure Requirements

**Files to CREATE:**

```
packages/validators/src/employee/
  ├── index.ts                          (barrel export)
  ├── employee.schema.ts                (Zod schemas)
  └── employee.schema.test.ts           (Vitest tests — *.test.ts pattern!)

apps/api/src/modules/employee/
  ├── employee.module.ts                (NestJS module)
  ├── employee.service.ts               (CRUD business logic)
  └── employee.service.spec.ts          (Jest tests — *.spec.ts pattern!)

apps/api/src/trpc/routers/
  └── employee.router.ts                (tRPC procedures)

apps/web/src/app/[locale]/admin/employees/
  ├── page.tsx                          (RSC entry point)
  ├── _actions/
  │   └── employee-actions.ts           (Server Actions with Zsa)
  ├── _hooks/
  │   └── useEmployees.ts               (Custom hooks wrapping Zsa)
  ├── _components/
  │   ├── EmployeeList.tsx              (Client: data table)
  │   ├── EmployeeCard.tsx              (Client: single employee card)
  │   ├── EmployeeForm.tsx              (Client: TanStack Form)
  │   └── EmployeeDialog.tsx            (Client: Dialog wrapper)
  └── __tests__/
      ├── employees-page.spec.tsx       (Vitest — *.spec.tsx)
      ├── employee-list.spec.tsx
      └── employee-form.spec.tsx
```

**Files to MODIFY:**

| File | Change | Reason |
|------|--------|--------|
| `apps/api/prisma/schema/Employee.prisma` | Add ContractType enum + new fields | Schema enhancement |
| `packages/validators/src/index.ts` | Add `export * from './employee'` | Barrel export |
| `apps/api/src/trpc/context.ts` | Add `employeeService: EmployeeService` to `TRPCServices` | Service injection |
| `apps/api/src/trpc/trpc.module.ts` | Import `EmployeeModule`, inject `EmployeeService` | DI registration |
| `apps/api/src/trpc/routers/_app.ts` | Add `employee: employeeRouter` | Router registration |
| `apps/api/src/app.module.ts` | Import `EmployeeModule` | Module registration |
| `apps/web/src/i18n/langs/en.json` | Add `employees` namespace | i18n English |
| `apps/web/src/i18n/langs/fr.json` | Add `employees` namespace | i18n French |

### Testing Requirements

**API Tests (Jest, `*.spec.ts`):**
- EmployeeService: test all CRUD methods
  - `create()`: valid input → creates employee with clinicId
  - `findAll()`: returns only employees for given clinicId
  - `findById()`: returns employee only if matching clinicId
  - `findById()`: returns null/throws for employee from different clinic
  - `update()`: updates fields, enforces clinicId match
  - `toggleActive()`: flips isActive, enforces clinicId match
  - Edge cases: duplicate handling, invalid jobType/contractType

**Web Tests (Vitest, `*.spec.tsx`):**
- Page test: SSR renders correctly, generates metadata
- EmployeeList: renders employee data, handles empty state, filters work
- EmployeeForm: validates required fields, submits valid data, handles errors
- For async Server Components: `const el = await Component(); render(el);`
- Mock `getTranslations` in vitest.setup.ts (already configured)

**Validator Tests (Vitest, `*.test.ts`):**
- Valid inputs pass all schemas
- Missing required fields rejected
- Invalid email format rejected
- contractHours range validated (1-48)
- endDate > hireDate validation for CDD/APPRENTICESHIP
- UUID format for employeeId

### Design System — "Clinique Zen" Aesthetic

**Employee List Page Layout:**
- Header: Page title + "Add Employee" primary CTA button
- Primary CTA: `bg-neutral-900 text-white rounded-xl font-bold` (NOT teal — teal is for text links only)
- Data table or card grid layout for employees
- Job type badges using semantic colors:
  - VET: `bg-indigo-50 border-indigo-100 text-indigo-700`
  - ASV: `bg-orange-50 border-orange-100 text-orange-700`
  - APPRENTICE: `bg-neutral-100 border-neutral-200 text-neutral-600`
- Status: Active = green dot, Inactive = grey dot with muted text
- Card style: `rounded-3xl border border-neutral-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]`

**Employee Form (Dialog):**
- shadcn/ui Dialog component for create/edit
- Input fields: `h-12` (48px) for touch-friendly targets
- Focus ring: `ring-[#009588]/20` (Vet Teal)
- Form validation: inline error messages with `role="alert"` and `aria-invalid`
- Submit button: `bg-neutral-900` (primary CTA pattern)

**Color assignments for employees:**
- Default `color` field value: `#3b82f6` (already in schema)
- Color picker or predefined palette for employee identification on planning grid

### i18n Translation Keys Structure

```json
{
  "employees": {
    "meta": {
      "title": "Employee Management - Pawly",
      "description": "Manage your clinic staff and contracts"
    },
    "page": {
      "title": "Employees",
      "subtitle": "Manage your team"
    },
    "actions": {
      "add": "Add Employee",
      "edit": "Edit",
      "deactivate": "Deactivate",
      "activate": "Activate",
      "save": "Save",
      "cancel": "Cancel"
    },
    "form": {
      "firstName": "First Name",
      "lastName": "Last Name",
      "email": "Email",
      "phone": "Phone",
      "jobType": "Job Type",
      "contractType": "Contract Type",
      "contractHours": "Weekly Hours",
      "color": "Calendar Color",
      "hireDate": "Hire Date",
      "endDate": "End Date",
      "createTitle": "New Employee",
      "editTitle": "Edit Employee"
    },
    "jobTypes": {
      "VET": "Veterinarian",
      "ASV": "Veterinary Assistant",
      "APPRENTICE": "Apprentice"
    },
    "contractTypes": {
      "CDI": "Permanent (CDI)",
      "CDD": "Fixed-term (CDD)",
      "APPRENTICESHIP": "Apprenticeship"
    },
    "status": {
      "active": "Active",
      "inactive": "Inactive"
    },
    "empty": {
      "title": "No employees yet",
      "description": "Add your first team member to start scheduling",
      "cta": "Add First Employee"
    },
    "confirm": {
      "deactivateTitle": "Deactivate Employee",
      "deactivateMessage": "This employee will be excluded from scheduling. Their historical data will be preserved.",
      "activateTitle": "Reactivate Employee",
      "activateMessage": "This employee will be included in scheduling again."
    },
    "toast": {
      "created": "Employee created successfully",
      "updated": "Employee updated successfully",
      "deactivated": "Employee deactivated",
      "activated": "Employee reactivated"
    },
    "validation": {
      "firstNameRequired": "First name is required",
      "lastNameRequired": "Last name is required",
      "invalidEmail": "Invalid email address",
      "hoursRange": "Hours must be between 1 and 48",
      "endDateAfterHire": "End date must be after hire date"
    }
  }
}
```

### Previous Story Intelligence

**Key learnings from previous stories (apply to this story):**

1. **Story 3-6 (Subscription Access Control):** `subscribedProcedure` middleware is composed LOCALLY in each router file — do NOT export it globally from `trpc.ts`. Pattern: `const subscribedProcedure = protectedProcedure.use(isSubscribed);` at the top of the router file. [Source: apps/api/src/trpc/routers/clinic.router.ts]

2. **Story 4-2 (Pricing Page):** `useServerActionMutation` from `zsa-react-query` is the correct hook for mutations. The `actionKeyFactory` parameter takes a function returning a cache key array. `QueryKeyFactory.employees()` is ALREADY defined in `server-action-hooks.ts`. [Source: apps/web/src/lib/hooks/server-action-hooks.ts:8]

3. **Story 3-3 (Onboarding):** For Prisma enum naming conflicts, always check existing enums before creating new ones. The `ShiftType` conflict was resolved using `ClinicShiftType` with `@@map`. Check `Planning.prisma` for potential `ContractType` conflicts.

4. **Story 4-1 (Landing Page):** For SSG/SSR pages: always `const { locale } = await params` (Promise in Next.js 15+), always call `setRequestLocale(locale)`. For admin pages (not SSG), the locale layout already provides `generateStaticParams`.

5. **@tanstack/react-form v1.x:** Do NOT use `useForm<T>` generic. Let TypeScript infer. Use `any` type alias for field render props if TypeScript complains.

6. **Zod .refine() creates ZodEffects:** Cannot `.merge()` ZodEffects. Create base schema (plain object) separately, then merge + refine. This is critical for the employee update schema.

### Git Intelligence

**Recent commit patterns (follow these conventions):**
```
feat(story-5-1): implement employee CRUD backend
feat(story-5-1): add employee validators and schemas
feat(story-5-1): create employee management UI
feat(story-5-1): add i18n translations for employees
test(story-5-1): add comprehensive employee tests
fix(story-5-1): address code review findings
```

**Current branch:** `feature/story-5-1-employee-contract-management-crud`

### Technical Versions (Verified via context7)

| Library | Version | Critical Notes |
|---------|---------|---------------|
| Prisma | 7.2.0 | Schema Folders pattern, `@@map()` for column names |
| NestJS | v11.x | `@Injectable()`, `@Module()`, constructor DI |
| tRPC | 11.9.0 | Middleware composition, typed context |
| @tanstack/react-form | v1.x | No `useForm<T>` generic, let TS infer |
| Zod | 4.x | Via `@pawly/zod` shared instance, `z.enum()` for enums |
| next-intl | Latest | `getTranslations`, `setRequestLocale`, ICU syntax |
| shadcn/ui | Latest | Tailwind CSS v4, Dialog, Button, Input, Badge, Card |
| Zsa | Latest | `createServerAction()`, `.input()`, `.handler()` |

### Performance Considerations (NFR9)

- **NFR9:** System must support up to 50 employees per clinic without performance degradation
- The `@@index([clinicId])` already exists on Employee model — ensures fast filtered queries
- Employee list should NOT use pagination initially (max 50 employees is small dataset)
- Consider implementing `useServerActionQuery` with staleTime for list caching

### Project Structure Notes

- All files align with the established monorepo structure
- No conflicts with existing admin routes (employees directory doesn't exist yet)
- `QueryKeyFactory.employees()` already defined — no modification needed to hooks setup
- Employee module follows the same pattern as Clinic module (the most similar reference implementation)

### References

- [Source: docs/planning-artifacts/epics.md] — Epic 5, Story 5.1 user story and acceptance criteria
- [Source: docs/planning-artifacts/architecture.md] — Data flow, tRPC patterns, Prisma conventions, multi-tenancy rules
- [Source: docs/planning-artifacts/prd.md] — FR1 (user management), FR3 (shift types/contract rules), NFR6 (multi-tenant isolation), NFR9 (50 employees)
- [Source: docs/planning-artifacts/ux-design.md] — Clinique Zen aesthetic, badge colors, form patterns, Staff-Grid employee display
- [Source: apps/api/prisma/schema/Employee.prisma] — Existing Employee model to enhance
- [Source: apps/api/src/trpc/routers/clinic.router.ts] — Reference router pattern (subscribedProcedure composition)
- [Source: apps/api/src/trpc/context.ts] — TRPCServices interface to extend
- [Source: apps/api/src/trpc/trpc.module.ts] — Module injection pattern to follow
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts] — QueryKeyFactory (employees key already exists)
- [Source: apps/web/src/app/[locale]/pricing/_actions/checkout-actions.ts] — Server Action reference pattern
- [Source: apps/web/src/app/[locale]/pricing/_hooks/useCheckout.ts] — Hook reference pattern

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

#### Debug Log References

- Fixed `form.Subscribe selector` type error — used `any` types for TanStack Form v1.x compatibility
- Fixed missing `endDate` in EmployeeCard type
- Fixed `queryKey` spread type mismatch — used `QueryKeyFactory.employees()` directly
- Removed invalid `actionKeyFactory` option from `useServerActionMutation` (also fixed pre-existing bug in `useCheckout.ts`)
- Resolved turbo cache issues masking stale builds — used `--force` flag

#### Completion Notes List

- All 11 tasks completed with 11/11 subtask groups done
- 605 total tests passing (194 API + 152 validators + 259 web)
- New tests: 37 validator + 33 API (16 service + 17 router) + 11 web component = 81 new tests
- Build passes with `--force` flag, `/[locale]/admin/employees` route visible as dynamic (ƒ)
- Multi-tenant isolation enforced on all 5 tRPC procedures (clinicId from ctx.user)
- Mandatory data flow respected: Component → Hook → Zsa → Server Action → tRPC → NestJS → Prisma
- Pre-existing bug fixed: removed `actionKeyFactory` from `useCheckout.ts` (not a valid option in zsa-react-query)
- i18n: 74 translation keys added for both FR and EN

#### Code Review Fixes Applied

- **CRITICAL #1**: Created missing `employee.router.spec.ts` (17 tests — auth guards, CRUD procedures, multi-tenant isolation, Zod validation)
- **CRITICAL #2**: Fixed search input placeholder using wrong i18n key (`filters.showInactive` → `filters.searchPlaceholder`)
- **HIGH #3**: Added toast notifications (sonner) to all 3 mutation hooks (create, update, toggleActive)
- **HIGH #4**: Fixed dialog race condition — removed premature `onOpenChange(false)` from EmployeeDialog, added `onSuccess` callback in EmployeeList
- **HIGH #5**: Added missing validation error display for email, contractHours, and endDate fields in EmployeeForm
- **HIGH #6**: Fixed CDI contract endDate validation — CDI contracts now skip endDate>hireDate check in Zod schema
- **MEDIUM #9**: Removed `as any` type casts in EmployeeList mutation handlers
- **MEDIUM #10**: Added 4 boundary tests (lastName max 50, phone max 20, CDI endDate bypass, CDD endDate rejection)

## File List

**Created:**
- `packages/validators/src/employee/index.ts`
- `packages/validators/src/employee/employee.schema.ts`
- `packages/validators/src/employee/employee.schema.test.ts`
- `apps/api/src/modules/employee/employee.module.ts`
- `apps/api/src/modules/employee/employee.service.ts`
- `apps/api/src/modules/employee/employee.service.spec.ts`
- `apps/api/src/trpc/routers/employee.router.ts`
- `apps/api/src/trpc/routers/employee.router.spec.ts` *(added during code review)*
- `apps/web/src/app/[locale]/admin/employees/page.tsx`
- `apps/web/src/app/[locale]/admin/employees/_actions/employee-actions.ts`
- `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployees.ts`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeList.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeCard.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeForm.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeDialog.tsx`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employees-page.spec.tsx`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employee-list.spec.tsx`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employee-form.spec.tsx`

**Modified:**
- `apps/api/prisma/schema/Employee.prisma` — Added ContractType enum + 6 new fields
- `packages/validators/src/index.ts` — Added employee export
- `packages/validators/src/employee/employee.schema.ts` — Fixed CDI endDate validation *(code review fix)*
- `apps/api/src/trpc/context.ts` — Added EmployeeService to TRPCServices
- `apps/api/src/trpc/trpc.module.ts` — Injected EmployeeModule + EmployeeService
- `apps/api/src/trpc/routers/_app.ts` — Registered employee router
- `apps/api/src/app.module.ts` — Imported EmployeeModule
- `apps/web/src/i18n/langs/en.json` — Added employees namespace (74 keys) + searchPlaceholder
- `apps/web/src/i18n/langs/fr.json` — Added employees namespace (74 keys) + searchPlaceholder
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeList.tsx` — Fixed search placeholder, dialog state, removed type casts *(code review fix)*
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeForm.tsx` — Added validation error display *(code review fix)*
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeDialog.tsx` — Removed premature dialog close *(code review fix)*
- `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployees.ts` — Added toast notifications *(code review fix)*
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — Added employees nav item
- `apps/web/src/app/[locale]/pricing/_hooks/useCheckout.ts` — Fixed pre-existing actionKeyFactory bug
- `apps/web/src/app/[locale]/pricing/__tests__/use-checkout.spec.ts` — Updated tests for actionKeyFactory removal
- `docs/implementation-artifacts/sprint-status.yaml` — Updated story status
- `apps/web/src/lib/trpc/client.ts` — Added `fetchWithRetry` wrapper with exponential backoff to handle ECONNREFUSED race condition at dev startup *(post-story fix)*
- `apps/web/src/app/[locale]/layout.tsx` — Added `NuqsAdapter` to provider tree for URL state management *(post-story fix)*
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeList.tsx` — Replaced `useState` with nuqs `useQueryState` for search/jobType/showInactive filters to fix input focus loss *(post-story fix)*
- `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployees.ts` — Added `placeholderData: (prev) => prev` to prevent loading skeleton during refetch + fixed queryKey type cast *(post-story fix)*
- `apps/web/package.json` — Added `nuqs` dependency *(post-story fix)*

