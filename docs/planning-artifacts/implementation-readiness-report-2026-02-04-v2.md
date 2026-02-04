---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsUsed:
  prd: docs/planning-artifacts/prd.md
  architecture: docs/planning-artifacts/architecture.md
  epics: docs/planning-artifacts/epics.md
  ux: docs/planning-artifacts/ux-design-specification.md
assessor: Claude Opus 4.5
date: '2026-02-04'
status: NEEDS WORK — Critical architectural gap
userContext: "NEXT_PUBLIC_CLINIC_ID should not exist as static env var. Flow must be: Signup → Clinic config → Subscription → Tool access. clinicId resolved dynamically from DB."
---

# Implementation Readiness Assessment Report

**Date:** 2026-02-04 (v2)
**Project:** Pawly
**Assessor:** Claude Opus 4.5
**Overall Status:** NEEDS WORK

---

## 1. Document Inventory

| Document Type | File | Format | Status |
|---|---|---|---|
| PRD | `docs/planning-artifacts/prd.md` | Whole | ✓ Found |
| Architecture | `docs/planning-artifacts/architecture.md` | Whole | ✓ Found |
| Epics & Stories | `docs/planning-artifacts/epics.md` | Whole | ✓ Found |
| UX Design | `docs/planning-artifacts/ux-design-specification.md` | Whole | ✓ Found |

**Implementation Artifacts (completed stories):**
- `1-1-initialisation-du-monorepo-schema-prisma-modulaire.md`
- `1-2-backend-dauthentification-jwt-magic-link-logic.md`
- `1-3-interface-de-connexion-flux-zsatrpc.md`

No duplicates. No missing documents.

---

## 2. PRD Analysis

### Functional Requirements (16 total)

| ID | Requirement |
|---|---|
| FR1 | Admins manage user accounts and clinical roles |
| FR2 | Employees log in via single-use, 15-minute Magic Links |
| FR3 | Admins configure clinic-specific shift types and contract rules |
| FR4 | Admins apply recurring rotation templates |
| FR5 | System generates draft schedules highlighting staffing "holes" |
| FR6 | Admins adjust shifts via interactive drag-and-drop |
| FR7 | System blocks shifts conflicting with "Hard Rules" (Leave, School) |
| FR8 | System flags "Soft Rule" violations (Overtime, Equity) for Admin review |
| FR9 | Employees confirm daily presence via a binary slider action |
| FR10 | System notifies employees upon schedule publication |
| FR11 | Interface supports FR and EN only, with versioned translation files |
| FR12 | Non-authenticated visitors access a public landing page |
| FR13 | Admins subscribe to a plan via Stripe Checkout, creating a clinic account |
| FR14 | Admins manage their subscription via the Stripe Billing Portal |
| FR15 | System applies promotion codes with discounts up to 100% |
| FR16 | System restricts access based on active subscription status |

### Non-Functional Requirements (22 total)

| Category | IDs | Summary |
|---|---|---|
| Performance | NFR1-NFR4 | <100ms grid, <2s generation, zero silent failures, 99.5% uptime |
| Security | NFR5-NFR8 | Magic link hashed/single-use/15min, clinicId isolation, password complexity, JWT 24h/refresh 7d |
| Scalability | NFR9-NFR10 | 50 employees/clinic, concurrent generation |
| Compatibility | NFR11-NFR13 | Chrome/Safari/Firefox/Edge, iOS 15+/Android 10+, desktop >=1024px |
| Accessibility | NFR14-NFR17 | WCAG 2.1 AA, 44px touch targets, 4.5:1 contrast, keyboard navigation |
| Payment Security | NFR18-NFR19 | Stripe-only payments, HMAC webhook verification |
| i18n | NFR20 | Instantaneous language switching |
| Landing Page | NFR21-NFR22 | Lighthouse >=90, no auth/cookies |

### PRD Completeness Assessment

The PRD is well-structured. **However, a critical implicit requirement is not explicitly stated as a FR:** the **Signup/Onboarding flow** — the journey from "new visitor" to "authenticated admin with configured clinic." FR13 says "creating a clinic account upon successful payment" but no FR covers the pre-checkout registration or post-checkout onboarding.

---

## 3. Epic Coverage Validation

### Coverage Matrix

| FR | Requirement | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Admin manages users/roles | Epic 1 (1.2, 1.3), Epic 2 (2.1) | ✓ Covered |
| FR2 | Employee Magic Link login | Epic 1 (1.2, 1.3) | ✓ Covered |
| FR3 | Clinic shift types/contract config | Epic 2 (2.1-2.5), Epic 3 (3.1) | ✓ Covered |
| FR4 | Recurring rotation templates | Epic 3 (3.1) | ✓ Covered |
| FR5 | Draft schedule generation | Epic 3 (3.2, 3.3) | ✓ Covered |
| FR6 | Drag-and-drop adjustment | Epic 4 (4.1) | ✓ Covered |
| FR7 | Hard Rules blocking | Epic 2 (2.4, 2.5), Epic 3 (3.2) | ✓ Covered |
| FR8 | Soft Rule warnings | Epic 2 (2.5, 2.6), Epic 4 (4.2) | ✓ Covered |
| FR9 | Presence confirmation slider | Epic 5 (5.2) | ✓ Covered |
| FR10 | Publication notification | Epic 5 (5.3) | ✓ Covered |
| FR11 | FR/EN i18n | Epic 6 (6.1, 6.2) | ✓ Covered |
| FR12 | Public landing page | Epic 8 (8.1) | ✓ Covered |
| FR13 | Stripe Checkout + Clinic creation | Epic 7 (7.2) | ⚠️ Partial — missing onboarding stories |
| FR14 | Stripe Billing Portal | Epic 7 (7.3) | ✓ Covered |
| FR15 | Promotion codes (100%) | Epic 7 (7.4) | ✓ Covered |
| FR16 | Subscription access control | Epic 7 (7.5) | ✓ Covered |

### Coverage Statistics

- Total PRD FRs: **16**
- FRs fully covered in epics: **15** (93.75%)
- FRs partially covered: **1** (FR13 — missing pre-checkout + post-checkout flows)

### Critical Missing Requirements

**MISSING: The Signup → Clinic → Subscription → Access journey**

The PRD (FR13) and Architecture both describe this flow:
```
Landing → "Subscribe" → Stripe Checkout → Webhook → Create Clinic + Admin → Onboarding
```

But no story covers:
1. **Pre-checkout:** Where does the visitor provide their name, email, clinic name?
2. **Post-checkout:** What is the "onboarding flow" at the success URL?
3. **First login:** How does the webhook-created admin set their password?
4. **clinicId resolution:** How does the frontend resolve clinicId after removing the static env var?

---

## 4. UX Alignment Assessment

### UX Document Status: FOUND

`ux-design-specification.md` — 626 lines, comprehensive for operational UI (planning grid, employee portal).

### UX ↔ PRD Alignment

| Area | UX Coverage | Status |
|---|---|---|
| Staff-Grid (FR5, FR6, FR7, FR8) | Deeply specified (CSS Grid, dnd-kit, Health Bar) | ✓ Excellent |
| Employee Portal (FR9) | Shift Card, Swipe slider, Timeline | ✓ Excellent |
| Magic Link Login (FR2) | "Login Surface" mentioned | ✓ Covered |
| Notifications (FR10) | Mentioned but not detailed | ⚠️ Partial |
| **Landing Page (FR12)** | **Not specified** | ❌ MISSING |
| **Checkout Flow (FR13)** | **Not specified** | ❌ CRITICAL |
| **Billing Portal (FR14)** | **Not specified** | ❌ MISSING |
| **Promo Codes (FR15)** | **Not specified** | ❌ MISSING |
| **Subscription Gating (FR16)** | **Not specified** | ❌ MISSING |
| **Language Switcher (FR11)** | **No component specified** | ❌ MISSING |
| **Onboarding Flow** | **Not specified at all** | ❌ CRITICAL |

### UX ↔ Architecture Alignment

**Strong alignments:** shadcn/ui, Tailwind v4, dnd-kit, framer-motion, sonner, PWA strategy, WCAG AA compliance.

**Gaps:**
1. UX does not address i18n routing or language switcher component
2. UX does not cover any acquisition funnel pages (landing, pricing, checkout)
3. UX assumes users are already authenticated in an existing clinic

### Critical Warning

The UX document covers the **operational application** (planning, employee portal) comprehensively but has **zero coverage** of the **acquisition funnel** (landing → pricing → checkout → onboarding → first login). This represents approximately 30% of the MVP scope (Epics 6, 7, 8) with no UX specification.

---

## 5. Epic Quality Review

### Epic Independence Validation

| Epic | Independent? | Issue |
|---|---|---|
| Epic 1: Auth | ⚠️ Assumes clinicId exists | 🔴 clinicId created by Epic 7 |
| Epic 2: Staff | ✓ Depends on Epic 1 only | — |
| Epic 3: Planning | ✓ Depends on Epic 1, 2 | — |
| Epic 4: Admin | ✓ Depends on Epic 1, 2, 3 | — |
| Epic 5: Employee | ✓ Depends on Epic 1, 3, 4 | — |
| Epic 6: i18n | ⚠️ Cross-cutting | Must come before Epic 7, 8 |
| Epic 7: Stripe | 🔴 Creates clinicId that Epic 1 needs | **CIRCULAR DEPENDENCY** |
| Epic 8: Landing | ✓ Depends on Epic 6, 7 | — |

### Violations Found

#### 🔴 Critical Violations (3)

**CV1: Circular Dependency — Epic 1 ↔ Epic 7**

Epic 1 (Auth) requires `clinicId` to authenticate users. Epic 7 (Stripe) creates `clinicId` via the `checkout.session.completed` webhook. The current implementation resolves this with `NEXT_PUBLIC_CLINIC_ID` as a static environment variable — making the system single-tenant instead of the multi-tenant SaaS described in the PRD.

This is not a minor sequencing issue. It represents a **fundamental architectural contradiction**: the auth system assumes clinics pre-exist, but the subscription system creates them.

**CV2: Missing Stories — Signup & Onboarding Flow**

No story covers the complete user journey from visitor to active admin:
- Pre-checkout registration (collect admin email, name, clinic name)
- Post-checkout onboarding (success page, password setup, clinic configuration)
- First employee invitation
- clinicId dynamic resolution mechanism

Story 7.2 mentions "onboarding flow" in passing but has no acceptance criteria for it.

**CV3: Missing Story — clinicId Resolution Mechanism**

After removing `NEXT_PUBLIC_CLINIC_ID`, how does the frontend know which clinic the user belongs to? The JWT already contains `clinicId` (added during code review), but no story documents:
- Extracting clinicId from JWT on the client
- Passing clinicId in API requests
- Handling multi-clinic admins (if future)

#### 🟠 Major Issues (3)

**MI1: Epic 6 (i18n) Positioning**

Described as "must be configured before any page routing works correctly" but positioned as Epic 6 in a sequence of 8. Pages from Epics 1-5 will need retrofitting for `[locale]` routing. This retroactive work is not documented in any story.

**MI2: Story 7.2 Incomplete Acceptance Criteria**

Missing ACs for: webhook failure handling, checkout abandonment, email collision (existing user tries to subscribe), admin password setup post-creation.

**MI3: Story 1.3 Implicit clinicId Assumption**

The unified login interface uses `NEXT_PUBLIC_CLINIC_ID` which is the symptom of the circular dependency. This story needs to be updated once the resolution mechanism is defined.

#### 🟡 Minor Concerns (3)

**MC1:** Story 1.1 creates all DB models upfront instead of per-story. Acceptable with Prisma Schema Folders.

**MC2:** Epic 3 title is implementation-focused ("Template + Greedy"). Suggestion: "Schedule Generation & Optimization."

**MC3:** Story 8.2 (Pricing Page) has no dedicated FR. FR12 only covers the landing page.

---

## 6. Summary and Recommendations

### Overall Readiness Status

### **NEEDS WORK**

The planning artifacts are well-structured and cover the operational application thoroughly (Epics 1-5). However, a **critical architectural gap** exists in the acquisition/subscription funnel that blocks true SaaS multi-tenant implementation.

### Critical Issues Requiring Immediate Action

| # | Severity | Issue | Impact |
|---|---|---|---|
| 1 | 🔴 CRITICAL | Circular dependency Epic 1 ↔ Epic 7 (`clinicId`) | Auth system is fundamentally single-tenant, contradicting SaaS PRD |
| 2 | 🔴 CRITICAL | Missing signup/onboarding stories | No path from "visitor" to "active admin with clinic" |
| 3 | 🔴 CRITICAL | `NEXT_PUBLIC_CLINIC_ID` must be eliminated | Static env var = one clinic per deployment |
| 4 | 🟠 HIGH | UX missing for entire acquisition funnel (FR12-FR16) | ~30% of MVP has no UX specification |
| 5 | 🟠 HIGH | Epic 6 (i18n) cross-cutting timing | Pages from Epics 1-5 need retroactive i18n support |
| 6 | 🟠 HIGH | Story 7.2 incomplete ACs (onboarding, password, errors) | Key flow undefined |

### Recommended Next Steps

**1. Resolve the Circular Dependency (CRITICAL)**

Option A — **Restructure Epic 1 to include clinic creation:**
- Add a "Clinic Registration" story before Story 1.2
- Flow: Register form → Create Clinic + Admin in DB → Magic Link or password login
- Stripe subscription becomes an independent gating layer (Epic 7), not the clinic creation mechanism

Option B — **Let Stripe Checkout be the registration:**
- Story 7.2 becomes the entry point for all new clinics
- Pre-checkout page collects admin info via Stripe Checkout metadata
- Webhook creates everything (Clinic + Admin + Subscription)
- Auth (Epic 1) works with webhook-created entities
- Requires reordering: Epic 6 → Epic 7 → Epic 8 → then Epic 1 (login for existing users)

**2. Add Missing Stories**

Regardless of the option chosen above, add stories for:
- Admin registration / account creation
- Post-checkout onboarding page (success URL)
- Admin password setup (magic link? set-password page?)
- Clinic initial configuration wizard
- `clinicId` resolution from JWT (eliminate `NEXT_PUBLIC_CLINIC_ID`)
- Language switcher component (FR11, NFR20)

**3. Create UX Specifications for Acquisition Funnel**

The UX document needs new sections for:
- Landing page layout, hero, pricing display
- Checkout flow (pre/during/post Stripe)
- Onboarding wizard (clinic setup)
- Billing management page
- Language switcher interaction

**4. Clarify Epic 6 (i18n) Timing**

Either:
- Move i18n to Epic 1 or create an "Epic 0" for foundational cross-cutting setup
- Or accept that Epics 1-5 will be built without i18n and add a retrofit story in Epic 6

### Final Note

This assessment identified **6 critical/high issues** and **3 minor concerns** across 4 analysis categories (PRD coverage, UX alignment, epic quality, dependency analysis). The core issue is a **structural gap between the single-tenant implementation and the multi-tenant SaaS vision**. All other issues stem from this fundamental contradiction.

The operational epics (2-5) are well-structured and ready for implementation once the acquisition funnel (Epics 1, 6, 7, 8) is properly redesigned.

**Recommendation:** Address issues #1-#3 before continuing implementation. The current code on `feature/story-1-3-login-zsa-trpc` will need to be refactored once the clinicId resolution mechanism is defined.

---

*Report generated by Claude Opus 4.5 — BMAD Implementation Readiness Workflow v6.0*
