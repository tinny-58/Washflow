import { test, expect } from "@playwright/test";

test.describe("WashFlow E2E: QR Landing to Booking & Payment Flow", () => {
  test("Poster QR onboarding under 30 seconds -> Book -> Pay -> Track", async ({ page }) => {
    // 1. Visit poster QR URL
    await page.goto("/book?src=poster-nairobi-cbd");

    // Check poster banner is displayed
    await expect(page.locator("text=poster-nairobi-cbd")).toBeVisible();

    // 2. Complete 30-Second Phone OTP Onboarding
    await page.fill('input[placeholder="e.g. Jane Wanjiku"]', "Grace Muthoni");
    await page.fill('input[type="tel"]', "0722123456");

    // Click Send Verification Code
    await page.click('button:has-text("Send Verification Code")');

    // Wait for OTP input
    const otpInput = page.locator('input[placeholder="123456"]');
    await expect(otpInput).toBeVisible();

    // Enter verification code (auto-filled or 123456 in dev mode)
    await otpInput.fill("123456");
    await page.click('button:has-text("Confirm & Continue")');

    // 3. User is now authenticated & on Booking step
    await expect(page.locator("text=Grace Muthoni")).toBeVisible();

    // 4. Fill Address
    await page.fill(
      'input[placeholder="e.g. Royal Palms Apts, Flat 3B, Wood Avenue"]',
      "Sunrise Plaza, 4th Floor, Apartment 4B"
    );
    await page.fill(
      'input[placeholder="e.g. Opposite QuickMart Supermarket / Next to Total Energies"]',
      "Near Shell Petrol Station"
    );

    // 5. Select items from Catalog (e.g. 1 Small Basket + 1 Medium Duvet)
    const plusButtons = page.locator('button:has-text("+")');
    await plusButtons.first().click();

    // Verify Sticky CTA bar updates total
    await expect(page.locator("text=KES 300")).toBeVisible();

    // 6. Select Payment on Delivery
    await page.click('button:has-text("Pay on Delivery")');

    // 7. Submit Booking
    await page.click('button:has-text("Confirm Booking")');

    // 8. Should redirect to tracking page
    await expect(page).toHaveURL(/\/track\/[a-f0-9-]+/);
    await expect(page.locator("text=Booking Received")).toBeVisible();
    await expect(page.locator("text=Sunrise Plaza")).toBeVisible();
  });
});
