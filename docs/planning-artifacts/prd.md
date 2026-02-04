---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-e-01-discovery
  - step-e-02-review
  - step-e-03-edit
inputDocuments:
  - docs/planning-artifacts/ux-design-specification.md
  - docs/implementation-artifacts/tech-spec-pawly-mvp-planning-pwa.md
workflowType: prd
documentCounts:
  brief: 0
  research: 0
  brainstorming: 0
  projectDocs: 2
classification:
  projectType: Web App / SaaS B2B
  domain: Productivity & HR (Veterinary)
  complexity: Medium
  projectContext: brownfield
lastEdited: '2026-02-04'
editHistory:
  - date: '2026-02-04'
    changes: 'Epic reordering (Option B). Added FR17 (webhook registration), FR18 (onboarding wizard). Modified FR2 (email-only login, clinicId from DB), FR13 (Checkout = registration with pre-checkout form). Added User Journey 7 (First Clinic Setup).'
  - date: '2026-02-04'
    changes: 'Added i18n FR/EN, landing page, Stripe subscription with 100% promo support'
---

# Product Requirements Document - Pawly

**Author:** Alex
**Date:** 2026-02-02

## Executive Summary

**Vision:** Pawly is a bilingual (FR/EN) SaaS scheduling PWA for veterinary clinics, distributed via subscription. It replaces manual Excel-based planning with a smart, constraint-aware system that balances administrative efficiency with employee trust. A public landing page drives clinic acquisition, while Stripe-powered subscriptions serve as the exclusive registration path — clinic accounts are created via Stripe Checkout webhooks, with post-checkout onboarding to configure the clinic.

**Problem:** Veterinary clinics face high cognitive load in scheduling staff (Vets, Nurses, Apprentices) while respecting complex constraints (school days, contract hours) and maintaining fairness. No affordable, veterinary-specific SaaS solution exists for this niche.

**Differentiator:** The "System Never Lies" philosophy. Pawly explicitly exposes staffing gaps and conflicts rather than hiding them behind "black-box" automation, ensuring the Admin always retains informed final control. Flexible subscription plans with partner promotion support (up to 100% discount) lower the adoption barrier.

## Success Criteria

### User & Business Outcomes
*   **Planning Efficiency:** Reduce monthly planning time from 3-5 hours to **30-45 minutes** (-70% to -85%).
*   **Stability:** < 10% of shifts require modification after publication.
*   **Adoption:** > 90% of employees access the PWA via Magic Link without assistance.
*   **Trust:** > 80% of shifts confirmed via a single "declarative" slider action.

### Acquisition & Revenue
*   **Landing Conversion:** > 5% of landing page visitors start a free trial or subscribe.
*   **Subscription Activation:** > 80% of trial clinics convert to paid plan within 30 days.
*   **Bilingual Coverage:** 100% of UI strings available in both FR and EN at launch.

### Technical Performance
*   **Responsiveness:** Drag-and-drop interactions < 100ms (Optimistic UI).
*   **Reliability:** Zero silent failures in constraint calculation or shift generation.
*   **Speed:** Monthly schedule generation < 2 seconds.
*   **Landing Performance:** Lighthouse Performance score >= 90 on landing page.

## User Journeys

### 1. The "Tetris Negotiation" (Admin)
Sarah (Clinic Owner) opens Pawly on the 25th. She clicks "Generate Draft." In < 2s, 90% of the grid is filled. The system highlights 3 Red "Holes" (missing surgery cover) and 2 Orange "Overtime" warnings. Sarah manually adjusts a shift; the "Health Bar" turns Green. She publishes, ending the stress of the "blank page."

### 2. "Declarative Trust" (Employee)
Thomas (Vet) receives a "Planning Published" email. He clicks the Magic Link (no password) and sees his vertical timeline on mobile. Every evening, he swipes a green slider to confirm "I was here." He sees his overtime counter update instantly, feeling respected and informed.

### 3. "School First" (Apprentice)
Léa (Apprentice) declares her school weeks. Later, when Sarah tries to assign Léa a shift on a school day, the system **bounces the shift back** with a "Blocking Error." Léa’s education is protected by the system, not just human memory.

### 4. "The Impossible Case" (Resilience)
During a flu outbreak, the algorithm highlights Tuesday in Red: "0/3 Vets Available." It doesn't force a bad plan. Sarah sees the gap, calls a temp agency, adds a "Guest Vet," and the system validates the fix.

### 5. "Discovery & Subscription" (Acquisition)
Dr. Martin hears about Pawly at a veterinary conference. He visits the landing page (in French), reads the value proposition, views pricing plans. He clicks "Start Free Trial," enters his clinic details, and is redirected to Stripe Checkout. Within 2 minutes, his clinic account is active and he begins configuring shifts.

### 6. "Partner Promotion" (Strategic Access)
A veterinary school partners with Pawly. The school shares a 100% promotion code with graduating apprentices opening new clinics. Léa enters the code during subscription; Stripe applies a lifetime coupon. She gets full access at zero cost. The promotion is tracked via Stripe metadata (`type=partner`), and does not auto-unlock future premium features beyond the subscribed plan.

### 7. "First Clinic Setup" (Registration & Onboarding)
Dr. Martin visits the pricing page and selects a plan. A pre-checkout form asks for his clinic name ("Clinique Vétérinaire du Parc"), his name, and his email. He's redirected to Stripe Checkout and pays. Behind the scenes, the webhook creates his clinic, his admin account, and his subscription. He receives a Magic Link email. Clicking the link authenticates him and redirects to the onboarding wizard: he confirms his clinic name, selects work days (Mon–Sat), configures hours (8:30–18:30), and defines shift types (Surgery, Reception). The wizard completes, `Clinic.onboardingCompleted` is set to `true`, and he lands on his fresh dashboard — ready to add staff and build his first schedule.

## Product Scope & Roadmap

### Phase 1: MVP (Planning, Trust & Acquisition)
*   **Engine:** Template-based generation + Greedy scoring algorithm.
*   **Admin UI:** Desktop "Staff-Grid" with drag-and-drop and real-time "Health Bar."
*   **Employee UI:** Mobile PWA with vertical timeline and confirmation slider.
*   **Compliance:** Mandatory "School Day" enforcement for Apprentices.
*   **Auth:** Passwordless Magic Link (Employees) + Password/JWT (Admins).
*   **Landing Page:** Public marketing page presenting the product, pricing, and subscription flow. Functionally decoupled from the application (no clinical data exposed, no auth, no non-essential cookies).
*   **Subscriptions:** Stripe-powered plans with Checkout, billing portal, and promotion code support (including 100% indefinite discounts).
*   **Bilingual:** FR/EN interface via versioned translation files. No dynamic multilingual CMS content in MVP.

### Phase 2: Growth (Scalability)
*   **Notifications:** Real-time Web Push alerts.
*   **Multi-Tenancy:** Multi-clinic dashboard and site management.
*   **Analytics:** Advanced reporting on fairness and labor costs.
*   **Integrations:** Automated CSV/API exports for standard payroll systems.

### Phase 3: Vision (Optimization)
*   **AI Engine:** Global optimization algorithms for complex fairness balancing.
*   **Full ERP:** Managing the entire employee lifecycle (onboarding, performance).
*   **Additional Languages:** Expansion beyond FR/EN based on market demand.

## Domain & Technical Specifications

### Compliance & Rules
*   **GDPR:** Secure PII storage; no patient medical data.
*   **Labor Rules:** Configurable Hard Rules (Blocking) vs. Soft Rules (Warnings).
*   **Auditability:** Trackable manual overrides vs. auto-generated suggestions.
*   **PCI-DSS:** All payment processing delegated to Stripe Checkout and Billing Portal. No card data stored or transmitted by Pawly servers.

### Technical Architecture
*   **Multi-tenant Logic:** Database isolation via `clinicId` (proper FK to `Clinic` model). `Clinic` created exclusively via Stripe webhook.
*   **PWA Focus:** Mobile-first touch targets (≥44px) and WCAG AA contrast.
*   **Network Resilience:** Read-only offline cache and "Zen" status indicators for network loss.
*   **Internationalization:** FR/EN supported via versioned static translation files. Locale detection from browser `Accept-Language` header with user override. No dynamic CMS-based translations.
*   **Landing Page Isolation:** The public landing page is functionally decoupled from the application. No clinical data exposed. No authentication required. No non-essential cookies by default.
*   **Subscription Management:** Stripe as single source of truth for subscription status. Webhooks verified via HMAC signature. Promotion coupons stored as Stripe objects with metadata (`type=partner|internal|lifetime`). Stripe Checkout is the exclusive registration path (no self-registration endpoint).
*   **Onboarding:** Post-checkout onboarding wizard configures clinic (name, days, hours, shifts). Gated by `Clinic.onboardingCompleted` flag. Admin routes redirect to onboarding until completed.

## Functional Requirements

### Access & Management
*   **FR1:** Admins manage user accounts and clinical roles.
*   **FR2:** Employees log in via single-use, 15-minute Magic Links. Login requires email only; `clinicId` is resolved from the database (not provided by the client). No `NEXT_PUBLIC_CLINIC_ID` environment variable.
*   **FR3:** Admins configure clinic-specific shift types and contract rules.

### Planning & Execution
*   **FR4:** Admins apply recurring rotation templates.
*   **FR5:** System generates draft schedules highlighting staffing "holes."
*   **FR6:** Admins adjust shifts via interactive drag-and-drop.
*   **FR7:** System blocks shifts conflicting with "Hard Rules" (Leave, School).
*   **FR8:** System flags "Soft Rule" violations (Overtime, Equity) for Admin review.
*   **FR9:** Employees confirm daily presence via a binary slider action.
*   **FR10:** System notifies employees upon schedule publication.

### Internationalization
*   **FR11:** The interface supports FR and EN only, with versioned translation files. No dynamic multilingual CMS content in MVP. Language detected from browser with manual user override.

### Acquisition & Landing
*   **FR12:** Non-authenticated visitors access a public landing page presenting the product, pricing plans, and a call-to-action for subscription or free trial.

### Subscription & Billing
*   **FR13:** Stripe Checkout IS the registration flow. A pre-checkout form collects clinic name, admin name, and admin email. Upon successful payment (or $0 promo), the `checkout.session.completed` webhook creates the Clinic, Admin user, and Subscription. There is no separate registration endpoint.
*   **FR14:** Admins manage their subscription (upgrade, downgrade, cancel) via the Stripe Billing Portal.
*   **FR15:** The system applies promotion codes with discounts up to 100% for indefinite duration. Promotions are limited to a capped number of clinics/accounts and do not auto-unlock future paid features beyond the subscribed plan tier. Promo = Stripe coupon + metadata (`type=partner|internal|lifetime`).
*   **FR16:** The system restricts access to application features based on active subscription status. Source of truth for subscription state is always Stripe, never the frontend.

### Registration & Onboarding
*   **FR17:** Upon `checkout.session.completed`, the Stripe webhook creates a Clinic record, an Admin user linked to that clinic, a Subscription record, and sends a Magic Link email to the new admin for first login.
*   **FR18:** After first login, new admins are guided through a post-checkout onboarding wizard to configure their clinic (name, work days, work hours, shift types). The `Clinic.onboardingCompleted` flag gates access to the main dashboard.

## Non-Functional Requirements

### Performance & Quality
*   **NFR1:** Grid interactions < 100ms perceived latency.
*   **NFR2:** Schedule generation < 2s with immediate visual loading feedback if > 1s.
*   **NFR3:** Zero silent failures; all logic exceptions must be visible to the Admin.
*   **NFR4:** 99.5% system availability; PWA must support read-only offline access via cache.

### Security
*   **NFR5:** Magic Link tokens must be single-use, hashed in database, with 15-minute TTL.
*   **NFR6:** All API endpoints must enforce multi-tenant isolation via `clinicId` filtering.
*   **NFR7:** Admin passwords must meet minimum complexity (8+ chars, mixed case, numbers).
*   **NFR8:** JWT tokens must expire within 24 hours; refresh tokens within 7 days.

### Scalability
*   **NFR9:** System must support up to 50 employees per clinic without performance degradation.
*   **NFR10:** Background job queue must handle concurrent schedule generations for multiple clinics.

### Compatibility
*   **NFR11:** PWA must function on Chrome, Safari, Firefox, Edge (latest 2 versions).
*   **NFR12:** Mobile UI must support iOS 15+ and Android 10+ devices.
*   **NFR13:** Desktop UI must function on screens ≥1024px width.

### Accessibility
*   **NFR14:** UI must comply with WCAG 2.1 Level AA standards.
*   **NFR15:** All interactive elements must have minimum 44px touch targets on mobile.
*   **NFR16:** Color contrasts must meet 4.5:1 ratio for text, 3:1 for UI components.
*   **NFR17:** Staff-Grid must be fully navigable via keyboard (arrow keys, Enter, Escape).

### Payment Security
*   **NFR18:** Payment transactions are processed exclusively via Stripe. No card data stored or transmitted by Pawly servers.
*   **NFR19:** Stripe webhooks must be verified via HMAC signature before processing any subscription state change.

### Internationalization
*   **NFR20:** Language switching must be instantaneous without full page reload. All UI strings must exist in both FR and EN translation files.

### Landing Page
*   **NFR21:** Landing page must achieve a Lighthouse Performance score >= 90.
*   **NFR22:** Landing page must not require authentication and must not set non-essential cookies by default.

## Out of Scope

The following items are explicitly **NOT** included in the Pawly MVP or Growth phases:

### Excluded Features
*   **Patient/Medical Records:** No veterinary patient data, treatment records, or medical histories.
*   **Appointment Scheduling:** No client-facing appointment booking (focus is staff scheduling only).
*   **Payroll Processing:** No direct payroll calculations or payments (exports only).
*   **Time Clock Hardware:** No physical punch clock or biometric integration.
*   **Real-time Location:** No GPS tracking or geofencing for employees.

### Excluded Integrations
*   **Veterinary Practice Management Systems:** No direct PMS integration (e.g., eVetPractice, Cornerstone).
*   **Accounting Software:** No QuickBooks, Xero, or similar integrations.
*   **HR Platforms:** No ADP, BambooHR, or similar full HR suite integrations.
*   **Communication Platforms:** No Slack, Teams, or WhatsApp integrations.

### Excluded Capabilities
*   **Languages Beyond FR/EN:** MVP supports French and English only. Additional languages deferred to Phase 3.
*   **Dynamic Multilingual CMS:** No database-stored translations or admin-editable content localization in MVP.
*   **Custom Reporting Builder:** No user-defined report creation (fixed reports only).
*   **Mobile Admin Features:** Admin features are desktop-first; mobile admin is limited.
*   **Offline Write Operations:** Offline mode is read-only; write operations require connectivity.

### Deferred to Future Phases
*   **Push Notifications:** Web Push alerts deferred to Phase 2.
*   **AI Optimization:** Advanced fairness algorithms deferred to Phase 3.
*   **Multi-clinic Dashboard:** Cross-clinic management deferred to Phase 2.
*   **Full Employee Lifecycle:** Onboarding, performance reviews deferred to Phase 3.
