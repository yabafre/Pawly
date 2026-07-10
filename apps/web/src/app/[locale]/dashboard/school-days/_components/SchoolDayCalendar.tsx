'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { GraduationCap, CheckCircle2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useEmployeeContext } from '../../_components/EmployeeContext';
import { useSchoolDays, useDeclareSchoolDays } from '../_hooks/useSchoolDays';
import { useHydrated } from '@/lib/hooks';
import { SchoolDayReminderBanner } from './SchoolDayReminderBanner';

function getMonthRange(): { year: number; month: number; key: string }[] {
  const now = new Date();
  const months: { year: number; month: number; key: string }[] = [];
  for (let offset = 1; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return months;
}

function getMonthLabel(year: number, month: number, locale: string): string {
  return new Date(year, month, 1).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function SchoolDayCalendar() {
  const t = useTranslations('dashboard.schoolDays');
  const locale = useLocale();
  const { employeeId, jobType } = useEmployeeContext();

  const monthRange = useMemo(() => getMonthRange(), []);
  const [monthIndex, setMonthIndex] = useState(0);
  const current = monthRange[monthIndex];

  const hydrated = useHydrated();
  const { schoolDays, isPending: isLoading } = useSchoolDays(employeeId, current.key);
  const { declareSchoolDays, isPending: isSubmitting } = useDeclareSchoolDays(current.key);

  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const initializedMonths = useRef(new Set<string>());

  useEffect(() => {
    if (schoolDays.length > 0 && !initializedMonths.current.has(current.key)) {
      const dates = schoolDays.map((sd: { startDate: string | Date }) => {
        const d = typeof sd.startDate === 'string' ? new Date(sd.startDate) : sd.startDate;
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      });
      setSelectedDates(dates);
      setHasSubmitted(true);
      initializedMonths.current.add(current.key);
    } else if (schoolDays.length === 0 && !initializedMonths.current.has(current.key)) {
      setSelectedDates([]);
      setHasSubmitted(false);
    }
  }, [schoolDays, current.key]);

  const monthStart = useMemo(() => new Date(current.year, current.month, 1), [current]);
  const monthEnd = useMemo(() => new Date(current.year, current.month + 1, 0), [current]);
  const monthLabel = useMemo(
    () => getMonthLabel(current.year, current.month, locale),
    [current, locale]
  );

  const isReminderVisible = useMemo(() => {
    const now = new Date();
    return monthIndex === 0 && now.getDate() >= 25 && !hasSubmitted;
  }, [hasSubmitted, monthIndex]);

  const canPrev = monthIndex > 0;
  const canNext = monthIndex < monthRange.length - 1;

  const handleMonthChange = (dir: -1 | 1) => {
    const next = monthIndex + dir;
    if (next >= 0 && next < monthRange.length) {
      initializedMonths.current.delete(monthRange[next].key);
      setMonthIndex(next);
      setSelectedDates([]);
      setHasSubmitted(false);
    }
  };

  const handleSubmit = useCallback(() => {
    const dates = selectedDates.map(
      (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    declareSchoolDays({ month: current.key, dates, employeeId });
    setHasSubmitted(true);
    initializedMonths.current.add(current.key);
  }, [selectedDates, current.key, employeeId, declareSchoolDays]);

  if (jobType !== 'APPRENTICE') {
    return (
      <div className="rounded-2xl bg-card border p-6 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{t('errors.notApprentice')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {isReminderVisible && <SchoolDayReminderBanner month={monthLabel} />}

      {hasSubmitted && selectedDates.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-primary/5 border border-primary/10 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs font-medium text-foreground">
            {t('success.message', { month: monthLabel })}
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-card border p-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
          <div className="flex gap-1 border rounded-full p-1 bg-card">
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition disabled:opacity-30"
              disabled={!canPrev}
              onClick={() => handleMonthChange(-1)}
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition disabled:opacity-30"
              disabled={!canNext}
              onClick={() => handleMonthChange(1)}
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* !hydrated: persisted query cache can make isLoading false on the
            first client render while the server rendered the spinner. */}
        {!hydrated || isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates ?? [])}
                month={monthStart}
                fromDate={monthStart}
                toDate={monthEnd}
                disabled={[{ before: monthStart }, { after: monthEnd }]}
                fixedWeeks={false}
                hideNavigation
              />
            </div>

            <div className="mt-4 pt-4 border-t">
              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('submitting')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
