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
---

# Product Requirements Document - Pawly

**Author:** Alex
**Date:** 2026-02-02

## Executive Summary

**Vision:** Pawly is a specialized "Clinique Zen" scheduling PWA for veterinary clinics. It replaces manual Excel-based planning with a smart, constraint-aware system that balances administrative efficiency with employee trust.

**Problem:** Veterinary clinics face high cognitive load in scheduling staff (Vets, Nurses, Apprentices) while respecting complex constraints (school days, contract hours) and maintaining fairness.

**Differentiator:** The "System Never Lies" philosophy. Pawly explicitly exposes staffing gaps and conflicts rather than hiding them behind "black-box" automation, ensuring the Admin always retains informed final control.

## Success Criteria

### User & Business Outcomes
*   **Planning Efficiency:** Reduce monthly planning time from 3-5 hours to **30-45 minutes** (-70% to -85%).
*   **Stability:** < 10% of shifts require modification after publication.
*   **Adoption:** > 90% of employees access the PWA via Magic Link without assistance.
*   **Trust:** > 80% of shifts confirmed via a single "declarative" slider action.

### Technical Performance
*   **Responsiveness:** Drag-and-drop interactions < 100ms (Optimistic UI).
*   **Reliability:** Zero silent failures in constraint calculation or shift generation.
*   **Speed:** Monthly schedule generation < 2 seconds.

## User Journeys

### 1. The "Tetris Negotiation" (Admin)
Sarah (Clinic Owner) opens Pawly on the 25th. She clicks "Generate Draft." In < 2s, 90% of the grid is filled. The system highlights 3 Red "Holes" (missing surgery cover) and 2 Orange "Overtime" warnings. Sarah manually adjusts a shift; the "Health Bar" turns Green. She publishes, ending the stress of the "blank page."

### 2. "Declarative Trust" (Employee)
Thomas (Vet) receives a "Planning Published" email. He clicks the Magic Link (no password) and sees his vertical timeline on mobile. Every evening, he swipes a green slider to confirm "I was here." He sees his overtime counter update instantly, feeling respected and informed.

### 3. "School First" (Apprentice)
Léa (Apprentice) declares her school weeks. Later, when Sarah tries to assign Léa a shift on a school day, the system **bounces the shift back** with a "Blocking Error." Léa’s education is protected by the system, not just human memory.

### 4. "The Impossible Case" (Resilience)
During a flu outbreak, the algorithm highlights Tuesday in Red: "0/3 Vets Available." It doesn't force a bad plan. Sarah sees the gap, calls a temp agency, adds a "Guest Vet," and the system validates the fix.

## Product Scope & Roadmap

### Phase 1: MVP (Planning & Trust)
*   **Engine:** Template-based generation + Greedy scoring algorithm.
*   **Admin UI:** Desktop "Staff-Grid" with drag-and-drop and real-time "Health Bar."
*   **Employee UI:** Mobile PWA with vertical timeline and confirmation slider.
*   **Compliance:** Mandatory "School Day" enforcement for Apprentices.
*   **Auth:** Passwordless Magic Link (Employees) + Password/JWT (Admins).

### Phase 2: Growth (Scalability)
*   **Notifications:** Real-time Web Push alerts.
*   **Multi-Tenancy:** Multi-clinic dashboard and site management.
*   **Analytics:** Advanced reporting on fairness and labor costs.
*   **Integrations:** Automated CSV/API exports for standard payroll systems.

### Phase 3: Vision (Optimization)
*   **AI Engine:** Global optimization algorithms for complex fairness balancing.
*   **Full ERP:** Managing the entire employee lifecycle (onboarding, performance).

## Domain & Technical Specifications

### Compliance & Rules
*   **GDPR:** Secure PII storage; no patient medical data.
*   **Labor Rules:** Configurable Hard Rules (Blocking) vs. Soft Rules (Warnings).
*   **Auditability:** Trackable manual overrides vs. auto-generated suggestions.

### Technical Architecture
*   **Multi-tenant Logic:** Database isolation via `clinicId`.
*   **PWA Focus:** Mobile-first touch targets (≥44px) and WCAG AA contrast.
*   **Network Resilience:** Read-only offline cache and "Zen" status indicators for network loss.

## Functional Requirements

### Access & Management
*   **FR1:** Admins manage user accounts and clinical roles.
*   **FR2:** Employees log in via single-use, 15-minute Magic Links.
*   **FR3:** Admins configure clinic-specific shift types and contract rules.

### Planning & Execution
*   **FR4:** Admins apply recurring rotation templates.
*   **FR5:** System generates draft schedules highlighting staffing "holes."
*   **FR6:** Admins adjust shifts via interactive drag-and-drop.
*   **FR7:** System blocks shifts conflicting with "Hard Rules" (Leave, School).
*   **FR8:** System flags "Soft Rule" violations (Overtime, Equity) for Admin review.
*   **FR9:** Employees confirm daily presence via a binary slider action.
*   **FR10:** System notifies employees upon schedule publication.

## Non-Functional Requirements

### Performance & Quality
*   **NFR1:** Grid interactions < 100ms perceived latency.
*   **NFR2:** Schedule generation < 2s with immediate visual loading feedback if > 1s.
*   **NFR3:** Zero silent failures; all logic exceptions must be visible to the Admin.
*   **NFR4:** 99.5% system availability; PWA must support read-only offline access via cache.
