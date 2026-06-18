'use client';

import { useTranslations, useLocale } from 'next-intl';
import { AlertCircle, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LazyMotion, m, AnimatePresence, domAnimation } from 'motion/react';
import { HealthBarDetailPopover } from './HealthBarDetailPopover';
import type { ScheduleViewData, ScheduleHole } from '@pawly/validators';

type HardViolation = ScheduleViewData['violations']['hard'][number];
type SoftViolation = ScheduleViewData['violations']['soft'][number];

type PublicationStatus = {
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  publishedBy: string | null;
};

type Props = {
  hardViolationCount: number;
  softViolationCount: number;
  holeCount: number;
  totalShifts: number;
  onPublish?: () => void;
  publicationStatus?: PublicationStatus;
  violations?: {
    hard: HardViolation[];
    soft: SoftViolation[];
  };
  holes?: ScheduleHole[];
  employees?: Array<{ id: string; firstName: string; lastName: string }>;
};

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function PlanningHealthBar({
  hardViolationCount,
  softViolationCount,
  holeCount,
  totalShifts,
  onPublish,
  publicationStatus,
  violations,
  holes,
  employees,
}: Props) {
  const t = useTranslations('admin.planningRules.healthBar');
  const locale = useLocale();

  const isEmpty =
    totalShifts === 0 && hardViolationCount === 0 && softViolationCount === 0 && holeCount === 0;
  const isPublished = publicationStatus?.status === 'PUBLISHED';

  // Segment calculation including holes
  const totalPositions = totalShifts + holeCount;
  const healthyShifts = Math.max(0, totalShifts - hardViolationCount - softViolationCount);

  const hardWidth =
    totalPositions > 0
      ? Math.floor((hardViolationCount / totalPositions) * 100)
      : hardViolationCount > 0
        ? 50
        : 0;

  const softWidth =
    totalPositions > 0
      ? Math.floor((softViolationCount / totalPositions) * 100)
      : softViolationCount > 0
        ? 30
        : 0;

  const holeWidth = totalPositions > 0 ? Math.floor((holeCount / totalPositions) * 100) : 0;

  const healthyWidth = Math.max(0, 100 - hardWidth - softWidth - holeWidth);

  const readyPercent =
    totalPositions > 0
      ? Math.max(0, Math.min(100, Math.round((healthyShifts / totalPositions) * 100)))
      : 0;

  const hasHardConflicts = hardViolationCount > 0;
  const hasSoftWarnings = softViolationCount > 0;
  const hasHoles = holeCount > 0;
  const isHealthy = !hasHardConflicts && !hasSoftWarnings && !hasHoles;

  // Subtitle text
  const subtitleText = isEmpty
    ? t('emptyState')
    : isHealthy
      ? t('healthy')
      : `${t('conflicts', { count: hardViolationCount })}, ${t('warnings', { count: softViolationCount })}, ${t('holes', { count: holeCount })}, ${t('ready', { percent: readyPercent })}`;

  // Detail popover availability
  const hasDetails =
    (violations?.hard.length ?? 0) > 0 ||
    (violations?.soft.length ?? 0) > 0 ||
    (holes?.length ?? 0) > 0;

  // Show publish button only when not published and onPublish provided
  const showPublishButton = !!onPublish && !isPublished;

  return (
    <LazyMotion features={domAnimation}>
      <m.section
        data-tour="admin-health-bar"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6"
      >
        {/* Glow hover */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-primary opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Status icon */}
              {isEmpty ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
                  <Circle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                </div>
              ) : hasHardConflicts ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-100">
                  <AlertCircle className="h-4 w-4 text-rose-600" strokeWidth={1.5} />
                </div>
              ) : hasSoftWarnings || hasHoles ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-orange-100">
                  <AlertTriangle className="h-4 w-4 text-orange-600" strokeWidth={1.5} />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
                  <CheckCircle2 className="h-4 w-4 text-primary" strokeWidth={1.5} />
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-foreground">{t('title')}</p>
                <div aria-live="polite" role="status">
                  {hasDetails ? (
                    <HealthBarDetailPopover
                      violations={violations}
                      holes={holes}
                      employees={employees}
                    >
                      <button
                        type="button"
                        className={`text-sm font-medium cursor-pointer hover:text-foreground transition-colors underline-offset-2 hover:underline text-left ${
                          hasHardConflicts
                            ? 'text-rose-600'
                            : hasSoftWarnings
                              ? 'text-orange-600'
                              : hasHoles
                                ? 'text-muted-foreground'
                                : 'text-primary'
                        }`}
                      >
                        {subtitleText}
                      </button>
                    </HealthBarDetailPopover>
                  ) : (
                    <p
                      className={`text-sm font-medium ${isHealthy && !isEmpty ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {subtitleText}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Published badge */}
              {isPublished && (
                <Badge variant="secondary" className="gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  {publicationStatus?.publishedAt
                    ? t('publishedAt', {
                        date: new Date(publicationStatus.publishedAt).toLocaleDateString(locale),
                      })
                    : t('published')}
                </Badge>
              )}

              {/* Publish button */}
              {showPublishButton && (
                <Button
                  data-tour="admin-publish"
                  onClick={onPublish}
                  disabled={hasHardConflicts}
                  className={`rounded-xl bg-foreground font-bold text-background shadow-lg shadow-foreground/10 hover:bg-black disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none${isHealthy && !isEmpty ? ' motion-safe:animate-pulse' : ''}`}
                  title={hasHardConflicts ? t('publishBlocked') : undefined}
                >
                  {t('publish')}
                </Button>
              )}
            </div>
          </div>

          {/* Segmented bar */}
          <div
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={readyPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${t('title')}: ${subtitleText}`}
          >
            <AnimatePresence>
              {hardWidth > 0 && (
                <m.div
                  key="hard"
                  className="bg-rose-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${hardWidth}%` }}
                  exit={{ width: 0 }}
                  transition={springTransition}
                />
              )}
              {softWidth > 0 && (
                <m.div
                  key="soft"
                  className="bg-orange-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${softWidth}%` }}
                  exit={{ width: 0 }}
                  transition={springTransition}
                />
              )}
              {holeWidth > 0 && (
                <m.div
                  key="holes"
                  className="bg-muted-foreground"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${holeWidth}%` }}
                  exit={{ width: 0 }}
                  transition={springTransition}
                />
              )}
              {healthyWidth > 0 && (
                <m.div
                  key="healthy"
                  className="bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${healthyWidth}%` }}
                  exit={{ width: 0 }}
                  transition={springTransition}
                />
              )}
            </AnimatePresence>
          </div>

          {hasHardConflicts && (
            <p className="mt-2 text-xs font-medium text-rose-600">{t('publishBlocked')}</p>
          )}
        </div>
      </m.section>
    </LazyMotion>
  );
}
