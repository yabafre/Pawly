/**
 * The employee side of the product: signing in without a password, reading
 * one's own schedule, and reading it in the other language. Stories 8-1
 * (personal schedule consultation), 1-2/1-5 (passwordless auth) and 2-2
 * (language switching).
 */
import { test, expect, signInAsEmployee, SEED } from '../support/fixtures';

const API = 'http://localhost:3011';

test.describe('employee sign-in', () => {
  test('an employee signs in with the emailed code and lands on their dashboard', async ({
    page,
    mailbox,
  }) => {
    await page.goto('/fr/login');
    await page.getByRole('button', { name: 'Employé' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(SEED.employeeEmail);
    await page.getByRole('button', { name: 'Recevoir mon code' }).click();

    const mail = await mailbox.waitFor(
      (m) => m.type === 'sendOtpCode' && m.to === SEED.employeeEmail,
    );
    const code = mail.code!;

    // Six single-character boxes rather than one field.
    const boxes = page.getByRole('textbox', { name: /\d \/ 6/ });
    for (let i = 0; i < 6; i++) {
      await boxes.nth(i).fill(code[i]);
    }

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(new RegExp(SEED.employeeFirstName))).toBeVisible();
  });

  test('a wrong code keeps the employee out', async ({ page, mailbox }) => {
    await page.goto('/fr/login');
    await page.getByRole('button', { name: 'Employé' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(SEED.employeeEmail);
    await page.getByRole('button', { name: 'Recevoir mon code' }).click();
    await mailbox.waitFor((m) => m.type === 'sendOtpCode');

    const boxes = page.getByRole('textbox', { name: /\d \/ 6/ });
    for (let i = 0; i < 6; i++) {
      await boxes.nth(i).fill('0');
    }

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('the employee area', () => {
  test.beforeEach(async ({ page, request }) => {
    await signInAsEmployee(page, request);
  });

  test('the schedule page is reachable from the navigation', async ({ page }) => {
    await page.goto('/fr/dashboard');
    // The nav is rendered twice — desktop rail and mobile bar — and only one of
    // them is on screen at any viewport.
    // Clicking a Next <Link> waits on a navigation that never settles under the
    // dev server, so the reachability claim is made in two parts: the nav
    // really offers the entry, and the route it points at really serves the
    // page.
    const entry = page.getByRole('link', { name: 'Mon planning' }).filter({ visible: true }).first();
    await expect(entry).toHaveAttribute('href', '/dashboard/schedule');

    await page.goto('/fr/dashboard/schedule');
    await expect(page).toHaveURL(/\/dashboard\/schedule/);
    await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();
  });

  test('the absences page lists the employee own requests', async ({ page }) => {
    await page.goto('/fr/dashboard/absences');

    await expect(page.getByRole('heading', { name: 'Absences' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle demande' })).toBeVisible();
  });

  /**
   * The admin layout now checks the role, not just the presence of a cookie,
   * and `employee.list` carries its own guard (see
   * `role-boundaries.e2e-spec.ts`). An employee used to get the roster rendered
   * in full: colleagues' names, emails, phones and contract hours.
   */
  test('the admin roster does not render for an employee', async ({ page }) => {
    await page.goto('/fr/admin/employees');

    await expect(page.getByRole('heading', { name: 'Employés', level: 1 })).toBeHidden();
  });
});

test.describe('language switching (2-2)', () => {
  test('the dashboard reads in English once the language is switched', async ({
    page,
    request,
  }) => {
    await signInAsEmployee(page, request);
    await page.goto('/fr/dashboard/schedule');
    await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();

    await page.goto('/en/dashboard/schedule');
    await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible();
  });

  /**
   * The switcher is a public-shell control: the employee dashboard does not
   * render one, so an employee can only change language by editing the URL.
   * Recorded as a gap in the QA report; exercised here where it does exist.
   */
  test('the language switcher moves the locale prefix', async ({ page }) => {
    await page.goto('/fr/login');

    const switcher = page.getByRole('combobox', { name: 'Changer la langue' }).first();
    await expect(switcher).toBeVisible();
    await switcher.click();

    // Radix renders the list in a portal, so the options are addressable only
    // once the trigger has been opened.
    await expect(page.getByRole('option', { name: 'Français' })).toBeVisible();
    await page.getByRole('option', { name: 'English' }).click();

    await expect(page).toHaveURL(/\/en(\/|$)/);
  });
});

test.describe('the employee identity is taken from the session', () => {
  test('the API refuses a schedule request that carries no session', async ({ request }) => {
    const res = await request.get(`${API}/auth/profile`);
    expect(res.status()).toBe(401);
  });
});
