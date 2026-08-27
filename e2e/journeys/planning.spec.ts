import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import {
  assertE2eApi,
  futureMonth,
  provisionClinic,
  signInAs,
  trpcMutation,
  trpcQuery,
  type ProvisionedClinic,
} from '../support/api';
import { toast } from '../support/ui';

/**
 * Building and shipping a month — Story 6-2 (greedy generation from a template),
 * Story 6-3 (grid, holes, conflict indicators), Story 7-4 (health bar) and
 * Story 11-4 (publication notifications).
 *
 * The health bar — and the Publish button that lives inside it — is gated on the
 * Professional tier, so every clinic here is provisioned Professional. The seed
 * clinic is not usable at all: it has no `ClinicConfig`, no shift type and no
 * template, so `/admin/planning` cannot generate anything.
 */

/** The month picker offers the next six months; index 2 is two months out. */
const MONTH_OFFSET = 2;

async function openPlanning(page: Page) {
  await page.goto('/fr/admin/planning');
  await expect(page.getByRole('heading', { name: 'Génération du planning' })).toBeVisible({
    timeout: 45_000,
  });
}

async function pickMonthAndTemplate(page: Page) {
  // The template picker is only a combobox once the client query has returned
  // templates — before that it is a "create one" link. Waiting for it is also
  // the cheapest proof that the page has hydrated, without which clicking a
  // Radix trigger does nothing at all.
  const template = page.getByRole('combobox', { name: 'Modèle de semaine' });
  await expect(template).toBeVisible({ timeout: 45_000 });

  await page.getByRole('combobox', { name: 'Mois cible' }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option').nth(MONTH_OFFSET).click();

  await template.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option', { name: 'Semaine type E2E' }).click();
}

async function generate(page: Page) {
  await pickMonthAndTemplate(page);
  await page.getByRole('button', { name: 'Générer le planning' }).click();
  await expect(toast(page, 'Planning généré avec succès')).toBeVisible({ timeout: 45_000 });
}

test.beforeEach(async ({ request }) => {
  await assertE2eApi(request);
});

test.describe('generation (6-2)', () => {
  let clinic: ProvisionedClinic;

  test.beforeEach(async ({ page, request }) => {
    clinic = await provisionClinic(request, { label: 'Generation', professional: true });
    await signInAs(page, request, clinic.adminEmail, clinic.adminPassword);
  });

  // AC1 + AC5 + AC6 — the template is expanded across the month and the result
  // is reported as assignments / holes / violations.
  test('a month is generated from the template and reported back', async ({ page, request }) => {
    await openPlanning(page);
    await generate(page);

    // `GenerationResultView` is dead code (defined, never mounted); the panel
    // reports the run through its own summary plus the served-engine badge,
    // which only appears once the generation result reaches the client.
    await expect(page.getByText('Moteur standard')).toBeVisible();
    await expect(page.getByText('Total')).toBeVisible();
    await expect(page.getByText('Tout est bon — aucune violation détectée')).toBeVisible();

    const shifts = await trpcQuery<Array<{ source: string; shiftTypeCode: string }>>(
      request,
      clinic.token,
      'planning.listShiftsForMonth',
      { month: futureMonth(MONTH_OFFSET) }
    );
    expect(shifts.length).toBeGreaterThan(15); // ~22 weekdays
    expect(shifts.every((s) => s.source === 'GENERATED')).toBe(true);
    expect(shifts.every((s) => s.shiftTypeCode === 'JOUR')).toBe(true);
  });

  // AC7 — a second run warns before replacing what is already there.
  test('regenerating asks for confirmation first', async ({ page }) => {
    await openPlanning(page);
    await generate(page);

    await page.reload();
    await pickMonthAndTemplate(page);
    // The confirmation only appears once the panel knows the month already has
    // generated shifts — this button is that knowledge made visible.
    await expect(page.getByRole('button', { name: 'Supprimer les générés' })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole('button', { name: 'Générer le planning' }).click();

    const confirm = page.getByRole('alertdialog', { name: 'Regénérer le planning ?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Les créneaux manuels seront conservés');
    await confirm.getByRole('button', { name: 'Regénérer' }).click();

    // The hook fires the same success toast for a regeneration; the
    // `regenerated` translation key is unused.
    await expect(toast(page, 'Planning généré avec succès')).toBeVisible({ timeout: 45_000 });
  });

  // AC5 — slots the clinic cannot staff come back as holes with a reason.
  test('a template asking for more staff than the clinic has reports holes', async ({
    page,
    request,
  }) => {
    const small = await provisionClinic(request, {
      label: 'Trous',
      professional: true,
      employees: 2,
      requiredStaff: 4,
    });
    await signInAs(page, request, small.adminEmail, small.adminPassword);

    await openPlanning(page);
    await generate(page);

    // Holes are reported by the health bar, not by the generation summary.
    await expect(page.getByText(/\d+ trous/)).toBeVisible();

    const result = await trpcQuery<{ holes: Array<{ reason: string }> }>(
      request,
      small.token,
      'planning.getScheduleView',
      { month: futureMonth(MONTH_OFFSET) }
    );
    expect(result.holes.length).toBeGreaterThan(0);
  });
});

test.describe('schedule grid (6-3)', () => {
  let clinic: ProvisionedClinic;

  test.beforeEach(async ({ page, request }) => {
    clinic = await provisionClinic(request, { label: 'Grille', professional: true });
    await trpcMutation(request, clinic.token, 'planning.generatePlan', {
      month: futureMonth(MONTH_OFFSET),
      templateId: clinic.templateId,
      acknowledgePublishedChange: false,
      engine: 'greedy',
    });
    await signInAs(page, request, clinic.adminEmail, clinic.adminPassword);
  });

  // AC1 + AC7 — employees as rows, days as columns, chips carrying the shift
  // type, its hours and where it came from.
  test('the grid lays the month out by employee and day', async ({ page }) => {
    await openPlanning(page);
    await pickMonthAndTemplate(page);

    const grid = page.getByRole('grid', { name: 'Grille de planning du personnel' });
    await expect(grid).toBeVisible({ timeout: 45_000 });
    // Row headers abbreviate to "Prénom I." plus the job-type badge.
    for (const employee of clinic.employees) {
      const short = `${employee.firstName} ${employee.lastName[0]}.`;
      await expect(grid.getByText(short, { exact: true })).toBeVisible();
    }
    await expect(grid.getByText('JOUR').first()).toBeVisible();
    await expect(grid.getByText('09:00 - 17:00').first()).toBeVisible();
  });

  // AC5 — the week navigator cycles inside the selected month.
  test('the week navigator moves between the weeks of the month', async ({ page }) => {
    await openPlanning(page);
    await pickMonthAndTemplate(page);
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 45_000 });

    const weekButtons = page.getByRole('button', { name: /^Semaine \d+$/ });
    const weekCount = await weekButtons.count();
    expect(weekCount).toBeGreaterThanOrEqual(4);

    const firstWeekLabel = await page.getByText(/^Semaine du /).textContent();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(page.getByText(/^Semaine du /)).not.toHaveText(firstWeekLabel ?? '');
  });

  /**
   * AC2 — an unfilled slot is an inviting hole, not an empty cell.
   *
   * A hole is only drawn in the cell of an employee who is *free* that day, so
   * asking for more staff than the clinic has does not show one: everybody ends
   * up assigned. Removing a served shift is what the admin actually does to
   * create a gap, and it leaves the whole column free.
   */
  test('an unfilled slot is shown as a hole with an assign affordance', async ({
    page,
    request,
  }) => {
    const shifts = await trpcQuery<Array<{ id: string; date: string }>>(
      request,
      clinic.token,
      'planning.listShiftsForMonth',
      { month: futureMonth(MONTH_OFFSET) }
    );
    const earliest = [...shifts].sort((a, b) => a.date.localeCompare(b.date))[0];
    await trpcMutation(request, clinic.token, 'planning.deleteShift', {
      shiftId: earliest.id,
      acknowledgePublishedChange: false,
    });

    await openPlanning(page);
    await pickMonthAndTemplate(page);
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 45_000 });

    await expect(
      page.getByRole('button', { name: /JOUR : \d+\/\d+ employés affectés/ }).first()
    ).toBeVisible();
  });

  /**
   * AC3 — a hard conflict paints the cell. Generation never *creates* one (it
   * respects hard rules), so the rule is added afterwards: a SKILL_REQUIREMENT
   * demanding a VET on the JOUR slot turns every ASV assignment into a
   * violation the next time the view is validated.
   */
  test('a hard rule added after generation marks the offending cells', async ({
    page,
    request,
  }) => {
    await trpcMutation(request, clinic.token, 'planning.createRule', {
      name: 'JOUR réservé aux vétérinaires',
      ruleType: 'HARD',
      category: 'SKILL_REQUIREMENT',
      isActive: true,
      priority: 10,
      config: { shiftTypeCode: 'JOUR', requiredJobTypes: ['VET'] },
    });

    await openPlanning(page);
    await pickMonthAndTemplate(page);
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 45_000 });

    await expect(page.getByRole('button', { name: /conflit/ }).first()).toBeVisible();

    const view = await trpcQuery<{ violations: { hard: Array<{ message: string }> } }>(
      request,
      clinic.token,
      'planning.getScheduleView',
      { month: futureMonth(MONTH_OFFSET) }
    );
    expect(view.violations.hard.length).toBeGreaterThan(0);
  });
});

test.describe('health bar and publication (7-4, 11-4)', () => {
  let clinic: ProvisionedClinic;

  test.beforeEach(async ({ page, request }) => {
    clinic = await provisionClinic(request, { label: 'Publication', professional: true });
    await signInAs(page, request, clinic.adminEmail, clinic.adminPassword);
  });

  // AC10 read against the shipped UI: before anything is generated the schedule
  // area shows its own empty state rather than a misleading healthy bar.
  test('an empty month shows an empty state, not a healthy bar', async ({ page }) => {
    await openPlanning(page);
    await page.getByRole('combobox', { name: 'Mois cible' }).click();
    await page.getByRole('option').nth(MONTH_OFFSET).click();

    await expect(
      page.getByText("Aucun créneau généré — lancez la génération d'abord")
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  // AC1 + AC5 + AC7 — a clean month reads healthy, with the progressbar
  // semantics a screen reader needs.
  test('a clean month reads as healthy and offers publication', async ({ page }) => {
    await openPlanning(page);
    await generate(page);

    const bar = page.getByRole('progressbar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByText('Tout est bon — aucune violation détectée')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toBeEnabled();
  });

  // AC3 — hard conflicts block publication outright.
  test('hard conflicts disable the publish button', async ({ page, request }) => {
    await openPlanning(page);
    await generate(page);

    await trpcMutation(request, clinic.token, 'planning.createRule', {
      name: 'JOUR réservé aux vétérinaires',
      ruleType: 'HARD',
      category: 'SKILL_REQUIREMENT',
      isActive: true,
      priority: 10,
      config: { shiftTypeCode: 'JOUR', requiredJobTypes: ['VET'] },
    });
    await page.reload();
    await pickMonthAndTemplate(page);

    await expect(
      page.getByText("Publication impossible — résolvez les conflits d'abord").first()
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Publier' })).toBeDisabled();
  });

  /**
   * Story 11-4 + Story 7-4 AC9 — publishing notifies exactly the employees who
   * have shifts, and the bar switches to its published state afterwards.
   */
  test('publishing notifies the staffed employees and marks the month published', async ({
    page,
    request,
    mailbox,
  }) => {
    await openPlanning(page);
    await generate(page);
    await mailbox.clear();

    await page.getByRole('button', { name: 'Publier' }).click();

    const dialog = page.getByRole('alertdialog', { name: 'Publier le planning' });
    await expect(dialog).toContainText('Cette action est irréversible');
    await dialog.getByRole('button', { name: 'Publier', exact: true }).click();

    await expect(toast(page, /Planning publié/)).toBeVisible({ timeout: 45_000 });

    const mail = await mailbox.waitFor((m) => m.type === 'sendBatchSchedulePublicationEmails');
    const recipients = (mail.args[0] as Array<{ to: string }>) ?? [];
    expect(recipients.length).toBe(clinic.employees.length);
    const addressed = recipients.map((r) => r.to).sort();
    expect(addressed).toEqual(clinic.employees.map((e) => e.email as string).sort());

    // AC9 — published badge, and no second publish button.
    await expect(page.getByText(/^Publié le /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toHaveCount(0);

    const status = await trpcQuery<{ status: string }>(
      request,
      clinic.token,
      'planning.getPublicationStatus',
      { month: futureMonth(MONTH_OFFSET) }
    );
    expect(status.status).toBe('PUBLISHED');
  });
});
