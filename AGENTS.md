# Codex Code Instructions

## Monorepo Commands

**CRITICAL: All pnpm commands must be run from the project root, never from inside apps/ or packages/ directories.**

```bash
# Correct - from project root
pnpm dev
pnpm build
pnpm test
pnpm db:push
pnpm db:generate

# WRONG - do not cd into apps
cd apps/api && pnpm dev  # NEVER DO THIS
```

## Database

- Database is hosted on Neon.com (not Docker)
- `DATABASE_URL` is loaded from `.env` at the root
- Use `pnpm db:push` and `pnpm db:generate` from root

## Project Structure

- Monorepo managed with Turborepo + pnpm workspaces
- `apps/api` - NestJS backend
- `apps/web` - Next.js frontend
- `packages/@pawly/*` - Shared packages

## Key Files

- `docs/implementation-artifacts/sprint-status.yaml` - Sprint & Epics tracking
- `README.md` - Project overview & Setup
- `package.json` - Root scripts and workspaces

## Git Workflow

### Branch Strategy

```
main (production)
  └── develop (integration)
        ├── feature/story-X-Y-name
        └── fix/description
```

| Branch | Usage | Merge To |
|--------|-------|----------|
| `main` | Production code, always stable | - |
| `develop` | Integration branch | `main` (after QA) |
| `feature/story-*` | New stories | `develop` |
| `fix/*` | Bug fixes | `develop` |
| `hotfix/*` | Urgent prod fixes | `main` + `develop` |

### Branch Naming Convention

```bash
# Stories
feature/story-3-8-shipping-management
feature/story-4-1-order-creation

# Fixes
fix/login-safari-bug
fix/api-timeout-error

# Hotfixes
hotfix/critical-payment-error
```

### Codex Branch Prefix

When creating branches from Codex, prefix with `codex/` and then apply the naming convention above.

```bash
codex/feature/story-3-8-shipping-management
codex/fix/login-safari-bug
```

### Workflow Commands

```bash
# Start new story - ALWAYS create feature branch first
git checkout develop
git pull origin develop
git checkout -b feature/story-X-Y-name

# During development
git add .
git commit -m "feat: implement X for story Y"

# When done - create PR to develop
git push -u origin feature/story-X-Y-name
gh pr create --base develop

# After PR merged - cleanup
git checkout develop
git pull origin develop
git branch -d feature/story-X-Y-name
```

### Tags (Semantic Versioning)

```bash
# After epic completion - tag on main
git checkout main
git tag -a vX.Y.0 -m "Epic X: Description"
git push origin vX.Y.0
```

| Version | When |
|---------|------|
| `vX.0.0` | Major release / breaking changes |
| `v1.X.0` | New epic completed |
| `v1.2.X` | Bug fixes / patches |

### Protected Branches

- `main` - Requires PR, no direct commits
- `develop` - Requires PR from feature branches

### CRITICAL RULES

1. **NEVER commit directly to main or develop**
2. **ALWAYS create feature branch before starting story**
3. **ALWAYS run tests before creating PR**
4. **Tag releases on main after merging from develop**
