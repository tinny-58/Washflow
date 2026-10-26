import { chromium } from "playwright";
import { startHarnessServer } from "./serve-harness.mjs";

async function measureHarness() {
  const server = await startHarnessServer(3335);

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3334", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hero-card", { timeout: 10000 });
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const header = document.querySelector("header").getBoundingClientRect();
    const heroCard = document.querySelector(".hero-card").getBoundingClientRect();
    const authCard = document.querySelector(".auth-card-shell").getBoundingClientRect();
    const heroCenterY = heroCard.top + heroCard.height / 2;
    const authCenterY = authCard.top + authCard.height / 2;

    const doc = document.documentElement;
    const hasVScroll = doc.scrollHeight > window.innerHeight + 1;
    const hasHScroll = doc.scrollWidth > window.innerWidth + 1;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: {
        top: header.top,
        bottom: header.bottom,
        height: header.height
      },
      heroCard: {
        top: heroCard.top,
        bottom: heroCard.bottom,
        height: heroCard.height,
        left: heroCard.left,
        right: heroCard.right,
        width: heroCard.width
      },
      authCard: {
        top: authCard.top,
        bottom: authCard.bottom,
        height: authCard.height,
        left: authCard.left,
        right: authCard.right,
        width: authCard.width
      },
      heroCenterY,
      authCenterY,
      centerDiff: Math.abs(heroCenterY - authCenterY),
      hasVScroll,
      hasHScroll,
      docScrollHeight: doc.scrollHeight,
      windowInnerHeight: window.innerHeight
    };
  });

  console.log("=== HARNESS MEASUREMENTS (1918x967) ===");
  console.log(JSON.stringify(m, null, 2));

  await page.screenshot({ path: "tests/screenshots/harness_after_1918x967.png" });

  // Measure 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);

  const mobileM = await page.evaluate(() => {
    const heroCard = document.querySelector(".hero-card").getBoundingClientRect();
    const authCard = document.querySelector(".auth-card-shell").getBoundingClientRect();
    return {
      heroCard: {
        top: heroCard.top,
        bottom: heroCard.bottom,
        height: heroCard.height
      },
      authCard: {
        top: authCard.top,
        bottom: authCard.bottom,
        height: authCard.height
      },
      isAuthCardTopVisible: authCard.top < window.innerHeight,
      authCardTopOffsetFromBottom: window.innerHeight - authCard.top
    };
  });

  console.log("=== HARNESS MOBILE MEASUREMENTS (390x844) ===");
  console.log(JSON.stringify(mobileM, null, 2));

  await page.screenshot({ path: "tests/screenshots/harness_after_390x844.png" });

  await browser.close();
  server.close();
}

measureHarness().catch(console.error);
