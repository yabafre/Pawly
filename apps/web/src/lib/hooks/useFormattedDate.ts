import { useFormatter } from 'next-intl';

/**
 * Pre-defined date format options for consistent formatting across the app.
 * All formats are locale-aware and will adapt to FR/EN automatically.
 */
export const DATE_FORMATS = {
  /** Full date: "20 novembre 2024" (FR) or "November 20, 2024" (EN) */
  full: { year: 'numeric', month: 'long', day: 'numeric' },
  /** Short date: "20 nov. 2024" (FR) or "Nov 20, 2024" (EN) */
  short: { year: 'numeric', month: 'short', day: 'numeric' },
  /** Numeric date: "20/11/2024" (FR) or "11/20/2024" (EN) */
  numeric: { year: 'numeric', month: '2-digit', day: '2-digit' },
  /** Day and month only: "20 novembre" (FR) or "November 20" (EN) */
  dayMonth: { month: 'long', day: 'numeric' },
  /** Day and short month: "20 nov." (FR) or "Nov 20" (EN) */
  dayMonthShort: { month: 'short', day: 'numeric' },
  /** Weekday with full date: "mercredi 20 novembre 2024" (FR) */
  fullWithWeekday: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  /** Time only: "14:30" (FR) or "2:30 PM" (EN) */
  time: { hour: 'numeric', minute: 'numeric' },
  /** Full datetime: "20 novembre 2024, 14:30" (FR) */
  dateTime: { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' },
} as const;

export type DateFormatKey = keyof typeof DATE_FORMATS;

// Type for the options we support (matches next-intl's expected types)
type DateTimeOptions = {
  year?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow';
  day?: 'numeric' | '2-digit';
  weekday?: 'long' | 'short' | 'narrow';
  hour?: 'numeric' | '2-digit';
  minute?: 'numeric' | '2-digit';
  second?: 'numeric' | '2-digit';
};

/**
 * Hook wrapper around next-intl's useFormatter for date formatting.
 * Provides locale-aware date formatting with pre-defined formats.
 *
 * @example
 * ```tsx
 * const { formatDate, formatTime, formatRelative, formatRange } = useFormattedDate();
 *
 * // Using pre-defined formats
 * <span>{formatDate(new Date(), 'full')}</span>
 * // Output: "20 novembre 2024" (FR) or "November 20, 2024" (EN)
 *
 * // Using custom options
 * <span>{formatDate(new Date(), { month: 'short', day: 'numeric' })}</span>
 *
 * // Relative time
 * <span>{formatRelative(pastDate)}</span>
 * // Output: "il y a 2 jours" (FR) or "2 days ago" (EN)
 *
 * // Date range
 * <span>{formatRange(startDate, endDate)}</span>
 * // Output: "20 - 25 nov. 2024"
 * ```
 */
export function useFormattedDate() {
  const format = useFormatter();

  /**
   * Format a date using a pre-defined format key or custom options.
   */
  const formatDate = (
    date: Date | number | string,
    formatKey: DateFormatKey | DateTimeOptions = 'short'
  ): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const options = typeof formatKey === 'string' ? DATE_FORMATS[formatKey] : formatKey;
    return format.dateTime(dateObj, options);
  };

  /**
   * Format time only.
   */
  const formatTime = (date: Date | number | string): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return format.dateTime(dateObj, DATE_FORMATS.time);
  };

  /**
   * Format relative time (e.g., "2 days ago", "in 3 hours").
   * Uses current time as reference if not provided.
   */
  const formatRelative = (date: Date | number | string, relativeTo?: Date): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const reference = relativeTo ?? new Date();
    return format.relativeTime(dateObj, reference);
  };

  /**
   * Format a date range.
   */
  const formatRange = (
    start: Date | number | string,
    end: Date | number | string,
    formatKey: DateFormatKey | DateTimeOptions = 'short'
  ): string => {
    const startDate = typeof start === 'string' || typeof start === 'number' ? new Date(start) : start;
    const endDate = typeof end === 'string' || typeof end === 'number' ? new Date(end) : end;
    const options = typeof formatKey === 'string' ? DATE_FORMATS[formatKey] : formatKey;
    return format.dateTimeRange(startDate, endDate, options);
  };

  return {
    formatDate,
    formatTime,
    formatRelative,
    formatRange,
    // Expose raw formatter for advanced use cases
    format,
    // Expose pre-defined formats for reference
    DATE_FORMATS,
  };
}
