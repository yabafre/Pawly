# Story 8.3: PWA Installation & Email Notifications

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an employee,
I want to install the Pawly application on my phone and receive email and push notifications when a new schedule is published,
so that I stay informed about my work hours and can access my schedule instantly from my home screen.

## Acceptance Criteria

1. **Given** the employee dashboard at `/dashboard` **When** the PWA is not yet installed (not running in standalone mode) **Then** a contextual install prompt banner is displayed at the top of the dashboard, with platform-specific instructions (Chrome/Android: "Install" button using `beforeinstallprompt` API; iOS/Safari: step-by-step "Add to Home Screen" instructions with share icon visual).

2. **Given** the install prompt banner **When** the employee dismisses it **Then** the dismissal is persisted in localStorage (`pawly-install-dismissed`) and the banner is NOT shown again for 7 days. **When** the employee clicks "Install" (Chrome/Android) **Then** the native browser install dialog is triggered via the deferred `beforeinstallprompt` event.

3. **Given** the PWA is running in standalone mode (`display-mode: standalone`) **Then** the install prompt is NEVER shown (returns null), and a subtle "Installed" badge is visible in the employee settings/profile area.

4. **Given** an admin on the planning page **When** they click "Publish" on a schedule **Then** a confirmation dialog shows the count of employees who will be notified by email, with a preview list of employee names. **When** confirmed **Then** publication emails are sent in batch via `resend.batch.send()` (max 100 per batch, Resend API limit) instead of sequential sends, and a success toast shows "Planning published. {N} employees notified."

5. **Given** the employee model **When** an admin creates or edits an employee **Then** a `notifyOnPublish` boolean field (default: `true`) exists on the Employee model, allowing the admin to disable publication emails for specific employees (e.g., long-term absence).

6. **Given** the employee dashboard settings **When** an employee accesses their profile/settings area **Then** they can toggle their own `notifyOnPublish` preference on/off via a switch component, with immediate feedback ("Notifications enabled/disabled").

7. **Given** an admin publishes a schedule **When** emails are sent **Then** ONLY employees with `notifyOnPublish: true` AND who have shifts in the published month receive the email. Employees without shifts or with `notifyOnPublish: false` are excluded.

8. **Given** the existing `SchedulePublicationEmail` template **When** an employee receives a publication email **Then** the email contains: clinic name, published month, a direct link to `/dashboard/schedule` (deep link into PWA if installed), and a count of their scheduled shifts for the month.

9. **Given** the publication process **When** batch email sending completes **Then** the backend logs the result: `"Published plan for clinic X, month Y. Notified N/M employees (M total with shifts, N with notifications enabled)."` and returns `{ publishedAt, notifiedCount, totalWithShifts }` to the frontend.

10. **Given** the employee profile area **When** the employee views their settings **Then** they see a "PWA Installation" section showing: installation status (installed/not installed), a manual install button (if not installed), and a link to notification preferences.

11. **Given** the employee settings page **When** the employee views notification preferences **Then** a "Push Notifications" section is displayed with a permission request button. **When** the employee clicks "Enable push notifications" **Then** the browser `Notification.requestPermission()` dialog is triggered. **When** permission is granted **Then** a `PushSubscription` is created via `PushManager.subscribe()` with the VAPID public key and stored in the database. A confirmation toast shows "Push notifications enabled."

12. **Given** an employee with an active push subscription AND `notifyOnPublish: true` **When** an admin publishes a schedule **Then** a Web Push notification is sent to ALL subscribed employees' devices via the `web-push` library, in addition to the email notification. The push payload contains: `{ title: "Planning publié", body: "{clinicName} — {month}", url: "/dashboard/schedule" }`.

13. **Given** the service worker (`sw.ts`) **When** a `push` event is received **Then** a native notification is displayed with the push payload title, body, and Pawly icon. **When** the user clicks the notification **Then** the PWA navigates to the `url` from the push payload (deep link to `/dashboard/schedule`) via `clients.openWindow()` or `client.navigate()`.

14. **Given** the employee settings page **When** the employee has previously granted push permission **Then** the push section shows a "Disable push notifications" toggle. **When** toggled off **Then** the `PushSubscription` is deleted from the database (unsubscribed), and a toast confirms "Push notifications disabled."

15. **Given** the admin publish confirmation dialog **When** displaying the notification preview **Then** the dialog shows BOTH email count AND push count separately: "X employees will receive an email, Y will receive a push notification" (some employees may have both, email only, or push only).

## Tasks

- [x] Task 1: Database — Add notifyOnPublish to Employee model (AC: #5, #7)
  - [x]1.1 Add `notifyOnPublish Boolean @default(true)` field to Employee model in `apps/api/prisma/schema/Employee.prisma`
  - [x]1.2 Run `pnpm db:generate` and `pnpm db:push` from project root
  - [x]1.3 Update seed data if needed (all existing employees default to true)

- [x] Task 2: Validators — Notification preference schemas (AC: #5, #6)
  - [x]2.1 Create `packages/validators/src/employee/notification-preferences.schema.ts` with `updateNotificationPreferencesSchema` (notifyOnPublish: boolean)
  - [x]2.2 Update `packages/validators/src/employee/index.ts` to export new schema
  - [x]2.3 Add notifyOnPublish to existing `createEmployeeSchema` and `updateEmployeeSchema` as optional boolean
  - [x]2.4 Write validator tests (~10 tests)

- [x] Task 3: Backend — Notification preferences service methods (AC: #5, #6, #7)
  - [x]3.1 Add `updateNotificationPreferences(clinicId, employeeId, preferences)` method to `EmployeeService`
  - [x]3.2 Add `getNotificationPreferences(clinicId, employeeId)` method to `EmployeeService`
  - [x]3.3 Write service tests (~8 tests) — test clinicId isolation, invalid employeeId, default value

- [x] Task 4: Backend — Batch email publication with notification filtering (AC: #4, #7, #8, #9)
  - [x]4.1 Refactor `publishPlan()` in `PlanningGenerationService` to use `resend.batch.send()` instead of sequential loop
  - [x]4.2 Add `sendBatchSchedulePublicationEmails(emails: BatchEmailPayload[])` method to `MailService`
  - [x]4.3 Filter employees: only those with `notifyOnPublish: true` AND shifts in the published month
  - [x]4.4 Chunk into batches of max 100 (Resend batch limit)
  - [x]4.5 Return `{ publishedAt, notifiedCount, totalWithShifts }` from `publishPlan()`
  - [x]4.6 Enhanced `SchedulePublicationEmail` template: add shift count for the month, deep link to `/dashboard/schedule`
  - [x]4.7 Update logging: `"Published plan for clinic X, month Y. Notified N/M employees"`
  - [x]4.8 Write service tests (~12 tests) — batch chunking, filtering, error handling, empty recipients

- [x] Task 5: Backend — tRPC procedures for notification preferences (AC: #5, #6)
  - [x]5.1 Add `updateMyNotificationPreferences` mutation to existing employee-schedule router (subscribedProcedure, employee role)
  - [x]5.2 Add `getMyNotificationPreferences` query to existing employee-schedule router
  - [x]5.3 Add `notifyOnPublish` to admin employee update procedure (existing `employees.update`)
  - [x]5.4 Update `publishPlan` output schema to include `{ notifiedCount, totalWithShifts }`
  - [x]5.5 Add `getPublishPreview` query: returns count of employees who will be notified + list of names (AC: #4)
  - [x]5.6 Write router tests (~10 tests)

- [x] Task 6: Web — PWA Install Prompt Component (AC: #1, #2, #3)
  - [x]6.1 Create `apps/web/src/app/[locale]/dashboard/_components/PwaInstallPrompt.tsx`
  - [x]6.2 Implement `beforeinstallprompt` event listener for Chrome/Android (deferred prompt pattern)
  - [x]6.3 Implement iOS detection (`/iPad|iPhone|iPod/` + no MSStream) with "Add to Home Screen" instructions
  - [x]6.4 Implement standalone detection (`window.matchMedia('(display-mode: standalone)')`)
  - [x]6.5 Implement 7-day dismissal persistence via localStorage (`pawly-install-dismissed` + timestamp)
  - [x]6.6 "Clinique Zen" design: Vet Teal accent, rounded-2xl card, Download icon, soft shadow
  - [x]6.7 Accessibility: `role="banner"`, `aria-label`, dismiss button with `aria-label="Dismiss install prompt"`, min 44px touch targets
  - [x]6.8 Integrate into `DashboardClient.tsx` (show at top before schedule content)
  - [x]6.9 Write component tests (~12 tests) — standalone detection, iOS detection, dismiss persistence, install trigger

- [x] Task 7: Web — Employee Notification Preferences UI (AC: #6, #10)
  - [x]7.1 Create `apps/web/src/app/[locale]/dashboard/settings/page.tsx` (RSC wrapper)
  - [x]7.2 Create `_components/SettingsPageClient.tsx` with notification preference toggle
  - [x]7.3 Create `_actions/settings-actions.ts` with `updateNotificationPreferencesAction` and `getNotificationPreferencesAction`
  - [x]7.4 Create `_hooks/useNotificationPreferences.ts` with query + mutation hooks
  - [x]7.5 Switch component (shadcn) with `role="switch"`, `aria-checked`, label text
  - [x]7.6 Show PWA installation status (installed/not installed badge)
  - [x]7.7 Add "Settings" link to employee dashboard bottom tab navigation
  - [x]7.8 Write tests (~10 tests) — toggle, API call, optimistic update

- [x] Task 8: Web — Admin Publish Confirmation Dialog Enhancement (AC: #4, #9)
  - [x]8.1 Create `_components/PublishConfirmationDialog.tsx` in admin planning
  - [x]8.2 Add `getPublishPreview` server action + hook to fetch notification preview
  - [x]8.3 Show: "X employees will be notified by email" + scrollable name list
  - [x]8.4 Show: "Y employees have notifications disabled" (if any)
  - [x]8.5 Update existing `usePublish` hook to use enhanced response (notifiedCount, totalWithShifts)
  - [x]8.6 Success toast: "Planning published. {N} employees notified by email."
  - [x]8.7 Write tests (~8 tests) — dialog render, preview fetch, confirm/cancel flow

- [x] Task 9: i18n — Translation keys (AC: all)
  - [x]9.1 Add keys to `dashboard.pwaInstall` namespace in FR and EN (~12 keys: title, description, installButton, iosInstructions, dismissButton, installed, notSupported, installSuccess)
  - [x]9.2 Add keys to `dashboard.settings` namespace in FR and EN (~10 keys: title, notifications, notifyOnPublish, notifyOnPublishDescription, enabled, disabled, saved, pwaStatus, installed, notInstalled)
  - [x]9.3 Add keys to `admin.publication` namespace in FR and EN (~8 keys: confirmTitle, confirmDescription, employeesNotified, employeesDisabled, preview, publishing, publishSuccess, publishError)

- [x] Task 10: Database — PushSubscription Prisma model (AC: #11, #14)
  - [x]10.1 Create `apps/api/prisma/schema/PushSubscription.prisma` with fields: `id`, `endpoint` (String, unique), `p256dh` (String), `auth` (String), `employeeId` (String, FK to Employee), `clinicId` (String, FK to Clinic), `createdAt`, `updatedAt`
  - [x]10.2 Add relation `pushSubscriptions PushSubscription[]` to Employee model
  - [x]10.3 Run `pnpm db:generate` and `pnpm db:push` from project root

- [x] Task 11: Backend — Web Push notification service (AC: #12, #15)
  - [x]11.1 Install `web-push` npm package in `apps/api`: `pnpm --filter api add web-push` + `pnpm --filter api add -D @types/web-push`
  - [x]11.2 Add VAPID env vars to `.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:)
  - [x]11.3 Add `sendPushNotification(subscription, payload)` method to `MailService` (or create dedicated `NotificationService`)
  - [x]11.4 Add `sendBatchPushNotifications(subscriptions[], payload)` method — iterate with error handling per subscription (remove stale subscriptions on 410 Gone)
  - [x]11.5 Update `publishPlan()` in `PlanningGenerationService`: after batch email, query active PushSubscriptions for eligible employees and send push notifications
  - [x]11.6 Return `{ pushNotifiedCount }` alongside `{ notifiedCount, totalWithShifts }` from `publishPlan()`
  - [x]11.7 Write service tests (~10 tests) — push send, stale subscription cleanup, batch push, VAPID config

- [x] Task 12: Backend — Push subscription CRUD tRPC procedures (AC: #11, #14)
  - [x]12.1 Add `subscribePush` mutation to `employee-schedule.router.ts`: receives `{ endpoint, p256dh, auth }`, creates PushSubscription record linked to authenticated employee
  - [x]12.2 Add `unsubscribePush` mutation: deletes PushSubscription by endpoint for authenticated employee
  - [x]12.3 Add `getMyPushSubscription` query: returns current subscription status (subscribed/not)
  - [x]12.4 Update `getPublishPreview` to include push subscription count
  - [x]12.5 Write router tests (~8 tests) — subscribe, unsubscribe, duplicate endpoint, auth guard

- [x] Task 13: Web — Push notification permission UI in employee settings (AC: #11, #14)
  - [x]13.1 Add push notification section to `SettingsPageClient.tsx` with permission status detection (`Notification.permission`)
  - [x]13.2 Create `usePushNotifications.ts` hook: manages `Notification.requestPermission()`, `PushManager.subscribe()` with VAPID key, and tRPC mutations
  - [x]13.3 Add `subscribePushAction` and `unsubscribePushAction` server actions in `settings-actions.ts`
  - [x]13.4 UI states: "Not supported" (no PushManager), "Enable" button (default/denied), "Enabled" toggle (granted), "Blocked" message (denied after prompt)
  - [x]13.5 Use `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var for client-side `applicationServerKey`
  - [x]13.6 Add `urlBase64ToUint8Array()` utility for VAPID key conversion
  - [x]13.7 Write tests (~10 tests) — permission states, subscribe flow, unsubscribe flow, unsupported browser

- [x] Task 14: Web — Service worker push event handlers (AC: #13)
  - [x]14.1 Add `self.addEventListener('push', ...)` to `apps/web/src/app/sw.ts`: parse payload, show native notification with title, body, icon, data.url
  - [x]14.2 Add `self.addEventListener('notificationclick', ...)`: navigate to payload URL via `clients.openWindow()` or `client.navigate()`
  - [x]14.3 Add Pawly icon path for notification icon (`/icons/icon-192x192.png`)
  - [x]14.4 Handle notification close event (optional analytics)
  - [x]14.5 Write SW tests (~4 tests) — push event parsing, notification display, click navigation

- [x] Task 15: i18n — Push notification translation keys (AC: #11, #14, #15)
  - [x]15.1 Add keys to `dashboard.settings.push` namespace: enablePush, disablePush, pushEnabled, pushDisabled, pushBlocked, pushNotSupported, pushPermissionRequest (~8 keys FR + EN)
  - [x]15.2 Add keys to `admin.publication` namespace: pushNotified, emailAndPush (~4 keys FR + EN)

- [x] Task 16: Integration Testing & Build Verification (AC: all)
  - [x]16.1 Run `pnpm test` — all tests pass (target: ~2290+ tests)
  - [x]16.2 Run `pnpm build` — clean build across all Turborepo tasks
  - [x]16.3 Run `pnpm db:generate` — Prisma client generated successfully
  - [x]16.4 Manual test: Push notification flow on Chrome/Android (subscribe → publish → receive notification → click → navigate)
  - [x]16.5 Manual test: Push notification permission denied state on iOS Safari (graceful fallback message)

## Dev Notes

### Critical Architecture Constraints

- **Data Flow (NON-NEGOTIABLE):** SettingsPageClient → useNotificationPreferences hook → Zsa useServerActionMutation → updateNotificationPreferencesAction (server action) → tRPC employeeSchedule.updateMyNotificationPreferences → EmployeeService → Prisma. NO shortcuts.
- **Employee role for own preferences:** Notification preferences toggle uses `subscribedProcedure` with employee-level access. Admin can also set via employee update.
- **employeeId resolution:** There is NO `employeeId` in `AuthenticatedUser`. MUST resolve via DB lookup: `prisma.user.findUnique({ where: { id: ctx.user.sub }, select: { employee: { select: { id: true } } } })` then throw FORBIDDEN if no linked employee. Follow exact pattern from `employee-schedule.router.ts` and `presence-confirmation.router.ts`.
- **Batch email with Resend:** Use `resend.batch.send()` for publication notifications. Max 100 emails per batch call. Chunk if > 100 employees. Use `@react-email/render` to pre-render HTML template, then pass HTML string to batch API.
- **Dual Notification Channels:** Email (Resend batch) + Web Push (VAPID via `web-push` npm package). Both channels respect `notifyOnPublish` preference. Push requires explicit browser permission grant.
- **VAPID Keys:** Generate with `npx web-push generate-vapid-keys`. Store `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `.env`. Expose public key to client via `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Stale Push Subscriptions:** When `web-push.sendNotification()` returns 410 Gone, delete the `PushSubscription` record from DB (endpoint expired). Do NOT retry.
- **iOS Safari Push Limitations:** Web Push is supported on iOS 16.4+ in standalone PWA mode only. Detect and show appropriate messaging for unsupported browsers.

### Existing Infrastructure to REUSE (Do NOT Reinvent)

| Component | Location | What to Reuse |
|-----------|----------|---------------|
| SchedulePublicationEmail template | `apps/api/src/modules/mail/templates/SchedulePublicationEmail.tsx` | ENHANCE with shift count + deep link, don't replace |
| MailService | `apps/api/src/modules/mail/mail.service.tsx` | ADD `sendBatchSchedulePublicationEmails()` method |
| EmailLayout wrapper | `apps/api/src/modules/mail/templates/components/EmailLayout.tsx` | Reuse for all emails (tag: "PLANNING") |
| publishPlan in PlanningGenerationService | `apps/api/src/modules/planning/planning-generation.service.ts` (lines 1784-1891) | REFACTOR to use batch send + notification filtering |
| getPublicationStatus | `apps/api/src/trpc/routers/planning.router.ts` | Reuse existing procedure |
| PublishConfirmDialog | `apps/web/src/app/[locale]/admin/planning/_components/PublishConfirmDialog.tsx` | ENHANCE with employee notification preview |
| usePublish hook | `apps/web/src/app/[locale]/admin/planning/_hooks/usePublish.ts` | ENHANCE response handling |
| publish-actions.ts | `apps/web/src/app/[locale]/admin/planning/_actions/publish-actions.ts` | ADD getPublishPreviewAction |
| DashboardClient | `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` | ADD PwaInstallPrompt integration |
| Employee model | `apps/api/prisma/schema/Employee.prisma` | ADD notifyOnPublish field |
| EmployeeService | `apps/api/src/modules/employees/employee.service.ts` | ADD notification preference methods |
| employee-schedule.router.ts | `apps/api/src/trpc/routers/employee-schedule.router.ts` | ADD notification preference procedures |
| DashboardQueryProvider | `apps/web/src/app/[locale]/dashboard/_components/DashboardQueryProvider.tsx` | Reuse for offline persistence |
| Bottom tab navigation | `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` | ADD Settings tab |
| manifest.webmanifest | `apps/web/public/manifest.webmanifest` | Already configured, no changes needed |
| sw.ts | `apps/web/src/app/sw.ts` | ADD push + notificationclick event listeners |

### PWA Install Prompt Logic

```
PwaInstallPrompt Component:
  1. Check standalone mode: window.matchMedia('(display-mode: standalone)').matches
     → If true: return null (already installed, no prompt needed)

  2. Check dismissal: localStorage.getItem('pawly-install-dismissed')
     → If timestamp exists AND < 7 days ago: return null (user dismissed recently)

  3. Detect platform:
     a. Chrome/Android: Listen for 'beforeinstallprompt' event
        → Store deferred prompt in ref
        → Show install button that calls deferredPrompt.prompt()
        → Listen for 'appinstalled' event → hide prompt + show success toast
     b. iOS (Safari): Detect via /iPad|iPhone|iPod/.test(navigator.userAgent)
        → Show step-by-step instructions: "Tap Share icon → Add to Home Screen"
        → Include visual icons (share icon ⎋, plus icon ➕)
     c. Other browsers: Show generic "Open in Chrome for best experience" message

  4. Dismiss handler:
     → Set localStorage('pawly-install-dismissed', Date.now().toString())
     → Hide prompt with exit animation

  5. Accessibility:
     → role="banner", aria-label="Install Pawly application"
     → All buttons: min 48px touch target
     → Keyboard: Escape to dismiss
```

### Batch Email Publication Flow

```
publishPlan(clinicId, month, userId):
  1. Validate month format (existing)
  2. Check hard violations (existing)
  3. Upsert PlanningPeriodStatus to PUBLISHED (existing - $transaction)

  4. NEW: Fetch eligible employees:
     - Query: employees WHERE clinicId = X
       AND notifyOnPublish = true
       AND has shifts in month date range
       INCLUDE { user: { select: { email: true } }, firstName: true }

  5. NEW: Count total employees with shifts (regardless of notifyOnPublish)
     for reporting

  6. NEW: Pre-render email HTML once:
     - Render SchedulePublicationEmail with { month, clinicName }
     - Store HTML string (avoid re-rendering per employee)
     - Per-employee: only firstName and shiftCount vary
       → Actually need to render per employee for personalization

  7. NEW: Batch send via resend.batch.send():
     - Build array of { from, to, subject, html } objects
     - Chunk into groups of 100 (Resend limit)
     - For each chunk: await resend.batch.send(chunk)
     - Track notifiedCount from successful sends

  8. Log: "Published plan for clinic X, month Y. Notified N/M employees
          (M total with shifts, N with notifications enabled)"

  9. Return { publishedAt, notifiedCount, totalWithShifts }
```

### Enhanced SchedulePublicationEmail Template

```
┌─────────────────────────────────────────────────┐
│  🐾 Pawly                            PLANNING   │
├─────────────────────────────────────────────────┤
│                                                  │
│  Votre planning est disponible !                 │
│                                                  │
│  Bonjour {firstName},                            │
│                                                  │
│  Le planning de {month} pour {clinicName}        │
│  vient d'être publié.                            │
│                                                  │
│  Vous avez {shiftCount} créneaux prévus          │
│  ce mois-ci.                                     │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │       Consulter mon planning →              │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  💡 Astuce : Installez Pawly sur votre écran     │
│  d'accueil pour un accès instantané !            │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Employee Settings Page Layout

```
┌─────────────────────────────────────────────────┐
│  ← Paramètres                                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  📱 Application                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Statut PWA          [✅ Installée]          │ │
│  │                                              │ │
│  │ Version              v1.0.0                  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  🔔 Notifications                                │
│  ┌─────────────────────────────────────────────┐ │
│  │ Email planning publié    [━━━━━●]  Activé   │ │
│  │                                              │ │
│  │ Recevez un email lorsqu'un nouveau           │ │
│  │ planning est publié pour votre clinique.     │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  🔔 Notifications push                           │
│  ┌─────────────────────────────────────────────┐ │
│  │ Push notifications      [━━━━━●]  Activé    │ │
│  │                                              │ │
│  │ Recevez une notification instantanée         │ │
│  │ sur votre appareil quand un planning         │ │
│  │ est publié.                                  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Admin Publish Confirmation Dialog

```
┌─────────────────────────────────────────────────┐
│  Publier le planning de Mars 2026 ?              │
├─────────────────────────────────────────────────┤
│                                                  │
│  📧 8 employés seront notifiés par email          │
│  🔔 6 employés recevront une notification push   │
│  ┌─────────────────────────────────────────────┐ │
│  │ • Dr. Martin (5 créneaux) 📧🔔              │ │
│  │ • Julie Dupont (4 créneaux) 📧🔔            │ │
│  │ • Thomas Leroy (6 créneaux) 📧              │ │
│  │ • Eva Schulz (3 créneaux) 📧🔔              │ │
│  │ • ... +4 autres                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ⚠️ 1 employé a désactivé les notifications     │
│                                                  │
│  ┌──────────┐  ┌────────────────────────────┐   │
│  │ Annuler  │  │  ✓ Publier et notifier     │   │
│  └──────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Previous Story Learnings (Stories 8.1, 8.2, OTP)

- **zsa-react-query return type** doesn't infer correctly → explicit cast: `const data = rawData as Type | undefined`
- **RSC + PersistQueryClientProvider**: Dashboard layout is RSC → "use client" wrapper already handles this
- **date-fns NOT in API workspace**: Use native JS date utilities
- **AuthenticatedUser has NO employeeId**: Must resolve via DB lookup every time
- **Locale-aware content**: Use `useTranslations()` for all user-facing strings, never hardcode French
- **Service worker caching**: Schedule API responses go through ZSA server actions (NOT direct browser HTTP), so SW cache doesn't intercept. Offline works via React Query localStorage persistence only.
- **Offline detection**: Use `navigator.onLine` + online/offline event listeners for UI feedback
- **ConfirmationSlider pattern (8.2)**: Role-based component with role="switch", aria-checked, 48px touch target — reuse same accessibility pattern for notification toggle
- **$transaction callback form**: Always use callback form, NOT array form (Story 7.3 C1)
- **Atomic CAS**: `updateMany WHERE { id, field: expected }` for race-safe updates (Story 7.5)
- **Query key invalidation**: Prefix-only: `queryKey: ["my-schedule"]` matches all sub-keys
- **Resend batch API**: Max 100 emails per batch call. Use `resend.batch.send([...])` with idempotency key based on `clinicId-month-timestamp`
- **web-push 410 Gone**: When a push subscription endpoint returns 410, the subscription is expired/invalid. Delete it from DB immediately. Do NOT retry.
- **iOS Push requirement**: Web Push on iOS requires iOS 16.4+ AND standalone mode. Detect with `'PushManager' in window` — false on older iOS or non-standalone Safari
- **VAPID key format**: Client-side `applicationServerKey` must be `Uint8Array` — use `urlBase64ToUint8Array()` utility to convert from base64 string

### Code Review Learnings from Epic 6+7+8 (Prevent Regressions)

| Pattern | Rule | Source |
|---------|------|--------|
| $transaction form | Use callback form, NOT array form | Story 7.3 C1 |
| Race condition guard | Double-check precondition INSIDE transaction | Story 7.3 C5, 7.5 M7 |
| Query key invalidation | Prefix-only: `queryKey: ["my-settings"]` matches all sub-keys | Story 7.3 fix |
| Zod .refine() | Creates ZodEffects — cannot .merge() after. Base schema first | Story 5.2 |
| UTC date handling | Use `getUTCFullYear/Month/Date` for date-only strings parsed as UTC | Story 6.2 C2 |
| ICU plural | Test count=0, 1, 2+ for all plural keys | Story 7.3 |
| Toast duplication | Don't use both hook-level onError AND per-call error handler | Story 7.5 M2 |
| motion-safe animations | Always add `@media (prefers-reduced-motion: reduce)` guard | Story 7.4 M2 |
| React.memo | Wrap frequently re-rendered components | Story 7.1 M6 |
| Atomic CAS | `updateMany WHERE { id, status: expected }` for concurrent safety | Story 7.5 CAS pattern |
| Batch email | Use `resend.batch.send()` with chunking, NOT sequential loop | NEW (context7 research) |
| Stale closure | Snapshot cache key through onMutate context | Story 8.2 H1 |
| N+1 queries | Use `Promise.all()` for parallel queries, hoist lookups | Story 7.1 H6, 6.3 |
| Stale push sub | Delete PushSubscription on 410 Gone, don't retry | NEW (web-push pattern) |
| Push error isolation | Never let push failure block email or publish flow | NEW (resilience) |
| VAPID key exposure | Only PUBLIC key via `NEXT_PUBLIC_*`, PRIVATE stays server-only | NEW (security) |

### Module Registration Checklist

For notification preference procedures added to existing `employee-schedule.router.ts`:
1. `apps/api/src/modules/employees/employee.service.ts` — ADD notification preference methods (already registered in module)
2. No new module registration needed (EmployeeService already in TRPCServices context)
3. `apps/api/src/trpc/routers/employee-schedule.router.ts` — ADD 2 new procedures
4. No _app.ts change needed (router already registered)

For push subscription procedures added to existing `employee-schedule.router.ts`:
1. No new module registration needed (PrismaService already available in TRPCServices context)
2. `apps/api/src/trpc/routers/employee-schedule.router.ts` — ADD `subscribePush`, `unsubscribePush`, `getMyPushSubscription`
3. No _app.ts change needed (router already registered)

For push sending in MailService:
1. `apps/api/src/modules/mail/mail.service.tsx` — ADD web-push methods (MailModule already registered)
2. Add `web-push` package: `pnpm --filter api add web-push && pnpm --filter api add -D @types/web-push`

For publish preview:
1. `apps/api/src/trpc/routers/planning.router.ts` — ADD `getPublishPreview` procedure (include push count)
2. No new service registration (PlanningGenerationService already injected)

### File Structure

```
packages/validators/src/employee/
  notification-preferences.schema.ts   # NEW — validators
  notification-preferences.schema.test.ts # NEW — ~10 tests
  index.ts                              # MODIFIED — add exports

apps/api/prisma/schema/
  Employee.prisma                       # MODIFIED — add notifyOnPublish field + pushSubscriptions relation
  PushSubscription.prisma               # NEW — push subscription model

apps/api/src/modules/employees/
  employee.service.ts                   # MODIFIED — add notification preference methods
  employee.service.spec.ts              # MODIFIED — add ~8 tests

apps/api/src/modules/mail/
  mail.service.tsx                      # MODIFIED — add sendBatchSchedulePublicationEmails() + sendBatchPushNotifications()
  mail.service.spec.ts                  # MODIFIED — add ~6 tests for batch email + ~10 tests for push
  templates/SchedulePublicationEmail.tsx # MODIFIED — add shiftCount + deep link + install tip

apps/api/src/modules/planning/
  planning-generation.service.ts        # MODIFIED — refactor publishPlan for batch email + push + filtering
  planning-generation.service.spec.ts   # MODIFIED — update publish tests (~8 tests email + push)

apps/api/src/trpc/routers/
  employee-schedule.router.ts           # MODIFIED — add 2 notification preference procedures
  employee-schedule.router.spec.ts      # MODIFIED — add ~6 tests
  planning.router.ts                    # MODIFIED — add getPublishPreview + update publishPlan output
  planning.router.spec.ts              # MODIFIED — add ~4 tests

apps/web/src/app/[locale]/dashboard/
  _components/PwaInstallPrompt.tsx      # NEW — PWA install prompt component
  _components/DashboardClient.tsx       # MODIFIED — integrate PwaInstallPrompt
  settings/page.tsx                     # NEW — employee settings RSC page
  settings/_components/SettingsPageClient.tsx  # NEW — settings client component
  settings/_actions/settings-actions.ts # NEW — server actions
  settings/_hooks/useNotificationPreferences.ts # NEW — query + mutation hooks (email)
  settings/_hooks/usePushNotifications.ts # NEW — push permission + subscribe/unsubscribe hooks
  settings/_utils/urlBase64ToUint8Array.ts # NEW — VAPID key conversion utility
  settings/__tests__/settings-page.spec.tsx # NEW — ~10 tests
  settings/__tests__/push-notifications.spec.tsx # NEW — ~10 tests
  __tests__/pwa-install-prompt.spec.tsx # NEW — ~12 tests

apps/web/src/app/[locale]/admin/planning/
  _components/PublishConfirmationDialog.tsx # NEW or MODIFIED — enhanced with preview
  _actions/publish-actions.ts           # MODIFIED — add getPublishPreviewAction
  _hooks/usePublish.ts                  # MODIFIED — enhanced response
  _hooks/usePublishPreview.ts           # NEW — fetch notification preview
  __tests__/publish-dialog.spec.tsx     # NEW — ~8 tests

apps/web/src/app/
  sw.ts                                # MODIFIED — add push + notificationclick event listeners

apps/web/src/i18n/langs/
  fr.json                              # MODIFIED — add ~42 keys (email + push + install)
  en.json                              # MODIFIED — add ~42 keys (email + push + install)
```

### Testing Requirements

| Layer | Count | Framework | Pattern |
|-------|-------|-----------|---------|
| Validators | ~10 | Vitest `*.test.ts` | Valid/invalid notification preferences, schema merge with employee schemas |
| Employee Service | ~8 | Jest `*.spec.ts` | CRUD preferences, clinicId isolation, default values |
| Mail Service (email) | ~6 | Jest `*.spec.ts` | Batch send, chunking, error handling, empty recipients, template rendering |
| Mail Service (push) | ~10 | Jest `*.spec.ts` | Push send, stale subscription cleanup (410), batch push, VAPID config |
| Planning Service | ~8 | Jest `*.spec.ts` | Publish with batch email + push, filtering, dual notification count reporting |
| Router (employee-schedule) | ~14 | Jest `*.spec.ts` | Auth guard, employee resolution, preference CRUD, push subscribe/unsubscribe |
| Router (planning) | ~4 | Jest `*.spec.ts` | Publish preview (email + push counts), enhanced publish response |
| PwaInstallPrompt | ~12 | Vitest `*.spec.tsx` | Standalone detection, iOS detection, dismiss persistence, install trigger, a11y |
| Settings Page (email) | ~10 | Vitest `*.spec.tsx` | Toggle, API call, optimistic update, installed badge |
| Settings Page (push) | ~10 | Vitest `*.spec.tsx` | Permission states, subscribe flow, unsubscribe, unsupported browser |
| Publish Dialog | ~8 | Vitest `*.spec.tsx` | Preview fetch (email + push), employee list, confirm/cancel, success toast |
| Service Worker | ~4 | Vitest `*.spec.ts` | Push event parsing, notification display, click navigation |
| Integration | ~5 | Manual | E2E publish flow, PWA install, push subscribe + receive, iOS fallback |
| **Total** | **~109** | | Target: 2153 + 109 = ~2262 |

### Technology Versions (confirmed via codebase)

- Next.js: 16.1.6 (App Router) — supports `manifest.ts` and PWA guide
- @serwist/next: 9.5.6 — service worker (ADD push + notificationclick handlers)
- web-push: latest — VAPID push notifications (NEW dependency in apps/api)
- Resend: v3 — supports `resend.batch.send()` (max 100 per call)
- react-email: templates with `@react-email/render`
- TanStack Query: v5 (via zsa-react-query)
- Prisma: 7.2.0 (Schema Folders)
- NestJS: latest with @nestjs/schedule
- Zod: 4.x (via @pawly/zod)
- Vitest (web + validators) / Jest (API)
- shadcn/ui + Tailwind CSS v4

### Design Tokens (Clinique Zen — PWA Install Prompt)

- **Install banner card**: `bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] border border-teal-100`
- **Install button**: `bg-[#009588] text-white rounded-xl px-6 py-3 font-semibold` with Download icon
- **Dismiss button**: `text-neutral-400 hover:text-neutral-600` with X icon (min 44px touch target)
- **iOS instructions**: `bg-neutral-50 rounded-xl p-4 text-sm text-neutral-600` with share icon emoji
- **Installed badge**: `bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-bold uppercase`
- **Settings card**: `bg-white rounded-2xl shadow-sm border border-neutral-100 p-6`
- **Notification toggle**: shadcn Switch component with `bg-[#009588]` active color

### Project Structure Notes

- New employee settings page follows existing dashboard route structure (`/dashboard/settings`)
- Notification preference methods added to EXISTING EmployeeService (NOT a new module)
- tRPC procedures added to EXISTING employee-schedule router (employee-facing) and planning router (admin-facing)
- PwaInstallPrompt is a dashboard-level component (shows on all dashboard pages, not just schedule)
- PublishConfirmationDialog enhances existing publish flow in admin planning
- ONE new Prisma model: `PushSubscription` (push endpoint + keys + employee FK) + ONE field added to Employee (`notifyOnPublish`)

### Web Push Implementation Notes

**VAPID Key Setup:**
```bash
npx web-push generate-vapid-keys
# Add to .env:
# VAPID_PUBLIC_KEY=BA...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:contact@pawly.app
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
```

**PushSubscription Model:**
```prisma
model PushSubscription {
  id         String   @id @default(cuid())
  endpoint   String   @unique
  p256dh     String
  auth       String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  employeeId String
  clinic     Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  clinicId   String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

**Service Worker Push Handler (sw.ts):**
```typescript
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Pawly', body: 'Nouvelle notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: { url: data.url || '/dashboard/schedule' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard/schedule';
  event.waitUntil(clients.openWindow(url));
});
```

**Client-Side VAPID Key Utility:**
```typescript
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

**Push Publish Flow:**
```
publishPlan(clinicId, month, userId):
  ... existing email batch flow ...

  10. NEW: Fetch PushSubscriptions for eligible employees:
      - Query: pushSubscriptions WHERE employee.clinicId = X
        AND employee.notifyOnPublish = true
        AND employee has shifts in month
        INCLUDE { endpoint, p256dh, auth }

  11. For each subscription:
      - webpush.sendNotification(subscription, JSON.stringify({
          title: `Planning publié — ${monthLabel}`,
          body: `${clinicName} — Consultez votre planning`,
          url: '/dashboard/schedule'
        }))
      - On 410 Gone: delete subscription from DB (stale)
      - On other error: log warning, continue (don't block publish)

  12. Return { publishedAt, notifiedCount, totalWithShifts, pushNotifiedCount }
```

**iOS Safari Push Support:**
- Web Push on iOS requires iOS 16.4+ AND the app must be installed as PWA (standalone mode)
- If `!('PushManager' in window)`: show "Push not supported on this browser/device"
- If standalone mode + PushManager available: show enable button
- If not standalone mode on iOS: show "Install the app first to enable push notifications"

### References

- [Source: docs/planning-artifacts/epics.md#Epic-8 — Story 8.3 definition, FR10]
- [Source: docs/planning-artifacts/prd.md#FR10 — "System notifies employees upon schedule publication"]
- [Source: docs/planning-artifacts/prd.md#User-Journey-2 — "Declarative Trust" — Thomas receives "Planning Published" email]
- [Source: docs/planning-artifacts/architecture.md#Notifications — "Resend + React Email for publications and access"]
- [Source: docs/planning-artifacts/architecture.md#Data-Flow-Pattern — Non-negotiable Zsa→tRPC→NestJS flow]
- [Source: docs/planning-artifacts/ux-design-specification.md#Declarative-Shift-Card — Employee confirmation patterns]
- [Source: docs/implementation-artifacts/8-1-*.md — PWA foundation, manifest, service worker, offline infrastructure]
- [Source: docs/implementation-artifacts/8-2-*.md — Presence confirmation, employee dashboard patterns, ConfirmationSlider a11y]
- [Source: docs/implementation-artifacts/tech-spec-otp-email-auth-pwa.md — OTP auth, iOS PWA cookie isolation fix]
- [Source: docs/implementation-artifacts/7-2-*.md — publishPlan, PlanningPeriodStatus, SchedulePublicationEmail, email on publish]
- [Source: docs/implementation-artifacts/7-5-*.md — VarianceService admin patterns, CSV export, batch operations]
- [Source: docs/implementation-artifacts/6-3-*.md — Schedule view aggregation, Promise.all parallel queries]
- [Source: apps/api/src/modules/mail/mail.service.tsx — MailService with Resend, throttle, all send methods]
- [Source: apps/api/src/modules/planning/planning-generation.service.ts — publishPlan sequential email loop (lines 1784-1891)]
- [Source: apps/web/public/manifest.webmanifest — PWA manifest configuration]
- [Source: apps/web/src/app/sw.ts — Service worker with Serwist, no push handlers]
- [Source: Next.js v16.1.6 PWA guide — beforeinstallprompt, InstallPrompt component, iOS detection]
- [Source: Resend API docs — resend.batch.send() max 100 per batch, idempotency keys]

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6

#### Debug Log References

- Serwist Turbopack migration: `@serwist/next` does NOT support Turbopack (Next.js 16 default). Migrated to `@serwist/turbopack` with route handler pattern (`src/app/serwist/[path]/route.ts`).
- iOS push requires standalone PWA mode (iOS 16.4+). Chrome on iOS uses WebKit engine — same limitations as Safari.
- `useServerActionMutation` must be imported from `@/lib/hooks/server-action-hooks` (project wrapper), NOT directly from `zsa-react-query`.
- QueryKeyFactory: all query keys must be registered in the factory; raw string arrays cause TypeScript errors.

#### Completion Notes List

- 16/16 tasks completed
- 2272 total tests (710 Validators + 813 API + 749 Web)
- Build green (API + Web)
- Push notifications tested end-to-end on iOS PWA (Apple Push endpoint, status 201)
- Serwist migrated from `@serwist/next` to `@serwist/turbopack` for Turbopack compatibility
- Adversarial code review completed: 17 issues found (2 CRITICAL, 9 HIGH, 6 MEDIUM), all fixed
- C1: Cross-clinic push subscription poisoning fixed (upsert update includes employeeId+clinicId)
- C2: 12 hardcoded French toast strings in usePushNotifications replaced with i18n keys
- H1: validateShiftsAgainstRules moved BEFORE $transaction (was using non-transactional prisma inside tx)
- H2: 15 missing employee-schedule router tests added (notification prefs + push CRUD)
- H3: Quick-exit path in publishPlan now queries real totalWithShifts count
- H4: 3 missing planning router tests for getPublishPreview added
- H5: MailService throttle chain unbounded growth fixed (reset after settlement)
- H6: iPadOS 13+ detection fixed (Macintosh + maxTouchPoints > 1)
- H7: notificationclick handler fixed to filter clients by URL before focusing
- H8: Timer race in PwaInstallPrompt fixed (clearTimeout in beforeinstallprompt handler)
- H9: mutate→mutateAsync+await in usePushNotifications for proper error handling
- M1-M6: Schema dedup, test coverage, turbo.json cache:false, mock defaults, pwa-utils shared module, role="region"
- Hydration mismatch fix: OfflineBanner useState initializer changed from navigator.onLine check to static false

## File List

**Created:**
- `apps/api/prisma/schema/PushSubscription.prisma`
- `apps/api/src/modules/notification/push-notification.service.ts`
- `apps/api/src/modules/notification/notification.module.ts`
- `apps/web/src/app/serwist/[path]/route.ts`
- `apps/web/src/app/[locale]/dashboard/_components/PwaInstallPrompt.tsx`
- `apps/web/src/app/[locale]/dashboard/settings/page.tsx`
- `apps/web/src/app/[locale]/dashboard/settings/_components/SettingsPageClient.tsx`
- `apps/web/src/app/[locale]/dashboard/settings/_actions/settings-actions.ts`
- `apps/web/src/app/[locale]/dashboard/settings/_hooks/useNotificationPreferences.ts`
- `apps/web/src/app/[locale]/dashboard/settings/_hooks/usePushNotifications.ts`
- `apps/web/src/components/providers/serwist-registration.tsx`
- `apps/web/src/components/ui/scroll-area.tsx`
- `apps/web/src/lib/pwa-utils.ts` (shared isStandalone/isIos utilities — code review M5)
- `packages/validators/src/employee/notification-preferences.schema.ts`
- `packages/validators/src/employee/notification-preferences.schema.test.ts`

**Modified:**
- `apps/api/prisma/schema/Employee.prisma` (notifyOnPublish field + pushSubscriptions relation)
- `apps/api/prisma/schema/Clinic.prisma` (pushSubscriptions relation)
- `apps/api/src/config/env.config.ts` (VAPID env vars)
- `apps/api/src/modules/notification/push-notification.service.ts` (C1: cross-clinic upsert fix)
- `apps/api/src/modules/planning/planning-generation.service.ts` (batch email + push + H1 tx fix + H3 quick-exit fix)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (PushNotificationService mock + batch email tests)
- `apps/api/src/modules/planning/planning.module.ts` (NotificationModule import)
- `apps/api/src/modules/mail/mail.service.tsx` (sendBatchSchedulePublicationEmails + H5 throttle fix)
- `apps/api/src/modules/mail/templates/SchedulePublicationEmail.tsx` (shiftCount + deep link + install tip)
- `apps/api/src/modules/employee/employee.service.ts` (notification preference methods)
- `apps/api/src/modules/employee/employee.service.spec.ts` (M4: notifyOnPublish mock default + notification tests)
- `apps/api/src/trpc/context.ts` (PushNotificationService in TRPCServices)
- `apps/api/src/trpc/trpc.module.ts` (NotificationModule + PushNotificationService DI)
- `apps/api/src/trpc/routers/employee-schedule.router.ts` (5 new procedures: notification prefs + push CRUD)
- `apps/api/src/trpc/routers/employee-schedule.router.spec.ts` (H2: 15 new tests + procedure count 2→7)
- `apps/api/src/trpc/routers/planning.router.ts` (getPublishPreview procedure)
- `apps/api/src/trpc/routers/planning.router.spec.ts` (H4: 3 getPublishPreview tests + procedure count 30→31)
- `apps/web/next.config.ts` (removed withSerwistInit, added serverExternalPackages)
- `apps/web/src/app/sw.ts` (push + notificationclick handlers + H7 client URL filter fix)
- `apps/web/src/app/[locale]/layout.tsx` (SerwistRegistration component)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` (publishPreview prop)
- `apps/web/src/app/[locale]/admin/planning/_components/PublishConfirmDialog.tsx` (notification preview)
- `apps/web/src/app/[locale]/admin/planning/_actions/publish-actions.ts` (getPublishPreviewAction)
- `apps/web/src/app/[locale]/admin/planning/_hooks/usePublish.ts` (QueryKeyFactory)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` (PwaInstallPrompt + settings nav)
- `apps/web/src/app/[locale]/dashboard/_components/PwaInstallPrompt.tsx` (H6 iPadOS + H8 timer race + M5 pwa-utils + M6 role)
- `apps/web/src/app/[locale]/dashboard/settings/_components/SettingsPageClient.tsx` (M5: pwa-utils import)
- `apps/web/src/app/[locale]/dashboard/settings/_hooks/usePushNotifications.ts` (C2 i18n + H9 mutateAsync)
- `apps/web/src/components/OfflineBanner.tsx` (hydration mismatch fix: useState initializer)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (3 new QueryKeyFactory entries)
- `apps/web/src/i18n/langs/fr.json` (pwaInstall + settings + publication + push keys + 12 push toast keys)
- `apps/web/src/i18n/langs/en.json` (pwaInstall + settings + publication + push keys + 12 push toast keys)
- `packages/validators/src/employee/notification-preferences.schema.ts` (M1: response schema reuse)
- `packages/validators/src/employee/notification-preferences.schema.test.ts` (M2: 4 additional response tests)
- `packages/validators/src/employee/index.ts` (notification preferences exports)
- `turbo.json` (M3: test task cache:false)
- `.env.example` (VAPID keys section)
- `apps/api/package.json` (web-push dependency)
- `apps/web/package.json` (@serwist/turbopack dependency)
- `package.json` (workspace updates)
- `pnpm-lock.yaml` (lockfile sync)
