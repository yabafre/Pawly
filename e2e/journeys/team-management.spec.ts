import type { Page } from '@playwright/test';
import { test, expect, SEED } from '../support/fixtures';
import {
  apiToken,
  assertE2eApi,
  signInAs,
  createEmployee,
  deactivateEmployee,
  registerTenant,
  trpcQuery,
  uniqueEmail,
  uniqueLastName,
  type ApiEmployee,
} from '../support/api';
import { CARD, errorToast, toast } from '../support/ui';

/**
 * Running the team — Story 5-1 (employee CRUD), Story 5-2 (declarative
 * constraints) and the v0.16.4 fix in
 * `docs/quick-specs/2026-08-19-employee-email-user-sync.md`, where renaming an
 * employee's email used to strand the login account behind it.
 *
 * Every test creates its own people with unique names and deactivates them
 * again: the starter tier stops at 10 *active* employees, so leftovers would
 * eventually make the "Ajouter" button unclickable for everyone.
 */

async function openEmployees(page: Page) {
  await page.goto('/fr/admin/employees');
  await expect(page.getByRole('heading', { name: 'Employés', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}

/** Narrows the grid to one card so a locator cannot pick the wrong person. */
async function searchFor(page: Page, term: string) {
  await page.getByPlaceholder('Rechercher un employé...').fill(term);
  await expect(page.locator(CARD).filter({ hasText: term })).toHaveCount(1);
}

function cardFor(page: Page, fullName: string) {
  return page.locator(CARD).filter({ hasText: fullName });
}

/** Clicks the day cell in whatever month the picker opens on. */
async function pickDay(page: Page, triggerName: string, day: number) {
  await page.getByRole('button', { name: triggerName, exact: true }).click();
  const grid = page.getByRole('grid');
  await grid
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first()
    .click();
  await expect(grid).toBeHidden();
}

interface NewEmployee {
  firstName: string;
  lastName: string;
  email: string;
  jobType?: string;
  contractHours?: number;
}

async function fillEmployeeDialog(page: Page, data: NewEmployee) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Prénom').fill(data.firstName);
  await dialog.getByLabel('Nom', { exact: true }).fill(data.lastName);
  await dialog.getByLabel('Email *').fill(data.email);
  if (data.contractHours !== undefined) {
    await dialog.getByLabel('Heures hebdomadaires').fill(String(data.contractHours));
  }
  if (data.jobType) {
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: data.jobType }).click();
  }
  await pickDay(page, "Date d'embauche", 15);
}

async function createViaForm(page: Page, data: NewEmployee) {
  await page.getByRole('button', { name: 'Ajouter un employé' }).click();
  await expect(page.getByRole('dialog', { name: 'Nouvel employé' })).toBeVisible();
  await fillEmployeeDialog(page, data);
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** Teardown that works from the employee's name alone. */
async function deactivateByName(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  lastName: string
) {
  const employees = await trpcQuery<ApiEmployee[]>(request, token, 'employee.list', {
    includeInactive: false,
    search: lastName,
  });
  for (const employee of employees) await deactivateEmployee(request, token, employee.id);
}

test.beforeEach(async ({ page, request }) => {
  await assertE2eApi(request);
  await signInAs(page, request);
});

test.describe('employee CRUD', () => {
  // Story 5-1 AC1 + AC2 — the form writes an Employee scoped to the admin's
  // clinic, and the list shows it with job type, contract and status.
  test('creating an employee from the form lists them and mails an invitation', async ({
    page,
    request,
    mailbox,
  }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Nouvelle');
    const email = uniqueEmail('nouvelle');

    try {
      await openEmployees(page);
      await createViaForm(page, {
        firstName: 'Alix',
        lastName,
        email,
        jobType: 'Auxiliaire vétérinaire',
        contractHours: 28,
      });

      await searchFor(page, lastName);
      const card = cardFor(page, `Alix ${lastName}`);
      await expect(card).toContainText('Auxiliaire vétérinaire');
      await expect(card).toContainText('CDI');
      await expect(card).toContainText('28h/sem');
      await expect(card).toContainText('Actif');
      await expect(card).toContainText(email);

      // The invitation is fire-and-forget on the server, hence the poll.
      const mail = await mailbox.waitFor(
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email
      );
      expect(mail.url).toContain('/auth/callback?token=');
      expect(mail.args[2]).toBe('Alix');
    } finally {
      await deactivateByName(request, token, lastName);
    }
  });

  // Story 5-1 AC3 — edit persists, and the change survives a reload.
  test('editing an employee persists every changed field', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Modif');
    const employee = await createEmployee(request, token, {
      firstName: 'Bruno',
      lastName,
      jobType: 'VET',
      contractHours: 35,
    });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Bruno ${lastName}`).getByRole('button', { name: 'Modifier' }).click();

      const dialog = page.getByRole('dialog', { name: "Modifier l'employé" });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Prénom').fill('Brunette');
      await dialog.getByLabel('Heures hebdomadaires').fill('24');
      await dialog.getByRole('combobox').first().click();
      await page.getByRole('option', { name: 'Apprenti' }).click();
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();

      await page.reload();
      await searchFor(page, lastName);
      const card = cardFor(page, `Brunette ${lastName}`);
      await expect(card).toContainText('24h/sem');
      await expect(card).toContainText('Apprenti');
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });

  // Story 5-1 AC4 — deactivation keeps the record but drops it out of the
  // default list.
  test('deactivating an employee hides them until inactive ones are shown', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Sortie');
    await createEmployee(request, token, { firstName: 'Chloé', lastName });

    await openEmployees(page);
    await searchFor(page, lastName);
    await cardFor(page, `Chloé ${lastName}`).getByRole('button', { name: 'Désactiver' }).click();

    const confirm = page.getByRole('dialog', { name: "Désactiver l'employé" });
    await expect(confirm).toContainText('Son historique sera conservé');
    await confirm.getByRole('button', { name: 'Désactiver' }).click();

    await expect(cardFor(page, `Chloé ${lastName}`)).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Afficher les inactifs' }).check();
    const card = cardFor(page, `Chloé ${lastName}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Inactif');
  });

  // Story 5-1 AC2 — a clinic only ever sees its own people, in both directions.
  test('an employee of another clinic is never listed', async ({ page, request }) => {
    const neighbour = await registerTenant(request);
    const neighbourLastName = uniqueLastName('Voisin');
    await createEmployee(request, neighbour.token, {
      firstName: 'Dorian',
      lastName: neighbourLastName,
    });

    await openEmployees(page);
    await page.getByPlaceholder('Rechercher un employé...').fill(neighbourLastName);
    await expect(page.getByText('Aucun employé')).toBeVisible();

    // And the neighbour cannot see the seed clinic's employee either.
    const seenByNeighbour = await trpcQuery<ApiEmployee[]>(
      request,
      neighbour.token,
      'employee.list',
      { includeInactive: true }
    );
    expect(seenByNeighbour.map((e) => e.lastName)).not.toContain('Martin');
    expect(seenByNeighbour.map((e) => e.lastName)).toContain(neighbourLastName);
  });
});

test.describe('employee form validation', () => {
  // Story 5-1 AC5 — inline errors, and nothing is submitted.
  test('an empty first name blocks the save', async ({ page }) => {
    await openEmployees(page);
    await page.getByRole('button', { name: 'Ajouter un employé' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nouvel employé' });
    await dialog.getByLabel('Prénom').fill('X');
    await dialog.getByLabel('Prénom').fill('');
    await dialog.getByLabel('Nom', { exact: true }).fill('Sansprenom');
    await dialog.getByLabel('Email *').fill(uniqueEmail('vide'));
    await pickDay(page, "Date d'embauche", 15);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(dialog.getByText('Le prénom est requis')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('a malformed email blocks the save', async ({ page }) => {
    await openEmployees(page);
    await page.getByRole('button', { name: 'Ajouter un employé' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nouvel employé' });
    await dialog.getByLabel('Prénom').fill('Elio');
    await dialog.getByLabel('Nom', { exact: true }).fill('Malformé');
    await dialog.getByLabel('Email *').fill('pas-une-adresse');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(dialog.getByText('Adresse email invalide')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('an empty email blocks the save', async ({ page }) => {
    await openEmployees(page);
    await page.getByRole('button', { name: 'Ajouter un employé' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nouvel employé' });
    await dialog.getByLabel('Prénom').fill('Fanny');
    await dialog.getByLabel('Nom', { exact: true }).fill('Sansmail');
    await dialog.getByLabel('Email *').fill('x@y.test');
    await dialog.getByLabel('Email *').fill('');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(dialog.getByText("L'email est requis")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('weekly hours outside 1–48 block the save', async ({ page }) => {
    await openEmployees(page);
    await page.getByRole('button', { name: 'Ajouter un employé' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nouvel employé' });
    await dialog.getByLabel('Prénom').fill('Gaël');
    await dialog.getByLabel('Nom', { exact: true }).fill('Horaire');
    await dialog.getByLabel('Email *').fill(uniqueEmail('horaire'));
    await dialog.getByLabel('Heures hebdomadaires').fill('60');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(dialog.getByText('Les heures doivent être entre 1 et 48')).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});

test.describe('invitations', () => {
  // Story 5-1 — the admin can re-send the welcome link on demand.
  test('resending an invitation mails a fresh link', async ({ page, request, mailbox }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Renvoi');
    const email = uniqueEmail('renvoi');
    const employee = await createEmployee(request, token, {
      firstName: 'Hugo',
      lastName,
      email,
    });

    try {
      const first = await mailbox.waitFor(
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email
      );
      await mailbox.clear();

      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Hugo ${lastName}`)
        .getByRole('button', { name: "Renvoyer l'invitation" })
        .click();

      await expect(toast(page, 'Invitation renvoyée avec succès')).toBeVisible();
      const second = await mailbox.waitFor(
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email
      );
      expect(second.url).not.toBe(first.url);
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });

  /**
   * The v0.16.4 regression. Before the fix, renaming the employee's email left
   * `User.email` on the old address: `createWelcomeMagicLink` looked the new one
   * up, found nothing, and the resend reported success while sending nothing.
   * The assertion that matters is the mail arriving at the NEW address.
   */
  test('an employee renamed to a new email can still be invited', async ({
    page,
    request,
    mailbox,
  }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Renomme');
    const oldEmail = uniqueEmail('avant');
    const newEmail = uniqueEmail('apres');
    const employee = await createEmployee(request, token, {
      firstName: 'Inès',
      lastName,
      email: oldEmail,
    });

    try {
      await mailbox.waitFor((m) => m.type === 'sendEmployeeInvitationEmail' && m.to === oldEmail);
      await mailbox.clear();

      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Inès ${lastName}`).getByRole('button', { name: 'Modifier' }).click();

      const dialog = page.getByRole('dialog', { name: "Modifier l'employé" });
      await dialog.getByLabel('Email *').fill(newEmail);
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();

      await searchFor(page, lastName);
      await expect(cardFor(page, `Inès ${lastName}`)).toContainText(newEmail);

      await cardFor(page, `Inès ${lastName}`)
        .getByRole('button', { name: "Renvoyer l'invitation" })
        .click();

      await expect(toast(page, 'Invitation renvoyée avec succès')).toBeVisible();
      const mail = await mailbox.waitFor(
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === newEmail
      );
      expect(mail.url).toContain('/auth/callback?token=');

      // And the link really signs that account in — the login account followed
      // the rename, which is the whole point of the fix.
      await page.context().clearCookies();
      await page.goto(mail.url as string);
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    } finally {
      await signInAs(page, request);
      await deactivateEmployee(request, token, employee.id);
    }
  });

  // Quick-spec AC2 — an address another account already owns is refused.
  test('renaming to an address another account owns is refused', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Conflit');
    const employee = await createEmployee(request, token, {
      firstName: 'Jonas',
      lastName,
      email: uniqueEmail('conflit'),
    });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Jonas ${lastName}`).getByRole('button', { name: 'Modifier' }).click();

      const dialog = page.getByRole('dialog', { name: "Modifier l'employé" });
      await dialog.getByLabel('Email *').fill(SEED.adminEmail);
      await dialog.getByRole('button', { name: 'Enregistrer' }).click();

      await expect(errorToast(page)).toBeVisible();

      // Nothing moved: the employee keeps the address it had.
      const [stored] = await trpcQuery<ApiEmployee[]>(request, token, 'employee.list', {
        includeInactive: true,
        search: lastName,
      });
      expect(stored.email).not.toBe(SEED.adminEmail);
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });
});

test.describe('declarative constraints', () => {
  // Story 5-2 AC1 + AC4 + AC7 — a one-time unavailability, listed back with its
  // window and type, announced by a localized toast.
  test('a one-time constraint is added and listed', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Contrainte');
    const employee = await createEmployee(request, token, { firstName: 'Karim', lastName });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Karim ${lastName}`)
        .getByRole('button', { name: 'Gérer les contraintes' })
        .click();

      const panel = page.getByRole('dialog', { name: `Contraintes de Karim ${lastName}` });
      await expect(panel).toBeVisible();
      await expect(panel.getByText('Aucune contrainte')).toBeVisible();

      await panel.getByRole('button', { name: 'Ajouter une contrainte' }).click();
      await panel.getByRole('combobox').first().click();
      await page.getByRole('option', { name: 'Congés' }).click();
      await panel.getByLabel('Date de début').fill('2026-09-14');
      await panel.getByLabel('Date de fin').fill('2026-09-18');
      await panel.getByLabel('Motif (optionnel)').fill('Vacances E2E');
      await panel.getByRole('button', { name: 'Enregistrer' }).click();

      await expect(toast(page, 'Contrainte créée')).toBeVisible();
      await expect(panel).toContainText('Congés');
      await expect(panel).toContainText('Vacances E2E');
      await expect(panel).toContainText('Ponctuelle');
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });

  // Story 5-2 AC2 — recurrence metadata is kept and shown.
  test('a recurring constraint records its weekdays', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Recurrente');
    const employee = await createEmployee(request, token, {
      firstName: 'Lou',
      lastName,
      jobType: 'APPRENTICE',
      contractType: 'APPRENTICESHIP',
    });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Lou ${lastName}`)
        .getByRole('button', { name: 'Gérer les contraintes' })
        .click();

      const panel = page.getByRole('dialog', { name: `Contraintes de Lou ${lastName}` });
      await panel.getByRole('button', { name: 'Ajouter une contrainte' }).click();
      await panel.getByLabel('Date de début').fill('2026-09-01');
      await panel.getByLabel('Date de fin').fill('2026-12-31');
      await panel.getByRole('checkbox', { name: 'Contrainte hebdomadaire récurrente' }).check();
      await panel.getByRole('checkbox', { name: 'Mardi' }).check();
      await panel.getByRole('checkbox', { name: 'Jeudi' }).check();
      await panel.getByRole('button', { name: 'Enregistrer' }).click();

      await expect(toast(page, 'Contrainte créée')).toBeVisible();
      await expect(panel).toContainText('Récurrente');
      await expect(panel).toContainText('Mardi');
      await expect(panel).toContainText('Jeudi');
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });

  // Story 5-2 AC6 — an end before the start is refused inline, nothing written.
  test('an end date before the start date is refused', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Invalide');
    const employee = await createEmployee(request, token, { firstName: 'Maël', lastName });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Maël ${lastName}`)
        .getByRole('button', { name: 'Gérer les contraintes' })
        .click();

      const panel = page.getByRole('dialog', { name: `Contraintes de Maël ${lastName}` });
      await panel.getByRole('button', { name: 'Ajouter une contrainte' }).click();
      await panel.getByLabel('Date de début').fill('2026-09-20');
      await panel.getByLabel('Date de fin').fill('2026-09-10');
      await panel.getByRole('button', { name: 'Enregistrer' }).click();

      await expect(
        panel.getByText('La date de fin doit être après ou égale à la date de début')
      ).toBeVisible();
      await expect(panel.getByText('Aucune contrainte')).toBeVisible();
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });

  // Story 5-2 AC4 + AC7 — delete, with the confirmation it demands.
  test('a constraint can be deleted', async ({ page, request }) => {
    const token = await apiToken(request);
    const lastName = uniqueLastName('Suppression');
    const employee = await createEmployee(request, token, { firstName: 'Nina', lastName });

    try {
      await openEmployees(page);
      await searchFor(page, lastName);
      await cardFor(page, `Nina ${lastName}`)
        .getByRole('button', { name: 'Gérer les contraintes' })
        .click();

      const panel = page.getByRole('dialog', { name: `Contraintes de Nina ${lastName}` });
      await panel.getByRole('button', { name: 'Ajouter une contrainte' }).click();
      await panel.getByLabel('Date de début').fill('2026-10-05');
      await panel.getByLabel('Date de fin').fill('2026-10-06');
      await panel.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(panel.getByText('Aucune contrainte')).toHaveCount(0);

      await panel.getByRole('button', { name: 'Supprimer la contrainte' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();

      await expect(toast(page, 'Contrainte supprimée')).toBeVisible();
      await expect(panel.getByText('Aucune contrainte')).toBeVisible();
    } finally {
      await deactivateEmployee(request, token, employee.id);
    }
  });
});
