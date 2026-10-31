import { test, expect } from '@playwright/test';

test.describe('Staff Commercial & CRM Flow', () => {
  test('navigates through director dashboard and CRM leads board', async ({ page }) => {
    // 1. Dashboard
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/dashboard|kpi|overview|revenue|pipeline/i').first()).toBeVisible();

    // 2. Leads CRM
    await page.goto('/leads', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/leads|stage|status|kanban|contacted/i').first()).toBeVisible();
  });

  test('navigates through quotations, orders pipeline, and installation schedule', async ({ page }) => {
    // 1. Quotes
    await page.goto('/quotes', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/quotes|quotation|proposal|version/i').first()).toBeVisible();

    // 2. Quote Builder
    await page.goto('/quotes/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/build quotation|quotation & bom|quote/i').first()).toBeVisible();

    // 3. Orders Pipeline
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/orders|advance|confirmed|payment/i').first()).toBeVisible();

    // 4. Schedule
    await page.goto('/schedule', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=/schedule|calendar|crew|installation/i').first()).toBeVisible();
  });
});
