import { test, expect, signIn, SEED } from '../support/fixtures';

test('the login page renders and the admin lands on the dashboard', async ({ page, request }) => {
  await page.goto('/fr/login');
  await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible();

  await signIn(page, request);
  await page.goto('/fr/admin/employees');
  await expect(page.getByRole('heading', { name: 'Employés', level: 1 })).toBeVisible();
});

test('the mailbox captures the code an OTP request sends', async ({ page, mailbox }) => {
  await page.goto('/fr/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(SEED.employeeEmail);
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();

  const mail = await mailbox.waitFor((m) => m.type === 'sendOtpCode' && m.to === SEED.employeeEmail);
  expect(mail.code).toMatch(/^\d{6}$/);
});
