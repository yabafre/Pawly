import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import {
  assertE2eApi,
  provisionClinic,
  registerTenant,
  signInAs,
  trpcMutation,
  trpcQuery,
  type ProvisionedClinic,
  type Tenant,
} from '../support/api';
import { errorToast, toast } from '../support/ui';

/**
 * Setting the clinic up — Story 5-3 (work days, hours, closed and special days),
 * Story 5-7 (24/7), Story 5-5 (planning assistance rules), Story 6-1 (week
 * templates) and Story 10-2 (settings: clinic profile and admin account).
 *
 * Every test works on a clinic it registered itself. The seeded "Clinique Zen
 * Dev" has no `ClinicConfig` at all (the seed stops at clinic + users +
 * employee), so the operational tab cannot even load against it — and a journey
 * that rewrites opening hours has no business doing it to shared fixture data.
 */

const NEW_TENANT_PASSWORD = 'VoisineMdp2026!';

async function openSettings(page: Page, tab: string) {
  await page.goto(`/fr/admin/settings?tab=${tab}`);
  await expect(page.getByRole('heading', { name: 'Paramètres', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

test.beforeEach(async ({ request }) => {
  await assertE2eApi(request);
});

test.describe('clinic hours and days (5-3, 5-7)', () => {
  let tenant: Tenant;

  test.beforeEach(async ({ page, request }) => {
    tenant = await registerTenant(request, 'Horaires');
    await signInAs(page, request, tenant.adminEmail, tenant.adminPassword);
  });

  // AC1 + AC6 — work days and default hours are validated, saved, and confirmed.
  test('work days and default hours are saved and read back', async ({ page, request }) => {
    await openSettings(page, 'operational');

    await page.getByLabel('Samedi').uncheck();
    await page.getByLabel('Lundi').uncheck();
    await page.locator('#defaultStartTime').fill('07:30');
    await page.locator('#defaultEndTime').fill('20:15');
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(toast(page, 'Configuration opérationnelle mise à jour')).toBeVisible();

    // AC7 — and the normalized contract planning reads carries the same values.
    const config = await trpcQuery<{
      workDays: string[];
      defaultStartTime: string;
      defaultEndTime: string;
      is24_7: boolean;
    }>(request, tenant.token, 'clinic.getOperationalConfig');
    expect(config.workDays).not.toContain('MONDAY');
    expect(config.workDays).toContain('TUESDAY');
    expect(config.defaultStartTime).toBe('07:30');
    expect(config.defaultEndTime).toBe('20:15');
    expect(config.is24_7).toBe(false);
  });

  // AC5 — an end before the start is refused inline and nothing is written.
  test('an end time before the start time is refused', async ({ page, request }) => {
    await openSettings(page, 'operational');

    await page.locator('#defaultStartTime').fill('18:00');
    await page.locator('#defaultEndTime').fill('09:00');
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(page.getByText("L'heure de fin doit être après l'heure de début.")).toBeVisible();

    const config = await trpcQuery<{ defaultStartTime: string }>(
      request,
      tenant.token,
      'clinic.getOperationalConfig'
    );
    expect(config.defaultStartTime).toBe('08:00');
  });

  // AC5 — a week with no work day at all is refused.
  test('a week with no work day is refused', async ({ page }) => {
    await openSettings(page, 'operational');

    for (const day of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']) {
      await page.getByLabel(day).uncheck();
    }
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(page.getByText('Sélectionnez au moins un jour de travail.')).toBeVisible();
  });

  // Story 5-7 — the toggle greys the hour inputs out and lifts the end > start rule.
  test('24/7 disables the hour inputs and accepts identical times', async ({ page, request }) => {
    await openSettings(page, 'operational');

    await page.locator('#defaultEndTime').fill('08:00'); // identical to the start
    await page.getByLabel('Ouvert 24h/24').check();

    await expect(page.locator('#defaultStartTime')).toBeDisabled();
    await expect(page.locator('#defaultEndTime')).toBeDisabled();

    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();
    await expect(toast(page, 'Configuration opérationnelle mise à jour')).toBeVisible();

    const config = await trpcQuery<{ is24_7: boolean; defaultEndTime: string }>(
      request,
      tenant.token,
      'clinic.getOperationalConfig'
    );
    expect(config.is24_7).toBe(true);
    expect(config.defaultEndTime).toBe('08:00');
  });

  // AC2 — closed days persist as clinic-level blocking dates.
  test('a closed day is added and persisted', async ({ page, request }) => {
    await openSettings(page, 'operational');

    await expect(page.getByText('Aucun jour fermé configuré.')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un jour fermé' }).click();
    await page.locator('#closed-day-date-0').fill('2026-12-25');
    await page.locator('#closed-day-reason-0').fill('Noël');
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(toast(page, 'Configuration opérationnelle mise à jour')).toBeVisible();

    const config = await trpcQuery<{ closedDays: Array<{ date: string; reason: string }> }>(
      request,
      tenant.token,
      'clinic.getOperationalConfig'
    );
    expect(config.closedDays).toHaveLength(1);
    expect(config.closedDays[0]).toMatchObject({ date: '2026-12-25', reason: 'Noël' });
  });

  // AC3 — special days persist as date-specific overrides.
  test('a special day is added with its own hours', async ({ page, request }) => {
    await openSettings(page, 'operational');

    await page.getByRole('button', { name: 'Ajouter un jour spécial' }).click();
    await page.locator('#special-day-date-0').fill('2026-12-24');
    await page.locator('#special-day-label-0').fill('Réveillon');
    await page.locator('#special-day-start-0').fill('09:00');
    await page.locator('#special-day-end-0').fill('13:00');
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(toast(page, 'Configuration opérationnelle mise à jour')).toBeVisible();

    const config = await trpcQuery<{
      specialDays: Array<{ date: string; startTime: string; endTime: string; label: string }>;
    }>(request, tenant.token, 'clinic.getOperationalConfig');
    expect(config.specialDays).toHaveLength(1);
    expect(config.specialDays[0]).toMatchObject({
      date: '2026-12-24',
      startTime: '09:00',
      endTime: '13:00',
      label: 'Réveillon',
    });
  });

  // AC5 — the same date cannot be both closed and special.
  test('a date cannot be closed and special at once', async ({ page }) => {
    await openSettings(page, 'operational');

    await page.getByRole('button', { name: 'Ajouter un jour fermé' }).click();
    await page.locator('#closed-day-date-0').fill('2026-11-11');
    await page.getByRole('button', { name: 'Ajouter un jour spécial' }).click();
    await page.locator('#special-day-date-0').fill('2026-11-11');
    await page.locator('#special-day-start-0').fill('10:00');
    await page.locator('#special-day-end-0').fill('12:00');
    await page.getByRole('button', { name: 'Enregistrer la configuration opérationnelle' }).click();

    await expect(page.getByText('Une date ne peut pas être fermée et spéciale.')).toBeVisible();
  });
});

test.describe('shift types (5-5 building blocks, 6-1 AC2)', () => {
  let tenant: Tenant;

  test.beforeEach(async ({ page, request }) => {
    tenant = await registerTenant(request, 'Quarts');
    await signInAs(page, request, tenant.adminEmail, tenant.adminPassword);
  });

  test('a shift type is created and listed', async ({ page, request }) => {
    await openSettings(page, 'shiftTypes');
    await page.getByRole('button', { name: 'Ajouter un type de quart' }).click();

    const sheet = page.getByRole('dialog');
    await sheet.getByPlaceholder('ex : Matin, Chirurgie').fill('Nuit');
    await sheet.locator('input[type="time"]').first().fill('20:00');
    await sheet.locator('input[type="time"]').nth(1).fill('23:30');
    await sheet.getByRole('button', { name: 'Ajouter un type de quart' }).click();

    await expect(toast(page, 'Type de quart créé')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nuit' })).toBeVisible();

    const types = await trpcQuery<Array<{ code: string; startTime: string }>>(
      request,
      tenant.token,
      'clinic.listShiftTypes',
      {}
    );
    expect(types.map((t) => t.code)).toContain('NUIT');
  });

  /**
   * Story 13-4 pushed L.3121-16 into the shift-type schema itself: over six
   * worked hours, a 20-minute break is mandatory. The admin should not be able
   * to persist a type that every later write would reject.
   */
  test('a shift over six hours without a break is refused', async ({ page }) => {
    await openSettings(page, 'shiftTypes');
    await page.getByRole('button', { name: 'Ajouter un type de quart' }).click();

    const sheet = page.getByRole('dialog');
    await sheet.getByPlaceholder('ex : Matin, Chirurgie').fill('Longue');
    await sheet.locator('input[type="time"]').first().fill('08:00');
    await sheet.locator('input[type="time"]').nth(1).fill('18:00');
    await sheet.getByPlaceholder('ex : 60').fill('0');
    await sheet.getByRole('button', { name: 'Ajouter un type de quart' }).click();

    await expect(errorToast(page)).toBeVisible();
  });
});

test.describe('planning assistance rules (5-5)', () => {
  // The rules screen sits behind `SubscriptionGate requiredTier="professional"`.
  test('a starter clinic is offered the upgrade instead of the rules', async ({
    page,
    request,
  }) => {
    const tenant = await registerTenant(request, 'Starter');
    await signInAs(page, request, tenant.adminEmail, tenant.adminPassword);

    await page.goto('/fr/admin/planning/rules');
    await expect(page.getByRole('heading', { name: 'Fonctionnalité indisponible' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: 'Améliorer le plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter une règle' })).toHaveCount(0);
  });

  // AC1 + AC7 — a staffing minimum rule, stored for this clinic only.
  test('a staffing minimum rule is created and listed', async ({ page, request }) => {
    const clinic = await provisionClinic(request, { label: 'Regles', professional: true });
    await signInAs(page, request, clinic.adminEmail, clinic.adminPassword);

    await page.goto('/fr/admin/planning/rules');
    // A statutory CONTRACT_COMPLIANCE rule ships with every clinic, so the list
    // is never empty — the assertions below name the rule this test creates.
    await expect(page.getByRole('heading', { name: 'French labor-law limits' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Ajouter une règle' }).click();

    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Nom de la règle').fill('Au moins 1 ASV le jour');
    await sheet.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Journée (JOUR)' }).click();
    await sheet.getByRole('button', { name: 'Ajouter une règle' }).click();

    await expect(toast(page, 'Règle de planning créée')).toBeVisible();
    await expect(page.getByText('Au moins 1 ASV le jour')).toBeVisible();

    const rules = await trpcQuery<Array<{ name: string; category: string }>>(
      request,
      clinic.token,
      'planning.listRules',
      {}
    );
    const created = rules.find((r) => r.name === 'Au moins 1 ASV le jour');
    expect(created?.category).toBe('STAFFING_MINIMUM');
  });
});

test.describe('week templates (6-1)', () => {
  let clinic: ProvisionedClinic;

  test.beforeEach(async ({ page, request }) => {
    clinic = await provisionClinic(request, { label: 'Modeles', employees: 1 });
    await signInAs(page, request, clinic.adminEmail, clinic.adminPassword);
  });

  // AC3 — the list shows the clinic's templates with their day/slot counts.
  test('the provisioned template is listed with its week summary', async ({ page }) => {
    await page.goto('/fr/admin/planning/templates');
    await expect(page.getByText('Semaine type E2E')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('5 jours configurés')).toBeVisible();
  });

  // AC1 + AC2 + AC5 + AC6 — build one from the editor, slot by slot.
  test('a template is created from the editor', async ({ page, request }) => {
    await page.goto('/fr/admin/planning/templates');
    await expect(page.getByText('Semaine type E2E')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Nouveau modèle' }).click();

    const editor = page.getByRole('dialog');
    await editor.getByPlaceholder('ex. Semaine standard').fill('Modèle du samedi');
    await editor.getByRole('button', { name: 'Ajouter un créneau' }).first().click();
    await editor.getByRole('spinbutton', { name: 'Personnel requis' }).first().fill('2');
    await editor.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(toast(page, 'Modèle créé')).toBeVisible();
    await expect(page.getByText('Modèle du samedi')).toBeVisible();

    const templates = await trpcQuery<Array<{ name: string; data: { days: unknown[] } }>>(
      request,
      clinic.token,
      'planning.listTemplates',
      {}
    );
    const created = templates.find((t) => t.name === 'Modèle du samedi');
    expect(created).toBeTruthy();
  });

  // AC4 — duplication copies the structure under a new name.
  test('a template can be duplicated and deleted', async ({ page, request }) => {
    await page.goto('/fr/admin/planning/templates');
    await expect(page.getByText('Semaine type E2E')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Actions du modèle' }).first().click();
    await page.getByRole('menuitem', { name: 'Dupliquer' }).click();
    await expect(toast(page, 'Modèle dupliqué')).toBeVisible();

    const afterCopy = await trpcQuery<Array<{ name: string }>>(
      request,
      clinic.token,
      'planning.listTemplates',
      {}
    );
    expect(afterCopy).toHaveLength(2);
    const copy = afterCopy.find((t) => t.name !== 'Semaine type E2E');
    expect(copy?.name).toContain('Semaine type E2E');

    await page.getByRole('button', { name: 'Actions du modèle' }).first().click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(toast(page, 'Modèle supprimé')).toBeVisible();

    const afterDelete = await trpcQuery<Array<{ name: string }>>(
      request,
      clinic.token,
      'planning.listTemplates',
      {}
    );
    expect(afterDelete).toHaveLength(1);
  });
});

test.describe('admin settings (10-2)', () => {
  let tenant: Tenant;

  test.beforeEach(async ({ page, request }) => {
    tenant = await registerTenant(request, 'Reglages');
    await signInAs(page, request, tenant.adminEmail, tenant.adminPassword);
  });

  // AC1 — the tab strip. The shipped UI has five, not the four the story lists:
  // billing was folded in here by the 2026-06-18 quick spec.
  test('the settings page shows its tabs', async ({ page }) => {
    await openSettings(page, 'account');

    for (const label of ['Mon compte', 'Clinique', 'Général', 'Types de quarts', 'Facturation']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
  });

  /**
   * AC2 + AC3 — KNOWN BUG. `updateClinicNameAction` posts `{ name }` while
   * `clinic.updateClinicName` validates `updateClinicNameSchema`, which wants
   * `{ clinicName }`. Every rename is a tRPC input error, so an admin can never
   * rename their clinic from the settings page.
   */
  test.fail('renaming the clinic updates the header and the slug', async ({ page, request }) => {
    await openSettings(page, 'clinic');

    await expect(page.getByLabel('Nom de la clinique')).toHaveValue(tenant.clinicName);
    await page.getByLabel('Nom de la clinique').fill('Clinique Renommée E2E');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(toast(page, 'Nom de la clinique mis à jour')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Clinique Renommée E2E').first()).toBeVisible();

    const profile = await trpcQuery<{ name: string; slug: string }>(
      request,
      tenant.token,
      'clinic.getProfile'
    );
    expect(profile.name).toBe('Clinique Renommée E2E');
    expect(profile.slug).toContain('clinique-renommee-e2e');
  });

  // AC4 + AC5 — the account tab edits the name and shows the read-only email.
  test('the admin name is editable and the email is not', async ({ page, request }) => {
    await openSettings(page, 'account');

    await expect(page.getByText(tenant.adminEmail)).toBeVisible();
    await page.getByLabel('Nom', { exact: true }).fill('Nouveau Nom Admin');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(toast(page, 'Profil mis à jour')).toBeVisible();

    const me = await trpcQuery<{ name: string }>(request, tenant.token, 'auth.getMe');
    expect(me.name).toBe('Nouveau Nom Admin');
  });

  // AC7 — a wrong current password is refused. What the admin actually sees is
  // the generic failure toast (see the next test for why).
  test('changing the password with a wrong current one is refused', async ({ page }) => {
    await openSettings(page, 'account');

    await page.locator('#current-pwd').fill('PasLeBonMdp123!');
    await page.locator('#new-pwd').fill('EncoreUnAutre2026!');
    await page.locator('#confirm-pwd').fill('EncoreUnAutre2026!');
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

    await expect(errorToast(page)).toBeVisible();
  });

  /**
   * AC7 verbatim — KNOWN BUG. The API does answer "Current password is
   * incorrect", but `changePasswordAction` declares no
   * `experimental_shapeError`, so zsa replaces the message with a generic one
   * before `AdminAccountPanel`'s `msg.includes("incorrect")` test ever sees it.
   * The admin cannot tell a wrong password from a server outage.
   */
  test.fail('a wrong current password is named as such', async ({ page }) => {
    await openSettings(page, 'account');

    await page.locator('#current-pwd').fill('PasLeBonMdp123!');
    await page.locator('#new-pwd').fill('EncoreUnAutre2026!');
    await page.locator('#confirm-pwd').fill('EncoreUnAutre2026!');
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

    await expect(page.getByText('Mot de passe actuel incorrect')).toBeVisible({ timeout: 5_000 });
  });

  // AC8 — and the right one goes through, on a clinic this test owns.
  test('the password is changed with the right current one', async ({ page, request }) => {
    await openSettings(page, 'account');

    const nextPassword = 'ToutNouveau2026!';
    await page.locator('#current-pwd').fill(NEW_TENANT_PASSWORD);
    await page.locator('#new-pwd').fill(nextPassword);
    await page.locator('#confirm-pwd').fill(nextPassword);
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

    await expect(toast(page, 'Mot de passe mis à jour')).toBeVisible();

    // Proof rather than a toast: the new password authenticates.
    const session = await trpcMutation<{ access_token: string }>(
      request,
      undefined,
      'auth.login',
      { email: tenant.adminEmail, password: nextPassword }
    );
    expect(session.access_token).toBeTruthy();
  });

  // AC4/AC9 — not shipped. `settings.account.localeLabel` exists in both
  // language files but no select renders it; the only way to switch is the
  // global header switcher, which does not write `User.locale`.
  test.skip('the account tab offers a FR/EN language preference', async () => {
    // Intentionally empty: recorded as a gap, see the report.
  });
});
