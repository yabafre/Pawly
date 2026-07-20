import {
  FRENCH_LABOR_LAW,
  STATUTORY_RULE_CONFIG,
  dayWorkedMinutes,
  dayAmplitudeMinutes,
  maxConsecutiveWorkedDays,
  findStatutoryViolations,
  wouldExceedStatutory,
  type StatutoryShift,
} from './french-labor-law';

const shift = (
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes = 0,
): StatutoryShift => ({
  date,
  startTime,
  endTime,
  breakMinutes,
});

describe('french-labor-law constants', () => {
  it('exposes the seven statutory limits', () => {
    expect(FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES).toBe(600);
    expect(FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES).toBe(780);
    expect(FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES).toBe(660);
    expect(FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES).toBe(2880);
    expect(FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H).toBe(20);
    expect(FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES).toBe(360);
    expect(FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS).toBe(35);
    expect(FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS).toBe(6);
  });
  it('STATUTORY_RULE_CONFIG mirrors the constants', () => {
    expect(STATUTORY_RULE_CONFIG).toEqual({
      maxDailyHours: 10,
      maxDailyAmplitudeHours: 13,
      minDailyRestHours: 11,
      maxWeeklyStatutoryHours: 48,
      minBreakMinutesOver6h: 20,
      minWeeklyRestHours: 35,
      maxConsecutiveWorkDays: 6,
    });
  });
});

describe('daily work + amplitude', () => {
  it('nets out break minutes', () => {
    expect(dayWorkedMinutes([shift('2026-08-03', '08:00', '19:00', 60)])).toBe(
      600,
    ); // 11h - 1h = 10h
  });
  it('flags > 10h net worked on a day', () => {
    const v = findStatutoryViolations([
      shift('2026-08-03', '08:00', '19:00', 0),
    ]); // 11h net
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'DAILY_WORK', date: '2026-08-03' }),
    );
  });
  it('does not flag exactly 10h net worked', () => {
    const v = findStatutoryViolations([
      shift('2026-08-03', '08:00', '18:00', 0),
    ]); // 10h
    expect(v.filter((x) => x.kind === 'DAILY_WORK')).toHaveLength(0);
  });
  it('amplitude spans earliest start to latest end across split shifts', () => {
    const day = [
      shift('2026-08-03', '08:00', '12:00', 0),
      shift('2026-08-03', '18:00', '22:00', 0),
    ];
    expect(dayAmplitudeMinutes(day)).toBe(14 * 60); // 08:00 -> 22:00
    const v = findStatutoryViolations(day);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'DAILY_AMPLITUDE' }),
    );
  });
});

describe('consecutive days', () => {
  it('counts the longest run', () => {
    const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07'];
    expect(maxConsecutiveWorkedDays(dates)).toBe(3);
  });
  it('flags a 7th consecutive worked day', () => {
    const week = ['03', '04', '05', '06', '07', '08', '09'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '15:00', 0),
    );
    const v = findStatutoryViolations(week);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'CONSECUTIVE_DAYS', date: '2026-08-09' }),
    );
  });
  it('does not flag 6 consecutive worked days', () => {
    const week = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '15:00', 0),
    );
    expect(
      findStatutoryViolations(week).filter(
        (x) => x.kind === 'CONSECUTIVE_DAYS',
      ),
    ).toHaveLength(0);
  });
});

describe('weekly rest (>=35h, boundary-aware)', () => {
  // ISO week Mon 2026-08-03 .. Sun 2026-08-09. Work Mon-Sat 09:00-18:00, Sat ends late.
  it('flags a week whose only in-week rest is < 35h', () => {
    const week = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '20:00', 0),
    );
    const v = findStatutoryViolations(week); // Sat 20:00 -> Sun 24:00 = 28h only
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-08-03' }),
    );
  });
  it('credits rest that straddles into the next week when neighbours are present', () => {
    const week = ['03', '04', '05', '06', '07'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '17:00', 0),
    );
    const next = [shift('2026-08-11', '09:00', '17:00', 0)]; // Fri 17:00 -> Tue next 09:00 >> 35h
    expect(
      findStatutoryViolations([...week, ...next]).filter(
        (x) => x.kind === 'WEEKLY_REST',
      ),
    ).toHaveLength(0);
  });
});

describe('wouldExceedStatutory (incremental)', () => {
  it('blocks a candidate that tips the day over 10h net', () => {
    const window = [shift('2026-08-03', '08:00', '14:00', 0)]; // 6h
    const candidate = shift('2026-08-03', '14:00', '19:00', 0); // +5h = 11h
    expect(wouldExceedStatutory(window, candidate)).toContain('DAILY_WORK');
  });
  it('blocks the 7th consecutive day', () => {
    const window = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '15:00', 0),
    );
    expect(
      wouldExceedStatutory(window, shift('2026-08-09', '09:00', '15:00', 0)),
    ).toContain('CONSECUTIVE_DAYS');
  });
  it('returns [] when the candidate cannot make things worse (window already over)', () => {
    const window = [shift('2026-08-03', '08:00', '20:00', 0)]; // already 12h
    const candidate = shift('2026-08-05', '09:00', '15:00', 0); // unrelated day
    expect(wouldExceedStatutory(window, candidate)).toEqual([]);
  });
});

describe('Story 13-2 — window-bounded weekly rest', () => {
  // ISO week Mon 2026-08-03 .. Sun 2026-08-09. Dense Wed–Sun, worked 09:00-18:00.
  const denseWedToSun = ['05', '06', '07', '08', '09'].map((d) =>
    shift(`2026-08-${d}`, '09:00', '18:00', 0),
  );

  it('does NOT credit phantom rest when the data window is exactly the loaded range', () => {
    // Window = the loaded days only. The head sentinel cannot be proven as 35h rest,
    // so the week is (conservatively) flagged — no phantom credit at the edge.
    const v = findStatutoryViolations(denseWedToSun, {
      start: '2026-08-05',
      end: '2026-08-09',
    });
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-08-03' }),
    );
  });

  it('DOES credit a genuine >=8-day rest proven inside a wide window (no false positive)', () => {
    // Same dense Wed–Sun work, but the window spans 8 real days on each side and no shift
    // exists before Wed — the proven long rest before the first shift is credited.
    const v = findStatutoryViolations(denseWedToSun, {
      start: '2026-07-28',
      end: '2026-08-16',
    });
    expect(v.filter((x) => x.kind === 'WEEKLY_REST')).toHaveLength(0);
  });

  it('flags a 35h weekly-rest deficit on the ISO week straddling Dec→Jan', () => {
    // Three dense weeks 09:00-18:00 across the year boundary: no 35h rest overlaps the
    // middle ISO week (Mon 2025-12-29 .. Sun 2026-01-04).
    const days: string[] = [];
    for (let d = 22; d <= 31; d++)
      days.push(`2025-12-${String(d).padStart(2, '0')}`);
    for (let d = 1; d <= 11; d++)
      days.push(`2026-01-${String(d).padStart(2, '0')}`);
    const dense = days.map((d) => shift(d, '09:00', '18:00', 0));
    const v = findStatutoryViolations(dense, {
      start: '2025-12-15',
      end: '2026-01-18',
    });
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'WEEKLY_REST', date: '2025-12-29' }),
    );
  });

  it('flags the 7th consecutive worked day straddling Dec→Jan (incremental)', () => {
    const priorRun = [
      '2025-12-27',
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ].map((d) => shift(d, '09:00', '15:00', 0));
    expect(
      wouldExceedStatutory(priorRun, shift('2026-01-02', '09:00', '15:00', 0)),
    ).toContain('CONSECUTIVE_DAYS');
  });
});

describe('Story 13-4 (KON-136) — statutory extensions', () => {
  const day = (
    date: string,
    startTime: string,
    endTime: string,
    breakMinutes = 0,
  ): StatutoryShift => ({ date, startTime, endTime, breakMinutes });

  describe('DAILY_REST (11h, L.3131-1)', () => {
    it('findStatutoryViolations flags a cross-midnight gap under 11h', () => {
      const shifts = [
        day('2026-03-02', '14:00', '22:00'), // ends Mon 22:00
        day('2026-03-03', '06:00', '14:00'), // starts Tue 06:00 -> 8h rest
      ];
      const kinds = findStatutoryViolations(shifts).map((v) => v.kind);
      expect(kinds).toContain('DAILY_REST');
    });

    it('flags an intra-day split under 11h (Alex: stricter reading)', () => {
      const shifts = [
        day('2026-03-02', '09:00', '12:00'),
        day('2026-03-02', '14:00', '18:00'), // 2h gap
      ];
      expect(
        findStatutoryViolations(shifts).some((v) => v.kind === 'DAILY_REST'),
      ).toBe(true);
    });

    it('does not flag a gap of exactly 11h', () => {
      const shifts = [
        day('2026-03-02', '10:00', '19:00'), // ends 19:00
        day('2026-03-03', '06:00', '10:00'), // starts +11h
      ];
      expect(
        findStatutoryViolations(shifts).some((v) => v.kind === 'DAILY_REST'),
      ).toBe(false);
    });

    it('wouldExceedStatutory returns DAILY_REST only when the candidate introduces it', () => {
      const windowShifts = [day('2026-03-02', '14:00', '22:00')];
      const candidate = day('2026-03-03', '06:00', '14:00');
      expect(wouldExceedStatutory(windowShifts, candidate)).toContain(
        'DAILY_REST',
      );
      // A candidate 12h later introduces nothing.
      expect(
        wouldExceedStatutory(windowShifts, day('2026-03-03', '10:00', '18:00')),
      ).not.toContain('DAILY_REST');
    });
  });

  describe('WEEKLY_CEILING (48h net, L.3121-20)', () => {
    const fifty = () =>
      // Mon–Sat 2026-03-02..07, 10h gross - 1h break = 9h net = 54h/week
      ['02', '03', '04', '05', '06', '07'].map((d) =>
        day(`2026-03-${d}`, '08:00', '19:00', 60),
      );

    it('findStatutoryViolations flags an ISO week over 48h net', () => {
      const v = findStatutoryViolations(fifty()).find(
        (x) => x.kind === 'WEEKLY_CEILING',
      );
      expect(v).toBeDefined();
      expect(v!.date).toBe('2026-03-02'); // ISO-week Monday
      expect(v!.actual).toBe(6 * 9 * 60); // 3240 net minutes
    });

    it('wouldExceedStatutory flags the candidate that crosses 48h net', () => {
      const windowShifts = ['02', '03', '04', '05', '06'].map((d) =>
        day(`2026-03-${d}`, '08:00', '19:00', 60),
      ); // 5 * 9h = 45h
      expect(
        wouldExceedStatutory(
          windowShifts,
          day('2026-03-07', '08:00', '19:00', 60),
        ),
      ).toContain('WEEKLY_CEILING'); // 54h
    });
  });

  describe('MANDATORY_BREAK (20min over 6h, L.3121-16)', () => {
    it('flags a > 6h net day with under 20min break', () => {
      const shifts = [day('2026-03-02', '08:00', '15:00', 0)]; // 7h net, 0 break
      const v = findStatutoryViolations(shifts).find(
        (x) => x.kind === 'MANDATORY_BREAK',
      );
      expect(v).toBeDefined();
      expect(v!.actual).toBe(0);
      expect(v!.limit).toBe(20);
    });

    it('does not flag a > 6h day with a 20min break', () => {
      const shifts = [day('2026-03-02', '08:00', '15:20', 20)]; // ~7h net, 20 break
      expect(
        findStatutoryViolations(shifts).some(
          (v) => v.kind === 'MANDATORY_BREAK',
        ),
      ).toBe(false);
    });

    it('does not flag a <= 6h day', () => {
      const shifts = [day('2026-03-02', '08:00', '14:00', 0)]; // 6h net exactly
      expect(
        findStatutoryViolations(shifts).some(
          (v) => v.kind === 'MANDATORY_BREAK',
        ),
      ).toBe(false);
    });

    it('wouldExceedStatutory flags the candidate that tips the day over 6h without a break', () => {
      const windowShifts = [day('2026-03-02', '08:00', '12:00', 0)]; // 4h
      expect(
        wouldExceedStatutory(
          windowShifts,
          day('2026-03-02', '13:00', '16:30', 0),
        ),
      ).toEqual(expect.arrayContaining(['MANDATORY_BREAK'])); // day now 7h30 net, 0 break
    });
  });
});
