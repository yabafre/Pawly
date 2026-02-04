---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
workflowType: architecture
lastStep: 8
status: complete
completedAt: '2026-02-02'
lastEdited: '2026-02-04'
editHistory:
  - date: '2026-02-04'
    changes: 'Epic reordering (Option B). Updated Implementation Sequence (12-step). Added Clinic model, No Self-Registration principle, pre-checkout form + magic link to Subscription Flow. Updated Requirements to Structure Mapping. clinicId resolved from DB.'
  - date: '2026-02-04'
    changes: 'Added i18n (next-intl), Stripe subscriptions, landing page, updated tooling/MCP, corrected Next.js 16.1.6'
project_name: Pawly
user_name: Alex
date: '2026-02-02'
---


## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
18 FRs identified covering access management (FR1-FR3), planning generation (FR4-FR8), employee validation (FR9-FR10), internationalization (FR11), landing page (FR12), subscription/billing (FR13-FR16), webhook-driven registration (FR17), and post-checkout onboarding (FR18). Architecturally, this requires a clear separation between the planning engine (server-side generation), the interactive grid (client-side refinement), and the acquisition/billing layer (Stripe-delegated). Registration is exclusively via Stripe Checkout webhook — no self-registration endpoint exists.

**Non-Functional Requirements:**
22 NFRs covering responsiveness (NFR1: <100ms), reliability (NFR3: zero silent failures), PWA capabilities (NFR4: offline cache), payment security (NFR18-NFR19), i18n performance (NFR20), and landing page performance (NFR21-NFR22). This drives a need for robust state management, "Optimistic UI" pattern, and strict Stripe webhook verification.

**Scale & Complexity:**
- Primary domain: Veterinary Resource Management (HR/SaaS).
- Complexity level: Medium-High.
- Estimated architectural components: Auth service, Planning Engine, Staff-Grid UI, Multi-tenant DB layer (Clinic FK), Stripe Billing layer, i18n routing layer, Landing page (SSG), Onboarding wizard.

### Technical Constraints & Dependencies
- Multi-tenant isolation via `clinicId` (proper FK to `Clinic` model).
- No medical patient data (GDPR focus on PII).
- No self-registration endpoint — account creation via Stripe webhook only.
- Login resolves `clinicId` from DB (not from client input). `NEXT_PUBLIC_CLINIC_ID` eliminated.
- Use of shadcn/ui and Tailwind v4 for the "Clinique Zen" aesthetic.

### Cross-Cutting Concerns Identified
- Real-time validation feedback loop (Health Bar).
- Magic Link authentication lifecycle.
- Offline read-only access for employees.
- Locale detection and i18n routing (proxy layer).
- Subscription status gating (auth + billing guard).
- Stripe webhook idempotency (event deduplication).

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._


## Starter Template Evaluation

### Primary Technology Domain
**Web application / PWA** based on "Clinique Zen" requirements and the need for offline mode for veterinary staff.

### Starter Options Considered

1. **Native Next.js 16 CLI (`create-next-app@latest`)**
   - **Advantages:** Most up-to-date official configuration, native Tailwind CSS (v4) support, App Router, and simplified `manifest.ts` integration.
   - **Disadvantages:** Requires manual Service Worker configuration if complex caching strategies are needed.

2. **Next.js + `next-pwa`**
   - **Advantages:** Complete Service Worker and Workbox automation. Very robust for "Offline-First" mode.
   - **Disadvantages:** `next-pwa` maintenance may sometimes lag behind Next.js "canary" versions.

### Selected Starter: Custom Next.js 16 PWA Foundation

**Rationale for Selection:**
Using `create-next-app` combined with `next-pwa` (or `@serwist/next`) is ideal to ensure Next.js 16 compatibility while meeting Pawly's strict performance and offline accessibility requirements.

**Initialization Command:**

```bash
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript by default with strict checking.
- **Styling Solution:** Tailwind CSS v4 for a modern utility-first approach.
- **Build Tooling:** Turbopack (via Next.js 16) for ultra-fast builds.
- **Testing Framework:** Recommended integration of Vitest or Jest (to configure post-init).
- **Code Organization:** `src/app` structure (App Router) favoring Server Components.
- **Development Experience:** Hot Reloading, Fast Refresh, and native PWA Manifest support.


## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- **Data Flow Pattern**: Rigid flow `Page -> Client Comp -> Hook -> Zsa -> Server Action -> tRPC -> NestJS` (End-to-end type-safety).
- **Prisma 7.2.0 Schema Folders**: Modular schema (`User.prisma`, `Employee.prisma`, etc.) for easier maintenance.
- **Auth Strategy**: Exclusive Magic Link for employees (no password) and hybrid (Password/JWT + Magic Link) for admins.
- **i18n Strategy**: `next-intl` with `[locale]` prefix routing (`localePrefix: 'as-needed'`, `defaultLocale: 'fr'`). Proxy handles locale detection before auth guards.
- **Subscription Strategy**: Stripe Checkout (hosted) + Billing Portal (hosted). Server-only SDK. Webhook as single source of truth for subscription state.

**Important Decisions (Shape Architecture):**
- **Hybrid API**: tRPC for fast internal communication and Swagger/OpenAPI for REST endpoints. Stripe webhook endpoint (`/api/stripe/webhook`) uses raw body parser (not global JSON parser).
- **Background Jobs**: BullMQ + Redis for async schedule generation and Resend notifications.
- **State Management**: React Query (via Zsa) for 95% of state (Server), Zustand for UI only.
- **Landing Page**: Same Next.js app, SSG-rendered public routes with `generateStaticParams` for locales. Decoupled from app (no auth, no non-essential cookies).

### Data Architecture

- **Database**: PostgreSQL.
- **ORM**: Prisma 7.2.0 using **Schema Folders** (`packages/database/prisma/schema/`).
- **Validation**: Single source via Zod in `packages/validators`.
- **Constraints Model**: Strict distinction between `Unavailability` (Blocking) and `Preference` (Scoring/Equity).
- **Clinic Model** (`Clinic.prisma`): Central multi-tenant entity. Fields: `id` (cuid), `name`, `slug` (@unique), `onboardingCompleted` (Boolean, default false), `createdAt`, `updatedAt`. All business entities reference `Clinic.id` as FK (replaces orphaned string `clinicId`). Created exclusively via `checkout.session.completed` webhook.
- **Subscription Model** (`Subscription.prisma`): 1:1 with `Clinic` (via `clinicId` FK, @unique). Fields: `stripeCustomerId`, `stripeSubscriptionId`, `status` (enum: `trialing`, `active`, `past_due`, `canceled`, `unpaid`), `planKey` (internal: `starter`, `pro`, etc.), `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEnd`.
- **Entitlement Model**: `entitlementTier` field on Subscription to gate features. Required for safely adding paid features later without breaking 100% promo users.
- **Stripe Event Deduplication** (`StripeEvent.prisma`): Store `event.id` to ensure webhook idempotency. Reject duplicate events before processing.

### Authentication & Security

- **Employee**: Magic Link (TTL 15min, single use, hashed). Long session adapted for mobile.
- **Admin**: Password + JWT by default.
- **Login Flow**: Email-only login. `clinicId` resolved from `User` record via `findUnique({ email })`. No `clinicId` in login schemas. No `NEXT_PUBLIC_CLINIC_ID` environment variable. JWT payload includes resolved `clinicId`.
- **No Self-Registration**: No `register()` endpoint. Account creation happens exclusively via `checkout.session.completed` Stripe webhook (creates Clinic + Admin + Subscription, sends Magic Link).
- **Onboarding Guard**: After first login, admin routes check `Clinic.onboardingCompleted`. If `false`, redirect to `/admin/onboarding`.
- **Pattern**: Systematic Zod validation at Server Actions level (Zsa).
- **Subscription Guard**: Admin routes require both auth AND active subscription AND completed onboarding. Check performed in `admin/layout.tsx` server-side. Source of truth = Stripe subscription status in DB (synced via webhooks).
- **Stripe Webhook Security**: HMAC signature verification via `stripe.webhooks.constructEvent()`. Raw body parser applied ONLY to `/api/stripe/webhook` route (not global). Idempotency enforced via `StripeEvent` table.
- **Landing Page Isolation**: No authentication, no session cookies, no non-essential cookies on public routes (`/`, `/pricing`, etc.).

### API & Communication Patterns

- **Communication**: tRPC Router within NestJS.
- **Internal Flow**: `Zsa Hooks` -> `Server Action` -> `tRPC Client` -> `NestJS Controller/Service`.
- **Notifications**: Resend + React Email for publications and access.

#### tRPC Routers

- **Naming Convention**: `{resource}.{action}` (e.g., `employees.list`, `planning.generate`, `stripe.createCheckoutSession`).
- **Input Validation**: All tRPC procedures MUST validate input via Zod schemas imported from `@pawly/validators`.
- **Location**: `apps/api/src/trpc/` with one router file per domain.

#### Swagger/OpenAPI Documentation (Mandatory)

Every REST API endpoint MUST have Swagger decorators. This is **not optional**.

**Rules:**
- Every controller needs `@ApiTags()`.
- Every endpoint needs `@ApiOperation()` + `@ApiResponse()` for all status codes (200, 400, 401, 403, 404, 500).
- Every protected endpoint needs `@ApiBearerAuth('JWT-auth')`.
- Create DTO classes with `@ApiProperty()` for all request/response bodies.
- Swagger UI available at `/docs` endpoint.
- The Stripe webhook controller is the ONLY exception (no Swagger decorators needed for webhook ingestion).

#### Shared Packages

- **@pawly/validators**: Shared Zod schemas used by both tRPC input validation and Zsa Server Action validation. Single source of truth for data shape.
- **@pawly/types**: Shared TypeScript types and interfaces.
- **@pawly/zod**: Shared Zod instance (single instance across monorepo to avoid version mismatches).

### Frontend Architecture

- **Patterns**: Next.js 16.1.6 App Router with PWA (`next-pwa`).
- **Components**: Local separation (`_components`) vs global (`components`).
- **UI**: Tailwind CSS 4 + shadcn/ui with "Clinique Zen" aesthetic.
- **i18n**: `next-intl` with `[locale]` dynamic segment. Config in `src/i18n/routing.ts`. Messages in `src/i18n/messages/{fr,en}.json`. Versioned translation files only (no dynamic CMS).
- **Proxy Order**: `next-intl` proxy handles locale detection/redirect FIRST. Auth guards and subscription checks happen in route layouts (server-side), not in the proxy.
- **Proxy Matcher**: Excludes `/api`, `/trpc`, `/_next`, `/_vercel`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, and all files with dots.
- **Landing Page (SSG)**: `app/[locale]/page.tsx` (home) and `app/[locale]/pricing/page.tsx` pre-rendered with `generateStaticParams` for `['fr', 'en']`. SEO metadata per locale with `alternates.languages` for hreflang. `sitemap.xml` and `robots.txt` at root.
- **Locale Routing**: `defaultLocale: 'fr'` with `localePrefix: 'as-needed'` → `/` = FR, `/en` = EN.

### UI Component Libraries (Required)

- **dnd-kit**: Accessible drag-and-drop for Staff-Grid (FR6).
- **framer-motion**: Health Bar animations and micro-interactions.
- **sonner**: Toast notifications for "System Never Lies" feedback protocol.
- **@tanstack/react-form**: Form state management for login and absence requests.
- **next-intl**: Internationalization (FR/EN) with App Router, ICU message syntax, locale-aware formatting.

### Server-Side Libraries (Required)

- **stripe** (v19.x): Stripe Node SDK for Checkout Sessions, Billing Portal, Coupons, and webhook handling. Server-only (NestJS).
- **@stripe/stripe-js**: NOT required (Stripe Checkout is hosted, no client-side Stripe.js needed).

### Decision Impact Analysis

**Implementation Sequence (12-step, aligned with Epic order):**
1. ✅ Prisma Migration (Schema Folders) + Core models — *Epic 1, Story 1.1 DONE*.
2. ✅ NestJS + tRPC + Zsa Foundation — *Epic 1, Story 1.1 DONE*.
3. ✅ Magic Link Authentication (JWT + Magic Link backend + Login UI) — *Epic 1, Stories 1.2–1.3 DONE*.
4. Clinic, Subscription & StripeEvent Prisma models (proper FK) — *Epic 1, Story 1.4*.
5. Auth Refactor (remove clinicId from login, resolve from DB, eliminate NEXT_PUBLIC_CLINIC_ID) — *Epic 1, Story 1.5*.
6. i18n setup (next-intl routing, proxy, translation files) — *Epic 2, Stories 2.1–2.2*.
7. Stripe integration (NestJS module, webhooks, Checkout = Registration, Magic Link on signup) — *Epic 3, Stories 3.1–3.2*.
8. Post-checkout onboarding wizard — *Epic 3, Story 3.3*.
9. Subscription management (Billing Portal, promos, access control) — *Epic 3, Stories 3.4–3.6*.
10. Landing page + Pricing page with pre-checkout form (SSG, SEO) — *Epic 4, Stories 4.1–4.2*.
11. Staff Management & Clinic Configuration — *Epic 5, Stories 5.1–5.6*.
12. Planning Engine, Admin Arbitration, Employee PWA — *Epics 6–8*.

**Cross-Component Dependencies:**
- The planning engine depends on employee declarative constraints and admin templates.
- Subscription gating depends on Stripe webhooks being operational before admin routes are protected.
- i18n proxy must be configured before any page routing works correctly.
- Landing page depends on i18n and Stripe pricing being defined.
- Onboarding wizard depends on Clinic model (Story 1.4) and i18n routing (Story 2.1).
- Auth refactor (Story 1.5) depends on Clinic model (Story 1.4).

**Subscription Flow (Registration = Stripe Checkout):**
```
Pricing Page → Pre-checkout form (clinic name, admin name, admin email)
  → API creates Checkout Session (metadata: clinic info)
  → Redirect to Stripe hosted Checkout
  → Payment OK → Webhook `checkout.session.completed`
  → Create Clinic + Admin User + Subscription
  → Send Magic Link email to new admin
  → Admin clicks link → Authenticated → Onboarding wizard
  → Configure clinic (hours, days, shifts) → Dashboard ready
```

**Promo 100% Flow:**
```
Pricing Page → Enter promo code → Pre-checkout form → Checkout with coupon
  → Webhook confirms $0 sub → Clinic created with entitlementTier matching plan
  → Full access at $0 → Magic Link email sent → Onboarding wizard
  → Promo tracked via Stripe metadata (type=partner|internal|lifetime)
```


## Implementation Patterns & Consistency Rules

### Tooling Rules

#### Pre-Implementation (Mandatory)
- **Documentation First**: Agents MUST use MCP `context7` to verify up-to-date documentation for Prisma, NestJS, tRPC, Zsa, next-intl, and Stripe before any implementation.
- **Context Awareness**: Each action must be preceded by reading configuration files (`turbo.json`, `package.json`, `pnpm-workspace.yaml`).

#### Post-Implementation (Mandatory)
- **Verification**: After each code change, build commands (`turbo build`), linting and type-checking (`tsc`) must be executed.

### Mandatory Skills
All agents working on this project must activate and follow instructions from the following skills:
- **turborepo**: Monorepo and build pipeline management.
- **vercel-react-best-practices**: React/Next.js performance optimization.
- **frontend-design**: Creation of polished and modern interfaces ("Clinique Zen" aesthetic).
- **web-design-guidelines**: Accessibility and user experience compliance.
- **agent-browser**: Automated testing and visual component validation.

### MCP Servers
- **context7**: Up-to-date documentation retrieval for all libraries. Required before implementation.
- **fast-filesystem**: Fast file operations for bulk reads and writes.

### Plugins
- **stripe** (Claude plugin): Stripe best practices, test card numbers, error code explanations. Use during Stripe integration development.

### Naming Patterns
- **Database (Prisma)**: Tables in singular `PascalCase` (e.g., `Employee`). Columns in `camelCase` (e.g., `contractType`).
- **Files**:
  - Components: `PascalCase` (`StaffGrid.tsx`).
  - Hooks: `camelCase` with `use` prefix (`usePlanning.ts`).
  - Actions: `kebab-case` (`auth-actions.ts`).
- **Code**: Classes/Types in `PascalCase`, Functions/Variables in `camelCase`. Constants in `SCREAMING_SNAKE`.
- **API (tRPC/REST)**: tRPC procedures in `camelCase` (`employees.list`), REST routes in plural `kebab-case`.

### Structure Patterns

**Route-Local (underscore prefix):**
- `_components/`: Route-local components.
- `_hooks/`: Route-local hooks.
- `_actions/`: Route-local Server Actions (`'use server'`).

**Global Shared (no prefix):**
- `components/`: Global shared components (shadcn/ui, layout primitives).
- `lib/hooks/`: Global shared hooks (reusable across routes).
- `lib/`: tRPC client, utilities, helpers.
- `stores/`: Zustand stores (UI state only).

**Backend Modularity:**
- One file per Prisma model in `packages/database/prisma/schema/`.
- One NestJS module per domain (`auth/`, `employees/`, `planning/`, `stripe/`).

### Format Patterns
- **API Response**: Typed format via tRPC.
- **Data Exchange**: `camelCase` for JSON. Dates as ISO strings.
- **Error Handling**: Using `Zod` (validation) and `Zsa` (typed errors).

### Data Flow Pattern (CRITICAL)

```
Page (RSC)
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

This flow is **non-negotiable**. No shortcuts (e.g., calling tRPC directly from a client component).

### Zsa + React Query Usage (CRITICAL)

- `useServerActionQuery` for all reads.
- `useServerActionMutation` for all writes.
- `useServerActionInfiniteQuery` for paginated lists.
- **ALWAYS invalidate queries after mutations.** Use `QueryKeyFactory` pattern for consistent cache keys across the app.
- `@tanstack/react-form` for form state (login, absence requests, clinic config). NOT Zustand, NOT local useState for form data.

### Server Action Rules (CRITICAL)

- Mark with `'use server'` directive at the top of the file.
- Place in `_actions/` folder within the route (e.g., `admin/planning/_actions/planning-actions.ts`).
- Import tRPC client and call API methods. Server Actions are the ONLY bridge between Next.js and NestJS.
- Handle errors with try/catch, return typed responses. Never throw untyped errors.
- Validate inputs with Zod schemas from `@pawly/validators` via Zsa.

### State Management (CRITICAL)

- **React Query (via Zsa):** Server state (95%+). Use `QueryKeyFactory` for consistent key management. All server data MUST go through Zsa hooks.
- **Zustand (Minimal):** UI state ONLY (sidebar open/closed, modals, theme, locale override). **NEVER store server data in Zustand.** Keep stores in `src/stores/`.
- **Events**: BullMQ for async tasks (schedule generation, email sending).


## Project Structure & Boundaries

### Complete Project Directory Structure

```text
Pawly/
├── apps/
│   ├── web/ (Next.js 16.1.6 PWA)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   └── [locale]/ (i18n - next-intl)
│   │   │   │       ├── layout.tsx (root locale layout)
│   │   │   │       ├── page.tsx (LANDING - public, SSG)
│   │   │   │       ├── pricing/
│   │   │   │       │   └── page.tsx (PRICING - public, SSG)
│   │   │   │       ├── (auth)/
│   │   │   │       │   └── login/
│   │   │   │       │       ├── _actions/
│   │   │   │       │       ├── _components/
│   │   │   │       │       ├── _hooks/
│   │   │   │       │       └── page.tsx
│   │   │   │       ├── admin/ (PROTECTED: auth + subscription + onboarding guard)
│   │   │   │       │   ├── layout.tsx (auth + subscription + onboarding check)
│   │   │   │       │   ├── onboarding/
│   │   │   │       │   │   └── page.tsx (clinic config wizard - Story 3.3)
│   │   │   │       │   ├── planning/
│   │   │   │       │   │   ├── _actions/
│   │   │   │       │   │   ├── _components/
│   │   │   │       │   │   ├── _hooks/
│   │   │   │       │   │   └── page.tsx
│   │   │   │       │   ├── employees/
│   │   │   │       │   └── billing/
│   │   │   │       │       └── page.tsx (Stripe Portal redirect)
│   │   │   │       └── dashboard/ (PROTECTED: auth employee)
│   │   │   │           └── page.tsx
│   │   │   ├── i18n/
│   │   │   │   ├── routing.ts (defineRouting config)
│   │   │   │   ├── request.ts (getRequestConfig)
│   │   │   │   └── messages/
│   │   │   │       ├── fr.json
│   │   │   │       └── en.json
│   │   │   ├── components/ (Global UI - shadcn)
│   │   │   ├── lib/
│   │   │   │   ├── hooks/ (Global shared hooks)
│   │   │   │   ├── trpc/ (tRPC client config)
│   │   │   │   └── utils/ (Utilities, helpers)
│   │   │   └── stores/ (Zustand - UI state ONLY)
│   │   ├── public/ (Manifest, Icons, robots.txt)
│   │   ├── proxy.ts (next-intl locale routing - Next.js 16+ proxy)
│   │   └── next.config.js
│   └── api/ (NestJS - Unique Database Owner)
│       ├── src/
│       │   ├── auth/ (Magic Link, JWT)
│       │   ├── employees/
│       │   ├── planning/ (Algorithm Greedy)
│       │   ├── stripe/ (NEW)
│       │   │   ├── stripe.module.ts
│       │   │   ├── stripe.service.ts
│       │   │   └── stripe-webhook.controller.ts (raw body, HMAC verify)
│       │   ├── trpc/ (Router & Procedures)
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── prisma/
│       │   ├── schema/ (Schema Folders)
│       │   │   ├── User.prisma
│       │   │   ├── Employee.prisma
│       │   │   ├── Planning.prisma
│       │   │   ├── Clinic.prisma (multi-tenant root entity)
│       │   │   ├── Subscription.prisma (1:1 with Clinic)
│       │   │   └── StripeEvent.prisma (webhook idempotency)
│       │   └── seed.ts
│       └── test/ (Vitest)
├── packages/
│   ├── validators/ (@pawly/validators - Shared Zod schemas)
│   ├── types/ (@pawly/types - Shared TypeScript types)
│   ├── zod/ (@pawly/zod - Shared Zod single instance)
│   └── config/ (Shared ESLint/TS configs)
├── turbo.json
├── pnpm-workspace.yaml
└── docker-compose.yml (Postgres, Redis)
```

### Architectural Boundaries

- **Database Isolation**: `apps/api` is the sole owner of the Prisma instance. Any DB interaction from `apps/web` must go through tRPC.
- **Shared Consistency**: `@pawly/*` packages provide shared types, validation schemas and Zod instances to ensure the interface contract is respected across the monorepo.

### Requirements to Structure Mapping

- **Epic 1: Technical Foundation** -> `apps/api/src/auth`, `apps/web/src/app/[locale]/(auth)/login`, `prisma/schema/Clinic.prisma`, `prisma/schema/Subscription.prisma`, `prisma/schema/StripeEvent.prisma`.
- **Epic 2: i18n (FR11)** -> `apps/web/src/i18n/`, `proxy.ts`, `messages/{fr,en}.json`.
- **Epic 3: Stripe + Registration (FR13, FR17, FR18)** -> `apps/api/src/stripe/`, `apps/web/src/app/[locale]/admin/billing/`, `apps/web/src/app/[locale]/admin/onboarding/`.
- **Epic 4: Landing Page (FR12)** -> `apps/web/src/app/[locale]/page.tsx` & `pricing/page.tsx` (SSG, pre-checkout form).
- **Epic 5: Staff Management** -> `apps/api/src/employees` & `apps/web/src/app/[locale]/admin/employees`.
- **Epic 6: Planning Engine** -> `apps/api/src/planning/planning.algorithm.ts`.
- **Epic 7: Admin Arbitration** -> `apps/web/src/app/[locale]/admin/planning/` (drag-and-drop, Health Bar).
- **Epic 8: Employee PWA** -> `apps/web/src/app/[locale]/dashboard/` (mobile, offline, presence).
- **NFR18-NFR19: Payment Security** -> `apps/api/src/stripe/stripe-webhook.controller.ts` (HMAC) & `StripeEvent.prisma` (idempotency).


## Architecture Validation Results

### Coherence Validation ✅
The architecture is coherent: Prisma isolation in `apps/api` and tRPC usage ensure a clear separation of responsibilities. Stripe integration is server-only with webhook-driven state sync. i18n routing is proxy-first with auth/subscription guards at layout level.

### Requirements Coverage Validation ✅
All 18 FRs and 22 NFRs are mapped to specific modules:
- FR1-FR10: Planning, Auth, Employee modules (original scope).
- FR11: `next-intl` i18n layer.
- FR12: SSG landing page routes.
- FR13-FR16: Stripe module (NestJS) + billing routes (Next.js).
- FR17: Stripe webhook handler (Clinic + Admin + Subscription creation + Magic Link).
- FR18: Onboarding wizard (`/admin/onboarding`) + `Clinic.onboardingCompleted` flag.
- NFR18-NFR19: Stripe webhook controller with HMAC + StripeEvent idempotency.
- NFR20: `next-intl` client-side locale switching.
- NFR21-NFR22: SSG + Lighthouse optimization on landing routes.

### Implementation Readiness Validation ✅
**Status:** READY FOR IMPLEMENTATION
**Confidence Level:** HIGH

**AI Agent Guidelines:**
- Follow the `Zsa -> tRPC -> NestJS` flow.
- Use MCP **context7** before each implementation.
- Activate skills: **turborepo**, **vercel-react-best-practices**, **frontend-design**, **web-design-guidelines**, **agent-browser**.
- Use **stripe** plugin for Stripe integration best practices and test cards.
- Raw body parser on `/api/stripe/webhook` ONLY. Never app-wide.
- Subscription source of truth = Stripe (via webhooks), never frontend.
- i18n proxy runs before auth guards. Auth/subscription checks in route layouts.
- No `register()` endpoint. Registration = Stripe Checkout only.
- Login resolves `clinicId` from DB. No `NEXT_PUBLIC_CLINIC_ID`.
- Admin routes check `Clinic.onboardingCompleted` and redirect to onboarding if needed.

**Implementation Sequence (see Decision Impact Analysis for full 12-step breakdown):**
1. ✅ Monorepo + Prisma + Auth (Stories 1.1–1.3 DONE).
2. Clinic/Subscription models + Auth refactor (Stories 1.4–1.5).
3. i18n (Epic 2) → Stripe + Registration + Onboarding (Epic 3) → Landing (Epic 4).
4. Staff Management (Epic 5) → Planning + Admin + PWA (Epics 6–8).
