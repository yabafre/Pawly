'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Sparkles,
  Loader2,
  Calendar,
  Users,
  Pencil,
  Trash2,
  GraduationCap,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGeneration } from '../_hooks/useGeneration';
import { useTemplates } from '../templates/_hooks/useTemplates';
import { useScheduleView } from '../_hooks/useScheduleView';
import { useApprenticeDeclarations } from '../_hooks/useApprenticeDeclarations';
import { ConfirmRegenerateDialog } from './ConfirmRegenerateDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { PublishedChangeDialog } from './PublishedChangeDialog';
import { usePublish } from '../_hooks/usePublish';
import { usePublishedChangeGuard } from '../_hooks/usePublishedChangeGuard';
import { useSubscription } from '@/lib/contexts/subscription-context';
import type { GenerationResult, SolverOutcome } from '@pawly/validators';
import type { ShiftData } from '@pawly/types';

// Story 13-6 (KON-137) — map the solver outcome to its i18n key for the badge reason.
// Exhaustively keyed (aped-review F4) so a future SolverOutcome member fails to compile
// here until it gets a mapping, rather than silently passing undefined to tOutcome.
const OUTCOME_MESSAGE_KEY: Record<Exclude<SolverOutcome, 'served'>, string> = {
  'engine-unavailable': 'engineUnavailable',
  infeasible: 'infeasible',
  'budget-exhausted': 'budgetExhausted',
  'no-improvement': 'noImprovement',
  'rejected-revalidation': 'rejectedRevalidation',
};

function getMonthOptions(locale: string) {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
    options.push({ value, label });
  }
  return options;
}

type Props = {
  month: string;
  onMonthChange: (month: string) => void;
};

export function GenerationPanel({ month, onMonthChange }: Props) {
  const t = useTranslations('admin.planningGeneration');
  const tExisting = useTranslations('admin.planningGeneration.existing');
  const tApprentice = useTranslations('admin.apprenticeDeclarations');
  const locale = useLocale();
  const monthOptions = getMonthOptions(locale);

  const selectedMonth = month;
  const setSelectedMonth = onMonthChange;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Story 12-2 (KON-130) — exact-engine opt-in, Professional-gated (FR16). The
  // engine resolves to greedy whenever the tier lock is on, so a stale checked
  // state can never leak cpsat into the request.
  const tEngine = useTranslations('admin.planningGeneration.engine');
  const tOutcome = useTranslations('admin.planningGeneration.engine.solverOutcome');
  const { canAccessFeature } = useSubscription();
  const canUseCpsat = canAccessFeature('professional');
  const [exactEngine, setExactEngine] = useState(false);
  const engine: 'greedy' | 'cpsat' = canUseCpsat && exactEngine ? 'cpsat' : 'greedy';

  // Story 12-2 (KON-130) — the served-engine badge describes the LAST generation.
  // Reset it when the target month or template changes so it never mislabels a
  // context the admin has not regenerated yet (Transparency over Magic).
  useEffect(() => {
    setGenerationResult(null);
  }, [selectedMonth, selectedTemplateId]);

  const { templates, isPending: isLoadingTemplates } = useTemplates();
  const { shifts, isLoadingShifts, generatePlan, isGenerating, deleteGenerated, isDeleting } =
    useGeneration(selectedMonth);
  const { scheduleData } = useScheduleView(selectedMonth);
  // Story 11-1 — regenerating/purging a PUBLISHED month runs behind the same
  // confirmation guard as manual moves; on a DRAFT month it runs straight through.
  const { publicationStatus } = usePublish(selectedMonth);
  const isPublished = publicationStatus?.status === 'PUBLISHED';
  const {
    guard,
    dialogOpen: publishedChangeOpen,
    confirm: confirmPublishedChange,
    cancel: cancelPublishedChange,
  } = usePublishedChangeGuard(isPublished);
  const {
    declarations,
    isLoading: isLoadingDeclarations,
    confirmNoSchool,
    isConfirming,
  } = useApprenticeDeclarations(selectedMonth);

  const existingGeneratedCount = shifts.filter(
    (s: { source?: string }) => s.source === 'GENERATED'
  ).length;

  const missingDeclarations = declarations.filter((d) => d.status === 'MISSING');

  const handleGenerate = useCallback(() => {
    if (!selectedTemplateId) return;

    if (existingGeneratedCount > 0) {
      setShowConfirm(true);
      return;
    }

    guard((acknowledge) =>
      generatePlan(
        {
          month: selectedMonth,
          templateId: selectedTemplateId,
          acknowledgePublishedChange: acknowledge,
          engine,
        },
        {
          onSuccess: (result: GenerationResult) => {
            setGenerationResult(result);
          },
        }
      )
    );
  }, [selectedMonth, selectedTemplateId, existingGeneratedCount, generatePlan, guard, engine]);

  const handleConfirmRegenerate = useCallback(() => {
    setShowConfirm(false);
    guard((acknowledge) =>
      generatePlan(
        {
          month: selectedMonth,
          templateId: selectedTemplateId,
          acknowledgePublishedChange: acknowledge,
          engine,
        },
        {
          onSuccess: (result: GenerationResult) => {
            setGenerationResult(result);
          },
        }
      )
    );
  }, [selectedMonth, selectedTemplateId, generatePlan, guard, engine]);

  // Stats
  const generated = shifts.filter((s: ShiftData) => s.source === 'GENERATED');
  const manual = shifts.filter((s: ShiftData) => s.source === 'MANUAL');
  const uniqueEmployees = new Set(
    shifts.filter((s: ShiftData) => s.employee).map((s: ShiftData) => s.employee!.id)
  );
  const typeMap = new Map<string, number>();
  for (const shift of shifts) {
    typeMap.set(shift.shiftTypeCode, (typeMap.get(shift.shiftTypeCode) || 0) + 1);
  }

  // Violations count — deduplicated (detail is shown in the HealthBar below the schedule)
  const hardViolations = generationResult?.violations?.hard ?? scheduleData?.violations?.hard ?? [];
  const softViolations = generationResult?.violations?.soft ?? scheduleData?.violations?.soft ?? [];
  const dedupCount = (
    items: Array<{ ruleId: string; affectedEmployeeId?: string; message: string }>
  ) => {
    const seen = new Set<string>();
    return items.filter((v) => {
      const key = `${v.ruleId}|${v.affectedEmployeeId ?? ''}|${v.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  };
  const totalWarnings = dedupCount(hardViolations) + dedupCount(softViolations);

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-border p-6">
        {/* Title + apprentice warning */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          {!isLoadingDeclarations && missingDeclarations.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-600 border-orange-200 hover:bg-orange-50 text-xs"
                >
                  <GraduationCap size={12} className="mr-1.5" />
                  {tApprentice('missingCount', { count: missingDeclarations.length })}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{tApprentice('title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 mt-2">
                  {missingDeclarations.map((row) => (
                    <div
                      key={row.employeeId}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm font-medium">
                        {row.firstName} {row.lastName}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          confirmNoSchool({ employeeId: row.employeeId, month: selectedMonth })
                        }
                        disabled={isConfirming}
                        className="text-xs"
                      >
                        {tApprentice('actions.confirmNoSchool')}
                      </Button>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 min-w-[180px]">
            <label
              id="month-label"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block"
            >
              {t('monthLabel')}
            </label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger aria-labelledby="month-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label
              id="template-label"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block"
            >
              {t('templateLabel')}
            </label>
            {!isLoadingTemplates && templates.length === 0 ? (
              <Button
                variant="outline"
                asChild
                className="w-full justify-start gap-2 text-muted-foreground"
              >
                <Link href="/admin/planning/templates">
                  <LayoutTemplate className="h-4 w-4" />
                  {t('noTemplates')}
                </Link>
              </Button>
            ) : (
              <Select
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
                disabled={isLoadingTemplates}
              >
                <SelectTrigger aria-labelledby="template-label">
                  <SelectValue placeholder={t('templatePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl: { id: string; name: string }) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            data-tour="admin-generate"
            onClick={handleGenerate}
            disabled={!selectedTemplateId || isGenerating}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl"
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Sparkles size={16} className="mr-2" />
            )}
            {isGenerating ? t('generating') : t('generateButton')}
          </Button>
        </div>

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
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
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
            <div className="flex flex-col items-end gap-1">
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
                  generationResult.stats.engine === 'cpsat' ? 'servedCpsat' : 'servedGreedy'
                )}
              </Badge>
              {generationResult.stats.solverOutcome &&
                generationResult.stats.solverOutcome !== 'served' && (
                  <span
                    data-testid="solver-outcome-reason"
                    className="text-xs text-muted-foreground text-right max-w-[220px]"
                  >
                    {tOutcome(OUTCOME_MESSAGE_KEY[generationResult.stats.solverOutcome])}
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Inline stats — only when shifts exist */}
        {!isLoadingShifts && shifts.length > 0 && (
          <div className="mt-6 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar size={13} />
                  <strong className="text-foreground">{shifts.length}</strong>{' '}
                  {tExisting('totalShifts')}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles size={13} />
                  <strong className="text-foreground">{generated.length}</strong>{' '}
                  {tExisting('generated')}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Pencil size={13} />
                  <strong className="text-foreground">{manual.length}</strong> {tExisting('manual')}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users size={13} />
                  <strong className="text-foreground">{uniqueEmployees.size}</strong>{' '}
                  {tExisting('employees')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {generated.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting || isGenerating}
                    className="text-destructive border-destructive/20 hover:bg-destructive/5 text-xs"
                  >
                    <Trash2 size={12} className="mr-1.5" />
                    {tExisting('deleteGenerated')}
                  </Button>
                )}
              </div>
            </div>

            {/* Shift type badges */}
            <div className="flex flex-wrap gap-1.5">
              {Array.from(typeMap.entries()).map(([code, count]) => (
                <Badge key={code} variant="outline" className="text-xs font-medium px-2 py-0.5">
                  {code} &mdash; {count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmRegenerateDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleConfirmRegenerate}
        existingCount={existingGeneratedCount}
      />

      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          guard((acknowledge) =>
            deleteGenerated({
              month: selectedMonth,
              acknowledgePublishedChange: acknowledge,
            })
          );
        }}
        existingCount={existingGeneratedCount}
      />

      <PublishedChangeDialog
        open={publishedChangeOpen}
        onConfirm={confirmPublishedChange}
        onCancel={cancelPublishedChange}
      />
    </div>
  );
}
