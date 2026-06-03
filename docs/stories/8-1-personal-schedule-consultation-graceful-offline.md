# Story 8.1: Personal Schedule Consultation (Graceful Offline)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an employee,
I want to consult my personal schedule on my phone even without internet connection,
so that I know my work hours at any time and can plan my life accordingly.

## Acceptance Criteria

1. **Given** an employee logged in via Magic Link **When** I access the schedule page at `/dashboard/schedule` **Then** I see my personal monthly schedule displayed as a vertical mobile-first timeline with day cards showing shift type (code, color, icon), time range (startTime–endTime), and break minutes.
2. **Given** the schedule timeline **When** I navigate between months **Then** I can use a month selector (current ± 2 months) to view past and upcoming schedules, and the selected month persists across page navigation.
3. **Given** the schedule page **When** data is loaded **Then** a weekly hours summary card shows: total hours for the current week, contract hours target, a visual progress bar, and the number of shifts for the week.
4. **Given** the schedule page **When** a shift has `isConfirmed: true` **Then** it displays a green "Confirmed" badge. **When** `isConfirmed: false` for a past or today's shift **Then** it displays an orange "Not confirmed" badge.
5. **Given** the schedule page **When** a day has an unavailability (VACATION, SICK, SCHOOL, OTHER) **Then** it displays an absence card with the appropriate color and icon instead of a shift card, following the same patterns as the admin StaffGrid absence cells.
6. **Given** the schedule page **When** the current month is PUBLISHED (via PlanningPeriodStatus) **Then** a "Published" badge is shown on the month header with the publication date. **When** DRAFT **Then** a "Draft — subject to change" notice is shown.
7. **Given** the Pawly PWA **When** the device is offline **Then** the last cached version of the schedule is displayed from React Query persistent cache + service worker cache, and a visible "Offline Mode — Showing cached data" banner with a `WifiOff` icon is shown at the top of the page.
8. **Given** the PWA is offline **When** the device regains connectivity **Then** the offline banner disappears, data is automatically refreshed via React Query refetch, and a brief "Back online" toast confirms reconnection.
9. **Given** the PWA **When** the app is installed or first loaded **Then** a `manifest.webmanifest` provides app metadata (name: "Pawly", short_name: "Pawly", theme_color: #009588, background_color: #FDFDFD, display: standalone, icons) and a service worker registers for offline caching.
10. **Given** the service worker **When** API responses for schedule data are received **Then** they are cached using a NetworkFirst strategy (3s timeout fallback to cache) with a 24-hour expiration. Static assets use CacheFirst strategy.
11. **Given** the employee dashboard **When** I view my schedule **Then** all data is strictly filtered to my `employeeId` and `clinicId` — I can only see my own shifts, not other employees'. The backend tRPC procedure enforces this server-side.
12. **Given** FR/EN locales **When** I use the schedule feature **Then** all labels (day names, shift types, month names, status badges, offline indicators) are translated, the interface follows "Clinique Zen" mobile aesthetic with WCAG AA compliance, and touch targets are >= 44px.

## Tasks

- [x] Task 1: PWA Foundation — manifest & service worker setup (AC: #9, #10)
  - [x] 1.1 Install `@serwist/next` and `serwist` in `apps/web` package
  - [x] 1.2 Create `apps/web/public/manifest.webmanifest` with Pawly branding (name, icons, theme_color #009588, background_color #FDFDFD, display: standalone, start_url: "/dashboard")
  - [x] 1.3 Create PWA icons (192x192, 512x512) in `apps/web/public/icons/`
  - [x] 1.4 Create service worker source `apps/web/src/app/sw.ts` with @serwist/next worker — precache entries + runtime caching (NetworkFirst for `/trpc/*` schedule endpoints with 3s timeout + 24h expiration, CacheFirst for static assets, StaleWhileRevalidate for employee profile data)
  - [x] 1.5 Update `apps/web/next.config.ts` to chain `withSerwistInit` with existing `withNextIntl` — swSrc: "src/app/sw.ts", swDest: "public/sw.js". Verify `reloadOnOnline` option exists in @serwist/next v9.5.6 before using it — fallback to manual `online` event listener if unavailable
  - [x] 1.6 Add `<link rel="manifest">` and PWA meta tags in `apps/web/src/app/[locale]/layout.tsx`
  - [x] 1.7 Create offline fallback page `apps/web/src/app/[locale]/~offline/page.tsx` — simple "You are offline" message with Pawly branding, cached in both locales
  - [x] 1.8 Add `"webworker"` to `apps/web/tsconfig.json` `lib` array for service worker TypeScript type support: `"lib": ["dom", "dom.iterable", "esnext", "webworker"]`
  - [x] 1.9 Verify service worker registration in dev and build modes

- [x] Task 2: React Query offline persistence (AC: #7, #8)
  - [x] 2.1 Install `@tanstack/react-query-persist-client@^5.90.20` and `@tanstack/query-sync-storage-persister@^5.90.20` in `apps/web` (MUST match existing `@tanstack/react-query@^5.90.20`)
  - [x] 2.2 Create `apps/web/src/lib/query-persist.ts` — createSyncStoragePersister with localStorage, optional lz-string compression
  - [x] 2.3 Create a NEW `"use client"` component `apps/web/src/app/[locale]/dashboard/_components/DashboardQueryProvider.tsx` that wraps children with `PersistQueryClientProvider` + `networkMode: 'offlineFirst'`, `gcTime: 24h`, `maxAge: 24h`. **IMPORTANT**: `dashboard/layout.tsx` is an RSC (uses `await cookies()`, `redirect()`) — it CANNOT directly contain `PersistQueryClientProvider`. The RSC layout must render this client wrapper component which then wraps `{children}`.
  - [x] 2.4 Create `apps/web/src/components/OfflineBanner.tsx` — global banner component using `navigator.onLine` + `online`/`offline` event listeners, displays "Offline Mode — Showing cached data" with `WifiOff` icon, Clinique Zen styling
  - [x] 2.5 Create `apps/web/src/components/OnlineRestoreToast.tsx` — brief toast on reconnection ("Back online") using sonner
  - [x] 2.6 Integrate OfflineBanner in `DashboardLayoutClient.tsx` — position it between `<nav>` and `<main>` elements (sticky top, below nav as per UX spec)

- [x] Task 3: Backend — Employee schedule read procedure (AC: #1, #4, #5, #6, #11)
  - [x] 3.1 Create `apps/api/src/modules/planning/employee-schedule.service.ts` with `@Injectable()` and PrismaService injection
  - [x] 3.2 Implement `getEmployeeSchedule(clinicId, employeeId, month)` — fetch shifts for the employee+month with `include: { employee: true }`, fetch unavailabilities (one-time + recurring expanded — **ONLY `Unavailability` model with `UnavailabilityType` enum, NOT the `Absence` model**), fetch PlanningPeriodStatus for publication state (**default to DRAFT if no row exists for the month**), fetch ClinicShiftType for colors, compute weekly hours summary. All queries filtered by BOTH clinicId AND employeeId. **Serialize `Shift.date` (Prisma `DateTime`) to `"YYYY-MM-DD"` string in the response using native JS `formatDateYMD()` (no date-fns in API).**
  - [x] 3.3 Implement `getEmployeeShiftTypes(clinicId)` — returns ClinicShiftType list. **Note: the Prisma field is `name` (NOT `label`)**. Map `name → label` in the service response for frontend consistency.
  - [x] 3.4 Register `EmployeeScheduleService` in `planning.module.ts` providers AND exports
  - [x] 3.5 Create `apps/api/src/trpc/routers/employee-schedule.router.ts` with 2 procedures:
    - `getMySchedule` (subscribedProcedure, query) — **`ctx.user` does NOT have `employeeId`** (see Critical Discovery below). Must perform a DB lookup: `ctx.prisma.user.findUnique({ where: { id: ctx.user.sub }, select: { employee: { select: { id: true } } } })` to resolve employeeId. Throw `FORBIDDEN` if no linked employee. Calls `employeeScheduleService.getEmployeeSchedule`
    - `getMyShiftTypes` (subscribedProcedure, query) — calls `employeeScheduleService.getEmployeeShiftTypes`
    - **IMPORTANT**: Define `subscribedProcedure` locally in the router file (it is NOT exported from `trpc.ts`): `const protectedProcedure = publicProcedure.use(isAuthed); const subscribedProcedure = protectedProcedure.use(isSubscribed);`
  - [x] 3.6 Add `employeeScheduleService: EmployeeScheduleService` to `TRPCServices` in `context.ts`
  - [x] 3.7 Inject `EmployeeScheduleService` in BOTH `TRPCMiddleware` and `TRPCService` constructors in `trpc.module.ts`
  - [x] 3.8 Add `employeeSchedule: employeeScheduleRouter` to `_app.ts`

- [x] Task 4: Create Zod validators and @pawly/types (AC: #1, #2)
  - [x] 4.1 Create `packages/validators/src/planning/employee-schedule.schema.ts`:
    - `getEmployeeScheduleSchema` (month?: YYYY-MM regex, defaults to current month)
    - `employeeScheduleDataSchema` — typed response: shifts, unavailabilities, publicationStatus, weeklySummary, shiftTypes
  - [x] 4.2 Export from `packages/validators/src/planning/index.ts`
  - [x] 4.3 Create types in `packages/types/src/planning/employee-schedule.types.ts`:
    - `EmployeeScheduleData` — main response type (see Data Shape section)
    - `EmployeeShift` — individual shift for employee view (extends concept from existing `ShiftData` but adds `isConfirmed`, `breakMinutes`)
    - `EmployeeUnavailability` — expanded unavailability entry (uses `UnavailabilityType` values: SCHOOL, VACATION, SICK, OTHER — NOT `AbsenceType`)
    - `EmployeeWeeklySummary` — weekly hours summary
    - `EmployeeShiftTypeInfo` — shift type color/icon mapping (field `label` mapped from Prisma `ClinicShiftType.name`)
  - [x] 4.4 Export new types from `packages/types/src/planning/index.ts` and verify they're accessible via `import { ... } from "@pawly/types"`
  - [x] 4.5 Write validator tests in `packages/validators/src/planning/employee-schedule.schema.test.ts`

- [x] Task 5: Create server actions and hooks (AC: #1, #2, #7)
  - [x] 5.1 Create `apps/web/src/app/[locale]/dashboard/schedule/_actions/schedule-actions.ts` with `"use server"`:
    - `getMyScheduleAction` → `trpc.employeeSchedule.getMySchedule.query(input)`
    - `getMyShiftTypesAction` → `trpc.employeeSchedule.getMyShiftTypes.query()`
  - [x] 5.2 Add QueryKeyFactory entries in `server-action-hooks.ts`:
    - `mySchedule: (month?: string) => ["my-schedule", month ?? "current"]`
    - `myShiftTypes: () => ["my-shift-types"]`
  - [x] 5.3 Create `apps/web/src/app/[locale]/dashboard/schedule/_hooks/useMySchedule.ts`:
    - `useMySchedule(month?)` — `useServerActionQuery` with `staleTime: 5min`, `gcTime: 24h`, `networkMode: 'offlineFirst'`, `placeholderData: (prev) => prev`
    - `useMyShiftTypes()` — `useServerActionQuery` with `staleTime: 1h`, `gcTime: 7d`

- [x] Task 6: Build schedule page UI components (AC: #1, #2, #3, #4, #5, #6, #12)
  - [x] 6.1 Create RSC page `apps/web/src/app/[locale]/dashboard/schedule/page.tsx` — `setRequestLocale(locale)` + render `<SchedulePageClient />`
  - [x] 6.2 Create `loading.tsx` (skeleton: month header + 5 day card skeletons)
  - [x] 6.3 Create `_components/SchedulePageClient.tsx` — orchestrator with month state, renders: MonthSelector → PublicationBadge → WeeklySummaryCard → ScheduleTimeline
  - [x] 6.4 Create `_components/MonthSelector.tsx` — month selector (current ± 2 months) with chevron navigation, locale-aware month names via `useFormattedDate`, `aria-label` for accessibility
  - [x] 6.5 Create `_components/WeeklySummaryCard.tsx` — dark card (bg-neutral-900 text-white) with current week hours, progress bar (contract hours target), shift count. Follow existing DashboardClient weekly hours card pattern.
  - [x] 6.6 Create `_components/PublicationBadge.tsx` — PUBLISHED: green badge with date. DRAFT: orange "Subject to change" notice.
  - [x] 6.7 Create `_components/ScheduleTimeline.tsx` — vertical timeline grouping shifts by day, "Today" highlighted with pulse dot. Renders ShiftDayCard for each day.
  - [x] 6.8 Create `_components/ShiftDayCard.tsx` — individual day card: date header, shift type badge (color from ClinicShiftType), time range, break minutes, confirmation status badge (green confirmed / orange unconfirmed). Touch target >= 44px.
  - [x] 6.9 Create `_components/AbsenceDayCard.tsx` — displays `Unavailability` records ONLY (NOT `Absence` model). Uses `UnavailabilityType` enum values: VACATION (emerald/Plane), SICK (rose/Thermometer), SCHOOL (purple/GraduationCap), OTHER (neutral). **Do NOT confuse with `AbsenceType` enum** (PAID_LEAVE, SICK_LEAVE, TRAINING, CHILD_SICK, OTHER) from the Absence model — those are a separate concern. Import `EmployeeUnavailability` type from `@pawly/types`.
  - [x] 6.10 Create `_components/EmptyState.tsx` — "No shifts scheduled for this month" message
  - [x] 6.11 Add route to dashboard navigation in `DashboardLayoutClient.tsx`: `{ href: "/dashboard/schedule", icon: CalendarDays, labelKey: "schedule" as const }` — **MUST include `as const`** to match existing nav items TypeScript narrowing pattern (see lines 18-20 of `DashboardLayoutClient.tsx`)

- [x] Task 7: Connect existing DashboardClient to real data (AC: #1, #3)
  - [x] 7.1 Replace hardcoded demo data in `DashboardClient.tsx` with real shift data from `useMySchedule` hook (today's shift, upcoming days preview, weekly hours)
  - [x] 7.2 Wire confirmation button to display actual `isConfirmed` status from backend (read-only for Story 8.1 — confirmation mutation is Story 8.2)
  - [x] 7.3 Show employee's actual name from EmployeeContext or auth data (replace hardcoded "Julie")

- [x] Task 8: i18n translations (AC: #12)
  - [x] 8.1 Add `dashboard.schedule.*` namespace in FR with ~40 keys: title, monthSelector (label, months), weeklySummary (title, hours, shifts, target, progress), publicationStatus (published, publishedAt, draft, draftNotice), timeline (today, noShifts, shift, absence), shiftStatus (confirmed, notConfirmed), offline (banner, backOnline), errors (loadFailed, retry)
  - [x] 8.2 Add matching EN keys
  - [x] 8.3 Add `dashboard.nav.schedule` key: FR = "Mon planning", EN = "My Schedule"

- [x] Task 9: Tests (AC: all)
  - [x] 9.1 Validator tests: `packages/validators/src/planning/employee-schedule.schema.test.ts` — input validation, response schema (67 tests)
  - [x] 9.2 Service tests: `apps/api/src/modules/planning/employee-schedule.service.spec.ts` — schedule retrieval, unavailability expansion, publication status, weekly summary, clinic isolation, employee isolation (20 tests)
  - [x] 9.3 Router tests: `apps/api/src/trpc/routers/employee-schedule.router.spec.ts` — auth/subscription guards, employee self-access only (no ADMIN override), input validation (12 tests)
  - [x] 9.4 Page + component tests: `apps/web/src/app/[locale]/dashboard/schedule/__tests__/schedule-page.spec.tsx` — timeline rendering, month navigation, publication badge, shift cards, absence cards, weekly summary, offline banner, FR/EN assertions (25 tests)
  - [x] 9.5 Offline tests: OfflineBanner renders when navigator.onLine = false, disappears on reconnection
  - [x] 9.6 Root quality gates: `pnpm test` and `pnpm build` green

- [x] Task 10: Build verification and quality gates
  - [x] 10.1 Run `pnpm db:generate` — passed
  - [x] 10.2 Run `pnpm build` — passed (service worker generated, manifest present, 5 tasks successful)
  - [x] 10.3 Run `pnpm test` — all 2061 tests passing (656 validators + 726 API + 679 web)
  - [x] 10.4 Verify service worker caches schedule API responses
  - [x] 10.5 Verify offline mode displays cached schedule

## Dev Notes

### Critical Discovery: Employee Dashboard Has DEMO Data Only

The current `DashboardClient.tsx` at `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` contains **hardcoded demo data** (lines 26-32):
```typescript
const todayScheduleStart = new Date(2024, 9, 13, 8, 30);
const todayScheduleEnd = new Date(2024, 9, 13, 18, 30);
const upcomingDays = [
    { date: new Date(2024, 9, 14), type: "rest" as const, ... },
    { date: new Date(2024, 9, 15), type: "surgery" as const, ... },
    { date: new Date(2024, 9, 16), type: "vacation" as const, ... },
];
```

The employee name is hardcoded as "Julie" (line 41). The confirmation button (lines 99-110) uses `useState(false)` — purely client-side, no backend call.

**Story 8.1 MUST:**
- Replace demo data with real shift data from the new `getMySchedule` tRPC procedure
- Wire the employee name from EmployeeContext or auth data
- Display actual `isConfirmed` status (read-only — confirmation mutation is Story 8.2)

### Critical Discovery: No PWA Infrastructure Exists

**No PWA files exist in the codebase:**
- No `manifest.json` or `manifest.webmanifest`
- No service worker files
- No `@serwist/next` or `next-pwa` in dependencies
- `next.config.ts` only has `withNextIntl` — no PWA plugin

**Entire PWA foundation must be built from scratch in Task 1.**

### Critical Discovery: No Employee-Facing Schedule Procedure

All planning tRPC procedures are ADMIN-only (checked in `planning.router.ts`). **A new employee-facing procedure is needed** that:
- Returns only the authenticated employee's shifts
- Includes unavailabilities, publication status, and shift type metadata
- Does NOT expose other employees' data
- Uses `subscribedProcedure` (NOT `adminOnly`)

### Critical Discovery: `AuthenticatedUser` Has NO `employeeId` Field

The `AuthenticatedUser` type from `@pawly/types` (`packages/types/src/auth/auth.types.ts`) is:
```typescript
export interface AuthenticatedUser {
  email: string;
  sub: string;       // JWT subject (user ID)
  role: Role;
  clinicId: string;
  // NO employeeId field!
}
```

The `createContext` function in `apps/api/src/trpc/context.ts` sets `user = { sub, email, role, clinicId }` from JWT — no `employeeId`.

**How `employeeId` is actually resolved** (see `auth.router.ts` line 13-21):
```typescript
const user = await ctx.prisma.user.findUnique({
  where: { id: ctx.user.sub },
  select: { employee: { select: { id: true, jobType: true } } },
});
return { employeeId: user?.employee?.id ?? null, ... };
```

**The `getMySchedule` procedure MUST do its own DB lookup** to resolve `employeeId` from `ctx.user.sub`. NEVER assume `ctx.user.employeeId` exists — it will be `undefined` and throw at runtime.

### Architecture Compliance

**Data Flow (Non-Negotiable):**
```
SchedulePageClient
  └─ useMySchedule(month) → getMyScheduleAction → trpc.employeeSchedule.getMySchedule
  └─ useMyShiftTypes() → getMyShiftTypesAction → trpc.employeeSchedule.getMyShiftTypes
```

**Employee Isolation Pattern (CRITICAL):**

**`AuthenticatedUser` from `@pawly/types` has NO `employeeId` field** — it only contains `{ email, sub, role, clinicId }`. The `employeeId` must be resolved via a DB lookup using `ctx.user.sub`, exactly as `auth.router.ts` does in its `getMe` procedure.

```typescript
// In employee-schedule.router.ts
import { TRPCError } from '@trpc/server';
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
import { getEmployeeScheduleSchema } from '@pawly/validators';

// MUST define locally — subscribedProcedure is NOT exported from trpc.ts
const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);

export const employeeScheduleRouter = router({
  getMySchedule: subscribedProcedure
    .input(getEmployeeScheduleSchema)
    .query(async ({ input, ctx }) => {
      // Resolve employeeId via DB lookup — ctx.user has NO employeeId field
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.sub },
        select: { employee: { select: { id: true } } },
      });
      if (!user?.employee?.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No linked employee account' });
      }
      return ctx.employeeScheduleService.getEmployeeSchedule(
        ctx.user.clinicId,
        user.employee.id,  // ← from DB lookup, never from input
        input.month,
      );
    }),

  getMyShiftTypes: subscribedProcedure
    .query(async ({ ctx }) => {
      return ctx.employeeScheduleService.getEmployeeShiftTypes(ctx.user.clinicId);
    }),
});
```

**Module Registration Pattern (CRITICAL — 4 files to modify):**
1. `apps/api/src/modules/planning/planning.module.ts` — add `EmployeeScheduleService` to providers AND exports
2. `apps/api/src/trpc/context.ts` — add `employeeScheduleService: EmployeeScheduleService` to `TRPCServices` interface
3. `apps/api/src/trpc/trpc.module.ts` — inject `EmployeeScheduleService` in BOTH `TRPCMiddleware` AND `TRPCService` constructors (double-registration pattern)
4. `apps/api/src/trpc/routers/_app.ts` — add `employeeSchedule: employeeScheduleRouter`

### PWA Architecture — @serwist/next Integration

**Library:** `@serwist/next` v9.5.6 + `serwist` v9.5.6

**next.config.ts chaining pattern:**
```typescript
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // NOTE: Verify `reloadOnOnline` exists in @serwist/next v9.5.6 API.
  // If not available, handle reload via `online` event listener in OfflineBanner.
  reloadOnOnline: true,
  additionalPrecacheEntries: [
    { url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID() },
    { url: "/en/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID() },
  ],
});
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
// withNextIntl wraps first (inner), withSerwist wraps last (outer)
export default withSerwist(withNextIntl(nextConfig));
```

**TypeScript Service Worker Support:**
Add `"webworker"` to `apps/web/tsconfig.json` `lib` array:
```json
"lib": ["dom", "dom.iterable", "esnext", "webworker"]
```

**Service Worker caching strategy:**
```typescript
// sw.ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Schedule API data — NetworkFirst with 3s timeout, 24h cache
    {
      urlPattern: /\/trpc\/.*schedule/i,
      handler: new NetworkFirst({
        cacheName: 'schedule-api-cache',
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86400 })],
      }),
    },
    // Employee data — StaleWhileRevalidate
    {
      urlPattern: /\/trpc\/.*employee/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'employee-api-cache' },
    },
    ...defaultCache,  // Serwist defaults for static assets
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});
serwist.addEventListeners();
```

### React Query Offline Persistence

**New dependencies (MUST match existing `@tanstack/react-query@^5.90.20`):**
- `@tanstack/react-query-persist-client@^5.90.20`
- `@tanstack/query-sync-storage-persister@^5.90.20`

**Pattern:**
```typescript
// lib/query-persist.ts
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const queryPersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
});
```

**CRITICAL: `PersistQueryClientProvider` Must Be in a `"use client"` Component**

The `dashboard/layout.tsx` is a React Server Component (uses `await cookies()`, `redirect()`). It CANNOT directly contain `PersistQueryClientProvider`. Create a dedicated client wrapper:

```typescript
// apps/web/src/app/[locale]/dashboard/_components/DashboardQueryProvider.tsx
"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClient } from "@tanstack/react-query";
import { queryPersister } from "@/lib/query-persist";
import { useState } from "react";

export function DashboardQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 24 * 60 * 60 * 1000, // 24h for offline cache
        networkMode: 'offlineFirst',
      },
    },
  }));

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 86400000 }}
      onSuccess={() => queryClient.resumePausedMutations()}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

Then in `dashboard/layout.tsx` (RSC), wrap children:
```typescript
// Inside the RSC layout return:
<DashboardQueryProvider>
  <DashboardLayoutClient>{children}</DashboardLayoutClient>
</DashboardQueryProvider>
```

**Key config for schedule hooks:**
- `networkMode: 'offlineFirst'` — serve cached data immediately, update in background
- `gcTime: 24 * 60 * 60 * 1000` (24h) — keep cache for offline access
- `staleTime: 5 * 60 * 1000` (5min) — refetch interval when online

### Employee Schedule Data Shape — `@pawly/types`

All types below MUST be created in `packages/types/src/planning/employee-schedule.types.ts` and exported via `packages/types/src/planning/index.ts` → `packages/types/src/index.ts`, so they are importable as `import { EmployeeScheduleData, ... } from "@pawly/types"`.

The existing `Employee` interface from `@pawly/types` (in `employee/employee.types.ts`) provides `{ id, firstName, lastName, jobType, contractHours, color }` — reuse it as a Pick for the employee field.

```typescript
// packages/types/src/planning/employee-schedule.types.ts
import type { Employee } from "../employee/employee.types";

/** Main response from getMySchedule procedure */
export interface EmployeeScheduleData {
  month: string;                        // "YYYY-MM"
  employee: Pick<Employee, "id" | "firstName" | "lastName" | "jobType" | "contractHours" | "color">;
  shifts: EmployeeShift[];              // Only this employee's shifts
  unavailabilities: EmployeeUnavailability[];  // Expanded (one-time + recurring)
  publicationStatus: {
    status: "DRAFT" | "PUBLISHED";      // Prisma PlanningPeriodStatusType enum — default DRAFT if no row
    publishedAt: string | null;         // ISO date string or null
  };
  weeklySummary: EmployeeWeeklySummary[];  // Computed server-side
  shiftTypes: EmployeeShiftTypeInfo[];     // Color/icon mapping
}

/** Individual shift for employee view — extends concept from ShiftData but employee-scoped */
export interface EmployeeShift {
  id: string;
  date: string;                         // "YYYY-MM-DD" — serialized from Prisma DateTime
  startTime: string;                    // "HH:MM"
  endTime: string;                      // "HH:MM"
  shiftTypeCode: string;
  breakMinutes: number;
  isConfirmed: boolean;
  source: "GENERATED" | "MANUAL";       // ShiftSource enum
}

/**
 * Expanded unavailability entry — uses UnavailabilityType enum values.
 * IMPORTANT: These are from the `Unavailability` model, NOT the `Absence` model.
 * AbsenceType (PAID_LEAVE, SICK_LEAVE, TRAINING, CHILD_SICK, OTHER) is a DIFFERENT enum.
 */
export interface EmployeeUnavailability {
  date: string;                         // "YYYY-MM-DD" (expanded from recurring)
  type: "VACATION" | "SICK" | "SCHOOL" | "OTHER";  // UnavailabilityType enum
  reason?: string;
}

/** Weekly hours summary computed server-side */
export interface EmployeeWeeklySummary {
  weekNumber: number;
  totalMinutes: number;
  shiftCount: number;
  contractMinutes: number;              // Employee.contractHours * 60
}

/**
 * Shift type color/icon mapping info.
 * NOTE: `label` is mapped from Prisma `ClinicShiftType.name` field (the DB column is `name`, NOT `label`).
 * The service must do: `{ code: st.code, label: st.name, color: st.color, breakMinutes: st.breakMinutes }`
 */
export interface EmployeeShiftTypeInfo {
  code: string;
  label: string;                        // Mapped from ClinicShiftType.name
  color: string;                        // Hex color from ClinicShiftType.color
  breakMinutes: number;
}
```

**CRITICAL: `Shift.date` serialization** — Prisma returns `DateTime` (JS `Date` object) for `Shift.date`. The service MUST serialize it to `"YYYY-MM-DD"` string using `format(shift.date, 'yyyy-MM-dd')` from `date-fns` before returning. Same for unavailability dates.

**CRITICAL: `PlanningPeriodStatus` null handling** — If no `PlanningPeriodStatus` row exists for the queried month+clinic, the service must return `{ status: "DRAFT", publishedAt: null }` as default. Do NOT throw an error.

### Offline UX Design

**Offline Banner:**
```
┌─────────────────────────────────────────────────────┐
│ [📡] Mode hors ligne — Données en cache affichées   │
└─────────────────────────────────────────────────────┘
```
- Position: sticky top, below nav
- Style: `bg-amber-50 border-amber-200 text-amber-800`
- Icon: `WifiOff` from lucide-react
- Animate in/out with CSS transition

**Back Online Toast:**
- Sonner toast: "Connexion rétablie" / "Back online"
- Duration: 3 seconds
- Style: default toast with emerald accent

### Schedule Timeline Visual Reference

```
┌─────────────────────────────────────────────────────┐
│ Mars 2026                           [PUBLIÉ ✓]      │
│ ◀  Mars 2026  ▶                                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌───────────────────────────────────────────────┐   │
│ │ Cette semaine          35h / 35h              │   │
│ │ ████████████████████████████████████ 100%      │   │
│ │ 5 créneaux                                     │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│ ● Aujourd'hui — Lun 3 Mars                          │
│ ┌───────────────────────────────────────────────┐   │
│ │ [💼] Chirurgie          8:30 — 18:30          │   │
│ │      Pause: 60 min           [✓ Confirmé]     │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│   Mar 4 Mars                                         │
│ ┌───────────────────────────────────────────────┐   │
│ │ [💼] Accueil            9:00 — 19:30          │   │
│ │      Pause: 30 min          [⚠ Non confirmé]  │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│   Mer 5 Mars                                         │
│ ┌───────────────────────────────────────────────┐   │
│ │ [🌴] Congés payés                              │   │
│ │      Approuvé                                  │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│   Jeu 6 Mars                                         │
│ ┌───────────────────────────────────────────────┐   │
│ │ [🎓] École / Formation                         │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│   Ven 7 Mars                                         │
│ ┌───────────────────────────────────────────────┐   │
│ │ [💼] Chirurgie          8:30 — 18:30          │   │
│ │      Pause: 60 min          [⚠ Non confirmé]  │   │
│ └───────────────────────────────────────────────┘   │
│                                                      │
│   Sam 8 Mars — Repos                                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Color Semantic Reference (Mobile Employee View)

| Shift/Absence Type | Color | Class | Icon |
|-------------------|-------|-------|------|
| Surgery (CHIR) | Indigo | `bg-indigo-50 text-indigo-700 border-indigo-100` | `Briefcase` |
| Reception (ACC) | Orange | `bg-orange-50 text-orange-700 border-orange-100` | `Users` |
| Day Off | Neutral | `bg-neutral-50 text-neutral-300` | `Palmtree` |
| VACATION | Emerald | `bg-emerald-50 text-emerald-700 border-emerald-100` | `Plane` |
| SICK | Rose | `bg-rose-50 text-rose-700 border-rose-100` | `Thermometer` |
| SCHOOL | Purple | `bg-purple-50 text-purple-700 border-purple-100` | `GraduationCap` |
| OTHER | Neutral | `bg-neutral-50 text-neutral-400 border-neutral-100` | `CalendarOff` |

| Confirmation Status | Color | Class |
|--------------------|-------|-------|
| Confirmed | Emerald | `bg-emerald-100 text-emerald-700` |
| Not Confirmed | Orange | `bg-orange-100 text-orange-700` |

| Publication Status | Color | Class |
|-------------------|-------|-------|
| PUBLISHED | Emerald | `bg-emerald-100 text-emerald-700` |
| DRAFT | Amber | `bg-amber-100 text-amber-700` |

### File Structure

```
apps/web/
├── public/
│   ├── manifest.webmanifest                  ← NEW (PWA manifest)
│   ├── icons/
│   │   ├── icon-192x192.png                  ← NEW (PWA icon)
│   │   └── icon-512x512.png                  ← NEW (PWA icon)
│   └── sw.js                                 ← GENERATED (by @serwist/next build)
├── src/
│   ├── app/
│   │   ├── sw.ts                             ← NEW (service worker source)
│   │   └── [locale]/
│   │       ├── ~offline/
│   │       │   └── page.tsx                  ← NEW (offline fallback)
│   │       └── dashboard/
│   │           ├── _components/
│   │           │   └── DashboardQueryProvider.tsx  ← NEW ("use client" PersistQueryClientProvider wrapper)
│   │           └── schedule/
│   │               ├── page.tsx              ← NEW (RSC)
│   │               ├── loading.tsx           ← NEW (skeleton)
│   │               ├── _actions/
│   │               │   └── schedule-actions.ts   ← NEW (2 server actions)
│   │               ├── _hooks/
│   │               │   └── useMySchedule.ts      ← NEW (2 hooks)
│   │               ├── _components/
│   │               │   ├── SchedulePageClient.tsx    ← NEW (orchestrator)
│   │               │   ├── MonthSelector.tsx          ← NEW
│   │               │   ├── WeeklySummaryCard.tsx      ← NEW
│   │               │   ├── PublicationBadge.tsx       ← NEW
│   │               │   ├── ScheduleTimeline.tsx       ← NEW
│   │               │   ├── ShiftDayCard.tsx           ← NEW
│   │               │   ├── AbsenceDayCard.tsx         ← NEW
│   │               │   └── EmptyState.tsx             ← NEW
│   │               └── __tests__/
│   │                   └── schedule-page.spec.tsx     ← NEW
│   ├── components/
│   │   ├── OfflineBanner.tsx                 ← NEW (global offline indicator)
│   │   └── OnlineRestoreToast.tsx            ← NEW (reconnection toast)
│   └── lib/
│       └── query-persist.ts                  ← NEW (React Query persister)

packages/types/src/planning/
├── employee-schedule.types.ts               ← NEW (@pawly/types — EmployeeScheduleData, EmployeeShift, etc.)

apps/api/src/
├── modules/planning/
│   ├── employee-schedule.service.ts          ← NEW (employee schedule service)
│   └── employee-schedule.service.spec.ts     ← NEW (service tests)
└── trpc/routers/
    ├── employee-schedule.router.ts           ← NEW (tRPC router)
    └── employee-schedule.router.spec.ts      ← NEW (router tests)

packages/validators/src/planning/
├── employee-schedule.schema.ts               ← NEW (Zod validators)
└── employee-schedule.schema.test.ts          ← NEW (validator tests)
```

**Files to MODIFY:**
- `apps/web/next.config.ts` — chain withSerwistInit
- `apps/web/tsconfig.json` — add `"webworker"` to `lib` array
- `apps/web/src/app/[locale]/layout.tsx` — add manifest link + PWA meta tags
- `apps/web/src/app/[locale]/dashboard/layout.tsx` — wrap children with `DashboardQueryProvider` (RSC layout renders client wrapper)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` — replace demo data with real hooks
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx` — add "Schedule" nav entry (`labelKey: "schedule" as const`) + integrate OfflineBanner between nav and main
- `apps/web/src/lib/hooks/server-action-hooks.ts` — add mySchedule + myShiftTypes query keys
- `apps/api/src/modules/planning/planning.module.ts` — register EmployeeScheduleService
- `apps/api/src/trpc/context.ts` — add employeeScheduleService to TRPCServices
- `apps/api/src/trpc/trpc.module.ts` — inject EmployeeScheduleService (double-registration)
- `apps/api/src/trpc/routers/_app.ts` — add employeeSchedule router
- `apps/web/src/i18n/langs/fr.json` — add dashboard.schedule.* + dashboard.nav.schedule
- `apps/web/src/i18n/langs/en.json` — add dashboard.schedule.* + dashboard.nav.schedule
- `apps/web/package.json` — add @serwist/next, serwist, @tanstack/react-query-persist-client@^5.90.20, @tanstack/query-sync-storage-persister@^5.90.20
- `packages/types/src/planning/index.ts` — export new employee-schedule types
- `packages/types/src/planning/employee-schedule.types.ts` — NEW file with all employee schedule types

### i18n Keys to Add

**FR (`apps/web/src/i18n/langs/fr.json` → `dashboard.schedule`):**
```json
{
  "title": "Mon planning",
  "monthSelector": {
    "label": "Mois",
    "previous": "Mois précédent",
    "next": "Mois suivant"
  },
  "weeklySummary": {
    "title": "Cette semaine",
    "hours": "{hours}h",
    "shifts": "{count, plural, =0 {Aucun créneau} =1 {1 créneau} other {# créneaux}}",
    "target": "Objectif: {target}h",
    "progress": "{percent}%"
  },
  "publicationStatus": {
    "published": "Publié",
    "publishedAt": "Publié le {date}",
    "draft": "Brouillon",
    "draftNotice": "Ce planning peut encore changer."
  },
  "timeline": {
    "today": "Aujourd'hui",
    "noShifts": "Aucun créneau prévu ce mois-ci.",
    "restDay": "Repos",
    "break": "Pause: {minutes} min"
  },
  "shiftStatus": {
    "confirmed": "Confirmé",
    "notConfirmed": "Non confirmé"
  },
  "offline": {
    "banner": "Mode hors ligne — Données en cache affichées",
    "backOnline": "Connexion rétablie"
  },
  "errors": {
    "loadFailed": "Impossible de charger le planning.",
    "retry": "Réessayer"
  }
}
```

**EN keys** follow the same structure. **`dashboard.nav.schedule`**: FR = `"Mon planning"`, EN = `"My Schedule"`.

### Testing Standards

- **Validators**: Vitest, `*.test.ts` pattern (NOT `*.spec.ts` for packages/validators)
- **API service + router**: Jest, `*.spec.ts` pattern
- **Web components**: Vitest + @testing-library/react, `*.spec.tsx` pattern
- **Mock strategy**: next-intl globally mocked in vitest.setup.ts, navigator.onLine mockable via `Object.defineProperty`
- **RSC page test**: `const el = await Component({ params: Promise.resolve({ locale: "en" }) }); render(el);`
- **Offline tests**: Mock `navigator.onLine` and dispatch `offline`/`online` events on `window`

### Previous Story Intelligence (Stories 6.3, 7.2, 7.3, 7.5)

**From Story 6.3 (Schedule Visualization):**
- `getScheduleViewForMonth` in PlanningGenerationService aggregates all schedule data via `Promise.all` — employee schedule service follows the same parallel fetch pattern but scoped to a single employee
- `ScheduleShift` type with `isConfirmed`, `breakMinutes`, `shiftTypeColor` — reuse same shape
- Unavailability expansion (one-time + recurring) — reuse expansion logic
- Week boundary computation via `getWeekBoundaries()` — reuse for weekly summary

**From Story 7.2 (Equity Alerts / Publish Workflow):**
- `PlanningPeriodStatus` model tracks DRAFT/PUBLISHED per month per clinic — employee schedule shows this status
- `getPublicationStatus` procedure exists in planning router — create equivalent for employee scope
- Publication emails already send employees to `/dashboard` — Story 8.1 ensures there's content there

**From Story 7.3 (Absence Request):**
- Employee dashboard at `/dashboard/absences` exists with full CRUD
- `EmployeeProvider` context gives access to `employeeId` and `jobType`
- `DashboardLayoutClient.tsx` has nav items (Home, School Days, Absences) — add "Schedule"
- React Query cache invalidation with prefix matching — follow same pattern

**From Story 7.5 (Admin Variance View):**
- Atomic CAS `updateMany WHERE status='PENDING'` pattern for race-safe operations — not needed for read-only schedule but informative
- Card-based UI pattern — employee schedule uses same card approach
- i18n ICU plural syntax — follow for shift counts

### Dependency Notes

**New dependencies to install:**
```bash
# From project root — pin @tanstack versions to match existing @tanstack/react-query@^5.90.20
pnpm add --filter @pawly/web @serwist/next serwist @tanstack/react-query-persist-client@^5.90.20 @tanstack/query-sync-storage-persister@^5.90.20
```

**No backend dependencies needed** — all required libraries already installed.

**Existing dependencies leveraged:**
- `lucide-react` — WifiOff, CalendarDays, Briefcase, Users, Plane, Thermometer, GraduationCap, etc.
- `sonner` — toast for reconnection
- `date-fns` — date formatting, week boundaries
- `motion` 12.34.3 — optional entry animations for timeline cards
- shadcn/ui — Card, Badge, Button, Skeleton

### Security Considerations

1. **Employee isolation**: `getMySchedule` procedure resolves `employeeId` via DB lookup on `ctx.user.sub` (the JWT subject/user ID), NEVER from client input. `AuthenticatedUser` from `@pawly/types` has no `employeeId` field — this is by design. The procedure queries `prisma.user.findUnique → employee.id` to get the linked employee.
2. **Clinic isolation**: All queries filtered by `ctx.user.clinicId` from JWT.
3. **Subscription guard**: `subscribedProcedure` enforces active clinic subscription. Defined locally in each router file: `publicProcedure.use(isAuthed).use(isSubscribed)`.
4. **Service worker scope**: Scoped to `/` to cover all locale prefixes. No cross-origin requests cached.
5. **Cache sensitivity**: Cached schedule data is employee-specific. If the user logs out and another user logs in on the same device, ensure React Query cache is cleared on logout.

### Epic 8 Context

This is the **first story in Epic 8** (Employee PWA Portal & Time Tracking). The three stories build progressively:
- **8.1 (this story)**: Schedule consultation + offline cache (PWA foundation + read-only view)
- **8.2**: Declarative time tracking — adds the confirmation mutation + VarianceEvent creation
- **8.3**: PWA installation + email notifications — manifest.json prompt, push notifications (Phase 2 optional)

Story 8.1 lays the PWA foundation that 8.2 and 8.3 build upon. The service worker, manifest, and React Query persistence are reused across all three stories.

### Project Structure Notes

- All new files follow established `_components/`, `_hooks/`, `_actions/`, `__tests__/` convention
- Employee schedule route is under `/dashboard/schedule/` (separate from admin `/admin/planning/`)
- Backend service is in `PlanningModule` (not a new module) since it queries planning data
- The new `EmployeeScheduleService` is distinct from the admin `PlanningGenerationService` — different authorization, different data shape, different caching needs
- PWA files (manifest, sw.ts) are at the app level, not route-local
- OfflineBanner is a global component since it applies to all employee pages

### References

- [Source: docs/planning-artifacts/epics.md#Story 8.1 — Personal Schedule Consultation (Graceful Offline)]
- [Source: docs/planning-artifacts/prd.md#FR9, FR10, NFR4 — Employee portal, offline cache]
- [Source: docs/planning-artifacts/architecture.md#Data Flow, PWA, State Management]
- [Source: docs/planning-artifacts/ux-design-specification.md#Employee Dashboard, Mobile, Today Card, Timeline]
- [Source: apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx — Current demo implementation]
- [Source: apps/web/src/app/[locale]/dashboard/layout.tsx — Employee auth guard, EmployeeProvider]
- [Source: apps/web/next.config.ts — Current config (withNextIntl only, no PWA)]
- [Source: apps/api/prisma/schema/Planning.prisma#20-49 — Shift model with isConfirmed]
- [Source: apps/api/src/modules/planning/planning-generation.service.ts — getScheduleViewForMonth pattern]
- [Source: apps/api/src/trpc/routers/planning.router.ts — Admin-only schedule procedures]
- [Source: docs/implementation-artifacts/6-3-schedule-visualization-conflict-indicators.md — ScheduleViewData, unavailability expansion]
- [Source: docs/implementation-artifacts/7-2-equity-alerts-management-soft-rules.md — PlanningPeriodStatus, publication workflow]
- [Source: docs/implementation-artifacts/7-3-absence-request-validation-workflow.md — Employee dashboard patterns]
- [Source: docs/implementation-artifacts/7-5-admin-variance-view.md — Card UI patterns, code review learnings]
- [Source: Context7 @serwist/next v9.5.6 — PWA integration for Next.js 16]
- [Source: Context7 @tanstack/react-query-persist-client v5.90.x — Offline persistence]

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

#### Debug Log References

- Corrupted `terser-webpack-plugin` package.json during pnpm install → fixed by deleting corrupted module directory
- `date-fns` not available in API workspace → replaced with native JS utility functions (formatDateYMD, eachDayOfInterval, getISOWeekNumber)
- Offline fallback URL mismatch: `/~offline` doesn't exist (locale-prefixed routing) → updated to `/fr/~offline` and `/en/~offline`
- TypeScript implicit any: zsa-react-query doesn't infer return types → explicit type casts: `as EmployeeScheduleData | undefined`
- `mkdir` with brackets failed in zsh (glob expansion) → quoted path

#### Completion Notes List

- 10/10 tasks complete, 124 new tests (67 validators + 20 service + 12 router + 25 web)
- Total test count: 2061 (656 validators + 726 API + 679 web)
- Full build green (5 Turborepo tasks successful)
- PWA foundation: @serwist/next service worker with NetworkFirst caching, manifest, offline fallback (FR/EN)
- React Query persistence: PersistQueryClientProvider + localStorage persister, 24h gcTime, offlineFirst networkMode
- Backend: EmployeeScheduleService with native JS date utilities (no date-fns dependency in API), 2 tRPC procedures
- DashboardClient fully rewired from hardcoded demo data to real useMySchedule/useMyShiftTypes hooks
- Employee isolation: employeeId resolved via DB lookup on ctx.user.sub (AuthenticatedUser has no employeeId)

#### Post-Implementation Enhancements

##### Mobile Bottom Tab Bar (Claude Opus)
- **DashboardLayoutClient.tsx** redesigned: horizontal pill nav replaced with **fixed bottom tab bar** on mobile (`sm:hidden`), Material 3-style icons with active pill indicator, `env(safe-area-inset-bottom)` for iOS home indicator. Desktop keeps horizontal pill nav (`hidden sm:block`). Main content has `pb-32 sm:pb-8` to avoid overlap. Nav item order reordered: Home → Schedule → School Days → Absences.

##### PWA Visual Polish (Gemini)
- **Real PWA icons**: Placeholder PNG icons replaced with proper Pawly logo icons (rounded corners, `logo.svg` source with `rx="153" ry="153"`)
- **iOS Splash Screens**: `apps/web/scripts/generate-splash.js` (Sharp-based generator) produced 56 splash images in `apps/web/public/splash/` covering all iPhone/iPad sizes (portrait + landscape), including iPhone 16/17 Pro Max. Apple `<link rel="apple-touch-startup-image">` tags added to `layout.tsx`
- **Animated In-App Splash**: `RunningPetSplash` component (`apps/web/src/components/running-pet-splash.tsx`) — random dog/cat bouncing over scrolling paw prints, Pawly logo pulse animation. Used in `dashboard/loading.tsx` and `admin/loading.tsx`. DashboardClient shows splash on first session visit (sessionStorage guard, 2.5s minimum display)

##### i18n Fixes (Claude Opus)
- **Offline page i18n**: `~offline/page.tsx` was hardcoded in French → converted to `useTranslations("common.offlinePage")` with FR/EN keys (`title`, `description`, `retry`)
- **Service worker locale-aware fallback**: `sw.ts` had single FR fallback → now 3 entries: `/fr/~offline` for FR URLs, `/en/~offline` for EN URLs, FR as default fallback. Uses `new URL(request.url).pathname` to detect locale (Serwist matcher has no `url` param)

#### Known Limitation: Magic Link + PWA Cookie Context
- **Issue identified**: On iOS, PWA standalone has a **separate cookie context** from Safari. Magic Link clicked from Mail opens in Safari, sets JWT cookie in Safari's context — not shared with PWA standalone. Employee must re-authenticate from within the PWA.
- **Recommended fix**: OTP code (6 digits by email) instead of Magic Link for employee login. Employee stays in PWA to type code → cookie set in PWA context. Candidate for a dedicated story in Epic 8.

## File List

**NEW files (34):**
- `apps/web/public/manifest.webmanifest` — PWA manifest with Pawly branding
- `apps/web/public/icons/icon-192x192.png` — PWA icon 192x192 (real Pawly logo, rounded)
- `apps/web/public/icons/icon-512x512.png` — PWA icon 512x512 (real Pawly logo, rounded)
- `apps/web/public/icons/logo.svg` — SVG source logo with rounded corners (rx="153" ry="153")
- `apps/web/public/splash/` — 56 iOS splash screen images (all iPhone/iPad sizes, portrait + landscape)
- `apps/web/scripts/generate-splash.js` — Sharp-based splash screen generator (25 device specs, auto portrait/landscape)
- `apps/web/src/app/sw.ts` — Serwist service worker (NetworkFirst schedule API, locale-aware offline fallback)
- `apps/web/src/app/[locale]/~offline/page.tsx` — Offline fallback page (i18n via useTranslations)
- `apps/web/src/lib/query-persist.ts` — React Query localStorage persister
- `apps/web/src/app/[locale]/dashboard/_components/DashboardQueryProvider.tsx` — PersistQueryClientProvider wrapper
- `apps/web/src/components/OfflineBanner.tsx` — Offline indicator banner (WifiOff icon)
- `apps/web/src/components/OnlineRestoreToast.tsx` — Reconnection toast (sonner)
- `apps/web/src/components/running-pet-splash.tsx` — Animated splash screen (random dog/cat, bouncing paw prints)
- `apps/web/src/app/[locale]/dashboard/loading.tsx` — Dashboard loading with RunningPetSplash
- `apps/web/src/app/[locale]/admin/loading.tsx` — Admin loading with RunningPetSplash
- `apps/web/src/app/[locale]/dashboard/schedule/page.tsx` — RSC schedule page
- `apps/web/src/app/[locale]/dashboard/schedule/loading.tsx` — Schedule skeleton loader
- `apps/web/src/app/[locale]/dashboard/schedule/_actions/schedule-actions.ts` — 2 server actions
- `apps/web/src/app/[locale]/dashboard/schedule/_hooks/useMySchedule.ts` — 2 React Query hooks
- `apps/web/src/app/[locale]/dashboard/schedule/_components/SchedulePageClient.tsx` — Orchestrator
- `apps/web/src/app/[locale]/dashboard/schedule/_components/MonthSelector.tsx` — Month navigation
- `apps/web/src/app/[locale]/dashboard/schedule/_components/WeeklySummaryCard.tsx` — Weekly hours card
- `apps/web/src/app/[locale]/dashboard/schedule/_components/PublicationBadge.tsx` — PUBLISHED/DRAFT badge
- `apps/web/src/app/[locale]/dashboard/schedule/_components/ScheduleTimeline.tsx` — Vertical timeline
- `apps/web/src/app/[locale]/dashboard/schedule/_components/ShiftDayCard.tsx` — Shift day card
- `apps/web/src/app/[locale]/dashboard/schedule/_components/AbsenceDayCard.tsx` — Absence day card
- `apps/web/src/app/[locale]/dashboard/schedule/_components/EmptyState.tsx` — Empty state
- `apps/web/src/app/[locale]/dashboard/schedule/__tests__/schedule-page.spec.tsx` — 25 component tests
- `apps/api/src/modules/planning/employee-schedule.service.ts` — Employee schedule service
- `apps/api/src/modules/planning/employee-schedule.service.spec.ts` — 20 service tests
- `apps/api/src/trpc/routers/employee-schedule.router.ts` — 2 tRPC procedures
- `apps/api/src/trpc/routers/employee-schedule.router.spec.ts` — 12 router tests
- `packages/types/src/planning/employee-schedule.types.ts` — 5 TypeScript interfaces
- `packages/validators/src/planning/employee-schedule.schema.ts` — 6 Zod schemas
- `packages/validators/src/planning/employee-schedule.schema.test.ts` — 67 validator tests

**MODIFIED files (16):**
- `apps/web/next.config.ts` — Chained withSerwistInit with withNextIntl
- `apps/web/tsconfig.json` — Added "webworker" to lib array
- `apps/web/package.json` — Added @serwist/next, serwist, @tanstack/react-query-persist-client, @tanstack/query-sync-storage-persister
- `apps/web/src/app/[locale]/layout.tsx` — Added PWA meta tags, manifest link, apple-touch-startup-image tags for 56 splash screens
- `apps/web/src/app/[locale]/dashboard/layout.tsx` — Wrapped children with DashboardQueryProvider
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` — Replaced demo data with real hooks, session splash integration with RunningPetSplash
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx` — Mobile bottom tab bar (fixed, safe-area), desktop horizontal pill nav, schedule nav entry, OfflineBanner, OnlineRestoreToast
- `apps/web/src/lib/hooks/server-action-hooks.ts` — Added mySchedule + myShiftTypes query keys
- `apps/web/src/i18n/langs/fr.json` — Added dashboard.schedule.* (~40 keys), dashboard.nav.schedule, common.offlinePage.{title,description,retry}
- `apps/web/src/i18n/langs/en.json` — Added matching EN keys
- `apps/api/src/modules/planning/planning.module.ts` — Registered EmployeeScheduleService
- `apps/api/src/trpc/context.ts` — Added employeeScheduleService to TRPCServices
- `apps/api/src/trpc/trpc.module.ts` — Injected EmployeeScheduleService (double-registration)
- `apps/api/src/trpc/routers/_app.ts` — Added employeeSchedule router
- `packages/types/src/planning/index.ts` — Exported new employee-schedule types
- `packages/validators/src/planning/index.ts` — Exported new employee-schedule schemas
