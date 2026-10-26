import { chromium } from "playwright";

async function testViews() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  const views = [
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
    "reset-success"
  ];

  const results = [];

  for (const v of views) {
    await page.goto(`http://localhost:3000/?view=${v}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForSelector(".auth-card-shell", { timeout: 15000 });
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
      const card = document.querySelector(".auth-card-shell");
      const r = card.getBoundingClientRect();
      const s = window.getComputedStyle(card);
      
      // Check if internal scrollbar exists
      const hasInternalScroll = card.scrollHeight > card.clientHeight;

      // Check header row position
      const header = card.firstElementChild;
      const hr = header ? header.getBoundingClientRect() : null;

      // Check page horizontal scroll
      const hasPageHScroll = document.documentElement.scrollWidth > window.innerWidth;

      return {
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        left: Math.round(r.left * 100) / 100,
        hasInternalScroll,
        hasPageHScroll,
        headerTop: hr ? Math.round(hr.top * 100) / 100 : null,
        headerHeight: hr ? Math.round(hr.height * 100) / 100 : null
      };
    });

    results.push({ view: v, ...m });
    await page.screenshot({ path: `tests/spec_${v}.png` });
  }

  console.log("VIEW STABILITY TEST AT 1918x967:");
  console.table(results);

  await browser.close();
}

testViews().catch(console.error);
