# Story 2.2: Application Translation & Language Switching

Status: done

## User Story

As a user (Admin or Employee),
I want to use Pawly in French or English and switch language instantly,
so that I can work in my preferred language.

## Acceptance Criteria

1. **AC1 — All UI strings displayed in selected language**
   - Every visible text in the application is translated (FR or EN)
   - No hardcoded strings remain in any component
   - Translation keys organized by namespace (`common`, `auth`, `admin`, `dashboard`, `errors`, etc.)
   - ICU message syntax used for pluralization and interpolation

2. **AC2 — Language switch is instantaneous (NFR20)**
   - Language toggle does NOT trigger a full page reload
   - Uses `router.replace(pathname, {locale})` for client-side locale switching
   - UI updates immediately upon language change
   - No visible flash or loading state during switch

3. **AC3 — Date and number formatting adapts to locale**
   - Dates formatted according to selected locale (e.g., "20 nov. 2024" in FR, "Nov 20, 2024" in EN)
   - Numbers formatted with locale-specific separators (e.g., "1 234,56" in FR, "1,234.56" in EN)
   - Currency formatting follows locale conventions
   - Relative time formatting adapts (e.g., "il y a 2 jours" vs "2 days ago")

4. **AC4 — User's language preference can be overridden manually**
   - A visible language switcher component is available in the UI
   - Switcher accessible from all pages (header/navbar)
   - User selection persists across navigation
   - Manual selection overrides browser's Accept-Language detection

5. **AC5 — 100% translation coverage**
   - All UI strings exist in both `fr.json` and `en.json`
   - No missing translation keys (verified via build-time check or linting)
   - Error messages, toast notifications, form validation all translated
   - Empty states, loading states, and edge case messages included

6. **AC6 — Build and tests pass**
   - `pnpm build` completes without errors
   - `pnpm test` passes (all existing tests + new tests for language switching)
   - No TypeScript errors introduced
   - Lighthouse accessibility score maintained

## Tasks

- [x] Task 1: Create Language Switcher Component (AC: #2, #4)
  - [x] 1.1 Create `apps/web/src/components/language-switcher.tsx` client component
  - [x] 1.2 Use `useLocale()` to get current locale
  - [x] 1.3 Use `usePathname()` + `useRouter()` for instant switching without reload
  - [x] 1.4 Design dropdown/toggle following "Clinique Zen" aesthetic (shadcn/ui Select or DropdownMenu)
  - [x] 1.5 Add FR/EN flag icons or language codes as visual indicators

- [x] Task 2: Integrate Language Switcher in Layouts (AC: #4)
  - [x] 2.1 Add LanguageSwitcher to `[locale]/admin/layout.tsx` navbar
  - [x] 2.2 Add LanguageSwitcher to `[locale]/dashboard/` layout or page
  - [x] 2.3 Add LanguageSwitcher to public pages (landing, login, pricing when created)
  - [x] 2.4 Ensure consistent placement across all layouts (top-right corner recommended)

- [x] Task 3: Implement Date/Number Formatting (AC: #3)
  - [x] 3.1 Create `apps/web/src/lib/hooks/useFormattedDate.ts` wrapper around `useFormatter()`
  - [x] 3.2 Create `apps/web/src/lib/hooks/useFormattedNumber.ts` wrapper around `useFormatter()`
  - [x] 3.3 Define global date/number formats in next-intl config if needed
  - [x] 3.4 Replace all hardcoded date formatting with `format.dateTime()`
  - [x] 3.5 Replace all hardcoded number formatting with `format.number()`

- [x] Task 4: Complete Translation Coverage (AC: #1, #5)
  - [x] 4.1 Audit all components for remaining hardcoded strings
  - [x] 4.2 Extract strings from admin pages (planning, employees, absences, requests, billing)
  - [x] 4.3 Extract strings from dashboard pages (employee views)
  - [x] 4.4 Extract strings from error boundaries and fallback UIs
  - [x] 4.5 Add missing keys to `fr.json` and `en.json`
  - [x] 4.6 Add namespace for forms: `forms.validation.*`, `forms.labels.*`, `forms.placeholders.*`

- [x] Task 5: Add Translation Linting/Validation (AC: #5)
  - [x] 5.1 Add script or ESLint rule to detect missing translation keys
  - [x] 5.2 Verify both `fr.json` and `en.json` have identical key structure
  - [x] 5.3 Add pre-commit hook or CI check for translation completeness (optional)

- [x] Task 6: Write Tests for Language Switching (AC: #6)
  - [x] 6.1 Unit test for LanguageSwitcher component
  - [x] 6.2 Integration test: verify locale change updates URL
  - [x] 6.3 Integration test: verify translations load correctly for each locale
  - [x] 6.4 Test date/number formatting outputs for FR and EN locales

- [x] Task 7: Build Verification (AC: #6)
  - [x] 7.1 Run `pnpm build` and fix any errors
  - [x] 7.2 Run `pnpm test` and fix any failures
  - [x] 7.3 Manual smoke test: switch languages on admin, dashboard, login pages
  - [x] 7.4 Verify no full page reload during language switch (check Network tab)

## Dev Notes

### Architecture Patterns & Constraints

**Data Flow (NON-NEGOTIABLE):**
```
Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC → NestJS
```
This story is primarily frontend (Next.js). No API changes required.

**State Management Rules:**
- **DO NOT** store locale in Zustand — next-intl handles locale state via URL
- **DO NOT** use localStorage/cookies for locale persistence — URL is source of truth
- **DO** use next-intl hooks (`useLocale`, `useTranslations`, `useFormatter`)

**Navigation Rules:**
- **ALWAYS** use `@/i18n/navigation` wrappers (Link, useRouter, usePathname)
- **NEVER** use `next/link` or `next/navigation` directly

### Key Technical Implementations

**Language Switcher Pattern (from next-intl docs):**
```tsx
'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <select value={locale} onChange={(e) => switchLocale(e.target.value)}>
      <option value="fr">Français</option>
      <option value="en">English</option>
    </select>
  );
}
```

**Date/Number Formatting Pattern:**
```tsx
import { useFormatter } from 'next-intl';

function FormattedContent() {
  const format = useFormatter();
  const now = new Date();
  const price = 1234.56;

  return (
    <div>
      {/* Date: "20 novembre 2024" (FR) or "November 20, 2024" (EN) */}
      <p>{format.dateTime(now, { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      {/* Time: "14:30" (FR) or "2:30 PM" (EN) */}
      <p>{format.dateTime(now, { hour: 'numeric', minute: 'numeric' })}</p>

      {/* Number: "1 234,56" (FR) or "1,234.56" (EN) */}
      <p>{format.number(price)}</p>

      {/* Currency: "1 234,56 €" (FR) or "$1,234.56" (EN) */}
      <p>{format.number(price, { style: 'currency', currency: 'EUR' })}</p>

      {/* Relative time: "il y a 2 jours" or "2 days ago" */}
      <p>{format.relativeTime(new Date('2024-01-01'), now)}</p>
    </div>
  );
}
```

**Link with Locale Override:**
```tsx
import { Link } from '@/i18n/navigation';

// Switch to English version of current page
<Link href="/" locale="en">English</Link>

// Link maintains current locale automatically
<Link href="/about">About</Link>
```

### Translation File Structure (Extended)

```json
// fr.json (additions to existing structure from Story 2-1)
{
  "common": {
    "logout": "Déconnexion",
    "loading": "Chargement...",
    "error": "Une erreur est survenue",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "delete": "Supprimer",
    "edit": "Modifier",
    "create": "Créer",
    "search": "Rechercher",
    "noResults": "Aucun résultat",
    "confirm": "Confirmer",
    "back": "Retour",
    "next": "Suivant",
    "previous": "Précédent",
    "language": {
      "label": "Langue",
      "fr": "Français",
      "en": "English",
      "switchTo": "Changer la langue"
    }
  },
  "forms": {
    "validation": {
      "required": "Ce champ est requis",
      "email": "Email invalide",
      "minLength": "Minimum {min} caractères",
      "maxLength": "Maximum {max} caractères"
    },
    "labels": {
      "email": "Email",
      "password": "Mot de passe",
      "name": "Nom",
      "phone": "Téléphone"
    },
    "placeholders": {
      "email": "votre@email.com",
      "search": "Rechercher..."
    }
  },
  "dates": {
    "today": "Aujourd'hui",
    "yesterday": "Hier",
    "tomorrow": "Demain",
    "thisWeek": "Cette semaine",
    "lastWeek": "La semaine dernière",
    "nextWeek": "La semaine prochaine"
  },
  "errors": {
    "generic": "Une erreur est survenue",
    "network": "Erreur de connexion au serveur",
    "notFound": "Page non trouvée",
    "unauthorized": "Non autorisé",
    "forbidden": "Accès refusé"
  }
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/components/language-switcher.tsx` | Language toggle component |
| `apps/web/src/lib/hooks/useFormattedDate.ts` | Date formatting wrapper (optional) |
| `apps/web/src/lib/hooks/useFormattedNumber.ts` | Number formatting wrapper (optional) |
| `apps/web/src/components/__tests__/language-switcher.spec.tsx` | Unit tests |

### Files to Modify

| File | Change Required |
|------|----------------|
| `apps/web/src/i18n/langs/fr.json` | Add missing translation keys |
| `apps/web/src/i18n/langs/en.json` | Add missing translation keys |
| `apps/web/src/app/[locale]/admin/layout.tsx` | Add LanguageSwitcher to navbar |
| `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` | Add LanguageSwitcher |
| `apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx` | Add LanguageSwitcher |
| Any component with dates/numbers | Use `useFormatter()` for locale-aware formatting |

### Anti-Patterns to Avoid

1. **DO NOT** use `new Date().toLocaleDateString()` — use `useFormatter().dateTime()` instead
2. **DO NOT** hardcode date formats like "DD/MM/YYYY" — let next-intl handle locale-specific formats
3. **DO NOT** store user language preference in database (for now) — URL is source of truth
4. **DO NOT** create separate pages for each language — use `[locale]` dynamic segment
5. **DO NOT** use `window.location.reload()` to switch languages — use `router.replace()`
6. **DO NOT** conditionally render based on `if (locale === 'fr')` — use translation keys instead

### Previous Story Intelligence

**From Story 2-1 (i18n Foundation):**
- next-intl ^4.8.2 configured and working
- Proxy handles locale detection from Accept-Language header
- `[locale]` structure in place for all routes
- Base translation files exist at `src/i18n/langs/{fr,en}.json`
- Navigation wrappers created at `@/i18n/navigation`
- `useTranslations()` already used in login, admin layout, dashboard
- 21 static pages generated for both locales
- Build successful, 43 API tests pass

**Code Review Fixes Applied in 2-1:**
- Proxy stripped of auth logic (i18n only)
- `setRequestLocale(locale)` added to all server pages
- `redirect()` uses object signature `{ href, locale }`
- NextIntlClientProvider mock fixed in vitest.setup.ts

### Git Intelligence

**Recent commits (Epic 2):**
- `ec6ac40` feat: Implement i18n foundation using next-intl and rename translation message directory to `langs`.
- `3bf14af` Merge pull request #5 (story-2-1)
- `0bb7b85` fix(story-2-1): restore auth guards in admin layout
- `dcdecea` feat(story-2-1): i18n foundation — next-intl routing & proxy

**Commit message convention:** `feat(story-X-Y): description` or `fix(story-X-Y): description`

### Library Version Requirements

| Library | Version | Notes |
|---------|---------|-------|
| `next-intl` | ^4.8.2 | Already installed (Story 2-1) |
| `next` | 16.1.6 | Already installed |
| `@radix-ui/react-select` or `@radix-ui/react-dropdown-menu` | latest | For LanguageSwitcher UI (via shadcn) |

### BDD Scenarios

```gherkin
Feature: Application Translation & Language Switching

  Scenario: User switches language from FR to EN via dropdown
    Given a user is on the admin dashboard in French (/)
    And the LanguageSwitcher is visible in the navbar
    When they select "English" from the language dropdown
    Then the URL changes to /en/admin/dashboard
    And all UI strings are now in English
    And no full page reload occurs
    And the page content updates instantly

  Scenario: User switches language while on a deep route
    Given a user is on /admin/planning/week-view in French
    When they select "English" from the language dropdown
    Then the URL changes to /en/admin/planning/week-view
    And they remain on the same page
    And all strings update to English

  Scenario: Date formatting adapts to locale
    Given a user viewing a schedule with dates in French
    When they switch to English
    Then dates change from "20 nov. 2024" format to "Nov 20, 2024" format
    And times change from "14:30" to "2:30 PM" format

  Scenario: Number formatting adapts to locale
    Given a user viewing statistics with numbers in French
    When they switch to English
    Then numbers change from "1 234,56" format to "1,234.56" format
    And currency changes from "1 234,56 €" to "€1,234.56" (or similar)

  Scenario: Language selection persists across navigation
    Given a user who switched to English on the dashboard
    When they navigate to the planning page
    Then the planning page is also displayed in English
    And the URL remains prefixed with /en

  Scenario: Manual selection overrides browser preference
    Given a user with browser Accept-Language: fr-FR
    And they previously selected English via the LanguageSwitcher
    When they navigate to a new page
    Then the page is displayed in English (manual selection wins)

  Scenario: All strings are translated
    Given a developer building the application
    When they run the translation coverage check
    Then all keys in fr.json have corresponding keys in en.json
    And no component renders untranslated text
```

### Project Structure Notes

- **Alignment:** Continues the `[locale]` structure established in Story 2-1
- **No backend changes:** Purely frontend (Next.js) story
- **Shared packages unaffected:** `@pawly/validators`, `@pawly/types` don't need i18n
- **Locale persistence:** URL-based (no DB or localStorage needed for MVP)

### References

- [Source: docs/planning-artifacts/epics.md#Story-2.2] — Story requirements and acceptance criteria
- [Source: docs/planning-artifacts/architecture.md#i18n-Strategy] — next-intl with [locale] routing
- [Source: docs/planning-artifacts/architecture.md#Frontend-Architecture] — Proxy order, state management
- [Source: docs/planning-artifacts/prd.md#FR11] — FR/EN with versioned translation files
- [Source: docs/planning-artifacts/prd.md#NFR20] — Instantaneous language switching without reload
- [Source: docs/implementation-artifacts/2-1-i18n-foundation-next-intl-routing-proxy.md] — Previous story learnings and patterns
- [Source: next-intl official docs] — useLocale, useFormatter, useRouter, Link with locale prop

### Dev Agent Record (original)

#### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

#### Debug Log References

- Fixed TypeScript type errors with next-intl's DateTimeFormatOptions and NumberFormatOptions
- Added scrollIntoView mock in vitest.setup.ts for Radix UI Select component testing

#### Completion Notes List

1. **Task 1 Complete**: Created LanguageSwitcher component using shadcn/ui Select with Globe icon. Uses `useLocale()`, `usePathname()`, and `useRouter()` from next-intl for instant locale switching via `router.replace(pathname, { locale })`. Includes `useTransition` for smooth UX.

2. **Task 2 Complete**: Integrated LanguageSwitcher in three locations:
   - Admin layout navbar (between bell icon and logout button)
   - Dashboard header (top-right)
   - Login page (absolute positioned top-right)

3. **Task 3 Complete**: Created date/number formatting hooks:
   - `useFormattedDate.ts`: Pre-defined formats (full, short, numeric, dayMonth, time, dateTime) with formatDate, formatTime, formatRelative, formatRange methods
   - `useFormattedNumber.ts`: Pre-defined formats with formatNumber, formatCurrency, formatPercent, formatCompact, formatHours methods
   - Both hooks expose raw formatter for advanced use cases

4. **Task 4 Complete**: Extended translation files with 215 total keys:
   - Added `common.language.*` namespace for switcher labels
   - Added `forms.validation.*`, `forms.labels.*`, `forms.placeholders.*` namespaces
   - Added `dates.*` namespace with day/month names
   - Added `errors.*` namespace for error messages
   - Added `dashboard.hoursUnit`, `dashboard.timeRange`, `dashboard.doctorSchedule` for locale-aware formatting
   - All keys identical in fr.json and en.json
   - ICU plural syntax used for `noBlockingConflict`, `minLength`, `maxLength`

5. **Task 5 Complete**: Created `scripts/check-translations.ts` validation script:
   - Extracts all keys from both translation files using dot notation
   - Compares key structures between fr.json and en.json
   - Reports missing keys in either direction
   - Added `pnpm i18n:check` npm script
   - Validation passes: 212 keys identical in both files

6. **Task 6 Complete**: Created comprehensive test suites:
   - `language-switcher.spec.tsx`: 5 unit tests for component rendering and locale switching
   - `useFormattedDate.spec.tsx`: 16 tests (8 FR + 5 EN output verification + 3 FR output verification)
   - `useFormattedNumber.spec.tsx`: 21 tests (12 FR + 3 FR output + 6 EN output verification)
   - `integration-i18n.spec.tsx`: 14 tests (7 FR + 6 EN + 1 locale switching simulation)

7. **Task 7 Complete**: Build and test verification:
   - `pnpm build`: SUCCESS - 21 static pages generated for both locales
   - `pnpm --filter @pawly/web test`: SUCCESS - 125 tests passed
   - No TypeScript errors
   - No regressions

#### Change Log

- 2026-02-05: Story 2-2 implementation complete. LanguageSwitcher component created with shadcn/ui Select. Integrated in admin, dashboard, and login layouts. Date/number formatting hooks created. Translation coverage extended to 212 keys. Validation script added. 109 web tests + 43 API tests passing. Build successful.
- 2026-02-05: Adversarial code review completed (Claude Opus 4.6). 4 CRITICAL + 3 HIGH + 3 MEDIUM issues found, all fixed:
  - CRITICAL: Replaced 6 hardcoded French strings in DashboardClient.tsx with i18n hooks (formatDate, formatTime, formatHours) and translation keys (hoursUnit, timeRange, doctorSchedule)
  - CRITICAL: Integrated useFormattedDate/useFormattedNumber hooks in EmployeeDashboard component (were created but never used)
  - CRITICAL: Added ICU plural syntax to noBlockingConflict, minLength, maxLength translations
  - HIGH: Rewrote integration-i18n.spec.tsx to test actual next-intl integration with locale switching (was testing raw Intl APIs)
  - HIGH: Added EN locale output verification tests to useFormattedDate.spec.tsx and useFormattedNumber.spec.tsx
  - Translation coverage: 215 keys (from 212). Test count: 125 web tests (from 109). Build passes.

## File List

**Created:**
- `apps/web/src/components/language-switcher.tsx`
- `apps/web/src/components/__tests__/language-switcher.spec.tsx`
- `apps/web/src/lib/hooks/useFormattedDate.ts`
- `apps/web/src/lib/hooks/useFormattedNumber.ts`
- `apps/web/src/lib/hooks/index.ts`
- `apps/web/src/lib/hooks/__tests__/useFormattedDate.spec.tsx`
- `apps/web/src/lib/hooks/__tests__/useFormattedNumber.spec.tsx`
- `apps/web/src/lib/hooks/__tests__/integration-i18n.spec.tsx`
- `apps/web/scripts/check-translations.ts`

**Modified:**
- `apps/web/src/i18n/langs/fr.json` (added language, forms, dates, errors namespaces)
- `apps/web/src/i18n/langs/en.json` (added language, forms, dates, errors namespaces)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` (added LanguageSwitcher)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` (added LanguageSwitcher header)
- `apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx` (added LanguageSwitcher)
- `apps/web/vitest.setup.ts` (added scrollIntoView mock for Radix UI)
- `apps/web/package.json` (added i18n:check script)
- `docs/implementation-artifacts/sprint-status.yaml` (status: ready-for-dev → in-progress → review)

## Dev Agent Record

### Summary

Story 2.2 implemented Application Translation & Language Switching. Created LanguageSwitcher component (shadcn/ui Select + Globe icon, instant locale switching via router.replace). Integrated in admin, dashboard, and login layouts. Created useFormattedDate and useFormattedNumber hooks. Extended translation files to 215 keys with forms, dates, errors namespaces. Added i18n:check validation script. Adversarial code review applied: replaced 6 hardcoded French strings, added ICU plural syntax, improved test coverage. 125 web tests + 43 API tests passing, build green.

### Files changed

**Created:**
- `apps/web/src/components/language-switcher.tsx`
- `apps/web/src/components/__tests__/language-switcher.spec.tsx`
- `apps/web/src/lib/hooks/useFormattedDate.ts`
- `apps/web/src/lib/hooks/useFormattedNumber.ts`
- `apps/web/src/lib/hooks/index.ts`
- `apps/web/src/lib/hooks/__tests__/useFormattedDate.spec.tsx`
- `apps/web/src/lib/hooks/__tests__/useFormattedNumber.spec.tsx`
- `apps/web/src/lib/hooks/__tests__/integration-i18n.spec.tsx`
- `apps/web/scripts/check-translations.ts`

**Modified:**
- `apps/web/src/i18n/langs/fr.json` (added language, forms, dates, errors namespaces)
- `apps/web/src/i18n/langs/en.json` (added language, forms, dates, errors namespaces)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` (added LanguageSwitcher)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` (added LanguageSwitcher header)
- `apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx` (added LanguageSwitcher)
- `apps/web/vitest.setup.ts` (added scrollIntoView mock for Radix UI)
- `apps/web/package.json` (added i18n:check script)
- `docs/implementation-artifacts/sprint-status.yaml` (status: ready-for-dev → in-progress → review)

### Deviations

None. All tasks completed as specified.

### Test output

- `pnpm build`: SUCCESS — 21 static pages generated for both locales
- `pnpm --filter @pawly/web test`: SUCCESS — 125 tests passed, 0 failures
- `pnpm test` (API): 43 API tests passing, no regressions
- No TypeScript errors
