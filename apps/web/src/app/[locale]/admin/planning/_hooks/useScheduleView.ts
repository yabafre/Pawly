"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  QueryKeyFactory,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import { getScheduleViewAction } from "../_actions/schedule-view-actions";
import type { ScheduleViewData, ScheduleDayInfo, ScheduleShift, ScheduleUnavailability, ScheduleHole } from "@pawly/validators";

function getWeekBoundaries(days: ScheduleDayInfo[]): ScheduleDayInfo[][] {
  if (days.length === 0) return [];

  const weeks: ScheduleDayInfo[][] = [];
  let currentWeek: ScheduleDayInfo[] = [];

  for (const day of days) {
    currentWeek.push(day);
    if (day.dayOfWeek === 7 || day === days[days.length - 1]) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Merge leading partial week (< 3 days) into the next week to avoid
  // a confusing 1-day tab when the month starts on a Sunday.
  if (weeks.length > 1 && weeks[0].length < 3) {
    weeks[1] = [...weeks[0], ...weeks[1]];
    weeks.shift();
  }

  return weeks;
}

export type WeekData = {
  days: ScheduleDayInfo[];
  shifts: ScheduleShift[];
  unavailabilities: ScheduleUnavailability[];
  holes: ScheduleHole[];
};

export const useScheduleView = (month?: string) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const queryKey = QueryKeyFactory.planningScheduleView(month);

  const {
    data,
    isPending: isLoading,
    isFetching,
  } = useServerActionQuery(getScheduleViewAction, {
    input: { month: month ?? "" },
    queryKey,
    enabled: !!month && month.length > 0,
    placeholderData: (prev: unknown) => prev,
  });

  const scheduleData = data as ScheduleViewData | undefined;

  // Compute weeks from full month data (client-side slicing)
  const weeks = useMemo(() => {
    if (!scheduleData?.days) return [];
    return getWeekBoundaries(scheduleData.days);
  }, [scheduleData?.days]);

  // Clamp week offset if it exceeds available weeks
  const safeWeekOffset = Math.min(weekOffset, Math.max(0, weeks.length - 1));

  // Get current week data by slicing month data to selected week
  const currentWeekData: WeekData | null = useMemo(() => {
    if (!scheduleData || weeks.length === 0) return null;

    const weekDays = weeks[safeWeekOffset] || weeks[0];
    const weekDateSet = new Set(weekDays.map((d) => d.date));

    return {
      days: weekDays,
      shifts: scheduleData.shifts.filter((s) => weekDateSet.has(s.date)),
      unavailabilities: scheduleData.unavailabilities.filter((u) =>
        weekDateSet.has(u.date),
      ),
      holes: scheduleData.holes.filter((h) => weekDateSet.has(h.date)),
    };
  }, [scheduleData, weeks, safeWeekOffset]);

  const goToNextWeek = useCallback(() => {
    setWeekOffset((prev) => Math.min(prev + 1, weeks.length - 1));
  }, [weeks.length]);

  const goToPreviousWeek = useCallback(() => {
    setWeekOffset((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToWeek = useCallback(
    (index: number) => {
      setWeekOffset(Math.max(0, Math.min(index, weeks.length - 1)));
    },
    [weeks.length],
  );

  // Reset week offset when month changes
  useEffect(() => {
    setWeekOffset(0);
  }, [month]);

  return {
    scheduleData,
    isLoading,
    isFetching,
    // Week navigation
    weeks,
    weekOffset: safeWeekOffset,
    totalWeeks: weeks.length,
    currentWeekData,
    goToNextWeek,
    goToPreviousWeek,
    goToWeek,
  };
};
