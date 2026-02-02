---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
workflowType: epics-stories
lastStep: 4
status: complete
completedAt: '2026-02-02'
---

# Pawly - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Pawly, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Global Implementation Rules
- **Multi-tenancy**: Every business entity (Employee, Shift, Absence, etc.) MUST include a mandatory `clinicId`. All database queries and API procedures must be strictly filtered by this ID.
- **Tech Stack Consistency**: Use `apps/api` for the NestJS/Prisma backend. No direct DB access from `apps/web`.

### Functional Requirements

FR1: Admin Login with Password/JWT (optional Magic Link).
FR2: Employee Login via Magic Link ONLY (passwordless).
FR3: Management of Clinique Employees (Full-time, Part-time, Apprentice).
FR4: Template-based Planning Generation.
FR5: Automatic Gap Filling using Greedy Scoring Algorithm.
FR6: Blocking Constraint: School days for Apprentices (No generation if missing).
FR7: Hard Rules: Unavailability, Overlaps, Vacations (Blocking).
FR8: Soft Rules: Equity (Weekends/Tuesdays/Thursdays) and Contract Hours (Warnings).
FR9: Declarative Attendance Confirmation (Clocking).
FR10: Absence Request/Validation Workflow.

### NonFunctional Requirements

NFR1: Performance - UI responses < 100ms.
NFR2: Security - Magic Link TTL 15m, single-use, hashed in DB.
NFR3: Reliability - No silent failures in planning; explicit conflict reporting.
NFR4: Graceful offline (read-only best effort) - PWA cache for last viewed data; UI clearly indicates offline status.

### Additional Requirements

- **Starter Template**: Next.js 15 (App Router) + Tailwind 4 + shadcn/ui.
- **Backend Architecture**: NestJS with Prisma 7.2.0 (Schema Folders) isolated in `apps/api`.
- **Data Flow Pattern**: Page -> Client Component -> Hook -> Zsa -> Server Action -> tRPC Client -> NestJS API.
- **State Management**: React Query (Server) + Zustand (UI only).
- **Infrastructure**: Monorepo Turbo, Redis/BullMQ for background jobs, Resend for emails.
- **UX**: "Clinique Zen" aesthetic. Holes = dashed outline + neutral + CTA. Hard conflict = Vital Orange + icon.

### FR Coverage Map

FR1: Epic 1 - Admin Login with Password/JWT
FR2: Epic 1 - Employee Login via Magic Link ONLY
FR3: Epic 2 - Management of Clinique Employees
FR4: Epic 3 - Template-based Planning Generation
FR5: Epic 3 - Automatic Gap Filling using Greedy Scoring
FR6: Epic 3 - Blocking Constraint: School days for Apprentices
FR7: Epic 3 - Hard Rules Blocking (Unavailability, Overlaps)
FR8: Epic 4 - Soft Rules Warning (Equity, Contract Hours)
FR9: Epic 5 - Declarative Attendance Confirmation (Clocking)
FR10: Epic 4 - Absence Request/Validation Workflow

## Epic List

### Epic 1: Fondation du Projet & Authentification Hybride
Initialisation technique du monorepo et accès sécurisé (Password/JWT pour Admin, Magic Link pour Employé).
**FRs covered:** FR1, FR2.

### Epic 2: Gestion du Personnel & Profils "Clinique Zen"
Gestion des profils employés et des contraintes spécifiques (écoles, indisponibilités).
**FRs covered:** FR3.

### Epic 3: Moteur de Planification Intelligente (Template + Greedy)
Génération de plannings basée sur des templates et algorithme Greedy respectant les contraintes strictes.
**FRs covered:** FR4, FR5, FR6, FR7.

### Epic 4: Arbitrage Admin & Validation Finale
Ajustements manuels, Health Bar de planning, gestion des absences et audit de variance.
**FRs covered:** FR8, FR10.

### Epic 5: Portail Employé PWA & Pointage
Consultation mobile (cache offline) et confirmation de présence déclarative.
**FRs covered:** FR9.


## Epic 1: Fondation du Projet & Authentification Hybride

### Story 1.1: Initialisation du Monorepo & Schéma Prisma Modulaire
As an administrator,
I want to initialize the Turbo monorepo structure and configure Prisma with modular schema folders,
So that the project has a solid and scalable technical foundation.

**Acceptance Criteria:**
**Given** an empty project directory
**When** I scaffold the monorepo with apps/api, apps/web and packages/
**Then** the directory structure is created according to the architecture
**And** Prisma is configured in apps/api using `prisma/schema/` folders
**And** all core models include a mandatory `clinicId` field.

### Story 1.2: Backend d'Authentification (JWT + Magic Link Logic)
As an employee,
I want to request a Magic Link via my email and receive a secure link,
So that I can log in without a password.

**Acceptance Criteria:**
**Given** a valid employee email in the database
**When** I call the request magic link endpoint
**Then** a hashed token is stored in the database with a 15-minute TTL
**And** an email is sent via Resend containing the single-use login link.

### Story 1.3: Interface de Connexion & Flux Zsa/tRPC
As a user (Admin or Employee),
I want to use a unified login interface,
So that I can access my dashboard based on my role.

**Acceptance Criteria:**
**Given** a Next.js 15 login page using shadcn/ui
**When** I submit my credentials or request a magic link
**Then** the data flow `Client Comp -> Zsa -> Server Action -> tRPC -> API` is executed
**And** I am authenticated with a JWT and redirected to the appropriate route.

## Epic 2: Gestion du Personnel & Profils "Clinique Zen"

### Story 2.1: Gestion des Employés & Contrats (CRUD)
As an admin,
I want to manage employee profiles and their contract types,
So that the staff list is always up to date for scheduling.

**Acceptance Criteria:**
**Given** the employee management interface
**When** I create or update an employee
**Then** the data is saved in the `Employee` model via Prisma
**And** every query is strictly filtered by the authenticated user's `clinicId`.

### Story 2.2: Configuration des Contraintes Déclaratives
As an admin,
I want to define school days for apprentices and recurring unavailabilities,
So that the planning engine doesn't assign shifts during those times.

**Acceptance Criteria:**
**Given** a specific employee profile
**When** I add a "SCHOOL" or "UNAVAILABILITY" constraint
**Then** the constraints are stored in the `Unavailability` model
**And** these constraints are flagged as "Hard Rules" for the planning algorithm.

## Epic 3: Moteur de Planification Intelligente (Template + Greedy)

### Story 3.1: Définition des Templates de Planning (Admin)
As an admin,
I want to create week templates with shift types,
So that I have a baseline structure for monthly planning generation.

**Acceptance Criteria:**
**Given** the template management interface
**When** I define a standard week with staff requirements
**Then** the template is saved in the `PlanningTemplate` model via Prisma
**And** it is uniquely associated with the current `clinicId`.

### Story 3.2: Algorithme de Génération "Greedy" & Règles Bloquantes
As an admin,
I want to trigger the automatic planning generation that fills template gaps while respecting constraints,
So that I get a valid planning proposal with minimal manual effort.

**Acceptance Criteria:**
**Given** a target month and a selected template
**When** I trigger the generation
**Then** the algorithm first verifies mandatory school days for apprentices (FR6 - Blocking)
**And** it fills gaps while avoiding unavailabilities (FR7 - Hard Rules)
**And** it returns an object containing assignments, remaining holes, and detected conflicts.

### Story 3.3: Visualisation du Planning & Indicateurs de Conflits
As an admin,
I want to visualize the generated planning in an interactive grid,
So that I can immediately identify coverage issues or rule violations.

**Acceptance Criteria:**
**Given** the `StaffGrid` interactive view (Next.js 15)
**When** a planning is loaded
**Then** empty slots ("Holes") are displayed with a dashed neutral outline and a "+" CTA icon
**And** Hard Conflicts are highlighted using "Vital Orange" with an explicit error icon and message.

## Epic 4: Arbitrage Admin & Validation Finale

### Story 4.1: Ajustement Manuel du Planning (Drag & Drop)
As an admin,
I want to manually move shift assignments using drag and drop,
So that I can resolve coverage gaps.

**Acceptance Criteria:**
**Given** the interactive planning grid
**When** I drag an employee block from one slot to another
**Then** the change is saved optimistically and synced via a Server Action.

### Story 4.2: Gestion des Alertes d'Équité (Soft Rules)
As an admin,
I want to receive visual warnings if an employee exceeds contract hours or if weekend equity is not respected,
So that I can act fairly.

**Acceptance Criteria:**
**Given** a planning in edit mode
**When** a "SOFT" rule (Equity) is violated
**Then** a visual orange warning icon appears with an explanatory message.

### Story 4.3: Workflow de Demande et Validation d'Absences
As an employee or admin,
I want to submit or validate absence requests,
So that these periods are automatically blocked in the planning.

**Acceptance Criteria:**
**Given** the absence management module
**When** an absence is validated
**Then** it creates a blocking "Hard Rule" entry in the planning for that `clinicId`.

### Story 4.4: Planning Health Bar
As an admin,
I want to see a real-time summary of the planning health,
So that I know if the schedule is ready to be published.

**Acceptance Criteria:**
**Given** the planning interface
**When** I am editing or generating a schedule
**Then** a "Health Bar" component aggregates counts for holes, hard conflicts, and soft warnings
**And** the "Publish" button is disabled if any "Hard Conflicts" (Vital Orange) remain.

### Story 4.5: Admin Variance View
As an admin,
I want to compare planned shifts vs. actual confirmed attendance,
So that I can track deviations and adjust future planning or payroll.

**Acceptance Criteria:**
**Given** the admin dashboard
**When** I access the "Variance View"
**Then** I see a summary table highlighting differences between "Planned" and "Confirmed" (VarianceEvents)
**And** I can export this data as a CSV for reporting.

## Epic 5: Portail Employé PWA & Pointage

### Story 5.1: Consultation du Planning Personnel (Graceful Offline)
As an employee,
I want to consult my schedule on my phone even without internet connection,
So that I know my work hours at any time.

**Acceptance Criteria:**
**Given** an employee logged in via Magic Link
**When** the device is offline
**Then** the PWA displays the last cached version of the monthly schedule
**And** the UI clearly indicates "Offline Mode - Showing cached data".

### Story 5.2: Pointage Déclaratif (VarianceEvent Tracking)
As an employee,
I want to confirm my presence for each slot,
So that I can declare my worked hours.

**Acceptance Criteria:**
**Given** my daily schedule on the portal
**When** I confirm my presence (AM/PM toggle)
**Then** a `VarianceEvent` is created, comparing the original planned shift with the confirmation timestamp.

### Story 5.3: Installation PWA & Email Notifications
As an employee,
I want to install the application and receive email alerts when a schedule is published,
So that I stay informed.

**Acceptance Criteria:**
**Given** the Pawly portal
**When** an admin publishes a schedule
**Then** an automated email is sent via Resend to all concerned employees
**And** the PWA can be installed on the home screen (manifest.json)
**And** Push Notifications are identified as an optional "Phase 2" feature.
