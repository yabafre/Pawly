# Quick Spec: Move Billing into Settings tabs

**Date:** 2026-06-18
**Author:** Alex
**Type:** refactor
**Status:** done

## What

Remove "Billing" (Facturation) from the top-level admin nav and surface it as a tab inside
the existing Settings hub (`/admin/settings`), next to Account / Clinic / Hours / Shift types.
The standalone `/admin/billing` route stays (the subscription guard redirects there).

## Why

Billing is a low-frequency, admin-only screen — a top-level nav slot is too much weight.
Account-level settings is where users expect it.

## Acceptance Criteria

- [ ] The admin top nav no longer shows a "Billing" item (Dashboard / Team / Planning / Settings).
- [ ] Settings shows a new "Billing" tab rendering the existing `BillingOverview` (same content
      as `/admin/billing`).
- [ ] `/admin/billing` still works directly — the subscription guard's redirect
      (`layout.tsx:102`) and the post-checkout flow are unaffected.
- [ ] `settings.tabs.billing` exists in `en.json` (Billing) and `fr.json` (Facturation).
- [ ] No unused-import lint error (drop `CreditCard` from AdminLayoutClient if it becomes unused;
      use it for the new tab in SettingsTabs).

## Files to Change

- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — remove the `billing`
  entry from `navGroups`; drop the now-unused `CreditCard` import.
- `apps/web/src/app/[locale]/admin/settings/_components/SettingsTabs.tsx` — add a `billing`
  tab (`TabsTrigger` + `TabsContent`) rendering `<BillingOverview locale={locale} />`
  (`useLocale()` from next-intl); import `BillingOverview` + `CreditCard`.
- `apps/web/src/i18n/langs/en.json` — add `settings.tabs.billing`.
- `apps/web/src/i18n/langs/fr.json` — add `settings.tabs.billing`.

## Test Plan

- `pnpm --filter @pawly/web run i18n:check` (EN/FR parity).
- `eslint` on the two changed components (no unused imports).
- `tsc --noEmit` (BillingOverview `locale` prop wired).
- `vitest run` — no regression (settings panel specs untouched).
- Manual: Settings → Billing tab renders the overview; top nav has no Billing; visiting
  `/admin/billing` directly still renders.

## Result

**Status:** done — branch `fix/billing-under-settings`.

**Files changed (4):**
- `AdminLayoutClient.tsx` — removed the `billing` `navGroups` entry + the now-unused
  `CreditCard` import (−6 lines).
- `SettingsTabs.tsx` — new `billing` tab (`TabsTrigger` + `TabsContent`) rendering
  `<BillingOverview locale={locale} />`; added `useLocale`, `CreditCard`, `BillingOverview` imports.
- `en.json` / `fr.json` — `settings.tabs.billing` = "Billing" / "Facturation".

**Verification:**
- `i18n:check` PASSED — 1477 keys identical EN/FR.
- `tsc --noEmit` — no error on changed files (`BillingOverview` `locale` prop wired; pre-existing
  `AppRouter`/trpc-types error unrelated).
- `vitest run` — no regression: 720 passed, same 2 pre-existing failures on `develop`.
- `eslint` — `SettingsTabs` clean. `AdminLayoutClient` reports 4 `react-hooks/refs` errors on the
  `prevSettingsPathRef` block (lines I did NOT touch) — confirmed identical on `develop` via stash,
  so PRE-EXISTING and out of scope. Candidate for a separate fix (ref mutated during render).

**Note:** `/admin/billing` route kept intact — the subscription guard (`layout.tsx:102`) still
redirects there and the post-checkout flow is unaffected. Billing is now reachable via
Settings → Billing tab (normal access) and `/admin/billing` directly (guard/checkout).
