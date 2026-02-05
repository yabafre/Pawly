import { useFormatter } from 'next-intl';

/**
 * Pre-defined number format options for consistent formatting across the app.
 * All formats are locale-aware and will adapt to FR/EN automatically.
 */
export const NUMBER_FORMATS = {
  /** Default number: "1 234,56" (FR) or "1,234.56" (EN) */
  default: {},
  /** Integer: "1 234" (FR) or "1,234" (EN) */
  integer: { maximumFractionDigits: 0 },
  /** Percentage: "15 %" (FR) or "15%" (EN) */
  percent: { style: 'percent' as const },
  /** Compact: "1,2k" or "1,2M" */
  compact: { notation: 'compact' as const },
  /** Two decimals: "1 234,56" */
  decimal2: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
} as const;

export type NumberFormatKey = keyof typeof NUMBER_FORMATS;

/**
 * Currency codes supported by the app.
 */
export type SupportedCurrency = 'EUR' | 'USD' | 'GBP' | 'CAD' | 'CHF';

// Type for number format options compatible with next-intl
type NumberOptions = {
  style?: 'decimal' | 'currency' | 'percent' | 'unit';
  currency?: string;
  notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumIntegerDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
};

/**
 * Hook wrapper around next-intl's useFormatter for number formatting.
 * Provides locale-aware number and currency formatting.
 *
 * @example
 * ```tsx
 * const { formatNumber, formatCurrency, formatPercent } = useFormattedNumber();
 *
 * // Basic number formatting
 * <span>{formatNumber(1234.56)}</span>
 * // Output: "1 234,56" (FR) or "1,234.56" (EN)
 *
 * // Currency formatting
 * <span>{formatCurrency(99.99, 'EUR')}</span>
 * // Output: "99,99 €" (FR) or "€99.99" (EN)
 *
 * // Percentage
 * <span>{formatPercent(0.15)}</span>
 * // Output: "15 %" (FR) or "15%" (EN)
 *
 * // Compact notation
 * <span>{formatNumber(1500000, 'compact')}</span>
 * // Output: "1,5M"
 * ```
 */
export function useFormattedNumber() {
  const format = useFormatter();

  /**
   * Format a number using a pre-defined format key or custom options.
   */
  const formatNumber = (
    value: number,
    formatKey: NumberFormatKey | NumberOptions = 'default'
  ): string => {
    const options = typeof formatKey === 'string' ? NUMBER_FORMATS[formatKey] : formatKey;
    return format.number(value, options);
  };

  /**
   * Format a number as currency.
   * Defaults to EUR as the primary currency for French veterinary clinics.
   */
  const formatCurrency = (
    value: number,
    currency: SupportedCurrency = 'EUR',
    options?: Omit<NumberOptions, 'style' | 'currency'>
  ): string => {
    return format.number(value, {
      style: 'currency',
      currency,
      ...options,
    });
  };

  /**
   * Format a decimal number as a percentage.
   * Input should be a decimal (0.15 = 15%).
   */
  const formatPercent = (
    value: number,
    options?: Omit<NumberOptions, 'style'>
  ): string => {
    return format.number(value, {
      style: 'percent',
      ...options,
    });
  };

  /**
   * Format a number in compact notation (1.5k, 2.3M, etc.).
   */
  const formatCompact = (
    value: number,
    options?: Omit<NumberOptions, 'notation'>
  ): string => {
    return format.number(value, {
      notation: 'compact',
      ...options,
    });
  };

  /**
   * Format hours (e.g., for planning display).
   * Automatically handles decimal hours to H:MM format if needed.
   */
  const formatHours = (hours: number): string => {
    // Display as whole number if it's a round hour
    if (hours === Math.floor(hours)) {
      return format.number(hours, { maximumFractionDigits: 0 }) + 'h';
    }
    // Otherwise show one decimal
    return format.number(hours, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'h';
  };

  return {
    formatNumber,
    formatCurrency,
    formatPercent,
    formatCompact,
    formatHours,
    // Expose raw formatter for advanced use cases
    format,
    // Expose pre-defined formats for reference
    NUMBER_FORMATS,
  };
}
