# Quick Spec: Onboarding wizard — auto code & validation feedback

**Date:** 2026-06-18
**Author:** Alex
**Type:** fix
**Status:** done

## What

Two UX fixes on the "Configure your clinic" onboarding wizard:

1. **Hide the shift-type `Code` field.** The code is already derived from the name
   (`StepShiftTypes.tsx:86-90`); stop showing the editable field so vets don't have to
   think about it. Keep generating the code silently (uppercase, alphanumeric, max 10,
   non-empty, de-duplicated against the other shift types in the form).
2. **Give explicit feedback when a step is incomplete.** Today the Next/Complete button
   is silently `disabled` when validation fails, so clicking "Add shift type", leaving it
   blank, and pressing Next does nothing. Allow the click, show a toast + inline field
   errors ("Please complete the required fields"). Also add the missing
   `onboarding.steps.workHours.invalidFormat` i18n key (referenced in `StepWorkHours.tsx`
   but absent from `en.json`/`fr.json`).

## Why

The silent disabled button reads as a broken wizard (the user reported "I clicked Next and
nothing happened"), and the free-text Code field is noise for non-technical vet users.

## Acceptance Criteria

- [ ] The `Code` input is no longer rendered in the shift-type card; the name field spans
      the row. The shift type still submits with a non-empty, unique `code` derived from the name.
- [ ] Clicking Next/Complete on an incomplete step shows a toast error AND surfaces inline
      validation (no more inert button). Button is only disabled while submitting.
- [ ] A shift type added but left empty produces a visible error message.
- [ ] `onboarding.steps.workHours.invalidFormat` exists in both `en.json` and `fr.json`.
- [ ] No regression: payload sent to `completeOnboardingAction` still passes
      `completeOnboardingSchema` (shiftTypes each have name + code + valid times + color).

## Files to Change

- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx` —
  remove the `Code` Field; keep code derivation on name change with collision-safe suffix;
  add an "incomplete shift type" message to the `shiftTypes` field validator.
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` —
  remove `disabled={!canProceed}` from Next/Complete; on invalid `handleNext`/`handleComplete`,
  trigger field validation + `toast.error(...)`.
- `apps/web/src/i18n/langs/en.json` — add `errors.incompleteStep`,
  `steps.shiftTypes.incompleteShiftType`, `steps.workHours.invalidFormat`; drop now-unused
  `code`/`codePlaceholder` keys only if no longer referenced.
- `apps/web/src/i18n/langs/fr.json` — mirror the EN keys.

## Test Plan

- `pnpm test` green (no regression in existing suites).
- Visual verification via `mcp__react-grab-mcp__get_element_context` at GREEN (per CLAUDE.md):
  shift-type card shows no Code field; Next on an empty shift type shows the toast + inline error.

## Result

**Status:** done — branch `fix/onboarding-wizard-feedback`.

**Files changed (4):**
- `apps/web/.../steps/StepShiftTypes.tsx` — removed the `Code` Field; the name input now
  derives the code silently (uppercase/alphanumeric, max 10) with a collision-safe numeric
  suffix against the other shift types; added an "incomplete shift type" branch to the
  `shiftTypes` validator (name/code/times/end>start).
- `apps/web/.../OnboardingWizard.tsx` — Next/Complete no longer silently disabled
  (`canProceed` removed); on an invalid step they run `form.validateAllFields("change")` and
  `toast.error(errors.incompleteStep)`. Complete stays disabled only while submitting.
- `apps/web/src/i18n/langs/en.json` / `fr.json` — added `workHours.invalidFormat`,
  `shiftTypes.incompleteShiftType`, `errors.incompleteStep`; reworded `shiftTypes.help`
  (no longer mentions the code); removed now-unused `shiftTypes.code`/`codePlaceholder`.

**Verification:**
- `i18n:check` PASSED — 1477 keys identical EN/FR.
- `eslint` (onboarding) — 0 errors (2 pre-existing unused-var warnings, untouched).
- `tsc --noEmit` — no error on the changed files (1 pre-existing `AppRouter`/trpc-types error,
  unrelated — see tag v0.11.4).
- `vitest run` — no regression: 720 passed, the same 2 files fail on `develop`
  (`landing-page.spec`, `employee-form.spec`) — confirmed pre-existing via `git stash`.
- Visual check via react-grab: NOT run — MCP not connected this session; the wizard also
  needs an authenticated, not-yet-onboarded clinic. Recommend a manual pass on `pnpm dev`.

**AC mapping:**
- Code field hidden / derived → `StepShiftTypes.tsx` name `onChange` (derives `code`, no Code Field).
- Explicit feedback on incomplete step → `OnboardingWizard.tsx` `handleNext`/`handleComplete`.
- Empty shift type shows error → `shiftTypes` validator `incompleteShiftType`.
- `workHours.invalidFormat` present → both langs.
- No payload regression → `code` still set & unique; `completeOnboardingSchema` unchanged.
