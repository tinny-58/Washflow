import { chromium } from "playwright";

async function testZoom() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 959, height: 484 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("console", msg => console.log("PAGE:", msg.text()));
  page.on("pageerror", err => console.log("ERROR:", err.message));
  
  await page.goto("http://localhost:3000/?view=login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const el = await page.evaluate(() => {
    const card = document.querySelector(".auth-card-shell");
    if (!card) return { found: false, html: document.body.innerHTML.slice(0, 500) };
    const r = card.getBoundingClientRect();
    return {
      found: true,
      rect: { width: r.width, height: r.height, top: r.top, left: r.left },
      visible: r.width > 0 && r.height > 0
    };
  });

  console.log("Zoom test result:", el);
  await browser.close();
}

testZoom().catch(console.error);
