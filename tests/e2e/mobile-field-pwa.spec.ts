import { test, expect } from '@playwright/test';

test.describe('Mobile Field Technician Operations (PWA)', () => {
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
