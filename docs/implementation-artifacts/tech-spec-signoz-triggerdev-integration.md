---
title: 'SigNoz Observability & Trigger.dev Background Jobs Integration'
slug: 'signoz-triggerdev-integration'
created: '2026-03-02'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS 11.0.1', 'Next.js 16.1.6', 'Prisma 7.2.0', '@nestjs/schedule 6.1.1', 'Resend 6.9.1', 'web-push 3.6.7', 'signoz-self-hosted', 'trigger.dev-self-hosted', '@opentelemetry/sdk-node', '@opentelemetry/auto-instrumentations-node', '@vercel/otel', '@trigger.dev/sdk']
files_to_modify:
  - 'apps/api/src/main.ts'
  - 'apps/api/src/app.module.ts'
  - 'apps/api/src/config/env.config.ts'
  - 'apps/api/src/common/interceptors/request-id.interceptor.ts'
  - 'apps/api/src/modules/scheduler/scheduler.service.ts'
  - 'apps/api/src/modules/planning/presence-confirmation.scheduler.ts'
  - 'apps/api/src/modules/planning/equity-counter.scheduler.ts'
  - 'apps/api/src/modules/planning/planning-generation.service.ts'
  - 'apps/api/src/modules/planning/planning.module.ts'
  - 'apps/api/src/modules/mail/mail.service.tsx'
  - 'apps/api/src/modules/notification/push-notification.service.ts'
  - 'apps/api/package.json'
  - 'apps/web/next.config.ts'
  - 'apps/web/package.json'
  - '.env.example'
  - 'turbo.json'
  - 'package.json'
files_to_create:
  - 'apps/api/src/tracing.ts'
  - 'apps/api/src/trigger/client.ts'
  - 'apps/api/src/trigger/tasks/batch-email-publish.ts'
  - 'apps/api/src/trigger/tasks/batch-push-publish.ts'
  - 'apps/api/src/trigger/tasks/send-email.ts'
  - 'apps/api/src/trigger/tasks/school-reminder.ts'
  - 'apps/api/src/trigger/tasks/no-show-detection.ts'
  - 'apps/api/src/trigger/tasks/equity-recalc.ts'
  - 'apps/api/trigger.config.ts'
  - 'apps/web/src/instrumentation.ts'
  - 'apps/api/src/trigger/lib/prisma.ts'
  - 'apps/api/src/trigger/lib/resend.ts'
  - 'apps/api/src/trigger/lib/web-push.ts'
code_patterns:
  - 'NestJS DI: constructor injection with ConfigService<EnvConfig, true>'
  - 'Cron: @Cron decorator with timeZone Europe/Paris, CRON_ENABLED guard'
  - 'Logging: private readonly logger = new Logger(ClassName.name)'
  - 'Fire-and-forget: .catch(err => this.logger.error()) pattern'
  - 'Batch email: resend.batch.send() with BATCH_SIZE=100 chunking'
  - 'Batch push: Promise.allSettled() fault-tolerant parallel'
  - 'Env validation: Zod schema in env.config.ts'
  - 'Next.js plugin chaining: withNextIntl wraps nextConfig'
  - 'Request ID: RequestIdInterceptor generates req_${randomUUID()}'
test_patterns:
  - 'API: Jest *.spec.ts with jest.mock() and DI mocking'
  - 'Web: Vitest *.spec.tsx with @testing-library/react'
  - 'Validators: Vitest *.test.ts with safeParse assertions'
---

# Tech-Spec: SigNoz Observability & Trigger.dev Background Jobs Integration

**Created:** 2026-03-02

## Overview

### Problem Statement

Pawly has zero production observability — no distributed tracing, no structured logging, no metrics/APM. The 18 NestJS Logger instances output unstructured strings with no correlation or aggregation capability. Background jobs (3 crons via `@nestjs/schedule`, batch email/push in `publishPlan`, fire-and-forget emails) have no durability, no retry mechanism, no monitoring dashboard, and fail silently. This makes production debugging blind and job failures invisible.

### Solution

Integrate self-hosted SigNoz (OpenTelemetry tracing + Prisma query tracing + APM metrics) across both NestJS API and Next.js Web services. Migrate all background jobs to self-hosted Trigger.dev for durable execution with automatic retries, real-time dashboard monitoring, and async decoupling from request/response cycles.

### Scope

**In Scope:**
- OpenTelemetry auto-instrumentation for NestJS API (HTTP, Prisma, tRPC)
- OpenTelemetry instrumentation for Next.js Web (`@vercel/otel`)
- Prisma query tracing (slow query visibility on Neon)
- Trigger.dev task definitions for: batch email publish, batch push publish, school reminder cron, no-show detection cron, equity counter recalc cron (nightly + monthly), fire-and-forget emails (invitation, absence notifications)
- Environment configuration (OTEL_*, TRIGGER_* env vars)
- Turbo.json pipeline updates for Trigger.dev dev/deploy scripts

**Out of Scope:**
- Custom SigNoz dashboards and advanced alerting rules (Phase 2)
- Migration away from Resend email provider
- Load testing / performance benchmarks
- SigNoz/Trigger.dev Docker Compose setup (already self-hosted and running)
- Frontend client-side error tracking (browser RUM)
- Replacing NestJS Logger class (OTel auto-instrumentation captures logs automatically)

## Context for Development

### Codebase Patterns

**NestJS Bootstrap** (`main.ts`):
- `app.useGlobalInterceptors(new RequestIdInterceptor())` at line 57
- `app.enableShutdownHooks()` at line 60
- Logger levels: `['error', 'warn', 'log', 'debug', 'verbose']`
- OTel tracing.ts must be imported BEFORE NestJS bootstrap (Node.js `--require` or first import)

**Module Architecture** (`app.module.ts`):
- `ScheduleModule.forRoot()` at line 28 enables `@nestjs/schedule`
- `SchedulerModule` (school reminder) + `PlanningModule` (no-show + equity crons) are separate

**Cron Pattern** (3 schedulers):
- `@Cron('pattern', { timeZone: 'Europe/Paris' })` decorator
- `CRON_ENABLED` env var check (scheduler.service.ts line 22) — not validated in env schema
- All use try-catch with `this.logger.error()` — errors swallowed

**Email Pattern** (`mail.service.tsx`):
- `sendBatchSchedulePublicationEmails()`: Pre-renders per-employee HTML, chunks to 100, `resend.batch.send(chunk)`
- 3 methods THROW errors (magic link, activation, OTP) — must stay synchronous
- 6 methods are fire-and-forget — candidates for Trigger.dev

**publishPlan Flow** (`planning-generation.service.ts`):
- Line 1898: batch email is **AWAITED** (blocking the response)
- Lines 1907-1913: batch push is **FIRE-AND-FORGET** with `.catch()`
- Returns `{ publishedAt, notifiedCount, totalWithShifts }`

**Next.js** (`next.config.ts`):
- 10 lines, plugin chaining with `withNextIntl(nextConfig)`
- No `instrumentation.ts` exists — greenfield

**Request ID** (`request-id.interceptor.ts`):
- Generates `req_${randomUUID()}` — not propagated to external calls

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/main.ts` | NestJS bootstrap, global interceptors, shutdown hooks |
| `apps/api/src/app.module.ts` | Module registry, ScheduleModule.forRoot() |
| `apps/api/src/config/env.config.ts` | Zod env schema (13 vars, no OTEL/TRIGGER) |
| `apps/api/src/common/interceptors/request-id.interceptor.ts` | Request ID generation |
| `apps/api/src/modules/scheduler/scheduler.service.ts` | School reminder cron |
| `apps/api/src/modules/planning/presence-confirmation.scheduler.ts` | No-show detection cron |
| `apps/api/src/modules/planning/equity-counter.scheduler.ts` | Equity nightly + monthly crons |
| `apps/api/src/modules/planning/planning-generation.service.ts` | publishPlan batch email + push |
| `apps/api/src/modules/mail/mail.service.tsx` | Resend email service (13 methods) |
| `apps/api/src/modules/notification/push-notification.service.ts` | Web Push VAPID service |
| `apps/web/next.config.ts` | Next.js config (plugin chain) |
| `turbo.json` | Pipeline tasks |
| `.env.example` | Env vars documentation |

### Technical Decisions

- **SigNoz: Self-hosted** — Already running, OTLP endpoint via env var
- **Trigger.dev: Self-hosted** — Already running, secret key via env var
- **Prisma tracing: Enabled** — OTel auto-instrumentation captures Prisma queries via `@opentelemetry/auto-instrumentations-node`
- **OTel before bootstrap** — `tracing.ts` loaded as first import in `main.ts` (before NestFactory.create)
- **Next.js instrumentation.ts** — Native Next.js 16 hook with `@vercel/otel`
- **Keep @nestjs/schedule temporarily** — Cron logic replaced by Trigger.dev scheduled tasks, but module kept for rollback. Remove in Phase 2
- **3 critical emails stay synchronous** — Magic Link, Activation, OTP must throw errors to callers
- **publishPlan returns immediately** — Batch email + push become async Trigger.dev tasks. `publishPlan()` no longer waits for notification delivery
- **Trigger.dev tasks run outside NestJS DI** — Lightweight utility modules (`trigger/lib/prisma.ts`, `trigger/lib/resend.ts`, `trigger/lib/web-push.ts`) for direct access to Prisma, Resend, web-push

## Implementation Plan

### Tasks

#### Phase A: Dependencies & Environment (Foundation)

- [ ] Task 1: Install OpenTelemetry packages for API
  - File: `apps/api/package.json`
  - Action: `pnpm --filter @pawly/api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions`
  - Notes: auto-instrumentations-node includes Prisma, HTTP, Express, pg instrumentors

- [ ] Task 2: Install OpenTelemetry packages for Web
  - File: `apps/web/package.json`
  - Action: `pnpm --filter @pawly/web add @vercel/otel @opentelemetry/api`
  - Notes: `@vercel/otel` wraps OTel SDK with Next.js-specific `registerOTel()`

- [ ] Task 3: Install Trigger.dev SDK for API
  - File: `apps/api/package.json`
  - Action: `pnpm --filter @pawly/api add @trigger.dev/sdk`
  - Notes: SDK used both in NestJS services (to trigger tasks) and in task files (to define tasks)

- [ ] Task 4: Add OTEL + TRIGGER env vars to schema
  - File: `apps/api/src/config/env.config.ts`
  - Action: Add to Zod schema:
    ```typescript
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().default('pawly-api'),
    TRIGGER_SECRET_KEY: z.string().min(1).optional(),
    TRIGGER_API_URL: z.string().url().optional(),
    CRON_ENABLED: z.enum(['true', 'false']).default('true'),
    ```
  - Notes: All optional — app works without observability/trigger in dev. Also validates `CRON_ENABLED` (previously unvalidated)

- [ ] Task 5: Update .env.example with new vars
  - File: `.env.example`
  - Action: Add two new sections:
    ```env
    # ─── Observability (SigNoz — self-hosted) ────────────────────────
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
    OTEL_SERVICE_NAME=pawly-api

    # ─── Background Jobs (Trigger.dev — self-hosted) ─────────────────
    TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxx
    TRIGGER_API_URL=http://localhost:8080
    ```

#### Phase B: SigNoz OpenTelemetry Integration

- [ ] Task 6: Create API tracing bootstrap
  - File: `apps/api/src/tracing.ts` (NEW)
  - Action: Create OpenTelemetry SDK init file:
    ```typescript
    import { NodeSDK } from '@opentelemetry/sdk-node';
    import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
    import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
    import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
    import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
    import { resourceFromAttributes } from '@opentelemetry/resources';
    import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    if (endpoint) {
      const sdk = new NodeSDK({
        resource: resourceFromAttributes({
          [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'pawly-api',
        }),
        traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
        metricReader: new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        }),
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
          }),
        ],
      });
      sdk.start();
      process.on('SIGTERM', () => sdk.shutdown());
    }
    ```
  - Notes: Disabling `fs` instrumentation avoids noise. Auto-instrumentations capture HTTP, Express, Prisma/pg, DNS automatically. No-op if `OTEL_EXPORTER_OTLP_ENDPOINT` not set.

- [ ] Task 7: Import tracing before NestJS bootstrap
  - File: `apps/api/src/main.ts`
  - Action: Add `import './tracing';` as the VERY FIRST import (line 1, before any NestJS imports)
  - Notes: OTel must instrument modules before they are loaded. Import order is critical.

- [ ] Task 8: Enhance RequestIdInterceptor with trace context
  - File: `apps/api/src/common/interceptors/request-id.interceptor.ts`
  - Action: Extract OTel trace ID and set as response header for correlation:
    ```typescript
    import { trace } from '@opentelemetry/api';
    // In intercept():
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    if (traceId) {
      const res = context.switchToHttp().getResponse();
      res.setHeader('x-trace-id', traceId);
    }
    ```
  - Notes: Allows frontend to correlate errors with backend traces

- [ ] Task 9: Create Next.js instrumentation hook
  - File: `apps/web/src/instrumentation.ts` (NEW)
  - Action: Create Next.js OTel instrumentation:
    ```typescript
    import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';

    export function register() {
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      if (!endpoint) return;
      registerOTel({
        serviceName: process.env.OTEL_SERVICE_NAME || 'pawly-web',
        traceExporter: new OTLPHttpJsonTraceExporter({
          url: `${endpoint}/v1/traces`,
        }),
      });
    }
    ```
  - Notes: Next.js 16 auto-discovers `instrumentation.ts` in `src/` — no config flag needed

- [ ] Task 10: Add OTEL env vars to Next.js config
  - File: `apps/web/next.config.ts`
  - Action: Add `serverExternalPackages` for OTel modules that need Node.js APIs:
    ```typescript
    serverExternalPackages: ["esbuild-wasm", "@opentelemetry/auto-instrumentations-node"],
    ```
  - Notes: Add `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` to `apps/web/.env.example` or pass via turbo env

#### Phase C: Trigger.dev Task Definitions

- [ ] Task 11: Create Trigger.dev config
  - File: `apps/api/trigger.config.ts` (NEW)
  - Action: Create Trigger.dev project configuration:
    ```typescript
    import { defineConfig } from '@trigger.dev/sdk';

    export default defineConfig({
      project: 'pawly-api',
      dirs: ['src/trigger/tasks'],
    });
    ```

- [ ] Task 12: Create Trigger.dev lightweight Prisma client
  - File: `apps/api/src/trigger/lib/prisma.ts` (NEW)
  - Action: Create standalone PrismaClient for Trigger.dev tasks (outside NestJS DI):
    ```typescript
    import { PrismaClient } from '@prisma/client';
    export const prisma = new PrismaClient();
    ```
  - Notes: Trigger.dev tasks run in a separate worker process. Cannot use NestJS PrismaService.

- [ ] Task 13: Create Trigger.dev Resend client
  - File: `apps/api/src/trigger/lib/resend.ts` (NEW)
  - Action: Create standalone Resend client:
    ```typescript
    import { Resend } from 'resend';
    export const resend = new Resend(process.env.RESEND_API_KEY);
    ```

- [ ] Task 14: Create Trigger.dev web-push client
  - File: `apps/api/src/trigger/lib/web-push.ts` (NEW)
  - Action: Create standalone web-push setup:
    ```typescript
    import webPush from 'web-push';
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
      webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
    export { webPush };
    ```

- [ ] Task 15: Create batch-email-publish task
  - File: `apps/api/src/trigger/tasks/batch-email-publish.ts` (NEW)
  - Action: Define Trigger.dev task that replicates `sendBatchSchedulePublicationEmails()` logic:
    - Accepts payload: `{ emails: Array<{to, firstName, shiftCount}>, month, clinicName }`
    - Pre-renders per-employee HTML using `@react-email/render` + `SchedulePublicationEmail`
    - Chunks to 100, calls `resend.batch.send(chunk)` per chunk
    - Uses `logger` from `@trigger.dev/sdk` for structured logs
    - Retry: 5 attempts, 1s-10s exponential backoff
  - Notes: Import `prisma` from `trigger/lib/prisma.ts`, `resend` from `trigger/lib/resend.ts`

- [ ] Task 16: Create batch-push-publish task
  - File: `apps/api/src/trigger/tasks/batch-push-publish.ts` (NEW)
  - Action: Define Trigger.dev task that replicates `sendBatchPushNotifications()` logic:
    - Accepts payload: `{ employeeIds: string[], title, body, url }`
    - Fetches PushSubscription records from DB
    - Sends via `webPush.sendNotification()` with `Promise.allSettled()`
    - Cleans stale subscriptions on 410/404
    - Retry: 3 attempts, 1s-5s backoff
  - Notes: Import `prisma` from `trigger/lib/prisma.ts`, `webPush` from `trigger/lib/web-push.ts`

- [ ] Task 17: Create send-email generic task
  - File: `apps/api/src/trigger/tasks/send-email.ts` (NEW)
  - Action: Define Trigger.dev task for all fire-and-forget emails:
    - Accepts payload: `{ type: 'invitation' | 'school-notification' | 'schedule-publication' | 'school-reminder' | 'absence-request' | 'absence-review', data: Record<string, unknown> }`
    - Dispatches to appropriate render function based on `type`
    - Uses `resend.emails.send()` with throttle (550ms delay between sends)
    - Retry: 3 attempts, exponential backoff
  - Notes: Consolidates 6 fire-and-forget methods into one task with type discrimination

- [ ] Task 18: Create school-reminder scheduled task
  - File: `apps/api/src/trigger/tasks/school-reminder.ts` (NEW)
  - Action: Define Trigger.dev scheduled task (replaces `scheduler.service.ts:handleSchoolDaysReminder`):
    - Schedule: `0 9 25 * *` (Europe/Paris timezone)
    - Query apprentices without school day declarations for current month
    - Trigger `send-email` task for each eligible apprentice
    - Retry: 3 attempts

- [ ] Task 19: Create no-show-detection scheduled task
  - File: `apps/api/src/trigger/tasks/no-show-detection.ts` (NEW)
  - Action: Define Trigger.dev scheduled task (replaces `presence-confirmation.scheduler.ts:handleNoShowDetection`):
    - Schedule: `0 0 0 * * *` (midnight Europe/Paris)
    - Query unconfirmed shifts from yesterday across all clinics with PUBLISHED status
    - Create VarianceEvent NO_SHOW records
    - Retry: 3 attempts

- [ ] Task 20: Create equity-recalc scheduled tasks
  - File: `apps/api/src/trigger/tasks/equity-recalc.ts` (NEW)
  - Action: Define TWO Trigger.dev scheduled tasks (replaces `equity-counter.scheduler.ts`):
    - `equity-nightly-recalc`: Schedule `0 0 2 * * *` (2 AM Europe/Paris) — recalculates counters
    - `equity-monthly-final`: Schedule `0 0 3 1 * *` (3 AM 1st of month) — finalizes monthly counters
    - Both use `prisma` from `trigger/lib/prisma.ts`
    - Retry: 3 attempts

#### Phase D: Wire Trigger.dev into NestJS

- [ ] Task 21: Create Trigger.dev client module
  - File: `apps/api/src/trigger/client.ts` (NEW)
  - Action: Create and export the Trigger.dev client for triggering tasks from NestJS:
    ```typescript
    import { tasks } from '@trigger.dev/sdk';
    export { tasks };
    ```
  - Notes: NestJS services use `tasks.trigger('task-id', payload)` to enqueue work

- [ ] Task 22: Refactor publishPlan to use Trigger.dev
  - File: `apps/api/src/modules/planning/planning-generation.service.ts`
  - Action: Replace lines 1898-1913 (batch email + push):
    - Before: `await this.mailService.sendBatchSchedulePublicationEmails(...)` (blocking)
    - After: `await tasks.trigger('batch-email-publish', { emails: emailPayloads, month, clinicName })`
    - Before: `this.pushNotificationService.sendBatchPushNotifications(...).catch(...)` (fire-and-forget)
    - After: `await tasks.trigger('batch-push-publish', { employeeIds: pushEligibleIds, title, body, url })`
    - Update return type: remove `notifiedCount` from return (now async). Return `{ publishedAt, totalWithShifts }`
  - Notes: Both triggers are non-blocking (fire-and-forget from NestJS perspective). Trigger.dev handles retries.

- [ ] Task 23: Refactor fire-and-forget email calls
  - File: `apps/api/src/modules/mail/mail.service.tsx` (+ callers)
  - Action: For each of the 6 fire-and-forget email methods, add a `triggerAsync` alternative:
    - Add method: `async triggerSendEmail(type: string, data: Record<string, unknown>)` that calls `tasks.trigger('send-email', { type, data })`
    - Update callers in: `employee.service.ts` (invitation), `scheduler.service.ts` (school reminder), `planning-generation.service.ts` (schedule publication), `employee.service.ts` (absence request/review)
    - Keep original methods for fallback if TRIGGER_SECRET_KEY not set
  - Notes: Graceful degradation — if Trigger.dev not configured, fall back to direct send

- [ ] Task 24: Disable @nestjs/schedule crons (conditional)
  - Files: `scheduler.service.ts`, `presence-confirmation.scheduler.ts`, `equity-counter.scheduler.ts`
  - Action: Wrap each `@Cron` method body with:
    ```typescript
    if (process.env.TRIGGER_SECRET_KEY) {
      this.logger.log('Cron handled by Trigger.dev — skipping');
      return;
    }
    ```
  - Notes: Keeps NestJS crons as fallback. When TRIGGER_SECRET_KEY is set, crons are no-ops. Phase 2: remove entirely.

#### Phase E: Pipeline & Config

- [ ] Task 25: Update turbo.json with Trigger.dev scripts
  - File: `turbo.json`
  - Action: Add new task:
    ```json
    "trigger:dev": {
      "cache": false,
      "persistent": true,
      "env": ["TRIGGER_SECRET_KEY", "TRIGGER_API_URL", "DATABASE_URL", "RESEND_API_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]
    }
    ```
  - Notes: Trigger.dev dev server runs alongside NestJS dev server

- [ ] Task 26: Add Trigger.dev scripts to API package.json
  - File: `apps/api/package.json`
  - Action: Add scripts:
    ```json
    "trigger:dev": "trigger dev",
    "trigger:deploy": "trigger deploy"
    ```

- [ ] Task 27: Add root-level convenience scripts
  - File: `package.json`
  - Action: Add:
    ```json
    "trigger:dev": "dotenv -- pnpm --filter @pawly/api trigger:dev"
    ```

- [ ] Task 28: Update turbo env passthrough for OTEL
  - File: `turbo.json`
  - Action: Add OTEL env vars to `build` and `dev` tasks `env` arrays:
    ```json
    "env": ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME"]
    ```

### Acceptance Criteria

#### SigNoz / OpenTelemetry

- [ ] AC 1: Given the API is running with `OTEL_EXPORTER_OTLP_ENDPOINT` set, when an HTTP request hits any tRPC endpoint, then a trace appears in SigNoz with service name `pawly-api`, containing HTTP method, URL, status code, and duration.

- [ ] AC 2: Given the API is running with OTel enabled, when a Prisma query executes (e.g. employee lookup), then the query appears as a child span in the trace with the SQL statement and duration visible in SigNoz.

- [ ] AC 3: Given the Next.js web app has `OTEL_EXPORTER_OTLP_ENDPOINT` set, when a server-rendered page loads, then a trace appears in SigNoz with service name `pawly-web`.

- [ ] AC 4: Given OTel env vars are NOT set, when the API or Web app starts, then no errors occur and the app functions identically to before (graceful no-op).

- [ ] AC 5: Given the API receives a request, when the `RequestIdInterceptor` runs, then the response includes an `x-trace-id` header with the OpenTelemetry trace ID.

#### Trigger.dev Tasks

- [ ] AC 6: Given Trigger.dev is configured, when an admin publishes a plan, then `batch-email-publish` and `batch-push-publish` tasks appear in the Trigger.dev dashboard with status `COMPLETED`, and employees receive their emails/push notifications.

- [ ] AC 7: Given `batch-email-publish` task runs with 250 employees, when Resend processes the batches, then emails are chunked to 100 per batch call (3 chunks: 100+100+50) and the task logs the total sent count.

- [ ] AC 8: Given `batch-push-publish` task encounters a 410 Gone error for a stale subscription, when the push is sent, then the stale subscription is deleted from the DB and remaining subscriptions are still attempted.

- [ ] AC 9: Given the scheduled task `school-reminder` is configured with cron `0 9 25 * *`, when the 25th of the month arrives, then apprentices without school day declarations receive reminder emails via the `send-email` task.

- [ ] AC 10: Given the scheduled task `no-show-detection` runs at midnight, when unconfirmed shifts from yesterday exist, then VarianceEvent NO_SHOW records are created for each unconfirmed shift.

- [ ] AC 11: Given the scheduled tasks `equity-nightly-recalc` and `equity-monthly-final`, when their cron triggers fire, then equity counters are recalculated/finalized correctly matching the current `@nestjs/schedule` behavior.

- [ ] AC 12: Given a fire-and-forget email is triggered (e.g. employee invitation), when Trigger.dev is configured, then a `send-email` task is enqueued instead of calling Resend directly, and the task appears in the dashboard.

#### Graceful Degradation

- [ ] AC 13: Given `TRIGGER_SECRET_KEY` is NOT set, when `publishPlan()` is called, then batch emails are sent directly via `MailService` (current behavior) and crons run via `@nestjs/schedule` as before.

- [ ] AC 14: Given `TRIGGER_SECRET_KEY` IS set, when `@nestjs/schedule` crons fire, then they exit early with a log message and defer to Trigger.dev scheduled tasks.

#### Integration

- [ ] AC 15: Given both SigNoz and Trigger.dev are configured, when a `publishPlan` request is made, then the full trace in SigNoz shows: HTTP request → Prisma queries → Trigger.dev task enqueue, and the Trigger.dev dashboard shows the spawned tasks.

## Additional Context

### Dependencies

**New packages for `apps/api`:**
```
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/exporter-metrics-otlp-http
@opentelemetry/resources
@opentelemetry/semantic-conventions
@trigger.dev/sdk
```

**New packages for `apps/web`:**
```
@vercel/otel
@opentelemetry/api
```

**New env vars:**
```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=pawly-api
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxx
TRIGGER_API_URL=http://localhost:8080
```

**External services (already running):**
- SigNoz self-hosted (OTLP endpoint)
- Trigger.dev self-hosted (API + dashboard)

### Testing Strategy

**Unit Tests (API — Jest `*.spec.ts`):**
- `tracing.spec.ts`: Verify SDK starts when endpoint set, no-ops when not set
- `planning-generation.service.spec.ts`: Update existing publish tests — mock `tasks.trigger()` instead of `mailService.sendBatch*()`
- `scheduler.service.spec.ts`: Verify cron early-exit when `TRIGGER_SECRET_KEY` is set
- `mail.service.spec.ts`: Verify `triggerSendEmail()` calls `tasks.trigger('send-email', ...)`

**Integration Tests (manual):**
- Start API with `OTEL_EXPORTER_OTLP_ENDPOINT` pointing to SigNoz → verify traces appear
- Start API with `TRIGGER_SECRET_KEY` → publish a plan → verify tasks in Trigger.dev dashboard
- Start API WITHOUT env vars → verify no regressions (current behavior preserved)

**Estimated new tests:** ~15-20

### Notes

**Current Background Jobs Inventory:**
1. `scheduler.service.ts` — School days reminder cron (`0 9 25 * *`, Europe/Paris)
2. `presence-confirmation.scheduler.ts` — No-show detection (`0 0 0 * * *`, Europe/Paris)
3. `equity-counter.scheduler.ts` — Nightly recalc (`0 0 2 * * *`) + Monthly finalization (`0 0 3 1 * *`)
4. `planning-generation.service.ts:publishPlan` — Batch email (resend.batch.send, chunked 100) + batch push (Promise.allSettled)
5. `mail.service.tsx` — 6 fire-and-forget emails (invitation, school notification, schedule publication, reminder, absence request/review)

**Trigger.dev Task Mapping:**

| Current Code | Trigger.dev Task ID | Schedule | Retry |
|---|---|---|---|
| `handleSchoolDaysReminder()` | `school-reminder` | `0 9 25 * *` Europe/Paris | 3 attempts, exp backoff |
| `handleNoShowDetection()` | `no-show-detection` | `0 0 0 * * *` Europe/Paris | 3 attempts, exp backoff |
| `handleNightlyRecalculation()` | `equity-nightly-recalc` | `0 0 2 * * *` Europe/Paris | 3 attempts, exp backoff |
| `handleMonthlyFinalization()` | `equity-monthly-final` | `0 0 3 1 * *` Europe/Paris | 3 attempts, exp backoff |
| `sendBatchSchedulePublicationEmails()` | `batch-email-publish` | On-demand | 5 attempts, 1s-10s |
| `sendBatchPushNotifications()` | `batch-push-publish` | On-demand | 3 attempts, 1s-5s |
| 6 fire-and-forget email methods | `send-email` | On-demand | 3 attempts, exp backoff |

**Key Architectural Constraint:**
Trigger.dev tasks run in a separate worker process outside NestJS DI. They need standalone utility modules (`trigger/lib/prisma.ts`, `trigger/lib/resend.ts`, `trigger/lib/web-push.ts`) for direct access to dependencies.

**High-Risk Items:**
1. **OTel import order** — `tracing.ts` MUST be imported before any NestJS module. Wrong order = no instrumentation.
2. **Trigger.dev worker process** — Tasks don't have NestJS context. Complex service logic (e.g. equity counter recalculation) needs to be extracted from NestJS services into shared pure functions.
3. **publishPlan return type change** — Removing `notifiedCount` from the response may break frontend expectations in `PublishConfirmDialog`. Update the frontend to show "notifications en cours" instead of a count.

**Phase 2 (Future):**
- Remove `@nestjs/schedule` dependency entirely
- Add SigNoz alerting rules (cron failure, high error rate, slow queries)
- Custom SigNoz dashboards (email delivery rates, push success rates, cron execution times)
- Trigger.dev webhook callbacks for notification delivery confirmation
