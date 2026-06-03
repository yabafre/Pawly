# Story 10.2: Admin Settings — Clinic & Profile Management

Status: done

## User Story

As an admin user,
I want to manage my clinic information and personal account settings from the settings page,
so that I can update my clinic name, change my password, and configure my preferences without contacting support.

## Acceptance Criteria

1. **Given** the admin settings page **When** I navigate to it **Then** I see 4 tabs: "Clinique", "Général", "Types de shift", "Mon compte".

2. **Given** the "Clinique" tab **When** I view it **Then** I see the clinic name (editable), the slug (read-only, auto-generated), and the creation date.

3. **Given** the "Clinique" tab **When** I edit the clinic name and save **Then** the name is updated in DB, the slug is regenerated, the admin header reflects the new name immediately, and a success toast is shown.

4. **Given** the "Mon compte" tab **When** I view it **Then** I see my name (editable), my email (read-only), and my language preference (FR/EN select).

5. **Given** the "Mon compte" tab **When** I edit my name or language and save **Then** the user record is updated, the locale change takes effect on next page load, and a success toast is shown.

6. **Given** the "Mon compte" tab **When** I want to change my password **Then** I see a "Change password" section with current password, new password, and confirm password fields, with the same strength indicator as the reset password page.

7. **Given** the change password form **When** I enter a wrong current password **Then** I see an error "Current password is incorrect".

8. **Given** the change password form **When** I enter a valid current password and a new password meeting all criteria **Then** my password is updated (bcrypt 12 rounds), and a success toast is shown.

9. **Given** the language preference change **When** I switch from FR to EN (or vice versa) **Then** the `User.locale` field is updated in DB, and the app navigates to the new locale URL.

10. **Given** any tab with unsaved changes **When** I try to switch tabs **Then** changes are saved or discarded (no blocking dialog needed — each section saves independently).

## Tasks

- [x] Task 1: Validators (AC: #3, #5, #6, #8)
  - [x] 1.1 Create `packages/validators/src/clinic/clinic-profile.schema.ts`
    - `updateClinicNameSchema` — name (string, 2-100 chars, trimmed)
  - [x] 1.2 Create `packages/validators/src/auth/change-password.schema.ts`
    - `changePasswordSchema` — currentPassword (string, min 1), newPassword (same rules as reset: 8+ chars, uppercase, lowercase, digit)
  - [x] 1.3 Create `packages/validators/src/auth/update-profile.schema.ts`
    - `updateAdminProfileSchema` — name (string, 2-100 chars, optional), locale (enum fr/en, optional)
  - [x] 1.4 Export from index files
  - [x] 1.5 Write validator tests (~15 tests)

- [x] Task 2: Backend — Auth service methods (AC: #5, #8)
  - [x] 2.1 `changePassword(userId: string, currentPassword: string, newPassword: string)` in auth.service.ts:
    - Verify user exists and has a password (admin only)
    - Compare currentPassword with bcrypt
    - Hash new password (bcrypt 12 rounds)
    - Update user record
    - Return success
  - [x] 2.2 `updateAdminProfile(userId: string, data: { name?, locale? })` in auth.service.ts or clinic.service.ts:
    - Update user name and/or locale
    - Return updated user

- [x] Task 3: Backend — tRPC endpoints (AC: #3, #5, #8)
  - [x] 3.1 Add `changePassword` protected procedure to auth.router.ts (ADMIN only)
  - [x] 3.2 Add `updateAdminProfile` protected procedure to auth.router.ts (ADMIN only)
  - [x] 3.3 Verify existing `clinic.updateClinicName` works correctly (already exists)

- [x] Task 4: Frontend — Server actions + hooks
  - [x] 4.1 Create `apps/web/src/app/[locale]/admin/settings/_actions/settings-actions.ts`
    - `changePasswordAction`, `updateAdminProfileAction`, `updateClinicNameAction`
  - [x] 4.2 Create `apps/web/src/app/[locale]/admin/settings/_hooks/useAdminProfile.ts`
    - `useAdminProfile()` — fetch admin name, email, locale via `auth.getMe`
    - `useChangePassword()` — mutation
    - `useUpdateProfile()` — mutation

- [x] Task 5: Frontend — ClinicProfilePanel component (AC: #2, #3)
  - [x] 5.1 Create `apps/web/src/app/[locale]/admin/settings/_components/ClinicProfilePanel.tsx`
    - Clinic name input (editable) + save button
    - Slug display (read-only, muted)
    - Creation date (formatted, read-only)
    - Uses existing `clinic.getProfile` + `clinic.updateClinicName`

- [x] Task 6: Frontend — AdminAccountPanel component (AC: #4, #5, #6, #7, #8, #9)
  - [x] 6.1 Create `apps/web/src/app/[locale]/admin/settings/_components/AdminAccountPanel.tsx`
    - Name input (editable) + save
    - Email display (read-only, muted)
    - Language select (FR/EN) with immediate save
    - Change password section (collapsible or always visible):
      - Current password field (with eye toggle)
      - New password field (with eye toggle + PasswordStrength progress bar)
      - Confirm password field (with eye toggle)
      - Mismatch indicator
      - Submit button
  - [x] 6.2 Extract `PasswordStrength` component from ResetPasswordClient to shared `components/ui/password-strength.tsx`

- [x] Task 7: Frontend — Update SettingsTabs (AC: #1)
  - [x] 7.1 Add "Clinique" tab (first position) rendering `ClinicProfilePanel`
  - [x] 7.2 Add "Mon compte" tab (last position) rendering `AdminAccountPanel`
  - [x] 7.3 Update i18n keys for new tab labels

- [x] Task 8: i18n translations FR/EN (AC: all)
  - [x] 8.1 Add `settings.tabs.clinic`, `settings.tabs.account` tab labels
  - [x] 8.2 Add `settings.clinic.*` keys (name, slug, createdAt, save, success)
  - [x] 8.3 Add `settings.account.*` keys (name, email, locale, changePassword, currentPassword, newPassword, confirmPassword, save, success, wrongPassword)

- [x] Task 9: Tests + TypeScript check
  - [x] 9.1 Validator tests (~15 tests)
  - [x] 9.2 TypeScript 0 errors
  - [x] 9.3 All existing tests still pass

## Dev Notes

### Technical Notes

#### Existing Infrastructure to Reuse
- `clinic.getProfile` tRPC endpoint — returns clinic name (extend to include slug, createdAt)
- `clinic.updateClinicName` tRPC endpoint — already updates name + regenerates slug
- `auth.getMe` tRPC endpoint — returns role, email, employeeId (extend to include name, locale)
- `generateSlug()` utility in `apps/api/src/common/utils/slug.ts`
- `PasswordStrength` component from reset-password page (extract to shared)
- Design system: Warm Linen tokens, rounded-2xl cards, shadcn components

#### Data Flow
- Component → Hook → Zsa Server Action → tRPC → NestJS Service → Prisma

#### Security
- `changePassword` must verify current password before allowing change
- Admin-only endpoints (role check in tRPC middleware)
- Email is read-only (changing email requires a separate verification flow — out of scope)

#### Locale Change Behavior
- Update `User.locale` in DB
- Use `useRouter` from `@/i18n/navigation` to navigate to new locale URL
- The middleware (`proxy.ts`) + `next-intl` routing handles the rest

## File List

_Not recorded._
