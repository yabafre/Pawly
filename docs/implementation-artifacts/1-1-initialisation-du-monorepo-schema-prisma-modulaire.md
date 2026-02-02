# Story 1.1: Initialisation du Monorepo & Schéma Prisma Modulaire

**ID:** 1.1
**Epic:** Epic 1: Fondation du Projet & Authentification Hybride
**Status:** done
**Priority:** Critical

## Story Definition

As an administrator,
I want to initialize the Turbo monorepo structure and configure Prisma with modular schema folders,
So that the project has a solid and scalable technical foundation.

## Acceptance Criteria

- [x] **Given** an empty project directory
- [x] **When** I scaffold the monorepo with apps/api (NestJS), apps/web (Next.js 15) and packages/
- [x] **Then** the directory structure is created according to the architecture decisions
- [x] **And** Prisma is configured in `apps/api` using `prisma/schema/` folders
- [x] **And** core models (`User`, `MagicLink`) include a mandatory `clinicId` field
- [x] **And** `@pawly/validators`, `@pawly/types`, and `@pawly/zod` packages are initialized in `packages/`.

## Developer Context

### Technical Requirements
- [x] **Runtime**: Node.js 22+.
- [x] **Package Manager**: `pnpm`.
- [x] **Monorepo**: Turbo.
- [x] **Backend**: NestJS in `apps/api`.
- [x] **Frontend**: Next.js 15 (App Router) in `apps/web`.
- [x] **Database**: Prisma 7.2.0.

### Architecture Compliance
- [x] **Prisma Isolation**: Prisma lives ONLY in `apps/api`.
- [x] **Schema Folders**: Using directory-based organization.
- [x] **Multi-tenancy**: Mandatory `clinicId` field added.

### File Structure Requirements
```text
Pawly/
├── apps/
│   ├── api/ (NestJS)
│   │   ├── prisma/
│   │   │   ├── schema/
│   │   │   │   ├── base.prisma (generator & datasource)
│   │   │   │   ├── User.prisma
│   │   │   │   └── MagicLink.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   └── web/ (Next.js 15)
├── packages/
│   ├── validators/ (Zod schemas)
│   ├── types/ (TS types)
│   └── zod/ (Shared Zod instance)
├── turbo.json
└── pnpm-workspace.yaml
```

### Library & Framework Requirements
- **Prisma 7.2.0**: Enable `prismaSchemaFolder` if using an older version of v6, but v7.2.0 supports it by default.
- **Turborepo**: Use the standard Next.js + NestJS monorepo template if available, or manual scaffold.

## Implementation Guide

### Initial Scaffold
1. Initialize pnpm workspace: `pnpm init` + create `pnpm-workspace.yaml`.
2. Create `apps/api` using Nest CLI: `nest new apps/api --package-manager pnpm`.
3. Create `apps/web` using Next CLI: `npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir`.
4. Initialize Turbo: `npx turbo init`.

### Prisma Configuration (in apps/api)
1. Install Prisma: `pnpm add -D prisma` and `pnpm add @prisma/client`.
2. Create `apps/api/prisma/schema/` directory.
3. Move `generator` and `datasource` to `base.prisma`.
4. Create `User.prisma` and `MagicLink.prisma` with `clinicId`.
5. Update `package.json` in `apps/api` to point to the schema folder:
   ```json
   "prisma": {
     "schema": "prisma/schema"
   }
   ```

### Shared Packages
1. Create `packages/validators`, `packages/types`, and `packages/zod`.
2. Ensure they are correctly exported and linked in the monorepo.

## Testing Requirements
- Run `pnpm prisma validate` in `apps/api` to ensure schema folder merging works.
- Run `turbo build` to verify monorepo orchestration.

## Status History
- **2026-02-02**: Story created and analyzed via Ultimate Context Engine. Status set to `ready-for-dev`.
