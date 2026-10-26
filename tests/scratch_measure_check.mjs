import { chromium } from "playwright";

async function measureAndCheck() {
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

  const responses = [];
  page.on("request", req => {
    // console.log(`[REQ] ${req.method()} ${req.url()}`);
  });
  page.on("response", res => {
    if (res.status() === 404) {
      console.log(`[404 NOT FOUND] ${res.url()}`);
    }
  });

  await page.goto("http://localhost:3000/?view=login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".auth-card-shell", { timeout: 15000 });

  const measurements = await page.evaluate(() => {
    const navbar = document.querySelector("header");
    const navRect = navbar ? navbar.getBoundingClientRect() : null;

    // Login card (.auth-card-shell or form container)
    const authCard = document.querySelector(".auth-card-shell");
    const authRect = authCard ? authCard.getBoundingClientRect() : null;

    // Left card
    // Look at the container or LandingCarousel
    const leftCardContainer = authCard ? authCard.parentElement?.previousElementSibling : null;
    const leftCardChild = leftCardContainer ? leftCardContainer.firstElementChild : null;
    const leftCard = leftCardChild || leftCardContainer;
    const leftRect = leftCard ? leftCard.getBoundingClientRect() : null;

    // Check images inside left card
    const images = Array.from(document.querySelectorAll("img, video")).map(el => ({
      tagName: el.tagName,
      src: el.src,
      currentSrc: el.currentSrc,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      complete: el.complete,
      computedStyleDisplay: window.getComputedStyle(el).display,
      computedStyleVisibility: window.getComputedStyle(el).visibility,
      computedStyleOpacity: window.getComputedStyle(el).opacity,
      rect: el.getBoundingClientRect(),
      className: el.className,
      parentElementClass: el.parentElement?.className
    }));

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
      leftRect: leftRect ? {
        top: leftRect.top,
        bottom: leftRect.bottom,
        height: leftRect.height,
        left: leftRect.left,
        right: leftRect.right,
        width: leftRect.width
      } : null,
      authRect: authRect ? {
        top: authRect.top,
        bottom: authRect.bottom,
        height: authRect.height,
        left: authRect.left,
        right: authRect.right,
        width: authRect.width
      } : null,
      leftCardHtml: leftCard ? leftCard.outerHTML.slice(0, 500) : null,
      images
    };
  });

  console.log("=== MEASUREMENTS ===");
  console.log(JSON.stringify(measurements, null, 2));

  console.log("=== CONSOLE LOGS ===");
  console.log(JSON.stringify(consoleLogs, null, 2));

  console.log("=== FAILED REQUESTS ===");
  console.log(JSON.stringify(failedRequests, null, 2));

  console.log("=== ERROR RESPONSES ===");
  console.log(JSON.stringify(responses, null, 2));

  await page.screenshot({ path: "tests/screenshots/task1_current_1918x967.png" });
  await browser.close();
}

measureAndCheck().catch(console.error);
