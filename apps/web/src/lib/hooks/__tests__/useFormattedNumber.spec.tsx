import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormattedNumber } from '../useFormattedNumber';

// Mock useFormatter from next-intl
const mockNumberFormat = vi.fn((value: number, options: Intl.NumberFormatOptions) => {
  // Simulate French locale formatting
  const formatter = new Intl.NumberFormat('fr-FR', options);
  return formatter.format(value);
});

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    number: mockNumberFormat,
  }),
}));

describe('useFormattedNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatNumber', () => {
    it('formats number with default options', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatNumber(1234.56);

      expect(mockNumberFormat).toHaveBeenCalledWith(1234.56, {});
    });

    it('formats number as integer', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatNumber(1234.56, 'integer');

      expect(mockNumberFormat).toHaveBeenCalledWith(
        1234.56,
        expect.objectContaining({ maximumFractionDigits: 0 })
      );
    });

    it('formats number with custom options', () => {
      const { result } = renderHook(() => useFormattedNumber());
      const customOptions = { minimumFractionDigits: 3 };

      result.current.formatNumber(1234, customOptions);

      expect(mockNumberFormat).toHaveBeenCalledWith(1234, customOptions);
    });
  });

  describe('formatCurrency', () => {
    it('formats currency in EUR by default', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatCurrency(99.99);

      expect(mockNumberFormat).toHaveBeenCalledWith(
        99.99,
        expect.objectContaining({ style: 'currency', currency: 'EUR' })
      );
    });

    it('formats currency in specified currency', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatCurrency(99.99, 'USD');

      expect(mockNumberFormat).toHaveBeenCalledWith(
        99.99,
        expect.objectContaining({ style: 'currency', currency: 'USD' })
      );
    });

    it('accepts additional options for currency', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatCurrency(99.99, 'EUR', { minimumFractionDigits: 0 });

      expect(mockNumberFormat).toHaveBeenCalledWith(
        99.99,
        expect.objectContaining({
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 0,
        })
      );
    });
  });

  describe('formatPercent', () => {
    it('formats decimal as percentage', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatPercent(0.15);

      expect(mockNumberFormat).toHaveBeenCalledWith(
        0.15,
        expect.objectContaining({ style: 'percent' })
      );
    });

    it('accepts additional options for percentage', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatPercent(0.156, { maximumFractionDigits: 1 });

      expect(mockNumberFormat).toHaveBeenCalledWith(
        0.156,
        expect.objectContaining({ style: 'percent', maximumFractionDigits: 1 })
      );
    });
  });

  describe('formatCompact', () => {
    it('formats number in compact notation', () => {
      const { result } = renderHook(() => useFormattedNumber());

      result.current.formatCompact(1500000);

      expect(mockNumberFormat).toHaveBeenCalledWith(
        1500000,
        expect.objectContaining({ notation: 'compact' })
      );
    });
  });

  describe('formatHours', () => {
    it('formats whole hours without decimals', () => {
      const { result } = renderHook(() => useFormattedNumber());

      const formatted = result.current.formatHours(35);

      expect(mockNumberFormat).toHaveBeenCalledWith(
        35,
        expect.objectContaining({ maximumFractionDigits: 0 })
      );
      expect(formatted).toContain('h');
    });

    it('formats fractional hours with one decimal', () => {
      const { result } = renderHook(() => useFormattedNumber());

      const formatted = result.current.formatHours(35.5);

      expect(mockNumberFormat).toHaveBeenCalledWith(
        35.5,
        expect.objectContaining({ minimumFractionDigits: 1, maximumFractionDigits: 1 })
      );
      expect(formatted).toContain('h');
    });
  });

  it('exposes NUMBER_FORMATS constant', () => {
    const { result } = renderHook(() => useFormattedNumber());

    expect(result.current.NUMBER_FORMATS).toBeDefined();
    expect(result.current.NUMBER_FORMATS.default).toBeDefined();
    expect(result.current.NUMBER_FORMATS.percent).toBeDefined();
    expect(result.current.NUMBER_FORMATS.compact).toBeDefined();
  });
});

describe('useFormattedNumber — FR locale output verification', () => {
  it('formats number with French separators', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatNumber(1234.56);
    // French uses NBSP as thousands separator and comma for decimals
    expect(output).toMatch(/1[\s\u00A0\u202F]?234,56/);
  });

  it('formats currency in EUR with French format', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatCurrency(99.99, 'EUR');
    expect(output).toContain('99,99');
    expect(output).toContain('€');
  });

  it('formats hours as 35h in French', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatHours(35);
    expect(output).toBe('35h');
  });
});

describe('useFormattedNumber — EN locale output verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Override mock to use EN locale
    mockNumberFormat.mockImplementation((value: number, options: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat('en-US', options).format(value);
    });
  });

  it('formats number with English separators', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatNumber(1234.56);
    expect(output).toBe('1,234.56');
  });

  it('formats currency in EUR with English format', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatCurrency(99.99, 'EUR');
    expect(output).toContain('99.99');
    expect(output).toContain('€');
  });

  it('formats currency in USD', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatCurrency(49.99, 'USD');
    expect(output).toContain('49.99');
    expect(output).toContain('$');
  });

  it('formats percentage in English', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatPercent(0.15);
    expect(output).toContain('15');
    expect(output).toContain('%');
  });

  it('formats hours as 35h in English', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatHours(35);
    expect(output).toBe('35h');
  });

  it('formats fractional hours with decimal in English', () => {
    const { result } = renderHook(() => useFormattedNumber());

    const output = result.current.formatHours(7.5);
    expect(output).toBe('7.5h');
  });
});
