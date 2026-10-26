import { chromium } from "playwright";

async function measureLive() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on("console", msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  const failedRequests = [];
  page.on("requestfailed", req => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  await page.goto("http://localhost:3000/?view=login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".auth-card-shell", { timeout: 15000 });
  await page.waitForTimeout(500);

  const measurements = await page.evaluate(() => {
    const navbar = document.querySelector("header");
    const navRect = navbar ? navbar.getBoundingClientRect() : null;

    const authCard = document.querySelector(".auth-card-shell");
    const authRect = authCard ? authCard.getBoundingClientRect() : null;

    const heroCard = document.querySelector(".hero-card");
    const heroRect = heroCard ? heroCard.getBoundingClientRect() : null;

    const heroCenterY = heroRect ? heroRect.top + heroRect.height / 2 : null;
    const authCenterY = authRect ? authRect.top + authRect.height / 2 : null;
    const centerDiff = (heroCenterY !== null && authCenterY !== null) ? Math.abs(heroCenterY - authCenterY) : null;

    const doc = document.documentElement;
    const hasVScroll = doc.scrollHeight > window.innerHeight + 1;
    const hasHScroll = doc.scrollWidth > window.innerWidth + 1;

    // Check next/image inside heroCard
    const img = heroCard ? heroCard.querySelector("img") : null;
    const imgInfo = img ? {
      src: img.src,
      currentSrc: img.currentSrc,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      loading: img.loading,
      alt: img.alt,
      computedObjectFit: window.getComputedStyle(img).objectFit,
      computedObjectPosition: window.getComputedStyle(img).objectPosition,
    } : null;

    // Check headline and subline
    const h2 = heroCard ? heroCard.querySelector("h2") : null;
    const p = heroCard ? heroCard.querySelector("p") : null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      navRect: navRect ? {
        top: navRect.top,
        bottom: navRect.bottom,
        height: navRect.height,
        left: navRect.left,
        right: navRect.right,
        width: navRect.width
      } : null,
      heroRect: heroRect ? {
        top: heroRect.top,
        bottom: heroRect.bottom,
        height: heroRect.height,
        left: heroRect.left,
        right: heroRect.right,
        width: heroRect.width
      } : null,
      authRect: authRect ? {
        top: authRect.top,
        bottom: authRect.bottom,
        height: authRect.height,
        left: authRect.left,
        right: authRect.right,
        width: authRect.width
      } : null,
      heroCenterY,
      authCenterY,
      centerDiff,
      hasVScroll,
      hasHScroll,
      docScrollHeight: doc.scrollHeight,
      windowInnerHeight: window.innerHeight,
      imgInfo,
      headlineText: h2?.textContent,
      sublineText: p?.textContent,
    };
  });

  console.log("=== LIVE MEASUREMENTS ===");
  console.log(JSON.stringify(measurements, null, 2));

  console.log("=== CONSOLE LOGS ===");
  console.log(JSON.stringify(consoleLogs.filter(l => l.type === "error"), null, 2));

  console.log("=== FAILED REQUESTS ===");
  console.log(JSON.stringify(failedRequests, null, 2));

  await page.screenshot({ path: "tests/screenshots/task2_after_1918x967.png" });

  // Mobile screenshot at 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);

  const mobileMeasurements = await page.evaluate(() => {
    const heroCard = document.querySelector(".hero-card");
    const heroRect = heroCard ? heroCard.getBoundingClientRect() : null;

    const authCard = document.querySelector(".auth-card-shell");
    const authRect = authCard ? authCard.getBoundingClientRect() : null;

    const doc = document.documentElement;

    return {
      heroRect: heroRect ? {
        top: heroRect.top,
        bottom: heroRect.bottom,
        height: heroRect.height,
      } : null,
      authRect: authRect ? {
        top: authRect.top,
        bottom: authRect.bottom,
        height: authRect.height,
      } : null,
      isAuthCardTopVisible: authRect ? authRect.top < window.innerHeight : false,
      hasHScroll: doc.scrollWidth > window.innerWidth + 1
    };
  });

  console.log("=== MOBILE MEASUREMENTS (390x844) ===");
  console.log(JSON.stringify(mobileMeasurements, null, 2));

  await page.screenshot({ path: "tests/screenshots/task2_after_390x844.png" });

  await browser.close();
}

measureLive().catch(console.error);
