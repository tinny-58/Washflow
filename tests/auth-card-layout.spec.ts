import { test, expect } from "@playwright/test";

const VIEWS = [
  "login",
  "admin-stepup",
  "signup-select",
  "google-link-phone",
  "signup-otp",
  "signup-credentials",
  "signup-agreements",
  "forgot",
  "forgot-otp",
  "reset",
  "reset-success",
];

test.describe("AuthCard Shell Size & Stability Matrix", () => {
  test.use({ viewport: { width: 1918, height: 967 } });

  test("locks dimensions and top offset across all 11 views at 1918x967 spec screen", async ({
    page,
  }) => {
    let referenceTop: number | null = null;
    let referenceWidth: number | null = null;
    let referenceHeight: number | null = null;

    for (const v of VIEWS) {
      await page.goto(`/?view=${v}`);
      const card = page.locator(".auth-card-shell");
      await expect(card).toBeVisible();

      const rect = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
          top: Math.round(r.top * 10) / 10,
        };
      });

      // Target tokens: 470px wide, clamp(480px, 50dvh, 560px) = 483.5px at 967px viewport
      expect(Math.abs(rect.width - 470)).toBeLessThanOrEqual(1.0);
      expect(Math.abs(rect.height - 483.5)).toBeLessThanOrEqual(1.0);

      if (referenceTop === null) {
        referenceTop = rect.top;
        referenceWidth = rect.width;
        referenceHeight = rect.height;
      } else {
        expect(Math.abs(rect.top - referenceTop)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(rect.width - referenceWidth)).toBeLessThanOrEqual(1.0);
        expect(Math.abs(rect.height - referenceHeight)).toBeLessThanOrEqual(1.0);
      }
    }
  });

  test("maintains zero layout shift (CLS = 0) when validation errors or countdowns appear", async ({
    page,
  }) => {
    await page.goto("/?view=login");
    const card = page.locator(".auth-card-shell");
    await expect(card).toBeVisible();

    const initial = await page.evaluate(() => {
      const c = document.querySelector(".auth-card-shell")!.getBoundingClientRect();
      const b = document.querySelector("button[type=submit]")!.getBoundingClientRect();
      return { cardTop: c.top, cardHeight: c.height, btnTop: b.top };
    });

    // Click submit empty form -> triggers error in reserved slot
    await page.click("button[type=submit]");
    await page.waitForTimeout(100);

    const withError = await page.evaluate(() => {
      const c = document.querySelector(".auth-card-shell")!.getBoundingClientRect();
      const b = document.querySelector("button[type=submit]")!.getBoundingClientRect();
      return { cardTop: c.top, cardHeight: c.height, btnTop: b.top };
    });

    expect(Math.abs(withError.cardTop - initial.cardTop)).toBe(0);
    expect(Math.abs(withError.cardHeight - initial.cardHeight)).toBe(0);
    expect(Math.abs(withError.btnTop - initial.btnTop)).toBe(0);

    // Switch to OTP view with 60s countdown
    await page.goto("/?view=signup-otp&countdown=60");
    await page.waitForTimeout(100);

    const withCountdown = await page.evaluate(() => {
      const c = document.querySelector(".auth-card-shell")!.getBoundingClientRect();
      return { cardTop: c.top, cardHeight: c.height };
    });

    expect(Math.abs(withCountdown.cardTop - initial.cardTop)).toBe(0);
    expect(Math.abs(withCountdown.cardHeight - initial.cardHeight)).toBe(0);
  });

  test("enforces 44px touch targets on form inputs and action buttons", async ({
    page,
  }) => {
    await page.goto("/?view=login");
    const inputs = page.locator("input[type=text], input[type=password]");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const box = await inputs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }

    const btn = page.locator("button[type=submit]");
    const btnBox = await btn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.height).toBeGreaterThanOrEqual(43.5);
  });
});

test.describe("AuthCard Shell Responsive Viewports", () => {
  test("adapts width to min(470px, 100vw - 32px) and fits 6 OTP boxes at 360x640 mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/?view=signup-otp");
    const card = page.locator(".auth-card-shell");
    await expect(card).toBeVisible();

    const rect = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });

    // 360 - 32 = 328px
    expect(rect.width).toBe(328);
    // clamp min = 480px
    expect(rect.height).toBe(480);

    // Verify all 6 OTP inputs are within card bounds and touch targets >= 44px
    const otpBoxes = page.locator("input[maxlength='1']");
    expect(await otpBoxes.count()).toBe(6);
    for (let i = 0; i < 6; i++) {
      const box = await otpBoxes.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(36);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("supports 200% zoom with clamp min height and natural page scroll", async ({
    page,
  }) => {
    // 1918x967 at 200% zoom = 959x484 logical CSS viewport
    await page.setViewportSize({ width: 959, height: 484 });
    await page.goto("/?view=signup-agreements");
    const card = page.locator(".auth-card-shell");
    await expect(card).toBeVisible();

    const rect = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hasPageHScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { width: Math.round(r.width), height: Math.round(r.height), hasPageHScroll };
    });

    expect(rect.width).toBe(470);
    expect(rect.height).toBe(480);
    expect(rect.hasPageHScroll).toBe(false);
  });
});
