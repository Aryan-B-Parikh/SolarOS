import { test, expect } from '@playwright/test';

test.describe('Service Desk & Supply Chain Flow', () => {
  test('staff checks service desk and warehouse inventory', async ({ page }) => {
    // 1. Service Desk
    await page.goto('/service', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/service|ticket|priority|category|warranty/i').first()).toBeVisible();

    // 2. Inventory Management
    await page.goto('/inventory', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/inventory|stock|warehouse|available|location/i').first()).toBeVisible();

    // 3. Purchasing
    await page.goto('/purchasing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/purchasing|purchase order|supplier/i').first()).toBeVisible();

    // 4. Dispatch Queue
    await page.goto('/dispatch', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/dispatch|loading|queue|vehicle/i').first()).toBeVisible();

    // 5. Analytics
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/analytics|profitability|margin|utilization/i').first()).toBeVisible();
  });
});
