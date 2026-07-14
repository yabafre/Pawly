---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
workflowType: epics-stories
lastStep: 4
status: updated
completedAt: '2026-02-02'
lastEdited: '2026-04-04'
editHistory:
  - date: '2026-07-08'
    changes: 'Added Epic 11: Planning Engine Hardening & Compliance (10 stories) — from the 2026-07-08 multi-agent audit (28 confirmed findings). Remediates the 7-6 bulk-regeneration guard gap, manual-shift blindness, missing French labor-law hard rules, notification reliability, generation idempotency/concurrency, equity plumbing, rule-engine unification, and a GRASP local-repair pass. No new FRs — extends FR7 (Hard Rules) to French labor law.'
  - date: '2026-07-08'
    changes: 'Added Story 7.6: Post-Publication Change Management — from pre-mortem R1 (HIGH×CRITICAL): silent edits on published plannings, missing change notifications, stale isConfirmed, stale PWA cache.'
  - date: '2026-04-04'
    changes: 'Added Story 10.3: Onboarding Flow Revamp — Account-first registration, 3-step wizard, upgrade modal, webhook adaptation.'
  - date: '2026-04-01'
    changes: 'Added Epic 9 (Production Readiness — SigNoz + Trigger.dev) and Epic 10 (Polish & UX Hardening). Story 10.1: Admin Password Reset Workflow.'
  - date: '2026-02-04'
    changes: 'MAJOR REWRITE: Epic reordering (Option B — Stripe = Registration). New numbering (8 epics). Added stories 1.4, 1.5, 3.3. Marked 1.1-1.3 DONE. Added FR17, FR18. Removed clinicId from login flow. Registration = Stripe Checkout only.'
  - date: '2026-02-04'
    changes: 'Added FR11-FR16, NFR5-NFR22, Epics 6-8 (i18n, Stripe, Landing) to align with updated PRD and Architecture'
inputDocuments:
  - docs/planning-artifacts/prd.md
  - docs/planning-artifacts/architecture.md
  - docs/planning-artifacts/ux-design-specification.md
---

# Pawly - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Pawly, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Global Implementation Rules
- **Multi-tenancy**: Every business entity (Employee, Shift, Absence, etc.) MUST include a mandatory `clinicId` as a **foreign key** to the `Clinic` model. All database queries and API procedures must be strictly filtered by this ID.
- **Account-First Registration**: The `register` endpoint creates Clinic + Admin User (bcrypt password) + Subscription (Starter tier, no Stripe IDs) atomically. JWT issued immediately (auto-login). Professional upgrade via Stripe Checkout — `checkout.session.completed` webhook updates the existing Subscription.
- **Login resolves clinicId from DB**: The login flow does NOT accept `clinicId` as input. `User.email` is `@unique`; the backend resolves the user's clinic via `findUnique({ email })`. JWT still contains `clinicId` (resolved from the user record). `NEXT_PUBLIC_CLINIC_ID` is eliminated entirely.
- **Tech Stack Consistency**: Use `apps/api` for the NestJS/Prisma backend. No direct DB access from `apps/web`.
- **Data Flow (Non-Negotiable)**: Page -> Client Component -> Hook -> Zsa -> Server Action -> tRPC Client -> NestJS API. No shortcuts.
- **i18n Proxy Order**: `next-intl` proxy handles locale detection FIRST. Auth guards and subscription checks happen in route layouts (server-side), not in the proxy.

### Functional Requirements (Source: PRD)

FR1: Admins manage user accounts and clinical roles.
FR2: Employees log in via single-use, 15-minute Magic Links. Login requires email only; clinicId is resolved from the database (not provided by the client).
FR3: Admins configure clinic-specific shift types and contract rules.
FR4: Admins apply recurring rotation templates.
FR5: System generates draft schedules highlighting staffing "holes."
FR6: Admins adjust shifts via interactive drag-and-drop.
FR7: System blocks shifts conflicting with "Hard Rules" (Leave, School).
FR8: System flags "Soft Rule" violations (Overtime, Equity) for Admin review.
FR9: Employees confirm daily presence via a binary slider action.
FR10: System notifies employees upon schedule publication.
FR11: Interface supports FR and EN only, with versioned translation files. Language detected from browser with manual user override.
FR12: Non-authenticated visitors access a public landing page presenting the product, pricing plans, and a CTA for subscription or free trial.
FR13: Stripe Checkout IS the registration flow. A pre-checkout form collects clinic name, admin name, and admin email. Upon successful payment (or $0 promo), the `checkout.session.completed` webhook creates the Clinic, Admin user, and Subscription.
FR14: Admins manage their subscription (upgrade, downgrade, cancel) via the Stripe Billing Portal.
FR15: The system applies promotion codes with discounts up to 100% for indefinite duration. Promo = Stripe coupon + metadata (type=partner|internal|lifetime). Limited by capped account count. Does not auto-unlock future paid features beyond subscribed plan tier.
FR16: The system restricts access to application features based on active subscription status. Source of truth = Stripe, never the frontend.
FR17: Upon `checkout.session.completed`, the Stripe webhook creates a Clinic record, an Admin user linked to that clinic, a Subscription record, and sends a Magic Link email to the new admin for first login.
FR18: After first login, new admins are guided through a post-checkout onboarding wizard to configure their clinic (name, work days, work hours, shift types). The `Clinic.onboardingCompleted` flag gates access to the main dashboard.

### Non-Functional Requirements (Source: PRD)

**Performance & Quality:**
NFR1: Grid interactions < 100ms perceived latency.
NFR2: Schedule generation < 2s with immediate visual loading feedback if > 1s.
NFR3: Zero silent failures; all logic exceptions must be visible to the Admin.
NFR4: 99.5% system availability; PWA must support read-only offline access via cache.

**Security:**
NFR5: Magic Link tokens must be single-use, hashed in database, with 15-minute TTL.
NFR6: All API endpoints must enforce multi-tenant isolation via clinicId filtering.
NFR7: Admin passwords must meet minimum complexity (8+ chars, mixed case, numbers).
NFR8: JWT tokens must expire within 24 hours; refresh tokens within 7 days.

**Scalability:**
NFR9: System must support up to 50 employees per clinic without performance degradation.
NFR10: Background job queue must handle concurrent schedule generations for multiple clinics.

**Compatibility:**
NFR11: PWA must function on Chrome, Safari, Firefox, Edge (latest 2 versions).
NFR12: Mobile UI must support iOS 15+ and Android 10+ devices.
NFR13: Desktop UI must function on screens >= 1024px width.

**Accessibility:**
NFR14: UI must comply with WCAG 2.1 Level AA standards.
NFR15: All interactive elements must have minimum 44px touch targets on mobile.
NFR16: Color contrasts must meet 4.5:1 ratio for text, 3:1 for UI components.
NFR17: Staff-Grid must be fully navigable via keyboard (arrow keys, Enter, Escape).

**Payment Security:**
NFR18: Payment transactions are processed exclusively via Stripe. No card data stored or transmitted by Pawly servers.
NFR19: Stripe webhooks must be verified via HMAC signature before processing any subscription state change.

**Internationalization:**
NFR20: Language switching must be instantaneous without full page reload. All UI strings must exist in both FR and EN translation files.

**Landing Page:**
NFR21: Landing page must achieve a Lighthouse Performance score >= 90.
NFR22: Landing page must not require authentication and must not set non-essential cookies by default.

### Additional Requirements

- **Starter Template**: Next.js 16.1.6 (App Router) + Tailwind 4 + shadcn/ui.
- **Backend Architecture**: NestJS with Prisma 7.2.0 (Schema Folders) isolated in `apps/api`.
- **Data Flow Pattern**: Page -> Client Component -> Hook -> Zsa -> Server Action -> tRPC Client -> NestJS API.
- **State Management**: React Query (Server via Zsa) + Zustand (UI state only).
- **Infrastructure**: Monorepo Turbo, Redis/BullMQ for background jobs, Resend for emails.
- **i18n**: `next-intl` with `[locale]` prefix routing. `defaultLocale: 'fr'`, `localePrefix: 'as-needed'`. Proxy handles locale detection before auth guards.
- **Stripe**: Server-only SDK (NestJS). Checkout hosted + Billing Portal hosted. Webhook = single source of truth for subscription state. Raw body parser on `/api/stripe/webhook` ONLY. No `register()` endpoint — registration is Stripe Checkout only.
- **Subscription Model**: 1:1 with Clinic (via proper FK). Fields: `stripeCustomerId`, `stripeSubscriptionId`, `status`, `planKey`, `entitlementTier`. `StripeEvent` table for webhook idempotency.
- **Clinic Model**: `id`, `name`, `slug`, `onboardingCompleted`. All business entities reference `Clinic.id` as FK (replaces orphaned string clinicId).
- **Landing Page**: SSG with `generateStaticParams` for locales. SEO metadata per locale with `alternates.languages`. sitemap.xml + robots.txt.
- **UX**: "Clinique Zen" aesthetic. Holes = dashed outline + neutral + CTA. Hard conflict = Vital Orange + icon. Health Bar gamification.

## FR Coverage Map

_PRD → Epic/Story traceability._

| PRD FR | Requirement | Epic | Stories |
|--------|-------------|------|---------|
| FR1 | Admins manage user accounts and clinical roles | Epic 1, Epic 5 | 1.2, 1.3 (Auth), 5.1 (CRUD) |
| FR2 | Employees log in via Magic Links (email only, clinicId from DB) | Epic 1 | 1.2, 1.3, 1.5 |
| FR3 | Admins configure shift types and contract rules | Epic 5, Epic 6 | 5.1, 5.2, 5.3, 5.5, 6.1 |
| FR4 | Admins apply recurring rotation templates | Epic 6 | 6.1 |
| FR5 | System generates draft schedules with holes | Epic 6 | 6.2, 6.3 |
| FR6 | Admins adjust shifts via drag-and-drop | Epic 7 | 7.1 |
| FR7 | System blocks shifts conflicting with Hard Rules | Epic 5, Epic 6 | 5.4, 5.5, 6.2 |
| FR8 | System flags Soft Rule violations | Epic 5, Epic 7 | 5.5, 5.6, 7.2 |
| FR9 | Employees confirm presence via slider | Epic 8 | 8.2 |
| FR10 | System notifies employees on publication | Epic 7, Epic 8 | 7.6 (post-publication changes), 8.3 |
| FR11 | Interface FR/EN with versioned translation files | Epic 2 | 2.1, 2.2 |
| FR12 | Public landing page (product, pricing, CTA) | Epic 4 | 4.1 |
| FR13 | Stripe Checkout IS registration (pre-checkout form) | Epic 3, Epic 4 | 3.2, 4.2 |
| FR14 | Subscription management via Billing Portal | Epic 3 | 3.4 |
| FR15 | Promotion codes (up to 100% discount) | Epic 3 | 3.5 |
| FR16 | Access restricted by subscription status | Epic 3 | 3.6 |
| FR17 | Webhook creates Clinic + Admin + Subscription + Magic Link | Epic 3 | 3.2 |
| FR18 | Post-checkout onboarding wizard for clinic configuration | Epic 3 | 3.3 |

_Epic 11 (Planning Engine Hardening & Compliance) re-covers FR3/FR5/FR6/FR7/FR8/FR10 at a higher safety and reliability bar — see stories 11-1 through 11-10. It extends FR7 (Hard Rules) to French labor-law constraints (max 10h/day, 35h weekly rest, max 6 consecutive days) rather than introducing a new FR._

## Epic List

### Epic 1: Technical Foundation ✅ DONE (Stories 1.1–1.3) + NEW (1.4, 1.5)
Monorepo setup, modular Prisma schema, hybrid auth (JWT + Magic Link), unified login interface. **Extended** with Clinic/Subscription/StripeEvent models and auth refactor to remove clinicId from login flow.
**FRs covered:** FR1 (partial), FR2, FR17 (partial — models).

### Epic 2: Internationalization (FR/EN)
Bilingual support with next-intl, locale routing proxy, and versioned translation files. Must be configured before any page routing works correctly.
**FRs covered:** FR11.
**NFRs covered:** NFR20.

### Epic 3: Subscription, Clinic Registration & Onboarding
Stripe-powered subscription lifecycle: Checkout = registration (creates Clinic + Admin via webhook), onboarding wizard, Billing Portal, promotion codes, and access control. Server-only integration in NestJS.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18.
**NFRs covered:** NFR18, NFR19.

### Epic 4: Public Landing Page & Acquisition
SSG-rendered public marketing page with pricing, pre-checkout form, SEO optimization, and subscription CTA. Functionally decoupled from the application.
**FRs covered:** FR12, FR13 (partial — pre-checkout form on pricing page).
**NFRs covered:** NFR21, NFR22.

### Epic 5: Staff Management & Clinic Configuration
Employee profile management, contract types, clinic configuration (hours, days, closures), admin-configurable planning assistance rules, monthly school day declaration by apprentices, and equity counters.
**FRs covered:** FR1 (user management), FR3, FR7 (partial), FR8 (partial).

### Epic 6: Intelligent Planning Engine (Template + Greedy)
Schedule generation based on templates and Greedy algorithm respecting strict constraints (Hard Rules).
**FRs covered:** FR4, FR5, FR7.

### Epic 7: Admin Arbitration & Final Validation
Manual adjustments via drag-and-drop (FR6), Planning Health Bar, Soft Rules management and variance audit.
**FRs covered:** FR6, FR8.

### Epic 8: Employee PWA Portal & Time Tracking
Mobile consultation (offline cache), declarative presence confirmation and publication notifications.
**FRs covered:** FR9, FR10.

## Dependency Graph

```
Epic 1 (Technical Foundation) [DONE + refactor stories 1.4, 1.5]
  ↓
Epic 2 (i18n) — all pages need locale routing
  ↓
Epic 3 (Stripe + Registration + Onboarding) — creates clinics, registration flow
  ↓
Epic 4 (Landing Page) — uses Stripe pricing, i18n SSG, pre-checkout form
  ↓
Epic 5–8 (Operational) — staff, planning, admin arbitration, employee portal
  ├── Epic 5 (Staff Management)
  ├── Epic 6 (Planning Engine) — depends on Epic 5
  ├── Epic 7 (Admin Arbitration) — depends on Epic 6
  └── Epic 8 (Employee PWA) — depends on Epic 6
```


## Epic 1: Technical Foundation

### Story 1.1: [TECHNICAL PREREQUISITE] Monorepo Initialization & Modular Prisma Schema — ✅ DONE

> **Status:** DONE. Monorepo scaffolded, Prisma Schema Folders configured.

As a developer,
I need to initialize the Turbo monorepo structure and configure Prisma with modular schema folders,
So that the project has a solid and scalable technical foundation for subsequent user stories.

**Acceptance Criteria:**
**Given** an empty project directory
**When** the monorepo is scaffolded with apps/api, apps/web and packages/
**Then** the directory structure matches the architecture specification
**And** Prisma is configured in apps/api using `prisma/schema/` folders
**And** all core models include a mandatory `clinicId` field for multi-tenancy.

### Story 1.2: Authentication Backend (JWT + Magic Link Logic) — ✅ DONE (needs refactor in 1.5)

> **Status:** DONE. JWT + Magic Link backend implemented. Needs refactoring in Story 1.5 to remove clinicId from login flow.

As an employee,
I want to request a Magic Link via my email and receive a secure link,
So that I can log in without a password.

**Acceptance Criteria:**
**Given** a valid employee email in the database
**When** I call the request magic link endpoint
**Then** a hashed token is stored in the database with a 15-minute TTL
**And** an email is sent via Resend containing the single-use login link.

### Story 1.3: Unified Login Interface — ✅ DONE (needs refactor in 1.5)

> **Status:** DONE. Login UI implemented. Needs refactoring in Story 1.5 to remove clinicId input field.

As a user (Admin or Employee),
I want to use a unified login interface,
So that I can access my dashboard based on my role.

**Acceptance Criteria:**
**Given** the Pawly login page
**When** I submit my email/password (Admin) or request a magic link (Employee)
**Then** my credentials are validated securely
**And** I am authenticated and redirected to the appropriate dashboard based on my role (Admin -> /admin, Employee -> /dashboard)
**And** any authentication errors are displayed clearly to me

> **Implementation Note:** Follow the architectural data flow pattern: `Client Component -> Hook -> Zsa -> Server Action -> tRPC -> NestJS API`. See Architecture document for details.

### Story 1.4: [NEW] Clinic, Subscription & StripeEvent Prisma Models

As a developer,
I need to create the Clinic, Subscription, and StripeEvent Prisma models with proper foreign key relationships,
So that multi-tenancy is enforced via proper FK constraints and the subscription lifecycle has a data foundation.

**Acceptance Criteria:**
**Given** the existing Prisma schema in `packages/database/prisma/schema/`
**When** the new models are created
**Then** a `Clinic` model exists with fields: `id` (cuid), `name`, `slug` (@unique), `onboardingCompleted` (Boolean, default false), `createdAt`, `updatedAt`
**And** a `Subscription` model exists (1:1 with Clinic) with fields: `id`, `clinicId` (FK, @unique), `stripeCustomerId`, `stripeSubscriptionId`, `status` (enum: trialing, active, past_due, canceled, unpaid), `planKey`, `entitlementTier`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEnd`, `createdAt`, `updatedAt`
**And** a `StripeEvent` model exists with fields: `id`, `stripeEventId` (@unique), `type`, `processedAt`
**And** all existing models with `clinicId` string field are migrated to use `Clinic.id` as a proper foreign key
**And** the seed file is updated to create a default Clinic and link existing seed data to it
**And** `pnpm db:push` and `pnpm db:generate` run successfully from the project root.

> **Implementation Note:** This story creates the data foundation for Epic 3 (Stripe) but does NOT implement any Stripe logic. It is a pure schema change.

### Story 1.5: [NEW] Auth Refactor — Remove clinicId from Login, Resolve from DB

As a developer,
I need to refactor the auth flow so that clinicId is resolved from the database (not provided by the client),
So that login is simplified to email-only and the `NEXT_PUBLIC_CLINIC_ID` environment variable is eliminated.

**Acceptance Criteria:**
**Given** the existing auth implementation (Stories 1.2 and 1.3)
**When** the refactor is applied
**Then** `clinicId` is removed from `loginSchema` and `requestMagicLinkSchema` in `@pawly/validators`
**And** `auth.service.ts` uses `findUnique({ where: { email } })` instead of `findFirst({ where: { email, clinicId } })`
**And** `clinicId` is resolved from the user record and included in the JWT payload
**And** the `NEXT_PUBLIC_CLINIC_ID` environment variable is removed from `.env`, `.env.example`, and all code references
**And** the login UI no longer includes any clinicId input field
**And** the `register()` tRPC procedure is disabled/removed (registration happens via Stripe webhook only)
**And** all existing auth tests are updated to reflect the new flow
**And** `useAuth.ts` and `auth-actions.ts` no longer reference `clinicId` as an input parameter.

> **Dependency:** Requires Story 1.4 (Clinic model must exist for FK resolution).

## Epic 2: Internationalization (FR/EN)

> **Cross-Cutting Dependency:** i18n proxy must be configured before any page routing works correctly. This epic should be implemented immediately after Epic 1.

### Story 2.1: [TECHNICAL] i18n Foundation (next-intl Routing & Proxy)
As a developer,
I need to set up next-intl with locale-based routing and a proxy for locale detection,
So that all application pages support FR/EN navigation with clean URLs.

**Acceptance Criteria:**
**Given** the Next.js application
**When** the i18n foundation is configured
**Then** `next-intl` is installed with `[locale]` dynamic segment in `src/app/[locale]/`
**And** `proxy.ts` handles locale detection from `Accept-Language` header with redirect
**And** `routing.ts` is configured with `defaultLocale: 'fr'` and `localePrefix: 'as-needed'` (/ = FR, /en = EN)
**And** `request.ts` provides `getRequestConfig` for server-side locale resolution
**And** base translation files exist at `src/i18n/langs/fr.json` and `en.json`
**And** the proxy excludes `/api`, `/trpc`, `/_next`, `/_vercel`, static files, and files with dots
**And** the proxy runs BEFORE auth guards (auth/subscription checks remain in route layouts).

> **Architecture Note:** This is a foundational story. All subsequent page development depends on the `[locale]` routing being operational.

### Story 2.2: Application Translation & Language Switching
As a user (Admin or Employee),
I want to use Pawly in French or English and switch language instantly,
So that I can work in my preferred language.

**Acceptance Criteria:**
**Given** the Pawly application in any authenticated or public route
**When** I switch language via the UI or my browser preference is detected
**Then** all UI strings are displayed in the selected language (FR or EN)
**And** the language switch is instantaneous without full page reload (NFR20)
**And** date and number formatting adapts to the selected locale
**And** the user's language preference can be overridden manually
**And** 100% of UI strings exist in both FR and EN translation files.

> **Implementation Note:** Use ICU message syntax for pluralization and interpolation. Translation files are versioned static files (no dynamic CMS).

## Epic 3: Subscription, Clinic Registration & Onboarding

> **Cross-Cutting Dependency:** Subscription gating depends on Stripe webhooks being operational before admin routes are protected. This epic depends on Epic 1 (auth + models) and Epic 2 (i18n routing).

### Story 3.1: [TECHNICAL] Stripe Module Foundation & Webhook Security
As a developer,
I need to set up the NestJS Stripe module with secure webhook handling and subscription data models,
So that the application can safely process Stripe events and track subscription state.

**Acceptance Criteria:**
**Given** the NestJS backend (`apps/api`)
**When** the Stripe module is configured
**Then** `stripe.module.ts` and `stripe.service.ts` are created in `apps/api/src/stripe/`
**And** `stripe-webhook.controller.ts` receives POST requests on `/api/stripe/webhook`
**And** raw body parser is applied ONLY to the webhook route (not global JSON parser)
**And** all incoming webhooks are verified via `stripe.webhooks.constructEvent()` (HMAC signature - NFR19)
**And** `StripeEvent` model (from Story 1.4) stores `event.id` for idempotency (duplicate events are rejected)
**And** no card data is stored or transmitted by Pawly servers (NFR18).

> **Dependency:** Requires Story 1.4 (StripeEvent model).

### Story 3.2: Stripe Checkout & Clinic Registration (ENHANCED)
As a clinic owner,
I want to subscribe to Pawly via a Stripe Checkout page,
So that my clinic account is created upon successful payment.

**Acceptance Criteria:**
**Given** the pricing page with a pre-checkout form
**When** I fill in my clinic name, my name, and my email, then click "Subscribe"
**Then** the API creates a Stripe Checkout Session (hosted) via a tRPC procedure, with the pre-checkout data stored in `metadata`
**And** I am redirected to Stripe's hosted checkout page
**And** upon successful payment, the `checkout.session.completed` webhook:
  - Creates a new `Clinic` record (name from metadata, auto-generated slug)
  - Creates an `Admin` user linked to the clinic (email from metadata)
  - Creates a `Subscription` record with status from Stripe
  - Sends a Magic Link email to the new admin for first login
**And** I am redirected to a success page confirming account creation and instructing me to check my email
**And** the flow works for both paid and $0 (100% promo) checkouts
**And** there is NO separate `register()` endpoint — Stripe Checkout is the only registration path.

> **New User Journey:**
> ```
> Pricing Page → Pre-checkout form (name, email, clinic name)
>   → Stripe Checkout (payment or $0 promo)
>   → Webhook creates Clinic + Admin + Subscription
>   → Magic Link email sent
>   → Admin clicks link → Authenticated → Onboarding wizard
> ```

### Story 3.3: [NEW] Post-Checkout Onboarding & First Login
As a new clinic admin,
I want to be guided through an onboarding wizard after my first login,
So that my clinic is properly configured before I start using the application.

**Acceptance Criteria:**
**Given** a new admin who has clicked the Magic Link from the registration email
**When** they arrive in the application for the first time
**Then** they are redirected to the onboarding wizard at `app/[locale]/admin/onboarding/page.tsx`
**And** the wizard guides them through a multi-step configuration:
  - **Step 1:** Confirm/edit clinic name
  - **Step 2:** Configure work days (which days the clinic operates)
  - **Step 3:** Configure work hours (default shift start/end times)
  - **Step 4:** Define initial shift types (e.g., Surgery, Reception)
**And** upon completion, the `Clinic.onboardingCompleted` flag is set to `true`
**And** the admin is redirected to the main dashboard
**And** all admin routes (except onboarding) check `Clinic.onboardingCompleted` and redirect to onboarding if `false`
**And** the onboarding wizard follows the "Clinique Zen" aesthetic.

> **Dependency:** Requires Story 3.2 (Clinic + Admin must exist via webhook). Requires Story 2.1 (i18n routing for `[locale]`).

### Story 3.4: Subscription Management (Billing Portal)
As an admin,
I want to manage my subscription (upgrade, downgrade, cancel) via a self-service portal,
So that I can control my billing without contacting support.

**Acceptance Criteria:**
**Given** the admin billing page (`/admin/billing`)
**When** I click "Manage Subscription"
**Then** the API creates a Stripe Billing Portal session via a tRPC procedure
**And** I am redirected to Stripe's hosted Billing Portal
**And** subscription changes trigger webhooks that update the local `Subscription` record:
  - `customer.subscription.updated` -> update status, planKey, currentPeriodEnd
  - `customer.subscription.deleted` -> set status to canceled
  - `invoice.payment_failed` -> set status to past_due
**And** all webhook handlers check `StripeEvent` idempotency before processing.

### Story 3.5: Promotion Codes (100% Discount Support)
As a partner or promotional user,
I want to apply a promotion code during checkout that can cover up to 100% of the subscription cost,
So that I can access Pawly at a discounted or zero price.

**Acceptance Criteria:**
**Given** the Stripe Checkout flow
**When** I enter a promotion code
**Then** Stripe applies the associated coupon (configured via Stripe Dashboard)
**And** the coupon supports discounts up to 100% for indefinite duration
**And** promotion metadata is stored on the Stripe coupon (`type=partner|internal|lifetime`)
**And** promotions are limited to a capped number of clinics/accounts (configured in Stripe)
**And** the `entitlementTier` field on `Subscription` matches the subscribed plan tier (promo users get same tier, not more)
**And** 100% promo users do NOT auto-unlock future paid features beyond their subscribed plan tier.

> **Promo 100% Flow:** Pricing Page -> Enter promo code -> Checkout with coupon -> Webhook confirms $0 sub -> Clinic created with entitlementTier matching plan -> Full access at $0 -> Promo tracked via Stripe metadata.

### Story 3.6: Subscription-Based Access Control
As the system,
I need to restrict access to application features based on active subscription status,
So that only paying (or validly promoted) clinics can use the application.

**Acceptance Criteria:**
**Given** an authenticated admin
**When** they access any route under `/admin/*`
**Then** the `admin/layout.tsx` checks subscription status server-side
**And** source of truth is the `Subscription` record in DB (synced from Stripe via webhooks)
**And** access is granted if status is `active` or `trialing`
**And** access is denied (with redirect to billing page) if status is `past_due`, `canceled`, or `unpaid`
**And** the frontend NEVER determines subscription validity (always server-side check)
**And** feature gating respects the `entitlementTier` for future plan differentiation.

## Epic 4: Public Landing Page & Acquisition

> **Cross-Cutting Dependency:** Landing page depends on Epic 2 (i18n routing) for locale-aware SSG and on Epic 3 (Stripe) for pricing plan display and subscription CTA.

### Story 4.1: Public Landing Page (SSG, SEO, Acquisition)
As a non-authenticated visitor,
I want to view a public landing page presenting Pawly's value proposition and pricing,
So that I can understand the product and start a subscription or free trial.

**Acceptance Criteria:**
**Given** the public URL (/ for FR, /en for EN)
**When** I visit the landing page
**Then** I see a marketing page with:
  - Product value proposition and key features
  - Pricing plans with clear CTAs ("Start Free Trial" / "Subscribe")
  - "Clinique Zen" visual aesthetic consistent with the application
**And** the page is SSG-rendered via `generateStaticParams` for `['fr', 'en']`
**And** SEO metadata is locale-specific with `alternates.languages` for hreflang tags
**And** `sitemap.xml` and `robots.txt` are generated at root level
**And** the page achieves Lighthouse Performance score >= 90 (NFR21)
**And** no authentication is required (NFR22)
**And** no non-essential cookies are set by default (NFR22)
**And** the landing page is functionally decoupled from the application (no clinical data exposed).

### Story 4.2: Pricing Page with Pre-Checkout Form (ENHANCED)
As a non-authenticated visitor,
I want to view detailed pricing plans and start the subscription process directly from the pricing page,
So that I can compare options and seamlessly begin my clinic registration.

**Acceptance Criteria:**
**Given** the pricing URL (`/pricing` for FR, `/en/pricing` for EN)
**When** I visit the pricing page
**Then** I see all available subscription plans with features, prices, and CTAs
**And** each plan's CTA opens a pre-checkout form collecting: clinic name, admin name, admin email
**And** submitting the pre-checkout form redirects to Stripe Checkout (Story 3.2)
**And** a promotion code input field is visible (Story 3.5)
**And** the page is SSG-rendered with locale-specific content
**And** the page meets the same performance and isolation requirements as the landing page (NFR21, NFR22).

> **Note:** The pre-checkout form is the entry point to the registration flow. It collects the minimum information needed to create a Clinic and Admin via the Stripe webhook.

## Epic 5: Staff Management & Clinic Configuration

### Story 5.1: Employee & Contract Management (CRUD)
As an admin,
I want to manage employee profiles and their contract types,
So that the staff list is always up to date for scheduling.

**Acceptance Criteria:**
**Given** the employee management interface
**When** I create or update an employee
**Then** the data is saved in the `Employee` model via Prisma
**And** every query is strictly filtered by the authenticated user's `clinicId`.

### Story 5.2: Declarative Constraints Configuration
As an admin,
I want to define recurring unavailabilities for employees,
So that the planning engine doesn't assign shifts during those times.

**Acceptance Criteria:**
**Given** a specific employee profile
**When** I add an "UNAVAILABILITY" constraint (recurring or one-time)
**Then** the constraints are stored in the `Unavailability` model
**And** these constraints are flagged as "Hard Rules" for the planning algorithm.

### Story 5.3: Clinic Configuration (Hours & Days)
As an admin,
I want to configure my clinic's operational settings,
So that the planning engine respects our specific schedule.

**Acceptance Criteria:**
**Given** the clinic configuration interface
**When** I configure the following settings:
- **Work Hours:** Default shift start/end times (e.g., 8:30am-6:30pm for Surgery, 9am-7:30pm for Reception)
- **Work Days:** Which days the clinic operates (e.g., Monday-Saturday)
- **Closed Days:** Clinic closure dates (holidays, annual closures)
- **Special Days:** Days with modified schedules (e.g., reduced hours, events)
**Then** the configuration is saved in the `ClinicConfig` model via Prisma
**And** all settings are scoped to the authenticated user's `clinicId`
**And** the planning engine uses these settings as base constraints.

### Story 5.4: Monthly School Day Declaration (Apprentices)
As an apprentice,
I want to declare my school days before the end of each month,
So that the planning engine knows when I am unavailable for the upcoming month.

**Acceptance Criteria:**
**Given** my employee portal (as an apprentice)
**When** I access the "School Days" declaration before month end
**Then** I can select specific dates for the upcoming month via a calendar tap interaction
**And** a reminder notification is sent if I haven't declared by the 25th of the current month
**And** declared school days become "Hard Rules" (SCHOOL constraint) in the planning
**And** the admin is notified once the declaration is submitted.

> **UX Note:** "One-Tap Compliance" - declaring school days is a simple calendar tap interaction, not a form filling exercise.

### Story 5.5: Planning Assistance Rules (Admin Configurable)
As an admin,
I want to configure custom planning assistance rules,
So that the algorithm helps generate fair and compliant schedules.

**Acceptance Criteria:**
**Given** the planning rules configuration interface
**When** I define rules such as:
- **Staffing Minimums:** Minimum staff per shift type per day (e.g., "At least 1 ASV for Surgery")
- **Rotation Rules:** Equity guidelines (e.g., "Rotate Saturday shifts fairly")
- **Skill Requirements:** Match employee skills to shift types
- **Contract Compliance:** Respect weekly/monthly hour limits
**Then** rules are stored in the `PlanningRule` model with type (HARD or SOFT)
**And** HARD rules block assignments that violate them
**And** SOFT rules generate warnings but allow override
**And** all rules are scoped to the authenticated user's `clinicId`.

> **Note:** These are NOT hardcoded business rules. Each admin configures their own rules to assist the planning algorithm based on their clinic's specific needs.

### Story 5.6: Equity Counters Management
As an admin,
I want to track equity counters for fair shift distribution,
So that I can ensure workload is distributed fairly among employees.

**Acceptance Criteria:**
**Given** the employee management or planning interface
**When** shifts are assigned or confirmed
**Then** the system tracks counters per employee:
- **Saturday Counter:** Number of Saturdays worked this month/quarter
- **Weekend Counter:** Number of weekend days worked
- **Holiday Counter:** Number of holidays worked
- **Overtime Counter:** Hours above contract threshold
**And** these counters are visible to the admin on the planning grid
**And** they inform the "Soft Rules" warnings for equity violations.

## Epic 6: Intelligent Planning Engine (Template + Greedy)

### Story 6.1: Planning Template Definition (Admin)
As an admin,
I want to create week templates with shift types,
So that I have a baseline structure for monthly planning generation.

**Acceptance Criteria:**
**Given** the template management interface
**When** I define a standard week with staff requirements
**Then** the template is saved in the `PlanningTemplate` model via Prisma
**And** it is uniquely associated with the current `clinicId`.

### Story 6.2: Greedy Generation Algorithm & Blocking Rules
As an admin,
I want to trigger the automatic planning generation that fills template gaps while respecting constraints,
So that I get a valid planning proposal with minimal manual effort.

**Acceptance Criteria:**
**Given** a target month and a selected template
**When** I trigger the generation
**Then** the algorithm first verifies declared school days for apprentices (from Story 5.4 - Hard Rule)
**And** it respects admin-configured planning rules (from Story 5.5)
**And** it fills gaps while avoiding unavailabilities and closed days (FR7 - Hard Rules)
**And** it returns an object containing assignments, remaining holes, and detected conflicts
**And** visual loading feedback is shown if generation takes > 1s (NFR2).

**Reference:** See `docs/implementation-artifacts/planning-algorithm-reference.md` for the complete algorithm specification.

### Story 6.3: Schedule Visualization & Conflict Indicators
As an admin,
I want to visualize the generated planning in an interactive grid,
So that I can immediately identify coverage issues or rule violations.

**Acceptance Criteria:**
**Given** the `StaffGrid` interactive view
**When** a planning is loaded
**Then** empty slots ("Holes") are displayed with a dashed neutral outline and a "+" CTA icon
**And** Hard Conflicts are highlighted using "Vital Orange" with an explicit error icon and message.

**Reference:** See `docs/implementation-artifacts/planning-algorithm-reference.md` for the complete algorithm specification (scoring, constraints, border week shifts, applicableJobTypes).

## Epic 7: Admin Arbitration & Final Validation

### Story 7.1: Manual Schedule Adjustment (Drag & Drop)
As an admin,
I want to manually move shift assignments using drag and drop,
So that I can resolve coverage gaps.

**Acceptance Criteria:**
**Given** the interactive planning grid
**When** I drag an employee block from one slot to another
**Then** the change is saved optimistically and synced via a Server Action.

### Story 7.2: Equity Alerts Management (Soft Rules)
As an admin,
I want to receive visual warnings when equity counters indicate unfair distribution,
So that I can act fairly and balance workload across my team.

**Acceptance Criteria:**
**Given** a planning in edit mode
**When** a "SOFT" rule (configured in Story 5.5) is violated, including:
- Contract hours exceeded
- Weekend equity imbalance (tracked via counters from Story 5.6)
- Saturday rotation fairness violated
- Holiday distribution unfair
**Then** a visual orange warning icon (Vital Orange #F97316) appears on the affected cell
**And** hover/click reveals an explanatory message (e.g., "Julie: 3 Saturdays this month vs. average 1.5")
**And** the "Health Bar" reflects the soft warning count
**And** publication is allowed but cautioned.

> **Note:** Soft rules are admin-configurable (Story 5.5). The system does not enforce hardcoded equity rules - each clinic defines what "fair" means for their context.

### Story 7.3: Absence Request and Validation Workflow
As an employee or admin,
I want to submit or validate absence requests,
So that these periods are automatically blocked in the planning.

**Acceptance Criteria:**
**Given** the absence management module
**When** an absence is validated
**Then** it creates a blocking "Hard Rule" entry in the planning for that `clinicId`.

### Story 7.4: Planning Health Bar
As an admin,
I want to see a real-time summary of the planning health,
So that I know if the schedule is ready to be published.

**Acceptance Criteria:**
**Given** the planning interface
**When** I am editing or generating a schedule
**Then** a "Health Bar" component aggregates counts for holes, hard conflicts, and soft warnings
**And** the "Publish" button is disabled if any "Hard Conflicts" (Vital Orange) remain.

### Story 7.5: Admin Variance View (Time & Discrepancies Module)
As an admin,
I want to compare planned shifts vs. actual confirmed attendance,
So that I can track deviations, manage exceptions, and prepare accurate data for payroll.

**Acceptance Criteria:**
**Given** the admin dashboard
**When** I access the "Variance View" (Time & Discrepancies module)
**Then** I see a summary table highlighting differences between "Planned" and "Confirmed" (VarianceEvents):
- **On-Time Confirmations:** Green indicator, no action needed
- **Late Confirmations:** Yellow indicator with timestamp delta
- **Missed Confirmations:** Red indicator requiring admin review
- **Exceptions:** Employee-declared variances (reason + note) flagged for review
**And** I can filter by date range, employee, and variance type
**And** I can approve or reject exception requests
**And** I can export filtered data as CSV for payroll integration
**And** aggregated statistics show: total planned hours, confirmed hours, variance delta per employee.

> **Note:** This module bridges the gap between scheduling and payroll/HR systems. It provides the audit trail needed for labor compliance and fair compensation.

### Story 7.6: Post-Publication Change Management
As an admin,
I want schedule changes made after publication to be explicit, notified, and consistency-preserving,
So that employees never show up on a stale schedule and the "System Never Lies" promise holds after publication.

**Acceptance Criteria:**
**Given** a PUBLISHED planning period
**When** I move, create, or delete a shift in that period
**Then** the system requires an explicit acknowledgement of the post-publication change (no silent edit path)
**And** a shift moved to another date/employee has its `isConfirmed` flag reset
**And** every employee affected by the change receives a "schedule changed" notification (email, new template)
**And** the employee PWA schedule cache is invalidated so the stale version is not shown on next open
**And** post-publication modifications are tracked so the "<10% shifts modified after publication" PRD metric is measurable.

> **Origin:** `docs/pre-mortem.md` R1 (HIGH×CRITICAL). Evidence: `moveShift`/`createManualShift` have no `PlanningPeriodStatus` guard and send no notification; email/push fire only inside `publishPlanning`; no "schedule changed" template exists among the 13 email templates.

## Epic 8: Employee PWA Portal & Time Tracking

### Story 8.1: Personal Schedule Consultation (Graceful Offline)
As an employee,
I want to consult my schedule on my phone even without internet connection,
So that I know my work hours at any time.

**Acceptance Criteria:**
**Given** an employee logged in via Magic Link
**When** the device is offline
**Then** the PWA displays the last cached version of the monthly schedule
**And** the UI clearly indicates "Offline Mode - Showing cached data".

### Story 8.2: Declarative Time Tracking (VarianceEvent Tracking)
As an employee,
I want to confirm my presence for each slot,
So that I can declare my worked hours.

**Acceptance Criteria:**
**Given** my daily schedule on the portal
**When** I confirm my presence (AM/PM toggle)
**Then** a `VarianceEvent` is created, comparing the original planned shift with the confirmation timestamp.

### Story 8.3: Installation PWA & Email Notifications
As an employee,
I want to install the application and receive email alerts when a schedule is published,
So that I stay informed.

**Acceptance Criteria:**
**Given** the Pawly portal
**When** an admin publishes a schedule
**Then** an automated email is sent via Resend to all concerned employees
**And** the PWA can be installed on the home screen (manifest.json)
**And** Push Notifications are identified as an optional "Phase 2" feature.

---

## Epic 9: Production Readiness — Observability & Job Durability

### Quick-Spec: SigNoz + Trigger.dev Integration
As an ops team,
I want distributed tracing, metrics, and durable background jobs,
So that I can monitor and debug the application in production.

**Acceptance Criteria:**
**Given** the NestJS API and Next.js frontend
**When** requests are processed
**Then** traces and metrics are exported to SigNoz via OpenTelemetry
**And** all cron jobs and async tasks are executed via Trigger.dev with retries and a dashboard.

---

## Epic 10: Polish & UX Hardening

### Story 10.1: Admin Password Reset Workflow
As an admin user,
I want to reset my password when I forget it,
So that I can regain access to my clinic management dashboard without contacting support.

**Acceptance Criteria:**
**Given** the admin login form
**When** I click "Forgot password?"
**Then** I'm taken to a page where I enter my email, receive a reset link by email (1h TTL, SHA256 token), and can set a new password.
**And** the flow prevents user enumeration (timing-safe responses, generic messages).
**And** previous unused tokens are invalidated when a new one is requested.

### Story 10.2: Admin Settings — Clinic & Profile Management
As an admin user,
I want to manage my clinic information and personal account settings from the settings page,
So that I can update my clinic name, change my password, and configure my preferences without contacting support.

**Acceptance Criteria:**
**Given** the admin settings page
**When** I navigate to it
**Then** I see tabs for clinic info (name, slug), general config, shift types, and my account (name, locale, change password).
**And** I can edit my clinic name (slug auto-regenerated).
**And** I can change my password (current password required, strength indicator).
**And** I can switch my language preference (FR/EN).

### Story 10.3: Onboarding Flow Revamp — Account-First Registration
As a veterinary clinic admin,
I want to register my account before being asked for payment,
So that I can explore the platform as a Starter user immediately and upgrade to Professional only when I'm ready.

**Acceptance Criteria:**
**Given** the pricing page
**When** I click on a plan CTA
**Then** I'm redirected to `/pricing/register?plan=starter|professional` where I fill in clinic name, name, email, password (with Turnstile CAPTCHA).
**And** on submit, Clinic + User + Subscription (starter) are created atomically, I'm auto-logged in and redirected to the onboarding wizard (3 steps: work days, hours, shift types — no clinic name step).
**And** if I selected Professional, a dismissible upgrade modal appears on the dashboard after onboarding.
**And** the Stripe webhook handles upgrades for existing accounts (update subscription, not create new clinic).

---

## Epic 11: Planning Engine Hardening & Compliance

> **Shared context (read first):** [`docs/epics-context/epic-11-context.md`](epics-context/epic-11-context.md) — the full audit synthesis, file:line anchors per story, and the cross-cutting invariants every Epic 11 story must preserve. `aped-dev` / `aped-review` load it automatically.

Remediation epic derived from the multi-agent audit of 2026-07-08 (28 confirmed findings, 0 refuted across two independent audits). It introduces **no new FRs** — it re-covers FR5/FR6/FR7/FR8/FR10 at a higher safety and reliability bar and **extends the FR7 "Hard Rules" definition to include French labor-law constraints**. Sequencing follows the audit ROI roadmap: safety and compliance criticals first, algorithmic completeness last.

**FRs covered:** FR3, FR5, FR6, FR7 (extended), FR8, FR10.
**NFRs covered:** NFR2, NFR3, NFR9, NFR10.

### Story 11.1: Extend Published-Change Guard to Bulk Regeneration
**Story key:** `11-1-published-change-guard-bulk-regeneration`
As an admin user,
I want the published-change guard to apply when I regenerate or purge a published month, not only when I move a single shift,
So that a bulk regeneration can never silently wipe a published, confirmed schedule without my acknowledgement and without notifying staff.

**Acceptance Criteria:**
**Given** a month whose `PlanningPeriodStatus` is `PUBLISHED`
**When** an admin triggers monthly generation or "delete generated shifts" on that month
**Then** the `PUBLISHED_CHANGE_REQUIRES_ACK` guard fires and the operation requires `acknowledgePublishedChange: true` (added to the generation schemas).
**And** shifts with `isConfirmed=true` and shifts on past days are preserved (never deleted by the bulk `deleteMany`).
**And** on acknowledged change, an amendment is recorded (`amendedAt`, `amendmentCount++`) and a `schedule-changed` notification is emitted — mirroring the manual-move path.

**FRs covered:** FR5, FR7, FR10. **NFRs:** NFR3.
**Complexity:** M.
**Depends on:** none.

### Story 11.2: Manual Shifts Visible to Generator + Anti-Duplicate Constraint
**Story key:** `11-2-manual-shift-visibility-anti-duplicate`
As an admin user,
I want the generator to see the manual shifts already present in the target month,
So that regenerating an amended month never double-books an employee or silently exceeds their contract hours.

**Acceptance Criteria:**
**Given** a target month containing `MANUAL` shifts that survive regeneration
**When** the generation loop runs
**Then** those manual shifts are loaded into `assignmentIndex`, `weeklyMinutesCounter`, and the equity/hour counters before the loop begins (same query shape as `loadBorderWeekShifts`, bounded to the target month).
**And** a partial `@@unique` constraint on `Shift` (employee × date × slot) prevents any exact double-booking at the database level.
**And** the slot overlap check accounts for pre-existing manual coverage when computing remaining `requiredStaff`.

**FRs covered:** FR5, FR7.
**Complexity:** M.
**Depends on:** 11-1-published-change-guard-bulk-regeneration.

### Story 11.3: French Labor Law as Default Hard Rules
**Story key:** `11-3-french-labor-law-hard-rules`
As a clinic operating under French labor law,
I want statutory rest and working-time limits enforced by default,
So that a generated or manually edited schedule cannot silently produce an illegal roster.

**Acceptance Criteria:**
**Given** any clinic, with or without admin-configured planning rules
**When** shifts are generated or manually edited
**Then** the following constraints are enforced as non-disableable hard rules: max 10h worked per day (L.3121-18), 13h daily amplitude, 35h consecutive weekly rest and max 6 consecutive worked days (L.3132-1/2).
**And** default statutory rules are seeded at onboarding, and the statutory limits are also hard-coded so they hold even with zero configured rules.
**And** violations surface in the Planning Health Bar (not only as a soft score penalty).

**FRs covered:** FR3, FR7 (extended). **NFRs:** NFR3.
**Complexity:** L.
**Depends on:** none.

### Story 11.4: Reliable Publication & Change Notifications
**Story key:** `11-4-reliable-publication-notifications`
As an employee,
I want to reliably receive publication and change notifications,
So that a transient email-provider failure never leaves me unaware that my schedule was published or changed.

**Acceptance Criteria:**
**Given** the `batch-email-publish` Trigger task and the schedule-notification mail methods
**When** a Resend send fails
**Then** the task throws so its configured retries (`maxAttempts: 5`) actually run, instead of returning success unconditionally.
**And** the direct-Resend fallback (used by OTP / magic-link) is wired for `sendSchedulePublicationEmail` and `sendScheduleChangedEmail`, and the caller reacts to the returned status.
**And** an `emailSendCounter` metric is emitted so a silent notification outage is observable.

**FRs covered:** FR10. **NFRs:** NFR3.
**Complexity:** M.
**Depends on:** none.

### Story 11.5: Idempotent Generation & Concurrency Safety
**Story key:** `11-5-idempotent-generation-concurrency-safety`
As an admin user,
I want month generation and publication to be safe under retries and concurrent access,
So that a reverse-proxy timeout or a double click can never duplicate an entire month of shifts.

**Acceptance Criteria:**
**Given** a slow generation or publication request behind a reverse proxy
**When** the client or infrastructure retries on a 5xx / connection reset
**Then** the tRPC client no longer retries mutations (`fetchWithRetry` limited to queries), so a mutation is sent at most once.
**And** `generateMonthlyPlan` and `publishPlan` take a `pg_advisory_xact_lock` keyed on `(clinicId, month)` so concurrent runs serialize instead of racing.
**And** with the anti-duplicate constraint from 11-2 in place, a retried generation cannot produce a duplicated month (the dead `P2002` catch becomes a real safety net).

**FRs covered:** FR5. **NFRs:** NFR3, NFR10.
**Complexity:** M.
**Depends on:** 11-2-manual-shift-visibility-anti-duplicate.

### Story 11.6: Transactional Amendment Flow & Cache Coherence
**Story key:** `11-6-transactional-amendment-cache-coherence`
As an admin user,
I want an acknowledged amendment to apply atomically and invalidate stale caches,
So that a partial failure never leaves a changed shift without its amendment record, notification, or a fresh cache.

**Acceptance Criteria:**
**Given** an acknowledged published-change (move / create / delete)
**When** the mutation and `recordAmendment` run
**Then** both execute inside a single interactive `$transaction` (tx passed through), so an intermediate failure rolls back cleanly.
**And** the router's Redis `schedule:*` invalidations run in a `try/finally` so they are never skipped when the handler throws mid-way.
**And** after a successful amendment the employee-facing schedule reflects the change within one cache TTL, with no stale `isConfirmed` or `schedule:*` entry.

**FRs covered:** FR6, FR10. **NFRs:** NFR3.
**Complexity:** S.
**Depends on:** 11-1-published-change-guard-bulk-regeneration.

### Story 11.7: Equity Counter Window Fix
**Story key:** `11-7-equity-counter-window-fix`
As an admin user,
I want equity to be computed over a rolling 12-month window with entries for every employee,
So that fairness does not reset each January and new hires are not preferentially assigned the unpopular shifts.

**Acceptance Criteria:**
**Given** equity computation at the start of a calendar year or for a newly hired employee
**When** `getCountersForPeriod` builds the equity map
**Then** it loads a rolling 12-month window (including December of the previous year), instead of only the current calendar year.
**And** missing `equityMap` entries (January boundary, new hires) are created rather than short-circuited with a flat `+20` fallback.
**And** the live intra-month increment creates the employee's entry when absent so subsequent scoring reflects real load.

**FRs covered:** FR8.
**Complexity:** M.
**Depends on:** none.

### Story 11.8: Unify the Rule Engine
**Story key:** `11-8-unified-rule-engine`
As a maintainer,
I want a single HARD/SOFT rule evaluator shared by generation, publication, and manual-move validation,
So that a shift violating a hard rule cannot pass one path while being blocked in another.

**Acceptance Criteria:**
**Given** the three current rule implementations (generation scoring, `validateShiftsAgainstRules`, `preValidateMove`)
**When** rules are evaluated on any path
**Then** a single shared evaluator is used, deducting `breakMinutes`, enforcing `maxWeeklyHours` in validation, and honoring `ruleType` for contract/rotation (so HARD contract/rotation violations block publication).
**And** the evaluator is unit-tested in isolation, ideally extracted with the pure algorithm core into a domain package.
**And** publication is blocked by any HARD violation regardless of which rule category produced it.

**FRs covered:** FR7, FR8.
**Complexity:** L.
**Depends on:** 11-2-manual-shift-visibility-anti-duplicate, 11-3-french-labor-law-hard-rules.

### Story 11.9: Local Repair Pass (GRASP) for Generation Completeness
**Story key:** `11-9-local-repair-pass-grasp`
As an admin user,
I want the generator to attempt to fill holes a single greedy pass leaves behind,
So that the schedule is as complete as feasible without introducing rule violations.

**Acceptance Criteria:**
**Given** a greedy generation result that leaves holes while a feasible fuller assignment exists (proven by counter-example)
**When** generation completes
**Then** a bounded local-repair pass runs: hole-repair via ejection chains (depth ≤ 2) plus equity hill-climbing swaps against an explicit global objective.
**And** every swap correctly decrements/increments the affected counters and re-checks validity through the unified evaluator, so no repair introduces a hard-rule violation.
**And** holes and violations are recomputed after the pass, and each unresolved hole still carries a visible reason for the admin.

**FRs covered:** FR5. **NFRs:** NFR2.
**Complexity:** L.
**Depends on:** 11-2-manual-shift-visibility-anti-duplicate, 11-8-unified-rule-engine.

### Story 11.10: Generation Performance Under Load
**Story key:** `11-10-generation-performance-under-load`
As an admin of a large clinic,
I want month generation to stay responsive at 50 employees,
So that generating a full month never freezes the API event loop or breaks the < 2s target.

**Acceptance Criteria:**
**Given** a stress configuration (50 employees, 24/7 clinic, 3 shift types, 31-day month)
**When** a month is generated
**Then** the SOFT rotation scoring uses a per-day index and early-exit instead of re-scanning the whole pool per employee per slot.
**And** the generation loop yields the event loop periodically (or runs as an async Trigger job) so it never blocks concurrent requests.
**And** generation meets NFR2 (< 2s, with loading feedback beyond 1s) and NFR9 (50 employees without degradation) under the stress configuration.

**FRs covered:** (perf hardening — no new FR). **NFRs:** NFR2, NFR9.
**Complexity:** M.
**Depends on:** 11-2-manual-shift-visibility-anti-duplicate.

### Epic 11 — Implementation Sequence (DAG)

```
Wave 1 (no deps, parallel): 11-1 · 11-3 · 11-4 · 11-7
Wave 2: 11-2 (<-11-1) · 11-6 (<-11-1)
Wave 3: 11-5 (<-11-2) · 11-10 (<-11-2) · 11-8 (<-11-2,11-3)
Wave 4: 11-9 (<-11-2,11-8)
```

Critical safety/reliability quick wins (~1-2 weeks): 11-1, 11-2, 11-4, 11-5.

### Epic 11 — Linear Tickets

Synced to Linear project **Pawly**, milestone *Epic 11 — Planning Engine Hardening & Compliance* (2026-07-08). Dependencies wired as blocked-by relations.

| Story key | Ticket | Size | Priority |
|-----------|--------|------|----------|
| 11-1-published-change-guard-bulk-regeneration | KON-118 | M | Urgent |
| 11-2-manual-shift-visibility-anti-duplicate | KON-119 | M | Urgent |
| 11-3-french-labor-law-hard-rules | KON-120 | L | High |
| 11-4-reliable-publication-notifications | KON-121 | M | High |
| 11-5-idempotent-generation-concurrency-safety | KON-122 | M | High |
| 11-6-transactional-amendment-cache-coherence | KON-123 | S | Medium |
| 11-7-equity-counter-window-fix | KON-124 | M | Medium |
| 11-8-unified-rule-engine | KON-125 | L | Medium |
| 11-9-local-repair-pass-grasp | KON-126 | L | Low |
| 11-10-generation-performance-under-load | KON-127 | M | Medium |

---

## Epic 12: Planning Optimality (Phase 3)

Phase-3 initiative from the PRD Product Scope (*"AI Engine: Global optimization algorithms for complex fairness balancing"*). With safety, compliance (Epic 11) and bounded local repair (KON-126, extended by KON-128) shipped, the remaining engine gap is the absence of any optimality guarantee. The 2026-07-08 audit deliberately chose GRASP over CP-SAT *at Epic 11's scale and priorities*; this epic revisits that decision as a measured, **opt-in improve pass** — never a replacement of the greedy engine. It introduces **no new FRs** — FR5/FR8 are re-covered at a higher optimality bar.

**FRs covered:** FR5, FR8. **NFRs covered:** NFR2, NFR3, NFR9.

### Story 12.1: CP-SAT Optimal Solver behind the Greedy Path
**Story key:** `12-1-cp-sat-optimal-solver`
As an admin user,
I want an exact solver to try to improve the schedule that greedy + local repair produced when I generate a month,
So that I get a provably better plan (fill first, then weighted equity) without ever risking a worse or illegal one.

**Acceptance Criteria:**
**Given** `engine: 'cpsat'` on a month where greedy+repair strands a hole a full feasible assignment avoids
**When** generation runs
**Then** the served plan has strictly fewer holes, `stats.engine === 'cpsat'`, and every served assignment passes rule-engine + statutory re-validation.
**And** without the flag, results are byte-identical to today (`stats.engine === 'greedy'`, zero solver work).
**And** solver TIMEOUT / INFEASIBLE / error / not-strictly-better / re-validation failure serves the greedy+repair result unchanged with a structured warn log (NFR3 — never silent).
**And** two identical `cpsat` runs are deep-equal (workers = 1, fixed seed, deterministic-time budget — determinism invariant), and the 50-employee stress fixture stays inside the CI-aware NFR2 budget.

**FRs covered:** FR5, FR8. **NFRs:** NFR2, NFR3, NFR9.
**Complexity:** L.
**Depends on:** KON-128 (PR #108 — weighted equity objective; merge gate is Task 1 of the story).

### Story 12.2: Engine Selector in the Generation Panel (Professional-gated)
**Story key:** `12-2-engine-toggle-tier-gate`
As a Professional clinic admin,
I want to choose the exact solver from the generation panel and see which engine actually produced the served plan,
So that I get CP-SAT optimization without hidden magic — and as a Starter admin, I clearly see it is a Pro feature.

**Acceptance Criteria:**
**Given** a Professional admin enabling the exact-engine switch
**When** they generate a month
**Then** the request carries the cpsat engine and the served engine (`stats.engine`) is visible afterwards (badge + toast), including the informational "solver found no improvement — standard plan served" case.
**And** a Starter admin sees the switch disabled with a "Pro" badge and an upgrade hint, while standard generation keeps working.
**And** the API rejects `engine: 'cpsat'` for a Starter subscription with FORBIDDEN (gate on the value, not the procedure — greedy stays Starter-accessible), from any client.
**And** with the switch off (default) requests are byte-identical to today, and every new UI string exists in both FR and EN.

**FRs covered:** FR16, FR5 (re-covered). **NFRs:** NFR20.
**Complexity:** L.
**Depends on:** 12-1-cp-sat-optimal-solver (done).

### Epic 12 — Linear Tickets

| Story key | Ticket | Size | Priority |
|-----------|--------|------|----------|
| 12-1-cp-sat-optimal-solver | KON-129 | L | Low |
| 12-2-engine-toggle-tier-gate | KON-130 | L | Low |
