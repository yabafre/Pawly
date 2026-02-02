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
project_name: Pawly
user_name: Alex
date: '2026-02-02'
---


## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
10 FRs identified covering access management, planning generation (FR4-FR8), and employee validation (FR9). Architecturally, this requires a clear separation between the planning engine (server-side generation) and the interactive grid (client-side refinement).

**Non-Functional Requirements:**
Focus on responsiveness (NFR1: <100ms), reliability (NFR3: zero silent failures), and PWA capabilities (NFR4: offline cache). This drives a need for robust state management and an "Optimistic UI" pattern.

**Scale & Complexity:**
- Primary domain: Veterinary Resource Management (HR/SaaS).
- Complexity level: Medium.
- Estimated architectural components: Auth service, Planning Engine, Staff-Grid UI, Multi-tenant DB layer.

### Technical Constraints & Dependencies
- Multi-tenant isolation via `clinicId`.
- No medical patient data (GDPR focus on PII).
- Use of shadcn/ui and Tailwind v4 for the "Clinique Zen" aesthetic.

### Cross-Cutting Concerns Identified
- Real-time validation feedback loop (Health Bar).
- Magic Link authentication lifecycle.
- Offline read-only access for employees.

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._


## Starter Template Evaluation

### Primary Technology Domain
**Web application / PWA** basé sur les exigences de "Clinique Zen" et la nécessité d'un mode hors-ligne pour le personnel vétérinaire.

### Starter Options Considered

1. **Native Next.js 15 CLI (`create-next-app@latest`)**
   - **Avantages :** Configuration officielle la plus à jour, support natif de Tailwind CSS (v4), App Router, et intégration simplifiée des `manifest.ts`.
   - **Inconvénients :** Nécessite une configuration manuelle pour le Service Worker si des stratégies de cache complexes sont nécessaires.

2. **Next.js + `next-pwa`**
   - **Avantages :** Automatisation complète du Service Worker et de Workbox. Très robuste pour le mode "Offline-First".
   - **Inconvénients :** La maintenance de `next-pwa` peut parfois accuser un léger retard sur les versions "canary" de Next.js.

### Selected Starter: Custom Next.js 15 PWA Foundation

**Rationale for Selection:**
L'utilisation de `create-next-app` combinée à `next-pwa` (ou `@serwist/next`) est idéale pour garantir la compatibilité avec Next.js 15 tout en respectant les exigences strictes de performance et d'accessibilité hors-ligne du projet Pawly.

**Initialization Command:**

```bash
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript par défaut avec vérification stricte.
- **Styling Solution:** Tailwind CSS v4 pour une approche utilitaire moderne.
- **Build Tooling:** Turbopack (via Next.js 15) pour des builds ultra-rapides.
- **Testing Framework:** Intégration recommandée de Vitest ou Jest (à configurer post-init).
- **Code Organization:** Structure `src/app` (App Router) favorisant les Server Components.
- **Development Experience:** Hot Reloading, Fast Refresh, et support natif des PWA Manifests.


## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- **Data Flow Pattern**: Flux rigide `Page -> Client Comp -> Hook -> Zsa -> Server Action -> tRPC -> NestJS` (Type-safety de bout en bout).
- **Prisma 7.2.0 Schema Folders**: Schéma modulaire (`User.prisma`, `Employee.prisma`, etc.) pour une maintenance facilitée.
- **Auth Strategy**: Magic Link exclusif pour les employés (sans mot de passe) et hybride (Mot de passe/JWT + Magic Link) pour les admins.

**Important Decisions (Shape Architecture):**
- **API Hybride**: tRPC pour la communication interne rapide et Swagger/OpenAPI pour les endpoints REST.
- **Background Jobs**: BullMQ + Redis pour la génération asynchrone des plannings et les envois via Resend.
- **State Management**: React Query (via Zsa) pour 95% du state (Server), Zustand pour l'UI uniquement.

### Data Architecture

- **Database**: PostgreSQL.
- **ORM**: Prisma 7.2.0 utilisant **Schema Folders** (`packages/database/prisma/schema/`).
- **Validation**: Source unique via Zod dans `packages/validators`.
- **Modèle de Contraintes**: Distinction stricte entre `Unavailability` (Bloquant) et `Preference` (Scoring/Equité).

### Authentication & Security

- **Employee**: Magic Link (TTL 15min, usage unique, haché). Session longue adaptée au mobile.
- **Admin**: Password + JWT par défaut.
- **Pattern**: Validation Zod systématique au niveau des Server Actions (Zsa).

### API & Communication Patterns

- **Communication**: tRPC Router au sein de NestJS.
- **Flux Interne**: `Zsa Hooks` -> `Server Action` -> `tRPC Client` -> `NestJS Controller/Service`.
- **Notifications**: Resend + React Email pour les publications et les accès.

### Frontend Architecture

- **Patterns**: Next.js 15 App Router avec PWA (`next-pwa`).
- **Composants**: Séparation locale (`_components`) vs globale (`components`).
- **UI**: Tailwind CSS 4 + shadcn/ui avec une esthétique "Clinique Zen".

### Decision Impact Analysis

**Implementation Sequence:**
1. Migration Prisma (Schema Folders).
2. Socle NestJS + tRPC + Zsa.
3. Authentification Magic Link.
4. Moteur de Planning (Template + Greedy Scoring).

**Cross-Component Dependencies:**
Le moteur de planning est le pivot central, dépendant des contraintes déclaratives des employés et des templates admins.


## Implementation Patterns & Consistency Rules

### Tooling & Agent Usage Rules
- **Documentation First**: Les agents DOIVENT utiliser `context7` pour vérifier les documentations à jour de Prisma, NestJS, tRPC et Zsa avant toute implémentation.
- **Verification Mandatory**: Après chaque changement de code, les commandes de build (`turbo build`), linting et type-checking (`tsc`) doivent être exécutées.
- **Context Awareness**: Chaque action doit être précédée d'une lecture des fichiers de configuration (`turbo.json`, `package.json`, `pnpm-workspace.yaml`).

### Mandatory Skill Sets
Tous les agents intervenant sur ce projet doivent activer et suivre les instructions des skills suivants :
- **turborepo** : Gestion du monorepo et des pipelines de build.
- **vercel-react-best-practices** : Optimisation des performances React/Next.js.
- **frontend-design** : Création d'interfaces polies et modernes (esthétique "Clinique Zen").
- **web-design-guidelines** : Respect de l'accessibilité et de l'expérience utilisateur.
- **agent-browser** : Tests automatisés et validation visuelle des composants.

### Naming Patterns
- **Database (Prisma)**: Tables en `PascalCase` singulier (ex: `Employee`). Colonnes en `camelCase` (ex: `contractType`).
- **Files**:
  - Composants : `PascalCase` (`StaffGrid.tsx`).
  - Hooks : `camelCase` avec préfixe `use` (`usePlanning.ts`).
  - Actions : `kebab-case` (`auth-actions.ts`).
- **Code**: Classes/Types en `PascalCase`, Fonctions/Variables en `camelCase`. Constantes en `SCREAMING_SNAKE`.
- **API (tRPC/REST)**: Procédures tRPC en `camelCase` (`employees.list`), routes REST en `kebab-case` pluriel.

### Structure Patterns
- **Local vs Global**: Préfixe `_` pour tout ce qui est local à une route (ex: `_components/`, `_actions/`).
- **Modularity**: Un fichier par modèle Prisma dans `packages/database/prisma/schema/`.

### Format Patterns
- **API Response**: Format typé via tRPC.
- **Data Exchange**: `camelCase` pour le JSON. Dates en chaînes ISO.
- **Error Handling**: Utilisation de `Zod` (validation) et `Zsa` (erreurs typées).

### Communication & State Patterns (CRITICAL)
- **Data Flow**: `Page -> Client Component -> Hook -> Zsa -> Server Action -> tRPC Client -> NestJS API`.
- **State**: `React Query` (via Zsa) pour 95%+ du state (Server). `Zustand` pour l'UI uniquement.
- **Events**: BullMQ pour les tâches asynchrones.


## Project Structure & Boundaries

### Complete Project Directory Structure

```text
Pawly/
├── apps/
│   ├── web/ (Next.js 15 PWA)
│   │   ├── src/
│   │   │   ├── app/ (App Router)
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/
│   │   │   │   │   │   ├── _actions/ (Zsa Server Actions)
│   │   │   │   │   │   ├── _components/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   ├── admin/
│   │   │   │   │   ├── planning/
│   │   │   │   │   │   ├── _actions/
│   │   │   │   │   │   ├── _components/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── employees/
│   │   │   │   ├── dashboard/ (Employee Portal)
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── components/ (Global UI - shadcn)
│   │   │   ├── hooks/ (Global Hooks)
│   │   │   ├── lib/ (tRPC client, utils)
│   │   │   └── stores/ (Zustand)
│   │   ├── public/ (Manifest, Icons)
│   │   └── next.config.js
│   └── api/ (NestJS - Unique Database Owner)
│       ├── src/
│       │   ├── auth/ (Magic Link, JWT)
│       │   ├── employees/
│       │   ├── planning/ (Algorithm Greedy)
│       │   ├── trpc/ (Router & Procedures)
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── prisma/
│       │   ├── schema/ (Schema Folders)
│       │   │   ├── User.prisma
│       │   │   ├── Employee.prisma
│       │   │   └── Planning.prisma
│       │   └── seed.ts
│       └── test/ (Jest)
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

- **Database Isolation**: `apps/api` est le seul détenteur de l'instance Prisma. Toute interaction avec la DB par `apps/web` doit passer par tRPC.
- **Shared Consistency**: Les packages `@pawly/*` fournissent les types, schémas de validation et instances Zod communs pour garantir que le contrat d'interface est respecté sur tout le monorepo.

### Requirements to Structure Mapping

- **Epic: Authentication** -> `apps/api/src/auth` & `apps/web/src/app/(auth)/login`.
- **Epic: Planning Engine** -> `apps/api/src/planning/planning.algorithm.ts`.
- **Epic: Employee Management** -> `apps/api/src/employees` & `apps/web/src/app/admin/employees`.


## Architecture Validation Results

### Coherence Validation ✅
L'architecture est cohérente : l'isolation de Prisma dans `apps/api` et l'utilisation de tRPC assurent une séparation claire des responsabilités.

### Requirements Coverage Validation ✅
Tous les besoins métiers (Planning, Auth Magic Link, Contraintes Apprentis) sont mappés à des modules spécifiques.

### Implementation Readiness Validation ✅
**Status:** READY FOR IMPLEMENTATION
**Confidence Level:** HIGH

**AI Agent Guidelines:**
- Respectez le flux `Zsa -> tRPC -> NestJS`.
- Utilisez **Context7** avant chaque implémentation.
- Activez les skills **turborepo** et **frontend-design**.

**First Implementation Priority:**
Initialisation du monorepo et migration Prisma (Schema Folders) dans `apps/api`.
