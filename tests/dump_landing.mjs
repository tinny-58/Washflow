import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1918, height: 967 }
  });
  const page = await context.newPage();
  
  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  console.log("HTML length:", html.length);
  console.log("HTML snippet:", html.slice(0, 1500));
  
  await page.screenshot({ path: "tests/landing_page_dump.png" });
  console.log("Screenshot saved to tests/landing_page_dump.png");
  
  await browser.close();
}

run().catch(console.error);
