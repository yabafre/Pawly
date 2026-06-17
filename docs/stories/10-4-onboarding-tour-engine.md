# Story: 10-4-onboarding-tour-engine — First-Run Guided Tour Engine + Employee & Admin Tours

**Epic:** Epic 10 — Polish & UX Hardening
**Status:** review
**Ticket:** none (new story — not synced to Linear; create an issue later if Linear sync is wanted)
**Branch:** `feature/story-10-4-onboarding-tour-engine`
**Commit prefix:** `feat:` (e.g. `feat: add tour engine persistence (Story 10.4)`)

> Authoritative design: `docs/adr/0001-tour-engine.md` + `docs/grill-summary.md` (11 locked decisions). Read them before starting.

## User Story

**As an** employee (vet/ASV) or admin logging in for the first time, **I want** a short, anchored guided tour of my workspace, **so that** I understand where things are and what to do first — and as the team, we get a reusable, role-aware, resumable tour engine.

## Acceptance Criteria

1. **Schema + migration** — **Given** the Prisma `User` model, **When** the schema is pushed, **Then** `User` has `tourCompletedAt DateTime?` (`@map("tour_completed_at")`) and `tourState Json?` (`@map("tour_state")`), both defaulting to NULL; **And** a one-off backfill sets `tourCompletedAt = now()` for all existing `role = ADMIN` users while `EMPLOYEE` users and all new users stay NULL.
2. **Backend API** — **Given** an authenticated user, **When** the client calls `tour.getState`, **Then** it returns `{ tourCompletedAt: string | null, tourState: TourState | null }` for that user; **And** `tour.saveProgress({ tourKey, step })` upserts `tourState`; **And** `tour.complete({ tourKey })` sets `tourCompletedAt = now()` and clears `tourState`. All three use `protectedProcedure` (NOT `subscribedProcedure`) so they work before/without an active subscription (avoids the onboarding-deadlock — Lesson L2).
3. **Generic engine** — **Given** a registry mapping `TourKey → { role, steps[] }`, **When** the `TourProvider` mounts for a user whose `tourCompletedAt` is NULL, **Then** it auto-starts the tour matching the user's role, resuming at `tourState.step` (when `tourState.tourKey` matches) else step 0; **And** runtime state (active tour, step, isRunning) lives in a Zustand store.
4. **Anchor robustness** — **Given** a step whose `selector` is not present in the DOM, **When** the engine reaches it, **Then** it polls briefly (~4s) then gracefully skips to the next step whose anchor resolves; **And** if no further step resolves, it ends the tour (marking complete only if it was the last step); **And** it never hard-fails or blocks the UI (Q10).
5. **Employee tour (single-page)** — **Given** an EMPLOYEE on first login (`tourCompletedAt` NULL), **When** they land on `/dashboard`, **Then** the `employee-onboarding` tour runs anchored on stable `data-tour` targets with descriptive copy; **And** finishing or skipping calls `tour.complete`.
6. **Admin tour (multi-page)** — **Given** an ADMIN whose `tourCompletedAt` is NULL, **When** the `admin-onboarding` tour runs, **Then** it walks across routes `/admin/dashboard → /admin/employees → /admin/planning`, navigating via the locale-aware router and re-anchoring on each route after load.
7. **Resume at exact step** — **Given** a tour interrupted by refresh/navigation, **When** the user returns, **Then** the engine resumes at the persisted `tourState.step`; **And** only finishing the last step OR clicking "Passer"/close writes `tourCompletedAt` (accidental interruption does not — it re-fires next login) (Q8).
8. **Debounce + L1** — **Given** the tour advancing, **When** the step changes, **Then** progress is persisted via a debounced (~1s) `tour.saveProgress` through the mandated `Zsa → server action → tRPC` flow; **And** every `useServerActionMutation(..., { returnError: true })` call destructures the Zsa tuple `[data, err]` correctly (Lesson L1).
9. **Replay** — **Given** a user who completed the tour, **When** they click "Revoir le guide" (employee: `dashboard/settings`; admin: header), **Then** the tour restarts from step 0 **without** clearing `tourCompletedAt`.
10. **i18n** — **Given** all tour copy, **Then** every string exists under a `tour` namespace in both `apps/web/src/i18n/langs/fr.json` and `en.json` (NFR20); no hardcoded user-facing strings.
11. **Dependency** — **Given** the renderer, **Then** `driver.js` (MIT) is the only added runtime dependency, imported client-side only.

## Tasks

> Each task: exact path · full code · test/verify command · expected output · commit. Run all `pnpm` commands from the repo root (never `cd` into `apps/*`).

**Backend — data + API**

- [x] **T1 — Add tour fields to Prisma `User` model** [AC: 1]
  Edit `apps/api/prisma/schema/User.prisma`. Add the two fields immediately after the `otpFallbackUntil` line:
  ```prisma
  otpFallbackUntil DateTime? @map("otp_fallback_until")

  tourCompletedAt DateTime? @map("tour_completed_at")
  tourState       Json?     @map("tour_state")
  ```
  Run: `pnpm db:generate && pnpm db:push`
  Expected: `pnpm db:push` prints `Your database is now in sync with your schema.` (or `already in sync`), exit 0; `pnpm db:generate` regenerates the client with the new fields.
  Commit: `git add apps/api/prisma/schema/User.prisma && git commit -m "feat: add tourCompletedAt + tourState to User (Story 10.4)"`

- [x] **T2 — Backfill existing admins as tour-completed** [AC: 1]
  Create `apps/api/prisma/backfill/tour-admins.ts`:
  ```ts
  import { PrismaClient } from "@prisma/client";

  const prisma = new PrismaClient();

  async function main() {
    const res = await prisma.user.updateMany({
      where: { role: "ADMIN", tourCompletedAt: null },
      data: { tourCompletedAt: new Date() },
    });
    console.log(`Backfilled ${res.count} ADMIN user(s) as tour-completed.`);
  }

  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
  ```
  Run: `pnpm --filter ./apps/api exec ts-node prisma/backfill/tour-admins.ts`
  Expected: prints `Backfilled N ADMIN user(s) as tour-completed.`, exit 0. (Idempotent — re-running backfills 0.)
  Commit: `git add apps/api/prisma/backfill/tour-admins.ts && git commit -m "feat: backfill existing admins as tour-completed (Story 10.4)"`

- [x] **T3 — Tour validators** [AC: 2, 3]
  Create `packages/validators/src/tour/tour.schema.ts`:
  ```ts
  import { z } from "@pawly/zod";

  export const tourStateSchema = z.object({
    tourKey: z.string(),
    step: z.number().int().nonnegative(),
    updatedAt: z.string(),
  });
  export type TourState = z.infer<typeof tourStateSchema>;

  export const saveTourProgressSchema = z.object({
    tourKey: z.string(),
    step: z.number().int().nonnegative(),
  });

  export const completeTourSchema = z.object({
    tourKey: z.string(),
  });

  export const tourStateOutputSchema = z.object({
    tourCompletedAt: z.string().nullable(),
    tourState: tourStateSchema.nullable(),
  });
  ```
  Create `packages/validators/src/tour/index.ts`:
  ```ts
  export * from "./tour.schema";
  ```
  Edit `packages/validators/src/index.ts` — add the export line after the `planning` export:
  ```ts
  export * from "./planning";
  export * from "./tour";
  ```
  Run: `pnpm --filter ./packages/validators build` (or `pnpm --filter ./packages/validators exec tsc --noEmit` if no build script)
  Expected: type-checks clean, exit 0.
  Commit: `git add packages/validators/src/tour packages/validators/src/index.ts && git commit -m "feat: add tour validators (Story 10.4)"`

- [x] **T4 — TourService** [AC: 2]
  Create `apps/api/src/modules/tour/tour.service.ts`:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '@/prisma/prisma.service';
  import type { TourState } from '@pawly/validators';

  @Injectable()
  export class TourService {
    constructor(private readonly prisma: PrismaService) {}

    async getState(userId: string): Promise<{ tourCompletedAt: string | null; tourState: TourState | null }> {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tourCompletedAt: true, tourState: true },
      });
      return {
        tourCompletedAt: user?.tourCompletedAt ? user.tourCompletedAt.toISOString() : null,
        tourState: (user?.tourState as TourState | null) ?? null,
      };
    }

    async saveProgress(userId: string, tourKey: string, step: number): Promise<{ ok: true }> {
      const tourState: TourState = { tourKey, step, updatedAt: new Date().toISOString() };
      await this.prisma.user.update({
        where: { id: userId },
        data: { tourState: tourState as object },
      });
      return { ok: true };
    }

    async complete(userId: string): Promise<{ ok: true }> {
      await this.prisma.user.update({
        where: { id: userId },
        data: { tourCompletedAt: new Date(), tourState: undefined },
      });
      return { ok: true };
    }
  }
  ```
  > Note: to clear a Json column to NULL via Prisma, `complete()` should set it to `Prisma.DbNull`. Use: import `{ Prisma }` from `@prisma/client` and set `tourState: Prisma.DbNull`. Replace the `tourState: undefined` line accordingly:
  ```ts
  import { Prisma } from '@prisma/client';
  // ...
  data: { tourCompletedAt: new Date(), tourState: Prisma.DbNull },
  ```
  Run: `pnpm --filter ./apps/api exec tsc --noEmit -p tsconfig.json`
  Expected: type-checks clean, exit 0.
  Commit: `git add apps/api/src/modules/tour/tour.service.ts && git commit -m "feat: add TourService (Story 10.4)"`

- [x] **T5 — TourModule** [AC: 2]
  Create `apps/api/src/modules/tour/tour.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { PrismaModule } from '@/prisma/prisma.module';
  import { TourService } from './tour.service';

  @Module({
    imports: [PrismaModule],
    providers: [TourService],
    exports: [TourService],
  })
  export class TourModule {}
  ```
  Run: `pnpm --filter ./apps/api exec tsc --noEmit -p tsconfig.json`
  Expected: exit 0.
  Commit: `git add apps/api/src/modules/tour/tour.module.ts && git commit -m "feat: add TourModule (Story 10.4)"`

- [x] **T6 — tour.router** [AC: 2]
  Create `apps/api/src/trpc/routers/tour.router.ts`:
  ```ts
  import { publicProcedure, router, isAuthed } from '../trpc';
  import { saveTourProgressSchema, completeTourSchema } from '@pawly/validators';

  const protectedProcedure = publicProcedure.use(isAuthed);

  export const tourRouter = router({
    // protectedProcedure (NOT subscribedProcedure) — must work before/without active subscription
    getState: protectedProcedure.query(async ({ ctx }) => {
      return ctx.tourService.getState(ctx.user.sub);
    }),

    saveProgress: protectedProcedure
      .input(saveTourProgressSchema)
      .mutation(async ({ input, ctx }) => {
        return ctx.tourService.saveProgress(ctx.user.sub, input.tourKey, input.step);
      }),

    complete: protectedProcedure
      .input(completeTourSchema)
      .mutation(async ({ ctx }) => {
        return ctx.tourService.complete(ctx.user.sub);
      }),
  });

  export type TourRouter = typeof tourRouter;
  ```
  > `ctx.user.sub` is the user id (see `context.ts`: `user = { sub, email, role, clinicId }`). Do NOT use `ctx.user.clinicId` — tour state is per-user.
  Run: `pnpm --filter ./apps/api exec tsc --noEmit -p tsconfig.json`
  Expected: exit 0 (will still error until T7 wires `ctx.tourService` — acceptable; T7 resolves it. Run tsc again after T7.)
  Commit: `git add apps/api/src/trpc/routers/tour.router.ts && git commit -m "feat: add tour tRPC router (Story 10.4)"`

- [x] **T7 — Register router + wire DI context** [AC: 2]
  (a) Edit `apps/api/src/trpc/routers/_app.ts` — add import after the `presenceConfirmationRouter` import, and register `tour` in the `router({...})`:
  ```ts
  import { presenceConfirmationRouter } from './presence-confirmation.router';
  import { tourRouter } from './tour.router';
  ```
  ```ts
    presenceConfirmation: presenceConfirmationRouter,
    tour: tourRouter,
  });
  ```
  (b) Edit `apps/api/src/trpc/context.ts` — add the import and the field:
  ```ts
  import type { MailService } from '@/modules/mail/mail.service';
  import type { TourService } from '@/modules/tour/tour.service';
  ```
  ```ts
    mailService: MailService;
    tourService: TourService;
    jwtService: JwtService;
  ```
  (c) Edit `apps/api/src/trpc/trpc.module.ts` — three edits:
  - import the service + module near the other imports:
  ```ts
  import { MailService } from '@/modules/mail/mail.service';
  import { TourModule } from '@/modules/tour/tour.module';
  import { TourService } from '@/modules/tour/tour.service';
  ```
  - in BOTH `TRPCMiddleware` and `TRPCService` constructors, add the parameter after `mailService`:
  ```ts
      private readonly mailService: MailService,
      private readonly tourService: TourService,
      private readonly jwtService: JwtService,
  ```
  - in BOTH the `TRPCMiddleware` `services` object and `TRPCService.getServices()` return, add after `mailService`:
  ```ts
        mailService: this.mailService,
        tourService: this.tourService,
        jwtService: this.jwtService,
  ```
  - add `TourModule` to the `@Module({ imports: [...] })`:
  ```ts
      MailModule,
      TourModule,
      PrismaModule,
  ```
  Run: `pnpm --filter ./apps/api exec tsc --noEmit -p tsconfig.json`
  Expected: exit 0 (T6 now resolves).
  Commit: `git add apps/api/src/trpc/routers/_app.ts apps/api/src/trpc/context.ts apps/api/src/trpc/trpc.module.ts && git commit -m "feat: register tour router + wire TourService into tRPC context (Story 10.4)"`

- [x] **T8 — TourService unit tests** [AC: 2]
  Create `apps/api/src/modules/tour/tour.service.spec.ts`:
  ```ts
  import { Test } from '@nestjs/testing';
  import { TourService } from './tour.service';
  import { PrismaService } from '@/prisma/prisma.service';

  describe('TourService', () => {
    let service: TourService;
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const moduleRef = await Test.createTestingModule({
        providers: [TourService, { provide: PrismaService, useValue: prisma }],
      }).compile();
      service = moduleRef.get(TourService);
    });

    it('getState returns null fields when user has no tour data', async () => {
      prisma.user.findUnique.mockResolvedValue({ tourCompletedAt: null, tourState: null });
      const res = await service.getState('u1');
      expect(res).toEqual({ tourCompletedAt: null, tourState: null });
    });

    it('getState serializes tourCompletedAt to ISO string', async () => {
      const d = new Date('2026-06-17T10:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ tourCompletedAt: d, tourState: { tourKey: 'admin-onboarding', step: 2, updatedAt: 'x' } });
      const res = await service.getState('u1');
      expect(res.tourCompletedAt).toBe('2026-06-17T10:00:00.000Z');
      expect(res.tourState).toEqual({ tourKey: 'admin-onboarding', step: 2, updatedAt: 'x' });
    });

    it('saveProgress writes tourState with tourKey + step', async () => {
      prisma.user.update.mockResolvedValue({});
      await service.saveProgress('u1', 'employee-onboarding', 3);
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'u1' });
      expect(arg.data.tourState.tourKey).toBe('employee-onboarding');
      expect(arg.data.tourState.step).toBe(3);
    });

    it('complete sets tourCompletedAt and clears tourState', async () => {
      prisma.user.update.mockResolvedValue({});
      await service.complete('u1');
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.data.tourCompletedAt).toBeInstanceOf(Date);
      expect(arg.data.tourState).toBeDefined(); // Prisma.DbNull
    });
  });
  ```
  Run: `pnpm --filter ./apps/api exec jest src/modules/tour/tour.service.spec.ts`
  Expected: `Tests: 4 passed`, exit 0.
  Commit: `git add apps/api/src/modules/tour/tour.service.spec.ts && git commit -m "test: TourService unit tests (Story 10.4)"`

**Frontend — engine (shared, reused by both tours)**

- [x] **T9 — Install driver.js** [AC: 11]
  Run: `pnpm --filter ./apps/web add driver.js`
  Expected: `driver.js` added to `apps/web/package.json` dependencies, exit 0.
  Commit: `git add apps/web/package.json pnpm-lock.yaml && git commit -m "feat: add driver.js dependency (Story 10.4)"`

- [x] **T10 — Tour registry** [AC: 3, 5, 6]
  Create `apps/web/src/lib/tours/registry.ts`:
  ```ts
  export type TourRole = "ADMIN" | "EMPLOYEE";

  export type TourStep = {
    id: string;
    route: string; // pathname WITHOUT locale prefix (e.g. "/dashboard")
    selector: string; // CSS selector, e.g. '[data-tour="employee-today"]'
    titleKey: string; // next-intl key under the "tour" namespace
    bodyKey: string;
    placement?: "top" | "bottom" | "left" | "right";
  };

  export type TourDef = { role: TourRole; steps: TourStep[] };

  export type TourKey = "employee-onboarding" | "admin-onboarding";

  export const tours: Record<TourKey, TourDef> = {
    "employee-onboarding": {
      role: "EMPLOYEE",
      steps: [
        { id: "greeting", route: "/dashboard", selector: '[data-tour="employee-greeting"]', titleKey: "employee.greeting.title", bodyKey: "employee.greeting.body", placement: "bottom" },
        { id: "today", route: "/dashboard", selector: '[data-tour="employee-today"]', titleKey: "employee.today.title", bodyKey: "employee.today.body", placement: "bottom" },
        { id: "confirm", route: "/dashboard", selector: '[data-tour="employee-confirm"]', titleKey: "employee.confirm.title", bodyKey: "employee.confirm.body", placement: "top" },
        { id: "settings", route: "/dashboard", selector: '[data-tour="employee-settings"]', titleKey: "employee.settings.title", bodyKey: "employee.settings.body", placement: "bottom" },
      ],
    },
    "admin-onboarding": {
      role: "ADMIN",
      steps: [
        { id: "dashboard", route: "/admin/dashboard", selector: '[data-tour="admin-dashboard"]', titleKey: "admin.dashboard.title", bodyKey: "admin.dashboard.body", placement: "bottom" },
        { id: "employees-nav", route: "/admin/dashboard", selector: '[data-tour="admin-nav-employees"]', titleKey: "admin.employeesNav.title", bodyKey: "admin.employeesNav.body", placement: "bottom" },
        { id: "add-employee", route: "/admin/employees", selector: '[data-tour="admin-add-employee"]', titleKey: "admin.addEmployee.title", bodyKey: "admin.addEmployee.body", placement: "bottom" },
        { id: "planning-nav", route: "/admin/employees", selector: '[data-tour="admin-nav-planning"]', titleKey: "admin.planningNav.title", bodyKey: "admin.planningNav.body", placement: "bottom" },
        { id: "generate", route: "/admin/planning", selector: '[data-tour="admin-generate"]', titleKey: "admin.generate.title", bodyKey: "admin.generate.body", placement: "bottom" },
      ],
    },
  };

  export function tourForRole(role: TourRole): TourKey | null {
    if (role === "EMPLOYEE") return "employee-onboarding";
    if (role === "ADMIN") return "admin-onboarding";
    return null;
  }
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/registry.ts && git commit -m "feat: tour registry (Story 10.4)"`

- [x] **T11 — Zustand tour store** [AC: 3]
  Create `apps/web/src/lib/tours/store.ts`:
  ```ts
  import { create } from "zustand";
  import type { TourKey } from "./registry";

  type TourStore = {
    activeTour: TourKey | null;
    step: number;
    isRunning: boolean;
    start: (tour: TourKey, step: number) => void;
    setStep: (step: number) => void;
    stop: () => void;
  };

  export const useTourStore = create<TourStore>((set) => ({
    activeTour: null,
    step: 0,
    isRunning: false,
    start: (tour, step) => set({ activeTour: tour, step, isRunning: true }),
    setStep: (step) => set({ step }),
    stop: () => set({ activeTour: null, step: 0, isRunning: false }),
  }));
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/store.ts && git commit -m "feat: tour Zustand store (Story 10.4)"`

- [x] **T12 — Anchor polling helper** [AC: 4]
  Create `apps/web/src/lib/tours/wait-for-element.ts`:
  ```ts
  /**
   * Polls for an element matching `selector`. Resolves with the element once
   * found, or `null` after `timeoutMs`. Never throws. Used for graceful skip.
   */
  export function waitForElement(
    selector: string,
    timeoutMs = 4000,
    intervalMs = 150,
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) return resolve(el);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/wait-for-element.ts && git commit -m "feat: tour anchor polling helper (Story 10.4)"`

- [x] **T13 — driver.js adapter** [AC: 3, 4]
  Create `apps/web/src/lib/tours/driver-adapter.ts`:
  ```ts
  "use client";
  import { driver, type Driver } from "driver.js";
  import "driver.js/dist/driver.css";

  let instance: Driver | null = null;

  export type StepHandlers = {
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
  };

  export function highlightStep(params: {
    element: string;
    title: string;
    description: string;
    side?: "top" | "bottom" | "left" | "right";
    isFirst: boolean;
    isLast: boolean;
    handlers: StepHandlers;
  }): void {
    const { element, title, description, side, isFirst, isLast, handlers } = params;
    if (!instance) {
      instance = driver();
    }
    instance.setConfig({
      animate: true,
      allowClose: true,
      showProgress: false,
      overlayColor: "rgba(0,0,0,0.55)",
      popoverClass: "pawly-tour",
      onNextClick: handlers.onNext,
      onPrevClick: handlers.onPrev,
      onCloseClick: handlers.onClose,
      onDestroyStarted: handlers.onClose,
    });
    instance.highlight({
      element,
      popover: {
        title,
        description,
        side: side ?? "bottom",
        showButtons: isFirst ? ["next", "close"] : ["next", "previous", "close"],
      },
    });
  }

  export function destroyTour(): void {
    if (instance) {
      instance.destroy();
      instance = null;
    }
  }
  ```
  > **Lesson L4 — verify driver.js v1 API via Context7 before finalizing.** Confirm `setConfig`, `highlight`, `destroy`, and the callback names (`onNextClick`/`onPrevClick`/`onCloseClick`/`onDestroyStarted`) and `popover.showButtons` shape match the installed driver.js version. Adjust if the v1 API differs.
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/driver-adapter.ts && git commit -m "feat: driver.js adapter (Story 10.4)"`

- [x] **T14 — Tour server actions** [AC: 8]
  Create `apps/web/src/lib/tours/tour-actions.ts`:
  ```ts
  "use server";
  import { createServerAction } from "zsa";
  import { trpc } from "@/lib/trpc/client";
  import { saveTourProgressSchema, completeTourSchema } from "@pawly/validators";

  export const getTourStateAction = createServerAction().handler(async () => {
    return trpc.tour.getState.query();
  });

  export const saveTourProgressAction = createServerAction()
    .input(saveTourProgressSchema)
    .handler(async ({ input }) => {
      return trpc.tour.saveProgress.mutate(input);
    });

  export const completeTourAction = createServerAction()
    .input(completeTourSchema)
    .handler(async ({ input }) => {
      return trpc.tour.complete.mutate(input);
    });
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/tour-actions.ts && git commit -m "feat: tour server actions (Story 10.4)"`

- [x] **T15 — useTour hook (debounced save + complete + replay)** [AC: 8, 9]
  Create `apps/web/src/lib/tours/useTour.ts`:
  ```ts
  "use client";
  import { useCallback, useRef } from "react";
  import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
  import { saveTourProgressAction, completeTourAction } from "./tour-actions";
  import { useTourStore } from "./store";
  import { tourForRole, type TourKey, type TourRole } from "./registry";

  export function useTour() {
    const saveMutation = useServerActionMutation(saveTourProgressAction, { returnError: true });
    const completeMutation = useServerActionMutation(completeTourAction, { returnError: true });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const saveProgress = useCallback(
      (tourKey: TourKey, step: number) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          // Lesson L1: Zsa mutateAsync returns a [data, err] tuple.
          void saveMutation.mutateAsync({ tourKey, step }).then(([, err]) => {
            if (err) console.error("tour.saveProgress failed", err);
          });
        }, 1000);
      },
      [saveMutation],
    );

    const complete = useCallback(
      async (tourKey: TourKey) => {
        const [, err] = await completeMutation.mutateAsync({ tourKey }); // L1 tuple
        if (err) console.error("tour.complete failed", err);
      },
      [completeMutation],
    );

    return { saveProgress, complete };
  }

  export function useReplayTour() {
    const start = useTourStore((s) => s.start);
    return useCallback(
      (role: TourRole) => {
        const key: TourKey | null = tourForRole(role);
        if (key) start(key, 0);
      },
      [start],
    );
  }
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/lib/tours/useTour.ts && git commit -m "feat: useTour hook with debounced save + replay (Story 10.4)"`

- [x] **T16 — TourProvider orchestrator** [AC: 3, 4, 5, 6, 7]
  Create `apps/web/src/components/tour/TourProvider.tsx`:
  ```tsx
  "use client";
  import { useEffect, useRef } from "react";
  import { usePathname, useRouter } from "@/i18n/navigation";
  import { useTranslations } from "next-intl";
  import { tours, tourForRole, type TourRole } from "@/lib/tours/registry";
  import { useTourStore } from "@/lib/tours/store";
  import { useTour } from "@/lib/tours/useTour";
  import { highlightStep, destroyTour } from "@/lib/tours/driver-adapter";
  import { waitForElement } from "@/lib/tours/wait-for-element";
  import type { TourState } from "@pawly/validators";

  type Props = {
    role: TourRole;
    initialCompleted: boolean;
    initialState: TourState | null;
  };

  export function TourProvider({ role, initialCompleted, initialState }: Props) {
    const router = useRouter();
    const pathname = usePathname(); // locale-stripped pathname (e.g. "/dashboard")
    const t = useTranslations("tour");
    const { activeTour, step, isRunning, start, setStep, stop } = useTourStore();
    const { saveProgress, complete } = useTour();
    const booted = useRef(false);

    // Boot once: auto-start the role's tour if not completed.
    useEffect(() => {
      if (booted.current) return;
      booted.current = true;
      if (initialCompleted) return;
      const key = tourForRole(role);
      if (!key) return;
      const startStep = initialState && initialState.tourKey === key ? initialState.step : 0;
      start(key, startStep);
    }, [initialCompleted, initialState, role, start]);

    // Drive the current step (re-runs on step or route change).
    useEffect(() => {
      if (!isRunning || !activeTour) return;
      const def = tours[activeTour];
      let cancelled = false;

      const finish = () => {
        destroyTour();
        void complete(activeTour);
        stop();
      };

      (async () => {
        let idx = step;
        while (idx < def.steps.length) {
          const s = def.steps[idx];
          if (s.route !== pathname) {
            if (idx !== step) setStep(idx);
            router.push(s.route);
            return; // effect re-runs after navigation
          }
          const el = await waitForElement(s.selector);
          if (cancelled) return;
          if (el) {
            if (idx !== step) setStep(idx);
            const currentIdx = idx;
            const isFirst = currentIdx === 0;
            const isLast = currentIdx === def.steps.length - 1;
            highlightStep({
              element: s.selector,
              title: t(s.titleKey),
              description: t(s.bodyKey),
              side: s.placement,
              isFirst,
              isLast,
              handlers: {
                onNext: () => {
                  if (isLast) {
                    finish();
                  } else {
                    const n = currentIdx + 1;
                    setStep(n);
                    saveProgress(activeTour, n);
                  }
                },
                onPrev: () => {
                  const p = Math.max(0, currentIdx - 1);
                  setStep(p);
                  saveProgress(activeTour, p);
                },
                onClose: () => finish(),
              },
            });
            return;
          }
          // anchor missing on this route → graceful skip to next step
          idx += 1;
        }
        finish(); // no renderable step left
      })();

      return () => {
        cancelled = true;
      };
    }, [isRunning, activeTour, step, pathname, t, router, setStep, saveProgress, complete, stop]);

    // Destroy any live tour on unmount.
    useEffect(() => () => destroyTour(), []);

    return null;
  }
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/components/tour/TourProvider.tsx && git commit -m "feat: TourProvider cross-route orchestrator (Story 10.4)"`

**Frontend — mount points, anchors, replay, i18n**

- [x] **T17 — Fetch tour state in the employee layout + mount provider** [AC: 5]
  (a) Edit `apps/web/src/app/[locale]/dashboard/layout.tsx`. After the subscription guard (just before the final `return`), fetch tour state (do NOT let a failure block the page):
  ```ts
    let tourCompletedAt: string | null = null;
    let tourState: import("@pawly/validators").TourState | null = null;
    try {
      const ts = await trpc.tour.getState.query();
      tourCompletedAt = ts.tourCompletedAt;
      tourState = ts.tourState;
    } catch {
      // Tour is non-critical — render without it on failure.
    }
  ```
  Then pass to the client layout:
  ```tsx
        <DashboardLayoutClient tourCompletedAt={tourCompletedAt} tourState={tourState}>
          {children}
        </DashboardLayoutClient>
  ```
  (b) Edit `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx`. Add the import + props, and render the provider once inside the root wrapper:
  ```tsx
  import { TourProvider } from "@/components/tour/TourProvider";
  import type { TourState } from "@pawly/validators";
  ```
  Extend the component props with `tourCompletedAt: string | null` and `tourState: TourState | null`, then add inside the top-level wrapper (e.g. right after the opening `<div ...>`):
  ```tsx
        <TourProvider role="EMPLOYEE" initialCompleted={tourCompletedAt !== null} initialState={tourState} />
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/app/[locale]/dashboard/layout.tsx apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx && git commit -m "feat: mount TourProvider for employees (Story 10.4)"`

- [x] **T18 — Employee `data-tour` anchors** [AC: 5]
  Add stable anchors to the employee dashboard. In `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx`, add `data-tour="employee-greeting"` to the header brand/greeting element and `data-tour="employee-settings"` to the Settings `<Link>` (line ~40, the one with `aria-label={t("settings")}`):
  ```tsx
            <Link
              href="/dashboard/settings"
              data-tour="employee-settings"
  ```
  In the employee dashboard page component (`apps/web/src/app/[locale]/dashboard/page.tsx` or its client component under `dashboard/_components/`), add `data-tour="employee-today"` to the "Today" shift card container and `data-tour="employee-confirm"` to the presence-confirmation control (the slider/toggle described in `docs/ux/components.md` "Declarative Shift Card"). Locate these by their existing markup; add only the attribute, change nothing else.
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0. (Manual: anchors present in rendered DOM — verified in QA checklist.)
  Commit: `git add apps/web/src/app/[locale]/dashboard && git commit -m "feat: employee data-tour anchors (Story 10.4)"`

- [x] **T19 — Fetch tour state in the admin layout + mount provider** [AC: 6]
  (a) Edit `apps/web/src/app/[locale]/admin/layout.tsx`. After the subscription block, fetch tour state with the same try/catch pattern as T17, then pass `tourCompletedAt` + `tourState` into `<AdminLayoutClient ...>`.
  (b) Edit `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — add the `TourProvider` import + `TourState` type, extend props with `tourCompletedAt: string | null` and `tourState: TourState | null`, and render once inside the root `<div className="min-h-screen ...">`:
  ```tsx
        <TourProvider role="ADMIN" initialCompleted={tourCompletedAt !== null} initialState={tourState} />
  ```
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/app/[locale]/admin/layout.tsx apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx && git commit -m "feat: mount TourProvider for admins (Story 10.4)"`

- [x] **T20 — Admin `data-tour` anchors (nav + screens)** [AC: 6]
  In `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx`: add `data-tour="admin-nav-employees"` and `data-tour="admin-nav-planning"` to the corresponding admin nav links/tab-pills, and `data-tour="admin-dashboard"` to the main dashboard content container (or the nav "Dashboard" pill).
  In the admin Employees page (`apps/web/src/app/[locale]/admin/employees/...`): add `data-tour="admin-add-employee"` to the primary "Add employee" button.
  In the admin Planning page (`apps/web/src/app/[locale]/admin/planning/...`): add `data-tour="admin-generate"` to the "Auto-Generate" CTA (the Sparkles button per `docs/ux/components.md`).
  Add only the attributes; change nothing else.
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/app/[locale]/admin && git commit -m "feat: admin data-tour anchors (Story 10.4)"`

- [x] **T21 — Replay entries** [AC: 9]
  (a) Admin — in `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx`, inside the `{!isOnboarding && (...)}` header block (next to the Bell button, ~line 257), add a replay button:
  ```tsx
                <button
                  type="button"
                  onClick={() => replayTour("ADMIN")}
                  className="p-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={tTour("replayGuide")}
                  title={tTour("replayGuide")}
                >
                  <HelpCircle size={20} />
                </button>
  ```
  Add the needed imports/hooks at the top of the component:
  ```tsx
  import { HelpCircle } from "lucide-react";
  import { useReplayTour } from "@/lib/tours/useTour";
  // inside the component:
  const replayTour = useReplayTour();
  const tTour = useTranslations("tour");
  ```
  (b) Employee — in `apps/web/src/app/[locale]/dashboard/settings/_components/SettingsPageClient.tsx`, add a "Revoir le guide" row/button that calls `useReplayTour()("EMPLOYEE")` then navigates to `/dashboard` via `useRouter()` from `@/i18n/navigation`:
  ```tsx
  import { useReplayTour } from "@/lib/tours/useTour";
  import { useRouter } from "@/i18n/navigation";
  // inside the component:
  const replayTour = useReplayTour();
  const router = useRouter();
  const handleReplayTour = () => {
    replayTour("EMPLOYEE");
    router.push("/dashboard");
  };
  ```
  Render a button bound to `handleReplayTour` labelled `t("replayGuide")` from the `tour` namespace.
  Run: `pnpm --filter ./apps/web exec tsc --noEmit`
  Expected: exit 0.
  Commit: `git add apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx apps/web/src/app/[locale]/dashboard/settings && git commit -m "feat: tour replay entries (Story 10.4)"`

- [x] **T22 — i18n `tour` namespace (FR + EN)** [AC: 10]
  Add a `"tour"` key to BOTH `apps/web/src/i18n/langs/fr.json` and `apps/web/src/i18n/langs/en.json`. FR (`fr.json`):
  ```json
  "tour": {
    "replayGuide": "Revoir le guide",
    "employee": {
      "greeting": { "title": "Bienvenue sur Pawly", "body": "Voici votre espace personnel. Laissez-vous guider en quelques étapes." },
      "today": { "title": "Votre planning", "body": "Votre journée et vos prochains créneaux s'affichent ici." },
      "confirm": { "title": "Confirmer votre présence", "body": "Glissez pour confirmer que vous étiez bien présent·e." },
      "settings": { "title": "Vos réglages", "body": "Changez votre langue ou rejouez ce guide quand vous voulez." }
    },
    "admin": {
      "dashboard": { "title": "Votre tableau de bord", "body": "Vue d'ensemble de votre clinique." },
      "employeesNav": { "title": "Vos employés", "body": "Commencez par ajouter votre équipe ici." },
      "addEmployee": { "title": "Ajouter un employé", "body": "Créez votre premier employé pour pouvoir planifier." },
      "planningNav": { "title": "Le planning", "body": "C'est ici que vous générez et ajustez les plannings." },
      "generate": { "title": "Générer un planning", "body": "Cliquez pour générer votre premier planning automatiquement." }
    }
  }
  ```
  EN (`en.json`) — same keys, English values:
  ```json
  "tour": {
    "replayGuide": "Replay the guide",
    "employee": {
      "greeting": { "title": "Welcome to Pawly", "body": "This is your personal space. Let us walk you through it." },
      "today": { "title": "Your schedule", "body": "Your day and upcoming shifts appear here." },
      "confirm": { "title": "Confirm your presence", "body": "Swipe to confirm you were present." },
      "settings": { "title": "Your settings", "body": "Change your language or replay this guide anytime." }
    },
    "admin": {
      "dashboard": { "title": "Your dashboard", "body": "An overview of your clinic." },
      "employeesNav": { "title": "Your employees", "body": "Start by adding your team here." },
      "addEmployee": { "title": "Add an employee", "body": "Create your first employee so you can schedule." },
      "planningNav": { "title": "Planning", "body": "This is where you generate and adjust schedules." },
      "generate": { "title": "Generate a schedule", "body": "Click to auto-generate your first schedule." }
    }
  }
  ```
  > Insert as a sibling of the existing top-level namespaces (e.g. after `"settings"`). Keep both files key-identical (NFR20).
  Run: `pnpm --filter ./apps/web exec tsc --noEmit` and validate JSON parses: `node -e "require('./apps/web/src/i18n/langs/fr.json'); require('./apps/web/src/i18n/langs/en.json'); console.log('ok')"`
  Expected: prints `ok`, exit 0.
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat: tour i18n namespace FR/EN (Story 10.4)"`

**Frontend — tests**

- [x] **T23 — Registry + tourForRole tests (vitest)** [AC: 3]
  Create `apps/web/src/lib/tours/registry.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { tours, tourForRole, type TourKey } from "./registry";

  describe("tour registry", () => {
    it("every tour has a role and at least one step", () => {
      (Object.keys(tours) as TourKey[]).forEach((key) => {
        expect(["ADMIN", "EMPLOYEE"]).toContain(tours[key].role);
        expect(tours[key].steps.length).toBeGreaterThan(0);
      });
    });

    it("every step has route, selector and i18n keys", () => {
      (Object.keys(tours) as TourKey[]).forEach((key) => {
        tours[key].steps.forEach((s) => {
          expect(s.route.startsWith("/")).toBe(true);
          expect(s.selector).toMatch(/^\[data-tour="/);
          expect(s.titleKey.length).toBeGreaterThan(0);
          expect(s.bodyKey.length).toBeGreaterThan(0);
        });
      });
    });

    it("tourForRole maps roles to the right tour", () => {
      expect(tourForRole("EMPLOYEE")).toBe("employee-onboarding");
      expect(tourForRole("ADMIN")).toBe("admin-onboarding");
    });
  });
  ```
  Run: `pnpm --filter ./apps/web exec vitest run src/lib/tours/registry.test.ts`
  Expected: `Test Files 1 passed`, `Tests 3 passed`, exit 0.
  Commit: `git add apps/web/src/lib/tours/registry.test.ts && git commit -m "test: tour registry tests (Story 10.4)"`

- [x] **T24 — waitForElement tests (vitest, jsdom)** [AC: 4]
  Create `apps/web/src/lib/tours/wait-for-element.test.ts`:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { waitForElement } from "./wait-for-element";

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("waitForElement", () => {
    it("resolves immediately when the element exists", async () => {
      document.body.innerHTML = `<div data-tour="x"></div>`;
      const el = await waitForElement('[data-tour="x"]', 1000, 50);
      expect(el).not.toBeNull();
    });

    it("resolves null after timeout when the element is absent", async () => {
      const el = await waitForElement('[data-tour="missing"]', 300, 50);
      expect(el).toBeNull();
    });

    it("resolves once the element appears before timeout", async () => {
      setTimeout(() => {
        document.body.innerHTML = `<div data-tour="late"></div>`;
      }, 120);
      const el = await waitForElement('[data-tour="late"]', 1000, 50);
      expect(el).not.toBeNull();
    });
  });
  ```
  > Requires the vitest jsdom environment. If the project's vitest config isn't jsdom by default, add `// @vitest-environment jsdom` as the first line of the file.
  Run: `pnpm --filter ./apps/web exec vitest run src/lib/tours/wait-for-element.test.ts`
  Expected: `Tests 3 passed`, exit 0.
  Commit: `git add apps/web/src/lib/tours/wait-for-element.test.ts && git commit -m "test: waitForElement tests (Story 10.4)"`

**Verification**

- [x] **T25 — Full type-check + targeted test sweep** [AC: all]
  Run, in order:
  - `pnpm --filter ./apps/api exec tsc --noEmit -p tsconfig.json`
  - `pnpm --filter ./apps/web exec tsc --noEmit`
  - `pnpm --filter ./apps/api exec jest src/modules/tour`
  - `pnpm --filter ./apps/web exec vitest run src/lib/tours`
  Expected: all four exit 0; jest `Tests: 4 passed`; vitest `Tests 6 passed`.
  Commit: nothing to commit (verification only). If fixes are needed, commit them with `fix: ...` referencing Story 10.4.

- [ ] **T26 — Manual QA checklist (Lesson L2 — no E2E harness exists)** [AC: 5, 6, 7, 9]
  No Playwright/Cypress in the repo (setting one up is a separate future story). Run `pnpm dev` from root and manually verify, recording results in the Dev Agent Record → Test output:
  1. New EMPLOYEE (or a user with `tourCompletedAt` reset to NULL) lands on `/dashboard` → employee tour auto-starts on the greeting anchor.
  2. Click "Suivant" through all steps → last step "Terminer" closes the tour; reload `/dashboard` → tour does NOT reappear.
  3. Reset `tourCompletedAt` to NULL for an ADMIN → `/admin/dashboard` auto-starts the admin tour; clicking "Suivant" navigates dashboard → employees → planning, re-anchoring each time.
  4. Mid-admin-tour, hard-refresh on `/admin/employees` → tour resumes at the same step (reads `tourState`).
  5. Temporarily remove a `data-tour` anchor → the tour polls then skips to the next step without freezing.
  6. Click "Passer"/close mid-tour → tour ends and does NOT reappear on reload (skip marks complete).
  7. Replay: completed employee opens `/dashboard/settings` → "Revoir le guide" restarts the tour from step 0; completed admin clicks the header help icon → admin tour restarts.
  8. Switch locale FR↔EN → tour copy is translated in both.
  Commit: `git add docs/stories/10-4-onboarding-tour-engine.md && git commit -m "docs: record manual QA results for tour engine (Story 10.4)"` (after filling the Dev Agent Record).

## Dev Notes

### Architecture (authoritative: `docs/adr/0001-tour-engine.md`)

- **Renderer:** `driver.js` (MIT, client-only) wrapped by `driver-adapter.ts`. The multi-page + resume + graceful-skip orchestration is OUR code (`TourProvider` + store + registry), not the library's.
- **Data flow (NON-NEGOTIABLE):** `Page → Client Component → Hook → Zsa → Server Action → tRPC → NestJS`. Tour persistence follows it: `useTour` → `tour-actions.ts` (Zsa) → `trpc.tour.*` → `tour.router` → `TourService` → Prisma.
- **State split:** runtime tour state = Zustand (`store.ts`, UI state per architecture); persisted state = DB (`User.tourCompletedAt` + `User.tourState`) via tRPC.
- **Procedures:** `tour.*` use `protectedProcedure` (auth only), NOT `subscribedProcedure` — must work pre-subscription (Lesson L2 onboarding-deadlock).
- **Theme:** style the driver popover (`.pawly-tour`) with the app's shadcn semantic tokens (`bg-background`, `text-foreground`, `border-border`, `bg-primary`) — the current "Warm Linen" theme uses CSS-var tokens, not the older hardcoded Vet Teal. Add a small CSS override for `.pawly-tour` in the web global stylesheet if needed.
- **Anchors:** target stable `data-tour="..."` attributes (added in T18/T20), never CSS classes (fragile to refactors) — per ADR consequences.

### Lessons applied (`docs/lessons.md`)

- **L1 (Zsa tuple):** `useServerActionMutation(..., { returnError: true }).mutateAsync()` returns `[data, err]`. `useTour.ts` destructures the tuple on every call (T15). Do NOT write `const x = await mutateAsync(...)`.
- **L2 (E2E for multi-step flows):** the tour is a multi-step flow; no Playwright harness exists → covered by unit tests (T8/T23/T24) **plus** the manual QA checklist (T26). Setting up Playwright is out of scope (future story).
- **L4 (consult up-to-date docs):** verify the driver.js v1 API via Context7 before finalizing `driver-adapter.ts` (T13). driver.js maintenance/API confirmed current as of 2026-06 (MIT, zero-dep).
- **L5 (SWC `.d.ts`):** the new `tour.router` adds types consumed by the web app via `@pawly/api/trpc-types`. The `tsc --emitDeclarationOnly` pass in `apps/api` build must still cover them — do not remove it. Verify a clean `turbo run build` emits the tour types before declaring done.

### Existing code at write time (Step-0 verbatim quotes)

`apps/api/prisma/schema/User.prisma:1-31` (current) — fields added after `otpFallbackUntil`:
```prisma
enum Role { ADMIN  EMPLOYEE }
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String?
  role      Role     @default(EMPLOYEE)
  clinicId  String   @map("clinic_id")
  clinic    Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  locale  String   @default("fr")
  otpFallbackUntil DateTime? @map("otp_fallback_until")
  // ...relations + createdAt/updatedAt + @@index([clinicId])
}
```
Precedent: `Clinic.prisma` already has `onboardingCompleted Boolean @default(false)` + `onboardingDraft Json? @map("onboarding_draft")` — the tour fields mirror this Json-persistence pattern.

`apps/api/src/trpc/routers/_app.ts` (current) merges routers via `router({ auth, stripe, clinic, employee, planning, variance, dashboard, employeeSchedule, presenceConfirmation })`. Add `tour: tourRouter`.

`apps/api/src/trpc/context.ts:22-41` — `TRPCServices` interface lists every service ending with `mailService; jwtService; prisma; redis;`. Add `tourService: TourService;`. `ctx.user = { sub, email, role, clinicId }` → user id is `ctx.user.sub`.

`apps/api/src/trpc/trpc.module.ts` — `TRPCMiddleware` and `TRPCService` each take all services as constructor params and assemble a `TRPCServices` object; `@Module.imports` lists `MailModule, PrismaModule`. Add `tourService` to both constructors + both service objects, and `TourModule` to imports.

`apps/api/src/modules/clinic/clinic.service.ts:1-24,203-227` (pattern) — `@Injectable()` class, `constructor(private readonly prisma: PrismaService)`, `saveOnboardingDraft(clinicId, draft)` does `prisma.clinic.update({ where: { id: clinicId }, data: { onboardingDraft: draft as any } })`. `TourService` mirrors this on the `user` model.

`apps/web/.../auth/activate/_hooks/useActivateAccount.ts:1-35` (pattern) — `useServerActionMutation(action, { returnError: true })`; `const [data, err] = await mutation.mutateAsync(...)`. This is the L1 tuple pattern `useTour.ts` must follow.

`apps/web/.../admin/onboarding/_actions/onboarding-actions.ts` (pattern) — `createServerAction().input(schema).handler(async ({ input }) => trpc.clinic.X.mutate(input))` and `.handler(async () => trpc.clinic.Y.query())`. `tour-actions.ts` mirrors this.

`apps/web/.../dashboard/layout.tsx:1-80` — server layout; fetches `me` via `trpc.auth.getMe.query()`, guards EMPLOYEE role + subscription, renders `<DashboardLayoutClient>`. Add the `trpc.tour.getState.query()` fetch + pass props.

`apps/web/.../admin/layout.tsx:1-110` — server layout; auth + onboarding + subscription guards, renders `<AdminLayoutClient clinicName=...>`. Add tour fetch + pass props.

`apps/web/.../admin/_components/AdminLayoutClient.tsx:240-266` — header with `LanguageSwitcher`, Bell button, logout `Button`, inside `{!isOnboarding && (...)}`. Add the replay `<button>` here; mount `<TourProvider role="ADMIN" .../>` in the root `<div>`.

`apps/web/.../dashboard/_components/DashboardLayoutClient.tsx:32-52` — header with `PawlyLogo` + Settings `<Link aria-label={t("settings")}>`. Add `data-tour` anchors + mount `<TourProvider role="EMPLOYEE" .../>`.

### File decisions (3-bullet per new file)

- `apps/api/src/modules/tour/tour.service.ts` — persists/reads per-user tour state; in: PrismaService; out: `getState/saveProgress/complete`.
- `apps/api/src/modules/tour/tour.module.ts` — Nest module wiring TourService; in: PrismaModule; out: TourService provider.
- `apps/api/src/trpc/routers/tour.router.ts` — tRPC surface for tour state; in: `@pawly/validators`, `ctx.tourService`; out: `tourRouter` + `TourRouter` type.
- `packages/validators/src/tour/tour.schema.ts` — single source of tour Zod schemas/types; in: `@pawly/zod`; out: schemas + `TourState`.
- `apps/web/src/lib/tours/registry.ts` — declares tours (key→role+steps) + `tourForRole`; in: none; out: `tours`, types, `tourForRole`.
- `apps/web/src/lib/tours/store.ts` — Zustand runtime tour state; in: zustand; out: `useTourStore`.
- `apps/web/src/lib/tours/driver-adapter.ts` — wraps driver.js highlight/destroy; in: driver.js; out: `highlightStep`, `destroyTour`.
- `apps/web/src/lib/tours/wait-for-element.ts` — DOM polling for graceful skip; in: none; out: `waitForElement`.
- `apps/web/src/lib/tours/tour-actions.ts` — Zsa server actions bridging to tRPC; in: zsa, trpc client, validators; out: 3 actions.
- `apps/web/src/lib/tours/useTour.ts` — debounced save + complete + replay hooks; in: server-action-hooks, actions, store, registry; out: `useTour`, `useReplayTour`.
- `apps/web/src/components/tour/TourProvider.tsx` — cross-route orchestrator (boot/drive/skip/resume); in: registry, store, useTour, adapter, wait-for-element, i18n nav; out: `<TourProvider>`.

### Testing

- API: Jest `*.spec.ts` (`pnpm --filter ./apps/api exec jest <path>`).
- Web: Vitest `*.test.ts(x)` (`pnpm --filter ./apps/web exec vitest run <path>`).
- No E2E harness — manual QA checklist (T26) covers the end-to-end multi-step flow (L2).

### Dependencies

- New: `driver.js` (MIT, `apps/web`). Existing reused: `zustand`, `zsa`, `@pawly/zod`, `@pawly/validators`, `next-intl`, shadcn/ui.

## File List

**Create:**
- `apps/api/prisma/backfill/tour-admins.ts`
- `apps/api/src/modules/tour/tour.service.ts`
- `apps/api/src/modules/tour/tour.service.spec.ts`
- `apps/api/src/modules/tour/tour.module.ts`
- `apps/api/src/trpc/routers/tour.router.ts`
- `packages/validators/src/tour/tour.schema.ts`
- `packages/validators/src/tour/index.ts`
- `apps/web/src/lib/tours/registry.ts`
- `apps/web/src/lib/tours/store.ts`
- `apps/web/src/lib/tours/driver-adapter.ts`
- `apps/web/src/lib/tours/wait-for-element.ts`
- `apps/web/src/lib/tours/tour-actions.ts`
- `apps/web/src/lib/tours/useTour.ts`
- `apps/web/src/lib/tours/registry.test.ts`
- `apps/web/src/lib/tours/wait-for-element.test.ts`
- `apps/web/src/components/tour/TourProvider.tsx`

**Modify:**
- `apps/api/prisma/schema/User.prisma`
- `apps/api/src/trpc/routers/_app.ts`
- `apps/api/src/trpc/context.ts`
- `apps/api/src/trpc/trpc.module.ts`
- `packages/validators/src/index.ts`
- `apps/web/package.json` (+ `pnpm-lock.yaml`)
- `apps/web/src/app/[locale]/dashboard/layout.tsx`
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx`
- `apps/web/src/app/[locale]/dashboard/page.tsx` (+ dashboard `_components` for today/confirm anchors)
- `apps/web/src/app/[locale]/dashboard/settings/_components/SettingsPageClient.tsx`
- `apps/web/src/app/[locale]/admin/layout.tsx`
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx`
- `apps/web/src/app/[locale]/admin/employees/...` (add-employee anchor)
- `apps/web/src/app/[locale]/admin/planning/...` (generate anchor)
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

## Dev Agent Record

- **Model:** claude-opus-4-8[1m] (Opus 4.8, 1M context) — via `aped-dev`
- **Started:** 2026-06-17
- **Completed:** 2026-06-17 (code T1–T25; T26 manual QA pending Alex)

### Summary

Implemented the generic, role-aware, resumable first-run tour engine end-to-end through TDD.

- **Backend:** `User.tourCompletedAt` + `tourState Json?` (Prisma, `db:push` to Neon — additive); one-off backfill marked 9 existing ADMINs as tour-completed. `TourService` (4 Jest tests) backed by `tour.router` on `protectedProcedure` (NOT subscribed — L2), wired into the tRPC DI context like `MailService` (Story 10.3 precedent).
- **Engine (web):** `driver.js@^1.4.0` renderer behind `driver-adapter.ts` (v1 API verified via Context7 — L4); tour `registry` + Zustand `store` + `waitForElement` graceful-skip helper (6 Vitest tests); persistence via the mandated `useTour → Zsa action → trpc.tour.* → Nest` flow with a ~1s debounced save and correct `[data, err]` tuple destructuring (L1); `TourProvider` cross-route orchestrator (boot-once, resume-at-step, graceful skip, finish-on-last/skip).
- **Integration:** providers mounted in both authenticated layouts (tour fetch wrapped in try/catch so it never blocks the page), stable `data-tour` anchors on the employee dashboard + admin nav/screens, replay entries (admin header `HelpCircle`, employee settings), and a bilingual `tour` namespace (19 keys, FR/EN parity verified — NFR20).

### Files changed

**Create (API):** `prisma/backfill/tour-admins.ts`, `modules/tour/{tour.service.ts, tour.service.spec.ts, tour.module.ts}`, `trpc/routers/tour.router.ts`.
**Create (validators):** `src/tour/{tour.schema.ts, index.ts}`.
**Create (web):** `lib/tours/{registry.ts, store.ts, driver-adapter.ts, wait-for-element.ts, tour-actions.ts, useTour.ts, registry.test.ts, wait-for-element.test.ts}`, `components/tour/TourProvider.tsx`.
**Modify (API):** `prisma/schema/User.prisma`, `trpc/{context.ts, trpc.module.ts, routers/_app.ts}`, `packages/validators/src/index.ts`.
**Modify (web):** `package.json` (+lockfile), `app/[locale]/dashboard/{layout.tsx, _components/DashboardLayoutClient.tsx, _components/DashboardClient.tsx, settings/_components/SettingsPageClient.tsx}`, `app/[locale]/admin/{layout.tsx, _components/AdminLayoutClient.tsx, employees/_components/EmployeeList.tsx, planning/_components/GenerationPanel.tsx}`, `i18n/langs/{fr,en}.json`.

### Deviations

1. **Epic-context cache** (`docs/epics-context/epic-10-context.md`) was missing (BMAD→APED migration gap); generated via `aped-story` before dev, on Alex's instruction.
2. **TDD ordering:** tests-first for the 3 logic-bearing units (T8→T4, T23→T10, T24→T12) to honour aped-dev's Iron Law; the story listed them after the impl.
3. **T2 backfill** instantiates Prisma via the `PrismaPg` adapter — Prisma 7's datasource has no `url`, so the story's bare `new PrismaClient()` could not connect to Neon.
4. **T4** casts the Json write as `Prisma.InputJsonValue` (type-safe) instead of `as object`, and clears the column with `Prisma.DbNull` (per the story's own note).
5. **T20** admin nav anchors (`admin-nav-employees/planning`) sit on the visible group-dropdown triggers via a `navGroupTourAnchor` helper — those nav items live inside collapsible dropdowns, not flat pills.
6. **L5** required emitting `dist/trpc-types.d.ts` (`tsc -p tsconfig.types.json` / full `nest build`) before the web could resolve `trpc.tour.*`; verified `_app.d.ts` includes the tour router.

### Test output

- `apps/api jest src/modules/tour` → **Tests: 4 passed**.
- `apps/web vitest run src/lib/tours` → **Test Files 2 passed, Tests 6 passed** (registry 3 + waitForElement 3).
- `apps/web tsc --noEmit` → **0 errors**.
- `apps/api tsc --noEmit -p tsconfig.json` → **20 errors, all pre-existing** in unrelated spec files (`employee/planning/variance .service.spec.ts`); **0** in tour code. Flagged for separate cleanup — not introduced by this story.
- **L5 build:** `nest build` (138 files, SWC) + `tsc -p tsconfig.types.json` → `dist/trpc/routers/_app.d.ts` includes `tour`/`tourService` ✓.
- **DB:** `db:push` → "in sync"; backfill → "Backfilled 9 ADMIN user(s) as tour-completed."
- **i18n:** FR/EN `tour` namespace key parity = 19/19 identical (NFR20).

**T26 manual QA — pending.** Requires a running app + auth + a user with `tourCompletedAt = NULL` (cannot be done headlessly). The 8-point checklist in T26 is ready for Alex to execute via `pnpm dev`.

### Self-review & fixes (adversarial workflow)

A 4-dimension adversarial review (orchestration, lessons, security, anchors/i18n) was run over the diff with per-finding refutation. 4 findings confirmed, 0 false positives.

- **Fixed** (commit `fix: stabilize tour callbacks + guard saveProgress…`):
  - _medium_ — the TourProvider drive effect re-ran on every react-query mutation transition (the `saveProgress`/`complete` callbacks closed over the unstable mutation object), re-animating the current step → popover flicker. Fixed by keeping the mutations in refs so the callbacks are referentially stable.
  - _low_ — `complete()` did not cancel a pending debounced `saveProgress`, and the server wrote progress unconditionally → a late save could leave a completed tour with non-null `tourState`. Fixed: `complete()` clears the debounce; `TourService.saveProgress` now writes only `where tourCompletedAt: null`.
  - _low_ — the debounce timer was never cleared on unmount. Fixed with a cleanup effect.
- **Deferred (product decision for Alex)** — _low_: the employee `today`/`confirm` anchors live inside shift-conditional markup, so a first-run employee with **no shift scheduled today** sees only the greeting + settings steps (the other two graceful-skip per AC4). This is tolerated by AC4 but diverges from grill-summary Q6 ("anchor on STABLE layout elements that tolerate an empty timeline"). Options: anchor `employee-today` on a stable container / empty-state, or seed a sample shift for first-run. Story task T18 directed the current placement; left as-is pending Alex's call.
