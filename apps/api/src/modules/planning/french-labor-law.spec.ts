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
  it('exposes the four statutory limits', () => {
    expect(FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES).toBe(600);
    expect(FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES).toBe(780);
    expect(FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS).toBe(35);
    expect(FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS).toBe(6);
  });
  it('STATUTORY_RULE_CONFIG mirrors the constants in hours', () => {
    expect(STATUTORY_RULE_CONFIG).toEqual({
      maxDailyHours: 10,
      maxDailyAmplitudeHours: 13,
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
