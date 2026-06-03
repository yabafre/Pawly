---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  prd: docs/planning-artifacts/prd.md
  architecture: docs/planning-artifacts/architecture.md
  epics: docs/planning-artifacts/epics.md
  ux_design: docs/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-02-28
**Project:** Pawly

## Document Inventory

| Type | File | Status |
|------|------|--------|
| PRD | `docs/planning-artifacts/prd.md` | Found |
| Architecture | `docs/planning-artifacts/architecture.md` | Found |
| Epics & Stories | `docs/planning-artifacts/epics.md` | Found |
| UX Design | `docs/planning-artifacts/ux-design-specification.md` | Found |

**Duplicates:** None
**Missing Documents:** None

## PRD Analysis

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR1 | Admins manage user accounts and clinical roles. |
| FR2 | Employees log in via single-use, 15-minute Magic Links. Login requires email only; clinicId is resolved from the database. No NEXT_PUBLIC_CLINIC_ID. |
| FR3 | Admins configure clinic-specific shift types and contract rules. |
| FR4 | Admins apply recurring rotation templates. |
| FR5 | System generates draft schedules highlighting staffing "holes." |
| FR6 | Admins adjust shifts via interactive drag-and-drop. |
| FR7 | System blocks shifts conflicting with "Hard Rules" (Leave, School). |
| FR8 | System flags "Soft Rule" violations (Overtime, Equity) for Admin review. |
| FR9 | Employees confirm daily presence via a binary slider action. |
| FR10 | System notifies employees upon schedule publication. |
| FR11 | Interface supports FR and EN only, with versioned translation files. No dynamic multilingual CMS. Language detected from browser with manual override. |
| FR12 | Non-authenticated visitors access a public landing page with product, pricing, and call-to-action. |
| FR13 | Stripe Checkout IS the registration flow. Pre-checkout form collects clinic name, admin name, email. Webhook creates Clinic, Admin, Subscription. No separate registration endpoint. |
| FR14 | Admins manage subscription via Stripe Billing Portal. |
| FR15 | Promotion codes with discounts up to 100% for indefinite duration. Capped clinics. Promo = Stripe coupon + metadata. |
| FR16 | Access restricted based on active subscription status. Source of truth = Stripe. |
| FR17 | checkout.session.completed webhook creates Clinic, Admin user, Subscription, and sends Magic Link email. |
| FR18 | Post-checkout onboarding wizard configures clinic (name, days, hours, shifts). Gated by Clinic.onboardingCompleted. |

**Total FRs: 18**

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Grid interactions < 100ms perceived latency. |
| NFR2 | Schedule generation < 2s with visual loading feedback if > 1s. |
| NFR3 | Zero silent failures; all logic exceptions visible to Admin. |
| NFR4 | 99.5% availability; PWA read-only offline access via cache. |
| NFR5 | Magic Link tokens single-use, hashed in DB, 15-minute TTL. |
| NFR6 | All API endpoints enforce multi-tenant isolation via clinicId. |
| NFR7 | Admin passwords 8+ chars, mixed case, numbers. |
| NFR8 | JWT tokens expire within 24h; refresh tokens within 7 days. |
| NFR9 | Support up to 50 employees per clinic without degradation. |
| NFR10 | Background job queue handles concurrent schedule generations. |
| NFR11 | PWA on Chrome, Safari, Firefox, Edge (latest 2 versions). |
| NFR12 | Mobile UI iOS 15+ and Android 10+. |
| NFR13 | Desktop UI >= 1024px width. |
| NFR14 | WCAG 2.1 Level AA compliance. |
| NFR15 | Minimum 44px touch targets on mobile. |
| NFR16 | Color contrasts 4.5:1 text, 3:1 UI components. |
| NFR17 | Staff-Grid fully keyboard navigable (arrows, Enter, Escape). |
| NFR18 | Payment via Stripe only. No card data stored. |
| NFR19 | Stripe webhooks verified via HMAC before processing. |
| NFR20 | Language switching instantaneous, no full page reload. All strings in FR and EN. |
| NFR21 | Landing page Lighthouse Performance >= 90. |
| NFR22 | Landing page no auth, no non-essential cookies. |

**Total NFRs: 22**

### Additional Requirements

- **GDPR:** Secure PII storage; no patient medical data
- **Labor Rules:** Configurable Hard Rules (Blocking) vs Soft Rules (Warnings)
- **Auditability:** Trackable manual overrides vs auto-generated suggestions
- **PCI-DSS:** All payment processing delegated to Stripe
- **Multi-tenant:** Database isolation via clinicId (FK to Clinic). Clinic created exclusively via Stripe webhook
- **PWA Focus:** Mobile-first touch targets >= 44px, WCAG AA contrast
- **Network Resilience:** Read-only offline cache, "Zen" status indicators for network loss
- **Landing Page Isolation:** Functionally decoupled from the application
- **Subscription Management:** Stripe = single source of truth
- **Onboarding:** Post-checkout wizard, gated by Clinic.onboardingCompleted

### PRD Completeness Assessment

**Strengths:**
- All 18 FRs are clearly numbered and unambiguous
- All 22 NFRs cover performance, security, scalability, compatibility, accessibility, payment, i18n, and landing page
- Out of Scope section is well-defined, preventing scope creep
- Success criteria are quantified with specific metrics

**Critical Gap Identified:**
- **FR2 vs PWA iOS Context:** Magic Link authentication conflicts with PWA standalone mode on iOS. Safari opens Magic Links in browser context, not PWA standalone, creating cookie isolation. OTP email flow recommended as alternative/complement for employee PWA authentication.

**Overall:** PRD is comprehensive and well-structured. One critical gap regarding Magic Link vs PWA compatibility on iOS needs to be addressed before or during Epic 8 implementation.

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement | Epic Coverage | Status |
|----|----------------|---------------|--------|
| FR1 | Admins manage user accounts and clinical roles | Epic 1 (1.2, 1.3), Epic 5 (5.1) | ✓ Covered |
| FR2 | Employees log in via Magic Links (email only) | Epic 1 (1.2, 1.3, 1.5) | ✓ Covered |
| FR3 | Admins configure shift types and contract rules | Epic 5 (5.1, 5.2, 5.3, 5.5), Epic 6 (6.1) | ✓ Covered |
| FR4 | Admins apply recurring rotation templates | Epic 6 (6.1) | ✓ Covered |
| FR5 | System generates draft schedules with holes | Epic 6 (6.2, 6.3) | ✓ Covered |
| FR6 | Admins adjust shifts via drag-and-drop | Epic 7 (7.1) | ✓ Covered |
| FR7 | System blocks shifts with Hard Rules | Epic 5 (5.4, 5.5), Epic 6 (6.2) | ✓ Covered |
| FR8 | System flags Soft Rule violations | Epic 5 (5.5, 5.6), Epic 7 (7.2) | ✓ Covered |
| FR9 | Employees confirm presence via slider | Epic 8 (8.2) | ✓ Covered |
| FR10 | System notifies employees on publication | Epic 8 (8.3) | ✓ Covered |
| FR11 | Interface FR/EN with translation files | Epic 2 (2.1, 2.2) | ✓ Covered |
| FR12 | Public landing page with pricing | Epic 4 (4.1) | ✓ Covered |
| FR13 | Stripe Checkout = registration | Epic 3 (3.2), Epic 4 (4.2) | ✓ Covered |
| FR14 | Subscription via Billing Portal | Epic 3 (3.4) | ✓ Covered |
| FR15 | Promotion codes (100% discount) | Epic 3 (3.5) | ✓ Covered |
| FR16 | Access restricted by subscription | Epic 3 (3.6) | ✓ Covered |
| FR17 | Webhook creates Clinic+Admin+Sub+Magic Link | Epic 3 (3.2) | ✓ Covered |
| FR18 | Post-checkout onboarding wizard | Epic 3 (3.3) | ✓ Covered |

### Missing Requirements

#### Critical Gap: PWA Authentication (Not captured in any FR or story)

**Issue:** FR2 specifies Magic Link as the sole employee authentication mechanism. Epic 8 introduces a PWA portal for employees. On iOS, Magic Links opened from email apps open in Safari (not the PWA standalone), creating cookie context isolation. The PWA standalone cannot receive the authentication cookie set by Safari.

- **Impact:** Employees on iOS cannot reliably authenticate within the installed PWA
- **Recommendation:** Add a new story (e.g., Story 8.0: "OTP Email Authentication for PWA") to Epic 8 that introduces a 6-digit OTP code sent by email, allowing employees to authenticate directly within the PWA without leaving it
- **Alternative FR text:** "FR2b: Employees can alternatively authenticate via a 6-digit OTP code entered directly in the PWA, bypassing the Magic Link redirect flow"

### Coverage Statistics

- **Total PRD FRs:** 18
- **FRs covered in epics:** 18
- **Coverage percentage:** 100%
- **Uncaptured gap:** 1 (PWA-specific authentication method not addressed by any FR or story)

## UX Alignment Assessment

### UX Document Status

**Found:** `docs/planning-artifacts/ux-design-specification.md` — Comprehensive UX spec covering design system, user journeys, component strategy, responsive design, and accessibility.

### UX ↔ PRD Alignment

**Confirmed Alignments (14/18 FRs):**
- Staff-Grid drag-and-drop → FR6
- Health Bar gamification → FR8
- Employee confirmation slider → FR9
- Magic Link login → FR2
- School day declaration → FR7
- Planning generation → FR5
- Hard/Soft rule distinction → FR7, FR8
- FR/EN bilingual → FR11
- PWA mobile-first → NFR4, NFR11, NFR12
- WCAG 2.1 AA → NFR14
- Touch targets 44px → NFR15
- Color contrast 4.5:1 → NFR16
- Keyboard navigation → NFR17
- Grid < 100ms latency → NFR1

### UX ↔ Architecture Alignment

**Confirmed:** CSS Grid + dnd-kit, Optimistic UI via React Query, PWA offline with @serwist/next, BullMQ notifications, shadcn/ui + Radix UI primitives.

### Alignment Issues

#### Issue 1: Employee Exception Flow Not Captured in FRs (MEDIUM)
- **UX Spec:** Describes a "Modify/Exception" flow where employees declare variances with Reason + Note + Time (UX Journey #2, Component #3)
- **PRD:** FR9 only specifies "binary slider action" for presence confirmation
- **Impact:** The exception flow is a distinct feature beyond simple confirmation. Story 8.2 partially covers VarianceEvent creation but the employee-side exception declaration UI needs explicit coverage
- **Recommendation:** Clarify Story 8.2 acceptance criteria to include the exception/modify flow, or create a sub-task

#### Issue 2: Magic Link Assumes PWA Context Opening (CRITICAL)
- **UX Spec:** Journey #2 starts with "Open PWA via Magic Link" — assumes Magic Link opens in PWA standalone
- **Reality:** On iOS, Magic Links open in Safari, not in PWA standalone (separate cookie contexts)
- **Impact:** The entire Employee journey flow is broken on iOS for installed PWA users
- **Recommendation:** Same as Epic Coverage finding — add OTP email authentication story

#### Issue 3: Confirmation Reversibility Mismatch (HIGH)
- **UX Spec:** States "Swipe (Reversible): The primary 'Confirm' action. It must be reversible (e.g., 'Undo' toast or slide back) to prevent accidental validations"
- **Implementation:** Story 8.2 implements irreversible confirmation behavior
- **Impact:** Direct misalignment between UX specification and current implementation
- **Recommendation:** Either update UX spec to reflect intentional irreversibility (with justification), or add undo capability to the confirmation slider

### Warnings

- **framer-motion:** Listed as "nice-to-have" in UX spec for Health Bar animations. Not required for MVP but should be tracked for Phase 3 polish
- **sonner toasts:** UX spec mentions sonner for "System Never Lies" feedback. Currently used in implementation — aligned

## Epic Quality Review

### Epic Structure Validation

#### User Value Focus

| Epic | Title | User Value | Verdict |
|------|-------|-----------|---------|
| Epic 1 | Technical Foundation | Borderline — auth (Magic Link + JWT) and data models are functional prerequisites for brownfield project | ⚠️ Acceptable |
| Epic 2 | Internationalization (FR/EN) | Yes — Users navigate in FR or EN | ✅ |
| Epic 3 | Subscription, Clinic Registration & Onboarding | Yes — Clinic owners subscribe, create account, configure clinic | ✅ |
| Epic 4 | Public Landing Page & Acquisition | Yes — Visitors discover product and subscribe | ✅ |
| Epic 5 | Staff Management & Clinic Configuration | Yes — Admin manages employees and clinic settings | ✅ |
| Epic 6 | Intelligent Planning Engine | Yes — Admin generates schedules automatically | ✅ |
| Epic 7 | Admin Arbitration & Final Validation | Yes — Admin refines and publishes schedules | ✅ |
| Epic 8 | Employee PWA Portal & Time Tracking | Yes — Employees consult schedule and confirm presence | ✅ |

#### Epic Independence

All 8 epics follow a clean acyclic dependency graph:
- Epic 1 → standalone
- Epic 2 → depends on Epic 1
- Epic 3 → depends on Epic 1, 2
- Epic 4 → depends on Epic 2, 3
- Epics 5-8 → depend on Epic 1-4 (operational layer)

**No forward dependencies detected.** No epic requires a future epic to function.

### Story Quality Assessment

#### Acceptance Criteria Issues

| Severity | Story | Issue |
|----------|-------|-------|
| 🟠 Major | 5.1 | ACs too brief — "data is saved in Employee model via Prisma" lacks field details, validation rules, error handling |
| 🟠 Major | 5.2 | Missing error cases (overlapping constraints, invalid date ranges) |
| 🟠 Major | 6.1 | Minimal ACs — no detail on template structure or configuration options |
| 🟠 Major | 8.1 | Doesn't cover PWA installation (manifest, service worker) — split between 8.1 and 8.3 without clarity |
| 🟠 Major | 8.2 | AC says "AM/PM toggle" but UX spec says "binary slider" — terminology inconsistency |
| 🟡 Minor | 5.3-5.6 | Do not strictly follow BDD Given/When/Then format |
| 🟡 Minor | 7.1 | Missing edge cases (drag to blocked slot, undo) |
| 🟡 Minor | 7.3 | Missing full workflow (employee submits → admin validates → blocking rule created) |
| 🟡 Minor | 8.3 | Mixes MVP scope with Phase 2 (Push Notifications) without clear separation |

#### Database Entity Creation Timing

Story 1.4 creates Clinic, Subscription, and StripeEvent models before their functional use in Epic 3. This is an acceptable trade-off for a brownfield project that needs Clinic FK relationships early for the clinicId refactor.

### Best Practices Compliance

| Epic | User Value | Independence | Sizing | No Forward Deps | DB Timing | Clear ACs | FR Traceability |
|------|-----------|-------------|--------|-----------------|-----------|-----------|-----------------|
| Epic 1 | ⚠️ | ✅ | ✅ | ✅ | ⚠️ (1.4) | ✅ | ✅ |
| Epic 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Epic 5 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟠 | ✅ |
| Epic 6 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟠 | ✅ |
| Epic 7 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Epic 8 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟠 | ✅ |

### Summary of Violations

#### 🔴 Critical Violations: None
No critical structural violations. All epics deliver user value and the dependency graph is clean.

#### 🟠 Major Issues (5)
1. Stories 5.1, 5.2, 6.1 have acceptance criteria too brief — missing error cases and implementation details
2. Story 8.1 doesn't clearly own PWA installation (split between 8.1 and 8.3)
3. Story 8.2 terminology mismatch ("AM/PM toggle" vs "binary slider")
4. Epic 1 is borderline technical milestone (acceptable for brownfield but Story 1.4 creates models before functional use)
5. No story covers OTP/PWA authentication — critical gap not addressed

#### 🟡 Minor Concerns (4)
1. Stories 5.3-5.6 lack strict BDD Given/When/Then format
2. Story 7.1 missing drag-and-drop edge cases
3. Story 7.3 missing complete approval workflow description
4. Story 8.3 mixes MVP and Phase 2 scope

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** — The project is well-structured with comprehensive documentation, 100% FR coverage, and a clean dependency graph. However, one critical gap (PWA authentication on iOS) and several major issues must be addressed before Epic 8 implementation can proceed safely.

### Critical Issues Requiring Immediate Action

#### 1. PWA Authentication on iOS — CRITICAL (Blocks Epic 8)
- **Problem:** FR2 specifies Magic Link as the sole employee authentication method. On iOS, Magic Links opened from email open in Safari, NOT in the installed PWA standalone. Cookie contexts are separate. Apple does not support Universal Links for PWA (reserved for App Store native apps).
- **Impact:** Employees on iPhone cannot authenticate within the installed PWA. The entire Employee journey (UX Journey #2) is broken.
- **Action Required:** Create a new FR (FR2b) and a new Story (e.g., Story 8.0) for OTP email authentication. A 6-digit code entered directly in the PWA eliminates the redirect problem.

#### 2. Confirmation Reversibility Mismatch — HIGH
- **Problem:** UX spec mandates reversible confirmation ("Undo toast or slide back"). Story 8.2 implementation uses irreversible confirmation.
- **Action Required:** Align UX spec and implementation. Either add undo capability or document the intentional design decision for irreversibility.

#### 3. Acceptance Criteria Gaps — MAJOR
- **Problem:** Stories 5.1, 5.2, 6.1 have insufficient acceptance criteria (missing error cases, field details, validation rules).
- **Action Required:** Enrich ACs before implementation to prevent ambiguity during development.

### Recommended Next Steps

1. **Immediate:** Add FR2b (OTP Email Auth) to the PRD and create Story 8.0 in Epic 8. This is a prerequisite for a functional PWA on iOS.
2. **Before Epic 8 dev:** Resolve the confirmation reversibility question — update either the UX spec or the Story 8.2 implementation to align.
3. **Before Epic 5/6 dev:** Enrich acceptance criteria for Stories 5.1, 5.2, and 6.1 with error cases, field details, and validation rules.
4. **Clarify PWA ownership:** Decide whether PWA installation (manifest.json, service worker) belongs in Story 8.1 or 8.3 — currently split.
5. **Fix terminology:** Update Story 8.2 ACs to use "binary slider" (matching UX spec) instead of "AM/PM toggle."

### Readiness by Epic

| Epic | Status | Notes |
|------|--------|-------|
| Epic 1 | ✅ DONE | Stories 1.1-1.3 complete. Stories 1.4-1.5 ready. |
| Epic 2 | ✅ DONE | Both stories implemented. |
| Epic 3 | ✅ DONE | All 6 stories implemented. |
| Epic 4 | ✅ DONE | Landing + Pricing implemented. |
| Epic 5 | ✅ DONE | All 6 stories implemented (ACs were enriched during dev). |
| Epic 6 | ✅ DONE | All 3 stories implemented. |
| Epic 7 | ✅ DONE | All 5 stories implemented. |
| Epic 8 | ⚠️ NEEDS WORK | Stories 8.1-8.2 in review. Critical PWA auth gap. Missing OTP story. Reversibility mismatch. |

### Issue Tally

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 1 | PWA authentication on iOS (Magic Link incompatible with PWA standalone) |
| 🟠 High | 1 | Confirmation reversibility mismatch between UX spec and implementation |
| 🟠 Major | 5 | Brief ACs (5.1, 5.2, 6.1), PWA ownership split, terminology mismatch |
| 🟡 Minor | 4 | BDD format, edge cases, workflow completeness, scope mixing |
| **Total** | **11** | Across 4 assessment categories |

### Final Note

This assessment identified **11 issues across 4 categories** (PRD Analysis, Epic Coverage, UX Alignment, Epic Quality). The project's documentation quality is high — 100% FR coverage, clean dependency graph, well-defined scope, and comprehensive UX specifications. The critical blocker is the PWA authentication gap on iOS, which directly impacts the employee experience for Epic 8. Address this critical issue and the high-priority reversibility mismatch before proceeding with remaining Epic 8 implementation.

**Assessed by:** Implementation Readiness Workflow
**Date:** 2026-02-28
**Documents analyzed:** PRD, Architecture, Epics, UX Design Specification
