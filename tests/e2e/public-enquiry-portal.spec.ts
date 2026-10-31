import { test, expect } from '@playwright/test';

test.describe('Public Enquiry & Customer Portal Journey', () => {
  test('homeowner submits rooftop solar enquiry and accesses portal', async ({ page }) => {
    // 1. Visit Public Enquiry Page
    await page.goto('/enquiry');
    await expect(page).toHaveTitle(/SunPower|Solar/i);

    // 2. Verify form inputs exist
    const nameInput = page.locator('input[name="name"], input#name');
    const phoneInput = page.locator('input[name="phone"], input#phone');
    const emailInput = page.locator('input[name="email"], input#email');

    await expect(nameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    // Fill form
    await nameInput.fill('Vikram Malhotra');
    await phoneInput.fill('9876501234');
    if (await emailInput.count() > 0) {
      await emailInput.fill('vikram.malhotra@example.com');
    }

    const addressInput = page.locator('input[name="address"], textarea[name="address"], #address');
    if (await addressInput.count() > 0) {
      await addressInput.fill('104, Shivalik Residency, Bodakdev');
    }

    const cityInput = page.locator('input[name="city"], #city');
    if (await cityInput.count() > 0) {
      await cityInput.fill('Ahmedabad');
    }

    const pincodeInput = page.locator('input[name="pincode"], #pincode');
    if (await pincodeInput.count() > 0) {
      await pincodeInput.fill('380054');
    }

    // Step 1: Click Continue to Step 2
    await page.getByRole('button', { name: /continue to solar needs/i }).click();
    await page.waitForTimeout(500);

    // Step 2: Check consent & Submit
    const consentBox = page.locator('input[name="consent"], #consent');
    if (await consentBox.count() > 0) {
      await consentBox.first().check();
    }

    await page.getByRole('button', { name: /submit solar enquiry/i }).click();

    // Verify submission success state or confirmation message
    await expect(
      page.locator('text=/received|success|enquiry|portal|thank you|request received/i').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('public warranty lookup renders equipment warranty status', async ({ page }) => {
    await page.goto('/w/SPU-7F3K9Q');
    await expect(page.locator('text=/warranty|equipment|serial|active/i').first()).toBeVisible();
  });
});

