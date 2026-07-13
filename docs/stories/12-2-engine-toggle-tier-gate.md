# Story: 12-2-engine-toggle-tier-gate — Engine Selector in the Generation Panel (Professional-gated)

**Epic:** Epic 12 — Planning Optimality (Phase 3)
**Status:** ready-for-dev
**Branch:** feature/KON-130-12-2-engine-toggle-tier-gate
**Ticket:** KON-130 (Linear · project Pawly · related to KON-129)
**Origin:** Follow-up to story 12-1: the `engine: 'greedy' | 'cpsat'` flag on `planning.generatePlan` is live but tRPC-only and NOT tier-gated — any subscribed admin can force the solver today. FR16 makes cpsat a Professional feature; "Transparency over Magic" (ux/flows.md) requires the served engine to be visible.

> **Read first:** `docs/epics-context/epic-12-context.md` (§ 8 has 12-1's contracts: `generatePlanSchema.engine`, `generationStatsSchema.engine` — the SERVED engine). **Verified live 2026-07-10 (project memory):** generation itself is NOT API-gated (Starter generates with greedy); only equity/rules use `requireProfessional`. This story gates the cpsat VALUE, not the procedure.

## User Story

**As a** Professional clinic admin, **I want** to choose the exact solver from the generation panel and see which engine actually produced the served plan, **so that** I get CP-SAT optimization without hidden magic — and as a Starter admin, I clearly see it is a Pro feature.

## Acceptance Criteria

1. **Given** a Professional admin on the planning generation panel, **When** they enable the exact-engine switch and generate, **Then** the generation request carries the cpsat engine and, after generation, the served engine is visible (persistent badge + toast).
2. **Given** a Starter admin on the panel, **When** the panel renders, **Then** the exact-engine switch is disabled with a "Pro" badge and an upgrade hint, and generation still works with the standard engine.
3. **Given** a Starter subscription, **When** `planning.generatePlan` is called with `engine: 'cpsat'` from ANY client, **Then** the API rejects with FORBIDDEN (`Subscription tier 'professional' required`) and no generation runs; with `engine: 'greedy'` or omitted it succeeds unchanged.
4. **Given** a cpsat generation whose solver found no strict improvement (`stats.engine === 'greedy'` served), **When** the result arrives, **Then** the admin is informed the standard plan was served — informational, never styled as an error.
5. **Given** the switch off (its default), **Then** requests and results are byte-identical to today (`engine: 'greedy'`).
6. **Given** any new UI string, **Then** it exists in BOTH the French and English translation files (NFR20).
7. **Given** the running app (live check, lesson L2), **Then** the switch renders in the panel, the Starter locked state is verified visually via React Grab, and a real cpsat generation surfaces the served-engine badge.

## Tasks

- [ ] **Task 1 — RED: router tier-gate spec** [AC: 3]

  In `apps/api/src/trpc/routers/planning.router.spec.ts`, add a Starter caller helper next to `createAdminCaller` (same shape, tier flipped):

  ```ts
  const createStarterAdminCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      ...activeSubscription,
      entitlementTier: 'starter',
    });
    return createCaller({
      user: authenticatedAdmin,
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      planningService: mockPlanningService as any,
      planningTemplateService: mockPlanningTemplateService as any,
      equityCounterService: mockEquityCounterService as any,
      planningGenerationService: mockPlanningGenerationService as any,
      apprenticeDeclarationService: mockApprenticeDeclarationService as any,
    } as any);
  };
  ```

  Then, inside the existing `generatePlan` describe (next to the Story 12-1 engine-forwarding test), add:

  ```ts
    // Story 12-2 (KON-130) — AC3 (verbatim): "Given a Starter subscription, When
    // planning.generatePlan is called with engine: 'cpsat' from ANY client, Then
    // the API rejects with FORBIDDEN and no generation runs; with engine: 'greedy'
    // or omitted it succeeds unchanged."
    it('rejects engine cpsat for a starter tier with FORBIDDEN', async () => {
      const caller = createStarterAdminCaller();
      await expect(
        caller.generatePlan({
          month: '2026-03',
          templateId: '550e8400-e29b-41d4-a716-446655440000',
          engine: 'cpsat',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        mockPlanningGenerationService.generateMonthlyPlan,
      ).not.toHaveBeenCalled();
    });

    it('allows engine greedy (and default) for a starter tier', async () => {
      const caller = createStarterAdminCaller();
      mockPlanningGenerationService.generateMonthlyPlan.mockResolvedValue({
        assignments: [],
        holes: [],
        violations: { hard: [], soft: [] },
        stats: {
          totalSlots: 0,
          filledSlots: 0,
          holeCount: 0,
          hardViolationCount: 0,
          softWarningCount: 0,
          engine: 'greedy',
        },
      });
      await caller.generatePlan({
        month: '2026-03',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(
        mockPlanningGenerationService.generateMonthlyPlan,
      ).toHaveBeenCalledWith(
        'clinic-123',
        '2026-03',
        '550e8400-e29b-41d4-a716-446655440000',
        { acknowledgePublishedChange: false, engine: 'greedy' },
      );
    });

    it('allows engine cpsat for a professional tier', async () => {
      const caller = createAdminCaller();
      mockPlanningGenerationService.generateMonthlyPlan.mockResolvedValue({
        assignments: [],
        holes: [],
        violations: { hard: [], soft: [] },
        stats: {
          totalSlots: 0,
          filledSlots: 0,
          holeCount: 0,
          hardViolationCount: 0,
          softWarningCount: 0,
          engine: 'cpsat',
        },
      });
      await caller.generatePlan({
        month: '2026-03',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
        engine: 'cpsat',
      });
      expect(
        mockPlanningGenerationService.generateMonthlyPlan,
      ).toHaveBeenCalledWith(
        'clinic-123',
        '2026-03',
        '550e8400-e29b-41d4-a716-446655440000',
        { acknowledgePublishedChange: false, engine: 'cpsat' },
      );
    });
  ```

  Run: `pnpm --filter @pawly/api test planning.router`
  Expected RED: `rejects engine cpsat for a starter tier with FORBIDDEN` fails (the call resolves — no gate yet). Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/trpc/routers/planning.router.spec.ts && git commit -m "test(KON-130): RED — cpsat tier gate on generatePlan [AC-3]"`

- [ ] **Task 2 — GREEN: router gate** [AC: 3, 5]

  In `apps/api/src/trpc/routers/planning.router.ts`, inside the `generatePlan` mutation, insert the gate between `adminOnly(ctx.user.role);` and the `try {`:

  ```ts
      adminOnly(ctx.user.role);
      // Story 12-2 (KON-130) — the exact solver is a Professional feature (FR16).
      // Gate the VALUE, not the procedure: greedy generation stays Starter-accessible.
      if (input.engine === 'cpsat') {
        requireProfessional(ctx.subscription.entitlementTier);
      }
      try {
  ```

  `requireProfessional` already lives in this file (used by the equity/rules procedures) — no import needed.

  Run: `pnpm --filter @pawly/api test planning.router`
  Expected: `Tests: 89 passed` (86 existing + 3 new), exit 0.
  Commit: `git add apps/api/src/trpc/routers/planning.router.ts && git commit -m "feat(KON-130): cpsat engine is Professional-gated at the API [AC-3]"`

- [ ] **Task 3 — i18n: engine strings (FR + EN)** [AC: 6]

  In `apps/web/src/i18n/langs/fr.json`, inside `admin.planningGeneration`, add the `engine` group (sibling of `toast`) and extend `toast`:

  ```json
  "engine": {
    "label": "Moteur exact (CP-SAT)",
    "hint": "Le solveur tente d'améliorer le planning généré — servi uniquement s'il fait strictement mieux.",
    "proHint": "Disponible avec l'abonnement Professional.",
    "proBadge": "Pro",
    "servedCpsat": "Optimisé par le solveur",
    "servedGreedy": "Moteur standard"
  }
  ```

  and in `admin.planningGeneration.toast`:

  ```json
  "generatedCpsat": "Planning optimisé par le solveur",
  "cpsatNoImprovement": "Le solveur n'a pas trouvé mieux — plan standard servi (déjà optimal)."
  ```

  In `apps/web/src/i18n/langs/en.json`, same paths:

  ```json
  "engine": {
    "label": "Exact engine (CP-SAT)",
    "hint": "The solver tries to improve the generated schedule — served only when strictly better.",
    "proHint": "Available with the Professional plan.",
    "proBadge": "Pro",
    "servedCpsat": "Solver-optimized",
    "servedGreedy": "Standard engine"
  }
  ```

  ```json
  "generatedCpsat": "Schedule optimized by the solver",
  "cpsatNoImprovement": "The solver found no improvement — standard plan served (already optimal)."
  ```

  Run: `pnpm --filter @pawly/web test generation`
  Expected: existing suite still green (translation mocks return key names; JSON edits cannot break it — this run is the regression guard).
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(KON-130): engine selector strings fr/en [AC-6]"`

- [ ] **Task 4 — RED: panel + hook spec** [AC: 1, 2, 4, 5]

  In `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx`:

  1. Next to the existing hook mocks (after the `useTemplates` mock), add the subscription-context mock with a mutable gate:

  ```ts
  // Story 12-2 (KON-130) — the panel consumes useSubscription for the Pro gate.
  const mockCanAccessFeature = vi.fn(() => true);
  vi.mock('@/lib/contexts/subscription-context', () => ({
    useSubscription: () => ({ canAccessFeature: mockCanAccessFeature }),
  }));
  ```

  2. Add a `beforeEach` reset if the file has one (`mockCanAccessFeature.mockReturnValue(true)`), and a new describe at the end of the `GenerationPanel` describe:

  ```tsx
  describe('engine selector (KON-130)', () => {
    // AC1 (verbatim from story 12-2): "When they enable the exact-engine switch and
    // generate, Then the generation request carries the cpsat engine".
    it('passes engine cpsat when the switch is enabled (professional)', async () => {
      const generatePlan = vi.fn();
      const { useGeneration } = await import('../_hooks/useGeneration');
      vi.mocked(useGeneration).mockReturnValue({
        shifts: [],
        isLoadingShifts: false,
        isFetchingShifts: false,
        refetchShifts: vi.fn(),
        generatePlan,
        isGenerating: false,
        deleteGenerated: vi.fn(),
        isDeleting: false,
        invalidateAll: vi.fn(),
      } as any);
      render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByText('Template A')); // select a template
      fireEvent.click(screen.getByRole('switch')); // enable the exact engine
      fireEvent.click(screen.getByText('generateButton'));
      expect(generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({ engine: 'cpsat' }),
        expect.anything(),
      );
    });

    // AC5 (verbatim): "Given the switch off (its default), Then requests and
    // results are byte-identical to today (engine: 'greedy')".
    it('passes engine greedy by default (switch off)', async () => {
      const generatePlan = vi.fn();
      const { useGeneration } = await import('../_hooks/useGeneration');
      vi.mocked(useGeneration).mockReturnValue({
        shifts: [],
        isLoadingShifts: false,
        isFetchingShifts: false,
        refetchShifts: vi.fn(),
        generatePlan,
        isGenerating: false,
        deleteGenerated: vi.fn(),
        isDeleting: false,
        invalidateAll: vi.fn(),
      } as any);
      render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByText('Template A'));
      fireEvent.click(screen.getByText('generateButton'));
      expect(generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({ engine: 'greedy' }),
        expect.anything(),
      );
    });

    // AC2 (verbatim): "Then the exact-engine switch is disabled with a 'Pro' badge
    // and an upgrade hint, and generation still works with the standard engine."
    it('locks the switch with a Pro badge for a starter tier', () => {
      mockCanAccessFeature.mockReturnValue(false);
      render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });
      expect(screen.getByRole('switch')).toBeDisabled();
      expect(screen.getByText('engine.proBadge')).toBeInTheDocument();
      expect(screen.getByText('engine.proHint')).toBeInTheDocument();
    });
  });
  ```

  3. In `apps/web/src/app/[locale]/admin/planning/__tests__/useGeneration.spec.tsx`, three edits:

  a) The `MutationOptions` type gains success args (line 22 region):

  ```ts
  type MutationOptions = {
    onSuccess?: (data?: unknown, variables?: unknown) => void;
    onError?: (err: { message?: string }) => void;
  };
  ```

  b) The sonner mock (line 52) gains `info`:

  ```ts
  vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));
  ```

  c) A new describe after the 11-1 one (the harness captures the mutation options — drive `onSuccess` directly; next-intl echoes key names):

  ```ts
  describe('useGeneration — served-engine toasts (story 12-2)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      captured.generate = undefined;
      captured.delete = undefined;
    });

    // AC1 (verbatim from story 12-2): "Then the generation request carries the cpsat
    // engine and, after generation, the served engine is visible (persistent badge +
    // toast)" — the toast half.
    it('toasts the solver success when cpsat is served', () => {
      renderHook(() => useGeneration('2026-07'), { wrapper });
      captured.generate?.onSuccess?.(
        { stats: { engine: 'cpsat' } },
        { engine: 'cpsat' },
      );
      expect(toast.success).toHaveBeenCalledWith('generatedCpsat');
    });

    // AC4 (verbatim from story 12-2): "Given a cpsat generation whose solver found no
    // strict improvement (stats.engine === 'greedy' served), Then the admin is informed
    // the standard plan was served — informational, never styled as an error."
    it('toasts the informational message when cpsat was requested but greedy served', () => {
      renderHook(() => useGeneration('2026-07'), { wrapper });
      captured.generate?.onSuccess?.(
        { stats: { engine: 'greedy' } },
        { engine: 'cpsat' },
      );
      expect(toast.info).toHaveBeenCalledWith('cpsatNoImprovement');
      expect(toast.error).not.toHaveBeenCalled();
    });

    // AC5 (verbatim): "Given the switch off (its default), Then requests and results
    // are byte-identical to today" — the default toast stays.
    it('keeps the standard toast for a default greedy generation', () => {
      renderHook(() => useGeneration('2026-07'), { wrapper });
      captured.generate?.onSuccess?.(
        { stats: { engine: 'greedy' } },
        { engine: 'greedy' },
      );
      expect(toast.success).toHaveBeenCalledWith('generated');
    });
  });
  ```

  Run: `pnpm --filter @pawly/web test generation && pnpm --filter @pawly/web test useGeneration`
  Expected RED: `getByRole('switch')` fails (no switch rendered yet) + toast assertions fail. Emit the `Confirmed RED:` witness.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx" "apps/web/src/app/[locale]/admin/planning/__tests__/useGeneration.spec.tsx" && git commit -m "test(KON-130): RED — engine switch, tier lock, served-engine toasts [AC-1,2,4,5]"`

- [ ] **Task 5 — GREEN: GenerationPanel switch + served badge** [AC: 1, 2, 5]

  In `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`:

  1. Imports (add to the existing blocks):

  ```tsx
  import { Switch } from '@/components/ui/switch';
  import { useSubscription } from '@/lib/contexts/subscription-context';
  ```

  2. Inside the component, after `const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);`:

  ```tsx
  // Story 12-2 (KON-130) — exact-engine opt-in, Professional-gated (FR16). The
  // engine resolves to greedy whenever the tier lock is on, so a stale checked
  // state can never leak cpsat into the request.
  const tEngine = useTranslations('admin.planningGeneration.engine');
  const { canAccessFeature } = useSubscription();
  const canUseCpsat = canAccessFeature('professional');
  const [exactEngine, setExactEngine] = useState(false);
  const engine: 'greedy' | 'cpsat' =
    canUseCpsat && exactEngine ? 'cpsat' : 'greedy';
  ```

  3. Thread `engine` into BOTH generate calls — in `handleGenerate` and `handleConfirmRegenerate`, the `generatePlan({...})` input becomes:

  ```tsx
        {
          month: selectedMonth,
          templateId: selectedTemplateId,
          acknowledgePublishedChange: acknowledge,
          engine,
        },
  ```

  and add `engine` to both `useCallback` dependency arrays.

  4. Render the switch row directly AFTER the closing `</div>` of the "Controls row" (`flex flex-col sm:flex-row gap-4 items-end`):

  ```tsx
          {/* Story 12-2 — exact-engine opt-in (Professional) + served-engine transparency */}
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Switch
                id="engine-switch"
                checked={canUseCpsat && exactEngine}
                onCheckedChange={setExactEngine}
                disabled={!canUseCpsat || isGenerating}
                aria-labelledby="engine-label"
              />
              <div>
                <label
                  id="engine-label"
                  htmlFor="engine-switch"
                  className="text-sm font-medium text-foreground flex items-center gap-2"
                >
                  {tEngine('label')}
                  {!canUseCpsat && (
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                      {tEngine('proBadge')}
                    </Badge>
                  )}
                </label>
                <p className="text-xs text-muted-foreground">
                  {canUseCpsat ? tEngine('hint') : tEngine('proHint')}
                </p>
              </div>
            </div>
            {generationResult && (
              <Badge
                variant="outline"
                data-testid="served-engine"
                className={
                  generationResult.stats.engine === 'cpsat'
                    ? 'text-xs font-medium px-2 py-0.5 border-primary/30 text-primary'
                    : 'text-xs font-medium px-2 py-0.5'
                }
              >
                {tEngine(
                  generationResult.stats.engine === 'cpsat'
                    ? 'servedCpsat'
                    : 'servedGreedy',
                )}
              </Badge>
            )}
          </div>
  ```

  Run: `pnpm --filter @pawly/web test generation`
  Expected: the three KON-130 panel tests pass; full file green.
  **Visual Dev Loop (mandatory — frontend GREEN):** with `pnpm dev` running, use `mcp__react-grab-mcp__get_element_context` on the planning page's GenerationPanel — verify the switch row renders under the controls, spacing/typography match the panel (labels `text-xs font-bold uppercase` pattern above, hint in `text-muted-foreground`), and the Pro badge matches the indigo badge pattern. Fix visuals before REFACTOR; if React Grab is unavailable, log a WARNING and note deferral in the Dev Agent Record.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx" && git commit -m "feat(KON-130): exact-engine switch + served-engine badge in the panel [AC-1,2,5]"`

- [ ] **Task 6 — GREEN: engine-aware toasts in useGeneration** [AC: 1, 4]

  In `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`, replace the `generatePlan` mutation's `onSuccess` (lesson L1: `useServerActionMutation` wraps standard React Query `useMutation` — `data` is the action result directly, `variables` is the mutate input):

  ```ts
      onSuccess: (
        result: { stats?: { engine?: 'greedy' | 'cpsat' } } | undefined,
        variables: { engine?: 'greedy' | 'cpsat' },
      ) => {
        invalidateAll();
        // Story 12-2 — served-engine transparency: the solver legitimately serves
        // the greedy plan when it finds no strict improvement (System Never Lies).
        if (variables?.engine === 'cpsat' && result?.stats?.engine === 'greedy') {
          toast.info(t('cpsatNoImprovement'));
        } else if (result?.stats?.engine === 'cpsat') {
          toast.success(t('generatedCpsat'));
        } else {
          toast.success(t('generated'));
        }
      },
  ```

  Run: `pnpm --filter @pawly/web test useGeneration && pnpm --filter @pawly/web test generation`
  Expected: `Tests: N passed` (both files fully green — the Task 4 RED toasts now pass).
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts" && git commit -m "feat(KON-130): engine-aware generation toasts [AC-1,4]"`

- [ ] **Task 7 — Full suite + build** [AC: 5, 6]

  ```bash
  bash .aped/aped-dev/scripts/run-tests.sh
  pnpm --filter @pawly/api build
  ```

  Expected: runner exit 0 (`cat .aped/.last-test-exit` → `0`); API build clean (router change only — lesson L5 tsc pass must stay green). If a translation-completeness test exists in the web suite it also proves AC6.
  Commit: only if formatters touched files — `git add -u && git commit -m "chore(KON-130): post-suite formatting"`.

- [ ] **Task 8 — Live journey (AC7 / L2) + PR** [AC: 7]

  1. `pnpm dev` (background). On the dev clinic (Professional tier — `admin@test.app` / "Clinique test" was used for 12-1's journey): open `/admin/planning`, verify via React Grab that the switch is enabled; enable it, generate a covered month (2026-07 had school declarations for 12-1), and verify the served-engine badge + toast (`servedGreedy` + `cpsatNoImprovement` is the EXPECTED outcome on that already-optimal month — record it as AC4 evidence, not a failure).
  2. Starter visual check: temporarily flip the dev clinic's `Subscription.entitlementTier` to `starter` (SQL UPDATE) + wait out/flush the Redis `sub:{clinicId}` cache (120s TTL), reload, verify the locked switch + Pro badge via React Grab, then RESTORE the tier and flush again. Record both screenshots/React Grab outputs in the Dev Agent Record.
  3. API-level AC3 spot check while the tier is starter: replay the 12-1 journey script with `engine: 'cpsat'` → expect the FORBIDDEN error envelope.
  4. Push and open the PR:

  ```bash
  git push -u origin feature/KON-130-12-2-engine-toggle-tier-gate
  gh pr create --draft --base develop --title "feat(KON-130): engine selector in the generation panel (Pro-gated)"
  ```

  PR body per `.aped/aped-skills/writing-discipline.md` § PRs (Summary / Problems / Solution / Validation, no internal jargon); mark ready once the validation block is re-run green.

## Dev Notes

### Architecture / patterns (all verified in code this session)

- **Data flow untouched:** the zsa action `generatePlanAction` validates with the SHARED `generatePlanSchema` and forwards the whole input — `engine` already flows Panel → Zsa → Server Action → tRPC with zero plumbing changes. Only the Panel (emit) and the router (gate) change.
- **Tier gate:** `requireProfessional(tier)` at `planning.router.ts:48` throws `TRPCError FORBIDDEN "Subscription tier 'professional' required"`; `ctx.subscription` is attached by the `isSubscribed` middleware (Redis `sub:{clinicId}` cache, 120s). Same call shape as the three equity/rules call-sites (`:105/:113/:121`).
- **UI gate:** `useSubscription()` from `@/lib/contexts/subscription-context` exposes `canAccessFeature(requiredTier: string) => boolean`. Do NOT wrap the panel in `SubscriptionGate` — generation stays Starter-accessible; only the switch locks (per-option lock like the nav "Pro" badges).
- **Served-engine surface:** `GenerationResultView.tsx` is ORPHANED (defined + tested, never rendered) — do not resuscitate it; the badge lives in the panel's switch row, the toast in `useGeneration`.
- **Defensive engine resolution:** `engine = canUseCpsat && exactEngine ? 'cpsat' : 'greedy'` — a stale checked state can never leak cpsat past the UI lock; the API gate is the authority anyway (AC3).
- **jsdom harness:** shadcn Select is already mocked in `generation.spec.tsx` (Radix pointer-capture APIs missing in jsdom); the shadcn `Switch` (Radix) renders `role="switch"` and responds to `fireEvent.click` in jsdom — no mock needed. Translations mock returns raw key names (assert on `'engine.proBadge'`, not the French text).

### Existing code at write time (Step 0 — verbatim)

`apps/api/src/trpc/routers/planning.router.ts` — `generatePlan` (current, post-12-1):

```ts
  generatePlan: subscribedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          {
            acknowledgePublishedChange: input.acknowledgePublishedChange,
            engine: input.engine,
          },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),
```

`apps/api/src/trpc/routers/planning.router.ts:48` — the gate helper (current):

```ts
const requireProfessional = (tier: string) => {
  const currentIndex = TIER_HIERARCHY.indexOf(
    tier as (typeof TIER_HIERARCHY)[number],
  );
  const requiredIndex = TIER_HIERARCHY.indexOf('professional');
  if (currentIndex === -1 || currentIndex < requiredIndex) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "Subscription tier 'professional' required",
    });
  }
};
```

`apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` — `generatePlan` mutation (current):

```ts
  const { mutate: generatePlan, isPending: isGenerating } = useServerActionMutation(
    generatePlanAction,
    {
      onSuccess: () => {
        invalidateAll();
        toast.success(t('generated'));
      },
      onError: (err: { message?: string }) => {
        if (err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
          toast.error(t('publishedChangeRequired'));
        } else {
          toast.error(t('generateFailed'), { description: err?.message });
        }
      },
    }
  );
```

`apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx` — the two call-sites this story threads `engine` through (current, both identical in shape):

```tsx
    guard((acknowledge) =>
      generatePlan(
        {
          month: selectedMonth,
          templateId: selectedTemplateId,
          acknowledgePublishedChange: acknowledge,
        },
        {
          onSuccess: (result: GenerationResult) => {
            setGenerationResult(result);
          },
        }
      )
    );
```

`apps/web/src/app/[locale]/admin/planning/_actions/generation-actions.ts` (current — NO change needed, shown to prove it):

```ts
export const generatePlanAction = createServerAction()
  .input(generatePlanSchema)
  .handler(async ({ input }) => {
    return trpc.planning.generatePlan.mutate(input);
  });
```

New files: none — this story only modifies existing files.

### File decisions (3-bullet per file)

- **`apps/api/src/trpc/routers/planning.router.ts`** — MODIFY
  - Responsibility (delta): gate the cpsat VALUE behind Professional; greedy path untouched.
  - Inputs: `input.engine`, `ctx.subscription.entitlementTier`. Outputs: unchanged, or `TRPCError FORBIDDEN`.
- **`apps/api/src/trpc/routers/planning.router.spec.ts`** — MODIFY
  - Responsibility (delta): 3 tier tests + `createStarterAdminCaller` helper.
  - Mirrors `createAdminCaller` with `entitlementTier: 'starter'`.
- **`apps/web/.../GenerationPanel.tsx`** — MODIFY
  - Responsibility (delta): exact-engine switch (Pro-locked), engine threading into both generate calls, served-engine badge.
  - Inputs: `useSubscription().canAccessFeature`, `generationResult.stats.engine`. Outputs: `engine` in the generate input.
- **`apps/web/.../useGeneration.ts`** — MODIFY
  - Responsibility (delta): engine-aware success toasts (3 cases: greedy, cpsat served, cpsat-no-improvement).
  - Inputs: mutation `result.stats.engine` + `variables.engine`.
- **`apps/web/src/i18n/langs/fr.json` / `en.json`** — MODIFY
  - Responsibility (delta): `admin.planningGeneration.engine.*` + 2 toast keys, both locales (NFR20).
- **Specs** — `generation.spec.tsx`, `useGeneration.spec.tsx`, `planning.router.spec.ts` — MODIFY.

### Testing

- API: Jest (`pnpm --filter @pawly/api test planning.router`). Web: Vitest (`pnpm --filter @pawly/web test generation`, `... test useGeneration`). All from repo root.
- Frontend story → **Visual Dev Loop at every UI GREEN** (React Grab on the panel), dev server web:3020/API:3001.
- Starter-tier live check requires flipping `Subscription.entitlementTier` in the dev DB AND flushing/awaiting the Redis `sub:{clinicId}` 120s cache (project memory: tier gating).

### Dependencies

- None new. Story 12-1 (KON-129, merged) supplies `engine` on the schemas and `stats.engine` in results.

### Commit prefix

`feat(KON-130): ...` / `test(KON-130): ...` — PR to `develop`, draft first.

## File List

- `apps/api/src/trpc/routers/planning.router.ts` — MODIFY (cpsat tier gate)
- `apps/api/src/trpc/routers/planning.router.spec.ts` — MODIFY (3 tier tests + starter caller)
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx` — MODIFY (switch, badge, threading)
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` — MODIFY (engine-aware toasts)
- `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx` — MODIFY (panel tests + subscription mock)
- `apps/web/src/app/[locale]/admin/planning/__tests__/useGeneration.spec.tsx` — MODIFY (toast tests)
- `apps/web/src/i18n/langs/fr.json` — MODIFY (engine keys)
- `apps/web/src/i18n/langs/en.json` — MODIFY (engine keys)

## Dev Agent Record

- **Model:** (filled by aped-dev)
- **Started:** (filled by aped-dev)
- **Completed:** (filled by aped-dev)

### Summary

### Files changed

### Deviations

### Test output
