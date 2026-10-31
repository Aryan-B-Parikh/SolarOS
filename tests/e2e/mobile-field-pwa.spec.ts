import { test, expect } from '@playwright/test';
import { signJwt, SESSION_COOKIE_NAME } from '../../src/lib/jwt';

test.describe('Mobile Field Technician Operations (PWA)', () => {
  test.beforeEach(async ({ context }) => {
    const token = signJwt({
      userId: 'b5a949e3-5fdb-4629-9e5f-3cfca523f167',
      email: 'tech1@sunpower.ops',
      name: 'Manoj Kumar',
      role: 'TECHNICIAN',
      isFieldDevice: true,
    });
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: token,
        url: 'http://localhost:3000',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  });
  test('technician views daily job agenda and opens installation stepper', async ({ page }) => {
    // 1. Tech Today Page
    await page.goto('/tech/today', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/field operations|today|scheduled|installation/i').first()).toBeVisible();

    // 2. Open Job Stepper or View Stepper page
    const openJobButton = page.locator('a[href*="/tech/jobs/"]').first();
    if (await openJobButton.count() > 0) {
      await openJobButton.click();
      await expect(page.locator('text=/checklist|stepper|sign-off|order|customer/i').first()).toBeVisible();
    }

    // 3. Tech Scanner Utility
    await page.goto('/tech/scan', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/scan|barcode|qr|camera/i').first()).toBeVisible();
  });
});
