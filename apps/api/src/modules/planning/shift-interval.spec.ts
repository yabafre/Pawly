import {
  shiftsOverlap,
  toAbsoluteInterval,
  restMinutesBetween,
} from './shift-interval';

describe('shift-interval (Story 13-3, KON-132)', () => {
  describe('toAbsoluteInterval', () => {
    it('maps a same-day shift to an absolute [start, end) minute interval', () => {
      const [start, end] = toAbsoluteInterval({
        date: '1970-01-02',
        startTime: '08:00',
        endTime: '12:00',
      });
      expect(start).toBe(1440 + 480);
      expect(end).toBe(1440 + 720);
    });

    it('extends an overnight shift past midnight (end < start)', () => {
      const [start, end] = toAbsoluteInterval({
        date: '1970-01-02',
        startTime: '22:00',
        endTime: '06:00',
      });
      expect(start).toBe(1440 + 1320);
      // 06:00 the NEXT day = 1320 + 8h
      expect(end).toBe(1440 + 1320 + 480);
    });

    it('treats end === start as a zero-length slot, never a 24h shift', () => {
      const [start, end] = toAbsoluteInterval({
        date: '2026-03-14',
        startTime: '09:00',
        endTime: '09:00',
      });
      expect(end).toBe(start);
    });
  });

  describe('shiftsOverlap', () => {
    it('detects an overnight shift overlapping the NEXT day', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          { date: '2026-03-15', startTime: '05:00', endTime: '09:00' },
        ),
      ).toBe(true);
    });

    it('detects an overnight shift overlapping a same-date morning shift (the audited same-date wrap case)', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          { date: '2026-03-14', startTime: '05:00', endTime: '09:00' },
        ),
      ).toBe(true);
    });

    it('detects an overnight shift overlapping the PREVIOUS day night shift', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-15', startTime: '00:00', endTime: '08:00' },
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
        ),
      ).toBe(true);
    });

    it('is symmetric', () => {
      const a = { date: '2026-03-14', startTime: '22:00', endTime: '06:00' };
      const b = { date: '2026-03-15', startTime: '05:00', endTime: '09:00' };
      expect(shiftsOverlap(a, b)).toBe(shiftsOverlap(b, a));
    });

    it('does not overlap at an exact junction (end === next start)', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          { date: '2026-03-15', startTime: '06:00', endTime: '12:00' },
        ),
      ).toBe(false);
    });

    it('does not overlap for distant days', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          { date: '2026-03-20', startTime: '05:00', endTime: '09:00' },
        ),
      ).toBe(false);
    });

    it('keeps same-date non-wrapping behaviour: overlapping pair', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
          { date: '2026-03-14', startTime: '11:00', endTime: '15:00' },
        ),
      ).toBe(true);
    });

    it('keeps same-date non-wrapping behaviour: disjoint pair', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
          { date: '2026-03-14', startTime: '12:00', endTime: '15:00' },
        ),
      ).toBe(false);
    });

    it('never overlaps a zero-length slot', () => {
      expect(
        shiftsOverlap(
          { date: '2026-03-14', startTime: '09:00', endTime: '09:00' },
          { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
        ),
      ).toBe(false);
    });

    it('crosses a month frontier (Dec 31 -> Jan 1)', () => {
      expect(
        shiftsOverlap(
          { date: '2026-12-31', startTime: '22:00', endTime: '06:00' },
          { date: '2027-01-01', startTime: '05:00', endTime: '09:00' },
        ),
      ).toBe(true);
    });
  });

  describe('restMinutesBetween', () => {
    it('measures the real gap for two same-day-ordered shifts', () => {
      expect(
        restMinutesBetween(
          { date: '2026-03-14', startTime: '08:00', endTime: '18:00' },
          { date: '2026-03-15', startTime: '08:00', endTime: '18:00' },
        ),
      ).toBe(840); // 18:00 -> 08:00 = 14h
    });

    it('measures the real gap after an overnight shift (the AC4 bug)', () => {
      expect(
        restMinutesBetween(
          { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          { date: '2026-03-15', startTime: '08:00', endTime: '12:00' },
        ),
      ).toBe(120); // 06:00 -> 08:00 = 2h, NOT 26h
    });

    it('is symmetric', () => {
      const a = { date: '2026-03-14', startTime: '22:00', endTime: '06:00' };
      const b = { date: '2026-03-15', startTime: '08:00', endTime: '12:00' };
      expect(restMinutesBetween(a, b)).toBe(restMinutesBetween(b, a));
    });

    it('returns a negative gap for overlapping shifts', () => {
      expect(
        restMinutesBetween(
          { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
          { date: '2026-03-14', startTime: '11:00', endTime: '15:00' },
        ),
      ).toBeLessThan(0);
    });
  });
});
