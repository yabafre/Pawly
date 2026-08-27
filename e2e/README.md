# E2E & integration tests

Two suites, one shared principle: they run the **real** application against a
**disposable** database, with only the mail transport replaced.

| Suite | Runner | What it drives | Command |
|---|---|---|---|
| Integration | Jest + Supertest | The real `AppModule` over HTTP — REST routes, tRPC procedures, guards, Prisma | `pnpm test:integration` |
| E2E journeys | Playwright | A real browser against `next dev` + the API | `pnpm test:e2e` |

## The database

Both suites talk to `pawly_e2e`, a database of its own on the same Neon project
as the real data — never to `neondb`, where that data lives. Copy
`.env.e2e.example` to `.env.e2e` and set `DATABASE_URL` to it; that file is
gitignored because the connection string is a real credential.

```bash
# once, if the database does not exist yet — connect to the Neon project and:
#   CREATE DATABASE pawly_e2e;
pnpm --filter @pawly/api exec prisma db push --accept-data-loss   # with .env.e2e loaded
pnpm e2e:db:seed

pnpm e2e:db:reset   # thereafter: truncate every table, then reseed
```

The database is not kept between working sessions — it is created when someone
needs to run the suites locally and dropped afterwards, so nothing idles on the
Neon project. CI never depends on it.

**A database, not a schema.** Splitting by schema looks equivalent and is not:
Prisma's `pg` adapter pins itself to `public` whatever `search_path` says, so a
schema-based split sends the seed and the app straight into the real data while
appearing to work. Use the unpooled host too (no `-pooler`) — Neon's pooler
rejects the startup options a schema approach would otherwise need.

`apps/api/test/setup-after-env.ts` refuses to run unless `DATABASE_URL` names
`pawly_e2e`. The integration suites truncate tables, so that guard is the
difference between a test run and an incident — leave it alone.

CI does not use Neon at all: the workflow runs its own throwaway Postgres
service container, which is both faster and free of any shared state.

## The mailbox

`MailService` is swapped for a stub that appends every message to a file instead
of handing it to Resend. That substitution is what makes link- and code-driven
journeys testable: activation, magic link, OTP, invitation and password reset all
end in an email, and the test needs to read it.

- Integration: `harness.mailbox.read()`
- E2E: the `mailbox` fixture, `await mailbox.waitFor(m => m.type === 'sendOtpCode')`

Message shape is `{ type, to, url?, code?, args, sentAt }`, where `type` is the
`MailService` method name.

## Seed data

`Clinique Zen Dev`, **starter** tier — admin `admin@pawly.local` / `Admin123!`,
employee `employee@pawly.local` (Camille Martin, ASV). Tests that need anything
else create it themselves and clean up after; nothing should depend on residue
from another test.

## Gotchas

- Playwright starts both servers itself. The web app runs with `--webpack`:
  Turbopack refuses to boot when the repo's `node_modules` is a symlink pointing
  outside the project root.
- Turnstile is bypassed server-side whenever `NODE_ENV=development`, so forms
  submit with an empty token.
- Drag-and-drop in the planning grid is dnd-kit — drive it with the keyboard
  (focus, Space, arrows, Space). Pointer drags do not register.
- Workers are pinned to 1 in both suites: one database, no isolation between
  parallel workers.
