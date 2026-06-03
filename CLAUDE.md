# Claude Code Instructions

<!-- APED:START -->
## APED Method — disciplined user-driven pipeline

Pipeline: **Analyze → PRD → UX → Architecture → Epics → Story → Dev → Review**.

### Skill invocation

If there's **even a 1% chance** an APED skill applies, invoke it via the Skill tool. Use
natural-language phrases ("create the prd", "review this branch", "kick off dev") — the
runtime routes by the skill's `description:`. Do not paraphrase what you think the skill would say.

User instructions in CLAUDE.md or `.aped/config.yaml` override skill defaults. Record
overrides; don't bake them into new skills.

Full catalog: `.aped/skills/SKILL-INDEX.md`.

### APED rules

- **No auto-chain.** Each skill ends with "Run aped-X when ready." Wait for user.
- **Gates are mandatory.** When a skill says "⏸ HALT" or "⏸ GATE", wait for explicit user
  confirmation regardless of harness auto-mode. Auto-mode never bypasses APED gates.
- **Validate before persisting** to `docs/`.
- **Story-driven dev.** No code without a story file. Use `aped-story` first.
- **Frontend = visual verification.** Use `mcp__react-grab-mcp__get_element_context` at every GREEN.

### State

- Engine: `.aped/` (immutable) · Artifacts: `docs/` (evolves)
- State: `docs/state.yaml` · Lessons: `docs/lessons.md`
- Project: pawly (Alex, french)
<!-- APED:END -->

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

- Database is hosted on **Neon.com** (not Docker)
- `DATABASE_URL` is loaded from `.env` at the root
- Use `pnpm db:push` and `pnpm db:generate` from root

## Project Structure

- Monorepo managed with Turborepo + pnpm workspaces
- `apps/api` - NestJS backend
- `apps/web` - Next.js frontend
- `packages/@pawly/*` - Shared packages

## Key Files (APED docs/)

- `docs/INDEX.md` - APED doc index (regenerate with the `aped-purge` skill)
- `docs/prd.md` - Product Requirements Document
- `docs/architecture.md` - Technical architecture (APED 9-phase format)
- `docs/epics.md` - Epic + story breakdown with FR Coverage Map
- `docs/ux/` - UX spec shards (design-spec, screen-inventory, components, flows)
- `docs/stories/` - Per-story specs (APED story schema)
- `docs/retros/` - Epic retrospectives
- `docs/reference/` - Tech-specs & planning-algorithm reference (allowlisted)
- `docs/state.yaml` - APED pipeline state

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

### Current Tags

- `v0.11.3` - APED docs migration + planning/UI hardening (latest)
- `v0.11.2`, `v0.11.0`, `v0.10.x` - prior releases
- `v0.3.0` - Epic 3: Product Catalog Management complete

Full history: `git tag -l 'v*' | sort -V`.

### Protected Branches

- `main` - Requires PR, no direct commits
- `develop` - Requires PR from feature branches

### CRITICAL RULES

1. **NEVER commit directly to main or develop**
2. **ALWAYS create feature branch before starting story**
3. **ALWAYS run tests before creating PR**
4. **Tag releases on main after merging from develop**