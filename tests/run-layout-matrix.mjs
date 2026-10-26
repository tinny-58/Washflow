import http from "http";
import fs from "fs";
import path from "path";
import { chromium, firefox, webkit } from "playwright";

const PORT = 3333;
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  { name: "1918x967 (Spec Screen)", width: 1918, height: 967, dpr: 1 },
  { name: "1920x1080 (FHD Desktop)", width: 1920, height: 1080, dpr: 1 },
  { name: "1536x864 (Laptop)", width: 1536, height: 864, dpr: 1 },
  { name: "1440x900 (MacBook)", width: 1440, height: 900, dpr: 1 },
  { name: "1366x768 (Standard HD)", width: 1366, height: 768, dpr: 1 },
  { name: "1024x768 (Tablet Landscape)", width: 1024, height: 768, dpr: 1 },
  { name: "768x1024 (Tablet Portrait)", width: 768, height: 1024, dpr: 1 },
  { name: "390x844 (Mobile Portrait)", width: 390, height: 844, dpr: 1 },
  { name: "360x640 (Narrow Mobile)", width: 360, height: 640, dpr: 1 },
  { name: "844x390 (Mobile Landscape)", width: 844, height: 390, dpr: 1 },
  { name: "1918x967 @ 200% Zoom", width: 959, height: 484, dpr: 2 },
];

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

function startHarnessServer(port = PORT) {
  const server = http.createServer((req, res) => {
    const filePath = path.resolve("tests/harness/index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading test harness: " + err.message);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`[Harness] Isolated test server listening on ${BASE_URL}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}

async function getAvailableBrowsers() {
  const browserList = [];

  // Try Chromium (system Chrome channel first, fallback to standard)
  try {
    const ch = await chromium.launch({ channel: "chrome" });
    browserList.push({ name: "Chromium (Chrome)", launcher: () => chromium.launch({ channel: "chrome" }) });
    await ch.close();
  } catch (e) {
    try {
      const b = await chromium.launch();
      browserList.push({ name: "Chromium", launcher: () => chromium.launch() });
      await b.close();
    } catch (e2) {
      console.warn("Chromium not available:", e2.message.split("\n")[0]);
    }
  }

  // Try Firefox
  try {
    const ff = await firefox.launch();
    browserList.push({ name: "Firefox", launcher: () => firefox.launch() });
    await ff.close();
  } catch (e) {
    console.warn("Firefox not available locally:", e.message.split("\n")[0]);
  }

  // Try WebKit
  try {
    const wk = await webkit.launch();
    browserList.push({ name: "WebKit", launcher: () => webkit.launch() });
    await wk.close();
  } catch (e) {
    console.warn("WebKit not available locally:", e.message.split("\n")[0]);
  }

  return browserList;
}

async function runMatrix() {
  console.log("==================================================================");
  console.log("   WASHFLOW AUTH CARD LAYOUT & STABILITY VERIFICATION MATRIX      ");
  console.log("==================================================================");

  const server = await startHarnessServer(PORT);
  const screenshotDir = path.resolve("tests/screenshots");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const availableBrowsers = await getAvailableBrowsers();
  console.log(`Available browser engines: ${availableBrowsers.map((b) => b.name).join(", ")}\n`);

  if (availableBrowsers.length === 0) {
    console.error("No browser engine available to run layout matrix!");
    server.close();
    process.exit(1);
  }

  const allBrowserResults = [];
  let totalErrors = 0;
  let dynamicClsPassed = true;

  for (const bInfo of availableBrowsers) {
    console.log(`\n>>> EXECUTING MATRIX ON ENGINE: ${bInfo.name} <<<`);
    const browser = await bInfo.launcher();
    const browserResults = { browser: bInfo.name, viewports: [] };

    for (const vp of VIEWPORTS) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height}, dpr: ${vp.dpr})`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
      });
      const page = await context.newPage();

      let referenceTop = null;
      let referenceWidth = null;
      let referenceHeight = null;
      let referenceHeaderTop = null;
      const vpResults = [];

      for (const v of VIEWS) {
        await page.goto(`${BASE_URL}/?view=${v}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForSelector(".auth-card-shell", { timeout: 10000 });
        await page.waitForTimeout(50);

        const data = await page.evaluate(() => {
          const card = document.querySelector(".auth-card-shell");
          const r = card.getBoundingClientRect();
          const cs = window.getComputedStyle(card);
          const header = document.getElementById("card-header");
          const hr = header ? header.getBoundingClientRect() : null;

          // Check internal scrollbar
          const hasInternalScroll = card.scrollHeight > card.clientHeight + 1;

          // Check page horizontal scroll
          const hasPageHScroll =
            document.documentElement.scrollWidth > window.innerWidth + 1;

          // Form inputs
          const formInputs = Array.from(
            card.querySelectorAll("input[type=text], input[type=password], input[type=tel]")
          ).map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              height: rect.height,
              width: rect.width,
              isOtp: el.getAttribute("maxlength") === "1",
            };
          });

          // Action buttons: submit buttons and main CTA buttons
          const actionButtons = Array.from(
            card.querySelectorAll("button[type=submit], button:not([aria-label]):not([onclick*='switchView'])")
          ).map((el) => {
            const rect = el.getBoundingClientRect();
            return { height: rect.height, width: rect.width };
          });

          // OTP boxes
          const otpBoxes = formInputs.filter((el) => el.isOtp);
          const otpFit =
            otpBoxes.length === 0 ||
            (otpBoxes.length === 6 &&
              otpBoxes[5].width >= 36 &&
              otpBoxes[0].height >= 43.5);

          // Check touch targets (min 44px with 0.5px subpixel tolerance)
          const standardInputsMet = formInputs.every((el) => el.height >= 43.5);
          const actionButtonsMet = actionButtons.every((el) => el.height >= 43.5);
          const minTouchMet = standardInputsMet && actionButtonsMet && otpFit;

          return {
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            top: Math.round(r.top * 10) / 10,
            left: Math.round(r.left * 10) / 10,
            headerTop: hr ? Math.round(hr.top * 10) / 10 : null,
            hasInternalScroll,
            hasPageHScroll,
            minTouchMet,
            otpFit,
            cardComputedHeight: cs.height,
            cardComputedWidth: cs.width,
          };
        });

        if (referenceTop === null) referenceTop = data.top;
        if (referenceWidth === null) referenceWidth = data.width;
        if (referenceHeight === null) referenceHeight = data.height;
        if (referenceHeaderTop === null) referenceHeaderTop = data.headerTop;

        const deltaTop = Math.abs(data.top - referenceTop);
        const deltaWidth = Math.abs(data.width - referenceWidth);
        const deltaHeight = Math.abs(data.height - referenceHeight);
        const deltaHeaderTop = Math.abs((data.headerTop ?? referenceHeaderTop) - referenceHeaderTop);

        const isStable =
          deltaTop <= 1.0 && deltaWidth <= 1.0 && deltaHeight <= 1.0 && deltaHeaderTop <= 1.0;
        
        // Assert no internal scrollbar at 1366x768 and above
        const noInternalScroll =
          vp.width < 1000 || !data.hasInternalScroll;
        const noHScroll = !data.hasPageHScroll;

        const passed = isStable && noInternalScroll && noHScroll && data.minTouchMet && data.otpFit;

        if (!passed) {
          totalErrors++;
          console.error(
            `[FAIL] ${bInfo.name} | ${vp.name} | View: ${v} | ΔTop:${deltaTop} ΔW:${deltaWidth} ΔH:${deltaHeight} Scroll:${data.hasInternalScroll} Touch:${data.minTouchMet} OTP:${data.otpFit}`
          );
        }

        // Save screenshot for 1918x967 spec screen on primary browser
        if (vp.width === 1918 && vp.height === 967 && bInfo.name.includes("Chromium")) {
          await page.screenshot({
            path: path.join(screenshotDir, `spec_${v}.png`),
          });
        }

        vpResults.push({
          view: v,
          width: data.width,
          height: data.height,
          top: data.top,
          headerTop: data.headerTop,
          deltaTop,
          deltaWidth,
          deltaHeight,
          deltaHeaderTop,
          noInternalScroll,
          noHScroll,
          minTouchMet: data.minTouchMet,
          otpFit: data.otpFit,
          passed,
        });
      }

      browserResults.viewports.push({ viewport: vp.name, results: vpResults });

      console.table(
        vpResults.map((r) => ({
          view: r.view,
          width: r.width,
          height: r.height,
          top: r.top,
          "ΔTop": r.deltaTop,
          "ΔW": r.deltaWidth,
          "ΔH": r.deltaHeight,
          "NoScroll": r.noInternalScroll,
          "Touch>=44px": r.minTouchMet,
          PASS: r.passed ? "✓ PASS" : "✗ FAIL",
        }))
      );

      await context.close();
    }

    // Dynamic State & CLS Test on Spec Screen
    console.log(`\n[Dynamic State Test on ${bInfo.name}] Testing Reserved Message Slot & CLS 0 on 1918x967...`);
    const dynContext = await browser.newContext({
      viewport: { width: 1918, height: 967 },
    });
    const dynPage = await dynContext.newPage();
    await dynPage.goto(`${BASE_URL}/?view=login`, { waitUntil: "domcontentloaded" });
    await dynPage.waitForSelector(".auth-card-shell");

    // 1. Initial coordinates
    const initial = await dynPage.evaluate(() => {
      const card = document.querySelector(".auth-card-shell");
      const r = card.getBoundingClientRect();
      const btn = card.querySelector("button[type=submit]");
      const br = btn.getBoundingClientRect();
      return { card: { width: r.width, height: r.height, top: r.top }, btnTop: br.top };
    });

    // 2. Trigger validation error
    await dynPage.click("button[type=submit]");
    await dynPage.waitForTimeout(100);

    const withError = await dynPage.evaluate(() => {
      const card = document.querySelector(".auth-card-shell");
      const r = card.getBoundingClientRect();
      const btn = card.querySelector("button[type=submit]");
      const br = btn.getBoundingClientRect();
      return { card: { width: r.width, height: r.height, top: r.top }, btnTop: br.top };
    });

    // 3. Trigger OTP countdown
    await dynPage.goto(`${BASE_URL}/?view=signup-otp&countdown=58`, { waitUntil: "domcontentloaded" });
    await dynPage.waitForTimeout(100);

    const withCountdown = await dynPage.evaluate(() => {
      const card = document.querySelector(".auth-card-shell");
      const r = card.getBoundingClientRect();
      return { card: { width: r.width, height: r.height, top: r.top } };
    });

    const shiftCardTop = Math.abs(withError.card.top - initial.card.top);
    const shiftCardHeight = Math.abs(withError.card.height - initial.card.height);
    const shiftBtnTop = Math.abs(withError.btnTop - initial.btnTop);
    const shiftCountdownTop = Math.abs(withCountdown.card.top - initial.card.top);
    const shiftCountdownHeight = Math.abs(withCountdown.card.height - initial.card.height);

    console.log(`  Initial Card:       Top ${initial.card.top}px, Height ${initial.card.height}px, BtnTop ${initial.btnTop}px`);
    console.log(`  With Error Message: Top ${withError.card.top}px, Height ${withError.card.height}px, BtnTop ${withError.btnTop}px`);
    console.log(`  With Countdown:     Top ${withCountdown.card.top}px, Height ${withCountdown.card.height}px`);
    console.log(`  Layout Shift (CLS): CardTop Δ=${shiftCardTop}px, Height Δ=${shiftCardHeight}px, BtnTop Δ=${shiftBtnTop}px, Countdown Δ=${shiftCountdownTop}px`);

    const clsOk =
      shiftCardTop === 0 &&
      shiftCardHeight === 0 &&
      shiftBtnTop === 0 &&
      shiftCountdownTop === 0 &&
      shiftCountdownHeight === 0;

    if (!clsOk) {
      dynamicClsPassed = false;
      totalErrors++;
      console.error(`  [FAIL] Dynamic message slot caused layout shift!`);
    } else {
      console.log(`  ✓ PERFECT ZERO LAYOUT SHIFT (CLS = 0.000) VERIFIED!`);
    }

    if (bInfo.name.includes("Chromium")) {
      await dynPage.screenshot({ path: path.join(screenshotDir, "spec_login_with_error.png") });
    }

    await dynContext.close();
    await browser.close();
    allBrowserResults.push(browserResults);
  }

  server.close();

  // Save JSON report
  fs.writeFileSync(
    path.resolve("tests/matrix-results.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), allBrowserResults, totalErrors, dynamicClsPassed }, null, 2)
  );

  console.log("\n==================================================================");
  console.log("                        FINAL SUMMARY                             ");
  console.log("==================================================================");
  console.log(`Browser Engines Tested: ${availableBrowsers.length}`);
  console.log(`Viewports Tested per Engine: ${VIEWPORTS.length}`);
  console.log(`Views per Viewport: ${VIEWS.length}`);
  console.log(`Total Combinations Evaluated: ${availableBrowsers.length * VIEWPORTS.length * VIEWS.length}`);
  console.log(`Total Layout Failures: ${totalErrors}`);
  console.log(`Zero Layout Shift (CLS 0): ${dynamicClsPassed ? "PASSED (0.000)" : "FAILED"}`);

  if (totalErrors === 0 && dynamicClsPassed) {
    console.log("\n✓ ALL ASSERTIONS PASSED! CARD SIZE AND STABILITY 100% LOCKED.");
    process.exit(0);
  } else {
    console.error("\n✗ ASSERTIONS FAILED. Total errors: " + totalErrors);
    process.exit(1);
  }
}

runMatrix().catch((err) => {
  console.error("FATAL ERROR IN MATRIX RUNNER:", err);
  process.exit(1);
});
