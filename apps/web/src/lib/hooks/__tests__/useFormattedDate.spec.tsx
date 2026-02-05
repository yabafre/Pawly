import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormattedDate } from '../useFormattedDate';

// Mock useFormatter from next-intl
const mockDateTimeFormat = vi.fn((date: Date, options: Intl.DateTimeFormatOptions) => {
  // Simulate French locale formatting
  const formatter = new Intl.DateTimeFormat('fr-FR', options);
  return formatter.format(date);
});

const mockRelativeTime = vi.fn((date: Date, reference: Date) => {
  const diff = date.getTime() - reference.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `il y a ${Math.abs(days)} jours`;
  if (days > 0) return `dans ${days} jours`;
  return "aujourd'hui";
});

const mockDateTimeRange = vi.fn((start: Date, end: Date, options: Intl.DateTimeFormatOptions) => {
  const formatter = new Intl.DateTimeFormat('fr-FR', options);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
});

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    dateTime: mockDateTimeFormat,
    relativeTime: mockRelativeTime,
    dateTimeRange: mockDateTimeRange,
  }),
}));

describe('useFormattedDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats date with default short format', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    result.current.formatDate(testDate);

    expect(mockDateTimeFormat).toHaveBeenCalledWith(
      testDate,
      expect.objectContaining({ year: 'numeric', month: 'short', day: 'numeric' })
    );
  });

  it('formats date with full format', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    result.current.formatDate(testDate, 'full');

    expect(mockDateTimeFormat).toHaveBeenCalledWith(
      testDate,
      expect.objectContaining({ year: 'numeric', month: 'long', day: 'numeric' })
    );
  });

  it('formats time correctly', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T14:30:00');

    result.current.formatTime(testDate);

    expect(mockDateTimeFormat).toHaveBeenCalledWith(
      testDate,
      expect.objectContaining({ hour: 'numeric', minute: 'numeric' })
    );
  });

  it('formats relative time', () => {
    const { result } = renderHook(() => useFormattedDate());
    const pastDate = new Date('2024-01-01');
    const now = new Date('2024-01-03');

    result.current.formatRelative(pastDate, now);

    expect(mockRelativeTime).toHaveBeenCalledWith(pastDate, now);
  });

  it('formats date range', () => {
    const { result } = renderHook(() => useFormattedDate());
    const startDate = new Date('2024-11-20');
    const endDate = new Date('2024-11-25');

    result.current.formatRange(startDate, endDate, 'short');

    expect(mockDateTimeRange).toHaveBeenCalledWith(
      startDate,
      endDate,
      expect.objectContaining({ year: 'numeric', month: 'short', day: 'numeric' })
    );
  });

  it('accepts string dates and converts them', () => {
    const { result } = renderHook(() => useFormattedDate());
    const dateString = '2024-11-20T10:00:00';

    result.current.formatDate(dateString);

    expect(mockDateTimeFormat).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Object)
    );
  });

  it('accepts timestamp numbers and converts them', () => {
    const { result } = renderHook(() => useFormattedDate());
    const timestamp = Date.now();

    result.current.formatDate(timestamp);

    expect(mockDateTimeFormat).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Object)
    );
  });

  it('exposes DATE_FORMATS constant', () => {
    const { result } = renderHook(() => useFormattedDate());

    expect(result.current.DATE_FORMATS).toBeDefined();
    expect(result.current.DATE_FORMATS.full).toBeDefined();
    expect(result.current.DATE_FORMATS.short).toBeDefined();
    expect(result.current.DATE_FORMATS.time).toBeDefined();
  });
});

describe('useFormattedDate — FR locale output verification', () => {
  it('formats full date in French', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    const output = result.current.formatDate(testDate, 'full');
    expect(output).toContain('novembre');
    expect(output).toContain('2024');
  });

  it('formats time in 24h French format', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T14:30:00');

    const output = result.current.formatTime(testDate);
    expect(output).toBe('14:30');
  });

  it('formats weekday with date in French', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    const output = result.current.formatDate(testDate, 'fullWithWeekday');
    expect(output.toLowerCase()).toContain('mercredi');
    expect(output).toContain('novembre');
  });
});

describe('useFormattedDate — EN locale output verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Override mock to use EN locale
    mockDateTimeFormat.mockImplementation((date: Date, options: Intl.DateTimeFormatOptions) => {
      return new Intl.DateTimeFormat('en-US', options).format(date);
    });
    mockDateTimeRange.mockImplementation((start: Date, end: Date, options: Intl.DateTimeFormatOptions) => {
      const formatter = new Intl.DateTimeFormat('en-US', options);
      return `${formatter.format(start)} – ${formatter.format(end)}`;
    });
    mockRelativeTime.mockImplementation((date: Date, reference: Date) => {
      const diff = date.getTime() - reference.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      if (days < 0) return `${Math.abs(days)} days ago`;
      if (days > 0) return `in ${days} days`;
      return 'today';
    });
  });

  it('formats full date in English', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    const output = result.current.formatDate(testDate, 'full');
    expect(output).toContain('November');
    expect(output).toContain('2024');
  });

  it('formats time in 12h English format', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T14:30:00');

    const output = result.current.formatTime(testDate);
    expect(output).toMatch(/2:30\s?(PM|pm)/);
  });

  it('formats weekday with date in English', () => {
    const { result } = renderHook(() => useFormattedDate());
    const testDate = new Date('2024-11-20T10:00:00');

    const output = result.current.formatDate(testDate, 'fullWithWeekday');
    expect(output).toContain('Wednesday');
    expect(output).toContain('November');
  });

  it('formats date range in English', () => {
    const { result } = renderHook(() => useFormattedDate());
    const start = new Date('2024-11-20T10:00:00');
    const end = new Date('2024-11-25T10:00:00');

    const output = result.current.formatRange(start, end, 'short');
    expect(output).toContain('Nov');
    expect(output).toContain('20');
    expect(output).toContain('25');
  });

  it('formats relative time in English', () => {
    const { result } = renderHook(() => useFormattedDate());
    const pastDate = new Date('2024-01-01');
    const now = new Date('2024-01-04');

    const output = result.current.formatRelative(pastDate, now);
    expect(output).toContain('3 days ago');
  });
});
