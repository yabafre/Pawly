---
title: 'Pawly MVP - Planning & Management PWA'
slug: 'pawly-mvp-planning-pwa'
created: '2026-02-01'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Next.js 15 (App Router)'
  - 'NestJS (Latest)'
  - 'Prisma 7.2.0 (Schema Folders)'
  - 'PostgreSQL'
  - 'Tailwind CSS 4'
  - 'shadcn/ui'
  - 'tRPC (Internal API)'
  - 'Zsa (Server Actions + React Query)'
  - 'BullMQ + Redis'
  - 'Resend + React Email'
files_to_modify:
  - 'packages/database/prisma/schema.prisma'
  - 'apps/backend/src/app.module.ts'
  - 'apps/backend/src/auth/auth.service.ts'
  - 'apps/backend/src/auth/auth.controller.ts'
  - 'apps/web/src/app/layout.tsx'
code_patterns:
  - 'Monorepo (Turbo)'
  - 'Prisma Schema Folders (per model)'
  - 'Local vs Global Components (_prefix)'
  - 'Data Flow: Page -> Client Comp -> Hook -> Zsa -> Server Action -> tRPC -> NestJS'
  - 'State: React Query (Server) + Zustand (UI)'
test_patterns:
  - 'Jest (Backend)'
  - 'Playwright (E2E - TBD)'
---

# Overview

## Problem Statement
Veterinary clinics need a simplified, reliable way to manage employee schedules, absences, and time tracking. Current solutions are either too complex (generic HR software) or too manual (Excel/paper), leading to errors, missed hours, and inequitable distribution of shifts (weekends, holidays).

## Solution
"Pawly" is a PWA designed specifically for veterinary clinics, functioning as a "mini-Lucca". It offers two distinct roles: Admin (scheduling, validation) and Employee (consultation, confirmation, absence requests). The system automates planning using templates and constraints, strictly enforces "hard rules" (availability, contract types), and monitors "soft rules" (equity, contract hours) to ensure fair and valid schedules.

## Scope

### In Scope
- **User Roles:**
    - **Admin:** Password + JWT (with optional Magic Link), full scheduling control, employee management, absence validation.
    - **Employee:** Magic Link only (passwordless), simplified view for schedule consultation, shift confirmation, and absence requests.
- **Planning Module:**
    - **Algorithm:** "Template + Greedy Scoring". Admin templates provide structure; greedy algorithm fills gaps based on equity/constraints. System *proposes* a monthly schedule based on constraints if template is missing; Admin *decides* and publishes.
    - **UI:** Drag & drop manual adjustment.
    - **Rules:**
        - **Hard Rules (Blocking):** Unavailability (school, absence), incompatible shift types, overlaps, no available employees. **CRITICAL:** Generation BLOCKED if Apprentices have missing school days for the target month.
        - **Soft Rules (Warnings):** Contract hour overruns, Saturday/Weekend equity, risk days (Tuesday/Thursday).
        - **Failure Handling:** Explicit errors for impossible coverage (e.g., "Thursday 12th: 0 employees available"). No silent failures. Partial generation allowed with visual "holes".
- **Employee Management:**
    - Profiles with contract types (Full-time, Part-time, Apprentice).
    - Declarative constraints (e.g., school days for apprentices).
    - Features: View schedule, leave balance, overtime/makeup hours, declarative "clocking" (confirming AM/PM presence).
- **Absence Management:**
    - Request/Validation workflow.
    - Integration into planning (blocking).
- **Time & Variance:**
    - Shift confirmation by employees (declarative, not punch-clock).
    - Admin variance tracking (planned vs. actual).
- **Notifications:**
    - Notification on schedule publication.
    - Google Calendar sync.
    - Emails via Resend + React Email.

### Out of Scope
- Native mobile apps (iOS/Android store release).
- Complex payroll integration (beyond simple CSV export).
- Real-time time clock (punch in/out) - focused on declarative confirmation.
- Multi-tenant architecture (for this MVP iteration, focused on single clinic).

# Context for Development

## Technical Constraints & Preferences
- **Auth Strategy:**
    - **Employee:** Magic Link ONLY (TTL 15m, 1-use, hashed). Long-lived session (JWT + Refresh) suitable for personal mobile/laptop use. Auto-logout on inactivity.
    - **Admin:** Password + JWT (primary), Magic Link (optional).
- **Planning Algorithm:**
    - **Strategy:** Template + Greedy Scoring.
    - **Logic:** Template provides human structure -> Algorithm fills gaps favoring equity -> Admin arbitrates.
    - **Validation:** Never generates a false plan. Always explicit about conflicts or holes.
- **Data Model:**
    - **Prisma 7.2.0:** Use **Schema Folders** (one file per model) in `packages/database/prisma/schema`.
    - `Employee` model must support declarative constraints (JSON or related table).
- **UX/UI:**
    - Ludique and simple (shadcn/ui + Tailwind).
    - PWA-first (mobile responsive is critical).

## Architecture & Code Standards

### Data Flow Pattern (CRITICAL)
```
Dashboard Page (RSC)
  └─► Client Component
       └─► Custom Hook (usePlanning, useAlgo, etc.)
            └─► Zsa Hooks
                 ├─► useServerActionQuery (reads)
                 ├─► useServerActionMutation (writes)
                 └─► useServerActionInfiniteQuery (pagination)
                      └─► Server Action ('use server')
                           └─► tRPC Client
                                └─► NestJS API (tRPC Router)
```

### Zsa + React Query Usage
- `useServerActionQuery` for reads.
- `useServerActionMutation` for writes.
- `useServerActionInfiniteQuery` for pagination.
- **ALWAYS** invalidate queries after mutations.

### Server Actions
- Mark with `'use server'` at top.
- Place in `_actions/` folder within route.
- Import tRPC client, call API methods.
- Handle errors with try/catch, return typed responses.

### State Management
- **React Query (via Zsa):** Server state (95%+). Use `QueryKeyFactory`.
- **Zustand (Minimal):** UI state ONLY (sidebar, modals, theme). NEVER server data. Keep in `src/stores/`.

### Directory Structure (Local vs Global)
- `_components/`: Route-local components (underscore prefix).
- `_hooks/`: Route-local hooks.
- `_actions/`: Route-local Server Actions.
- `components/`: Global shared components (no prefix).
- `lib/hooks/`: Global shared hooks.

### Naming Conventions
- **Files (components):** `PascalCase` (`ProductCard.tsx`)
- **Files (hooks):** `camelCase + use` (`useProducts.ts`)
- **Files (actions):** `kebab-case` (`product-actions.ts`)
- **Classes/Types:** `PascalCase` (`ProductService`, `ProductDto`)
- **Functions/Vars:** `camelCase` (`getProductById`)
- **Constants:** `SCREAMING_SNAKE`
- **Database:** Tables `PascalCase singular`, Columns `camelCase`.
- **tRPC:** Procedures `camelCase` (`products.list`).
- **REST:** Routes `kebab-case plural`.

### Documentation & References (MANDATORY)
- **Context7:** ALWAYS use the `context7` tool/server to retrieve up-to-date documentation and code examples for any library (Prisma, NestJS, tRPC, Zsa, etc.) BEFORE implementing features. Never guess APIs.

## Existing Stack
- **Frontend:** Next.js 15 (App Router), Tailwind 4, shadcn/ui, Zsa.
- **Backend:** NestJS, Prisma 7.x, PostgreSQL, tRPC, BullMQ, Redis, Passport (JWT/Magic), Resend.
- **Shared:** Zod, `@pawly/validators`, `@pawly/types`.
- **Docs:** Swagger/OpenAPI mandatory for every endpoint.

## Files to Reference
| File | Status | Notes |
|------|--------|-------|
| `packages/database/prisma/schema/` | **Create** | Split schema into multiple files (User.prisma, Employee.prisma, etc). |
| `apps/backend/src/auth/auth.service.ts` | **Modify** | Add Magic Link generation/validation logic. |
| `apps/backend/src/employees/employees.service.ts` | **Create** | Implement CRUD and Constraint logic. |
| `apps/web/src/app/login/page.tsx` | **Modify** | Add Magic Link UI. |
| `packages/types/src/index.ts` | **Create** | Shared DTOs and Interfaces. |

# Implementation Plan

## Phase 1: Foundation & Architecture

- [ ] Task 1.1: Database Schema Migration (Prisma 7.2.0 + Schema Folders)
  - File: `packages/database/prisma/schema/` (create folder, split `schema.prisma`)
  - File: `packages/database/prisma/schema/User.prisma` (User, MagicLink models)
  - File: `packages/database/prisma/schema/Employee.prisma` (Employee, Contract, Unavailability, Preference models)
  - File: `packages/database/prisma/schema/Planning.prisma` (Shift, PlanningTemplate, Absence models)
  - Action: Refactor single `schema.prisma` into modular files. Add `MagicLink` model. **Split Constraints:** `Unavailability` (blocking types: SCHOOL, VACATION, SICK, OTHER, with recurrence) vs `Preference` (non-blocking, for scoring).
  - Notes: Ensure relations are correctly mapped. Run `prisma generate` and `prisma migrate dev`. **Use Context7 to verify Prisma 7.2 Schema Folder syntax.**

- [ ] Task 1.2: Shared Types & Validators Setup
  - File: `packages/validators/src/index.ts`
  - File: `packages/types/src/index.ts`
  - Action: Create Zod schemas for User, Employee, Shift, MagicLink. Export inferred TypeScript types.
  - Notes: These will be used by both Backend (validation) and Frontend (forms).

- [ ] Task 1.3: Backend tRPC & Swagger Foundation
  - File: `apps/backend/src/app.module.ts`
  - File: `apps/backend/src/trpc/trpc.module.ts` (create)
  - File: `apps/backend/src/trpc/trpc.router.ts` (create)
  - Action: Set up tRPC module and root router. Enable Swagger documentation for all REST endpoints (hybrid approach).
  - Notes: Ensure Swagger decorators (`@ApiTags`, `@ApiOperation`) are enforced. **Use Context7 for correct NestJS tRPC integration patterns.**

## Phase 2: Authentication (Hybrid)

- [ ] Task 2.1: Auth Backend Implementation (Magic Link + Password)
  - File: `apps/backend/src/auth/auth.service.ts`
  - File: `apps/backend/src/auth/auth.controller.ts`
  - File: `apps/backend/src/auth/magic-link.strategy.ts` (create)
  - Action: Implement `generateMagicLink` (hash token, store in DB, send email via Resend). Implement `loginWithMagicLink` (validate token, returning JWT). Keep existing Password logic for Admins.
  - Notes: Magic Link TTL = 15 mins. Token MUST be hashed in DB.

- [ ] Task 2.2: Auth Frontend Implementation
  - File: `apps/web/src/app/login/page.tsx`
  - File: `apps/web/src/app/login/_actions/auth-actions.ts`
  - File: `apps/web/src/app/login/_components/magic-link-form.tsx`
  - Action: Create UI for Magic Link request. Implement Server Action calling tRPC `auth.requestMagicLink`. Handle URL token validation on page load.
  - Notes: Follow "Critical Data Flow": Page -> Client Comp -> Zsa Action -> tRPC. **Use Context7 for Zsa + React Query best practices.**

## Phase 3: Employee Management

- [ ] Task 3.1: Employee Backend Module
  - File: `apps/backend/src/employees/employees.module.ts`
  - File: `apps/backend/src/employees/employees.service.ts`
  - File: `apps/backend/src/employees/employees.controller.ts` (for REST/Swagger)
  - File: `apps/backend/src/employees/employees.router.ts` (for tRPC)
  - Action: CRUD for Employees. Logic for `Unavailability` and `Preference` management.
  - Notes: Use `packages/validators` schemas.

- [ ] Task 3.2: Employee Frontend List & Profile
  - File: `apps/web/src/app/admin/employees/page.tsx`
  - File: `apps/web/src/app/admin/employees/_components/employee-table.tsx`
  - Action: Admin view to list employees and manage contracts/constraints.
  - Notes: Use `useServerActionQuery` to fetch data.

## Phase 4: Planning Core (Template + Greedy)

- [ ] Task 4.1: Planning Data & Logic (Backend)
  - File: `apps/backend/src/planning/planning.module.ts`
  - File: `apps/backend/src/planning/planning.service.ts`
  - File: `apps/backend/src/planning/planning.algorithm.ts` (Greedy Logic)
  - Action: Implement `generatePlanning(month, constraints)`. 
    - **Logic:** 
      1. Verify Mandatory School Days: If `Apprentice` has no school days for month -> THROW BLOCKING ERROR.
      2. Apply Template.
      3. Block Hard Rules (Unavailability). 
      4. Fill Gaps (Greedy).
    - **Return Format (Contract):** `{ assignments: [], holes: [], hardConflicts: [], softWarnings: [], scoreSummary: {} }`.
  - Notes: Failure Handling: Return list of "Unassigned Shifts" or "Conflicts" explicitly.

- [ ] Task 4.2: Planning UI (Drag & Drop)
  - File: `apps/web/src/app/admin/planning/page.tsx`
  - File: `apps/web/src/app/admin/planning/_components/planning-board.tsx`
  - Action: Calendar view (Month/Week). Drag & drop shifts. Visual indicators for warnings (Soft Rules) and errors (Hard Rules).
  - Notes: "Greedy" auto-fill button triggers Server Action. Display blocking error if generation fails due to missing school days.

## Phase 5: Employee Portal (PWA)

- [ ] Task 5.1: Mobile Dashboard & PWA Setup
  - File: `apps/web/src/app/dashboard/page.tsx`
  - File: `apps/web/src/manifest.ts`
  - Action: Simplified "My Schedule" view. Shift confirmation slider. Absence request button. PWA Manifest configuration.
  - Notes: Mobile-first design.

# Acceptance Criteria

- [ ] AC 1: Database modularity
  - Given the project is initialized, when `prisma generate` is run, then the schema from `packages/database/prisma/schema/*.prisma` should be correctly merged and client generated.
- [ ] AC 2: Magic Link Auth
  - Given an employee email, when "Send Magic Link" is clicked, then a hashed token is stored in DB and email sent via Resend.
  - Given a valid Magic Link URL, when visited, then the user is logged in and receives a long-lived JWT.
- [ ] AC 3: Data Flow Adherence
  - Given any new feature (e.g., Employee List), when implemented, then it MUST follow the path: Page -> Client Comp -> Zsa -> Server Action -> tRPC -> Backend.
- [ ] AC 4: Planning Hard Rules (Blocking)
  - Given an employee has **SCHOOL** unavailability on a date, when generating planning, then no shift can be assigned on those dates (blocking).
  - Given an **Apprentice** employee with no school days defined for the target month, when generating planning, then the process MUST fail with a specific "Missing School Days" error.
- [ ] AC 5: Planning Soft Rules
  - Given a generated schedule, when an employee exceeds contract hours, then a visual warning is displayed to the Admin, but saving is allowed.

# Dependencies
- **Resend API Key:** Required for sending magic links.
- **Redis Instance:** Required for BullMQ job queue.
- **PostgreSQL Database:** Running instance required.

# Testing Strategy
- **Unit Tests (Backend):** Jest for Services and Algorithms (especially `planning.algorithm.ts` logic).
- **Integration Tests:** API tests via Supertest for Auth and Planning endpoints.
- **Manual Verification:** PWA installability and responsiveness on mobile devices.
