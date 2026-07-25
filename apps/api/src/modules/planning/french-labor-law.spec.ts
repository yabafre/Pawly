import {
  CCN_LIMITS,
  CCN_SHARED,
  FRENCH_LABOR_LAW,
  STATUTORY_RULE_CONFIG,
  STATUTORY_WINDOW_DAYS,
  dayWorkedMinutes,
  dayAmplitudeMinutes,
  maxConsecutiveWorkedDays,
  findStatutoryViolations,
  regimeForJobType,
  removalWouldExceedStatutory,
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

/** Default options — corps 1875 (support staff), no data window, no 12-week context. */
const S = { regime: 'SUPPORT_STAFF' } as const;
const P = { regime: 'PRACTITIONER' } as const;

describe('french-labor-law constants', () => {
  it('exposes the statutory limits (KON-139: daily cap = conventional 12h)', () => {
    expect(FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES).toBe(720);
    expect(FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES).toBe(780);
    expect(FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES).toBe(660);
    expect(FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES).toBe(2880);
    expect(FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H).toBe(20);
    expect(FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES).toBe(360);
    expect(FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS).toBe(35);
    expect(FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS).toBe(6);
  });
  it('exposes the per-regime and shared CCN limits (KON-139)', () => {
    expect(CCN_LIMITS.SUPPORT_STAFF.CONTINUOUS_DAY_AMPLITUDE_MINUTES).toBe(720);
    expect(CCN_LIMITS.PRACTITIONER.CONTINUOUS_DAY_AMPLITUDE_MINUTES).toBe(900);
    expect(CCN_LIMITS.SUPPORT_STAFF.SUNDAY_IN_REST_PAIR_HARD).toBe(true);
    expect(CCN_LIMITS.PRACTITIONER.SUNDAY_IN_REST_PAIR_HARD).toBe(false);
    expect(CCN_SHARED.MAX_VACATIONS_PER_DAY).toBe(2);
    expect(CCN_SHARED.MAX_TWELVE_WEEK_TOTAL_MINUTES).toBe(31_680);
    expect(STATUTORY_WINDOW_DAYS).toBe(14);
  });
  it('STATUTORY_RULE_CONFIG mirrors the constants', () => {
    expect(STATUTORY_RULE_CONFIG).toEqual({
      maxDailyHours: 12,
      maxDailyAmplitudeHours: 13,
      minDailyRestHours: 11,
      maxWeeklyStatutoryHours: 48,
      minBreakMinutesOver6h: 20,
      minWeeklyRestHours: 35,
      maxConsecutiveWorkDays: 6,
    });
  });
  it('maps jobType to regime: VET is the only ordinal job type', () => {
    expect(regimeForJobType('VET')).toBe('PRACTITIONER');
    expect(regimeForJobType('ASV')).toBe('SUPPORT_STAFF');
    expect(regimeForJobType('APPRENTICE')).toBe('SUPPORT_STAFF');
    expect(regimeForJobType(null)).toBe('SUPPORT_STAFF');
  });
});

describe('daily work + amplitude', () => {
  it('nets out break minutes', () => {
    expect(dayWorkedMinutes([shift('2026-08-03', '08:00', '19:00', 60)])).toBe(
      600,
    ); // 11h - 1h = 10h
  });
  it('flags > 12h net worked on a day (KON-139 conventional cap)', () => {
    const v = findStatutoryViolations(
      [shift('2026-08-03', '07:00', '20:00', 0)], // 13h net
      S,
    );
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'DAILY_WORK', date: '2026-08-03' }),
    );
  });
  it('does not flag exactly 12h net worked (a lawful 12h guard shift)', () => {
    const v = findStatutoryViolations(
      [shift('2026-08-03', '07:00', '19:00', 0)], // 12h
      S,
    );
    expect(v.filter((x) => x.kind === 'DAILY_WORK')).toHaveLength(0);
  });
  it('amplitude spans earliest start to latest end across split shifts', () => {
    const day = [
      shift('2026-08-03', '08:00', '12:00', 0),
      shift('2026-08-03', '18:00', '22:00', 0),
    ];
    expect(dayAmplitudeMinutes(day)).toBe(14 * 60); // 08:00 -> 22:00
    const v = findStatutoryViolations(day, S);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'DAILY_AMPLITUDE' }),
    );
  });
});

describe('KON-139 — continuous-day amplitude by regime', () => {
  // Single busy block 07:00-20:00 (13h span) with a 90-min break: net 11.5h <= 12h.
  const continuousDay = [shift('2026-08-03', '07:00', '20:00', 90)];

  it('caps a continuous day at 12h amplitude for SUPPORT_STAFF (CCN art. 18)', () => {
    const v = findStatutoryViolations(continuousDay, S);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'DAILY_AMPLITUDE', limit: 720 }),
    );
  });
  it('allows the same continuous day for PRACTITIONER (15h cap, annexe VII art. 20)', () => {
    const v = findStatutoryViolations(continuousDay, P);
    expect(v.filter((x) => x.kind === 'DAILY_AMPLITUDE')).toHaveLength(0);
  });
  it('keeps the 13h cap for a discontinuous day (both regimes)', () => {
    const discontinuous = [
      shift('2026-08-03', '08:00', '12:00', 0),
      shift('2026-08-03', '17:00', '21:00', 0), // amplitude 13h exactly
    ];
    for (const opts of [S, P]) {
      expect(
        findStatutoryViolations(discontinuous, opts).filter(
          (x) => x.kind === 'DAILY_AMPLITUDE',
        ),
      ).toHaveLength(0);
    }
  });
});

describe('KON-139 — vacation structure (max 2 blocks, 2h/3h minima)', () => {
  it('flags a third disjoint work block in one day', () => {
    const v = findStatutoryViolations(
      [
        shift('2026-08-03', '08:00', '10:00', 0),
        shift('2026-08-03', '12:00', '14:00', 0),
        shift('2026-08-03', '16:00', '19:00', 0),
      ],
      S,
    );
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'VACATIONS_COUNT', actual: 3, limit: 2 }),
    );
  });
  it('flags a short vacation under 2h when the day is split in two', () => {
    const v = findStatutoryViolations(
      [
        shift('2026-08-03', '09:00', '10:30', 0), // 1h30 < 2h
        shift('2026-08-03', '12:00', '16:00', 0), // 4h
      ],
      S,
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'VACATION_MIN_DURATION',
        actual: 90,
        limit: 120,
      }),
    );
  });
  it('flags a long vacation under 3h (2h + 2h30 split)', () => {
    const v = findStatutoryViolations(
      [
        shift('2026-08-03', '09:00', '11:00', 0), // 2h ok as the short one
        shift('2026-08-03', '13:00', '15:30', 0), // 2h30 < 3h as the long one
      ],
      S,
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'VACATION_MIN_DURATION',
        actual: 150,
        limit: 180,
      }),
    );
  });
  it('accepts a lawful 2h + 3h split day with ZERO violations of any kind (KON-140)', () => {
    // Pre-KON-140 this fixture emitted DAILY_REST on the 3h intra-day gap and the test
    // only passed by filtering kinds — the verification audit called out the masking.
    const v = findStatutoryViolations(
      [
        shift('2026-08-03', '09:00', '11:00', 0),
        shift('2026-08-03', '14:00', '17:00', 0),
      ],
      S,
    );
    expect(v).toHaveLength(0);
  });
  it('wouldExceedStatutory blocks the candidate creating a 3rd block', () => {
    const windowShifts = [
      shift('2026-08-03', '08:00', '10:00', 0),
      shift('2026-08-03', '12:00', '15:00', 0),
    ];
    expect(
      wouldExceedStatutory(
        windowShifts,
        shift('2026-08-03', '17:00', '19:00', 0),
        S,
      ),
    ).toContain('VACATIONS_COUNT');
  });
});

describe('KON-139 — rest-days rule (4 per 14-day window w/ >=10h continuous day)', () => {
  // Fortnight Mon 2026-08-03 .. Sun 2026-08-16; explicit window = exactly that span, so a
  // single 14-day window is fully covered (deterministic). The trigger day is Mon 08-03:
  // one continuous block 07:30-18:00 with 30-min break = 10h net. Other worked days are
  // 09:00-15:20 with a 20-min break (6h net — no mandatory-break noise).
  const fortnight = (restDays: string[]): StatutoryShift[] => {
    const rest = new Set(restDays);
    const out: StatutoryShift[] = [];
    for (let d = 3; d <= 16; d++) {
      const date = `2026-08-${String(d).padStart(2, '0')}`;
      if (rest.has(date)) continue;
      out.push(
        date === '2026-08-03'
          ? shift(date, '07:30', '18:00', 30)
          : shift(date, '09:00', '15:20', 20),
      );
    }
    return out;
  };
  const window = { start: '2026-08-03', end: '2026-08-16' };

  it('flags a window with only 3 rest days', () => {
    const v = findStatutoryViolations(
      fortnight(['2026-08-05', '2026-08-06', '2026-08-12']),
      { ...S, window },
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'REST_DAYS_WINDOW',
        date: '2026-08-03',
        actual: 3,
        limit: 4,
      }),
    );
  });
  it('SUPPORT_STAFF: flags 4 rest days whose consecutive pair holds no Sunday (HARD)', () => {
    // Rest: Wed 05 + Thu 06 (pair, no Sunday), Wed 12, Fri 14.
    const v = findStatutoryViolations(
      fortnight(['2026-08-05', '2026-08-06', '2026-08-12', '2026-08-14']),
      { ...S, window },
    );
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'REST_DAYS_WINDOW' }),
    );
  });
  it('PRACTITIONER: same pattern is a SOFT Sunday preference, not a block', () => {
    const v = findStatutoryViolations(
      fortnight(['2026-08-05', '2026-08-06', '2026-08-12', '2026-08-14']),
      { ...P, window },
    );
    expect(v.filter((x) => x.kind === 'REST_DAYS_WINDOW')).toHaveLength(0);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'REST_DAYS_SUNDAY', soft: true }),
    );
  });
  it('accepts 4 rest days with a Sat+Sun consecutive pair (both regimes)', () => {
    const restDays = [
      '2026-08-08',
      '2026-08-09', // Sat + Sun pair
      '2026-08-12',
      '2026-08-14',
    ];
    for (const opts of [S, P]) {
      const v = findStatutoryViolations(fortnight(restDays), {
        ...opts,
        window,
      });
      expect(
        v.filter(
          (x) => x.kind === 'REST_DAYS_WINDOW' || x.kind === 'REST_DAYS_SUNDAY',
        ),
      ).toHaveLength(0);
    }
  });
  it('emits nothing when no day reaches the 10h continuous trigger', () => {
    const noTrigger = fortnight(['2026-08-05', '2026-08-06', '2026-08-12']).map(
      (s) =>
        s.date === '2026-08-03' ? shift(s.date, '09:00', '15:20', 20) : s,
    );
    const v = findStatutoryViolations(noTrigger, { ...S, window });
    expect(
      v.filter(
        (x) => x.kind === 'REST_DAYS_WINDOW' || x.kind === 'REST_DAYS_SUNDAY',
      ),
    ).toHaveLength(0);
  });
});

describe('KON-139 — 44h average over 12 consecutive ISO weeks', () => {
  // Candidate week: Mon 2026-08-03. The 11 prior ISO Mondays:
  const priorMondays = [
    '2026-07-27',
    '2026-07-20',
    '2026-07-13',
    '2026-07-06',
    '2026-06-29',
    '2026-06-22',
    '2026-06-15',
    '2026-06-08',
    '2026-06-01',
    '2026-05-25',
    '2026-05-18',
  ];
  // 5 worked days 08:00-17:00 (60 break) = 8h net each = 2400 net minutes in-week.
  const inWeek = ['03', '04', '05', '06', '07'].map((d) =>
    shift(`2026-08-${d}`, '08:00', '17:00', 60),
  );

  it('findStatutoryViolations flags a 12-week total over 31 680 net minutes', () => {
    const weeklyHistory = new Map(priorMondays.map((m) => [m, 2700])); // 45h x 11
    const v = findStatutoryViolations(inWeek, { ...S, weeklyHistory });
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'TWELVE_WEEK_AVG',
        date: '2026-08-03',
        actual: 11 * 2700 + 2400,
        limit: 31_680,
      }),
    );
  });
  it('does not flag a 12-week total at exactly the 44h average', () => {
    const weeklyHistory = new Map(priorMondays.map((m) => [m, 2640])); // 44h x 11
    // in-week 2400 => total 31 440 <= 31 680
    const v = findStatutoryViolations(inWeek, { ...S, weeklyHistory });
    expect(v.filter((x) => x.kind === 'TWELVE_WEEK_AVG')).toHaveLength(0);
  });
  it('wouldExceedStatutory blocks the candidate that tips the rolling average', () => {
    const totalsByMonday = new Map<string, number>([
      ...priorMondays.map((m) => [m, 2640] as const),
      ['2026-08-03', 2400],
    ]);
    const opts = {
      ...S,
      twelveWeek: {
        totals: (m: string) => totalsByMonday.get(m) ?? 0,
        lastWeekMonday: '2026-08-03',
      },
    };
    // before = 11*2640 + 2400 = 31 440; candidate 6h net -> 31 800 > 31 680
    expect(
      wouldExceedStatutory([], shift('2026-08-08', '09:00', '15:00', 0), opts),
    ).toContain('TWELVE_WEEK_AVG');
    // a 4h candidate lands exactly at 31 680 — not a breach
    expect(
      wouldExceedStatutory([], shift('2026-08-08', '09:00', '13:00', 0), opts),
    ).not.toContain('TWELVE_WEEK_AVG');
  });
});

describe('KON-140 (V3) — removalWouldExceedStatutory (non-monotone structure rules)', () => {
  it('flags VACATIONS_COUNT when removing the middle of merged work splits into 3 blocks', () => {
    const windowShifts = [
      shift('2026-08-03', '08:00', '10:00', 0),
      shift('2026-08-03', '10:00', '12:00', 0), // middle of the merged morning block
      shift('2026-08-03', '12:00', '14:00', 0),
      shift('2026-08-03', '16:00', '19:00', 0), // separate afternoon block
    ];
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-08-03', '10:00', '12:00', 0),
        S,
      ),
    ).toContain('VACATIONS_COUNT');
  });

  it('flags VACATION_MIN_DURATION when the split leaves a fragment under 2h', () => {
    const windowShifts = [
      shift('2026-08-03', '08:00', '09:30', 0),
      shift('2026-08-03', '09:30', '13:00', 0), // merged with the fragment
      shift('2026-08-03', '15:00', '19:00', 0),
    ];
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-08-03', '09:30', '13:00', 0),
        S,
      ),
    ).toContain('VACATION_MIN_DURATION');
  });

  it('flags practitioner DAILY_AMPLITUDE on continuous->discontinuous shape change; corps pre-breached stays silent', () => {
    const windowShifts = [
      shift('2026-08-03', '06:00', '10:00', 30),
      shift('2026-08-03', '10:00', '14:00', 60),
      shift('2026-08-03', '14:00', '20:00', 60), // one merged 14h-span block, 12h net
    ];
    const removed = shift('2026-08-03', '10:00', '14:00', 60);
    // Practitioner: continuous 14h <= 15h cap before; discontinuous 14h > 13h after.
    expect(removalWouldExceedStatutory(windowShifts, removed, P)).toContain(
      'DAILY_AMPLITUDE',
    );
    // Corps: already breached before (14h > 12h continuous cap) -> introduced-by = none.
    expect(removalWouldExceedStatutory(windowShifts, removed, S)).not.toContain(
      'DAILY_AMPLITUDE',
    );
  });

  it('flags REST_DAYS_WINDOW when the removal CREATES a >=10h continuous trigger day', () => {
    // Mon 2026-08-03: 10h-net continuous block + a detached evening block (2 blocks ->
    // not a trigger). Working 11 of the surrounding 14 days leaves only 3 rest days.
    const windowShifts: ReturnType<typeof shift>[] = [
      shift('2026-08-03', '07:30', '18:00', 30),
      shift('2026-08-03', '20:00', '21:00', 0),
    ];
    for (let d = 4; d <= 16; d++) {
      const date = `2026-08-${String(d).padStart(2, '0')}`;
      if (['2026-08-05', '2026-08-06', '2026-08-12'].includes(date)) continue;
      windowShifts.push(shift(date, '09:00', '15:20', 20));
    }
    const removed = shift('2026-08-03', '20:00', '21:00', 0);
    expect(removalWouldExceedStatutory(windowShifts, removed, S)).toContain(
      'REST_DAYS_WINDOW',
    );
  });

  it('flags DAILY_REST when removing a cross-midnight bridge splits a merged block (KON-140 R-A, executed counterexample)', () => {
    // P: D 15:00-18:00 · R: D 21:30->00:30 (overnight bridge) · S: D+1 00:30-08:00.
    // R and S merge into one block STARTING D, so the only gap (18:00->21:30) is
    // intra-day exempt and the state is clean. Removing R leaves [P] and [S] with a
    // 6.5h gap whose blocks start D and D+1 -> hard inter-day DAILY_REST.
    const windowShifts = [
      shift('2026-03-02', '15:00', '18:00', 0),
      shift('2026-03-02', '21:30', '00:30', 0),
      shift('2026-03-03', '00:30', '08:00', 30),
    ];
    expect(findStatutoryViolations(windowShifts, S)).toEqual([]);
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-03-02', '21:30', '00:30', 0),
        S,
      ),
    ).toContain('DAILY_REST');
  });

  it('flags DAILY_REST when removing the sub-midnight segment shifts the successor start date (KON-140 R-A)', () => {
    // 13:00-15:00 + [21:00-00:00 + 00:00-04:00 merged, starts D]: the 6h gap is
    // intra-day exempt. Removing 21:00-00:00 leaves a block starting D+1 -> the 9h gap
    // becomes inter-day and deficient.
    const windowShifts = [
      shift('2026-03-02', '13:00', '15:00', 0),
      shift('2026-03-02', '21:00', '00:00', 0),
      shift('2026-03-03', '00:00', '04:00', 0),
    ];
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-03-02', '21:00', '00:00', 0),
        S,
      ),
    ).toContain('DAILY_REST');
  });

  it("flags MANDATORY_BREAK when removing the shift that carried the day's only break (KON-140 R-C)", () => {
    const windowShifts = [
      shift('2026-03-02', '08:00', '15:00', 0), // 7h net, no break
      shift('2026-03-02', '15:00', '16:00', 30), // carries the break, merged day
    ];
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-03-02', '15:00', '16:00', 30),
        S,
      ),
    ).toContain('MANDATORY_BREAK');
  });

  it('returns [] for a harmless end-of-block removal', () => {
    const windowShifts = [
      shift('2026-08-03', '08:00', '12:00', 0),
      shift('2026-08-03', '12:00', '16:00', 0),
    ];
    expect(
      removalWouldExceedStatutory(
        windowShifts,
        shift('2026-08-03', '12:00', '16:00', 0),
        S,
      ),
    ).toEqual([]);
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
    const v = findStatutoryViolations(week, S);
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'CONSECUTIVE_DAYS', date: '2026-08-09' }),
    );
  });
  it('does not flag 6 consecutive worked days', () => {
    const week = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '15:00', 0),
    );
    expect(
      findStatutoryViolations(week, S).filter(
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
    const v = findStatutoryViolations(week, S); // Sat 20:00 -> Sun 24:00 = 28h only
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
      findStatutoryViolations([...week, ...next], S).filter(
        (x) => x.kind === 'WEEKLY_REST',
      ),
    ).toHaveLength(0);
  });
});

describe('wouldExceedStatutory (incremental)', () => {
  it('blocks a candidate that tips the day over 12h net', () => {
    const windowShifts = [shift('2026-08-03', '08:00', '14:00', 0)]; // 6h
    const candidate = shift('2026-08-03', '14:00', '21:00', 0); // +7h = 13h
    expect(wouldExceedStatutory(windowShifts, candidate, S)).toContain(
      'DAILY_WORK',
    );
  });
  it('blocks the 7th consecutive day', () => {
    const windowShifts = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '15:00', 0),
    );
    expect(
      wouldExceedStatutory(
        windowShifts,
        shift('2026-08-09', '09:00', '15:00', 0),
        S,
      ),
    ).toContain('CONSECUTIVE_DAYS');
  });
  it('returns [] when the candidate cannot make things worse (window already over)', () => {
    const windowShifts = [shift('2026-08-03', '07:00', '20:30', 0)]; // already 13.5h
    const candidate = shift('2026-08-05', '09:00', '15:00', 0); // unrelated day
    expect(wouldExceedStatutory(windowShifts, candidate, S)).toEqual([]);
  });
});

// KON-141 — counterexamples EXECUTED against the engine by the invariant harness, which
// served plans breaching L.3132-2. The guard used to judge only isoWeekStart(candidate.date);
// an insertion splits one rest gap and that gap can overlap several ISO weeks, so a candidate
// can drop a NEIGHBOURING week under 35h while its own stays fine.
describe('KON-141 — weekly rest across the weeks an insertion actually touches', () => {
  // Week Mon 2026-03-02 .. Sun 2026-03-08: CARE Mon-Thu, an overnight Fri, CARE Sun.
  // Longest rest inside it is Sat 05:00 -> Sun 14:00 = 33h, but while nothing was booked
  // after Sunday the open trailing gap carried the week. The Monday-night candidate below
  // closes that gap at 27h and is the one that drops the PREVIOUS week to 33h.
  const weekOfMar02 = [
    // Sunday of the PREVIOUS week — without it the head sentinel credits the untouched
    // pre-window emptiness as rest and the week is legitimately fine.
    shift('2026-03-01', '14:00', '18:00'),
    shift('2026-03-02', '14:00', '18:00'),
    shift('2026-03-03', '14:00', '18:00'),
    shift('2026-03-04', '14:00', '18:00'),
    shift('2026-03-05', '14:00', '18:00'),
    shift('2026-03-06', '21:00', '05:00', 20), // overnight -> Sat 05:00
    shift('2026-03-08', '14:00', '18:00'),
  ];

  it('blocks a Monday-night candidate that drops the PREVIOUS week under 35h', () => {
    const candidate = shift('2026-03-09', '21:00', '05:00', 20);
    expect(wouldExceedStatutory(weekOfMar02, candidate, S)).toContain(
      'WEEKLY_REST',
    );
  });

  it('the served plan the guard used to allow really is a breach (oracle agrees)', () => {
    const served = [...weekOfMar02, shift('2026-03-09', '21:00', '05:00', 20)];
    expect(
      findStatutoryViolations(served, {
        ...S,
        window: { start: '2026-02-16', end: '2026-03-29' },
      }),
    ).toContainEqual(
      expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-03-02' }),
    );
  });

  it('does NOT block when the split gap leaves every touched week >=35h', () => {
    // Same week, but the candidate lands the following Wednesday: the gap it splits still
    // leaves Sun 18:00 -> Wed 21:00 = 75h overlapping the week of 03-02.
    const candidate = shift('2026-03-11', '21:00', '05:00', 20);
    expect(wouldExceedStatutory(weekOfMar02, candidate, S)).not.toContain(
      'WEEKLY_REST',
    );
  });

  it('still blocks a candidate that breaches its OWN week (no regression)', () => {
    // Bounded on BOTH sides so no sentinel carries the week: 03-01..03-07 and 03-09 are
    // booked, leaving Sat 20:00 -> Mon 09:00 = 37h as the week's only qualifying rest.
    const dense = ['01', '02', '03', '04', '05', '06', '07', '09'].map((d) =>
      shift(`2026-03-${d}`, '09:00', '20:00'),
    );
    // Filling Sunday 03-08 cuts that 37h into 13h + 13h — the breach is in its OWN week.
    expect(
      wouldExceedStatutory(dense, shift('2026-03-08', '09:00', '20:00'), S),
    ).toContain('WEEKLY_REST');
  });

  it('skips a week the data window cannot decide instead of inventing a verdict', () => {
    // Candidate at the very start of the loaded window: the week before it is only half
    // covered, so its rest may continue into hours never loaded. Not judged here — it is
    // judged by the candidates that do cover it.
    const candidate = shift('2026-03-02', '14:00', '18:00');
    const weeks = wouldExceedStatutory([], candidate, S);
    expect(weeks).toEqual([]);
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
      ...S,
      window: { start: '2026-08-05', end: '2026-08-09' },
    });
    expect(v).toContainEqual(
      expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-08-03' }),
    );
  });

  it('DOES credit a genuine >=8-day rest proven inside a wide window (no false positive)', () => {
    // Same dense Wed–Sun work, but the window spans 8 real days on each side and no shift
    // exists before Wed — the proven long rest before the first shift is credited.
    const v = findStatutoryViolations(denseWedToSun, {
      ...S,
      window: { start: '2026-07-28', end: '2026-08-16' },
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
      ...S,
      window: { start: '2025-12-15', end: '2026-01-18' },
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
      wouldExceedStatutory(
        priorRun,
        shift('2026-01-02', '09:00', '15:00', 0),
        S,
      ),
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
      const kinds = findStatutoryViolations(shifts, S).map((v) => v.kind);
      expect(kinds).toContain('DAILY_REST');
    });

    it('does NOT flag an intra-day split — daily rest is BETWEEN working days (KON-140)', () => {
      // KON-140 reverses the 13-4 "stricter reading": a 2h lunch gap between two
      // same-day vacations is CCN structure (vacations + amplitude), not daily rest.
      const shifts = [
        day('2026-03-02', '09:00', '12:00'),
        day('2026-03-02', '14:00', '18:00'), // 2h gap, both blocks start 03-02
      ];
      expect(
        findStatutoryViolations(shifts, S).some((v) => v.kind === 'DAILY_REST'),
      ).toBe(false);
    });

    it('still flags a short gap after an overnight block (different start dates)', () => {
      const shifts = [
        day('2026-03-02', '22:00', '06:00'), // starts 03-02, ends 03-03 06:00
        day('2026-03-03', '10:00', '14:00'), // starts 03-03 -> inter-day gap of 4h
      ];
      expect(
        findStatutoryViolations(shifts, S).some((v) => v.kind === 'DAILY_REST'),
      ).toBe(true);
    });

    it('does not flag a gap of exactly 11h', () => {
      const shifts = [
        day('2026-03-02', '10:00', '19:00'), // ends 19:00
        day('2026-03-03', '06:00', '10:00'), // starts +11h
      ];
      expect(
        findStatutoryViolations(shifts, S).some((v) => v.kind === 'DAILY_REST'),
      ).toBe(false);
    });

    it('wouldExceedStatutory returns DAILY_REST only when the candidate introduces it', () => {
      const windowShifts = [day('2026-03-02', '14:00', '22:00')];
      const candidate = day('2026-03-03', '06:00', '14:00');
      expect(wouldExceedStatutory(windowShifts, candidate, S)).toContain(
        'DAILY_REST',
      );
      // A candidate 12h later introduces nothing.
      expect(
        wouldExceedStatutory(
          windowShifts,
          day('2026-03-03', '10:00', '18:00'),
          S,
        ),
      ).not.toContain('DAILY_REST');
    });

    it('flags a candidate-introduced deficit even when the window already holds unrelated blocks (aped-review F1)', () => {
      // The Mar-01 intra-day split is exempt post-KON-140; the point of F1 stands via the
      // count-based check: the candidate's fresh INTER-day deficit (Mar-04 23:00 -> Mar-05
      // 06:00 = 7h) must be flagged regardless of the rest of the window's shape.
      const windowShifts = [
        day('2026-03-01', '09:00', '12:00'),
        day('2026-03-01', '14:00', '18:00'), // intra-day split (exempt, KON-140)
        day('2026-03-04', '20:00', '23:00'),
      ];
      const candidate = day('2026-03-05', '06:00', '14:00'); // 23:00 -> 06:00 = 7h < 11h
      expect(wouldExceedStatutory(windowShifts, candidate, S)).toContain(
        'DAILY_REST',
      );
    });
  });

  describe('WEEKLY_CEILING (48h net, L.3121-20)', () => {
    const fifty = () =>
      // Mon–Sat 2026-03-02..07, 10h gross - 1h break = 9h net = 54h/week
      ['02', '03', '04', '05', '06', '07'].map((d) =>
        day(`2026-03-${d}`, '08:00', '18:00', 60),
      );

    it('findStatutoryViolations flags an ISO week over 48h net', () => {
      const v = findStatutoryViolations(fifty(), S).find(
        (x) => x.kind === 'WEEKLY_CEILING',
      );
      expect(v).toBeDefined();
      expect(v!.date).toBe('2026-03-02'); // ISO-week Monday
      expect(v!.actual).toBe(6 * 9 * 60); // 3240 net minutes
    });

    it('wouldExceedStatutory flags the candidate that crosses 48h net', () => {
      const windowShifts = ['02', '03', '04', '05', '06'].map((d) =>
        day(`2026-03-${d}`, '08:00', '18:00', 60),
      ); // 5 * 9h = 45h
      expect(
        wouldExceedStatutory(
          windowShifts,
          day('2026-03-07', '08:00', '18:00', 60),
          S,
        ),
      ).toContain('WEEKLY_CEILING'); // 54h
    });
  });

  describe('MANDATORY_BREAK (20min over 6h, L.3121-16)', () => {
    it('flags a > 6h net day with under 20min break', () => {
      const shifts = [day('2026-03-02', '08:00', '15:00', 0)]; // 7h net, 0 break
      const v = findStatutoryViolations(shifts, S).find(
        (x) => x.kind === 'MANDATORY_BREAK',
      );
      expect(v).toBeDefined();
      expect(v!.actual).toBe(0);
      expect(v!.limit).toBe(20);
    });

    it('does not flag a > 6h day with a 20min break', () => {
      const shifts = [day('2026-03-02', '08:00', '15:20', 20)]; // ~7h net, 20 break
      expect(
        findStatutoryViolations(shifts, S).some(
          (v) => v.kind === 'MANDATORY_BREAK',
        ),
      ).toBe(false);
    });

    it('does not flag a <= 6h day', () => {
      const shifts = [day('2026-03-02', '08:00', '14:00', 0)]; // 6h net exactly
      expect(
        findStatutoryViolations(shifts, S).some(
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
          S,
        ),
      ).toEqual(expect.arrayContaining(['MANDATORY_BREAK'])); // day now 7h30 net, 0 break
    });
  });
});
