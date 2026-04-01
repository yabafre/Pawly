<div align="center">
  <h1>🐾 Pawly</h1>
  <p><strong>The all-in-one SaaS management platform for veterinary clinics.</strong></p>
  
  [![Website](https://img.shields.io/website?url=https%3A%2F%2Fpawly.app&up_message=online&down_message=offline&style=flat-square)](https://pawly.app)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
</div>

<br />

**Pawly** is designed to transform the daily management of veterinary clinics. Unlike rigid traditional tools, Pawly offers an approach centered on team well-being (fair scheduling) and operational efficiency (real-time monitoring).

---

## 🚀 Core Features

- **👥 Personnel Management**: Centralized HR data, contract management (Apprentices, CDI), and skills tracking.
- **📅 Intelligent Scheduling**: Greedy algorithm for automatic schedule generation respecting school constraints, availabilities, and legal rules.
- **⚙️ Administration & Arbitration**: Real-time Health Bar supervision, intuitive Drag & Drop for manual corrections, variance auditing, and validation.
- **📱 Employee Portal (PWA)**: Mobile-first schedule consultation and time tracking for effective hours.

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **API** | NestJS 11, Prisma 7, PostgreSQL (Neon) |
| **Shared Packages** | TypeScript, Zod validators |
| **Testing** | Jest |
| **Monorepo** | Turborepo, pnpm |

## 📂 Project Structure

```text
Pawly/
├── apps/
│   ├── api/           # NestJS backend API
│   └── web/           # Next.js frontend (Clinique Zen)
├── packages/
│   └── @pawly/
│       ├── types/     # TypeScript type definitions
│       ├── validators/# Shared Zod validators
│       └── zod/       # Shared Zod schemas
└── docs/              # Documentation & Implementation Artifacts
```

## 🏎️ Getting Started

### Prerequisites

- **Node.js** 22 or higher
- **pnpm** 9.0.0+
- **Neon.com** account (PostgreSQL connection)

### 1. Clone & Install

```bash
git clone https://github.com/yabafre/Pawly.git
cd Pawly
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` in the root and individual app directories. Ensure the following are set:
- `DATABASE_URL` 
- `JWT_SECRET`

### 3. Initialize Database

Database is hosted on [Neon.com](https://neon.tech). Make sure `DATABASE_URL` is configured properly.

```bash
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to Neon PostgreSQL
```

### 4. Run Development Servers

```bash
pnpm dev
```
Starts the NestJS **API** and the Next.js **Web** frontend concurrently.

## 💻 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm db:generate` | Generate Prisma client (via `@pawly/api`) |
| `pnpm db:push` | Apply migrations (via `@pawly/api`) |

## 🏗️ Architecture

### Data Flow
`Web (Next.js)` → `React Query / Fetch` → `NestJS API` → `Prisma` → `PostgreSQL`

### Key Patterns
- **Monorepo**: Turborepo orchestrates builds, enabling seamless caching and execution.
- **Type-Safety**: End-to-end type safety using shared `@pawly/types` inferred from Zod schemas.
- **Modular Design**: The API is partitioned by business domains (Staff, Scheduling, Auth).

## 📝 Development Guidelines

### Git Workflow & Branching
All development happens through feature branches, merged via Pull Requests to `develop`.
- **Protected Branches**: `main` (Production) and `develop` (Integration).
- **Naming Convention**: `feature/story-X-Y-name`, `fix/bug-name`, `hotfix/critical-issue`.

### Commit Conventions
We follow [Conventional Commits](https://www.conventionalcommits.org/):
```text
type(scope): description

feat(planning): add greedy algorithm for scheduling
fix(auth): correct jwt token expiration
```
*Types:* `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

## 📄 License

Private - All rights reserved.
