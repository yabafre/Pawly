type ShiftTypeDraft = {
  name?: string;
  code?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
};

// L.3121-16 (Story 13-4) — a shift with > 6h NET worked requires at least a 20-min break.
// These MUST stay in lock-step with the server predicate `shiftBreakRuleOk`
// (packages/validators/src/clinic/onboarding.schema.ts), which is the enforcing source of truth.
// The arithmetic is inlined here rather than imported because the web app resolves
// @pawly/validators to the built package (no new runtime export is visible before merge); the
// server still rejects regardless of this client mirror (aped-review F4/F7).
const MANDATORY_BREAK_MINUTES = 20;
const BREAK_REQUIRED_AFTER_NET_MINUTES = 360;

/** True when a shift type satisfies the >6h/20-min break rule (mirrors server `shiftBreakRuleOk`). */
function shiftBreakRuleOk(st: ShiftTypeDraft): boolean {
  const [sh, sm] = String(st.startTime).split(':').map(Number);
  const [eh, em] = String(st.endTime).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return true; // format is caught by the completeness check
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const gross = end >= start ? end - start : 1440 - start + end;
  const net = gross - (st.breakMinutes ?? 0);
  return (
    net <= BREAK_REQUIRED_AFTER_NET_MINUTES || (st.breakMinutes ?? 0) >= MANDATORY_BREAK_MINUTES
  );
}

/**
 * Pure onboarding shift-types validator. Mirrors the server zod chain: at least one type,
 * every type complete, and — L.3121-16 (Story 13-4) — no >6h-net type without a 20-min break.
 * Returns the i18n KEY to surface, or undefined when valid.
 */
export function validateOnboardingShiftTypes(
  value: ShiftTypeDraft[] | undefined,
  t: (key: string) => string
): string | undefined {
  if (!value || value.length === 0) return t('minRequired');

  const hasIncomplete = value.some(
    (st) =>
      !st.name?.trim() ||
      !st.code?.trim() ||
      !/^\d{2}:\d{2}$/.test(st.startTime ?? '') ||
      !/^\d{2}:\d{2}$/.test(st.endTime ?? '') ||
      st.endTime === st.startTime
  );
  if (hasIncomplete) return t('incompleteShiftType');

  if (value.some((st) => !shiftBreakRuleOk(st))) return t('breakRequiredOver6h');

  return undefined;
}
