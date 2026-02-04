# Pawly

**Le SaaS de gestion tout-en-un pour la "Clinique Zen" vétérinaire.**

Pawly est une plateforme conçue pour transformer la gestion quotidienne des cliniques vétérinaires. Contrairement aux outils classiques rigides, Pawly offre une approche centrée sur le bien-être des équipes (planification équitable) et l'efficacité opérationnelle (pilotage en temps réel).

## Overview

| Component | Technology |
|-----------|------------|
| **API** | NestJS 11, Prisma 7, PostgreSQL |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **Shared Packages** | TypeScript, Zod validators, shared types |
| **Testing** | Jest (API) |
| **Build** | Turborepo, pnpm |

## Project Structure

```
Pawly/
├── apps/
│   ├── api/           # NestJS backend API
│   └── web/           # Next.js frontend (Clinique Zen)
├── packages/
│   └── @pawly/
│       ├── types/     # TypeScript type definitions
│       ├── validators/# Shared Zod validators
│       └── zod/       # Shared Zod schemas
├── docs/              # Documentation & Implementation Artifacts
└── docker-compose.yml # Local services (DB, etc.)
```

## Prerequisites

- **Node.js** 22 or higher
- **pnpm** 9.0.0 (package manager)
- **Docker** and Docker Compose (for PostgreSQL)

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/yabafre/Pawly.git
cd Pawly
pnpm install
```

### 2. Configure Environment

Copy the example environment file (if available) or ensure your `.env` is set up with:
- `DATABASE_URL`
- `JWT_SECRET`
- *Note: Check individual app directories for specific `.env.example` files.*

### 3. Start Infrastructure

```bash
docker-compose up -d
```

### 4. Initialize Database

```bash
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Run migrations (dev)
```

### 5. Run Development Servers

```bash
pnpm dev
```

This starts:
- **API** (NestJS)
- **Web** (Next.js)

## Available Commands

### Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm format` | Format code with Prettier |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate Prisma client (via @pawly/api) |
| `pnpm db:push` | Apply migrations (via @pawly/api) |

## Architecture

### Data Flow

```
Web (Next.js) → React Query/Fetch → NestJS API → Prisma → PostgreSQL
```

### Key Patterns

- **Monorepo**: Turborepo orchestrates builds and tasks.
- **Type-Safety**: Shared `@pawly/types` and Zod schemas between Web and API.
- **Modular Design**: API handles business logic (Staff, Scheduling) independently.

### Shared Packages

| Package | Purpose |
|---------|---------|
| `@pawly/validators` | Zod schemas for validation |
| `@pawly/types` | TypeScript types inferred from Zod schemas |
| `@pawly/zod` | Base Zod configurations |

## Core Features

### Gestion du Personnel
- **Profils Employés**: Centralisation des données RH.
- **Contrats**: Gestion des types (Apprentis, CDI) et compétences.

### Planification Intelligente
- **Algorithme Greedy**: Génération automatique de plannings.
- **Contraintes**: Respect des écoles, disponibilités et règles légales.

### Administration & Arbitrage
- **Supervision**: Health Bar en temps réel.
- **Ajustements**: Drag & Drop intuitif pour corrections manuelles.
- **Audit**: Vue de variance et validation.

### Portail Employé (PWA)
- **Mobile First**: Consultation des plannings sur mobile.
- **Pointage**: Suivi des heures effectives.

## Development Guidelines

### Commit Message Format

```
type(scope): description

feat(planning): add greedy algorithm for scheduling
fix(auth): correct jwt token expiration
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

## License

Private - All rights reserved.
